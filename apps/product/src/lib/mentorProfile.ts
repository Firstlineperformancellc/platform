import { api } from "./api";
import { supabase } from "./supabase";
import type { HockeyPosition } from "./types";

export type AvailabilityWindow = { dow: number; start: string; end: string }; // dow 0=Sun..6=Sat, "19:00"

export type MentorProfile = {
  user_id: string;
  slug: string;
  display_name: string;
  bio: string;
  teaching_focus: string | null;
  who_i_help: string | null;
  awards: string[];
  career_note: string | null;
  specialties: string[];
  positions: HockeyPosition[];
  current_team: string;
  eliteprospects_url: string | null;
  social: Record<string, string>;
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

const COLS = "user_id, slug, display_name, bio, teaching_focus, who_i_help, awards, career_note, specialties, positions, current_team, highest_level, badges, eliteprospects_url, social, tier, status, verified, capacity_on_deck, availability, timezone, photo_path, video_media_id, stripe_account_id, payouts_enabled";

export async function getMyProfile(): Promise<MentorProfile | null> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data } = await supabase.from("athletes").select(COLS).eq("user_id", auth.user.id).maybeSingle();
  return (data as MentorProfile | null) ?? null;
}

export type MentorProfilePatch = Partial<Pick<MentorProfile, "display_name" | "bio" | "teaching_focus" | "who_i_help" | "specialties" | "positions" | "current_team" | "eliteprospects_url" | "social" | "highest_level" | "badges" | "capacity_on_deck" | "availability" | "timezone" | "photo_path" | "video_media_id">>;

export const BIO_MAX = 3000;
export const SECTION_MAX = 500;

// Social handles, stored bare; the link is built here so a pasted URL never reaches the database.
export type SocialNetwork = { key: "instagram" | "tiktok" | "x" | "youtube"; label: string; url: (handle: string) => string };
export const SOCIAL_NETWORKS: SocialNetwork[] = [
  { key: "instagram", label: "Instagram", url: (h) => "https://instagram.com/" + h },
  { key: "tiktok", label: "TikTok", url: (h) => "https://www.tiktok.com/@" + h },
  { key: "x", label: "X", url: (h) => "https://x.com/" + h },
  { key: "youtube", label: "YouTube", url: (h) => "https://www.youtube.com/@" + h },
];
const HANDLE = /^[A-Za-z0-9._-]{1,60}$/;

// What a mentor typed, as a bare handle: no @, and from a pasted link only the last path segment.
// Null when blank; throws when what is left is still not a handle.
export function cleanHandle(input: string): string | null {
  let h = input.trim();
  if (h.startsWith("@")) h = h.slice(1);
  if (h.includes("/")) {
    // A pasted link: drop the scheme and the host, keep the last path segment.
    const segs = h.split(/[?#]/)[0].split("/").map((x) => x.trim()).filter(Boolean);
    if (/^https?:$/i.test(segs[0] ?? "")) segs.shift();
    if (/^[\w.-]+\.[a-z]{2,}$/i.test(segs[0] ?? "")) segs.shift();
    h = segs.pop() ?? "";
    if (h.startsWith("@")) h = h.slice(1);
    if (!h) throw new Error("Use the handle only, like flp_hockey, not a link.");
  }
  if (!h) return null;
  if (HANDLE.test(h)) return h;
  throw new Error("Use the handle only, like flp_hockey, not a link.");
}

export async function saveMyProfile(patch: MentorProfilePatch) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("sign in first");
  if (patch.bio !== undefined && patch.bio.length > BIO_MAX) throw new Error(`Keep your bio under ${BIO_MAX.toLocaleString()} characters.`);
  for (const k of ["teaching_focus", "who_i_help"] as const) {
    if ((patch[k] ?? "").length > SECTION_MAX) throw new Error(`Keep that section under ${SECTION_MAX} characters.`);
  }
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
export const stripeDashboard = () => api<{ url: string }>("/mentors/me/connect/dashboard", { method: "POST" });
export const connectStatus = () => api<{ configured: boolean; connected: boolean; payouts_enabled: boolean; requirements?: string[] }>("/mentors/me/connect");

export const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
