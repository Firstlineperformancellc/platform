import { api } from "./api";
import { supabase } from "./supabase";

// Admin reads go straight to Supabase (the admin role passes every policy); writes go through /admin on the API.

export type AdminMentor = {
  user_id: string;
  slug: string;
  display_name: string;
  status: string;
  tier: string | null;
  highest_level: string | null;
  current_team: string;
  positions: string[];
  bio: string;
  verified: boolean;
  capacity_on_deck: number;
  badges: string[];
  credentials: { label: string }[];
  blocked_at: string | null;
  created_at: string;
  profiles: { email: string; full_name: string } | null;
  stats: MentorStats | null;
};

export type MentorStats = {
  jobs_completed: number;
  jobs_on_deck: number;
  sessions_completed: number;
  session_no_shows: number;
  session_declines: number;
  session_late_cancels: number;
  avg_turnaround_hours: number | null;
  on_time_rate: number | null;
  avg_rating: number | null;
  rating_count: number;
  declines: number;
  expired_offers: number;
  accepted_offers: number;
  audits: number;
  last_delivered_at: string | null;
};

export async function listMentors(): Promise<AdminMentor[]> {
  const { data, error } = await supabase
    .from("athletes")
    .select("user_id, slug, display_name, status, tier, highest_level, current_team, positions, bio, verified, capacity_on_deck, badges, credentials, blocked_at, created_at, profiles!athletes_user_id_fkey(email, full_name)")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const { data: stats } = await supabase.from("mentor_stats_admin").select("*");
  const byId = new Map((stats ?? []).map((s: MentorStats & { athlete_id: string }) => [s.athlete_id, s]));
  return (data ?? []).map((m) => ({ ...(m as unknown as AdminMentor), stats: byId.get((m as { user_id: string }).user_id) ?? null }));
}

export const patchMentor = (id: string, patch: Record<string, unknown>) => api<{ ok: true }>(`/admin/mentors/${id}`, { method: "PATCH", body: JSON.stringify(patch) });

export type AdminJob = {
  id: string;
  status: string;
  athlete_id: string | null;
  accepted_at: string | null;
  due_at: string | null;
  delivered_at: string | null;
  on_time: boolean | null;
  created_at: string;
  orders: {
    id: string; status: string; tier: string; price_cents: number; position: string; age_group: string; skill_level: string;
    paid_at: string | null; waitlisted_at: string | null; wait_days: number | null; film_media_id: string | null; film_youtube_url: string | null;
    players: { first_name: string; last_name: string } | null;
    parent: { email: string; full_name: string } | null;
    first: { display_name: string } | null;
    second: { display_name: string } | null;
  } | null;
  job_offers: { athlete_id: string; rank: number; response: string | null; expires_at: string; athletes: { display_name: string } | null }[];
  mentor: { display_name: string } | null;
};

export async function listJobs(): Promise<AdminJob[]> {
  const { data, error } = await supabase
    .from("jobs")
    .select(
      "id, status, athlete_id, accepted_at, due_at, delivered_at, on_time, created_at, mentor:athletes!jobs_athlete_id_fkey(display_name), job_offers(athlete_id, rank, response, expires_at, athletes(display_name)), orders(id, status, tier, price_cents, position, age_group, skill_level, paid_at, waitlisted_at, wait_days, film_media_id, film_youtube_url, players(first_name, last_name), parent:profiles!orders_parent_id_fkey(email, full_name), first:athletes!orders_first_choice_athlete_id_fkey(display_name), second:athletes!orders_second_choice_athlete_id_fkey(display_name))",
    )
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as AdminJob[];
}

export const assignJob = (jobId: string, athleteId: string) => api<{ ok: true }>(`/admin/jobs/${jobId}/assign`, { method: "POST", body: JSON.stringify({ athleteId }) });
export const extendJob = (jobId: string, hours: number) => api<{ ok: true }>(`/admin/jobs/${jobId}/extend`, { method: "POST", body: JSON.stringify({ hours }) });

export type AdminAudit = {
  id: string;
  kind: string;
  status: string;
  outcome: string | null;
  reason: string;
  notes: string;
  actions: { at: string; by: string; action: string; note?: string }[];
  opened_at: string;
  closed_at: string | null;
  breakdown_id: string | null;
  filer: { email: string; full_name: string } | null;
  breakdowns: { id: string; rating: number | null; jobs: { id: string; athlete_id: string | null; athletes: { display_name: string } | null; orders: { price_cents: number; players: { first_name: string; last_name: string } | null } } } | null;
};

export async function listAudits(): Promise<AdminAudit[]> {
  const { data, error } = await supabase
    .from("quality_audits")
    .select("id, kind, status, outcome, reason, notes, actions, opened_at, closed_at, breakdown_id, filer:profiles!quality_audits_filed_by_fkey(email, full_name), breakdowns(id, rating, jobs(id, athlete_id, athletes(display_name), orders(price_cents, players(first_name, last_name))))")
    .order("opened_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as AdminAudit[];
}

export const noteAudit = (id: string, note: string) => api<{ ok: true }>(`/admin/audits/${id}/note`, { method: "POST", body: JSON.stringify({ note }) });
export const closeAudit = (id: string, body: { outcome: string; note: string; refundCents?: number; reassignTo?: string }) =>
  api<{ ok: true }>(`/admin/audits/${id}/close`, { method: "POST", body: JSON.stringify(body) });

export type AdminPayout = {
  id: string;
  status: string;
  amount_cents: number;
  currency: string;
  held_reason: string | null;
  note: string;
  created_at: string;
  paid_at: string | null;
  stripe_transfer_id: string | null;
  athletes: { display_name: string; stripe_account_id: string | null; payouts_enabled: boolean } | null;
  jobs: { id: string; delivered_at: string | null; orders: { players: { first_name: string; last_name: string } | null } } | null;
  sessions: { id: string; scheduled_at: string | null; players: { first_name: string; last_name: string } | null } | null;
};

export async function listPayouts(): Promise<AdminPayout[]> {
  const { data, error } = await supabase
    .from("payouts")
    .select("id, status, amount_cents, currency, held_reason, note, created_at, paid_at, stripe_transfer_id, athletes(display_name, stripe_account_id, payouts_enabled), jobs(id, delivered_at, orders(players(first_name, last_name))), sessions(id, scheduled_at, players(first_name, last_name))")
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as AdminPayout[];
}

export const payPayout = (id: string, method: "stripe" | "manual", note?: string) => api<{ ok: true; transferId: string | null }>(`/admin/payouts/${id}/pay`, { method: "POST", body: JSON.stringify({ method, note }) });
export const holdPayout = (id: string, hold: boolean, reason?: string) => api<{ ok: true }>(`/admin/payouts/${id}/hold`, { method: "POST", body: JSON.stringify({ hold, reason }) });

export type PendingReview = { id: string; kind: "breakdown" | "session"; rating: number; review: string | null; reviewed_at: string; mentor: string };
export async function listPendingReviews(): Promise<PendingReview[]> {
  const [b, s] = await Promise.all([
    supabase.from("breakdowns").select("id, rating, review, reviewed_at, jobs(athletes(display_name))").eq("review_status", "pending_admin").order("reviewed_at"),
    supabase.from("sessions").select("id, rating, review, reviewed_at, athletes(display_name)").eq("review_status", "pending_admin").order("reviewed_at"),
  ]);
  type B = { id: string; rating: number; review: string | null; reviewed_at: string; jobs: { athletes: { display_name: string } | null } | null };
  type S = { id: string; rating: number; review: string | null; reviewed_at: string | null; athletes: { display_name: string } | null };
  const rows: PendingReview[] = [
    ...((b.data ?? []) as unknown as B[]).map((r) => ({ id: r.id, kind: "breakdown" as const, rating: r.rating, review: r.review, reviewed_at: r.reviewed_at, mentor: r.jobs?.athletes?.display_name ?? "?" })),
    ...((s.data ?? []) as unknown as S[]).map((r) => ({ id: r.id, kind: "session" as const, rating: r.rating, review: r.review, reviewed_at: r.reviewed_at ?? "", mentor: r.athletes?.display_name ?? "?" })),
  ];
  return rows.sort((x, y) => x.reviewed_at.localeCompare(y.reviewed_at));
}
export type AdminUser = {
  id: string; email: string; full_name: string; role: "parent" | "athlete" | "admin"; created_at: string;
  suspended_at: string | null; suspended_reason: string | null; deleted_at: string | null;
  last_sign_in_at: string | null; email_confirmed_at: string | null; banned_until: string | null;
  mentor_slug: string | null; mentor_status: string | null; mentor_tier: string | null;
  players: number; orders: number; spent_orders_cents: number; spent_sessions_cents: number; spent_packs_cents: number; refunded_cents: number;
  sessions: number; breakdowns_delivered: number; earned_cents: number; paid_out_cents: number;
};
export async function listUsers(): Promise<AdminUser[]> {
  const { data, error } = await supabase.from("admin_users").select("*").order("created_at", { ascending: false }).limit(1000);
  if (error) throw new Error(error.message);
  return (data ?? []) as AdminUser[];
}
export type ActivityRow = { user_id: string; at: string; kind: string; detail: string | null; ref: string | null };
export async function userActivity(userId: string): Promise<ActivityRow[]> {
  const { data, error } = await supabase.from("admin_user_activity").select("*").eq("user_id", userId).order("at", { ascending: false }).limit(150);
  if (error) throw new Error(error.message);
  return (data ?? []) as ActivityRow[];
}
export const suspendUser = (id: string, reason: string) => api<{ ok: true }>(`/admin/users/${id}/suspend`, { method: "POST", body: JSON.stringify({ reason }) });
export const unsuspendUser = (id: string) => api<{ ok: true }>(`/admin/users/${id}/unsuspend`, { method: "POST" });
export const deleteUser = (id: string) => api<{ ok: true; mode: "deleted" | "deactivated" }>(`/admin/users/${id}/delete`, { method: "POST" });

export const adminCancelSession = (id: string, reason: string) => api<{ ok: true }>(`/admin/sessions/${id}/cancel`, { method: "POST", body: JSON.stringify({ reason }) });
export const adminNoShow = (id: string, who: "mentor" | "parent") => api<{ ok: true }>(`/admin/sessions/${id}/no-show`, { method: "POST", body: JSON.stringify({ who }) });
export const adminCompleteSession = (id: string) => api<{ ok: true }>(`/admin/sessions/${id}/complete`, { method: "POST" });
export const moderateReview = (id: string, status: "published" | "hidden", kind: "breakdown" | "session" = "breakdown") =>
  api<{ ok: true }>(`/admin/reviews/${id}`, { method: "POST", body: JSON.stringify({ status, kind }) });

export const patchSettings = (patch: Record<string, unknown>) => api<{ ok: true }>("/admin/settings", { method: "PATCH", body: JSON.stringify(patch) });
export const grantAdmin = (email: string) => api<{ ok: true }>("/admin/admins", { method: "POST", body: JSON.stringify({ email }) });

export async function counts() {
  const [mentors, jobs, audits, payouts, reviews, sessions, sessionReviews, users] = await Promise.all([
    supabase.from("athletes").select("status", { count: "exact", head: true }).eq("status", "applied"),
    supabase.from("jobs").select("status", { count: "exact", head: true }).in("status", ["unassigned", "waiting"]),
    supabase.from("quality_audits").select("id", { count: "exact", head: true }).eq("status", "open"),
    supabase.from("payouts").select("id", { count: "exact", head: true }).eq("status", "owed"),
    supabase.from("breakdowns").select("id", { count: "exact", head: true }).eq("review_status", "pending_admin"),
    supabase.from("sessions").select("id", { count: "exact", head: true }).in("status", ["requested", "scheduled", "in_progress"]),
    supabase.from("sessions").select("id", { count: "exact", head: true }).eq("review_status", "pending_admin"),
    supabase.from("profiles").select("id", { count: "exact", head: true }),
  ]);
  return { applications: mentors.count ?? 0, needsAssignment: jobs.count ?? 0, openAudits: audits.count ?? 0, owedPayouts: payouts.count ?? 0, pendingReviews: (reviews.count ?? 0) + (sessionReviews.count ?? 0), liveSessions: sessions.count ?? 0, users: users.count ?? 0 };
}
