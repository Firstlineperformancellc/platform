import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { env } from "./env.js";
import { admin } from "./supabase.js";
import { uploads } from "./routes/uploads.js";
import { webhooks } from "./routes/webhooks.js";
import { orders } from "./routes/orders.js";
import { internal, jobs } from "./routes/jobs.js";

const app = new Hono();

app.use("*", logger());

// Only the app's own origins may call the API from a browser. Webhooks are server-to-server.
const ORIGINS = [
  "http://localhost:8081",
  "https://dev.firstlineperform.com",
  "https://app.firstlineperform.com",
  "https://firstlineperform.com",
];
app.use(
  "*",
  cors({
    origin: (origin) => (ORIGINS.includes(origin) ? origin : ""),
    allowHeaders: ["authorization", "content-type"],
    allowMethods: ["GET", "POST", "OPTIONS"],
    maxAge: 600,
  }),
);

app.get("/", (c) => c.json({ service: "flp-api", env: env.appEnv }));

// Liveness plus a real database round-trip, so the uptime check means something.
app.get("/health", async (c) => {
  const { error } = await admin.from("settings").select("id").eq("id", 1).maybeSingle();
  if (error) return c.json({ ok: false, db: error.message }, 503);
  return c.json({ ok: true, env: env.appEnv, time: new Date().toISOString() });
});

app.route("/uploads", uploads);
app.route("/orders", orders);
app.route("/jobs", jobs);
app.route("/internal", internal);
app.route("/webhooks", webhooks);

app.notFound((c) => c.json({ error: "not found" }, 404));
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "internal error" }, 500);
});

serve({ fetch: app.fetch, port: env.port, hostname: "127.0.0.1" }, (info) => {
  console.log(`flp-api (${env.appEnv}) listening on 127.0.0.1:${info.port}`);
});
