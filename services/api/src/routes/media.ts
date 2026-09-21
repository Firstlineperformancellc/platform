import { Hono } from "hono";
import { admin, userFromBearer } from "../supabase.js";
import { mux, muxSigningConfigured } from "../mux.js";

// GET /media/:id/playback — who may watch this video, and the tokens to do it.
// Owner, admin, the mentor holding the job the film belongs to, or the parent the breakdown was
// delivered to. Signed assets get two-hour playback/thumbnail/storyboard tokens; public assets none.
export const media = new Hono();

async function mayWatch(userId: string, m: { id: string; owner_id: string }) {
  if (m.owner_id === userId) return true;
  const { data: me } = await admin.from("profiles").select("role").eq("id", userId).maybeSingle();
  if (me?.role === "admin") return true;
  const { data: film } = await admin
    .from("orders").select("id, jobs(athlete_id, status)").eq("film_media_id", m.id);
  for (const o of (film ?? []) as unknown as { jobs: { athlete_id: string | null; status: string } | { athlete_id: string | null; status: string }[] | null }[]) {
    const js = Array.isArray(o.jobs) ? o.jobs : o.jobs ? [o.jobs] : [];
    if (js.some((j) => j.athlete_id === userId && ["accepted", "delivered", "closed"].includes(j.status))) return true;
  }
  const { data: bds } = await admin.from("breakdowns").select("id, jobs(orders(parent_id))").eq("media_id", m.id);
  for (const b of (bds ?? []) as unknown as { jobs: { orders: { parent_id: string } | null } | null }[]) {
    if (b.jobs?.orders?.parent_id === userId) return true;
  }
  return false;
}

media.get("/:id/playback", async (c) => {
  const user = await userFromBearer(c.req.header("authorization"));
  if (!user) return c.json({ error: "sign in first" }, 401);
  const { data: m } = await admin.from("media").select("id, owner_id, status, mux_playback_id, mux_playback_policy, purpose").eq("id", c.req.param("id")).maybeSingle();
  if (!m || !(await mayWatch(user.id, m))) return c.json({ error: "not found" }, 404);
  if (m.status !== "ready" || !m.mux_playback_id) return c.json({ ready: false, status: m.status });
  const id = m.mux_playback_id as string;
  if (m.mux_playback_policy !== "signed") {
    return c.json({ ready: true, playbackId: id, policy: "public", tokens: null, mp4Url: `https://stream.mux.com/${id}/highest.mp4` });
  }
  if (!muxSigningConfigured) return c.json({ error: "playback signing is not configured on this server" }, 503);
  const [video, thumbnail, storyboard] = await Promise.all([
    mux.jwt.signPlaybackId(id, { type: "video", expiration: "2h" }),
    mux.jwt.signPlaybackId(id, { type: "thumbnail", expiration: "2h" }),
    mux.jwt.signPlaybackId(id, { type: "storyboard", expiration: "2h" }),
  ]);
  return c.json({
    ready: true, playbackId: id, policy: "signed",
    tokens: { playback: video, thumbnail, storyboard },
    mp4Url: m.purpose === "game_film" ? `https://stream.mux.com/${id}/highest.mp4?token=${video}` : null,
  });
});
