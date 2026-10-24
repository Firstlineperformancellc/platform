import type Stripe from "stripe";
import { stripe } from "./stripe.js";
import { admin } from "./supabase.js";
import { getSettings, invalidateSettings, presentsRules, type Settings } from "./settings.js";
import { alreadySent, appUrl, notify } from "./notify.js";

// Money movement that touches Stripe: refunds, transfers to mentors, and the automatic payout run.
// Every call carries an idempotency key, so a retry (ours or Stripe's) can never pay or refund twice.

const short = (e: unknown) => String((e as Error)?.message ?? e).replace(/\s+/g, " ").slice(0, 300);
async function admins() {
  const { data } = await admin.from("profiles").select("id").eq("role", "admin");
  return (data ?? []).map((a) => a.id as string);
}

// Refund all or part of a payment. `key` must be unique to the business event (not to the attempt).
export async function refundPayment(paymentIntentId: string, amountCents: number | undefined, key: string): Promise<{ ok: true; refundId: string; amount: number } | { ok: false; error: string }> {
  if (!stripe) return { ok: false, error: "Stripe is not configured" };
  try {
    const r = await stripe.refunds.create({ payment_intent: paymentIntentId, ...(amountCents ? { amount: amountCents } : {}) }, { idempotencyKey: `refund_${key}` });
    return { ok: true, refundId: r.id, amount: r.amount };
  } catch (e) {
    return { ok: false, error: short(e) };
  }
}

// The payment that funded a payout: the order behind a breakdown job, or the session (or its pack).
async function paymentIntentForPayout(p: { job_id: string | null; session_id: string | null; presents_request_id?: string | null }): Promise<string | null> {
  if (p.presents_request_id) {
    const { data: r } = await admin.from("presents_requests").select("stripe_payment_intent_id").eq("id", p.presents_request_id).maybeSingle();
    return r?.stripe_payment_intent_id ?? null;
  }
  if (p.job_id) {
    const { data: job } = await admin.from("jobs").select("order_id").eq("id", p.job_id).maybeSingle();
    if (!job) return null;
    const { data: order } = await admin.from("orders").select("stripe_payment_intent_id").eq("id", job.order_id).maybeSingle();
    return order?.stripe_payment_intent_id ?? null;
  }
  if (p.session_id) {
    const { data: sess } = await admin.from("sessions").select("stripe_payment_intent_id, pack_id").eq("id", p.session_id).maybeSingle();
    if (sess?.stripe_payment_intent_id) return sess.stripe_payment_intent_id;
    if (sess?.pack_id) {
      const { data: pack } = await admin.from("session_packs").select("stripe_payment_intent_id").eq("id", sess.pack_id).maybeSingle();
      return pack?.stripe_payment_intent_id ?? null;
    }
  }
  return null;
}

// Send one owed payout to the mentor's connected account. The transfer is tied to the charge that
// funded it (source_transaction), so it works before those funds settle and can never exceed them.
export async function payPayoutViaStripe(payoutId: string, paidBy: string | null): Promise<{ ok: true; transferId: string } | { ok: false; error: string; skip?: boolean }> {
  if (!stripe) return { ok: false, error: "Stripe is not configured" };
  const { data: p } = await admin.from("payouts").select("id, status, amount_cents, currency, athlete_id, job_id, session_id, presents_request_id, athletes(stripe_account_id, payouts_enabled, display_name)").eq("id", payoutId).maybeSingle();
  const payout = p as unknown as { id: string; status: string; amount_cents: number; currency: string; athlete_id: string; job_id: string | null; session_id: string | null; presents_request_id: string | null; athletes: { stripe_account_id: string | null; payouts_enabled: boolean; display_name: string } | null } | null;
  if (!payout) return { ok: false, error: "payout not found" };
  if (payout.status !== "owed") return { ok: false, error: `payout is ${payout.status}` };
  const fail = async (error: string, skip = false) => {
    await admin.from("payouts").update({ error, attempted_at: new Date().toISOString() }).eq("id", payoutId);
    return { ok: false as const, error, skip };
  };
  if (!payout.athletes?.stripe_account_id || !payout.athletes.payouts_enabled) return fail("mentor has not finished Stripe onboarding", true);
  const pi = await paymentIntentForPayout(payout);
  if (!pi) return fail("this was not charged through Stripe (free preview or manual), so there are no funds to transfer; pay it outside Stripe and mark it paid", true);
  try {
    const intent = await stripe.paymentIntents.retrieve(pi);
    const charge = typeof intent.latest_charge === "string" ? intent.latest_charge : intent.latest_charge?.id;
    if (!charge) return fail("the payment has no completed charge yet");
    const params: Stripe.TransferCreateParams = {
      amount: payout.amount_cents, currency: payout.currency, destination: payout.athletes.stripe_account_id,
      source_transaction: charge, transfer_group: intent.transfer_group ?? undefined, metadata: { payoutId },
    };
    const t = await stripe.transfers.create(params, { idempotencyKey: `payout_${payoutId}` });
    await admin.from("payouts").update({ status: "paid", paid_at: new Date().toISOString(), paid_by: paidBy, stripe_transfer_id: t.id, error: null, attempted_at: new Date().toISOString(), note: paidBy ? "" : "paid automatically" }).eq("id", payoutId);
    return { ok: true, transferId: t.id };
  } catch (e) {
    return fail(short(e));
  }
}

// --- Releasing payouts: Manual (admin presses Pay), Automatic (each one after the waiting period),
// or Scheduled (a batch every other payday, 9:00 Eastern; Alex: Fridays). ----------------------------
export type PayoutRules = { mode: "manual" | "auto" | "scheduled"; delayDays: number; anchor: string; hour: number; lastRunAt: string | null };
export function payoutRules(s: Settings): PayoutRules {
  const r = s.rules as Record<string, unknown>;
  const mode = r.payout_mode === "auto" || r.payout_mode === "scheduled" ? r.payout_mode : "manual";
  return {
    mode,
    delayDays: Number(r.payout_delay_days ?? r.qca_window_days ?? 7),
    anchor: typeof r.payout_anchor === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.payout_anchor) ? r.payout_anchor : "2026-10-30", // a Friday
    hour: typeof r.payout_hour === "number" && r.payout_hour >= 0 && r.payout_hour <= 23 ? r.payout_hour : 9,
    lastRunAt: typeof r.payout_last_run_at === "string" ? r.payout_last_run_at : null,
  };
}

// A clock time in New York on a calendar day, as an instant. Daylight saving is handled by asking Intl
// what hour the first guess shows in New York and shifting by the difference.
export function etInstant(dateStr: string, hour: number): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  let guess = new Date(Date.UTC(y, m - 1, d, hour + 5, 0, 0));
  const shown = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hour12: false }).format(guess)) % 24;
  const diff = shown - hour;
  if (diff !== 0) guess = new Date(guess.getTime() - diff * 3600000);
  return guess;
}
const etDate = (d: Date) => {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  return parts; // YYYY-MM-DD
};
// The run that is due now (the latest payday at or before now) and the one after it, every 14 days from the anchor.
export function scheduledRuns(rules: PayoutRules, now = new Date()): { due: Date | null; next: Date } {
  const anchor = etInstant(rules.anchor, rules.hour);
  const step = 14 * 86400000;
  if (now < anchor) return { due: null, next: anchor };
  const k = Math.floor((now.getTime() - anchor.getTime()) / step);
  const at = (i: number) => etInstant(etDate(new Date(anchor.getTime() + i * step)), rules.hour); // re-pin to 9:00 ET across DST
  // k lands within an hour of the right payday; look one either side so a DST shift or payday morning cannot fool it
  const candidates = [at(k - 1), at(k), at(k + 1), at(k + 2)];
  const due = candidates.filter((d) => d <= now).pop() ?? null;
  const next = candidates.find((d) => d > now) ?? at(k + 3);
  return { due, next };
}

// Send every owed payout that is past the waiting period (and, for Presents, past the buyer's problem window).
// Held payouts are never touched. `trigger` says who asked: the automatic tick, the schedule, or an admin.
export async function releaseOwedPayouts(trigger: "auto" | "scheduled" | "manual", actorId: string | null) {
  const s = await getSettings();
  const pr = payoutRules(s);
  const before = new Date(Date.now() - pr.delayDays * 86400000).toISOString();
  const retryAfter = new Date(Date.now() - 6 * 3600000).toISOString();
  // Payouts tried in the last six hours are left out of the query itself, so a backlog that cannot be paid
  // (a mentor who has not onboarded, a free-preview sale) never crowds out the ones that can.
  const { data: due } = await admin.from("payouts").select("id, presents_request_id, created_at").eq("status", "owed").lt("created_at", before)
    .or(`attempted_at.is.null,attempted_at.lt.${retryAfter}`).order("created_at").limit(trigger === "auto" ? 25 : 200);
  const problemWindow = presentsRules(s).problemDays * 86400000;
  let paid = 0, failed = 0, skipped = 0;
  const failures: string[] = [];
  for (const p of due ?? []) {
    // a Presents payout also waits out the buyer's problem window, whichever is longer
    if (p.presents_request_id && Date.now() - new Date(p.created_at).getTime() < problemWindow) { skipped++; continue; }
    const res = await payPayoutViaStripe(p.id, actorId);
    if (res.ok) { paid++; continue; }
    if (res.skip) { skipped++; continue; } // waiting on the mentor's onboarding, or nothing to transfer: visible on the ledger, no alarm
    failed++;
    failures.push(res.error);
    if (trigger === "auto") {
      for (const a of await admins()) {
        if (await alreadySent(a, "payout.failed", p.id)) continue;
        await notify(a, "payout.failed", "A mentor payout did not go through", `<p>${res.error}</p><p><a href="${appUrl("/admin/ledger")}" style="color:#d4a32c">Open the ledger</a></p>`, { targetId: p.id });
      }
    }
  }
  return { paid, failed, skipped, failures };
}

// Automatic mode: called by the tick every few minutes.
export async function autoPayoutsTick() {
  const pr = payoutRules(await getSettings());
  if (pr.mode !== "auto" || !stripe) return { mode: pr.mode, paid: 0, failed: 0 };
  const r = await releaseOwedPayouts("auto", null);
  return { mode: "auto", paid: r.paid, failed: r.failed };
}

// One batch run, recorded and summarised to the admins. Used by the schedule and by "Run payouts now".
export async function runPayoutBatch(trigger: "scheduled" | "manual", actorId: string | null) {
  const r = await releaseOwedPayouts(trigger, actorId);
  const { data: cur } = await admin.from("settings").select("rules").eq("id", 1).single();
  await admin.from("settings").update({ rules: { ...((cur?.rules as Record<string, unknown>) ?? {}), payout_last_run_at: new Date().toISOString() } }).eq("id", 1);
  invalidateSettings();
  await admin.from("audit_log").insert({ actor_id: actorId, action: "payouts.run", target_type: "settings", target_id: null, meta: { trigger, ...r } });
  const summary = `${r.paid} sent${r.failed ? `, ${r.failed} failed` : ""}${r.skipped ? `, ${r.skipped} waiting` : ""}`;
  await notifyAdmins("payouts.run", `Mentor payout run: ${summary}`,
    `<p>${trigger === "scheduled" ? "The scheduled payout run" : "A payout run started from the ledger"} finished: ${summary}.</p>${r.failures.length ? `<p>Failures: ${r.failures.map((f) => f.replace(/</g, "&lt;")).join("; ")}</p>` : ""}<p><a href="${appUrl("/admin/ledger")}" style="color:#d4a32c">Open the ledger</a></p>`, `run_${Date.now()}`);
  return r;
}

// Scheduled mode: the tick runs the batch once per payday, the first tick after 9:00 Eastern.
export async function scheduledPayoutsTick() {
  const pr = payoutRules(await getSettings());
  if (pr.mode !== "scheduled" || !stripe) return { mode: pr.mode, ran: false as const };
  const { due, next } = scheduledRuns(pr);
  if (!due || (pr.lastRunAt && new Date(pr.lastRunAt) >= due)) return { mode: "scheduled", ran: false as const, nextRunAt: next.toISOString() };
  const r = await runPayoutBatch("scheduled", null);
  return { mode: "scheduled", ran: true as const, ...r, nextRunAt: next.toISOString() };
}

// A session a parent started to book but never paid for holds its slot; let go of it.
export async function releaseUnpaidSessions() {
  const cutoff = new Date(Date.now() - 45 * 60000).toISOString();
  const { data } = await admin.from("sessions").update({ status: "expired", cancel_reason: "checkout was not completed", cancelled_at: new Date().toISOString() })
    .eq("status", "requested").is("paid_at", null).is("pack_id", null).not("stripe_checkout_session_id", "is", null).lt("created_at", cutoff).select("id");
  return (data ?? []).length;
}

export async function notifyAdmins(template: string, subject: string, html: string, targetId: string) {
  for (const a of await admins()) await notify(a, template, subject, html, { targetId });
}
