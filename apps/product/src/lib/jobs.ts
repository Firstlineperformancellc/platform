import { api } from "./api";
import { supabase } from "./supabase";

// Mentor-side reads. Writes (accept/decline/deliver) go through the API.
export type Offer = {
  id: string;
  job_id: string;
  rank: number;
  offered_at: string;
  expires_at: string;
  response: string | null;
  jobs: {
    id: string;
    status: string;
    accepted_at: string | null;
    due_at: string | null;
    orders: {
      id: string;
      position: string;
      age_group: string;
      skill_level: string;
      focus_areas: string[];
      notes: string;
      tier: string;
      mentor_share_cents: number | null;
      film_media_id: string | null;
      film_youtube_url: string | null;
      players: { first_name: string; last_name: string } | null;
      media: { status: string; mux_playback_id: string | null } | null;
    };
  };
};

const OFFER_COLS =
  "id, job_id, rank, offered_at, expires_at, response, jobs(id, status, accepted_at, due_at, orders(id, position, age_group, skill_level, focus_areas, notes, tier, mentor_share_cents, film_media_id, film_youtube_url, players(first_name, last_name), media:film_media_id(status, mux_playback_id)))";

export async function listOpenOffers(): Promise<Offer[]> {
  const { data, error } = await supabase.from("job_offers").select(OFFER_COLS).is("response", null).order("offered_at");
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Offer[];
}

export type MyJob = {
  id: string;
  status: string;
  accepted_at: string | null;
  due_at: string | null;
  delivered_at: string | null;
  orders: Offer["jobs"]["orders"];
};

export async function listMyJobs(): Promise<MyJob[]> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return [];
  const { data, error } = await supabase
    .from("jobs")
    .select("id, status, accepted_at, due_at, delivered_at, orders(id, position, age_group, skill_level, focus_areas, notes, tier, mentor_share_cents, film_media_id, film_youtube_url, players(first_name, last_name), media:film_media_id(status, mux_playback_id))")
    .eq("athlete_id", auth.user.id)
    .order("due_at", { ascending: true, nullsFirst: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as MyJob[];
}

export const acceptOffer = (jobId: string) => api<{ ok: true }>(`/jobs/${jobId}/accept`, { method: "POST" });
export const declineOffer = (jobId: string) => api<{ ok: true }>(`/jobs/${jobId}/decline`, { method: "POST" });

export function hoursLeft(iso: string | null) {
  if (!iso) return null;
  return Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 3600000));
}
