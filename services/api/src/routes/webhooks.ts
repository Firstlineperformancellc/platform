import { Hono } from "hono";
import { admin } from "../supabase.js";
import { mux } from "../mux.js";
import { env } from "../env.js";
import type Stripe from "stripe";
import { stripe } from "../stripe.js";
import { notifyAdmins } from "../billing.js";
import { appUrl } from "../notify.js";
import { openJobForOrder } from "../jobs.js";
import { afterPayment, completeSession } from "./sessions.js";
import { createHmac, timingSafeEqual } from "node:crypto";

// Inbound webhooks. Each provider is verified by signature before anything is written.
//   Mux    (live):   upload.asset_created / asset.ready / asset.errored -> media status
//   Stripe (week 2): checkout.session.completed -> order paid -> job opened
//   Daily  (week 4): recording.ready            -> session recording stored

export const webhooks = new Hono();

webhooks.post("/mux", async (c) => {
  if (!env.muxWebhookSecret) return c.json({ error: "webhook secret not configured" }, 503);
  const raw = await c.req.text();
  let event;
  try {
    event = await mux.webhooks.unwrap(raw, c.req.raw.headers, env.muxWebhookSecret);
  } catch (err) {
    console.warn("mux webhook rejected:", (err as Error).message);
    return c.json({ error: "bad signature" }, 400);
  }

  const data = event.data as Record<string, unknown>;
  switch (event.type) {
    case "video.upload.asset_created": {
      // data.id is the upload id; data.asset_id the new asset
      await admin
        .from("media")
        .update({ mux_asset_id: data.asset_id as string, status: "processing" })
        .eq("mux_upload_id", data.id as string);
      break;
    }
    case "video.asset.ready": {
      const pb = (data.playback_ids as { id: string; policy?: string }[] | undefined)?.[0];
      const playback = pb?.id ?? null;
      const patch = {
        mux_asset_id: data.id as string,
        mux_playback_id: playback,
        mux_playback_policy: pb?.policy === "signed" ? "signed" : "public",
        duration_seconds: (data.duration as number | undefined) ?? null,
        status: "ready" as const,
      };
      const mediaId = data.passthrough as string | undefined;
      const q = admin.from("media").update(patch);
      await (mediaId ? q.eq("id", mediaId) : q.eq("mux_asset_id", data.id as string));
      break;
    }
    case "video.asset.errored": {
      const mediaId = data.passthrough as string | undefined;
      const q = admin.from("media").update({ status: "errored" });
      await (mediaId ? q.eq("id", mediaId) : q.eq("mux_asset_id", data.id as string));
      break;
    }
    case "video.upload.cancelled":
    case "video.upload.errored": {
      await admin.from("media").update({ status: "errored" }).eq("mux_upload_id", data.id as string);
      break;
    }
    default:
      // Other Mux events (e.g. static renditions, tracks) are fine to ignore for now.
      break;
  }
  return c.json({ received: true, type: event.type });
});

// Stripe: verified by signature; checkout.session.completed marks the order paid and opens the job.
webhooks.post("/stripe", async (c) => {
  if (!stripe || !env.stripeWebhookSecret) return c.json({ error: "stripe not configured" }, 503);
  const sig = c.req.header("stripe-signature");
  const raw = await c.req.text();
  // Two endpoints point here: FLP's own account, and events from mentors' connected accounts.
  let event: Stripe.Event | null = null;
  for (const secret of [env.stripeWebhookSecret, env.stripeConnectWebhookSecret]) {
    if (!secret || event) continue;
    try { event = stripe.webhooks.constructEvent(raw, sig ?? "", secret); } catch { /* try the other secret */ }
  }
  if (!event) {
    console.warn("stripe webhook rejected: bad signature");
    return c.json({ error: "bad signature" }, 400);
  }
  // Stripe retries; handle each event once.
  const { error: seen } = await admin.from("stripe_events").insert({ id: event.id, type: event.type });
  if (seen) return c.json({ received: true, duplicate: true });

  try {
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      await onCheckoutPaid(event.data.object);
    } else if (event.type === "checkout.session.expired") {
      await onCheckoutExpired(event.data.object);
    } else if (event.type === "charge.refunded") {
      await onChargeRefunded(event.data.object);
    } else if (event.type === "charge.dispute.created") {
      await onDispute(event.data.object);
    } else if (event.type === "account.updated") {
      const acct = event.data.object;
      await admin.from("athletes").update({ payouts_enabled: Boolean(acct.payouts_enabled) }).eq("stripe_account_id", acct.id);
    }
  } catch (err) {
    // let Stripe retry: forget that we saw it
    await admin.from("stripe_events").delete().eq("id", event.id);
    console.error("stripe webhook failed:", event.type, (err as Error).message);
    return c.json({ error: "handler failed" }, 500);
  }
  return c.json({ received: true, type: event.type });
});

async function onCheckoutPaid(session: Stripe.Checkout.Session) {
  if (session.payment_status !== "paid") return;
  const { orderId, sessionId, packId } = session.metadata ?? {};
  const pi = typeof session.payment_intent === "string" ? session.payment_intent : null;
  if (sessionId) {
    await admin.from("sessions").update({ stripe_payment_intent_id: pi }).eq("id", sessionId).is("paid_at", null);
    await afterPayment(sessionId);
  }
  if (packId) await admin.from("session_packs").update({ paid_at: new Date().toISOString(), stripe_payment_intent_id: pi }).eq("id", packId).is("paid_at", null);
  if (orderId) {
    const { data: o } = await admin.from("orders").select("id, status").eq("id", orderId).maybeSingle();
    if (o && o.status === "draft") {
      await admin.from("orders").update({ status: "paid", paid_at: new Date().toISOString(), stripe_payment_intent_id: pi }).eq("id", orderId);
      await openJobForOrder(orderId);
    }
  }
}

// The parent left checkout without paying: free the Film Room slot and drop the unpaid pack.
async function onCheckoutExpired(session: Stripe.Checkout.Session) {
  const { sessionId, packId } = session.metadata ?? {};
  if (sessionId) await admin.from("sessions").update({ status: "expired", cancel_reason: "checkout was not completed", cancelled_at: new Date().toISOString() }).eq("id", sessionId).eq("status", "requested").is("paid_at", null);
  if (packId) await admin.from("session_packs").delete().eq("id", packId).is("paid_at", null);
}

type Paid = { kind: "order" | "session" | "pack"; id: string; price_cents: number };
async function paymentTarget(paymentIntent: string | null): Promise<Paid | null> {
  if (!paymentIntent) return null;
  const { data: o } = await admin.from("orders").select("id, price_cents").eq("stripe_payment_intent_id", paymentIntent).maybeSingle();
  if (o) return { kind: "order", id: o.id, price_cents: o.price_cents };
  const { data: se } = await admin.from("sessions").select("id, price_cents").eq("stripe_payment_intent_id", paymentIntent).maybeSingle();
  if (se) return { kind: "session", id: se.id, price_cents: se.price_cents };
  const { data: pk } = await admin.from("session_packs").select("id, price_cents").eq("stripe_payment_intent_id", paymentIntent).maybeSingle();
  if (pk) return { kind: "pack", id: pk.id, price_cents: pk.price_cents };
  return null;
}

// A refund made anywhere (the admin panel, or straight in the Stripe dashboard) lands here, so the
// platform's record always matches Stripe's.
async function onChargeRefunded(charge: Stripe.Charge) {
  const target = await paymentTarget(typeof charge.payment_intent === "string" ? charge.payment_intent : null);
  if (!target) return;
  const refunded = charge.amount_refunded ?? 0;
  const full = Boolean(charge.refunded) || refunded >= target.price_cents;
  if (target.kind === "order") {
    await admin.from("orders").update({ refunded_cents: refunded, ...(full ? { status: "refunded", refunded_at: new Date().toISOString() } : {}) }).eq("id", target.id);
    if (full) {
      const { data: jobs } = await admin.from("jobs").select("id").eq("order_id", target.id);
      for (const j of jobs ?? []) await admin.from("payouts").update({ status: "voided", note: "order refunded in full" }).eq("job_id", j.id).in("status", ["owed", "held"]);
    }
  } else if (target.kind === "session") {
    await admin.from("sessions").update({ refunded_cents: refunded, refund_error: null }).eq("id", target.id);
    if (full) await admin.from("payouts").update({ status: "voided", note: "session refunded in full" }).eq("session_id", target.id).in("status", ["owed", "held"]);
  } else {
    await admin.from("session_packs").update({ refunded_cents: refunded }).eq("id", target.id);
  }
  await admin.from("audit_log").insert({ actor_id: null, action: "stripe.refund", target_type: target.kind, target_id: target.id, meta: { refunded_cents: refunded, full, charge: charge.id } });
}

// A card dispute: hold the mentor's money for that sale and tell the admins, who answer it in Stripe.
async function onDispute(dispute: Stripe.Dispute) {
  const target = await paymentTarget(typeof dispute.payment_intent === "string" ? dispute.payment_intent : null);
  if (!target) return;
  if (target.kind === "order") {
    const { data: jobs } = await admin.from("jobs").select("id").eq("order_id", target.id);
    for (const j of jobs ?? []) await admin.from("payouts").update({ status: "held", held_reason: "card dispute" }).eq("job_id", j.id).eq("status", "owed");
  } else if (target.kind === "session") {
    await admin.from("payouts").update({ status: "held", held_reason: "card dispute" }).eq("session_id", target.id).eq("status", "owed");
  }
  await admin.from("audit_log").insert({ actor_id: null, action: "stripe.dispute", target_type: target.kind, target_id: target.id, meta: { dispute: dispute.id, amount: dispute.amount, reason: dispute.reason } });
  await notifyAdmins("stripe.dispute", "A card payment is being disputed",
    `<p>A parent's bank opened a dispute for ${(dispute.amount / 100).toFixed(2)} ${dispute.currency.toUpperCase()} (${dispute.reason}). The mentor's payout for it is on hold. Answer the dispute in the Stripe dashboard before its deadline.</p><p><a href="${appUrl("/admin/ledger")}" style="color:#d4a32c">Open the ledger</a></p>`, target.id);
}

// Daily: HMAC-signed (X-Webhook-Signature = hmac(secret, `${timestamp}.${body}`), base64 or hex).
webhooks.post("/daily", async (c) => {
  const raw = await c.req.text();
  const ts = c.req.header("x-webhook-timestamp") ?? "";
  const sig = c.req.header("x-webhook-signature") ?? "";
  // Daily verifies a new webhook with a ping signed by the secret it only reveals afterwards.
  // Until the secret is configured, acknowledge and process nothing; after that, every event
  // must carry a valid signature.
  const secret = env.dailyWebhookSecret;
  if (!secret) {
    console.log("daily webhook: secret not configured, acknowledged without processing");
    return c.json({ received: true, processed: false });
  }
  if (!sig) return c.json({ error: "missing signature" }, 400);
  // Daily signs `${timestamp}.${body}` with the base64 secret; accept base64 or hex digests.
  const mac = createHmac("sha256", Buffer.from(secret, "base64")).update(`${ts}.${raw}`).digest();
  const ok = [mac.toString("base64"), mac.toString("hex")].some((e) => e.length === sig.length && timingSafeEqual(Buffer.from(sig), Buffer.from(e)));
  if (!ok) return c.json({ error: "bad signature" }, 400);
  const evt = JSON.parse(raw) as { type: string; payload: Record<string, unknown> };
  const room = (evt.payload.room_name ?? evt.payload.room) as string | undefined;
  const { data: sess } = room
    ? await admin.from("sessions").select("id, status, scheduled_at, duration_minutes, recordings").eq("daily_room_name", room).maybeSingle()
    : { data: null };
  if (!sess && env.dailyRelayUrl && room) {
    // Not one of ours: hand it to the other environment exactly as received (same signature).
    fetch(env.dailyRelayUrl, { method: "POST", headers: { "content-type": "application/json", "x-webhook-timestamp": ts, "x-webhook-signature": sig }, body: raw, signal: AbortSignal.timeout(8000) })
      .then((r) => console.log(`daily relay ${room} -> ${r.status}`))
      .catch((e) => console.warn("daily relay failed", (e as Error).message));
    return c.json({ received: true, relayed: true });
  }
  if (sess) {
    if (evt.type === "recording.started") await admin.from("sessions").update({ recording_status: "recording" }).eq("id", sess.id);
    if (evt.type === "recording.ready-to-download") {
      const id = evt.payload.recording_id as string;
      const list = ((sess.recordings ?? []) as { id: string }[]).filter((r) => r.id !== id);
      list.push({ id, ready_at: new Date().toISOString(), duration: evt.payload.duration ?? null } as { id: string });
      await admin.from("sessions").update({ recording_daily_id: id, recording_status: "ready", recordings: list }).eq("id", sess.id);
    }
    // The room empties whenever both sides drop, including a mid-session reconnect, so only
    // treat it as the end once the booked time is essentially over; the tick closes the rest.
    if (evt.type === "meeting.ended" && ["scheduled", "in_progress"].includes(sess.status)) {
      const ends = new Date(sess.scheduled_at!).getTime() + (sess.duration_minutes ?? 30) * 60000;
      if (Date.now() >= ends - 5 * 60000) await completeSession(sess.id);
    }
  }
  return c.json({ received: true, type: evt.type });
});
