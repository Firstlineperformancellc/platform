import { Hono } from "hono";
import { admin, userFromBearer } from "../supabase.js";
import { getSettings, invalidateSettings, PRICE_KINDS } from "../settings.js";
import { offerJob } from "../jobs.js";
import { stripe } from "../stripe.js";
import { payoutRules, payPayoutViaStripe, refundPayment, runPayoutBatch, scheduledRuns } from "../billing.js";
import { appUrl, notify } from "../notify.js";
import { cancelAndRefund, completeSession } from "./sessions.js";
import { mentorRevenue, parseDays } from "../revenue.js";

// Alex and Bryan's control center. Every route checks the admin role first; reads mostly come
// straight from Supabase under RLS in the app, so this file is the write side: approvals,
// assignments, audits, the payout ledger, and settings.

export const adminRoutes = new Hono();

async function requireAdmin(authorization: string | undefined) {
  const user = await userFromBearer(authorization);
  if (!user) return null;
  const { data } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  return data?.role === "admin" ? user : null;
}

async function audit(actorId: string, action: string, targetType: string, targetId: string | null, meta: Record<string, unknown> = {}) {
  await admin.from("audit_log").insert({ actor_id: actorId, action, target_type: targetType, target_id: targetId, meta });
}

// --- Mentors ---------------------------------------------------------------
// PATCH /admin/mentors/:id  { status?, verified?, tier?, listed?, featured?, capacity_on_deck?, badges?, block?, remove? }
adminRoutes.patch("/mentors/:id", async (c) => {
  const me = await requireAdmin(c.req.header("authorization"));
  if (!me) return c.json({ error: "admin only" }, 403);
  const id = c.req.param("id");
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  let previousTier: string | null = null;
  let tierChanged = false;
  if (typeof body.status === "string" && ["applied", "approved", "suspended", "deactivated"].includes(body.status)) {
    patch.status = body.status;
    if (body.status === "approved") {
      patch.approved_at = new Date().toISOString();
      patch.approved_by = me.id;
    }
  }
  if (typeof body.verified === "boolean") patch.verified = body.verified;
  if (typeof body.tier === "string") {
    const levels = (await getSettings()).tiers;
    if (!levels.some((t) => t.key === body.tier && !t.archived_at)) return c.json({ error: "that level does not exist" }, 400);
    patch.tier = body.tier;
    const lvl = levels.find((t) => t.key === body.tier);
    const { data: was } = await admin.from("athletes").select("tier").eq("user_id", id).maybeSingle();
    previousTier = was?.tier ?? null;
    tierChanged = previousTier !== body.tier;
    // a mentor joining a level starts on that level's jobs-on-deck, unless this request sets one
    if (tierChanged && lvl?.capacity_default && typeof body.capacity_on_deck !== "number") patch.capacity_on_deck = lvl.capacity_default;
  }
  if (body.price_overrides !== undefined) {
    if (body.price_overrides === null || typeof body.price_overrides !== "object") return c.json({ error: "price_overrides must be an object" }, 400);
    const clean: Record<string, number> = {};
    for (const k of PRICE_KINDS) {
      const v = (body.price_overrides as Record<string, unknown>)[k];
      if (v === null || v === undefined || v === "") continue;
      if (!Number.isInteger(v) || (v as number) < 0 || (v as number) > 100_000_00) return c.json({ error: "custom prices are whole cents between 0 and 100,000 dollars" }, 400);
      clean[k] = v as number;
    }
    patch.price_overrides = clean;
  }
  if (typeof body.listed === "boolean") patch.listed = body.listed;
  if (typeof body.featured === "boolean") patch.featured = body.featured;
  if (typeof body.capacity_on_deck === "number") patch.capacity_on_deck = Math.max(1, Math.min(20, Math.round(body.capacity_on_deck)));
  if (Array.isArray(body.badges)) patch.badges = body.badges.filter((b) => typeof b === "string");
  if (body.block === true) patch.blocked_at = new Date().toISOString();
  if (body.block === false) patch.blocked_at = null;
  if (body.remove === true) {
    patch.deleted_at = new Date().toISOString();
    patch.status = "deactivated";
    patch.blocked_at = new Date().toISOString();
  }
  if (typeof body.presents_blocked === "boolean") patch.presents_blocked_at = body.presents_blocked ? new Date().toISOString() : null;
  if (Object.keys(patch).length === 0) return c.json({ error: "nothing to change" }, 400);
  const { data: cur } = await admin.from("athletes").select("tier, offers_mentoring").eq("user_id", id).maybeSingle();
  const mentoring = cur?.offers_mentoring !== false;
  if (patch.status === "approved" && !patch.tier && mentoring && !cur?.tier) {
    return c.json({ error: "pick a tier before approving; the marketplace only lists tiered mentors" }, 400);
  }
  const { error } = await admin.from("athletes").update(patch).eq("user_id", id);
  if (error) return c.json({ error: error.message }, 500);
  if (tierChanged) await admin.from("mentor_tier_history").insert({ athlete_id: id, from_tier: previousTier, to_tier: patch.tier, changed_by: me.id });
  await audit(me.id, "mentor.update", "athlete", id, patch);
  if (patch.status === "approved") {
    if (mentoring) {
      await notify(id, "mentor.approved", "You're approved as an FLP Mentor",
        `<p>Welcome to First Line Performance. Your profile is live on the marketplace and requests will start arriving by email.</p><p><a href="${appUrl("/athlete")}" style="color:#d4a32c">Open your dashboard</a></p>`,
        { targetId: id });
    } else {
      await notify(id, "mentor.approved", "You're approved for First Line Presents",
        `<p>Welcome to First Line Performance. Set your price and switch First Line Presents on from My profile, and set up payouts so you can be paid. Requests arrive by email.</p><p><a href="${appUrl("/athlete/profile")}" style="color:#d4a32c">Open My profile</a></p>`,
        { targetId: id });
    }
  }
  if (body.remove === true) {
    // Block sign-in at the auth layer as well.
    await admin.auth.admin.updateUserById(id, { ban_duration: "876000h" }).catch(() => {});
  }
  return c.json({ ok: true });
});

// GET /admin/mentors/revenue?days=30|90|all — money made and money left on the table, per mentor (U-15).
adminRoutes.get("/mentors/revenue", async (c) => {
  const me = await requireAdmin(c.req.header("authorization"));
  if (!me) return c.json({ error: "admin only" }, 403);
  const days = parseDays(c.req.query("days"));
  const mentors = await mentorRevenue(null, days);
  return c.json({ days: days ?? "all", mentors });
});

// GET /admin/mentors/:id/revenue?days=  — the same figures for one mentor.
adminRoutes.get("/mentors/:id/revenue", async (c) => {
  const me = await requireAdmin(c.req.header("authorization"));
  if (!me) return c.json({ error: "admin only" }, 403);
  const id = c.req.param("id");
  const days = parseDays(c.req.query("days"));
  const figures = await mentorRevenue([id], days);
  return c.json({ days: days ?? "all", revenue: figures[id] });
});

// --- Jobs ------------------------------------------------------------------
// POST /admin/jobs/:id/assign { athleteId }  — pin a job to a mentor (rank 3 offer) or reassign.
adminRoutes.post("/jobs/:id/assign", async (c) => {
  const me = await requireAdmin(c.req.header("authorization"));
  if (!me) return c.json({ error: "admin only" }, 403);
  const jobId = c.req.param("id");
  const { athleteId } = (await c.req.json().catch(() => ({}))) as { athleteId?: string };
  if (!athleteId) return c.json({ error: "athleteId required" }, 400);
  const { data: job } = await admin.from("jobs").select("id, status, athlete_id").eq("id", jobId).maybeSingle();
  if (!job) return c.json({ error: "job not found" }, 404);
  if (["delivered", "closed"].includes(job.status)) return c.json({ error: "job already delivered" }, 400);
  // Expire any open offer, then offer to the chosen mentor.
  await admin.from("job_offers").update({ response: "expired", responded_at: new Date().toISOString() }).eq("job_id", jobId).is("response", null);
  if (job.status === "accepted" && job.athlete_id) {
    await audit(me.id, "job.reassign", "job", jobId, { from: job.athlete_id, to: athleteId });
    await notify(job.athlete_id, "job.reassigned", "A breakdown was reassigned", `<p>FLP moved one of your accepted breakdowns to another mentor.</p>`, { targetId: jobId });
  } else {
    await audit(me.id, "job.assign", "job", jobId, { to: athleteId });
  }
  await offerJob(jobId, athleteId, 3);
  return c.json({ ok: true });
});

// POST /admin/jobs/:id/extend { hours }
adminRoutes.post("/jobs/:id/extend", async (c) => {
  const me = await requireAdmin(c.req.header("authorization"));
  if (!me) return c.json({ error: "admin only" }, 403);
  const jobId = c.req.param("id");
  const { hours } = (await c.req.json().catch(() => ({}))) as { hours?: number };
  const h = Number(hours);
  if (!(h > 0 && h <= 168)) return c.json({ error: "hours must be 1 to 168" }, 400);
  const { data: job } = await admin.from("jobs").select("due_at").eq("id", jobId).maybeSingle();
  if (!job?.due_at) return c.json({ error: "job has no due date" }, 400);
  const due = new Date(new Date(job.due_at).getTime() + h * 3600 * 1000).toISOString();
  await admin.from("jobs").update({ due_at: due }).eq("id", jobId);
  await audit(me.id, "job.extend", "job", jobId, { hours: h, due_at: due });
  return c.json({ ok: true, due_at: due });
});

// --- Quality Control Audits ------------------------------------------------
// POST /admin/audits/:id/note { note }
adminRoutes.post("/audits/:id/note", async (c) => {
  const me = await requireAdmin(c.req.header("authorization"));
  if (!me) return c.json({ error: "admin only" }, 403);
  const id = c.req.param("id");
  const { note } = (await c.req.json().catch(() => ({}))) as { note?: string };
  if (!note?.trim()) return c.json({ error: "note required" }, 400);
  const { data: qa } = await admin.from("quality_audits").select("actions").eq("id", id).maybeSingle();
  if (!qa) return c.json({ error: "not found" }, 404);
  const actions = [...(qa.actions as unknown[]), { at: new Date().toISOString(), by: me.id, action: "note", note: note.trim() }];
  await admin.from("quality_audits").update({ actions }).eq("id", id);
  return c.json({ ok: true });
});

// POST /admin/audits/:id/close { outcome, note, refundCents?, reassignTo? }
adminRoutes.post("/audits/:id/close", async (c) => {
  const me = await requireAdmin(c.req.header("authorization"));
  if (!me) return c.json({ error: "admin only" }, 403);
  const id = c.req.param("id");
  const body = (await c.req.json().catch(() => ({}))) as { outcome?: string; note?: string; refundCents?: number; reassignTo?: string };
  const outcomes = ["dismissed", "refund_partial", "refund_full", "reassigned", "other"];
  if (!body.outcome || !outcomes.includes(body.outcome)) return c.json({ error: "outcome required" }, 400);
  const { data: qa } = await admin
    .from("quality_audits")
    .select("id, status, actions, breakdown_id, session_id, filed_by, breakdowns(job_id, jobs(order_id, athlete_id, orders(price_cents, stripe_payment_intent_id, refunded_cents)))")
    .eq("id", id)
    .maybeSingle();
  const q = qa as unknown as { id: string; status: string; actions: unknown[]; breakdown_id: string | null; filed_by: string; breakdowns: { job_id: string; jobs: { order_id: string; athlete_id: string | null; orders: { price_cents: number; stripe_payment_intent_id: string | null } } } | null } | null;
  if (!q) return c.json({ error: "not found" }, 404);
  if (q.status === "closed") return c.json({ error: "already closed" }, 400);

  const now = new Date().toISOString();
  let refundCents: number | null = null;
  let refundId: string | null = null;
  const order = q.breakdowns?.jobs.orders;
  if (body.outcome === "refund_full" || body.outcome === "refund_partial") {
    const left = (order?.price_cents ?? 0) - ((order as { refunded_cents?: number } | undefined)?.refunded_cents ?? 0);
    refundCents = body.outcome === "refund_full" ? left : Math.round(Number(body.refundCents ?? 0));
    if (!(refundCents > 0)) return c.json({ error: "refund amount required" }, 400);
    if (refundCents > left) return c.json({ error: `only $${(left / 100).toFixed(2)} is left to refund on this order` }, 400);
    if (stripe && order?.stripe_payment_intent_id) {
      const r = await refundPayment(order.stripe_payment_intent_id, refundCents, `qca_${id}`);
      if (!r.ok) return c.json({ error: `Stripe refused the refund: ${r.error}` }, 502);
      refundId = r.refundId;
    }
    if (q.breakdowns) {
      await admin.from("orders").update({ status: body.outcome === "refund_full" ? "refunded" : "delivered", refunded_at: now, refunded_cents: ((order as { refunded_cents?: number } | undefined)?.refunded_cents ?? 0) + refundCents }).eq("id", q.breakdowns.jobs.order_id);
      // Full refund voids the mentor's payout; partial leaves it to admin judgment (recorded in note).
      if (body.outcome === "refund_full") await admin.from("payouts").update({ status: "voided", note: `QCA ${id} full refund` }).eq("job_id", q.breakdowns.job_id).in("status", ["owed", "held"]);
    }
  }
  if (body.outcome === "reassigned" && q.breakdowns) {
    if (!body.reassignTo) return c.json({ error: "reassignTo (athleteId) required" }, 400);
    await admin.from("payouts").update({ status: "voided", note: `QCA ${id} reassigned` }).eq("job_id", q.breakdowns.job_id).in("status", ["owed", "held"]);
    await admin.from("jobs").update({ status: "reassigned" }).eq("id", q.breakdowns.job_id);
    // New job for the same order, offered to the chosen mentor.
    const { data: nj } = await admin.from("jobs").insert({ order_id: q.breakdowns.jobs.order_id, status: "offered" }).select("id").single();
    if (nj) await offerJob(nj.id, body.reassignTo, 3);
  }
  // Dismissed or other: release a held payout.
  if (body.outcome === "dismissed" || body.outcome === "other") {
    if (q.breakdowns) await admin.from("payouts").update({ status: "owed", held_reason: null }).eq("job_id", q.breakdowns.job_id).eq("status", "held");
  }
  const actions = [...q.actions, { at: now, by: me.id, action: `closed:${body.outcome}`, note: body.note ?? "", refund_cents: refundCents, refund_id: refundId }];
  await admin.from("quality_audits").update({ status: "closed", outcome: body.outcome, refund_cents: refundCents, notes: body.note ?? "", actions, closed_at: now, closed_by: me.id }).eq("id", id);
  await audit(me.id, "qca.close", "quality_audit", id, { outcome: body.outcome, refundCents });
  await notify(q.filed_by, "qca.closed", "Your Quality Control Audit was resolved",
    `<p>FLP reviewed your audit. Outcome: <b>${body.outcome.replace("_", " ")}</b>.</p>${body.note ? `<p>${body.note}</p>` : ""}`,
    { targetId: id });
  return c.json({ ok: true, refundCents, refundId });
});

// --- Payout ledger -----------------------------------------------------------
// POST /admin/orders/:id/refund { amountCents?, reason }  — refund a paid order outside an audit.
// No amount means everything not yet refunded. A full refund closes the order and voids the mentor's payout.
adminRoutes.post("/orders/:id/refund", async (c) => {
  const me = await requireAdmin(c.req.header("authorization"));
  if (!me) return c.json({ error: "admin only" }, 403);
  const id = c.req.param("id");
  const body = (await c.req.json().catch(() => ({}))) as { amountCents?: number; reason?: string };
  const { data: o } = await admin.from("orders").select("id, status, price_cents, refunded_cents, paid_at, parent_id, stripe_payment_intent_id").eq("id", id).maybeSingle();
  if (!o) return c.json({ error: "not found" }, 404);
  if (!o.paid_at) return c.json({ error: "this order was never paid" }, 400);
  const left = o.price_cents - (o.refunded_cents ?? 0);
  if (left <= 0) return c.json({ error: "this order is already refunded in full" }, 400);
  const amount = body.amountCents === undefined ? left : Math.round(Number(body.amountCents));
  if (!Number.isInteger(amount) || amount <= 0 || amount > left) return c.json({ error: `the refund must be between $0.01 and $${(left / 100).toFixed(2)}` }, 400);
  let refundId: string | null = null;
  if (o.stripe_payment_intent_id) {
    const r = await refundPayment(o.stripe_payment_intent_id, amount, `order_${id}_${(o.refunded_cents ?? 0) + amount}`);
    if (!r.ok) return c.json({ error: `Stripe refused the refund: ${r.error}` }, 502);
    refundId = r.refundId;
  }
  const total = (o.refunded_cents ?? 0) + amount;
  const full = total >= o.price_cents;
  await admin.from("orders").update({ refunded_cents: total, ...(full ? { status: "refunded", refunded_at: new Date().toISOString() } : {}) }).eq("id", id);
  const { data: jobs } = await admin.from("jobs").select("id, status").eq("order_id", id);
  if (full) {
    for (const j of jobs ?? []) {
      await admin.from("payouts").update({ status: "voided", note: "order refunded in full" }).eq("job_id", j.id).in("status", ["owed", "held"]);
      if (!["delivered", "closed"].includes(j.status)) await admin.from("jobs").update({ status: "closed" }).eq("id", j.id);
    }
  }
  // A payout that already went out is not pulled back: the admin is told, and decides what to do about it.
  const jobIds = (jobs ?? []).map((j) => j.id);
  const { data: paidOut } = jobIds.length ? await admin.from("payouts").select("amount_cents").in("job_id", jobIds).eq("status", "paid") : { data: [] as { amount_cents: number }[] };
  const mentorPaidCents = (paidOut ?? []).reduce((n, p) => n + p.amount_cents, 0);
  await audit(me.id, "order.refund", "order", id, { amount, total, full, refundId, mentorPaidCents, reason: body.reason ?? "", charged: Boolean(o.stripe_payment_intent_id) });
  await notify(o.parent_id, "order.refunded", full ? "Your FLP order was refunded" : "A partial refund on your FLP order",
    `<p>FLP refunded $${(amount / 100).toFixed(2)}${body.reason ? `: ${body.reason}` : "."}</p><p>It can take a few business days to show on your statement.</p>`, { targetId: id });
  return c.json({ ok: true, refundedCents: amount, totalRefundedCents: total, full, refundId, mentorPaidCents, charged: Boolean(o.stripe_payment_intent_id) });
});

// GET /admin/payouts/schedule — mode, the next scheduled run and the last run.
adminRoutes.get("/payouts/schedule", async (c) => {
  const me = await requireAdmin(c.req.header("authorization"));
  if (!me) return c.json({ error: "admin only" }, 403);
  const pr = payoutRules(await getSettings());
  const { due, next } = scheduledRuns(pr);
  const dueNow = Boolean(due && !(pr.lastRunAt && new Date(pr.lastRunAt) >= due));
  return c.json({ mode: pr.mode, anchor: pr.anchor, hour: pr.hour, nextRunAt: (pr.mode === "scheduled" && dueNow ? due : next)?.toISOString() ?? null, lastRunAt: pr.lastRunAt, stripeConfigured: Boolean(stripe) });
});

// POST /admin/payouts/run — pay everything past the waiting period now, in any mode.
adminRoutes.post("/payouts/run", async (c) => {
  const me = await requireAdmin(c.req.header("authorization"));
  if (!me) return c.json({ error: "admin only" }, 403);
  if (!stripe) return c.json({ error: "Stripe is not configured on this server" }, 503);
  const r = await runPayoutBatch("manual", me.id);
  return c.json({ ok: true, ...r });
});

// POST /admin/payouts/:id/pay { method: "stripe" | "manual", note? }
adminRoutes.post("/payouts/:id/pay", async (c) => {
  const me = await requireAdmin(c.req.header("authorization"));
  if (!me) return c.json({ error: "admin only" }, 403);
  const id = c.req.param("id");
  const body = (await c.req.json().catch(() => ({}))) as { method?: "stripe" | "manual"; note?: string };
  const { data: p } = await admin.from("payouts").select("id, status, amount_cents, currency, athlete_id, athletes(stripe_account_id, payouts_enabled)").eq("id", id).maybeSingle();
  const payout = p as unknown as { id: string; status: string; amount_cents: number; currency: string; athlete_id: string; athletes: { stripe_account_id: string | null; payouts_enabled: boolean } | null } | null;
  if (!payout) return c.json({ error: "not found" }, 404);
  if (payout.status !== "owed") return c.json({ error: `payout is ${payout.status}` }, 400);
  let transferId: string | null = null;
  if (body.method === "stripe") {
    const res = await payPayoutViaStripe(id, me.id);
    if (!res.ok) return c.json({ error: res.error }, 400);
    transferId = res.transferId;
  } else {
    await admin.from("payouts").update({ status: "paid", paid_at: new Date().toISOString(), paid_by: me.id, note: body.note ?? "paid outside Stripe", error: null }).eq("id", id);
  }
  await audit(me.id, "payout.pay", "payout", id, { method: body.method ?? "manual", transferId });
  return c.json({ ok: true, transferId });
});

// POST /admin/payouts/:id/hold { hold: boolean, reason? }
adminRoutes.post("/payouts/:id/hold", async (c) => {
  const me = await requireAdmin(c.req.header("authorization"));
  if (!me) return c.json({ error: "admin only" }, 403);
  const id = c.req.param("id");
  const { hold, reason } = (await c.req.json().catch(() => ({}))) as { hold?: boolean; reason?: string };
  const { data: p } = await admin.from("payouts").select("status").eq("id", id).maybeSingle();
  if (!p) return c.json({ error: "not found" }, 404);
  if (hold && p.status === "owed") await admin.from("payouts").update({ status: "held", held_reason: reason ?? "admin hold" }).eq("id", id);
  else if (!hold && p.status === "held") await admin.from("payouts").update({ status: "owed", held_reason: null }).eq("id", id);
  else return c.json({ error: `payout is ${p.status}` }, 400);
  await audit(me.id, hold ? "payout.hold" : "payout.release", "payout", id, { reason });
  return c.json({ ok: true });
});

// --- Reviews -----------------------------------------------------------------
// POST /admin/reviews/:breakdownId { status: "published" | "hidden" }
adminRoutes.post("/reviews/:id", async (c) => {
  const me = await requireAdmin(c.req.header("authorization"));
  if (!me) return c.json({ error: "admin only" }, 403);
  const body = (await c.req.json().catch(() => ({}))) as { status?: string; kind?: string };
  const { status } = body;
  if (status !== "published" && status !== "hidden") return c.json({ error: "status must be published or hidden" }, 400);
  const { kind } = body;
  const table = kind === "session" ? "sessions" : "breakdowns";
  await admin.from(table).update({ review_status: status }).eq("id", c.req.param("id"));
  await audit(me.id, "review.moderate", kind === "session" ? "session" : "breakdown", c.req.param("id"), { status });
  return c.json({ ok: true });
});

// --- Film Room sessions ---------------------------------------------------------
// POST /admin/sessions/:id/cancel { reason }   — cancel with a full refund, whoever's fault
adminRoutes.post("/sessions/:id/cancel", async (c) => {
  const me = await requireAdmin(c.req.header("authorization"));
  if (!me) return c.json({ error: "admin only" }, 403);
  const id = c.req.param("id");
  const { reason } = (await c.req.json().catch(() => ({}))) as { reason?: string };
  const { data: s } = await admin.from("sessions").select("id, status").eq("id", id).maybeSingle();
  if (!s) return c.json({ error: "not found" }, 404);
  if (!["requested", "scheduled", "in_progress"].includes(s.status)) return c.json({ error: `session is ${s.status}` }, 400);
  await cancelAndRefund(id, "cancelled", (reason?.trim() || "Cancelled by FLP"), me.id);
  await audit(me.id, "session.admin_cancel", "session", id, { reason: reason ?? "" });
  return c.json({ ok: true });
});

// POST /admin/sessions/:id/no-show { who: "mentor" | "parent" }
adminRoutes.post("/sessions/:id/no-show", async (c) => {
  const me = await requireAdmin(c.req.header("authorization"));
  if (!me) return c.json({ error: "admin only" }, 403);
  const id = c.req.param("id");
  const { who } = (await c.req.json().catch(() => ({}))) as { who?: string };
  if (who !== "mentor" && who !== "parent") return c.json({ error: "who must be mentor or parent" }, 400);
  const { data: s } = await admin.from("sessions").select("id, status, athlete_id, mentor_share_cents").eq("id", id).maybeSingle();
  if (!s) return c.json({ error: "not found" }, 404);
  if (!["scheduled", "in_progress"].includes(s.status)) return c.json({ error: `session is ${s.status}` }, 400);
  if (who === "mentor") {
    await cancelAndRefund(id, "no_show_mentor", "Your FLP Mentor didn't join", me.id);
    await notify(s.athlete_id, "session.no_show", "A Film Room was marked as a no-show", `<p>FLP recorded a booked Film Room you didn't join. The family was refunded. Reply to this email if that's wrong.</p>`, { targetId: id });
  } else {
    await admin.from("sessions").update({ status: "no_show_parent", no_show_by: "parent", ended_at: new Date().toISOString() }).eq("id", id);
    if (s.mentor_share_cents) await admin.from("payouts").insert({ athlete_id: s.athlete_id, session_id: id, amount_cents: s.mentor_share_cents, status: "owed", note: "parent no-show (admin)" });
  }
  await audit(me.id, `session.no_show_${who}`, "session", id, {});
  return c.json({ ok: true });
});

// POST /admin/sessions/:id/complete — close a session that ran but never got closed
adminRoutes.post("/sessions/:id/complete", async (c) => {
  const me = await requireAdmin(c.req.header("authorization"));
  if (!me) return c.json({ error: "admin only" }, 403);
  const id = c.req.param("id");
  const { data: s } = await admin.from("sessions").select("id, status").eq("id", id).maybeSingle();
  if (!s) return c.json({ error: "not found" }, 404);
  if (!["scheduled", "in_progress"].includes(s.status)) return c.json({ error: `session is ${s.status}` }, 400);
  await completeSession(id);
  await audit(me.id, "session.admin_complete", "session", id, {});
  return c.json({ ok: true });
});

// --- Users -----------------------------------------------------------------------
// Suspend, unsuspend, delete. Enforced at the auth layer (ban) and mirrored on the profile so the
// directory shows it and the API refuses the account's calls.
async function targetUser(c: { req: { param: (k: string) => string } }, me: { id: string }) {
  const id = c.req.param("id");
  const { data: p } = await admin.from("profiles").select("id, email, role, full_name, suspended_at, deleted_at").eq("id", id).maybeSingle();
  if (!p) return { error: "not found", status: 404 as const };
  if (p.id === me.id) return { error: "you can't act on your own account here", status: 400 as const };
  if (p.role === "admin") return { error: "admins are managed from Settings, not here", status: 400 as const };
  return { p };
}

adminRoutes.post("/users/:id/suspend", async (c) => {
  const me = await requireAdmin(c.req.header("authorization"));
  if (!me) return c.json({ error: "admin only" }, 403);
  const t = await targetUser(c, me);
  if ("error" in t) return c.json({ error: t.error }, t.status);
  const { reason } = (await c.req.json().catch(() => ({}))) as { reason?: string };
  const why = (reason ?? "").trim().slice(0, 500);
  await admin.auth.admin.updateUserById(t.p.id, { ban_duration: "876000h" });
  await admin.from("profiles").update({ suspended_at: new Date().toISOString(), suspended_reason: why || null }).eq("id", t.p.id);
  if (t.p.role === "athlete") await admin.from("athletes").update({ status: "suspended", blocked_at: new Date().toISOString() }).eq("user_id", t.p.id).eq("status", "approved");
  await audit(me.id, "user.suspend", "profile", t.p.id, { reason: why });
  await notify(t.p.id, "account.suspended", "Your First Line Performance account is suspended",
    `<p>An FLP admin has suspended your account.${why ? ` Reason: ${why}` : ""}</p><p>Reply to this email if you think this is a mistake.</p>`, { targetId: t.p.id });
  return c.json({ ok: true });
});

adminRoutes.post("/users/:id/unsuspend", async (c) => {
  const me = await requireAdmin(c.req.header("authorization"));
  if (!me) return c.json({ error: "admin only" }, 403);
  const t = await targetUser(c, me);
  if ("error" in t) return c.json({ error: t.error }, t.status);
  await admin.auth.admin.updateUserById(t.p.id, { ban_duration: "none" });
  await admin.from("profiles").update({ suspended_at: null, suspended_reason: null }).eq("id", t.p.id);
  if (t.p.role === "athlete") await admin.from("athletes").update({ status: "approved", blocked_at: null }).eq("user_id", t.p.id).eq("status", "suspended");
  await audit(me.id, "user.unsuspend", "profile", t.p.id, {});
  await notify(t.p.id, "account.restored", "Your First Line Performance account is active again", `<p>An FLP admin has restored your account. You can sign in as before.</p>`, { targetId: t.p.id });
  return c.json({ ok: true });
});

// Delete: gone for good when nothing references the account; otherwise deactivated so orders,
// sessions and the ledger keep their history.
adminRoutes.post("/users/:id/delete", async (c) => {
  const me = await requireAdmin(c.req.header("authorization"));
  if (!me) return c.json({ error: "admin only" }, 403);
  const t = await targetUser(c, me);
  if ("error" in t) return c.json({ error: t.error }, t.status);
  const id = t.p.id;
  const refs = await Promise.all([
    admin.from("orders").select("id", { count: "exact", head: true }).eq("parent_id", id),
    admin.from("jobs").select("id", { count: "exact", head: true }).eq("athlete_id", id),
    admin.from("sessions").select("id", { count: "exact", head: true }).or(`parent_id.eq.${id},athlete_id.eq.${id}`),
    admin.from("session_packs").select("id", { count: "exact", head: true }).or(`parent_id.eq.${id},athlete_id.eq.${id}`),
    admin.from("payouts").select("id", { count: "exact", head: true }).eq("athlete_id", id),
    admin.from("job_offers").select("id", { count: "exact", head: true }).eq("athlete_id", id),
  ]);
  const referenced = refs.some((r) => (r.count ?? 0) > 0);
  if (!referenced) {
    await audit(me.id, "user.delete", "profile", id, { email: t.p.email, mode: "hard" });
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ ok: true, mode: "deleted" });
  }
  await admin.auth.admin.updateUserById(id, { ban_duration: "876000h" });
  await admin.from("profiles").update({ deleted_at: new Date().toISOString(), suspended_at: new Date().toISOString(), suspended_reason: "account deleted" }).eq("id", id);
  if (t.p.role === "athlete") await admin.from("athletes").update({ status: "deactivated", blocked_at: new Date().toISOString(), deleted_at: new Date().toISOString() }).eq("user_id", id);
  await audit(me.id, "user.delete", "profile", id, { email: t.p.email, mode: "deactivated" });
  return c.json({ ok: true, mode: "deactivated" });
});

// --- Delete a mentor so they can start over ------------------------------------------------------
// The live account is wiped and hidden and its email moves to a placeholder, so the same email and
// phone can sign up again. Everything it held is stored in deleted_accounts, where an admin can read
// it and restore it. Orders, payouts and reviews keep pointing at the wiped account, so history stays.
const DELETED_DOMAIN = "deleted.firstlineperform.com";
const DELETED_NAME = "Deleted mentor";

adminRoutes.post("/mentors/:id/delete", async (c) => {
  const me = await requireAdmin(c.req.header("authorization"));
  if (!me) return c.json({ error: "admin only" }, 403);
  const id = c.req.param("id");
  const { reason } = (await c.req.json().catch(() => ({}))) as { reason?: string };
  if (id === me.id) return c.json({ error: "you can't delete your own account" }, 400);

  const [{ data: profile }, { data: athlete }, { data: application }, { data: auth }] = await Promise.all([
    admin.from("profiles").select("*").eq("id", id).maybeSingle(),
    admin.from("athletes").select("*").eq("user_id", id).maybeSingle(),
    admin.from("athlete_applications").select("*").eq("user_id", id).maybeSingle(),
    admin.auth.admin.getUserById(id),
  ]);
  if (!profile || !athlete) return c.json({ error: "mentor not found" }, 404);
  if (profile.role === "admin") return c.json({ error: "admins are managed from Settings" }, 400);
  if (String(profile.email ?? "").endsWith(`@${DELETED_DOMAIN}`)) return c.json({ error: "this mentor is already deleted" }, 400);

  // Never pull someone out from under a family: open work has to be finished or reassigned first.
  const [jobs, offers, sessions] = await Promise.all([
    admin.from("jobs").select("id", { count: "exact", head: true }).eq("athlete_id", id).in("status", ["offered", "accepted"]),
    admin.from("job_offers").select("id", { count: "exact", head: true }).eq("athlete_id", id).is("response", null),
    admin.from("sessions").select("id", { count: "exact", head: true }).eq("athlete_id", id).in("status", ["requested", "scheduled", "in_progress"]),
  ]);
  const open = [
    jobs.count ? `${jobs.count} breakdown${jobs.count === 1 ? "" : "s"} in progress` : "",
    offers.count ? `${offers.count} open request${offers.count === 1 ? "" : "s"}` : "",
    sessions.count ? `${sessions.count} upcoming Film Room${sessions.count === 1 ? "" : "s"}` : "",
  ].filter(Boolean);
  if (open.length) return c.json({ error: `Reassign or finish their open work first: ${open.join(", ")}.` }, 409);

  const authUser = auth?.user;
  const { data: record, error: recErr } = await admin.from("deleted_accounts").insert({
    user_id: id, role: profile.role, email: authUser?.email ?? profile.email, full_name: profile.full_name, phone: profile.phone,
    display_name: athlete.display_name, reason: (reason ?? "").trim().slice(0, 500) || null, deleted_by: me.id,
    snapshot: {
      profile, athlete, application: application ?? null,
      auth: authUser ? { email: authUser.email, phone: authUser.phone, email_confirmed_at: authUser.email_confirmed_at, created_at: authUser.created_at, user_metadata: authUser.user_metadata, banned_until: (authUser as { banned_until?: string }).banned_until ?? null } : null,
    },
  }).select("id").single();
  if (recErr || !record) return c.json({ error: "could not save the record: " + (recErr?.message ?? "unknown") }, 500);

  // Free the email: move the sign-in to a placeholder that never receives mail, and block it.
  const tag = `${id.slice(0, 8)}-${Date.now().toString(36)}`;
  const { error: authErr } = await admin.auth.admin.updateUserById(id, {
    email: `deleted-${tag}@${DELETED_DOMAIN}`, email_confirm: true, ban_duration: "876000h",
    user_metadata: { full_name: null, application: null, deleted: true },
  });
  if (authErr) {
    await admin.from("deleted_accounts").delete().eq("id", record.id);
    return c.json({ error: "could not free the email: " + authErr.message }, 500);
  }
  const now = new Date().toISOString();
  await admin.from("profiles").update({ full_name: DELETED_NAME, phone: null, address: null, deleted_at: now, suspended_at: now, suspended_reason: "deleted by admin" }).eq("id", id);
  await admin.from("athletes").update({ display_name: DELETED_NAME, slug: `deleted-${tag}`, status: "deactivated", listed: false, featured: false, blocked_at: now, deleted_at: now }).eq("user_id", id);
  await audit(me.id, "mentor.delete", "athlete", id, { record: record.id, email: authUser?.email ?? profile.email, reason: reason ?? null });
  return c.json({ ok: true, record: record.id });
});

// Bring a deleted mentor back exactly as they were, if their email hasn't been used to sign up again.
adminRoutes.post("/deleted/:recordId/restore", async (c) => {
  const me = await requireAdmin(c.req.header("authorization"));
  if (!me) return c.json({ error: "admin only" }, 403);
  const { data: rec } = await admin.from("deleted_accounts").select("*").eq("id", c.req.param("recordId")).maybeSingle();
  if (!rec) return c.json({ error: "record not found" }, 404);
  if (rec.restored_at) return c.json({ error: "already restored" }, 400);
  if (!rec.user_id) return c.json({ error: "the original account no longer exists; this record is read-only" }, 400);

  const { data: clash } = await admin.from("profiles").select("id, created_at").eq("email", rec.email.toLowerCase()).neq("id", rec.user_id).maybeSingle();
  if (clash) {
    const when = new Date(clash.created_at).toLocaleDateString("en-US", { timeZone: "America/Detroit", month: "short", day: "numeric" });
    return c.json({ error: `${rec.email} signed up again on ${when}, so the old account can't take it back. Keep the new account, or delete it first and then restore this one.` }, 409);
  }

  const snap = rec.snapshot as { profile: Record<string, unknown>; athlete: Record<string, unknown>; auth: { user_metadata?: Record<string, unknown> } | null };
  const p = snap.profile ?? {};
  const a = snap.athlete ?? {};
  const wasSuspended = Boolean(p.suspended_at);
  const { error: authErr } = await admin.auth.admin.updateUserById(rec.user_id, {
    email: rec.email, email_confirm: true, ban_duration: wasSuspended ? "876000h" : "none",
    user_metadata: { ...(snap.auth?.user_metadata ?? {}), deleted: null },
  });
  if (authErr) return c.json({ error: "could not restore the email: " + authErr.message }, 500);

  let slug = String(a.slug ?? "");
  const { data: slugTaken } = await admin.from("athletes").select("user_id").eq("slug", slug).neq("user_id", rec.user_id).maybeSingle();
  if (!slug || slugTaken) slug = `${slug || "mentor"}-r${Math.random().toString(16).slice(2, 6)}`;
  await admin.from("profiles").update({
    full_name: p.full_name ?? null, phone: p.phone ?? null, address: p.address ?? null,
    deleted_at: p.deleted_at ?? null, suspended_at: p.suspended_at ?? null, suspended_reason: p.suspended_reason ?? null,
  }).eq("id", rec.user_id);
  await admin.from("athletes").update({
    display_name: a.display_name, slug, status: a.status, listed: a.listed ?? true, featured: a.featured ?? false,
    blocked_at: a.blocked_at ?? null, deleted_at: a.deleted_at ?? null,
  }).eq("user_id", rec.user_id);
  await admin.from("deleted_accounts").update({ restored_at: new Date().toISOString(), restored_by: me.id }).eq("id", rec.id);
  await audit(me.id, "mentor.restore", "athlete", rec.user_id, { record: rec.id, email: rec.email });
  return c.json({ ok: true, userId: rec.user_id });
});

// --- Settings ----------------------------------------------------------------
// PATCH /admin/settings { rules?, taxonomy?, marketplace? }  (shallow-merged per key). Prices live on the mentor levels.
adminRoutes.patch("/settings", async (c) => {
  const me = await requireAdmin(c.req.header("authorization"));
  if (!me) return c.json({ error: "admin only" }, 403);
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const current = await getSettings();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.rules && typeof body.rules === "object") delete (body.rules as Record<string, unknown>).payout_last_run_at; // written by the payout run itself, never by hand
  for (const key of ["rules", "taxonomy", "marketplace"] as const) {
    if (body[key] && typeof body[key] === "object") patch[key] = { ...(current[key] as object), ...(body[key] as object) };
  }
  const pr = patch.rules as Record<string, unknown> | undefined;
  if (pr?.payout_mode !== undefined && !["manual", "auto", "scheduled"].includes(pr.payout_mode as string)) return c.json({ error: "payout_mode must be manual, auto or scheduled" }, 400);
  if (pr?.payout_anchor !== undefined && (typeof pr.payout_anchor !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(pr.payout_anchor) || Number.isNaN(Date.parse(pr.payout_anchor)))) return c.json({ error: "payout_anchor must be a date like 2026-10-30 (the first payday)" }, 400);
  if (pr?.payout_hour !== undefined && (!Number.isInteger(pr.payout_hour) || (pr.payout_hour as number) < 0 || (pr.payout_hour as number) > 23)) return c.json({ error: "payout_hour must be 0 to 23 (Eastern)" }, 400);
  if (pr) {
    // Video slots: a public Mux playback id, or blank to hide the slot.
    for (const k of ["explainer_parent_playback_id", "explainer_mentor_playback_id", "upload_help_playback_id"]) {
      const v = pr[k];
      if (v === undefined || v === null || v === "") continue;
      if (typeof v !== "string" || !/^[A-Za-z0-9]{8,80}$/.test(v.trim())) return c.json({ error: `${k} must be a Mux playback id (letters and digits only)` }, 400);
      pr[k] = v.trim();
    }
    const n = (k: string, lo: number, hi: number) => { const v = pr[k]; return v === undefined || (typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi); };
    if (!n("presents_share_pct", 0, 90)) return c.json({ error: "presents_share_pct must be a whole number from 0 to 90" }, 400);
    if (!n("presents_min_cents", 100, 1_000_000) || !n("presents_max_cents", 100, 1_000_000)) return c.json({ error: "Presents price bounds are whole cents between $1 and $10,000" }, 400);
    if (typeof pr.presents_min_cents === "number" && typeof pr.presents_max_cents === "number" && pr.presents_min_cents > pr.presents_max_cents) return c.json({ error: "the Presents floor must not exceed the ceiling" }, 400);
    if (!n("presents_max_days", 1, 14)) return c.json({ error: "presents_max_days must be 1 to 14" }, 400);
    if (!n("presents_problem_days", 0, 30)) return c.json({ error: "presents_problem_days must be 0 to 30" }, 400);
    if (pr.presents_review !== undefined && !["minors", "all"].includes(pr.presents_review as string)) return c.json({ error: "presents_review must be minors or all; videos for under-18 recipients are always checked" }, 400);
    for (const k of ["presents_occasions", "presents_blocklist"]) if (pr[k] !== undefined && !(Array.isArray(pr[k]) && (pr[k] as unknown[]).every((x) => typeof x === "string"))) return c.json({ error: `${k} must be a list of words` }, 400);
  }
  if (pr?.payout_delay_days !== undefined && (!Number.isInteger(pr.payout_delay_days) || (pr.payout_delay_days as number) < 0 || (pr.payout_delay_days as number) > 60)) return c.json({ error: "payout delay is a whole number of days from 0 to 60" }, 400);
  if (pr?.payout_mode !== undefined && pr.payout_mode !== (current.rules as Record<string, unknown>).payout_mode) await audit(me.id, "settings.payout_mode", "settings", null, { mode: pr.payout_mode });
  const mode = (patch.rules as Record<string, unknown> | undefined)?.payments_mode;
  if (mode !== undefined && mode !== "stripe" && mode !== "free_preview") return c.json({ error: "payments_mode must be stripe or free_preview" }, 400);
  if (mode !== undefined && mode !== current.rules.payments_mode) await audit(me.id, "settings.payments_mode", "settings", null, { mode });
  if (typeof body.currency === "string") patch.currency = body.currency;
  const { error } = await admin.from("settings").update(patch).eq("id", 1);
  if (error) return c.json({ error: error.message }, 500);
  invalidateSettings();
  await audit(me.id, "settings.update", "settings", null, { keys: Object.keys(patch) });
  return c.json({ ok: true });
});

// --- Admin seats ---------------------------------------------------------------
// POST /admin/admins { email }  — promote an existing account to admin (Alex, Bryan).
adminRoutes.post("/admins", async (c) => {
  const me = await requireAdmin(c.req.header("authorization"));
  if (!me) return c.json({ error: "admin only" }, 403);
  const { email } = (await c.req.json().catch(() => ({}))) as { email?: string };
  if (!email) return c.json({ error: "email required" }, 400);
  const { data: p } = await admin.from("profiles").select("id").eq("email", email.toLowerCase()).maybeSingle();
  if (!p) return c.json({ error: "no account with that email yet; have them sign up first" }, 404);
  await admin.from("profiles").update({ role: "admin" }).eq("id", p.id);
  await audit(me.id, "admin.grant", "profile", p.id, { email });
  return c.json({ ok: true });
});
