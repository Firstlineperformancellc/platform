import { useEffect, useState } from "react";
import { supabase } from "./supabase";

// Everything Alex can change without a deploy lives in the settings row: prices, splits,
// rules, and the taxonomy lists. Read once per app load, cached in memory.

// A mentor level. Levels are data now (admin → Marketplace), so the key is any string.
export type Tier = string;
export type TierInfo = {
  key: string; name: string; description: string; sort: number; price_visible: boolean;
  breakdown_price_cents: number | null; film_room_30_cents: number | null; film_room_60_cents: number | null; addon_30_cents: number | null; season_arc_cents: number | null;
  visible?: boolean; color?: string | null; turnaround_hours?: number | null;
};
// What the marketplace tiles show and how the list is ordered.
export type MarketplaceOptions = {
  show_price: boolean; show_rating: boolean; show_turnaround: boolean; show_availability: boolean; show_badges: boolean; show_positions: boolean; show_bio: boolean;
  group_by_tier: boolean; sort: "tier" | "rating" | "name";
};
export const MARKETPLACE_DEFAULTS: MarketplaceOptions = { show_price: true, show_rating: true, show_turnaround: true, show_availability: true, show_badges: true, show_positions: true, show_bio: true, group_by_tier: false, sort: "tier" };
export const marketOptions = (s: Settings | null | undefined): MarketplaceOptions => ({ ...MARKETPLACE_DEFAULTS, ...((s?.marketplace as Partial<MarketplaceOptions> | undefined) ?? {}) });
export type Level = { key: string; label: string; tier: Tier | null };

export type Settings = {
  tiers: TierInfo[];
  marketplace: Partial<MarketplaceOptions>;
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
    capacity_default: number;
    capacity_max: number;
    wait_days_default: number;
    second_choice_required: boolean;
    session_cancel_hours: number;
    session_grace_minutes: number;
    courtesy_rebooks: number;
    recap_due_hours: number;
    recording_retention_days: number;
    payout_hold_during_qca: boolean;
    mentors_may_decline_sessions: boolean;
    parent_present_default: boolean;
    session_slot_minutes?: number;
    session_min_lead_hours?: number;
    session_accept_hours?: number;
    session_book_ahead_days?: number;
    addon_window_days?: number;
    season_arc_sessions?: number;
    season_arc_weeks?: number;
    session_reminder_hours?: number[];
    payments_mode?: "stripe" | "free_preview";
  };
  taxonomy: {
    age_groups: string[];
    positions: { key: "forward" | "defense" | "goalie"; label: string }[];
    skill_levels: string[];
    focus_skater: string[];
    focus_goalie: string[];
    levels: Level[];
    badges: { key: string; label: string }[];
  };
  currency: string;
};

// Level names by key. Filled when settings load (and by the admin shell, which also knows private
// and retired levels); an unknown key reads as itself rather than "undefined".
const tierNames: Record<string, string> = { pro: "Pro", pwhl: "PWHL", ncaa: "NCAA" };
export const TIER_LABEL: Record<Tier, string> = new Proxy(tierNames, { get: (t, k) => (typeof k === "string" ? (t[k] ?? k) : undefined) });
export function registerTierNames(rows: { key: string; name: string }[]) {
  for (const r of rows) tierNames[r.key] = r.name;
}
const FORMAT_COLUMNS = { film_room_30: "film_room_30_cents", film_room_60: "film_room_60_cents", addon_30: "addon_30_cents", season_arc: "season_arc_cents" } as const;

let cache: Settings | null = null;
let inflight: Promise<Settings> | null = null;

export async function loadSettings(): Promise<Settings> {
  if (cache) return cache;
  if (!inflight) {
    inflight = (async () => {
      const [{ data, error }, { data: tiers }] = await Promise.all([
        supabase.from("settings").select("rules, taxonomy, marketplace, currency").eq("id", 1).single(),
        supabase.from("mentor_tiers_public").select("key, name, description, sort, price_visible, breakdown_price_cents, film_room_30_cents, film_room_60_cents, addon_30_cents, season_arc_cents, visible, color, turnaround_hours").order("sort").order("name"),
      ]);
      if (error || !data) throw new Error(error?.message ?? "settings unavailable");
      const rows = (tiers ?? []) as TierInfo[];
      registerTierNames(rows);
      // The per-level price maps the screens read, rebuilt from the levels.
      const session_prices: Record<string, Record<string, number>> = {};
      for (const [format, col] of Object.entries(FORMAT_COLUMNS)) session_prices[format] = Object.fromEntries(rows.filter((t) => t[col] != null).map((t) => [t.key, t[col] as number]));
      cache = {
        ...(data as Pick<Settings, "rules" | "taxonomy" | "marketplace" | "currency">),
        tiers: rows,
        breakdown_prices: Object.fromEntries(rows.filter((t) => t.breakdown_price_cents != null).map((t) => [t.key, t.breakdown_price_cents as number])),
        mentor_share_pct: {},
        session_prices,
      };
      return cache;
    })();
  }
  return inflight;
}

// After an admin changes levels or tile options, drop the cache so the next screen reads fresh values.
export function refreshSettings() {
  cache = null;
  inflight = null;
  return loadSettings();
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings | null>(cache);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (settings) return;
    loadSettings().then(setSettings).catch((e) => setError(e.message));
  }, [settings]);
  return { settings, error };
}

export function money(cents: number, currency = "usd") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase(), maximumFractionDigits: 0 }).format(
    cents / 100,
  );
}

export function levelLabel(settings: Settings | null, key: string | null | undefined) {
  return settings?.taxonomy.levels.find((l) => l.key === key)?.label ?? key ?? "";
}
