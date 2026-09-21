import { Hono } from "hono";
import { admin } from "../supabase.js";
import { mux } from "../mux.js";
import { env } from "../env.js";
import { stripe } from "../stripe.js";
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
      const playback = (data.playback_ids as { id: string }[] | undefined)?.[0]?.id ?? null;
      const patch = {
        mux_asset_id: data.id as string,
        mux_playback_id: playback,
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
  let event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig ?? "", env.stripeWebhookSecret);
  } catch (err) {
    console.warn("stripe webhook rejected:", (err as Error).message);
    return c.json({ error: "bad signature" }, 400);
  }
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const orderId = session.metadata?.orderId;
    const sessionId = session.metadata?.sessionId;
    const packId = session.metadata?.packId;
    const pi = typeof session.payment_intent === "string" ? session.payment_intent : null;
    if (sessionId && session.payment_status === "paid") {
      await admin.from("sessions").update({ stripe_payment_intent_id: pi }).eq("id", sessionId).is("paid_at", null);
      await afterPayment(sessionId);
    }
    if (packId && session.payment_status === "paid") {
      await admin.from("session_packs").update({ paid_at: new Date().toISOString(), stripe_payment_intent_id: pi }).eq("id", packId).is("paid_at", null);
    }
    if (orderId && session.payment_status === "paid") {
      const { data: o } = await admin.from("orders").select("id, status").eq("id", orderId).maybeSingle();
      if (o && o.status === "draft") {
        await admin.from("orders").update({
          status: "paid", paid_at: new Date().toISOString(),
          stripe_payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : null,
        }).eq("id", orderId);
        await openJobForOrder(orderId);
      }
    }
  }
  return c.json({ received: true, type: event.type });
});

// Daily: HMAC-signed (X-Webhook-Signature = hex hmac(secret, `${timestamp}.${body}`)).
webhooks.post("/daily", async (c) => {
  const raw = await c.req.text();
  const ts = c.req.header("x-webhook-timestamp") ?? "";
  const sig = c.req.header("x-webhook-signature") ?? "";
  // Daily verifies a new webhook with a ping signed by the secret it only reveals afterwards.
  // Until the secret is configured, acknowledge and process nothing; after that, every event
  // must carry a valid signature.
  const secret = process.env.DAILY_WEBHOOK_SECRET;
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
  const { data: sess } = room ? await admin.from("sessions").select("id, status").eq("daily_room_name", room).maybeSingle() : { data: null };
  if (sess) {
    if (evt.type === "recording.started") await admin.from("sessions").update({ recording_status: "recording" }).eq("id", sess.id);
    if (evt.type === "recording.ready-to-download") {
      await admin.from("sessions").update({ recording_daily_id: evt.payload.recording_id as string, recording_status: "ready" }).eq("id", sess.id);
    }
    if (evt.type === "meeting.ended" && ["scheduled", "in_progress"].includes(sess.status)) await completeSession(sess.id);
  }
  return c.json({ received: true, type: evt.type });
});
