import { Hono } from "hono";

// Inbound webhooks land here. Each provider gets signature verification when it is wired in:
//   Stripe (week 2): checkout.session.completed -> order paid -> job opened
//   Mux    (week 2): video.asset.ready          -> media ready
//   Daily  (week 4): recording.ready            -> session recording stored
// Until then every route acknowledges and logs, so provider dashboards show green while we build.

export const webhooks = new Hono();

webhooks.post("/stripe", async (c) => {
  console.log("stripe webhook received (not yet verified)");
  return c.json({ received: true });
});

webhooks.post("/mux", async (c) => {
  console.log("mux webhook received (not yet verified)");
  return c.json({ received: true });
});

webhooks.post("/daily", async (c) => {
  console.log("daily webhook received (not yet verified)");
  return c.json({ received: true });
});
