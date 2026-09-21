import { Hono } from "hono";
import { admin, userFromBearer } from "../supabase.js";
import { getSettings } from "../settings.js";
import { renderWorksheetPdf, validateWorksheet } from "../worksheet.js";
import { putWorksheetPdf, signedWorksheetUrl } from "../storage.js";
import { appUrl, notify } from "../notify.js";

export const breakdowns = new Hono();

async function levelLabel(key: string | null) {
  if (!key) return "";
  const s = await getSettings();
  const levels = (s.taxonomy.levels as { key: string; label: string }[]) ?? [];
  return levels.find((l) => l.key === key)?.label ?? key;
}

// POST /breakdowns/deliver — the mentor submits the recorded breakdown plus the worksheet.
// Marks the job delivered (on time or not), opens the payout ledger row, renders the PDF, notifies.
breakdowns.post("/deliver", async (c) => {
  const user = await userFromBearer(c.req.header("authorization"));
  if (!user) return c.json({ error: "sign in first" }, 401);
  const body = (await c.req.json().catch(() => ({}))) as { jobId?: string; mediaId?: string; worksheet?: unknown };
  if (!body.jobId || !body.mediaId) return c.json({ error: "jobId and mediaId are required" }, 400);

  const { data: job } = await admin
    .from("jobs")
    .select("id, status, athlete_id, due_at, order_id, orders(id, parent_id, player_id, mentor_share_cents, position, age_group)")
    .eq("id", body.jobId)
    .maybeSingle();
  const j = job as unknown as { id: string; status: string; athlete_id: string | null; due_at: string | null; order_id: string; orders: { id: string; parent_id: string; player_id: string; mentor_share_cents: number | null; position: string; age_group: string } } | null;
  if (!j || j.athlete_id !== user.id) return c.json({ error: "job not found" }, 404);
  if (j.status !== "accepted") return c.json({ error: `job is ${j.status}, not accepted` }, 400);

  const { data: media } = await admin.from("media").select("id, owner_id, purpose, status").eq("id", body.mediaId).maybeSingle();
  if (!media || media.owner_id !== user.id || media.purpose !== "breakdown") return c.json({ error: "breakdown video not found" }, 404);
  if (media.status === "errored") return c.json({ error: "the breakdown video failed to process; upload it again" }, 400);

  const v = validateWorksheet(body.worksheet);
  if (!v.ok) return c.json({ error: v.error }, 400);

  const now = new Date();
  const onTime = j.due_at ? now.getTime() <= new Date(j.due_at).getTime() : true;

  const { data: existing } = await admin.from("breakdowns").select("id").eq("job_id", j.id).maybeSingle();
  if (existing) return c.json({ error: "this job was already delivered" }, 400);

  const { data: bd, error } = await admin
    .from("breakdowns")
    .insert({ job_id: j.id, media_id: media.id, worksheet: v.worksheet, delivered_at: now.toISOString() })
    .select("id")
    .single();
  if (error || !bd) return c.json({ error: error?.message ?? "could not save breakdown" }, 500);

  await admin.from("jobs").update({ status: "delivered", delivered_at: now.toISOString(), on_time: onTime }).eq("id", j.id);
  await admin.from("orders").update({ status: "delivered" }).eq("id", j.order_id);

  // Payout ledger: owed now; timing of the actual transfer is an admin action until the rule is set.
  if (j.orders.mentor_share_cents) {
    await admin.from("payouts").insert({ athlete_id: user.id, job_id: j.id, amount_cents: j.orders.mentor_share_cents, status: "owed" });
  }

  // Branded PDF of the worksheet.
  try {
    const [{ data: player }, { data: mentor }] = await Promise.all([
      admin.from("players").select("first_name, last_name").eq("id", j.orders.player_id).maybeSingle(),
      admin.from("athletes").select("display_name, highest_level, current_team").eq("user_id", user.id).maybeSingle(),
    ]);
    const pdf = await renderWorksheetPdf(
      {
        playerName: player ? `${player.first_name}${player.last_name ? ` ${player.last_name[0]}.` : ""}` : "Youth athlete",
        ageGroup: j.orders.age_group,
        position: j.orders.position[0].toUpperCase() + j.orders.position.slice(1),
        mentorName: mentor?.display_name ?? "FLP Mentor",
        mentorLevel: [await levelLabel(mentor?.highest_level ?? null), mentor?.current_team].filter(Boolean).join(", "),
        date: now.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
      },
      v.worksheet,
    );
    const path = `${j.orders.parent_id}/${bd.id}.pdf`;
    await putWorksheetPdf(path, pdf);
    await admin.from("breakdowns").update({ worksheet_pdf_path: path }).eq("id", bd.id);
  } catch (err) {
    console.error("worksheet pdf failed:", (err as Error).message);
  }

  await notify(j.orders.parent_id, "breakdown.delivered", "Your breakdown is ready",
    `<p>Your FLP Mentor delivered the breakdown and the Player Development Worksheet.</p><p><a href="${appUrl(`/parent/orders/${j.order_id}`)}" style="color:#d4a32c">Watch it</a></p>`,
    { targetId: j.order_id });

  return c.json({ ok: true, breakdownId: bd.id, onTime });
});

async function canSeeBreakdown(userId: string, breakdownId: string) {
  const { data } = await admin
    .from("breakdowns")
    .select("id, job_id, worksheet_pdf_path, delivered_at, jobs(athlete_id, orders(parent_id))")
    .eq("id", breakdownId)
    .maybeSingle();
  const b = data as unknown as { id: string; job_id: string; worksheet_pdf_path: string | null; delivered_at: string; jobs: { athlete_id: string | null; orders: { parent_id: string } } } | null;
  if (!b) return null;
  const { data: me } = await admin.from("profiles").select("role").eq("id", userId).maybeSingle();
  const allowed = me?.role === "admin" || b.jobs.athlete_id === userId || b.jobs.orders.parent_id === userId;
  return allowed ? b : null;
}

// GET /breakdowns/:id/worksheet — short-lived download link for the PDF.
breakdowns.get("/:id/worksheet", async (c) => {
  const user = await userFromBearer(c.req.header("authorization"));
  if (!user) return c.json({ error: "sign in first" }, 401);
  const b = await canSeeBreakdown(user.id, c.req.param("id"));
  if (!b) return c.json({ error: "not found" }, 404);
  if (!b.worksheet_pdf_path) return c.json({ error: "the PDF is still being prepared" }, 404);
  return c.json({ url: await signedWorksheetUrl(b.worksheet_pdf_path) });
});

// POST /breakdowns/:id/review — parent rates 1–5 with a testimonial. Gate: >= rules.review_auto_publish_min publishes.
breakdowns.post("/:id/review", async (c) => {
  const user = await userFromBearer(c.req.header("authorization"));
  if (!user) return c.json({ error: "sign in first" }, 401);
  const b = await canSeeBreakdown(user.id, c.req.param("id"));
  if (!b || b.jobs.orders.parent_id !== user.id) return c.json({ error: "not found" }, 404);
  const body = (await c.req.json().catch(() => ({}))) as { rating?: number; review?: string };
  const rating = Number(body.rating);
  if (!(rating >= 1 && rating <= 5)) return c.json({ error: "rating must be 1 to 5" }, 400);
  const s = await getSettings();
  const review_status = rating >= s.rules.review_auto_publish_min ? "published" : "pending_admin";
  await admin
    .from("breakdowns")
    .update({ rating, review: (body.review ?? "").trim().slice(0, 1500) || null, reviewed_at: new Date().toISOString(), review_status })
    .eq("id", b.id);
  return c.json({ ok: true, review_status });
});

// POST /breakdowns/:id/audit — parent files a Quality Control Audit within the window. Holds the payout.
breakdowns.post("/:id/audit", async (c) => {
  const user = await userFromBearer(c.req.header("authorization"));
  if (!user) return c.json({ error: "sign in first" }, 401);
  const b = await canSeeBreakdown(user.id, c.req.param("id"));
  if (!b || b.jobs.orders.parent_id !== user.id) return c.json({ error: "not found" }, 404);
  const body = (await c.req.json().catch(() => ({}))) as { reason?: string };
  const reason = (body.reason ?? "").trim();
  if (reason.length < 20) return c.json({ error: "tell us what was wrong, at least a sentence" }, 400);
  const s = await getSettings();
  const ageDays = (Date.now() - new Date(b.delivered_at).getTime()) / 86400000;
  if (ageDays > s.rules.qca_window_days) return c.json({ error: `audits can be filed within ${s.rules.qca_window_days} days of delivery` }, 400);
  const { data: open } = await admin.from("quality_audits").select("id").eq("breakdown_id", b.id).eq("status", "open").maybeSingle();
  if (open) return c.json({ error: "an audit is already open for this breakdown" }, 400);
  const { data: qa, error } = await admin
    .from("quality_audits")
    .insert({ kind: "breakdown", breakdown_id: b.id, filed_by: user.id, reason, actions: [{ at: new Date().toISOString(), by: user.id, action: "filed", note: reason }] })
    .select("id")
    .single();
  if (error || !qa) return c.json({ error: error?.message ?? "could not file" }, 500);
  if (s.rules.payout_hold_during_qca) {
    await admin.from("payouts").update({ status: "held", held_reason: `QCA ${qa.id}` }).eq("job_id", b.job_id).eq("status", "owed");
  }
  const { data: admins } = await admin.from("profiles").select("id").eq("role", "admin");
  for (const a of admins ?? []) {
    await notify(a.id, "qca.filed", "Quality Control Audit filed",
      `<p>A parent filed an audit on a breakdown.</p><p>${reason}</p><p><a href="${appUrl("/admin")}" style="color:#d4a32c">Open admin</a></p>`,
      { targetId: qa.id });
  }
  return c.json({ ok: true, auditId: qa.id });
});
