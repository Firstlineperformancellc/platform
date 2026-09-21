import { api } from "./api";
import { supabase } from "./supabase";
import type { HockeyPosition } from "./types";

export type AvailabilityWindow = { dow: number; start: string; end: string }; // dow 0=Sun..6=Sat, "19:00"

export type MentorProfile = {
  user_id: string;
  slug: string;
  display_name: string;
  bio: string;
  specialties: string[];
  positions: HockeyPosition[];
  current_team: string;
  highest_level: string | null;
  badges: string[];
  tier: string | null;
  status: string;
  verified: boolean;
  capacity_on_deck: number;
  availability: AvailabilityWindow[];
  timezone: string;
  photo_path: string | null;
  video_media_id: string | null;
  stripe_account_id: string | null;
  payouts_enabled: boolean;
};

const COLS = "user_id, slug, display_name, bio, specialties, positions, current_team, highest_level, badges, tier, status, verified, capacity_on_deck, availability, timezone, photo_path, video_media_id, stripe_account_id, payouts_enabled";

export async function getMyProfile(): Promise<MentorProfile | null> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data } = await supabase.from("athletes").select(COLS).eq("user_id", auth.user.id).maybeSingle();
  return (data as MentorProfile | null) ?? null;
}

export type MentorProfilePatch = Partial<Pick<MentorProfile, "display_name" | "bio" | "specialties" | "positions" | "current_team" | "highest_level" | "badges" | "capacity_on_deck" | "availability" | "timezone" | "photo_path" | "video_media_id">>;

export async function saveMyProfile(patch: MentorProfilePatch) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("sign in first");
  const { error } = await supabase.from("athletes").update(patch).eq("user_id", auth.user.id);
  if (error) throw new Error(error.message);
}

export async function uploadAvatar(file: File): Promise<string> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("sign in first");
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${auth.user.id}/avatar-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("avatars").upload(path, file, { contentType: file.type || "image/jpeg", upsert: true });
  if (error) throw new Error(error.message);
  return path;
}

export function avatarUrl(path: string | null | undefined) {
  if (!path) return null;
  return supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
}

export const startConnect = () => api<{ url: string }>("/mentors/me/connect", { method: "POST" });
export const connectStatus = () => api<{ configured: boolean; connected: boolean; payouts_enabled: boolean; requirements?: string[] }>("/mentors/me/connect");

export const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
