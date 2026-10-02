import { api } from "./api";
import { refreshSettings, registerTierNames, type MarketplaceOptions } from "./settings";
import { supabase } from "./supabase";

// Mentor levels, as an admin sees them: every level including private and retired ones.
export type TierAdmin = {
  key: string; name: string; description: string; sort: number; visible: boolean; price_visible: boolean;
  breakdown_price_cents: number; mentor_share_pct: number;
  film_room_30_cents: number | null; film_room_60_cents: number | null; addon_30_cents: number | null; season_arc_cents: number | null;
  archived_at: string | null;
};
export type TierPatch = Partial<Omit<TierAdmin, "key" | "archived_at">>;

export async function listAllTiers(): Promise<TierAdmin[]> {
  const { data, error } = await supabase.from("mentor_tiers").select("key, name, description, sort, visible, price_visible, breakdown_price_cents, mentor_share_pct, film_room_30_cents, film_room_60_cents, addon_30_cents, season_arc_cents, archived_at").order("sort").order("name");
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as TierAdmin[];
  registerTierNames(rows);
  return rows;
}

// Every write refreshes the cached settings so prices and names are right on the next screen.
const after = async <T,>(p: Promise<T>) => { const r = await p; await refreshSettings().catch(() => {}); return r; };
export const createTier = (row: TierPatch & { name: string }) => after(api<{ ok: true; key: string }>("/admin/tiers", { method: "POST", body: JSON.stringify(row) }));
export const updateTier = (key: string, patch: TierPatch) => after(api<{ ok: true }>(`/admin/tiers/${key}`, { method: "PATCH", body: JSON.stringify(patch) }));
export const reorderTiers = (keys: string[]) => after(api<{ ok: true }>("/admin/tiers/reorder", { method: "POST", body: JSON.stringify({ keys }) }));
export const deleteTier = (key: string) => after(api<{ ok: true; archived?: boolean; deleted?: boolean }>(`/admin/tiers/${key}`, { method: "DELETE" }));
export const restoreTier = (key: string) => after(api<{ ok: true }>(`/admin/tiers/${key}/restore`, { method: "POST" }));
export const saveMarketplaceOptions = (marketplace: MarketplaceOptions) => after(api<{ ok: true }>("/admin/settings", { method: "PATCH", body: JSON.stringify({ marketplace }) }));
