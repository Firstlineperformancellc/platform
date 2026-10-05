import type Stripe from "stripe";
import { stripe } from "./stripe.js";
import { admin } from "./supabase.js";
import { getSettings } from "./settings.js";
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
async function paymentIntentForPayout(p: { job_id: string | null; session_id: string | null }): Promise<string | null> {
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
  const { data: p } = await admin.from("payouts").select("id, status, amount_cents, currency, athlete_id, job_id, session_id, athletes(stripe_account_id, payouts_enabled, display_name)").eq("id", payoutId).maybeSingle();
  const payout = p as unknown as { id: string; status: string; amount_cents: number; currency: string; athlete_id: string; job_id: string | null; session_id: string | null; athletes: { stripe_account_id: string | null; payouts_enabled: boolean; display_name: string } | null } | null;
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

// Called by the tick. When the admin has switched payouts to automatic, release each owed payout
// once it is past the waiting period. Held and voided payouts are never touched.
export async function autoPayoutsTick() {
  const s = await getSettings();
  const r = s.rules as Record<string, unknown>;
  if (r.payout_mode !== "auto" || !stripe) return { mode: (r.payout_mode as string) ?? "manual", paid: 0, failed: 0 };
  const days = Number(r.payout_delay_days ?? r.qca_window_days ?? 7);
  const before = new Date(Date.now() - days * 86400000).toISOString();
  const retryAfter = new Date(Date.now() - 6 * 3600000).toISOString();
  // Payouts tried in the last six hours are left out of the query itself, so a backlog that cannot be paid
  // (a mentor who has not onboarded, a free-preview sale) never crowds out the ones that can.
  const { data: due } = await admin.from("payouts").select("id").eq("status", "owed").lt("created_at", before)
    .or(`attempted_at.is.null,attempted_at.lt.${retryAfter}`).order("created_at").limit(25);
  let paid = 0, failed = 0;
  for (const p of due ?? []) {
    const res = await payPayoutViaStripe(p.id, null);
    if (res.ok) { paid++; continue; }
    failed++;
    if (res.skip) continue; // waiting on the mentor's onboarding, or nothing to transfer: visible on the ledger, no alarm
    for (const a of await admins()) {
      if (await alreadySent(a, "payout.failed", p.id)) continue;
      await notify(a, "payout.failed", "A mentor payout did not go through", `<p>${res.error}</p><p><a href="${appUrl("/admin/ledger")}" style="color:#d4a32c">Open the ledger</a></p>`, { targetId: p.id });
    }
  }
  return { mode: "auto", paid, failed };
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
