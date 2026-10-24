import { admin } from "./supabase.js";

// Per-mentor revenue (U-15), the "sales team" view Bryan asked for: money made and money left on the
// table. Earned is what the ledger holds for the mentor. Left on the table is the share they would have
// had from the breakdown offers they declined or let run out, plus the Film Rooms they declined. Alex
// wants mentors to feel that second number, so it is counted in their own dollars, not FLP's.

export type Days = 30 | 90 | null; // null = all time

export type MentorRevenue = {
  earned_cents: number;   // owed + held + paid
  paid_cents: number;
  owed_cents: number;
  left_cents: number;     // mentor share of declined and expired offers, plus declined Film Rooms
  jobs_completed: number; // breakdowns delivered or closed
  per_job_cents: number;  // earned / jobs_completed, 0 when none
  declined: number;       // offers and Film Rooms declined
  expired: number;        // offers that ran out
};

// "30" or "90" from the query string; anything else is all time.
export const parseDays = (q: string | undefined): Days => (q === "30" ? 30 : q === "90" ? 90 : null);

const empty = (): MentorRevenue => ({ earned_cents: 0, paid_cents: 0, owed_cents: 0, left_cents: 0, jobs_completed: 0, per_job_cents: 0, declined: 0, expired: 0 });

type Page = PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;
// Supabase answers at most 1000 rows per call; walk the table a page at a time. Rows are cast to T here
// because the client's guess at a nested join (jobs(orders(...))) is an array where PostgREST returns an object.
async function all<T>(page: (from: number, to: number) => Page): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await page(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) return out;
  }
}

type PayoutRow = { athlete_id: string; status: "owed" | "held" | "paid"; amount_cents: number };
type OfferRow = { athlete_id: string; response: "declined" | "expired"; jobs: { orders: { mentor_share_cents: number | null } | null } | null };
type SessionRow = { athlete_id: string; mentor_share_cents: number | null };
type JobRow = { athlete_id: string };

// Figures per athlete id. Pass null for every mentor; a listed id always comes back, with zeros when quiet.
export async function mentorRevenue(athleteIds: string[] | null, days: Days): Promise<Record<string, MentorRevenue>> {
  const since = days ? new Date(Date.now() - days * 86_400_000).toISOString() : null;
  // Offers count by when they were answered (expiry stamps responded_at too); offered_at covers any row never stamped.
  const offerWindow = since ? `responded_at.gte.${since},and(responded_at.is.null,offered_at.gte.${since})` : null;
  const jobWindow = since ? `delivered_at.gte.${since},and(delivered_at.is.null,created_at.gte.${since})` : null;

  const [payouts, offers, sessions, jobs] = await Promise.all([
    all<PayoutRow>((a, b) => {
      let q = admin.from("payouts").select("athlete_id, status, amount_cents").in("status", ["owed", "held", "paid"]);
      if (athleteIds) q = q.in("athlete_id", athleteIds);
      if (since) q = q.gte("created_at", since);
      return q.order("id").range(a, b);
    }),
    all<OfferRow>((a, b) => {
      let q = admin.from("job_offers").select("athlete_id, response, jobs(orders(mentor_share_cents))").in("response", ["declined", "expired"]);
      if (athleteIds) q = q.in("athlete_id", athleteIds);
      if (offerWindow) q = q.or(offerWindow);
      return q.order("id").range(a, b);
    }),
    all<SessionRow>((a, b) => {
      let q = admin.from("sessions").select("athlete_id, mentor_share_cents").eq("status", "declined");
      if (athleteIds) q = q.in("athlete_id", athleteIds);
      if (since) q = q.gte("scheduled_at", since);
      return q.order("id").range(a, b);
    }),
    all<JobRow>((a, b) => {
      let q = admin.from("jobs").select("athlete_id").in("status", ["delivered", "closed"]).not("athlete_id", "is", null);
      if (athleteIds) q = q.in("athlete_id", athleteIds);
      if (jobWindow) q = q.or(jobWindow);
      return q.order("id").range(a, b);
    }),
  ]);

  const out: Record<string, MentorRevenue> = {};
  for (const id of athleteIds ?? []) out[id] = empty();
  const at = (id: string) => (out[id] ??= empty());

  for (const p of payouts) {
    const r = at(p.athlete_id);
    r.earned_cents += p.amount_cents;
    if (p.status === "paid") r.paid_cents += p.amount_cents;
    else if (p.status === "owed") r.owed_cents += p.amount_cents;
  }
  for (const o of offers) {
    const r = at(o.athlete_id);
    r.left_cents += o.jobs?.orders?.mentor_share_cents ?? 0;
    if (o.response === "declined") r.declined++;
    else r.expired++;
  }
  for (const s of sessions) {
    const r = at(s.athlete_id);
    r.left_cents += s.mentor_share_cents ?? 0;
    r.declined++;
  }
  for (const j of jobs) at(j.athlete_id).jobs_completed++;
  for (const r of Object.values(out)) r.per_job_cents = r.jobs_completed ? Math.round(r.earned_cents / r.jobs_completed) : 0;
  return out;
}
