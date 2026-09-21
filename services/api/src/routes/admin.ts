import { Hono } from "hono";
import { admin, userFromBearer } from "../supabase.js";
import { getSettings } from "../settings.js";
import { offerJob } from "../jobs.js";
import { stripe } from "../stripe.js";
import { appUrl, notify } from "../notify.js";
import { cancelAndRefund, completeSession } from "./sessions.js";

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
// PATCH /admin/mentors/:id  { status?, verified?, tier?, capacity_on_deck?, badges?, block?, remove? }
adminRoutes.patch("/mentors/:id", async (c) => {
  const me = await requireAdmin(c.req.header("authorization"));
  if (!me) return c.json({ error: "admin only" }, 403);
  const id = c.req.param("id");
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  if (typeof body.status === "string" && ["applied", "approved", "suspended", "deactivated"].includes(body.status)) {
    patch.status = body.status;
    if (body.status === "approved") {
      patch.approved_at = new Date().toISOString();
      patch.approved_by = me.id;
    }
  }
  if (typeof body.verified === "boolean") patch.verified = body.verified;
  if (typeof body.tier === "string" && ["pro", "pwhl", "ncaa"].includes(body.tier)) patch.tier = body.tier;
  if (typeof body.capacity_on_deck === "number") patch.capacity_on_deck = Math.max(1, Math.min(5, Math.round(body.capacity_on_deck)));
  if (Array.isArray(body.badges)) patch.badges = body.badges.filter((b) => typeof b === "string");
  if (body.block === true) patch.blocked_at = new Date().toISOString();
  if (body.block === false) patch.blocked_at = null;
  if (body.remove === true) {
    patch.deleted_at = new Date().toISOString();
    patch.status = "deactivated";
    patch.blocked_at = new Date().toISOString();
  }
  if (Object.keys(patch).length === 0) return c.json({ error: "nothing to change" }, 400);
  if (patch.status === "approved" && !patch.tier) {
    const { data: cur } = await admin.from("athletes").select("tier").eq("user_id", id).maybeSingle();
    if (!cur?.tier) return c.json({ error: "pick a tier before approving; the marketplace only lists tiered mentors" }, 400);
  }
  const { error } = await admin.from("athletes").update(patch).eq("user_id", id);
  if (error) return c.json({ error: error.message }, 500);
  await audit(me.id, "mentor.update", "athlete", id, patch);
  if (patch.status === "approved") {
    await notify(id, "mentor.approved", "You're approved as an FLP Mentor",
      `<p>Welcome to First Line Performance. Your profile is live on the marketplace and requests will start arriving by email.</p><p><a href="${appUrl("/athlete")}" style="color:#d4a32c">Open your dashboard</a></p>`,
      { targetId: id });
  }
  if (body.remove === true) {
    // Block sign-in at the auth layer as well.
    await admin.auth.admin.updateUserById(id, { ban_duration: "876000h" }).catch(() => {});
  }
  return c.json({ ok: true });
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
    .select("id, status, actions, breakdown_id, session_id, filed_by, breakdowns(job_id, jobs(order_id, athlete_id, orders(price_cents, stripe_payment_intent_id)))")
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
    refundCents = body.outcome === "refund_full" ? order?.price_cents ?? 0 : Math.round(Number(body.refundCents ?? 0));
    if (!(refundCents > 0)) return c.json({ error: "refund amount required" }, 400);
    if (stripe && order?.stripe_payment_intent_id) {
      const r = await stripe.refunds.create({ payment_intent: order.stripe_payment_intent_id, amount: refundCents });
      refundId = r.id;
    }
    if (q.breakdowns) {
      await admin.from("orders").update({ status: body.outcome === "refund_full" ? "refunded" : "delivered", refunded_at: now }).eq("id", q.breakdowns.jobs.order_id);
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
    if (!stripe) return c.json({ error: "Stripe is not configured" }, 503);
    if (!payout.athletes?.stripe_account_id || !payout.athletes.payouts_enabled) return c.json({ error: "mentor has not finished Stripe onboarding" }, 400);
    const t = await stripe.transfers.create({ amount: payout.amount_cents, currency: payout.currency, destination: payout.athletes.stripe_account_id, metadata: { payoutId: id } });
    transferId = t.id;
  }
  await admin.from("payouts").update({ status: "paid", paid_at: new Date().toISOString(), paid_by: me.id, stripe_transfer_id: transferId, note: body.note ?? (body.method === "manual" ? "paid outside Stripe" : "") }).eq("id", id);
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

// --- Settings ----------------------------------------------------------------
// PATCH /admin/settings { breakdown_prices?, mentor_share_pct?, session_prices?, rules?, taxonomy? }  (shallow-merged per key)
adminRoutes.patch("/settings", async (c) => {
  const me = await requireAdmin(c.req.header("authorization"));
  if (!me) return c.json({ error: "admin only" }, 403);
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const current = await getSettings();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of ["breakdown_prices", "mentor_share_pct", "session_prices", "rules", "taxonomy"] as const) {
    if (body[key] && typeof body[key] === "object") patch[key] = { ...(current[key] as object), ...(body[key] as object) };
  }
  if (typeof body.currency === "string") patch.currency = body.currency;
  const { error } = await admin.from("settings").update(patch).eq("id", 1);
  if (error) return c.json({ error: error.message }, 500);
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
