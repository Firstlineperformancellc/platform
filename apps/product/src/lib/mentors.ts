import { supabase } from "./supabase";
import type { Tier } from "./settings";
import type { HockeyPosition } from "./types";

export type MarketplaceMentor = {
  user_id: string;
  slug: string;
  display_name: string;
  tier: Tier;
  highest_level: string | null;
  current_team: string;
  badges: string[];
  positions: HockeyPosition[];
  specialties: string[];
  bio: string;
  photo_media_id: string | null;
  video_media_id: string | null;
  capacity_on_deck: number;
  jobs_on_deck: number;
  available: boolean;
  avg_turnaround_hours: number | null;
  avg_rating: number | null;
  rating_count: number;
  jobs_completed: number;
};

const COLS =
  "user_id, slug, display_name, tier, highest_level, current_team, badges, positions, specialties, bio, photo_media_id, video_media_id, capacity_on_deck, jobs_on_deck, available, avg_turnaround_hours, avg_rating, rating_count, jobs_completed";

export async function listMentors(position?: HockeyPosition): Promise<MarketplaceMentor[]> {
  let q = supabase.from("marketplace_mentors").select(COLS).order("available", { ascending: false }).order("display_name");
  if (position) q = q.contains("positions", [position]);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as MarketplaceMentor[];
}

export async function getMentor(slug: string): Promise<MarketplaceMentor | null> {
  const { data } = await supabase.from("marketplace_mentors").select(COLS).eq("slug", slug).maybeSingle();
  return (data as MarketplaceMentor | null) ?? null;
}

export function turnaroundLabel(hours: number | null | undefined) {
  if (hours == null) return "New";
  if (hours < 24) return "Typically same day";
  return `Typically ${Math.round(hours / 24)} day${Math.round(hours / 24) === 1 ? "" : "s"}`;
}
