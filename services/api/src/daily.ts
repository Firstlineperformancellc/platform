import { env } from "./env.js";

// Daily.co REST client. Rooms are created per session with cloud recording enabled; meeting
// tokens are minted at join time so nobody can enter without going through the API. Without a
// key (dev today) every call reports not-configured and the app shows a placeholder.

const BASE = "https://api.daily.co/v1";
export const dailyConfigured = Boolean(env.dailyApiKey);

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!env.dailyApiKey) throw new Error("Daily is not configured");
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "content-type": "application/json", authorization: `Bearer ${env.dailyApiKey}`, ...(init.headers ?? {}) },
  });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string; info?: string };
  if (!res.ok) throw new Error(`Daily ${path}: ${body.error ?? res.status} ${body.info ?? ""}`.trim());
  return body;
}

export async function createRoom(name: string, startsAt: Date, endsAt: Date) {
  const nbf = Math.floor(startsAt.getTime() / 1000) - 15 * 60;
  const exp = Math.floor(endsAt.getTime() / 1000) + 60 * 60;
  return call<{ name: string; url: string }>("/rooms", {
    method: "POST",
    body: JSON.stringify({
      name,
      privacy: "private",
      // No room-level enable_recording: in Daily's UI that would hand every participant a
      // stop button. Recording rights live on the mentor's meeting token only.
      properties: {
        nbf,
        exp,
        enable_chat: false,
        enable_screenshare: true,
        enable_knocking: false,
        start_video_off: false,
        eject_at_room_exp: true,
        max_participants: 4,
      },
    }),
  });
}

export async function meetingToken(room: string, userName: string, opts: { owner: boolean; startRecording: boolean; expSeconds: number }) {
  const t = await call<{ token: string }>("/meeting-tokens", {
    method: "POST",
    body: JSON.stringify({
      properties: {
        room_name: room,
        user_name: userName,
        is_owner: opts.owner,
        exp: Math.floor(Date.now() / 1000) + opts.expSeconds,
        // Only the recording starter's token carries recording rights; the recording begins
        // from the token flag the moment they join, and enable_recording_ui:false removes the
        // stop control from their screen (verified 2026-09-21). Owners may manage participants
        // but not the recording, so nobody in the room can turn it off.
        ...(opts.startRecording ? { enable_recording: "cloud", start_cloud_recording: true, enable_recording_ui: false } : {}),
        ...(opts.owner ? { permissions: { canAdmin: ["participants"] } } : {}),
      },
    }),
  });
  return t.token;
}

export async function recordingAccessLink(recordingId: string) {
  return call<{ download_link: string; expires: number }>(`/recordings/${recordingId}/access-link?valid_for_secs=3600`);
}

export async function deleteRecording(recordingId: string) {
  return call<{ deleted: boolean }>(`/recordings/${recordingId}`, { method: "DELETE" });
}

export async function deleteRoom(name: string) {
  return call<{ deleted: boolean }>(`/rooms/${name}`, { method: "DELETE" }).catch(() => null);
}
