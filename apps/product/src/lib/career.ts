import { api } from "./api";
import { supabase } from "./supabase";
import type { HockeyPosition } from "./types";

// A mentor's career history (U-19). The mentor enters it, with a paste helper for text copied from
// their Elite Prospects page. Nothing is fetched from anywhere; the parser only reads pasted text.

export type CareerRow = {
  season: string; team: string; league: string | null;
  games: number | null; goals: number | null; assists: number | null; points: number | null; pim: number | null;
  gaa: number | null; sv_pct: number | null; visible: boolean;
};
export type CareerPublicRow = CareerRow & { id: string; athlete_id: string; sort_order: number };

export const SEASON_RE = /^\d{4}(-\d{2})?$/;
export const CAREER_MAX_ROWS = 40;
export const AWARDS_MAX = 20;
export const emptyRow = (): CareerRow => ({ season: "", team: "", league: null, games: null, goals: null, assists: null, points: null, pim: null, gaa: null, sv_pct: null, visible: true });

export const hasGoalie = (positions: HockeyPosition[]) => positions.includes("goalie");
export const hasSkater = (positions: HockeyPosition[]) => positions.some((p) => p !== "goalie");

const COLS = "season, team, league, games, goals, assists, points, pim, gaa, sv_pct, visible";
// Postgres numerics arrive as strings through PostgREST.
const numeric = <T extends { gaa: unknown; sv_pct: unknown }>(r: T): T => ({ ...r, gaa: r.gaa == null ? null : Number(r.gaa), sv_pct: r.sv_pct == null ? null : Number(r.sv_pct) });

export async function listMyCareer(): Promise<CareerRow[]> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return [];
  const { data } = await supabase.from("mentor_career").select(COLS).eq("athlete_id", auth.user.id).order("sort_order");
  return ((data ?? []) as unknown as CareerRow[]).map(numeric);
}

export async function listCareerPublic(athleteId: string): Promise<CareerPublicRow[]> {
  const { data } = await supabase.from("mentor_career_public").select("id, athlete_id, sort_order, " + COLS.replace(", visible", "")).eq("athlete_id", athleteId).order("sort_order");
  return ((data ?? []) as unknown as CareerPublicRow[]).map((r) => ({ ...numeric(r), visible: true }));
}

export const saveCareer = (rows: CareerRow[], awards: string[], careerNote: string | null) =>
  api<{ ok: true; rows: number; awards: number }>("/mentors/me/career", { method: "PUT", body: JSON.stringify({ rows, awards, career_note: careerNote, confirmed: true }) });

// ---- paste parser -------------------------------------------------------------------------------
// Accepts the stats table copied from an Elite Prospects page (tab-separated, one row per line), or
// lines separated by "|" or two-plus spaces. Columns: Season, Team, League, then numbers: skaters
// GP G A TP PIM (anything after is ignored); goalies GP GAA SV%. A line with no season inherits the
// previous line's season, as Elite Prospects prints a second team in the same season.
const normSeason = (s: string): string | null => {
  const t = s.trim();
  const m = t.match(/^(\d{4})\s*[-–/]\s*(\d{2,4})$/);
  if (m) return `${m[1]}-${m[2]!.slice(-2)}`;
  return /^\d{4}$/.test(t) ? t : null;
};
const num = (s: string): number | null => {
  const t = s.replace(/[,+%]/g, "").trim();
  if (t === "" || t === "-" || t === "–") return null;
  return /^-?\d*\.?\d+$/.test(t) ? Number(t) : null;
};
const intOrNull = (v: number | undefined) => (v !== undefined && Number.isInteger(v) && v >= 0 ? v : null);
const svOrNull = (v: number | undefined) => {
  if (v === undefined || v < 0) return null;
  if (v > 1) return v <= 100 ? Math.round((v / 100) * 1000) / 1000 : null;
  return Math.round(v * 1000) / 1000;
};

export function parseCareerPaste(text: string, goalie: boolean): { rows: CareerRow[]; skipped: number } {
  const rows: CareerRow[] = [];
  let skipped = 0;
  let lastSeason: string | null = null;
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    if (rows.length >= CAREER_MAX_ROWS) { skipped++; continue; }
    const cells = (raw.includes("\t") ? raw.split("\t") : raw.includes("|") ? raw.split("|") : raw.trim().split(/\s{2,}/)).map((c) => c.trim());
    const line = cells.join(" ");
    if (/^(season|team|league|totals?|regular season|playoffs?)\b/i.test(line) || (/\bGP\b/.test(line) && !/\d{4}/.test(line))) { skipped++; continue; }
    let i = 0;
    let season: string | null = null;
    const first = cells[0] ?? "";
    const sn = normSeason(first);
    if (sn) { season = sn; i = 1; }
    else if (first === "") { season = lastSeason; i = 1; }
    else season = lastSeason;
    const team = cells[i] ?? "";
    if (!season || !team || num(team) !== null) { skipped++; continue; }
    let league: string | null = null;
    let j = i + 1;
    if (cells[j] !== undefined && cells[j] !== "" && num(cells[j]!) === null) { league = cells[j]!; j++; }
    const nums = cells.slice(j).map(num).filter((v): v is number => v !== null);
    const row = emptyRow();
    row.season = season; row.team = team.slice(0, 80); row.league = league ? league.slice(0, 60) : null;
    row.games = intOrNull(nums[0]);
    if (goalie) { row.gaa = nums[1] !== undefined && nums[1] >= 0 ? Math.round(nums[1] * 100) / 100 : null; row.sv_pct = svOrNull(nums[2]); }
    else { row.goals = intOrNull(nums[1]); row.assists = intOrNull(nums[2]); row.points = intOrNull(nums[3]); row.pim = intOrNull(nums[4]); }
    rows.push(row);
    lastSeason = season;
  }
  return { rows, skipped };
}

export const fmtSv = (v: number | null) => (v == null ? "" : v.toFixed(3).replace(/^0/, ""));
export const fmtGaa = (v: number | null) => (v == null ? "" : v.toFixed(2));
