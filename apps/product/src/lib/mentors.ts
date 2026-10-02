import { supabase } from "./supabase";
import type { MarketplaceOptions, Settings, Tier } from "./settings";
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
  photo_path: string | null;
  eliteprospects_url?: string | null;
  video_media_id: string | null;
  video_playback_id: string | null;
  capacity_on_deck: number;
  jobs_on_deck: number;
  available: boolean;
  avg_turnaround_hours: number | null;
  avg_rating: number | null;
  rating_count: number;
  jobs_completed: number;
  tier_name?: string;
  tier_sort?: number;
  tier_description?: string;
  price_visible?: boolean;
  featured?: boolean;
  in_listing?: boolean;
  tier_color?: string | null;
  turnaround_hours?: number | null;
  breakdown_cents?: number | null;
  film_room_30_cents?: number | null;
  film_room_60_cents?: number | null;
  addon_30_cents?: number | null;
  season_arc_cents?: number | null;
};

// What this mentor costs: their own price where FLP set one, else their level's. Null when it is by arrangement.
export type PriceKind = "breakdown" | "film_room_30" | "film_room_60" | "addon_30" | "season_arc";
export function priceOf(m: MarketplaceMentor, settings: Settings, kind: PriceKind): number | null {
  if (m.price_visible === false) return null;
  const own = kind === "breakdown" ? m.breakdown_cents : m[`${kind}_cents` as const];
  if (own != null) return own;
  return (kind === "breakdown" ? settings.breakdown_prices[m.tier] : settings.session_prices[kind]?.[m.tier]) ?? null;
}

const COLS =
  "user_id, slug, display_name, tier, highest_level, current_team, badges, positions, specialties, bio, photo_media_id, photo_path, video_media_id, video_playback_id, capacity_on_deck, jobs_on_deck, available, avg_turnaround_hours, avg_rating, rating_count, jobs_completed, eliteprospects_url, tier_name, tier_sort, tier_description, price_visible, featured, in_listing, tier_color, turnaround_hours, breakdown_cents, film_room_30_cents, film_room_60_cents, addon_30_cents, season_arc_cents";

export async function listMentors(position?: HockeyPosition): Promise<MarketplaceMentor[]> {
  // the browsable list; direct-link mentors are reached by their profile link only
  let q = supabase.from("marketplace_mentors").select(COLS).eq("in_listing", true).order("available", { ascending: false }).order("display_name");
  if (position) q = q.contains("positions", [position]);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as MarketplaceMentor[];
}

export async function getMentor(slug: string): Promise<MarketplaceMentor | null> {
  const { data } = await supabase.from("marketplace_mentors").select(COLS).eq("slug", slug).maybeSingle();
  return (data as MarketplaceMentor | null) ?? null;
}

// Featured mentors first, then the admin's chosen order.
export function sortMentors(list: MarketplaceMentor[], o: Pick<MarketplaceOptions, "sort">): MarketplaceMentor[] {
  const byName = (a: MarketplaceMentor, b: MarketplaceMentor) => a.display_name.localeCompare(b.display_name);
  const rank = (a: MarketplaceMentor, b: MarketplaceMentor) => {
    if (o.sort === "rating") return (b.avg_rating ?? 0) - (a.avg_rating ?? 0) || b.rating_count - a.rating_count || byName(a, b);
    if (o.sort === "name") return byName(a, b);
    return (a.tier_sort ?? 999) - (b.tier_sort ?? 999) || Number(b.available) - Number(a.available) || byName(a, b);
  };
  return [...list].sort((a, b) => Number(b.featured ?? false) - Number(a.featured ?? false) || rank(a, b));
}

export function turnaroundLabel(hours: number | null | undefined) {
  if (hours == null) return "New";
  if (hours < 24) return "Typically same day";
  return `Typically ${Math.round(hours / 24)} day${Math.round(hours / 24) === 1 ? "" : "s"}`;
}

export type MentorReview = { kind: "breakdown" | "session"; breakdown_id: string | null; session_id: string | null; rating: number; review: string | null; reviewed_at: string; parent_first_name: string; age_group: string; position: string };
export async function listReviews(athleteId: string): Promise<MentorReview[]> {
  const { data } = await supabase.from("mentor_reviews").select("kind, breakdown_id, session_id, rating, review, reviewed_at, parent_first_name, age_group, position").eq("athlete_id", athleteId).order("reviewed_at", { ascending: false }).limit(20);
  return (data ?? []) as MentorReview[];
}
