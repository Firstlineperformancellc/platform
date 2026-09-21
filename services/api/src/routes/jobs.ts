import { Hono } from "hono";
import { userFromBearer } from "../supabase.js";
import { respondToOffer, tick } from "../jobs.js";
import { sessionsTick } from "../sessionsTick.js";

export const jobs = new Hono();

// Mentor accepts or declines an open offer. The acceptance starts the turnaround clock.
jobs.post("/:id/accept", async (c) => {
  const user = await userFromBearer(c.req.header("authorization"));
  if (!user) return c.json({ error: "sign in first" }, 401);
  try {
    await respondToOffer(c.req.param("id"), user.id, "accepted");
    return c.json({ ok: true });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400);
  }
});

jobs.post("/:id/decline", async (c) => {
  const user = await userFromBearer(c.req.header("authorization"));
  if (!user) return c.json({ error: "sign in first" }, 401);
  try {
    await respondToOffer(c.req.param("id"), user.id, "declined");
    return c.json({ ok: true });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400);
  }
});

// The timer on the droplet calls this every few minutes with a shared secret.
export const internal = new Hono();
internal.get("/tick", async (c) => {
  const secret = process.env.TICK_SECRET;
  if (!secret || c.req.header("x-tick-secret") !== secret) return c.json({ error: "forbidden" }, 403);
  const report = await tick();
  const sessionReport = await sessionsTick();
  return c.json({ ok: true, ...report, sessions: sessionReport, at: new Date().toISOString() });
});
