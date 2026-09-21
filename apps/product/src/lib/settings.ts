import { useEffect, useState } from "react";
import { supabase } from "./supabase";

// Everything Alex can change without a deploy lives in the settings row: prices, splits,
// rules, and the taxonomy lists. Read once per app load, cached in memory.

export type Tier = "pro" | "pwhl" | "ncaa";
export type Level = { key: string; label: string; tier: Tier | null };

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

export const TIER_LABEL: Record<Tier, string> = { pro: "Pro", pwhl: "PWHL", ncaa: "NCAA" };

let cache: Settings | null = null;
let inflight: Promise<Settings> | null = null;

export async function loadSettings(): Promise<Settings> {
  if (cache) return cache;
  if (!inflight) {
    inflight = (async () => {
      const { data, error } = await supabase
        .from("settings")
        .select("breakdown_prices, mentor_share_pct, session_prices, rules, taxonomy, currency")
        .eq("id", 1)
        .single();
      if (error || !data) throw new Error(error?.message ?? "settings unavailable");
      cache = data as Settings;
      return cache;
    })();
  }
  return inflight;
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
