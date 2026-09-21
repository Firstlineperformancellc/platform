import { api } from "./api";
import { supabase } from "./supabase";
import type { Tier } from "./settings";

// Film Room sessions: reads go to Supabase under RLS (parent or mentor sees their own),
// every state change goes through the API.

export type SessionFormat = "film_room_30" | "film_room_60" | "addon_30" | "season_arc";
export type SessionStatus =
  | "requested" | "scheduled" | "in_progress" | "completed" | "cancelled"
  | "no_show_parent" | "no_show_mentor" | "declined" | "expired";

export type Recap = { takeaways: string[]; drills: string[]; next_step: string };

export type Session = {
  id: string;
  athlete_id: string;
  parent_id: string;
  player_id: string;
  status: SessionStatus;
  format: SessionFormat;
  tier: Tier | null;
  scheduled_at: string;
  duration_minutes: number;
  price_cents: number;
  mentor_share_cents: number | null;
  parent_note: string;
  parent_present: boolean;
  breakdown_id: string | null;
  pack_id: string | null;
  accept_by: string | null;
  paid_at: string | null;
  daily_room_url: string | null;
  recording_status: string | null;
  recap: Recap | null;
  recap_due_at: string | null;
  recap_at: string | null;
  rating: number | null;
  review: string | null;
  review_status: string | null;
  cancel_reason: string | null;
  created_at: string;
  players: { first_name: string; last_name: string; age_group: string; position: string } | null;
  athletes: { display_name: string; slug: string } | null;
};

export type Pack = {
  id: string;
  athlete_id: string;
  player_id: string;
  tier: Tier;
  sessions_total: number;
  sessions_used: number;
  price_cents: number;
  paid_at: string | null;
  expires_at: string;
  athletes: { display_name: string; slug: string } | null;
};

const COLS =
  "id, athlete_id, parent_id, player_id, status, format, tier, scheduled_at, duration_minutes, price_cents, mentor_share_cents, parent_note, parent_present, breakdown_id, pack_id, accept_by, paid_at, daily_room_url, recording_status, recap, recap_due_at, recap_at, rating, review, review_status, cancel_reason, created_at, players(first_name, last_name, age_group, position), athletes(display_name, slug)";

export const FORMAT_LABEL: Record<SessionFormat, string> = {
  film_room_30: "Film Room · 30 min",
  film_room_60: "Film Room · 60 min",
  addon_30: "Add-on · 30 min",
  season_arc: "Season Arc session",
};

export const STATUS_LABEL: Record<SessionStatus, string> = {
  requested: "Waiting on the mentor",
  scheduled: "Scheduled",
  in_progress: "Live now",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show_parent: "Missed (family)",
  no_show_mentor: "Missed (mentor)",
  declined: "Declined",
  expired: "Expired",
};

export async function listSessions(): Promise<Session[]> {
  const { data, error } = await supabase.from("sessions").select(COLS).order("scheduled_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Session[];
}

export async function getSession(id: string): Promise<Session | null> {
  const { data, error } = await supabase.from("sessions").select(COLS).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as unknown as Session | null) ?? null;
}

export async function listMyPacks(athleteId?: string): Promise<Pack[]> {
  let q = supabase.from("session_packs").select("id, athlete_id, player_id, tier, sessions_total, sessions_used, price_cents, paid_at, expires_at, athletes(display_name, slug)").not("paid_at", "is", null);
  if (athleteId) q = q.eq("athlete_id", athleteId);
  const { data, error } = await q.order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Pack[];
}

// Which mentor delivered a job (for the "go through this live" add-on).
export async function mentorSlugForJob(jobId: string): Promise<string | null> {
  const { data: job } = await supabase.from("jobs").select("athlete_id").eq("id", jobId).maybeSingle();
  if (!job?.athlete_id) return null;
  const { data: m } = await supabase.from("marketplace_mentors").select("slug").eq("user_id", job.athlete_id).maybeSingle();
  return m?.slug ?? null;
}

export const listSlots = (slug: string, format: SessionFormat) =>
  api<{ slots: string[]; minutes: number }>(`/sessions/slots?mentor=${encodeURIComponent(slug)}&format=${format}`);

export type BookInput = {
  mentorSlug: string;
  format: SessionFormat;
  startsAt: string;
  playerId: string;
  note: string;
  parentPresent: boolean;
  breakdownId?: string | null;
  packId?: string | null;
};
export const bookSession = (input: BookInput) =>
  api<{ sessionId: string; checkoutUrl?: string; devPaid?: boolean }>("/sessions", { method: "POST", body: JSON.stringify(input) });

export const buyPack = (mentorSlug: string, playerId: string) =>
  api<{ packId: string; checkoutUrl?: string; devPaid?: boolean }>("/sessions/packs", { method: "POST", body: JSON.stringify({ mentorSlug, playerId }) });

export const acceptSession = (id: string) => api<{ ok: true }>(`/sessions/${id}/accept`, { method: "POST" });
export const declineSession = (id: string) => api<{ ok: true }>(`/sessions/${id}/decline`, { method: "POST" });
export const cancelSession = (id: string) => api<{ ok: true; refunded: boolean }>(`/sessions/${id}/cancel`, { method: "POST" });
export const completeSession = (id: string) => api<{ ok: true }>(`/sessions/${id}/complete`, { method: "POST" });
export const reportNoShow = (id: string) => api<{ ok: true }>(`/sessions/${id}/no-show`, { method: "POST" });
export const joinSession = (id: string) => api<{ configured: boolean; url?: string; error?: string }>(`/sessions/${id}/join`);
export const submitRecap = (id: string, recap: Recap) => api<{ ok: true }>(`/sessions/${id}/recap`, { method: "POST", body: JSON.stringify(recap) });
export const reviewSession = (id: string, rating: number, review: string) =>
  api<{ ok: true; review_status: string }>(`/sessions/${id}/review`, { method: "POST", body: JSON.stringify({ rating, review }) });
export const recordingLink = (id: string) => api<{ url: string; expires: number }>(`/sessions/${id}/recording`);

// Display helpers (viewer's local time zone).
export function whenLabel(iso: string) {
  return new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
export function dayLabel(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}
export function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
export function minutesUntil(iso: string) {
  return Math.round((new Date(iso).getTime() - Date.now()) / 60000);
}
export function playerName(s: Session) {
  const p = s.players;
  return p ? `${p.first_name}${p.last_name ? ` ${p.last_name[0]}.` : ""}` : "Youth athlete";
}
