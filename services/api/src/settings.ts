import { admin } from "./supabase.js";

export type Tier = string;
export type TierRow = {
  key: string; name: string; description: string; sort: number; visible: boolean; price_visible: boolean;
  breakdown_price_cents: number; mentor_share_pct: number;
  film_room_30_cents: number | null; film_room_60_cents: number | null; addon_30_cents: number | null; season_arc_cents: number | null;
  archived_at: string | null;
  direct_link: boolean; turnaround_hours: number | null; capacity_default: number | null; color: string | null;
};
export const SESSION_FORMAT_COLUMNS = { film_room_30: "film_room_30_cents", film_room_60: "film_room_60_cents", addon_30: "addon_30_cents", season_arc: "season_arc_cents" } as const;

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
  marketplace: Record<string, unknown>;
  tiers: TierRow[];
  currency: string;
};

let cache: { at: number; value: Settings } | null = null;

// Settings change rarely and every request needs them; cache for a minute.
export async function getSettings(): Promise<Settings> {
  if (cache && Date.now() - cache.at < 60_000) return cache.value;
  const [{ data, error }, { data: tiers, error: tierError }] = await Promise.all([
    admin.from("settings").select("rules, taxonomy, marketplace, currency").eq("id", 1).single(),
    admin.from("mentor_tiers").select("key, name, description, sort, visible, price_visible, breakdown_price_cents, mentor_share_pct, film_room_30_cents, film_room_60_cents, addon_30_cents, season_arc_cents, archived_at, direct_link, turnaround_hours, capacity_default, color").order("sort").order("name"),
  ]);
  if (error || !data) throw new Error("settings unavailable: " + error?.message);
  if (tierError) throw new Error("mentor levels unavailable: " + tierError.message);
  const rows = (tiers ?? []) as TierRow[];
  // The per-level maps the pricing code reads, rebuilt from the levels table.
  const session_prices: Record<string, Record<string, number>> = {};
  for (const [format, col] of Object.entries(SESSION_FORMAT_COLUMNS)) {
    session_prices[format] = Object.fromEntries(rows.filter((t) => t[col] != null).map((t) => [t.key, t[col] as number]));
  }
  const value: Settings = {
    ...(data as Pick<Settings, "rules" | "taxonomy" | "marketplace" | "currency">),
    tiers: rows,
    breakdown_prices: Object.fromEntries(rows.map((t) => [t.key, t.breakdown_price_cents])),
    mentor_share_pct: Object.fromEntries(rows.map((t) => [t.key, t.mentor_share_pct])),
    session_prices,
  };
  cache = { at: Date.now(), value };
  return cache.value;
}

// Level and settings edits must be seen at once, not a minute later.
export function invalidateSettings() {
  cache = null;
}

// What a parent pays: the mentor's own price where FLP set one, else the level's.
export type PriceKind = "breakdown" | "film_room_30" | "film_room_60" | "addon_30" | "season_arc";
export const PRICE_KINDS: PriceKind[] = ["breakdown", "film_room_30", "film_room_60", "addon_30", "season_arc"];
export function priceFor(s: Settings, tierKey: string, overrides: Record<string, unknown> | null | undefined, kind: PriceKind): number {
  const o = overrides?.[kind];
  if (typeof o === "number" && Number.isInteger(o) && o >= 0) return o;
  return kind === "breakdown" ? (s.breakdown_prices[tierKey] ?? 0) : (s.session_prices[kind]?.[tierKey] ?? 0);
}
// Hours to deliver a breakdown: the level's own figure where set, else the platform rule.
export function turnaroundHours(s: Settings, tierKey: string | null | undefined): number {
  return s.tiers.find((t) => t.key === tierKey)?.turnaround_hours ?? s.rules.turnaround_hours;
}

// A live level a parent can pay for on their own: exists, not retired, price shown.
export function selfServeTier(s: Settings, key: string | null | undefined): { ok: true; tier: TierRow } | { ok: false; status: 400 | 409; error: string } {
  const tier = s.tiers.find((t) => t.key === key);
  if (!tier || tier.archived_at) return { ok: false, status: 400, error: "this mentor's level is not available right now" };
  if (!tier.price_visible) return { ok: false, status: 409, error: "Pricing for this mentor is by arrangement. Contact FLP and we'll set it up." };
  return { ok: true, tier };
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
