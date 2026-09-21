import { Hono } from "hono";
import { admin } from "../supabase.js";
import { mux } from "../mux.js";
import { env } from "../env.js";
import { stripe } from "../stripe.js";
import { openJobForOrder } from "../jobs.js";

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

webhooks.post("/daily", async (c) => {
  console.log("daily webhook received (not yet verified)");
  return c.json({ received: true });
});
