import { admin } from "./supabase.js";

export type Tier = "pro" | "pwhl" | "ncaa";

export type Settings = {
  breakdown_prices: Record<Tier, number>;
  mentor_share_pct: Record<Tier, number>;
  session_prices: Record<string, Partial<Record<Tier, number>>>;
  rules: {
    accept_hours: number;
    accept_nudge_hours: number;
    turnaround_hours: number;
    reminder_hours: number[];
    qca_window_days: number;
    review_auto_publish_min: number;
    wait_days_default: number;
    second_choice_required: boolean;
    payout_hold_during_qca: boolean;
    payments_mode?: "stripe" | "free_preview";
    [k: string]: unknown;
  };
  taxonomy: Record<string, unknown>;
  currency: string;
};

let cache: { at: number; value: Settings } | null = null;

// Settings change rarely and every request needs them; cache for a minute.
export async function getSettings(): Promise<Settings> {
  if (cache && Date.now() - cache.at < 60_000) return cache.value;
  const { data, error } = await admin
    .from("settings")
    .select("breakdown_prices, mentor_share_pct, session_prices, rules, taxonomy, currency")
    .eq("id", 1)
    .single();
  if (error || !data) throw new Error("settings unavailable: " + error?.message);
  cache = { at: Date.now(), value: data as Settings };
  return cache.value;
}

// Free preview (admin switch) lets demos and beta testers complete orders without a card.
// Stripe is used when it is configured and the mode is "stripe"; dev always shortcuts.
export function paymentPath(s: Settings, stripeConfigured: boolean, appEnv: string): "stripe" | "free" | "off" {
  const mode = s.rules.payments_mode ?? "stripe";
  if (mode === "stripe" && stripeConfigured) return "stripe";
  if (mode === "free_preview" || appEnv === "dev") return "free";
  return "off";
}

export function shareCents(price: number, pct: number) {
  return Math.round((price * pct) / 100);
}
