import { admin } from "./supabase.js";

// What a mentor is leaving waiting, in their own dollars: the share they would earn from the offers
// they haven't answered and from the breakdowns they accepted but haven't delivered. Alex's ask was
// to put a figure on it ("you have 600 bucks on the table") so a nudge snaps them out of it.

type Share = { orders: { mentor_share_cents: number | null } | null };
const sum = (rows: Share[]) => rows.reduce((t, r) => t + (r.orders?.mentor_share_cents ?? 0), 0);

export async function earningsAtStake(athleteId: string): Promise<{ waitingCents: number; onClockCents: number }> {
  const now = new Date().toISOString();
  const [{ data: offers }, { data: accepted }] = await Promise.all([
    admin.from("job_offers").select("id, jobs(orders(mentor_share_cents))").eq("athlete_id", athleteId).is("response", null).gt("expires_at", now),
    admin.from("jobs").select("id, orders(mentor_share_cents)").eq("athlete_id", athleteId).eq("status", "accepted"),
  ]);
  const waitingCents = sum(((offers ?? []) as unknown as { jobs: Share | null }[]).map((o) => o.jobs ?? { orders: null }));
  const onClockCents = sum((accepted ?? []) as unknown as Share[]);
  return { waitingCents, onClockCents };
}

// Whole dollars, the way Alex says it: "$600".
export const dollars = (cents: number) => `$${Math.round(cents / 100).toLocaleString("en-US")}`;
