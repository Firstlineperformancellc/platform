import { Hono } from "hono";
import { admin, userFromBearer } from "../supabase.js";
import { latestRun, recordRun } from "../health.js";

// Admin-only: run the Service Health checks now, or read the latest run.
export const health = new Hono();

async function requireAdmin(authorization: string | undefined) {
  const user = await userFromBearer(authorization);
  if (!user) return null;
  const { data } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  return data?.role === "admin" ? user : null;
}

health.post("/run", async (c) => {
  const me = await requireAdmin(c.req.header("authorization"));
  if (!me) return c.json({ error: "admin only" }, 403);
  const run = await recordRun("manual");
  await admin.from("audit_log").insert({ actor_id: me.id, action: "health.run", target_type: "service_health_run", target_id: run.id, meta: { overall: run.overall } });
  return c.json({ ok: true, run });
});

health.get("/latest", async (c) => {
  const me = await requireAdmin(c.req.header("authorization"));
  if (!me) return c.json({ error: "admin only" }, 403);
  return c.json({ run: await latestRun() });
});
