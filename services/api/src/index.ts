import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { env } from "./env.js";
import { admin } from "./supabase.js";
import { webhooks } from "./routes/webhooks.js";

const app = new Hono();

app.use("*", logger());

app.get("/", (c) => c.json({ service: "flp-api", env: env.appEnv }));

// Liveness plus a real database round-trip, so the uptime check means something.
app.get("/health", async (c) => {
  const { error } = await admin.from("settings").select("id").eq("id", 1).maybeSingle();
  if (error) return c.json({ ok: false, db: error.message }, 503);
  return c.json({ ok: true, env: env.appEnv, time: new Date().toISOString() });
});

app.route("/webhooks", webhooks);

app.notFound((c) => c.json({ error: "not found" }, 404));
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "internal error" }, 500);
});

serve({ fetch: app.fetch, port: env.port, hostname: "127.0.0.1" }, (info) => {
  console.log(`flp-api (${env.appEnv}) listening on 127.0.0.1:${info.port}`);
});
