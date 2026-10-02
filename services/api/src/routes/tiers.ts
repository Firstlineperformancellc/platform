import { Hono } from "hono";
import { admin, userFromBearer } from "../supabase.js";
import { getSettings, invalidateSettings } from "../settings.js";

// Mentor levels: add, edit, order, hide, retire. Admin only; every change is audited.
export const tiers = new Hono();

async function requireAdmin(authorization: string | undefined) {
  const user = await userFromBearer(authorization);
  if (!user) return null;
  const { data } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  return data?.role === "admin" ? user : null;
}
const audit = (actorId: string, action: string, key: string, meta: Record<string, unknown> = {}) =>
  admin.from("audit_log").insert({ actor_id: actorId, action, target_type: "mentor_tier", target_id: null, meta: { key, ...meta } });

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40);
const MONEY = ["breakdown_price_cents", "film_room_30_cents", "film_room_60_cents", "addon_30_cents", "season_arc_cents"] as const;

// Turn a request body into a row patch, or an error string.
function fields(body: Record<string, unknown>): Record<string, unknown> | string {
  const p: Record<string, unknown> = {};
  if (body.name !== undefined) {
    if (typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 40) return "a level needs a name of 1 to 40 characters";
    p.name = body.name.trim();
  }
  if (body.description !== undefined) p.description = String(body.description ?? "").trim().slice(0, 200);
  if (body.sort !== undefined) {
    if (!Number.isInteger(body.sort)) return "sort must be a whole number";
    p.sort = body.sort;
  }
  for (const k of ["visible", "price_visible"] as const) {
    if (body[k] !== undefined) {
      if (typeof body[k] !== "boolean") return `${k} must be true or false`;
      p[k] = body[k];
    }
  }
  for (const k of MONEY) {
    if (body[k] === undefined) continue;
    if (body[k] === null && k !== "breakdown_price_cents") { p[k] = null; continue; }
    if (!Number.isInteger(body[k]) || (body[k] as number) < 0 || (body[k] as number) > 100_000_00) return "prices must be whole cents between 0 and 100,000 dollars";
    p[k] = body[k];
  }
  if (body.mentor_share_pct !== undefined) {
    if (!Number.isInteger(body.mentor_share_pct) || (body.mentor_share_pct as number) < 0 || (body.mentor_share_pct as number) > 100) return "the mentor share is a whole percent from 0 to 100";
    p.mentor_share_pct = body.mentor_share_pct;
  }
  return p;
}

// POST /admin/tiers { name, key?, ... }
tiers.post("/", async (c) => {
  const me = await requireAdmin(c.req.header("authorization"));
  if (!me) return c.json({ error: "admin only" }, 403);
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const p = fields(body);
  if (typeof p === "string") return c.json({ error: p }, 400);
  if (!p.name) return c.json({ error: "a level needs a name" }, 400);
  const s = await getSettings();
  let key = typeof body.key === "string" && body.key.trim() ? slug(body.key) : slug(p.name as string);
  if (!/^[a-z0-9_]{2,40}$/.test(key)) return c.json({ error: "that name cannot be turned into a key; use letters or numbers" }, 400);
  if (s.tiers.some((t) => t.key === key)) {
    let n = 2;
    while (s.tiers.some((t) => t.key === `${key}_${n}`)) n++;
    key = `${key}_${n}`;
  }
  if (p.sort === undefined) p.sort = (Math.max(0, ...s.tiers.map((t) => t.sort)) || 0) + 10; // new levels land at the bottom
  const { error } = await admin.from("mentor_tiers").insert({ key, ...p });
  if (error) return c.json({ error: error.message }, 500);
  invalidateSettings();
  await audit(me.id, "tier.create", key, p);
  return c.json({ ok: true, key });
});

// POST /admin/tiers/reorder { keys: [...] }  — top of the list is the top of the hierarchy
tiers.post("/reorder", async (c) => {
  const me = await requireAdmin(c.req.header("authorization"));
  if (!me) return c.json({ error: "admin only" }, 403);
  const { keys } = (await c.req.json().catch(() => ({}))) as { keys?: unknown };
  if (!Array.isArray(keys) || keys.some((k) => typeof k !== "string")) return c.json({ error: "keys must be a list" }, 400);
  for (const [i, key] of (keys as string[]).entries()) await admin.from("mentor_tiers").update({ sort: (i + 1) * 10 }).eq("key", key);
  invalidateSettings();
  await audit(me.id, "tier.reorder", (keys as string[]).join(","), {});
  return c.json({ ok: true });
});

// PATCH /admin/tiers/:key
tiers.patch("/:key", async (c) => {
  const me = await requireAdmin(c.req.header("authorization"));
  if (!me) return c.json({ error: "admin only" }, 403);
  const key = c.req.param("key");
  const p = fields((await c.req.json().catch(() => ({}))) as Record<string, unknown>);
  if (typeof p === "string") return c.json({ error: p }, 400);
  if (Object.keys(p).length === 0) return c.json({ error: "nothing to change" }, 400);
  const { data, error } = await admin.from("mentor_tiers").update(p).eq("key", key).select("key");
  if (error) return c.json({ error: error.message }, 500);
  if (!data?.length) return c.json({ error: "no such level" }, 404);
  invalidateSettings();
  await audit(me.id, "tier.update", key, p);
  return c.json({ ok: true });
});

// POST /admin/tiers/:key/restore — bring a retired level back
tiers.post("/:key/restore", async (c) => {
  const me = await requireAdmin(c.req.header("authorization"));
  if (!me) return c.json({ error: "admin only" }, 403);
  const key = c.req.param("key");
  const { data } = await admin.from("mentor_tiers").update({ archived_at: null }).eq("key", key).select("key");
  if (!data?.length) return c.json({ error: "no such level" }, 404);
  invalidateSettings();
  await audit(me.id, "tier.restore", key, {});
  return c.json({ ok: true });
});

// DELETE /admin/tiers/:key — refused while mentors sit on it; retired (kept for history) when past
// orders or sessions carry it; deleted outright when nothing ever used it.
tiers.delete("/:key", async (c) => {
  const me = await requireAdmin(c.req.header("authorization"));
  if (!me) return c.json({ error: "admin only" }, 403);
  const key = c.req.param("key");
  const { data: row } = await admin.from("mentor_tiers").select("key").eq("key", key).maybeSingle();
  if (!row) return c.json({ error: "no such level" }, 404);
  const count = async (table: string, extra?: (q: any) => any) => {
    let q = admin.from(table).select("*", { count: "exact", head: true }).eq("tier", key);
    if (extra) q = extra(q);
    return (await q).count ?? 0;
  };
  const active = await count("athletes", (q) => q.is("deleted_at", null));
  if (active > 0) return c.json({ error: `${active} mentor${active === 1 ? " is" : "s are"} on this level. Move them to another level first.`, mentors: active }, 409);
  const referenced = (await count("athletes")) + (await count("orders")) + (await count("sessions")) + (await count("session_packs"));
  if (referenced > 0) {
    await admin.from("mentor_tiers").update({ archived_at: new Date().toISOString(), visible: false }).eq("key", key);
    invalidateSettings();
    await audit(me.id, "tier.archive", key, { referenced });
    return c.json({ ok: true, archived: true });
  }
  const { error } = await admin.from("mentor_tiers").delete().eq("key", key);
  if (error) return c.json({ error: error.message }, 500);
  invalidateSettings();
  await audit(me.id, "tier.delete", key, {});
  return c.json({ ok: true, deleted: true });
});
