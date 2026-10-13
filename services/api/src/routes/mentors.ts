import { Hono } from "hono";
import { admin, userFromBearer } from "../supabase.js";
import { stripe } from "../stripe.js";
import { appUrl } from "../notify.js";

// Mentor self-service that needs the server: Stripe Connect onboarding and status.
// Profile fields are edited directly through Supabase under RLS (athletes_self_update).
export const mentors = new Hono();

async function mentorOf(authorization: string | undefined) {
  const user = await userFromBearer(authorization);
  if (!user) return null;
  const { data } = await admin.from("athletes").select("user_id, display_name, stripe_account_id, payouts_enabled, status").eq("user_id", user.id).maybeSingle();
  return data ? { user, athlete: data } : null;
}

// POST /mentors/me/connect — create the Express account if needed and return an onboarding link.
mentors.post("/me/connect", async (c) => {
  const m = await mentorOf(c.req.header("authorization"));
  if (!m) return c.json({ error: "sign in as a mentor" }, 401);
  if (!stripe) return c.json({ error: "Payout setup opens once FLP's Stripe account is connected." }, 503);
  if (m.athlete.status !== "approved") return c.json({ error: "payout setup opens after approval" }, 400);
  let accountId = m.athlete.stripe_account_id;
  if (!accountId) {
    const acct = await stripe.accounts.create({
      type: "express",
      country: "US",
      email: m.user.email ?? undefined,
      capabilities: { transfers: { requested: true } },
      business_type: "individual",
      metadata: { athleteId: m.user.id },
    });
    accountId = acct.id;
    await admin.from("athletes").update({ stripe_account_id: accountId }).eq("user_id", m.user.id);
  }
  const link = await stripe.accountLinks.create({
    account: accountId,
    type: "account_onboarding",
    refresh_url: appUrl("/athlete/profile?connect=refresh"),
    return_url: appUrl("/athlete/profile?connect=return"),
  });
  return c.json({ url: link.url });
});

// POST /mentors/me/connect/dashboard — a one-time link into the mentor's own Stripe dashboard (payouts, tax forms, bank details).
mentors.post("/me/connect/dashboard", async (c) => {
  const m = await mentorOf(c.req.header("authorization"));
  if (!m) return c.json({ error: "sign in as a mentor" }, 401);
  if (!stripe || !m.athlete.stripe_account_id) return c.json({ error: "payout setup is not finished yet" }, 400);
  try {
    const link = await stripe.accounts.createLoginLink(m.athlete.stripe_account_id);
    return c.json({ url: link.url });
  } catch (e) {
    return c.json({ error: "Finish payout setup first, then your Stripe dashboard opens here." }, 400);
  }
});

// GET /mentors/me/connect — refresh payouts_enabled from Stripe.
mentors.get("/me/connect", async (c) => {
  const m = await mentorOf(c.req.header("authorization"));
  if (!m) return c.json({ error: "sign in as a mentor" }, 401);
  if (!stripe || !m.athlete.stripe_account_id) return c.json({ configured: Boolean(stripe), connected: false, payouts_enabled: false });
  const acct = await stripe.accounts.retrieve(m.athlete.stripe_account_id);
  const enabled = Boolean(acct.payouts_enabled);
  if (enabled !== m.athlete.payouts_enabled) await admin.from("athletes").update({ payouts_enabled: enabled }).eq("user_id", m.user.id);
  return c.json({ configured: true, connected: true, payouts_enabled: enabled, requirements: acct.requirements?.currently_due ?? [] });
});

// --- Career history (U-19) -------------------------------------------------------------------------
// The mentor's seasons, awards and a one-line note, replaced as one unit. Rows are validated here and
// again by the database's checks; the replace is a single transaction so a bad row changes nothing.
const SEASON_RE = /^\d{4}(-\d{2})?$/;
const CAREER_MAX_ROWS = 40;
const AWARDS_MAX = 20;

type CareerIn = { season?: unknown; team?: unknown; league?: unknown; games?: unknown; goals?: unknown; assists?: unknown; points?: unknown; pim?: unknown; gaa?: unknown; sv_pct?: unknown; visible?: unknown };

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const intIn = (v: unknown, max: number): number | null | false => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).trim());
  if (!Number.isInteger(n) || n < 0 || n > max) return false;
  return n;
};
const numIn = (v: unknown, max: number): number | null | false => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).trim());
  if (!Number.isFinite(n) || n < 0 || n > max) return false;
  return n;
};

mentors.put("/me/career", async (c) => {
  const me = await mentorOf(c.req.header("authorization"));
  if (!me) return c.json({ error: "mentors only" }, 403);
  const { data: a } = await admin.from("athletes").select("positions").eq("user_id", me.user.id).maybeSingle();
  const positions = ((a?.positions ?? []) as string[]);
  const goalie = positions.includes("goalie");
  const skater = positions.some((p) => p !== "goalie");

  const body = (await c.req.json().catch(() => ({}))) as { rows?: unknown; awards?: unknown; career_note?: unknown; confirmed?: unknown };
  if (body.confirmed !== true) return c.json({ error: "Tick \"I confirm this information is accurate\" before saving." }, 400);
  const rowsIn = Array.isArray(body.rows) ? (body.rows as CareerIn[]) : [];
  if (rowsIn.length > CAREER_MAX_ROWS) return c.json({ error: `You can list up to ${CAREER_MAX_ROWS} seasons. Hide or remove the rest.` }, 400);

  const rows: Record<string, unknown>[] = [];
  for (let i = 0; i < rowsIn.length; i++) {
    const r = rowsIn[i] ?? {};
    const n = i + 1;
    const season = str(r.season, 12);
    if (!SEASON_RE.test(season)) return c.json({ error: `Row ${n}: the season should look like 2021-22 or 2021.` }, 400);
    const team = str(r.team, 80);
    if (!team) return c.json({ error: `Row ${n}: enter the team.` }, 400);
    const league = str(r.league, 60) || null;
    const games = intIn(r.games, 200);
    if (games === false) return c.json({ error: `Row ${n}: games should be a whole number up to 200.` }, 400);
    const counts = { goals: intIn(r.goals, 500), assists: intIn(r.assists, 500), points: intIn(r.points, 1000), pim: intIn(r.pim, 1000) };
    for (const [k, v] of Object.entries(counts)) if (v === false) return c.json({ error: `Row ${n}: ${k} should be a whole number.` }, 400);
    let gaa = numIn(r.gaa, 20);
    let sv = numIn(r.sv_pct, 100);
    if (gaa === false) return c.json({ error: `Row ${n}: goals-against average should be a number like 2.45.` }, 400);
    if (sv === false) return c.json({ error: `Row ${n}: save percentage should be a number like .915.` }, 400);
    if (sv !== null && sv > 1) sv = sv <= 100 ? Math.round((sv / 100) * 1000) / 1000 : null;
    rows.push({
      season, team, league, games,
      goals: skater ? counts.goals : null, assists: skater ? counts.assists : null, points: skater ? counts.points : null, pim: skater ? counts.pim : null,
      gaa: goalie ? gaa : null, sv_pct: goalie ? sv : null,
      visible: r.visible !== false,
    });
  }

  const awardsIn = Array.isArray(body.awards) ? (body.awards as unknown[]) : [];
  const awards = awardsIn.map((x) => str(x, 120)).filter(Boolean);
  if (awards.length > AWARDS_MAX) return c.json({ error: `Up to ${AWARDS_MAX} awards.` }, 400);
  const note = str(body.career_note, 120) || null;

  const { error } = await admin.rpc("replace_mentor_career", { p_athlete: me.user.id, p_rows: rows, p_awards: awards, p_note: note });
  if (error) {
    const msg = /40 seasons/.test(error.message) ? `You can list up to ${CAREER_MAX_ROWS} seasons.` : /season/.test(error.message) ? "A season should look like 2021-22." : "That didn't save. Check the rows and try again.";
    return c.json({ error: msg }, 400);
  }
  return c.json({ ok: true, rows: rows.length, awards: awards.length });
});
