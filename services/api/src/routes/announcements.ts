import { createHash } from "node:crypto";
import { Hono } from "hono";
import { admin, userFromBearer } from "../supabase.js";
import { mailShell, sendMail } from "../notify.js";

// Announcements: one plain email to account holders for service notices ("the site will be down for
// updates tonight"), never marketing. Admin only. A send is a broadcasts row with its running tally,
// a notifications row per recipient (what notify() writes), and an audit entry.
export const announcements = new Hono();

type Audience = "everyone" | "parents" | "mentors" | "admins" | "me";
const AUDIENCES: Audience[] = ["everyone", "parents", "mentors", "admins", "me"];
const SUBJECT_MAX = 120;
const BODY_MAX = 5000;
const BATCH = 25; // addresses per batch, then a pause, so a big send stays inside Resend's rate limit
const PAUSE_MS = 1000;
const REPEAT_WINDOW_MS = 10 * 60_000;
const BACKGROUND_OVER = 300; // a bigger send answers the browser at once and finishes behind the request
const PAGE = 1000; // Supabase answers at most this many rows a call
const DELETED_SUFFIX = "@deleted.firstlineperform.com";
const FOOTER = "You're receiving this because you have a First Line Performance account.";

async function requireAdmin(authorization: string | undefined) {
  const user = await userFromBearer(authorization);
  if (!user) return null;
  const { data } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  return data?.role === "admin" ? user : null;
}
const audit = (actorId: string, action: string, targetId: string | null, meta: Record<string, unknown> = {}) =>
  admin.from("audit_log").insert({ actor_id: actorId, action, target_type: "broadcast", target_id: targetId, meta });

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
// The admin writes plain text: a blank line starts a new paragraph, a single newline is a line break.
const textToHtml = (t: string) =>
  t.split(/\n[ \t]*\n+/).map((p) => p.trim()).filter(Boolean).map((p) => `<p>${escape(p).replace(/\n/g, "<br/>")}</p>`).join("");
const hashOf = (subject: string, body: string) => createHash("sha256").update(`${subject}\n\n${body}`).digest("hex");
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
// j***@gmail.com: enough to recognise an address in a preview, not enough to read it off a screen.
const mask = (email: string) => {
  const at = email.indexOf("@");
  return at > 0 ? `${email[0]}***${email.slice(at)}` : "***";
};

type Input = { subject: string; text: string; audience: Audience };
// What the admin sent, cleaned, or a plain reason it will not do. A preview may carry an empty message.
function readInput(body: Record<string, unknown>, preview: boolean): Input | string {
  const audience = body.audience as Audience;
  if (!AUDIENCES.includes(audience)) return "pick who this goes to";
  const subject = typeof body.subject === "string" ? body.subject.replace(/\s+/g, " ").trim() : "";
  const text = typeof body.body === "string" ? body.body.replace(/\r\n?/g, "\n").trim() : "";
  if (!preview && !subject) return "write a subject";
  if (subject.length > SUBJECT_MAX) return `keep the subject to ${SUBJECT_MAX} characters`;
  if (!preview && !text) return "write the message";
  if (text.length > BODY_MAX) return `keep the message to ${BODY_MAX.toLocaleString("en-US")} characters`;
  return { subject, text, audience };
}

// Walk a query a page at a time, so an audience bigger than one Supabase page is not cut short.
async function pageAll<T>(query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await query(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) return out;
  }
}

type Recipient = { id: string; email: string };
// Who an audience is, as live accounts with a real address. Parents are every parent; mentors are
// approved mentors (an applicant is not an account holder in the sense that matters here); admins are
// admins; everyone is all three. Deleted accounts carry a placeholder address and deleted_at,
// suspended accounts suspended_at: both are always left out, as is anyone with no address.
async function resolveAudience(audience: Audience, meId: string): Promise<Recipient[]> {
  if (audience === "me") {
    const { data } = await admin.from("profiles").select("id, email").eq("id", meId).maybeSingle();
    return data?.email ? [{ id: data.id, email: data.email }] : [];
  }
  const roles = audience === "everyone" ? ["parent", "athlete", "admin"] : audience === "parents" ? ["parent"] : audience === "mentors" ? ["athlete"] : ["admin"];
  type P = { id: string; email: string | null; role: string };
  let rows = await pageAll<P>((a, b) => admin.from("profiles").select("id, email, role").in("role", roles).is("deleted_at", null).is("suspended_at", null).order("created_at").range(a, b));
  if (roles.includes("athlete")) {
    const approved = await pageAll<{ user_id: string }>((a, b) => admin.from("athletes").select("user_id").eq("status", "approved").is("deleted_at", null).order("created_at").range(a, b));
    const ok = new Set(approved.map((x) => x.user_id));
    rows = rows.filter((p) => p.role !== "athlete" || ok.has(p.id));
  }
  const seen = new Set<string>(); // one email per address, whatever the case
  const out: Recipient[] = [];
  for (const p of rows) {
    const email = (p.email ?? "").trim();
    const key = email.toLowerCase();
    if (!email || key.endsWith(DELETED_SUFFIX) || seen.has(key)) continue;
    seen.add(key);
    out.push({ id: p.id, email });
  }
  return out;
}

// One address. Resend answers a burst with a rate-limit error; wait and try again before calling it failed.
async function sendOne(to: string, subject: string, html: string, text: string) {
  let last = await sendMail({ to, subject, html, text });
  for (let attempt = 1; attempt < 3 && !last.sent && /rate|too many/i.test(last.error ?? ""); attempt++) {
    await sleep(PAUSE_MS * attempt);
    last = await sendMail({ to, subject, html, text });
  }
  return last;
}

type Failure = { email: string; error: string };
// The send itself: batches of BATCH with a pause between, carrying on past any one failure. Each
// recipient gets a notifications row the way notify() writes them; the broadcasts row keeps the tally.
async function deliver(broadcastId: string, subject: string, text: string, recipients: Recipient[]) {
  const html = mailShell(subject, textToHtml(text) + `<p style="margin-top:24px;font-size:12px;color:#777">${FOOTER}</p>`);
  const plain = `${text}\n\n${FOOTER}`;
  let sent = 0;
  let failed = 0;
  const failures: Failure[] = [];
  const tally = (extra: Record<string, unknown> = {}) => admin.from("broadcasts").update({ sent_count: sent, failed_count: failed, failures: failures.slice(0, 200), ...extra }).eq("id", broadcastId);
  for (let i = 0; i < recipients.length; i += BATCH) {
    for (const r of recipients.slice(i, i + BATCH)) {
      try {
        const { data: n } = await admin.from("notifications").insert({ user_id: r.id, channel: "email", template: "broadcast", payload: { subject, broadcast_id: broadcastId } }).select("id").single();
        const mail = await sendOne(r.email, subject, html, plain);
        if (mail.sent) {
          sent++;
          if (n) await admin.from("notifications").update({ sent_at: new Date().toISOString() }).eq("id", n.id);
        } else {
          failed++;
          failures.push({ email: r.email, error: mail.error ?? "unknown" });
          if (n) await admin.from("notifications").update({ error: mail.error ?? "unknown" }).eq("id", n.id);
        }
      } catch (err) {
        failed++;
        failures.push({ email: r.email, error: (err as Error).message });
      }
    }
    await tally();
    if (i + BATCH < recipients.length) await sleep(PAUSE_MS);
  }
  await tally({ finished_at: new Date().toISOString() });
  return { sent, failed, failures };
}

// GET /admin/announcements — the last 50 sends, newest first
announcements.get("/", async (c) => {
  const me = await requireAdmin(c.req.header("authorization"));
  if (!me) return c.json({ error: "admin only" }, 403);
  const { data, error } = await admin
    .from("broadcasts")
    .select("id, audience, subject, recipient_count, sent_count, failed_count, failures, created_at, finished_at, sender:profiles!broadcasts_sent_by_fkey(full_name, email)")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ broadcasts: data ?? [] });
});

// POST /admin/announcements/preview { subject, body, audience } → { recipients, sample }. Nothing is sent.
announcements.post("/preview", async (c) => {
  const me = await requireAdmin(c.req.header("authorization"));
  if (!me) return c.json({ error: "admin only" }, 403);
  const input = readInput((await c.req.json().catch(() => ({}))) as Record<string, unknown>, true);
  if (typeof input === "string") return c.json({ error: input }, 400);
  const recipients = await resolveAudience(input.audience, me.id);
  return c.json({ recipients: recipients.length, sample: recipients.slice(0, 5).map((r) => mask(r.email)) });
});

// POST /admin/announcements/send { subject, body, audience, confirmRepeat? }
// The same subject and body sent to real people in the last ten minutes is refused (409) until the
// admin confirms; a test send to yourself neither trips that check nor counts as a previous send,
// since "send to me first, then send" is the normal order of things.
announcements.post("/send", async (c) => {
  const me = await requireAdmin(c.req.header("authorization"));
  if (!me) return c.json({ error: "admin only" }, 403);
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const input = readInput(body, false);
  if (typeof input === "string") return c.json({ error: input }, 400);
  const hash = hashOf(input.subject, input.text);
  if (input.audience !== "me" && body.confirmRepeat !== true) {
    const since = new Date(Date.now() - REPEAT_WINDOW_MS).toISOString();
    const { data: dup } = await admin.from("broadcasts").select("id, audience, created_at").eq("body_hash", hash).neq("audience", "me").gte("created_at", since).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (dup) {
      const mins = Math.max(1, Math.round((Date.now() - new Date(dup.created_at).getTime()) / 60_000));
      return c.json({ error: `This exact message already went out ${mins} minute${mins === 1 ? "" : "s"} ago to ${dup.audience}. Send it again?`, code: "repeat" }, 409);
    }
  }
  const recipients = await resolveAudience(input.audience, me.id);
  if (!recipients.length) return c.json({ error: "nobody matches that audience" }, 400);
  const { data: row, error } = await admin
    .from("broadcasts")
    .insert({ sent_by: me.id, audience: input.audience, subject: input.subject, body: input.text, recipient_count: recipients.length, body_hash: hash })
    .select("id")
    .single();
  if (error || !row) return c.json({ error: error?.message ?? "could not record the send" }, 500);
  await audit(me.id, "broadcast.send", row.id, { audience: input.audience, subject: input.subject, recipients: recipients.length, repeat: body.confirmRepeat === true });
  const run = deliver(row.id, input.subject, input.text, recipients);
  if (recipients.length > BACKGROUND_OVER) {
    run.catch((err) => console.error(`[broadcast ${row.id}] did not finish`, err));
    return c.json({ started: true, id: row.id, recipients: recipients.length });
  }
  const result = await run;
  return c.json({ ok: true, id: row.id, recipients: recipients.length, sent: result.sent, failed: result.failed, failures: result.failures.slice(0, 5) });
});
