import { api } from "./api";
import { supabase } from "./supabase";

// First Line Presents: a personal video message from an FLP athlete, bought by a parent or by anyone
// from the site (no account needed). This file is the app's whole contract with the API and the
// public `presents_providers` view. Screens import from here and never query the tables directly.

export const PRESENTS_NAME = "First Line Presents";
export const PRESENTS_TAGLINE = "A personal video message from an FLP athlete.";

// --- Providers (public view) -----------------------------------------------------------------------

export type PresentsProvider = {
  user_id: string;
  slug: string;
  display_name: string;
  photo_media_id: string | null;
  photo_path: string | null;
  highest_level: string | null;
  current_team: string;
  offers_mentoring: boolean;
  tier: string | null;
  tier_name: string | null;
  tier_sort: number | null;
  eliteprospects_url: string | null;
  price_cents: number;
  days: number;
  occasions: string[];
  blurb: string;
  sample_playback_id: string | null;
  open_limit: number;
  open_requests: number;
  paused: boolean;
  available: boolean;
  avg_rating: number | null;
  rating_count: number;
  delivered_count: number;
};

const PROVIDER_COLS = "user_id, slug, display_name, photo_media_id, photo_path, highest_level, current_team, offers_mentoring, tier, tier_name, tier_sort, eliteprospects_url, price_cents, days, occasions, blurb, sample_playback_id, open_limit, open_requests, paused, available, avg_rating, rating_count, delivered_count";

export async function listProviders(): Promise<PresentsProvider[]> {
  const { data, error } = await supabase.from("presents_providers").select(PROVIDER_COLS).order("tier_sort", { ascending: true, nullsFirst: false }).order("display_name");
  if (error) throw new Error(error.message);
  return (data ?? []) as PresentsProvider[];
}

export async function getProvider(slug: string): Promise<PresentsProvider | null> {
  const { data, error } = await supabase.from("presents_providers").select(PROVIDER_COLS).eq("slug", slug).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as PresentsProvider | null) ?? null;
}

// --- Rules (admin-editable, defaults mirror the API) -------------------------------------------------

export const PRESENTS_OCCASIONS = ["Birthday", "Good luck", "Congratulations", "Get well", "Pep talk", "Thank a coach", "Team shout-out", "Other"];
export type PresentsRules = {
  enabled: boolean; sharePct: number; minCents: number; maxCents: number; maxDays: number;
  review: "minors" | "all" | "none"; problemDays: number; occasions: string[]; blocklist: string[];
};
export function presentsRules(rules: Record<string, unknown> | undefined): PresentsRules {
  const r = rules ?? {};
  const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
  return {
    enabled: r.presents_enabled !== false,
    sharePct: num(r.presents_share_pct, 30),
    minCents: num(r.presents_min_cents, 2000),
    maxCents: num(r.presents_max_cents, 50000),
    maxDays: num(r.presents_max_days, 7),
    review: (r.presents_review === "all" || r.presents_review === "none" ? r.presents_review : "minors") as PresentsRules["review"],
    problemDays: num(r.presents_problem_days, 7),
    occasions: Array.isArray(r.presents_occasions) && r.presents_occasions.length ? (r.presents_occasions as string[]) : PRESENTS_OCCASIONS,
    blocklist: Array.isArray(r.presents_blocklist) ? (r.presents_blocklist as string[]) : [],
  };
}
/** What the athlete keeps of a price at the current share. */
export const athleteTake = (priceCents: number, sharePct: number) => priceCents - Math.round((priceCents * sharePct) / 100);

// --- Buying (works signed out) ------------------------------------------------------------------------

export type NewRequest = {
  slug: string;
  recipientName: string;
  recipientMinor: boolean;
  occasion: string;
  fromName: string;
  instructions: string;
  team?: string;
  buyerEmail?: string; // required when not signed in
  buyerName?: string;
};
export type CreateResult = { requestId: string; token: string; checkoutUrl?: string; devPaid?: boolean };
export const createRequest = (body: NewRequest) => api<CreateResult>("/presents/requests", { method: "POST", body: JSON.stringify(body) });

export type RequestStatus = "draft" | "open" | "flagged" | "in_review" | "delivered" | "declined" | "expired" | "refunded" | "cancelled";
export const STATUS_LABEL: Record<RequestStatus, string> = {
  draft: "Awaiting payment", open: "Being recorded", flagged: "With FLP", in_review: "Being checked by FLP", delivered: "Delivered",
  declined: "Declined and refunded", expired: "Not delivered, refunded", refunded: "Refunded", cancelled: "Cancelled and refunded",
};

// The buyer's view of a request (also what a holder of the private link sees).
export type BuyerRequest = {
  id: string; status: RequestStatus; recipient_name: string; occasion: string; from_name: string; instructions: string; team: string;
  price_cents: number; refunded_cents: number; currency: string; paid_at: string | null; due_at: string | null; delivered_at: string | null;
  video_media_id: string | null; rating: number | null; problem_text: string | null; problem_at: string | null; can_report: boolean; created_at: string;
  athlete: { display_name: string; slug: string; photo_path: string | null } | null;
  token?: string;
};
const withToken = (path: string, token?: string | null) => (token ? `${path}${path.includes("?") ? "&" : "?"}t=${encodeURIComponent(token)}` : path);
export const getRequest = (id: string, token?: string | null) => api<{ request: BuyerRequest }>(withToken(`/presents/requests/${id}`, token)).then((r) => r.request);
export const myRequests = () => api<{ requests: BuyerRequest[] }>("/presents/requests/mine").then((r) => r.requests);
export const reportProblem = (id: string, text: string, token?: string | null) => api<{ ok: true }>(withToken(`/presents/requests/${id}/problem`, token), { method: "POST", body: JSON.stringify({ text }) });
export const rateRequest = (id: string, rating: number, token?: string | null) => api<{ ok: true }>(withToken(`/presents/requests/${id}/rating`, token), { method: "POST", body: JSON.stringify({ rating }) });
// Same shape as lib/media Playback, fetched with the private token so a guest can watch and download.
export type RequestPlayback =
  | { ready: false; status: string }
  | { ready: true; playbackId: string; policy: "public" | "signed"; tokens: { playback: string; thumbnail: string; storyboard: string } | null; mp4Url: string | null };
export const getRequestPlayback = (id: string, token?: string | null) => api<RequestPlayback>(withToken(`/presents/requests/${id}/playback`, token));
export const viewPath = (id: string, token: string) => `/presents/view?r=${id}&t=${encodeURIComponent(token)}`;

// --- The athlete's side -------------------------------------------------------------------------------

// What the athlete sees: the request, never the buyer. `held` = FLP is still looking at it; text is hidden.
export type AthleteRequest = {
  id: string; recipient_name: string; recipient_minor: boolean; occasion: string; from_name: string; instructions: string; team: string;
  status: RequestStatus; price_cents: number; athlete_share_cents: number; currency: string; video_media_id: string | null; flags: string[];
  paid_at: string | null; due_at: string | null; delivered_at: string | null; declined_reason: string | null; review_note: string | null; reviewed_at: string | null;
  rating: number | null; created_at: string; held: boolean;
};
export const athleteRequests = () => api<{ requests: AthleteRequest[] }>("/presents/mine").then((r) => r.requests);
export const declineRequest = (id: string, reason: string) => api<{ ok: true }>(`/presents/requests/${id}/decline`, { method: "POST", body: JSON.stringify({ reason }) });
export const attachVideo = (id: string, mediaId: string) => api<{ ok: true }>(`/presents/requests/${id}/video`, { method: "POST", body: JSON.stringify({ mediaId }) });
export const sendVideo = (id: string) => api<{ ok: true; status: "delivered" | "in_review" }>(`/presents/requests/${id}/send`, { method: "POST" });

// The athlete's own Presents settings live on their athletes row (RLS: own row; the database enforces
// the price bounds, the 18+ rule and that the sample is their own upload).
export type PresentsSettings = {
  offers_mentoring: boolean;
  presents_enabled: boolean;
  presents_price_cents: number | null;
  presents_days: number;
  presents_open_limit: number;
  presents_paused_until: string | null;
  presents_occasions: string[];
  presents_blurb: string;
  presents_sample_media_id: string | null;
  presents_blocked_at: string | null;
};
export const PRESENTS_SETTINGS_COLS = "offers_mentoring, presents_enabled, presents_price_cents, presents_days, presents_open_limit, presents_paused_until, presents_occasions, presents_blurb, presents_sample_media_id, presents_blocked_at";
export async function getMyPresentsSettings(): Promise<PresentsSettings | null> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data } = await supabase.from("athletes").select(PRESENTS_SETTINGS_COLS).eq("user_id", auth.user.id).maybeSingle();
  return (data as PresentsSettings | null) ?? null;
}
export async function saveMyPresentsSettings(patch: Partial<Omit<PresentsSettings, "offers_mentoring" | "presents_blocked_at">>) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("sign in first");
  const { error } = await supabase.from("athletes").update(patch).eq("user_id", auth.user.id);
  if (error) throw new Error(friendly(error.message));
}
function friendly(msg: string) {
  if (/18 and over/.test(msg)) return "First Line Presents is open to athletes 18 and over.";
  if (/price must be between/.test(msg)) return msg.replace(/^.*?(the price must be)/, "The price must be");
  if (/own upload/.test(msg)) return "The sample video must be one you uploaded here.";
  return msg;
}

// --- Admin -------------------------------------------------------------------------------------------

export type AdminRequest = AthleteRequest & {
  athlete_id: string; buyer_id: string | null; buyer_email: string; buyer_name: string; refunded_cents: number; refund_error: string | null;
  stripe_payment_intent_id: string | null; problem_text: string | null; problem_at: string | null; reviewed_by: string | null; share_token: string;
  athlete: { user_id: string; display_name: string; slug: string } | null; view_url: string;
};
export const adminRequests = (status: "all" | RequestStatus = "all") => api<{ requests: AdminRequest[] }>(`/presents/admin?status=${status}`).then((r) => r.requests);
export const adminApprove = (id: string) => api<{ ok: true }>(`/presents/admin/${id}/approve`, { method: "POST" });
export const adminReject = (id: string, note: string) => api<{ ok: true }>(`/presents/admin/${id}/reject`, { method: "POST", body: JSON.stringify({ note }) });
export const adminRelease = (id: string) => api<{ ok: true }>(`/presents/admin/${id}/release`, { method: "POST" });
export const adminRefund = (id: string, amountCents: number | undefined, reason: string) => api<{ ok: true; full: boolean; refundedCents: number }>(`/presents/admin/${id}/refund`, { method: "POST", body: JSON.stringify({ amountCents, reason }) });
export const adminPlayback = (id: string) => api<RequestPlayback>(`/presents/admin/${id}/playback`);
export const adminResolve = (id: string) => api<{ ok: true }>(`/presents/admin/${id}/resolve`, { method: "POST" });
// Switch an athlete's Presents off (or back on): PATCH /admin/mentors/:id { presents_blocked: boolean } (lib/admin.ts updateMentor can send it).

export const money = (cents: number) => `$${Math.round(cents / 100).toLocaleString("en-US")}`;
