import { Hono } from "hono";
import { admin, userFromBearer } from "../supabase.js";
import { getSettings, shareCents, type Tier } from "../settings.js";
import { stripe, stripeConfigured } from "../stripe.js";
import { env } from "../env.js";
import { appUrl, notify } from "../notify.js";
import { slotsForMentor } from "../slots.js";
import { createRoom, dailyConfigured, deleteRoom, meetingToken, recordingAccessLink } from "../daily.js";

// Film Room sessions. Parent books a slot inside the mentor's availability, pays at booking,
// mentor accepts (or the request expires), both join a recorded Daily room from the API-issued
// link, the mentor files a recap that lands in the Development Log, the parent rates it.

export const sessions = new Hono();

type Format = "film_room_30" | "film_room_60" | "addon_30" | "season_arc";
const MINUTES: Record<Format, number> = { film_room_30: 30, film_room_60: 60, addon_30: 30, season_arc: 30 };
const iso = (t: number) => new Date(t).toISOString();

async function mentorBySlug(slug: string) {
  const { data } = await admin.from("marketplace_mentors").select("user_id, display_name, tier").eq("slug", slug).maybeSingle();
  return data as { user_id: string; display_name: string; tier: Tier } | null;
}

async function sessionFor(id: string) {
  const { data } = await admin
    .from("sessions")
    .select("id, athlete_id, parent_id, player_id, status, scheduled_at, duration_minutes, format, price_cents, mentor_share_cents, tier, daily_room_name, daily_room_url, recording_daily_id, recording_status, recordings, accept_by, paid_at, pack_id, recap, breakdown_id, film_media_id, parent_note, parent_present, stripe_payment_intent_id")
    .eq("id", id)
    .maybeSingle();
  return data;
}

// GET /sessions/slots?mentor=slug&format=film_room_30
sessions.get("/slots", async (c) => {
  const slug = c.req.query("mentor");
  const format = (c.req.query("format") ?? "film_room_30") as Format;
  if (!slug || !(format in MINUTES)) return c.json({ error: "mentor and format required" }, 400);
  const m = await mentorBySlug(slug);
  if (!m) return c.json({ error: "mentor not found" }, 404);
  const slots = await slotsForMentor(m.user_id, MINUTES[format]);
  return c.json({ slots, minutes: MINUTES[format] });
});

// POST /sessions — book and pay.
sessions.post("/", async (c) => {
  const user = await userFromBearer(c.req.header("authorization"));
  if (!user) return c.json({ error: "sign in first" }, 401);
  const b = (await c.req.json().catch(() => ({}))) as {
    mentorSlug?: string; format?: Format; startsAt?: string; playerId?: string; note?: string;
    parentPresent?: boolean; breakdownId?: string | null; filmMediaId?: string | null; packId?: string | null;
  };
  if (!b.mentorSlug || !b.format || !(b.format in MINUTES) || !b.startsAt || !b.playerId) return c.json({ error: "mentorSlug, format, startsAt, playerId required" }, 400);
  if (b.format === "season_arc") return c.json({ error: "buy a Season Arc first, then book sessions from it" }, 400);

  const s = await getSettings();
  const r = s.rules as Record<string, number | boolean | number[]>;
  const m = await mentorBySlug(b.mentorSlug);
  if (!m) return c.json({ error: "mentor not found" }, 404);
  const { data: player } = await admin.from("players").select("id, parent_id, first_name").eq("id", b.playerId).maybeSingle();
  if (!player || player.parent_id !== user.id) return c.json({ error: "youth athlete not found" }, 404);

  const minutes = b.packId ? MINUTES.season_arc : MINUTES[b.format];
  const starts = new Date(b.startsAt);
  const slots = await slotsForMentor(m.user_id, minutes);
  if (!slots.includes(starts.toISOString())) return c.json({ error: "that time is no longer available" }, 409);

  // Add-on must follow a breakdown this mentor delivered within the window.
  if (b.format === "addon_30") {
    if (!b.breakdownId) return c.json({ error: "the add-on session needs a delivered breakdown" }, 400);
    const { data: bd } = await admin.from("breakdowns").select("id, delivered_at, jobs(athlete_id, orders(parent_id))").eq("id", b.breakdownId).maybeSingle();
    const x = bd as unknown as { delivered_at: string; jobs: { athlete_id: string; orders: { parent_id: string } } } | null;
    const days = (r.addon_window_days as number) ?? 14;
    if (!x || x.jobs.athlete_id !== m.user_id || x.jobs.orders.parent_id !== user.id) return c.json({ error: "that breakdown isn't yours with this mentor" }, 400);
    if (Date.now() - new Date(x.delivered_at).getTime() > days * 86400000) return c.json({ error: `the add-on price is available for ${days} days after delivery` }, 400);
  }

  // Pack booking: consume a credit instead of charging.
  let pack: { id: string; sessions_total: number; sessions_used: number; expires_at: string; mentor_share_cents: number } | null = null;
  if (b.packId) {
    const { data } = await admin.from("session_packs").select("id, sessions_total, sessions_used, expires_at, athlete_id, parent_id, paid_at, mentor_share_cents").eq("id", b.packId).maybeSingle();
    if (!data || data.parent_id !== user.id || data.athlete_id !== m.user_id || !data.paid_at) return c.json({ error: "pack not found" }, 404);
    if (data.sessions_used >= data.sessions_total) return c.json({ error: "no sessions left on that pack" }, 400);
    if (new Date(data.expires_at).getTime() < Date.now()) return c.json({ error: "that pack has expired" }, 400);
    pack = data;
  }

  const format: Format = pack ? "season_arc" : b.format;
  const price = pack ? 0 : (s.session_prices[format]?.[m.tier] ?? 0);
  if (!pack && !price) return c.json({ error: "session pricing is not set for this mentor's tier yet" }, 400);
  // Pack sessions carry their slice of the pack's mentor share so each completed session pays out.
  const share = pack ? Math.round(pack.mentor_share_cents / pack.sessions_total) : shareCents(price, s.mentor_share_pct[m.tier]);
  const mayDecline = Boolean(r.mentors_may_decline_sessions);
  const acceptBy = mayDecline ? iso(Date.now() + ((r.session_accept_hours as number) ?? 24) * 3600000) : null;

  const { data: sess, error } = await admin
    .from("sessions")
    .insert({
      athlete_id: m.user_id, parent_id: user.id, player_id: player.id, status: "requested", format,
      source: b.breakdownId ? "breakdown" : "marketplace", breakdown_id: b.breakdownId ?? null, film_media_id: b.filmMediaId ?? null,
      scheduled_at: starts.toISOString(), duration_minutes: minutes, price_cents: price, mentor_share_cents: share, tier: m.tier,
      parent_note: (b.note ?? "").slice(0, 1000), parent_present: Boolean(b.parentPresent), accept_by: acceptBy, pack_id: pack?.id ?? null,
    })
    .select("id")
    .single();
  if (error || !sess) return c.json({ error: error?.message ?? "could not book" }, 500);

  if (pack) {
    await admin.from("session_packs").update({ sessions_used: pack.sessions_used + 1 }).eq("id", pack.id);
    await afterPayment(sess.id);
    return c.json({ sessionId: sess.id, devPaid: true });
  }
  if (stripeConfigured && stripe) {
    const checkout = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: user.email ?? undefined,
      line_items: [{ quantity: 1, price_data: { currency: s.currency, unit_amount: price, product_data: { name: `FLP Film Room · ${minutes} min with ${m.display_name}` } } }],
      metadata: { sessionId: sess.id },
      success_url: appUrl(`/parent/sessions/${sess.id}?paid=1`),
      cancel_url: appUrl(`/mentors/${b.mentorSlug}?cancelled=1`),
    });
    await admin.from("sessions").update({ stripe_checkout_session_id: checkout.id }).eq("id", sess.id);
    return c.json({ sessionId: sess.id, checkoutUrl: checkout.url });
  }
  if (env.appEnv === "dev") {
    await afterPayment(sess.id);
    return c.json({ sessionId: sess.id, devPaid: true });
  }
  return c.json({ error: "payments are not configured" }, 503);
});

// Called when payment lands (Stripe webhook, pack booking, or dev shortcut): request the mentor
// (or schedule straight away when mentors can't decline) and create the room.
export async function afterPayment(sessionId: string) {
  const s = await getSettings();
  const sess = await sessionFor(sessionId);
  if (!sess || sess.paid_at) return; // webhooks retry; pay once, notify once
  const mayDecline = Boolean((s.rules as Record<string, unknown>).mentors_may_decline_sessions);
  const patch: Record<string, unknown> = { paid_at: iso(Date.now()) };
  if (!mayDecline) Object.assign(patch, await scheduleRoom(sess));
  await admin.from("sessions").update(patch).eq("id", sessionId);
  const when = new Date(sess.scheduled_at!).toLocaleString("en-US", { timeZone: "America/Detroit", dateStyle: "medium", timeStyle: "short" });
  if (mayDecline) {
    await notify(sess.athlete_id, "session.requested", "Film Room request",
      `<p>A parent booked a ${sess.duration_minutes}-minute Film Room with you for <b>${when} ET</b>. You have ${(s.rules as Record<string, number>).session_accept_hours ?? 24} hours to accept.</p><p><a href="${appUrl("/athlete")}" style="color:#d4a32c">Respond</a></p>`,
      { targetId: sessionId });
  } else {
    await notify(sess.athlete_id, "session.scheduled", "Film Room booked", `<p>A Film Room is on your calendar for <b>${when} ET</b>.</p>`, { targetId: sessionId });
  }
}

async function scheduleRoom(sess: NonNullable<Awaited<ReturnType<typeof sessionFor>>>) {
  const starts = new Date(sess.scheduled_at!);
  const ends = new Date(starts.getTime() + (sess.duration_minutes ?? 30) * 60000);
  const patch: Record<string, unknown> = { status: "scheduled" };
  if (dailyConfigured) {
    // Prefixed by environment: dev and production share one Daily domain.
    const room = await createRoom(`flp-${env.appEnv}-${sess.id.slice(0, 8)}`, starts, ends);
    patch.daily_room_name = room.name;
    patch.daily_room_url = room.url;
  }
  return patch;
}

// POST /sessions/:id/accept | /decline — mentor
sessions.post("/:id/accept", async (c) => {
  const user = await userFromBearer(c.req.header("authorization"));
  if (!user) return c.json({ error: "sign in first" }, 401);
  const sess = await sessionFor(c.req.param("id"));
  if (!sess || sess.athlete_id !== user.id) return c.json({ error: "not found" }, 404);
  if (sess.status !== "requested") return c.json({ error: `session is ${sess.status}` }, 400);
  const patch = await scheduleRoom(sess);
  await admin.from("sessions").update(patch).eq("id", sess.id);
  const when = new Date(sess.scheduled_at!).toLocaleString("en-US", { timeZone: "America/Detroit", dateStyle: "medium", timeStyle: "short" });
  await notify(sess.parent_id, "session.accepted", "Your Film Room is confirmed",
    `<p>Your FLP Mentor accepted. See you <b>${when} ET</b>. The join button appears on the session page 15 minutes before.</p><p><a href="${appUrl(`/parent/sessions/${sess.id}`)}" style="color:#d4a32c">Session page</a></p>`,
    { targetId: sess.id });
  return c.json({ ok: true });
});

sessions.post("/:id/decline", async (c) => {
  const user = await userFromBearer(c.req.header("authorization"));
  if (!user) return c.json({ error: "sign in first" }, 401);
  const sess = await sessionFor(c.req.param("id"));
  if (!sess || sess.athlete_id !== user.id) return c.json({ error: "not found" }, 404);
  if (sess.status !== "requested") return c.json({ error: `session is ${sess.status}` }, 400);
  await cancelAndRefund(sess.id, "declined", "mentor declined", null);
  return c.json({ ok: true });
});

export async function cancelAndRefund(sessionId: string, status: string, reason: string, cancelledBy: string | null) {
  const sess = await sessionFor(sessionId);
  if (!sess) return;
  let refunded = false;
  if (sess.pack_id) {
    const { data: p } = await admin.from("session_packs").select("sessions_used").eq("id", sess.pack_id).maybeSingle();
    if (p && p.sessions_used > 0) await admin.from("session_packs").update({ sessions_used: p.sessions_used - 1 }).eq("id", sess.pack_id);
    refunded = true;
  } else if (stripe && sess.stripe_payment_intent_id) {
    await stripe.refunds.create({ payment_intent: sess.stripe_payment_intent_id }).catch((e) => console.error("refund failed", e));
    refunded = true;
  }
  if (sess.daily_room_name) await deleteRoom(sess.daily_room_name);
  await admin.from("sessions").update({ status, cancel_reason: reason, cancelled_at: iso(Date.now()), cancelled_by: cancelledBy }).eq("id", sessionId);
  await notify(sess.parent_id, "session.cancelled", "Your Film Room was cancelled",
    `<p>${reason}.${refunded ? " You've been refunded in full." : ""}</p>`, { targetId: sessionId });
}

// POST /sessions/:id/cancel — parent (free before the window, forfeit inside) or mentor (refund + mark)
sessions.post("/:id/cancel", async (c) => {
  const user = await userFromBearer(c.req.header("authorization"));
  if (!user) return c.json({ error: "sign in first" }, 401);
  const sess = await sessionFor(c.req.param("id"));
  if (!sess || (sess.parent_id !== user.id && sess.athlete_id !== user.id)) return c.json({ error: "not found" }, 404);
  if (!["requested", "scheduled"].includes(sess.status)) return c.json({ error: `session is ${sess.status}` }, 400);
  const s = await getSettings();
  const windowH = ((s.rules as Record<string, number>).session_cancel_hours ?? 24) * 3600000;
  const inside = new Date(sess.scheduled_at!).getTime() - Date.now() < windowH;
  if (sess.parent_id === user.id) {
    if (inside && sess.status === "scheduled" && !sess.pack_id) {
      // Forfeit: no refund; the mentor keeps their share.
      if (sess.daily_room_name) await deleteRoom(sess.daily_room_name);
      await admin.from("sessions").update({ status: "cancelled", cancel_reason: "parent cancelled inside the window", cancelled_at: iso(Date.now()), cancelled_by: user.id }).eq("id", sess.id);
      if (sess.mentor_share_cents) await admin.from("payouts").insert({ athlete_id: sess.athlete_id, session_id: sess.id, amount_cents: sess.mentor_share_cents, status: "owed", note: "late cancellation" });
      return c.json({ ok: true, refunded: false });
    }
    await cancelAndRefund(sess.id, "cancelled", "You cancelled", user.id);
    return c.json({ ok: true, refunded: true });
  }
  // Mentor cancelling: always refund; inside the window it counts against them.
  await cancelAndRefund(sess.id, "cancelled", "Your FLP Mentor had to cancel", user.id);
  await admin.from("audit_log").insert({ actor_id: user.id, action: inside ? "session.mentor_late_cancel" : "session.mentor_cancel", target_type: "session", target_id: sess.id });
  return c.json({ ok: true, refunded: true });
});

// GET /sessions/:id/join — a fresh room link for a party, inside the time window.
sessions.get("/:id/join", async (c) => {
  const user = await userFromBearer(c.req.header("authorization"));
  if (!user) return c.json({ error: "sign in first" }, 401);
  const sess = await sessionFor(c.req.param("id"));
  if (!sess) return c.json({ error: "not found" }, 404);
  const { data: me } = await admin.from("profiles").select("role, full_name").eq("id", user.id).maybeSingle();
  const isMentor = sess.athlete_id === user.id;
  const isParent = sess.parent_id === user.id;
  if (!isMentor && !isParent && me?.role !== "admin") return c.json({ error: "not found" }, 404);
  if (!["scheduled", "in_progress"].includes(sess.status)) return c.json({ error: `session is ${sess.status}` }, 400);
  const starts = new Date(sess.scheduled_at!).getTime();
  const ends = starts + (sess.duration_minutes ?? 30) * 60000;
  const s = await getSettings();
  const grace = ((s.rules as Record<string, number>).session_grace_minutes ?? 10) * 60000;
  if (Date.now() < starts - 15 * 60000) return c.json({ error: "the room opens 15 minutes before the start" }, 400);
  if (Date.now() > ends + grace + 30 * 60000) return c.json({ error: "this session has ended" }, 400);
  if (!dailyConfigured || !sess.daily_room_name) return c.json({ configured: false, error: "Video rooms open once FLP's Daily account is connected." }, 503);
  const token = await meetingToken(sess.daily_room_name, me?.full_name || (isMentor ? "FLP Mentor" : "Parent"), {
    owner: isMentor || me?.role === "admin",
    startRecording: isMentor, // recording starts the moment the mentor joins; nobody can turn it off
    expSeconds: Math.max(600, Math.round((ends + grace - Date.now()) / 1000) + 1800),
  });
  if (sess.status === "scheduled" && isMentor) await admin.from("sessions").update({ status: "in_progress", athlete_joined_at: iso(Date.now()) }).eq("id", sess.id);
  if (isParent) await admin.from("sessions").update({ parent_joined_at: iso(Date.now()) }).eq("id", sess.id);
  return c.json({ configured: true, url: `${sess.daily_room_url}?t=${token}`, recorded: true });
});

// POST /sessions/:id/complete — mentor marks it done (also set by the Daily webhook when the room empties)
sessions.post("/:id/complete", async (c) => {
  const user = await userFromBearer(c.req.header("authorization"));
  if (!user) return c.json({ error: "sign in first" }, 401);
  const sess = await sessionFor(c.req.param("id"));
  if (!sess || sess.athlete_id !== user.id) return c.json({ error: "not found" }, 404);
  if (!["scheduled", "in_progress"].includes(sess.status)) return c.json({ error: `session is ${sess.status}` }, 400);
  await completeSession(sess.id);
  return c.json({ ok: true });
});

export async function completeSession(sessionId: string) {
  const s = await getSettings();
  const sess = await sessionFor(sessionId);
  if (!sess || sess.status === "completed") return;
  const due = iso(Date.now() + ((s.rules as Record<string, number>).recap_due_hours ?? 24) * 3600000);
  const retention = ((s.rules as Record<string, number>).recording_retention_days ?? 90) * 86400000;
  await admin.from("sessions").update({ status: "completed", ended_at: iso(Date.now()), recap_due_at: due, recording_expires_at: iso(Date.now() + retention) }).eq("id", sessionId);
  if (sess.mentor_share_cents) {
    await admin.from("payouts").insert({ athlete_id: sess.athlete_id, session_id: sessionId, amount_cents: sess.mentor_share_cents, status: "owed" });
  }
  await notify(sess.athlete_id, "session.recap_due", "Write your Film Room recap",
    `<p>Three takeaways, one or two drills, one next step. Due within ${(s.rules as Record<string, number>).recap_due_hours ?? 24} hours; it goes into the youth athlete's Development Log.</p><p><a href="${appUrl("/athlete")}" style="color:#d4a32c">Write it</a></p>`,
    { targetId: sessionId });
}

// POST /sessions/:id/recap — mentor
sessions.post("/:id/recap", async (c) => {
  const user = await userFromBearer(c.req.header("authorization"));
  if (!user) return c.json({ error: "sign in first" }, 401);
  const sess = await sessionFor(c.req.param("id"));
  if (!sess || sess.athlete_id !== user.id) return c.json({ error: "not found" }, 404);
  if (sess.status !== "completed") return c.json({ error: "recap is written after the session" }, 400);
  const b = (await c.req.json().catch(() => ({}))) as { takeaways?: string[]; drills?: string[]; next_step?: string };
  const clean = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 400) : "");
  const takeaways = (b.takeaways ?? []).map(clean).filter(Boolean).slice(0, 5);
  const drills = (b.drills ?? []).map(clean).filter(Boolean).slice(0, 4);
  const next_step = clean(b.next_step);
  if (takeaways.length === 0 || !next_step) return c.json({ error: "at least one takeaway and a next step" }, 400);
  await admin.from("sessions").update({ recap: { takeaways, drills, next_step }, recap_at: iso(Date.now()) }).eq("id", sess.id);
  await notify(sess.parent_id, "session.recap", "Your Film Room recap is in",
    `<p><b>Takeaways:</b> ${takeaways.join(" · ")}</p>${drills.length ? `<p><b>Drills:</b> ${drills.join(" · ")}</p>` : ""}<p><b>Next step:</b> ${next_step}</p><p><a href="${appUrl(`/parent/sessions/${sess.id}`)}" style="color:#d4a32c">Rate the session</a></p>`,
    { targetId: sess.id });
  return c.json({ ok: true });
});

// POST /sessions/:id/review — parent, same 3-star gate
sessions.post("/:id/review", async (c) => {
  const user = await userFromBearer(c.req.header("authorization"));
  if (!user) return c.json({ error: "sign in first" }, 401);
  const sess = await sessionFor(c.req.param("id"));
  if (!sess || sess.parent_id !== user.id) return c.json({ error: "not found" }, 404);
  if (sess.status !== "completed") return c.json({ error: "rate it after the session" }, 400);
  const b = (await c.req.json().catch(() => ({}))) as { rating?: number; review?: string };
  const rating = Number(b.rating);
  if (!(rating >= 1 && rating <= 5)) return c.json({ error: "rating must be 1 to 5" }, 400);
  const s = await getSettings();
  const review_status = rating >= s.rules.review_auto_publish_min ? "published" : "pending_admin";
  await admin.from("sessions").update({ rating, review: (b.review ?? "").trim().slice(0, 1500) || null, review_status, reviewed_at: iso(Date.now()) }).eq("id", sess.id);
  return c.json({ ok: true, review_status });
});

// POST /sessions/:id/no-show { who: "parent" | "mentor" } — the other party reports it; admin adjudicates via the ledger/audits
sessions.post("/:id/no-show", async (c) => {
  const user = await userFromBearer(c.req.header("authorization"));
  if (!user) return c.json({ error: "sign in first" }, 401);
  const sess = await sessionFor(c.req.param("id"));
  if (!sess || (sess.parent_id !== user.id && sess.athlete_id !== user.id)) return c.json({ error: "not found" }, 404);
  const who = sess.parent_id === user.id ? "mentor" : "parent";
  const ends = new Date(sess.scheduled_at!).getTime() + (sess.duration_minutes ?? 30) * 60000;
  if (Date.now() < new Date(sess.scheduled_at!).getTime() + 10 * 60000) return c.json({ error: "give it ten minutes past the start first" }, 400);
  if (!["scheduled", "in_progress"].includes(sess.status) || Date.now() > ends + 86400000) return c.json({ error: `session is ${sess.status}` }, 400);
  if (who === "mentor") {
    await cancelAndRefund(sess.id, "no_show_mentor", "Your FLP Mentor didn't show", user.id);
    await admin.from("audit_log").insert({ actor_id: user.id, action: "session.no_show_mentor", target_type: "session", target_id: sess.id });
  } else {
    await admin.from("sessions").update({ status: "no_show_parent", no_show_by: "parent", ended_at: iso(Date.now()) }).eq("id", sess.id);
    if (sess.mentor_share_cents) await admin.from("payouts").insert({ athlete_id: sess.athlete_id, session_id: sess.id, amount_cents: sess.mentor_share_cents, status: "owed", note: "parent no-show" });
  }
  return c.json({ ok: true });
});

// POST /sessions/packs — buy a Season Arc with one mentor
sessions.post("/packs", async (c) => {
  const user = await userFromBearer(c.req.header("authorization"));
  if (!user) return c.json({ error: "sign in first" }, 401);
  const b = (await c.req.json().catch(() => ({}))) as { mentorSlug?: string; playerId?: string };
  if (!b.mentorSlug || !b.playerId) return c.json({ error: "mentorSlug and playerId required" }, 400);
  const s = await getSettings();
  const r = s.rules as Record<string, number>;
  const m = await mentorBySlug(b.mentorSlug);
  if (!m) return c.json({ error: "mentor not found" }, 404);
  const { data: player } = await admin.from("players").select("id, parent_id").eq("id", b.playerId).maybeSingle();
  if (!player || player.parent_id !== user.id) return c.json({ error: "youth athlete not found" }, 404);
  const price = s.session_prices.season_arc?.[m.tier];
  if (!price) return c.json({ error: "Season Arc pricing is not set for this tier" }, 400);
  const total = r.season_arc_sessions ?? 4;
  const { data: pack, error } = await admin
    .from("session_packs")
    .insert({ parent_id: user.id, player_id: player.id, athlete_id: m.user_id, tier: m.tier, sessions_total: total, price_cents: price, mentor_share_cents: shareCents(price, s.mentor_share_pct[m.tier]), expires_at: iso(Date.now() + (r.season_arc_weeks ?? 8) * 7 * 86400000) })
    .select("id")
    .single();
  if (error || !pack) return c.json({ error: error?.message ?? "could not create pack" }, 500);
  if (stripeConfigured && stripe) {
    const checkout = await stripe.checkout.sessions.create({
      mode: "payment", customer_email: user.email ?? undefined,
      line_items: [{ quantity: 1, price_data: { currency: s.currency, unit_amount: price, product_data: { name: `FLP Season Arc · ${total} Film Rooms with ${m.display_name}` } } }],
      metadata: { packId: pack.id },
      success_url: appUrl(`/mentors/${b.mentorSlug}?pack=${pack.id}`), cancel_url: appUrl(`/mentors/${b.mentorSlug}?cancelled=1`),
    });
    await admin.from("session_packs").update({ stripe_checkout_session_id: checkout.id }).eq("id", pack.id);
    return c.json({ packId: pack.id, checkoutUrl: checkout.url });
  }
  if (env.appEnv === "dev") {
    await admin.from("session_packs").update({ paid_at: iso(Date.now()) }).eq("id", pack.id);
    return c.json({ packId: pack.id, devPaid: true });
  }
  return c.json({ error: "payments are not configured" }, 503);
});

// GET /sessions/:id/recording — admin or the parent: a short-lived link to the Daily recording
sessions.get("/:id/recording", async (c) => {
  const user = await userFromBearer(c.req.header("authorization"));
  if (!user) return c.json({ error: "sign in first" }, 401);
  const sess = await sessionFor(c.req.param("id"));
  if (!sess) return c.json({ error: "not found" }, 404);
  const { data: me } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (me?.role !== "admin" && sess.parent_id !== user.id) return c.json({ error: "not found" }, 404);
  const ids = ((sess.recordings ?? []) as { id: string }[]).map((r) => r.id);
  if (sess.recording_daily_id && !ids.includes(sess.recording_daily_id)) ids.push(sess.recording_daily_id);
  const wanted = c.req.query("id");
  const id = wanted && ids.includes(wanted) ? wanted : sess.recording_daily_id;
  if (!id || sess.recording_status === "deleted") return c.json({ error: "no recording available" }, 404);
  const link = await recordingAccessLink(id);
  return c.json({ url: link.download_link, expires: link.expires });
});
