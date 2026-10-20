import { Hono } from "hono";
import { admin, userFromBearer } from "../supabase.js";
import { getSettings, paymentPath, presentsRules, presentsSplit } from "../settings.js";
import { stripe, stripeConfigured } from "../stripe.js";
import { env } from "../env.js";
import { appUrl, notify } from "../notify.js";
import { mux, muxSigningConfigured } from "../mux.js";
import { checkoutDownMessage, providerFailed } from "../failures.js";
import { notifyAdmins, refundPayment } from "../billing.js";
import {
  ATHLETE_VIEW_COLS, afterPresentsPaid, closeWithRefund, contactIn, deliverRequest, flagsIn, loadRequest, money, newShareToken,
  PRESENTS_REQUEST_COLS, esc, sendRequest, tellAthleteNewRequest, tellBuyer, tokenMatches, type PresentsRequest,
} from "../presents.js";

// First Line Presents. Buying needs no account: a public buyer gives an email and gets a private link.
// The athlete side and the admin side are signed in. Every write to presents_requests happens here.
export const presents = new Hono();

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[<>]/g, "").trim().slice(0, max) : ""); // no markup in anything we email

async function requireAdmin(authorization: string | undefined) {
  const user = await userFromBearer(authorization);
  if (!user) return null;
  const { data } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  return data?.role === "admin" ? user : null;
}
async function audit(actorId: string | null, action: string, targetId: string, meta: Record<string, unknown> = {}) {
  await admin.from("audit_log").insert({ actor_id: actorId, action, target_type: "presents_request", target_id: targetId, meta });
}

// The buyer's side of a request is open to: the share token, the signed-in buyer, or an admin.
async function buyerAccess(c: { req: { header: (k: string) => string | undefined; query: (k: string) => string | undefined } }, r: PresentsRequest) {
  if (tokenMatches(c.req.query("t"), r.share_token)) return true;
  const user = await userFromBearer(c.req.header("authorization"));
  if (!user) return false;
  if (r.buyer_id && r.buyer_id === user.id) return true;
  const { data } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  return data?.role === "admin";
}

// What a buyer (or anyone holding the link) gets to see: no athlete contact details, no internal notes.
function buyerShape(r: PresentsRequest, athlete: { display_name: string; slug: string; photo_path: string | null } | null, problemDays: number) {
  const problemOpen = r.status === "delivered" && r.delivered_at ? Date.now() - new Date(r.delivered_at).getTime() < problemDays * 86400000 : false;
  return {
    id: r.id, status: r.status, recipient_name: r.recipient_name, occasion: r.occasion, from_name: r.from_name, instructions: r.instructions, team: r.team,
    price_cents: r.price_cents, refunded_cents: r.refunded_cents, currency: r.currency, paid_at: r.paid_at, due_at: r.due_at, delivered_at: r.delivered_at,
    video_media_id: r.status === "delivered" ? r.video_media_id : null, rating: r.rating, problem_text: r.problem_text, problem_at: r.problem_at, can_report: problemOpen && !r.problem_at,
    created_at: r.created_at, athlete: athlete ? { display_name: athlete.display_name, slug: athlete.slug, photo_path: athlete.photo_path } : null,
  };
}

// POST /presents/requests — anyone. { slug, recipientName, recipientMinor, occasion, fromName, instructions, team, buyerEmail?, buyerName? }
presents.post("/requests", async (c) => {
  const s = await getSettings();
  const rules = presentsRules(s);
  if (!rules.enabled) return c.json({ error: "First Line Presents isn't taking requests right now" }, 503);
  const user = await userFromBearer(c.req.header("authorization"));
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const slug = str(body.slug, 120);
  const recipientName = str(body.recipientName, 60);
  const occasion = str(body.occasion, 60);
  const fromName = str(body.fromName, 80);
  const instructions = str(body.instructions, 500);
  const team = str(body.team, 80);
  const buyerName = str(body.buyerName, 120);
  const buyerEmail = (user?.email ?? str(body.buyerEmail, 200)).toLowerCase();
  const recipientMinor = body.recipientMinor === true;
  if (!slug) return c.json({ error: "pick an athlete" }, 400);
  if (!recipientName) return c.json({ error: "who is the video for? First name only." }, 400);
  if (/\s/.test(recipientName) && recipientName.split(/\s+/).length > 2) return c.json({ error: "first name only, please; the athlete doesn't need a last name" }, 400);
  if (!occasion || !rules.occasions.includes(occasion)) return c.json({ error: "pick an occasion from the list" }, 400);
  if (!instructions) return c.json({ error: "tell the athlete what to say" }, 400);
  if (!EMAIL.test(buyerEmail)) return c.json({ error: "enter the email address the video should go to" }, 400);
  if (body.recipientMinor !== true && body.recipientMinor !== false) return c.json({ error: "tell us whether the recipient is under 18" }, 400);
  // Presents are bought by adults. A signed-in parent already is one; a guest says so.
  if (!user && body.buyerAdult !== true) return c.json({ error: "First Line Presents is bought by adults. Tick the box to confirm you're 18 or over; a parent or guardian can order for a young player." }, 400);
  for (const [field, text] of [["recipient's name", recipientName], ["from name", fromName], ["message", instructions], ["team", team]] as const) {
    const found = contactIn(text);
    if (found) return c.json({ error: `Leave ${found} out of the ${field}. The athlete only records a video, so there's nothing to reply to.` }, 400);
  }
  const { data: p } = await admin.from("presents_providers").select("user_id, display_name, price_cents, days, available, paused, occasions").eq("slug", slug).maybeSingle();
  if (!p) return c.json({ error: "that athlete isn't offering First Line Presents" }, 404);
  if (!p.available) return c.json({ error: `${p.display_name} isn't taking requests right now` }, 409);
  if (Array.isArray(p.occasions) && p.occasions.length && !p.occasions.includes(occasion)) return c.json({ error: `${p.display_name} doesn't do ${occasion.toLowerCase()} videos; pick another occasion` }, 400);
  const price = Number(p.price_cents);
  const split = presentsSplit(price, rules.sharePct);
  const flags = flagsIn(`${recipientName} ${fromName} ${instructions} ${team}`, rules.blocklist);
  const { data: row, error } = await admin.from("presents_requests").insert({
    athlete_id: p.user_id, buyer_id: user?.id ?? null, buyer_email: buyerEmail, buyer_name: buyerName,
    recipient_name: recipientName, recipient_minor: recipientMinor, occasion, from_name: fromName, instructions, team,
    status: "draft", price_cents: price, athlete_share_cents: split.athlete, currency: s.currency, share_token: newShareToken(), flags,
  }).select("id, share_token").single();
  if (error || !row) return c.json({ error: error?.message ?? "could not create the request" }, 500);

  const path = paymentPath(s, stripeConfigured, env.appEnv);
  if (path === "stripe" && stripe) {
    let session: Awaited<ReturnType<typeof stripe.checkout.sessions.create>>;
    try {
      session = await stripe.checkout.sessions.create({
        mode: "payment",
        customer_email: buyerEmail,
        line_items: [{ quantity: 1, price_data: { currency: s.currency, unit_amount: price, product_data: { name: `First Line Presents · video from ${p.display_name}` } } }],
        metadata: { presentsId: row.id },
        client_reference_id: row.id,
        payment_intent_data: { metadata: { presentsId: row.id }, transfer_group: `presents_${row.id}`, receipt_email: buyerEmail, description: `First Line Presents ${row.id}` },
        expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
        success_url: appUrl(`/presents/view?r=${row.id}&t=${row.share_token}&paid=1`),
        cancel_url: appUrl(`/presents/${slug}?cancelled=1`),
      });
    } catch (err) {
      const ref = await providerFailed("checkout", "Checkout for a First Line Presents request", err, { id: row.id, buyer: buyerEmail, athlete: slug, amount_cents: price });
      return c.json({ error: checkoutDownMessage(ref), code: "checkout_unavailable", ref }, 502);
    }
    await admin.from("presents_requests").update({ stripe_checkout_session_id: session.id }).eq("id", row.id);
    return c.json({ requestId: row.id, token: row.share_token, checkoutUrl: session.url });
  }
  if (path === "free") {
    await afterPresentsPaid(row.id, null);
    return c.json({ requestId: row.id, token: row.share_token, devPaid: true });
  }
  return c.json({ error: "payments are not configured" }, 503);
});

// GET /presents/requests/mine — a signed-in buyer's requests (parents see them in the app).
presents.get("/requests/mine", async (c) => {
  const user = await userFromBearer(c.req.header("authorization"));
  if (!user) return c.json({ error: "sign in first" }, 401);
  const rules = presentsRules(await getSettings());
  const { data } = await admin.from("presents_requests").select(PRESENTS_REQUEST_COLS).eq("buyer_id", user.id).neq("status", "draft").order("created_at", { ascending: false }).limit(100);
  const rows = (data ?? []) as PresentsRequest[];
  const ids = [...new Set(rows.map((r) => r.athlete_id))];
  const { data: aths } = ids.length ? await admin.from("athletes").select("user_id, display_name, slug, photo_path").in("user_id", ids) : { data: [] };
  const by = new Map((aths ?? []).map((a) => [a.user_id, a]));
  return c.json({ requests: rows.map((r) => ({ ...buyerShape(r, by.get(r.athlete_id) ?? null, rules.problemDays), token: r.share_token })) });
});

// GET /presents/requests/:id?t=token — the buyer's view.
presents.get("/requests/:id", async (c) => {
  const r = await loadRequest(c.req.param("id"));
  if (!r || !(await buyerAccess(c, r))) return c.json({ error: "not found" }, 404);
  const rules = presentsRules(await getSettings());
  const { data: a } = await admin.from("athletes").select("display_name, slug, photo_path").eq("user_id", r.athlete_id).maybeSingle();
  return c.json({ request: buyerShape(r, a, rules.problemDays) });
});

// GET /presents/requests/:id/playback?t=token — tokens to watch and download the delivered video.
presents.get("/requests/:id/playback", async (c) => {
  const r = await loadRequest(c.req.param("id"));
  if (!r || !(await buyerAccess(c, r))) return c.json({ error: "not found" }, 404);
  if (r.status !== "delivered" || !r.video_media_id) return c.json({ ready: false, status: r.status });
  const { data: m } = await admin.from("media").select("status, mux_playback_id, mux_playback_policy").eq("id", r.video_media_id).maybeSingle();
  if (!m || m.status !== "ready" || !m.mux_playback_id) return c.json({ ready: false, status: m?.status ?? "missing" });
  const id = m.mux_playback_id as string;
  if (m.mux_playback_policy !== "signed") return c.json({ ready: true, playbackId: id, policy: "public", tokens: null, mp4Url: `https://stream.mux.com/${id}/highest.mp4` });
  if (!muxSigningConfigured) return c.json({ error: "playback signing is not configured on this server" }, 503);
  const [video, thumbnail, storyboard] = await Promise.all([
    mux.jwt.signPlaybackId(id, { type: "video", expiration: "2h" }),
    mux.jwt.signPlaybackId(id, { type: "thumbnail", expiration: "2h" }),
    mux.jwt.signPlaybackId(id, { type: "storyboard", expiration: "2h" }),
  ]);
  return c.json({ ready: true, playbackId: id, policy: "signed", tokens: { playback: video, thumbnail, storyboard }, mp4Url: `https://stream.mux.com/${id}/highest.mp4?token=${video}` });
});

// POST /presents/requests/:id/problem?t=token { text } — within the problem window after delivery.
presents.post("/requests/:id/problem", async (c) => {
  const r = await loadRequest(c.req.param("id"));
  if (!r || !(await buyerAccess(c, r))) return c.json({ error: "not found" }, 404);
  const rules = presentsRules(await getSettings());
  if (r.status !== "delivered" || !r.delivered_at) return c.json({ error: "only a delivered video can be reported" }, 400);
  if (Date.now() - new Date(r.delivered_at).getTime() > rules.problemDays * 86400000) return c.json({ error: `problems can be reported within ${rules.problemDays} days of delivery` }, 400);
  if (r.problem_at) return c.json({ error: "this video was already reported; FLP is on it" }, 409);
  const body = (await c.req.json().catch(() => ({}))) as { text?: unknown };
  const text = str(body.text, 1000);
  if (text.length < 10) return c.json({ error: "tell us what went wrong, in a sentence or two" }, 400);
  await admin.from("presents_requests").update({ problem_text: text, problem_at: new Date().toISOString() }).eq("id", r.id);
  await admin.from("payouts").update({ status: "held", held_reason: "buyer reported a problem" }).eq("presents_request_id", r.id).eq("status", "owed");
  await notifyAdmins("presents.problem", "A family reported a problem with a Presents video", `<p>${esc(text)}</p><p>The athlete's payout is on hold until you decide.</p><p><a href="${appUrl("/admin/presents")}" style="color:#d4a32c">Open First Line Presents</a></p>`, r.id);
  await audit(null, "presents.problem", r.id, { text });
  return c.json({ ok: true });
});

// POST /presents/requests/:id/rating?t=token { rating }
presents.post("/requests/:id/rating", async (c) => {
  const r = await loadRequest(c.req.param("id"));
  if (!r || !(await buyerAccess(c, r))) return c.json({ error: "not found" }, 404);
  if (r.status !== "delivered") return c.json({ error: "rate the video once it's delivered" }, 400);
  const body = (await c.req.json().catch(() => ({}))) as { rating?: unknown };
  const n = Number(body.rating);
  if (!Number.isInteger(n) || n < 1 || n > 5) return c.json({ error: "rating must be 1 to 5" }, 400);
  await admin.from("presents_requests").update({ rating: n }).eq("id", r.id);
  return c.json({ ok: true });
});

// --- The athlete's side ---------------------------------------------------------------------------

type Owned = { error: { status: 401 | 404; error: string }; user?: undefined; r?: undefined } | { error?: undefined; user: { id: string }; r: PresentsRequest };
async function athleteOwned(c: { req: { header: (k: string) => string | undefined; param: (k: string) => string } }): Promise<Owned> {
  const user = await userFromBearer(c.req.header("authorization"));
  if (!user) return { error: { status: 401, error: "sign in first" } };
  const r = await loadRequest(c.req.param("id"));
  if (!r || r.athlete_id !== user.id) return { error: { status: 404, error: "not found" } };
  return { user, r };
}

// GET /presents/mine — the athlete's requests, never the buyer. Flagged requests hide their text until FLP releases them.
presents.get("/mine", async (c) => {
  const user = await userFromBearer(c.req.header("authorization"));
  if (!user) return c.json({ error: "sign in first" }, 401);
  const { data } = await admin.from("presents_requests").select(ATHLETE_VIEW_COLS).eq("athlete_id", user.id).neq("status", "draft").order("created_at", { ascending: false }).limit(200);
  const rows = (data ?? []).map((r) => (r.status === "flagged" ? { ...r, instructions: "", from_name: "", team: "", held: true } : { ...r, held: false }));
  return c.json({ requests: rows });
});

// POST /presents/requests/:id/decline { reason }
presents.post("/requests/:id/decline", async (c) => {
  const got = await athleteOwned(c);
  if (got.error) return c.json({ error: got.error.error }, got.error.status);
  const { r, user } = got;
  if (!["open", "flagged"].includes(r.status)) return c.json({ error: `this request is ${r.status}` }, 400);
  const body = (await c.req.json().catch(() => ({}))) as { reason?: unknown };
  const reason = str(body.reason, 300) || "declined by the athlete";
  const { refundError } = await closeWithRefund(r, "declined", reason, "declined");
  await audit(user.id, "presents.decline", r.id, { reason, refundError });
  return c.json({ ok: true });
});

// POST /presents/requests/:id/video { mediaId } — attach the uploaded recording (it may still be processing).
presents.post("/requests/:id/video", async (c) => {
  const got = await athleteOwned(c);
  if (got.error) return c.json({ error: got.error.error }, got.error.status);
  const { r, user } = got;
  if (r.status !== "open") return c.json({ error: r.status === "flagged" ? "FLP is still looking at this request" : r.status === "in_review" ? "FLP is checking the video you sent; wait for the result" : `this request is ${r.status}` }, 400);
  const body = (await c.req.json().catch(() => ({}))) as { mediaId?: unknown };
  const mediaId = str(body.mediaId, 60);
  const { data: m } = await admin.from("media").select("id, owner_id, purpose").eq("id", mediaId).maybeSingle();
  if (!m || m.owner_id !== user.id || m.purpose !== "presents_video") return c.json({ error: "that video isn't one of yours" }, 400);
  await admin.from("presents_requests").update({ video_media_id: mediaId }).eq("id", r.id);
  return c.json({ ok: true });
});

// POST /presents/requests/:id/send — deliver the attached video, or hand it to FLP for a check.
presents.post("/requests/:id/send", async (c) => {
  const got = await athleteOwned(c);
  if (got.error) return c.json({ error: got.error.error }, got.error.status);
  const { r, user } = got;
  if (r.status !== "open") return c.json({ error: r.status === "in_review" ? "FLP is checking the video you sent; wait for the result" : `this request is ${r.status}` }, 400);
  if (!r.video_media_id) return c.json({ error: "upload the video first" }, 400);
  const res = await sendRequest(r, r.video_media_id);
  if (!res.ok) return c.json({ error: res.error }, 400);
  await audit(user.id, "presents.send", r.id, { status: res.status });
  return c.json({ ok: true, status: res.status });
});

// --- Admin ------------------------------------------------------------------------------------------

// GET /presents/admin?status=in_review|flagged|open|delivered|all
presents.get("/admin", async (c) => {
  const me = await requireAdmin(c.req.header("authorization"));
  if (!me) return c.json({ error: "admin only" }, 403);
  const status = c.req.query("status") ?? "all";
  let q = admin.from("presents_requests").select(PRESENTS_REQUEST_COLS).neq("status", "draft").order("created_at", { ascending: false }).limit(300);
  if (status !== "all") q = q.eq("status", status);
  const { data } = await q;
  const rows = (data ?? []) as PresentsRequest[];
  const ids = [...new Set(rows.map((r) => r.athlete_id))];
  const { data: aths } = ids.length ? await admin.from("athletes").select("user_id, display_name, slug").in("user_id", ids) : { data: [] };
  const by = new Map((aths ?? []).map((a) => [a.user_id, a]));
  return c.json({ requests: rows.map((r) => ({ ...r, athlete: by.get(r.athlete_id) ?? null, view_url: appUrl(`/presents/view?r=${r.id}&t=${r.share_token}`) })) });
});

// GET /presents/admin/:id/playback — FLP watches a video in any state (the check before delivery).
presents.get("/admin/:id/playback", async (c) => {
  const me = await requireAdmin(c.req.header("authorization"));
  if (!me) return c.json({ error: "admin only" }, 403);
  const r = await loadRequest(c.req.param("id"));
  if (!r || !r.video_media_id) return c.json({ ready: false, status: r?.status ?? "missing" });
  const { data: m } = await admin.from("media").select("status, mux_playback_id, mux_playback_policy").eq("id", r.video_media_id).maybeSingle();
  if (!m || m.status !== "ready" || !m.mux_playback_id) return c.json({ ready: false, status: m?.status ?? "missing" });
  const id = m.mux_playback_id as string;
  if (m.mux_playback_policy !== "signed") return c.json({ ready: true, playbackId: id, policy: "public", tokens: null, mp4Url: `https://stream.mux.com/${id}/highest.mp4` });
  if (!muxSigningConfigured) return c.json({ error: "playback signing is not configured on this server" }, 503);
  const [video, thumbnail, storyboard] = await Promise.all([
    mux.jwt.signPlaybackId(id, { type: "video", expiration: "2h" }),
    mux.jwt.signPlaybackId(id, { type: "thumbnail", expiration: "2h" }),
    mux.jwt.signPlaybackId(id, { type: "storyboard", expiration: "2h" }),
  ]);
  return c.json({ ready: true, playbackId: id, policy: "signed", tokens: { playback: video, thumbnail, storyboard }, mp4Url: `https://stream.mux.com/${id}/highest.mp4?token=${video}` });
});

// POST /presents/admin/:id/approve — deliver a video that was waiting for FLP's check.
presents.post("/admin/:id/approve", async (c) => {
  const me = await requireAdmin(c.req.header("authorization"));
  if (!me) return c.json({ error: "admin only" }, 403);
  const r = await loadRequest(c.req.param("id"));
  if (!r) return c.json({ error: "not found" }, 404);
  if (r.status !== "in_review" || !r.video_media_id) return c.json({ error: "nothing is waiting for approval on this request" }, 400);
  const delivered = await deliverRequest(r, me.id);
  if (!delivered) return c.json({ error: "this request changed while you were looking; reload" }, 409);
  await audit(me.id, "presents.approve", r.id);
  return c.json({ ok: true });
});

// POST /presents/admin/:id/reject { note } — send the video back to the athlete to re-record.
presents.post("/admin/:id/reject", async (c) => {
  const me = await requireAdmin(c.req.header("authorization"));
  if (!me) return c.json({ error: "admin only" }, 403);
  const r = await loadRequest(c.req.param("id"));
  if (!r) return c.json({ error: "not found" }, 404);
  if (r.status !== "in_review") return c.json({ error: "nothing is waiting for approval on this request" }, 400);
  const body = (await c.req.json().catch(() => ({}))) as { note?: unknown };
  const note = str(body.note, 500) || "Please re-record this one.";
  // Give the athlete two more days so FLP's review time never costs them the request.
  const due = new Date(Math.max(Date.now(), r.due_at ? new Date(r.due_at).getTime() : 0) + 2 * 86400000).toISOString();
  await admin.from("presents_requests").update({ status: "open", video_media_id: null, review_note: note, reviewed_by: me.id, reviewed_at: new Date().toISOString(), due_at: due, reminded: 0 }).eq("id", r.id);
  await notify(r.athlete_id, "presents.rerecord", "Please re-record a First Line Presents video",
    `<p>FLP looked at your video for ${esc(r.recipient_name)} and asked for another take: <i>${esc(note)}</i></p><p>You have until ${new Date(due).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "America/New_York" })}.</p><p><a href="${appUrl("/athlete/presents")}" style="color:#d4a32c">Open your requests</a></p>`, { targetId: r.id });
  await audit(me.id, "presents.reject", r.id, { note });
  return c.json({ ok: true });
});

// POST /presents/admin/:id/release — a flagged request is fine; let the athlete see it.
presents.post("/admin/:id/release", async (c) => {
  const me = await requireAdmin(c.req.header("authorization"));
  if (!me) return c.json({ error: "admin only" }, 403);
  const r = await loadRequest(c.req.param("id"));
  if (!r) return c.json({ error: "not found" }, 404);
  if (r.status !== "flagged") return c.json({ error: "this request isn't held" }, 400);
  // FLP's review time never counts against the athlete: their window starts now.
  const { data: ath } = await admin.from("athletes").select("presents_days").eq("user_id", r.athlete_id).maybeSingle();
  const due = new Date(Date.now() + (ath?.presents_days ?? 7) * 86400000).toISOString();
  await admin.from("presents_requests").update({ status: "open", due_at: due, reminded: 0, reviewed_by: me.id, reviewed_at: new Date().toISOString() }).eq("id", r.id);
  await tellAthleteNewRequest({ ...r, status: "open", due_at: due });
  await audit(me.id, "presents.release", r.id);
  return c.json({ ok: true });
});

// POST /presents/admin/:id/refund { amountCents?, reason } — partial keeps the request as it is; full closes it.
presents.post("/admin/:id/refund", async (c) => {
  const me = await requireAdmin(c.req.header("authorization"));
  if (!me) return c.json({ error: "admin only" }, 403);
  const r = await loadRequest(c.req.param("id"));
  if (!r) return c.json({ error: "not found" }, 404);
  if (!r.paid_at) return c.json({ error: "this request was never paid" }, 400);
  const body = (await c.req.json().catch(() => ({}))) as { amountCents?: unknown; reason?: unknown };
  const reason = str(body.reason, 300);
  const left = r.price_cents - r.refunded_cents;
  if (left <= 0) return c.json({ error: "already refunded in full" }, 400);
  const amount = body.amountCents === undefined || body.amountCents === null || body.amountCents === "" ? left : Math.round(Number(body.amountCents));
  if (!Number.isInteger(amount) || amount <= 0 || amount > left) return c.json({ error: `the refund must be between $0.01 and ${money(left)}` }, 400);
  if (amount === left) {
    const { refundError } = await closeWithRefund(r, r.status === "delivered" ? "refunded" : "cancelled", reason || "refunded by FLP", `admin_${r.refunded_cents + amount}`);
    if (refundError) return c.json({ error: `Stripe refused the refund: ${refundError}` }, 502);
    await audit(me.id, "presents.refund", r.id, { amount, full: true, reason });
    return c.json({ ok: true, full: true, refundedCents: amount });
  }
  if (r.stripe_payment_intent_id) {
    const res = await refundPayment(r.stripe_payment_intent_id, amount, `presents_${r.id}_${r.refunded_cents + amount}`);
    if (!res.ok) return c.json({ error: `Stripe refused the refund: ${res.error}` }, 502);
  }
  await admin.from("presents_requests").update({ refunded_cents: r.refunded_cents + amount }).eq("id", r.id);
  await tellBuyer(r, "presents.partial_refund", "A partial refund on your First Line Presents request", `<p>FLP refunded ${money(amount)}${reason ? `: ${reason}` : "."} It can take a few business days to show on your statement.</p>`);
  await audit(me.id, "presents.refund", r.id, { amount, full: false, reason });
  return c.json({ ok: true, full: false, refundedCents: amount });
});

// POST /presents/admin/:id/resolve — close a problem report without a refund (payout released).
presents.post("/admin/:id/resolve", async (c) => {
  const me = await requireAdmin(c.req.header("authorization"));
  if (!me) return c.json({ error: "admin only" }, 403);
  const r = await loadRequest(c.req.param("id"));
  if (!r) return c.json({ error: "not found" }, 404);
  await admin.from("payouts").update({ status: "owed", held_reason: null }).eq("presents_request_id", r.id).eq("status", "held").eq("held_reason", "buyer reported a problem");
  await admin.from("presents_requests").update({ review_note: "problem reviewed by FLP, no refund" }).eq("id", r.id);
  await audit(me.id, "presents.resolve", r.id);
  return c.json({ ok: true });
});
