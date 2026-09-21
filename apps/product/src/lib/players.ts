import { supabase } from "./supabase";
import type { HockeyPosition } from "./types";

export type Player = {
  id: string;
  parent_id: string;
  first_name: string;
  last_name: string;
  age_group: string;
  position: HockeyPosition;
  skill_level: string;
  current_team: string;
  notes: string;
  created_at: string;
};

export const PLAYER_COLS = "id, parent_id, first_name, last_name, age_group, position, skill_level, current_team, notes, created_at";

export async function listPlayers(): Promise<Player[]> {
  const { data, error } = await supabase.from("players").select(PLAYER_COLS).order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []) as Player[];
}

export async function getPlayer(id: string): Promise<Player | null> {
  const { data } = await supabase.from("players").select(PLAYER_COLS).eq("id", id).maybeSingle();
  return (data as Player | null) ?? null;
}

export type PlayerInput = Omit<Player, "id" | "parent_id" | "created_at">;

export async function savePlayer(input: PlayerInput, id?: string): Promise<Player> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("sign in first");
  const row = { ...input, parent_id: auth.user.id };
  const q = id ? supabase.from("players").update(row).eq("id", id) : supabase.from("players").insert(row);
  const { data, error } = await q.select(PLAYER_COLS).single();
  if (error) throw new Error(error.message);
  return data as Player;
}

export function playerName(p: Pick<Player, "first_name" | "last_name">) {
  const li = p.last_name?.trim() ? ` ${p.last_name.trim()[0]}.` : "";
  return `${p.first_name}${li}`;
}
