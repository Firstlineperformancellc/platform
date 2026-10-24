import { Hono } from "hono";
import { admin, userFromBearer } from "../supabase.js";

// Sign-ups by program: which teams and clubs families come from, read off the youth athlete's
// "current team". Admin reads the report (JSON or CSV); any signed-in user may ask for spelling
// suggestions so the youth athlete form offers the names already in use.
export const programsAdmin = new Hono(); // mounted under /admin
export const programs = new Hono(); // mounted under /programs

async function requireAdmin(authorization: string | undefined) {
  const user = await userFromBearer(authorization);
  if (!user) return null;
  const { data } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  return data?.role === "admin" ? user : null;
}

export type ProgramRow = { team: string; players: number; parents: number; orders: number; sessions: number; last_signup: string | null };

const NO_TEAM = "(no team given)";
// Grouping key: whitespace trimmed and collapsed, case folded. The row shows the most common raw spelling.
const fold = (team: string) => team.trim().replace(/\s+/g, " ").toLowerCase();

type Page<T> = PromiseLike<{ data: unknown[] | null; error: { message: string } | null }> & { then: PromiseLike<{ data: T[] | null; error: { message: string } | null }>["then"] };
// Supabase answers at most 1000 rows per call; walk the table a page at a time.
async function all<T>(page: (from: number, to: number) => Page<T>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await page(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) return out;
  }
}

async function report(): Promise<ProgramRow[]> {
  type P = { id: string; parent_id: string; current_team: string; created_at: string };
  const players = await all<P>((a, b) => admin.from("players").select("id, parent_id, current_team, created_at").order("id").range(a, b));
  const paid = await all<{ player_id: string }>((a, b) => admin.from("orders").select("player_id").not("paid_at", "is", null).order("id").range(a, b));
  const held = await all<{ player_id: string }>((a, b) => admin.from("sessions").select("player_id").not("status", "in", "(cancelled,expired,declined)").order("id").range(a, b));

  type Agg = { spellings: Map<string, number>; players: number; parents: Set<string>; orders: number; sessions: number; last: string | null };
  const groups = new Map<string, Agg>();
  const keyOf = new Map<string, string>();
  for (const p of players) {
    const key = fold(p.current_team ?? "");
    keyOf.set(p.id, key);
    const g = groups.get(key) ?? { spellings: new Map(), players: 0, parents: new Set(), orders: 0, sessions: 0, last: null };
    const raw = (p.current_team ?? "").trim();
    g.spellings.set(raw, (g.spellings.get(raw) ?? 0) + 1);
    g.players += 1;
    g.parents.add(p.parent_id);
    if (!g.last || p.created_at > g.last) g.last = p.created_at;
    groups.set(key, g);
  }
  for (const o of paid) {
    const g = groups.get(keyOf.get(o.player_id) ?? "");
    if (g) g.orders += 1;
  }
  for (const s of held) {
    const g = groups.get(keyOf.get(s.player_id) ?? "");
    if (g) g.sessions += 1;
  }

  const rows: ProgramRow[] = [];
  let blank: ProgramRow | null = null;
  for (const [key, g] of groups) {
    const team = key === "" ? NO_TEAM : [...g.spellings.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))[0][0];
    const row = { team, players: g.players, parents: g.parents.size, orders: g.orders, sessions: g.sessions, last_signup: g.last };
    if (key === "") blank = row;
    else rows.push(row);
  }
  rows.sort((x, y) => y.players - x.players || x.team.localeCompare(y.team));
  if (blank) rows.push(blank); // families who left the team blank always sit at the bottom
  return rows;
}

// GET /admin/programs
programsAdmin.get("/programs", async (c) => {
  const me = await requireAdmin(c.req.header("authorization"));
  if (!me) return c.json({ error: "admin only" }, 403);
  return c.json({ programs: await report() });
});

// GET /admin/programs.csv — the same rows for a spreadsheet. Every field is quoted; a value that
// starts like a formula gets an apostrophe so a spreadsheet shows it as text.
programsAdmin.get("/programs.csv", async (c) => {
  const me = await requireAdmin(c.req.header("authorization"));
  if (!me) return c.json({ error: "admin only" }, 403);
  const cell = (v: unknown) => {
    let s = String(v ?? "");
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  };
  const rows = await report();
  const lines = [
    ["team", "youth_athletes", "parents", "orders", "film_rooms", "last_signup"],
    ...rows.map((r) => [r.team, r.players, r.parents, r.orders, r.sessions, r.last_signup ?? ""]),
  ];
  const csv = lines.map((l) => l.map(cell).join(",")).join("\r\n") + "\r\n";
  const day = new Date().toISOString().slice(0, 10);
  return c.body(csv, 200, { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="flp-programs-${day}.csv"` });
});

// GET /programs/suggest?q=lit — up to 8 team names already on file that start with what was typed,
// most common spelling of each, busiest first. Any signed-in user; it reveals team names only.
programs.get("/suggest", async (c) => {
  const user = await userFromBearer(c.req.header("authorization"));
  if (!user) return c.json({ error: "sign in first" }, 401);
  const q = (c.req.query("q") ?? "").replace(/\*/g, "").trim().replace(/\s+/g, " ").slice(0, 60);
  if (!q) return c.json({ teams: [] });
  const pattern = q.replace(/[\\%_]/g, (ch) => `\\${ch}`) + "%";
  const { data, error } = await admin.from("players").select("current_team").ilike("current_team", pattern).limit(500);
  if (error) return c.json({ error: error.message }, 500);
  const byKey = new Map<string, Map<string, number>>();
  for (const r of (data ?? []) as { current_team: string }[]) {
    const raw = r.current_team.trim();
    if (!raw) continue;
    const spellings = byKey.get(fold(raw)) ?? new Map<string, number>();
    spellings.set(raw, (spellings.get(raw) ?? 0) + 1);
    byKey.set(fold(raw), spellings);
  }
  const teams = [...byKey.values()]
    .map((spellings) => {
      const [name] = [...spellings.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))[0];
      return { name, n: [...spellings.values()].reduce((a, b) => a + b, 0) };
    })
    .sort((x, y) => y.n - x.n || x.name.localeCompare(y.name))
    .slice(0, 8)
    .map((t) => t.name);
  return c.json({ teams });
});
