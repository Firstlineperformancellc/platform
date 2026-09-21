import { supabase } from "./supabase";
import type { Tier } from "./settings";

export type OrderStatus = "draft" | "paid" | "offered" | "accepted" | "in_review" | "delivered" | "closed" | "refunded" | "unassigned";

export type Order = {
  id: string;
  player_id: string;
  position: string;
  age_group: string;
  skill_level: string;
  focus_areas: string[];
  notes: string;
  tier: Tier;
  price_cents: number;
  status: OrderStatus;
  paid_at: string | null;
  waitlisted_at: string | null;
  wait_days: number | null;
  film_media_id: string | null;
  film_youtube_url: string | null;
  first_choice_athlete_id: string | null;
  second_choice_athlete_id: string | null;
  created_at: string;
  players: { first_name: string; last_name: string } | null;
  jobs: { id: string; status: string; athlete_id: string | null; accepted_at: string | null; due_at: string | null; delivered_at: string | null }[];
  media: { status: string; mux_playback_id: string | null } | null;
};

const COLS =
  "id, player_id, position, age_group, skill_level, focus_areas, notes, tier, price_cents, status, paid_at, waitlisted_at, wait_days, film_media_id, film_youtube_url, first_choice_athlete_id, second_choice_athlete_id, created_at, players(first_name, last_name), jobs(id, status, athlete_id, accepted_at, due_at, delivered_at), media:film_media_id(status, mux_playback_id)";

export async function getOrder(id: string): Promise<Order | null> {
  const { data, error } = await supabase.from("orders").select(COLS).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as unknown as Order | null) ?? null;
}

export async function listOrders(): Promise<Order[]> {
  const { data, error } = await supabase.from("orders").select(COLS).neq("status", "draft").order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Order[];
}

export const ORDER_STEPS: { key: OrderStatus | "film"; label: string }[] = [
  { key: "paid", label: "Paid" },
  { key: "film", label: "Film uploaded" },
  { key: "offered", label: "Mentor offered" },
  { key: "accepted", label: "Accepted, in progress" },
  { key: "delivered", label: "Breakdown delivered" },
];

export function statusLabel(o: Order) {
  switch (o.status) {
    case "paid":
      return o.waitlisted_at ? "On the waitlist" : "Paid";
    case "offered":
      return "Waiting on the mentor to accept";
    case "accepted":
      return "In progress";
    case "delivered":
      return "Delivered";
    case "unassigned":
      return "FLP is assigning a mentor";
    case "refunded":
      return "Refunded";
    case "closed":
      return "Closed";
    default:
      return o.status;
  }
}
