import { Hono } from "hono";
import { admin, userFromBearer } from "../supabase.js";
import { mux, muxConfigured, muxSigningConfigured } from "../mux.js";

// POST /uploads — a signed-in user asks for somewhere to put a video.
// We create the media row first (so the file is owned before a byte moves), then ask Mux for a
// resumable direct-upload URL that the browser or app uploads to straight from the device.
// Mux calls /webhooks/mux as the asset is created and becomes ready; that is what flips status.

type Purpose = "game_film" | "breakdown" | "intro_video";
const DAY = 60 * 60 * 24;

export const uploads = new Hono();

uploads.post("/", async (c) => {
  const user = await userFromBearer(c.req.header("authorization"));
  if (!user) return c.json({ error: "sign in first" }, 401);
  if (!muxConfigured) return c.json({ error: "video uploads are not configured on this server" }, 503);

  const body = (await c.req.json().catch(() => ({}))) as { purpose?: Purpose; title?: string };
  const purpose: Purpose = body.purpose === "breakdown" ? "breakdown" : body.purpose === "intro_video" ? "intro_video" : "game_film";
  const title = typeof body.title === "string" ? body.title.slice(0, 200) : null;

  const { data: media, error } = await admin
    .from("media")
    .insert({ owner_id: user.id, purpose, source: "upload", status: "uploading", title })
    .select("id")
    .single();
  if (error || !media) return c.json({ error: error?.message ?? "could not create media" }, 500);

  // Family film and breakdowns are signed (the API mints playback tokens for people on the order);
  // intro videos are public because the marketplace embeds them for visitors.
  const signed = purpose !== "intro_video" && muxSigningConfigured;
  if (purpose !== "intro_video" && !muxSigningConfigured) console.warn("mux signing key missing: uploading with public playback");
  const upload = await mux.video.uploads.create({
    cors_origin: c.req.header("origin") ?? "*",
    timeout: DAY,
    new_asset_settings: {
      passthrough: media.id,
      playback_policies: [signed ? "signed" : "public"],
      video_quality: "basic",
      max_resolution_tier: "1080p",
      meta: { title: title ?? purpose, external_id: media.id },
      // Game film gets an MP4 rendition so the mentor can download it for their own screen recorder.
      ...(purpose === "game_film" ? { static_renditions: [{ resolution: "highest" as const }] } : {}),
    },
  });

  await admin.from("media").update({ mux_upload_id: upload.id }).eq("id", media.id);

  return c.json({ mediaId: media.id, uploadId: upload.id, uploadUrl: upload.url });
});
