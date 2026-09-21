import { useEffect, useState } from "react";
import { api } from "./api";

// Playback goes through the API: it decides who may watch and, for signed assets, mints the tokens.
export type Playback =
  | { ready: false; status: string }
  | { ready: true; playbackId: string; policy: "public" | "signed"; tokens: { playback: string; thumbnail: string; storyboard: string } | null; mp4Url: string | null };

export const getPlayback = (mediaId: string) => api<Playback>(`/media/${mediaId}/playback`);

const PLAYER = "https://player.mux.com";
const THEME = "primary-color=%23d4a32c&accent-color=%23000000";

export function playerSrc(p: Playback & { ready: true }) {
  const q = [THEME];
  if (p.tokens) q.push(`playback-token=${p.tokens.playback}`, `thumbnail-token=${p.tokens.thumbnail}`, `storyboard-token=${p.tokens.storyboard}`);
  return `${PLAYER}/${p.playbackId}?${q.join("&")}`;
}

// Re-fetches every 90 minutes so a two-hour token never expires under a long session.
export function usePlayback(mediaId: string | null | undefined) {
  const [pb, setPb] = useState<Playback | null | undefined>(undefined);
  useEffect(() => {
    if (!mediaId) {
      setPb(null);
      return;
    }
    let live = true;
    const load = () => getPlayback(mediaId).then((p) => live && setPb(p)).catch(() => live && setPb(null));
    load();
    const t = setInterval(load, 90 * 60 * 1000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [mediaId]);
  return pb;
}
