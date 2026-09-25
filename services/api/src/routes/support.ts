import { Hono } from "hono";
import { admin, userFromBearer } from "../supabase.js";
import { env } from "../env.js";
import { appUrl, mailShell, notify, sendMail } from "../notify.js";

// Support desk. Tickets arrive by email (the inbound script posts to /support/inbound), from the
// app, or from the marketing site; admins answer from /admin/support. Every outbound reply is a
// real email from the support identity, threaded onto the customer's conversation.

export const support = new Hono();

const SUPPORT_ADDR = "support@firstlineperform.com";
const supportFrom = () => env.supportFrom ?? `First Line Performance <${(process.env.MAIL_FROM ?? "no-reply@mail.firstlineperform.com").replace(/^.*<|>.*$/g, "")}>`;
const tag = (n: number) => `[FLP-${n}]`;
const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
const textToHtml = (t: string) => `<p>${escape(t).replace(/\n{2,}/g, "</p><p>").replace(/\n/g, "<br/>")}</p>`;
const stripHtml = (h: string) => h.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+\n/g, "\n").replace(/[ \t]+/g, " ").trim();
// Drop quoted history from an inbound reply so the thread shows only what was new.
const stripQuoted = (t: string) => {
  const lines = t.split(/\r?\n/);
  const cut = lines.findIndex((l, i) => /^On .+wrote:$/.test(l.trim()) || /^-{2,}\s*Original Message/i.test(l.trim()) || (i > 0 && /^From: .+/.test(l.trim())) || /^>/.test(l.trim()));
  return (cut > 0 ? lines.slice(0, cut) : lines).join("\n").trim();
};

async function requesterId(email: string) {
  const { data } = await admin.from("profiles").select("id, full_name").eq("email", email.toLowerCase()).limit(1).maybeSingle();
  return data;
}

async function admins() {
  const { data } = await admin.from("profiles").select("id").eq("role", "admin");
  return (data ?? []).map((a) => a.id);
}

async function createTicket(input: { subject: string; body: string; html?: string | null; email: string; name?: string; channel: "email" | "app" | "site"; messageId?: string | null; inReplyTo?: string | null; attachments?: unknown[] }) {
  const who = await requesterId(input.email);
  const { data: t, error } = await admin
    .from("support_tickets")
    .insert({ subject: input.subject.slice(0, 200) || "(no subject)", channel: input.channel, requester_email: input.email.toLowerCase(), requester_name: (input.name || who?.full_name || "").slice(0, 120), requester_id: who?.id ?? null, last_direction: "in" })
    .select("id, number")
    .single();
  if (error || !t) throw new Error(error?.message ?? "could not create ticket");
  await admin.from("support_messages").insert({ ticket_id: t.id, direction: "in", from_email: input.email.toLowerCase(), to_email: SUPPORT_ADDR, subject: input.subject.slice(0, 200), body_text: input.body.slice(0, 20000), body_html: input.html ?? null, message_id: input.messageId ?? null, in_reply_to: input.inReplyTo ?? null, attachments: input.attachments ?? [] });
  // Acknowledge, and tell the admins.
  await sendMail({
    to: input.email, from: supportFrom(), replyTo: SUPPORT_ADDR,
    subject: `${tag(t.number)} We got your message: ${input.subject.slice(0, 120) || "support request"}`,
    html: mailShell("We got your message", `<p>Thanks for writing to First Line Performance. This is ticket <b>${tag(t.number)}</b>. A real person reads every one of these, usually within a business day.</p><p>Reply to this email at any time to add to it.</p>`),
  });
  for (const a of await admins()) {
    await notify(a, "support.new", `${tag(t.number)} New support ticket: ${input.subject.slice(0, 80)}`,
      `<p><b>${escape(input.name ?? input.email)}</b> (${escape(input.email)}) wrote via ${input.channel}:</p><blockquote style="border-left:3px solid #d4a32c;padding-left:12px;color:#ccc">${textToHtml(input.body.slice(0, 1200))}</blockquote><p><a href="${appUrl(`/admin/support/${t.id}`)}" style="color:#d4a32c">Open the ticket</a></p>`,
      { targetId: t.id });
  }
  return t;
}

// Anonymous site posts are limited per address so a bot cannot use the acknowledgement mail as a cannon.
const recent = new Map<string, number[]>();
function overLimit(key: string, max = 5, windowMs = 3600000) {
  const now = Date.now();
  const hits = (recent.get(key) ?? []).filter((t) => now - t < windowMs);
  hits.push(now);
  recent.set(key, hits);
  if (recent.size > 5000) for (const [k, v] of recent) if (v.every((t) => now - t >= windowMs)) recent.delete(k);
  return hits.length > max;
}

// POST /support/tickets — from the app (signed in) or the marketing site (email + name in the body)
support.post("/tickets", async (c) => {
  const b = (await c.req.json().catch(() => ({}))) as { subject?: string; body?: string; email?: string; name?: string; website?: string };
  if (b.website) return c.json({ ok: true }); // honeypot for site bots
  const user = await userFromBearer(c.req.header("authorization"));
  const email = (user?.email ?? b.email ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return c.json({ error: "a valid email is required" }, 400);
  const ip = c.req.header("x-forwarded-for")?.split(",")[0].trim() || c.req.header("x-real-ip") || "";
  const limited = user ? overLimit(`u:${user.id}`) : [overLimit(`e:${email}`), ip ? overLimit(`ip:${ip}`) : false].some(Boolean);
  if (limited) return c.json({ error: "too many messages in a row; email support@firstlineperform.com instead" }, 429);
  const body = (b.body ?? "").trim();
  if (body.length < 5) return c.json({ error: "tell us what's going on" }, 400);
  const subject = (b.subject ?? "").trim() || body.slice(0, 80);
  const t = await createTicket({ subject, body, email, name: b.name, channel: user ? "app" : "site" });
  return c.json({ ok: true, number: t.number, ticketId: t.id });
});

// GET /support/tickets/mine — a signed-in person's own tickets (read side also works via RLS)
support.get("/tickets/mine", async (c) => {
  const user = await userFromBearer(c.req.header("authorization"));
  if (!user) return c.json({ error: "sign in first" }, 401);
  const { data } = await admin.from("support_tickets").select("id, number, subject, status, last_message_at, created_at").eq("requester_id", user.id).order("last_message_at", { ascending: false });
  return c.json({ tickets: data ?? [] });
});

// POST /support/tickets/:id/reply — a signed-in requester adds to their own ticket from the app
support.post("/tickets/:id/reply", async (c) => {
  const user = await userFromBearer(c.req.header("authorization"));
  if (!user) return c.json({ error: "sign in first" }, 401);
  const { data: t } = await admin.from("support_tickets").select("id, number, requester_id, status, subject").eq("id", c.req.param("id")).maybeSingle();
  if (!t || t.requester_id !== user.id) return c.json({ error: "not found" }, 404);
  const { body } = (await c.req.json().catch(() => ({}))) as { body?: string };
  const text = (body ?? "").trim();
  if (!text) return c.json({ error: "write something first" }, 400);
  await admin.from("support_messages").insert({ ticket_id: t.id, direction: "in", from_email: user.email ?? "", to_email: SUPPORT_ADDR, subject: t.subject, body_text: text.slice(0, 20000) });
  await admin.from("support_tickets").update({ status: "open", last_message_at: new Date().toISOString(), last_direction: "in", resolved_at: null }).eq("id", t.id);
  for (const a of await admins()) await notify(a, "support.reply", `${tag(t.number)} Reply from ${user.email}`, `<blockquote style="border-left:3px solid #d4a32c;padding-left:12px;color:#ccc">${textToHtml(text.slice(0, 1200))}</blockquote><p><a href="${appUrl(`/admin/support/${t.id}`)}" style="color:#d4a32c">Open the ticket</a></p>`, { targetId: t.id });
  return c.json({ ok: true });
});

// POST /support/inbound — the mailbox script posts each new email here with the shared secret.
// { from: "Name <a@b.c>", to, subject, text, html, messageId, inReplyTo, references[], date, attachments[] }
support.post("/inbound", async (c) => {
  if (!env.inboundEmailSecret || c.req.header("x-inbound-secret") !== env.inboundEmailSecret) return c.json({ error: "forbidden" }, 403);
  const m = (await c.req.json().catch(() => ({}))) as { from?: string; to?: string; subject?: string; text?: string; html?: string; messageId?: string; inReplyTo?: string; references?: string[]; attachments?: unknown[] };
  const fromRaw = m.from ?? "";
  const email = (fromRaw.match(/<([^>]+)>/)?.[1] ?? fromRaw).trim().toLowerCase();
  const name = fromRaw.includes("<") ? fromRaw.split("<")[0].replace(/["']/g, "").trim() : "";
  if (!email.includes("@")) return c.json({ error: "no sender" }, 400);
  if (email === SUPPORT_ADDR || /no-?reply|mailer-daemon|postmaster/i.test(email)) return c.json({ ok: true, ignored: "automated sender" });
  const subject = (m.subject ?? "").trim();
  const text = stripQuoted(m.text?.trim() || (m.html ? stripHtml(m.html) : "")) || "(empty message)";
  if (m.messageId) {
    const { data: dup } = await admin.from("support_messages").select("id").eq("message_id", m.messageId).maybeSingle();
    if (dup) return c.json({ ok: true, duplicate: true });
  }
  // Thread by our tag in the subject, then by the message it replies to, then by an open ticket from the same sender.
  let ticket: { id: string; number: number; status: string } | null = null;
  const tagged = subject.match(/\[FLP-(\d+)\]/);
  if (tagged) {
    const { data } = await admin.from("support_tickets").select("id, number, status").eq("number", Number(tagged[1])).maybeSingle();
    ticket = data;
  }
  if (!ticket && (m.inReplyTo || m.references?.length)) {
    const ids = [m.inReplyTo, ...(m.references ?? [])].filter(Boolean) as string[];
    const { data } = await admin.from("support_messages").select("ticket_id").in("message_id", ids).limit(1).maybeSingle();
    if (data) {
      const { data: t } = await admin.from("support_tickets").select("id, number, status").eq("id", data.ticket_id).maybeSingle();
      ticket = t;
    }
  }
  if (!ticket) {
    const { data } = await admin.from("support_tickets").select("id, number, status").eq("requester_email", email).in("status", ["open", "pending"]).order("last_message_at", { ascending: false }).limit(1).maybeSingle();
    if (data && /^(re|fwd?):/i.test(subject)) ticket = data; // a reply from a sender who has an open ticket
  }
  if (ticket) {
    await admin.from("support_messages").insert({ ticket_id: ticket.id, direction: "in", from_email: email, to_email: m.to ?? SUPPORT_ADDR, subject, body_text: text.slice(0, 20000), body_html: m.html ?? null, message_id: m.messageId ?? null, in_reply_to: m.inReplyTo ?? null, attachments: m.attachments ?? [] });
    await admin.from("support_tickets").update({ status: "open", last_message_at: new Date().toISOString(), last_direction: "in", resolved_at: null }).eq("id", ticket.id);
    for (const a of await admins()) await notify(a, "support.reply", `${tag(ticket.number)} Reply from ${name || email}`, `<blockquote style="border-left:3px solid #d4a32c;padding-left:12px;color:#ccc">${textToHtml(text.slice(0, 1200))}</blockquote><p><a href="${appUrl(`/admin/support/${ticket.id}`)}" style="color:#d4a32c">Open the ticket</a></p>`, { targetId: ticket.id });
    return c.json({ ok: true, ticket: ticket.number, appended: true });
  }
  const t = await createTicket({ subject: subject.replace(/^(re|fwd?):\s*/i, ""), body: text, html: m.html ?? null, email, name, channel: "email", messageId: m.messageId ?? null, inReplyTo: m.inReplyTo ?? null, attachments: m.attachments ?? [] });
  return c.json({ ok: true, ticket: t.number, created: true });
});

// POST /support/heartbeat — the mailbox script calls this on every run so the health meter can
// tell whether the email door is alive. { handled: n }
support.post("/heartbeat", async (c) => {
  if (!env.inboundEmailSecret || c.req.header("x-inbound-secret") !== env.inboundEmailSecret) return c.json({ error: "forbidden" }, 403);
  const meta = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  await admin.from("service_heartbeats").upsert({ service: "support-inbox", last_seen_at: new Date().toISOString(), meta });
  return c.json({ ok: true });
});

// ---- admin side --------------------------------------------------------------------------
async function requireAdmin(authorization: string | undefined) {
  const user = await userFromBearer(authorization);
  if (!user) return null;
  const { data } = await admin.from("profiles").select("role, full_name").eq("id", user.id).maybeSingle();
  return data?.role === "admin" ? { ...user, full_name: data.full_name } : null;
}
async function auditRow(actorId: string, action: string, ticketId: string, meta: Record<string, unknown> = {}) {
  await admin.from("audit_log").insert({ actor_id: actorId, action, target_type: "support_ticket", target_id: ticketId, meta });
}
async function ticketFor(id: string) {
  const { data } = await admin.from("support_tickets").select("id, number, subject, status, requester_email, requester_name, requester_id, assigned_to, priority, tags").eq("id", id).maybeSingle();
  return data;
}

// POST /support/admin/:id/reply { body, status? }  — email the requester and record it
support.post("/admin/:id/reply", async (c) => {
  const me = await requireAdmin(c.req.header("authorization"));
  if (!me) return c.json({ error: "admin only" }, 403);
  const t = await ticketFor(c.req.param("id"));
  if (!t) return c.json({ error: "not found" }, 404);
  const b = (await c.req.json().catch(() => ({}))) as { body?: string; status?: string };
  const text = (b.body ?? "").trim();
  if (!text) return c.json({ error: "write a reply first" }, 400);
  const status = b.status && ["open", "pending", "resolved", "closed"].includes(b.status) ? b.status : "pending";
  // thread onto the last inbound email when there is one
  const { data: last } = await admin.from("support_messages").select("message_id").eq("ticket_id", t.id).eq("direction", "in").not("message_id", "is", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const subject = `${tag(t.number)} ${t.subject}`.slice(0, 200);
  const signature = `<p style="margin-top:20px;color:#999">${escape(me.full_name || "FLP Support")}<br/>First Line Performance support</p>`;
  const mail = await sendMail({ to: t.requester_email, from: supportFrom(), replyTo: SUPPORT_ADDR, subject, html: mailShell(t.subject || "Your support ticket", textToHtml(text) + signature), text, inReplyTo: last?.message_id ?? undefined, references: last?.message_id ? [last.message_id] : undefined });
  await admin.from("support_messages").insert({ ticket_id: t.id, direction: "out", author_id: me.id, from_email: supportFrom().replace(/^.*<|>.*$/g, ""), to_email: t.requester_email, subject, body_text: text.slice(0, 20000), message_id: mail.id ? `<${mail.id}@resend>` : null, in_reply_to: last?.message_id ?? null });
  await admin.from("support_tickets").update({ status, last_message_at: new Date().toISOString(), last_direction: "out", resolved_at: status === "resolved" || status === "closed" ? new Date().toISOString() : null, assigned_to: t.assigned_to ?? me.id }).eq("id", t.id);
  await auditRow(me.id, "support.reply", t.id, { status, mailed: mail.sent, error: mail.error });
  if (t.requester_id) await admin.from("notifications").insert({ user_id: t.requester_id, channel: "email", template: "support.answer", payload: { subject, targetId: t.id }, sent_at: mail.sent ? new Date().toISOString() : null, error: mail.error });
  return c.json({ ok: true, mailed: mail.sent, error: mail.error });
});

// POST /support/admin/contact/:userId { subject, body } — email a person from the Users page. The
// message opens a ticket (already answered, waiting on them) so their reply lands in the desk.
support.post("/admin/contact/:userId", async (c) => {
  const me = await requireAdmin(c.req.header("authorization"));
  if (!me) return c.json({ error: "admin only" }, 403);
  const { data: who } = await admin.from("profiles").select("id, email, full_name, deleted_at").eq("id", c.req.param("userId")).maybeSingle();
  if (!who?.email) return c.json({ error: "no such account" }, 404);
  if (who.deleted_at) return c.json({ error: "that account is deactivated" }, 400);
  const b = (await c.req.json().catch(() => ({}))) as { subject?: string; body?: string };
  const text = (b.body ?? "").trim();
  if (!text) return c.json({ error: "write the message first" }, 400);
  const subject = (b.subject ?? "").trim().slice(0, 200) || "A note from First Line Performance";
  const { data: t, error } = await admin
    .from("support_tickets")
    .insert({ subject, channel: "app", status: "pending", requester_email: who.email.toLowerCase(), requester_name: who.full_name ?? "", requester_id: who.id, assigned_to: me.id, last_direction: "out" })
    .select("id, number")
    .single();
  if (error || !t) return c.json({ error: error?.message ?? "could not open a ticket" }, 500);
  const mailSubject = `${tag(t.number)} ${subject}`.slice(0, 200);
  const signature = `<p style="margin-top:20px;color:#999">${escape(me.full_name || "FLP")}<br/>First Line Performance</p>`;
  const mail = await sendMail({ to: who.email, from: supportFrom(), replyTo: SUPPORT_ADDR, subject: mailSubject, html: mailShell(subject, textToHtml(text) + signature), text });
  await admin.from("support_messages").insert({ ticket_id: t.id, direction: "out", author_id: me.id, from_email: supportFrom().replace(/^.*<|>.*$/g, ""), to_email: who.email, subject: mailSubject, body_text: text.slice(0, 20000), message_id: mail.id ? `<${mail.id}@resend>` : null });
  await auditRow(me.id, "user.contact", t.id, { user_id: who.id, mailed: mail.sent, error: mail.error });
  await admin.from("notifications").insert({ user_id: who.id, channel: "email", template: "support.contact", payload: { subject: mailSubject, targetId: t.id }, sent_at: mail.sent ? new Date().toISOString() : null, error: mail.error });
  return c.json({ ok: true, number: t.number, ticketId: t.id, mailed: mail.sent, error: mail.error });
});

// POST /support/admin/:id/note { body }  — internal, never mailed
support.post("/admin/:id/note", async (c) => {
  const me = await requireAdmin(c.req.header("authorization"));
  if (!me) return c.json({ error: "admin only" }, 403);
  const t = await ticketFor(c.req.param("id"));
  if (!t) return c.json({ error: "not found" }, 404);
  const { body } = (await c.req.json().catch(() => ({}))) as { body?: string };
  if (!body?.trim()) return c.json({ error: "write a note first" }, 400);
  await admin.from("support_messages").insert({ ticket_id: t.id, direction: "note", author_id: me.id, body_text: body.trim().slice(0, 20000) });
  return c.json({ ok: true }); // notes leave last_message_at/last_direction alone so the queue still reflects the customer
});

// PATCH /support/admin/:id { status?, priority?, assigned_to?, tags?, subject? }
support.patch("/admin/:id", async (c) => {
  const me = await requireAdmin(c.req.header("authorization"));
  if (!me) return c.json({ error: "admin only" }, 403);
  const t = await ticketFor(c.req.param("id"));
  if (!t) return c.json({ error: "not found" }, 404);
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  if (typeof b.status === "string" && ["open", "pending", "resolved", "closed"].includes(b.status)) { patch.status = b.status; patch.resolved_at = ["resolved", "closed"].includes(b.status) ? new Date().toISOString() : null; }
  if (typeof b.priority === "string" && ["low", "normal", "high", "urgent"].includes(b.priority)) patch.priority = b.priority;
  if (b.assigned_to === null || typeof b.assigned_to === "string") patch.assigned_to = b.assigned_to;
  if (Array.isArray(b.tags)) patch.tags = b.tags.filter((x) => typeof x === "string").map((x) => (x as string).trim().toLowerCase()).filter(Boolean).slice(0, 12);
  if (typeof b.subject === "string" && b.subject.trim()) patch.subject = b.subject.trim().slice(0, 200);
  if (Object.keys(patch).length === 0) return c.json({ error: "nothing to change" }, 400);
  await admin.from("support_tickets").update(patch).eq("id", t.id);
  await auditRow(me.id, "support.update", t.id, patch);
  return c.json({ ok: true });
});

// Canned replies: POST /support/admin/canned { id?, title, body, sort } · DELETE /support/admin/canned/:id
support.post("/admin/canned", async (c) => {
  const me = await requireAdmin(c.req.header("authorization"));
  if (!me) return c.json({ error: "admin only" }, 403);
  const b = (await c.req.json().catch(() => ({}))) as { id?: string; title?: string; body?: string; sort?: number };
  if (!b.title?.trim() || !b.body?.trim()) return c.json({ error: "title and body required" }, 400);
  const row = { title: b.title.trim().slice(0, 120), body: b.body.trim().slice(0, 5000), sort: Number(b.sort ?? 0) || 0, updated_by: me.id, updated_at: new Date().toISOString() };
  const q = b.id ? admin.from("support_canned_replies").update(row).eq("id", b.id) : admin.from("support_canned_replies").insert(row);
  const { error } = await q;
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ ok: true });
});
support.delete("/admin/canned/:id", async (c) => {
  const me = await requireAdmin(c.req.header("authorization"));
  if (!me) return c.json({ error: "admin only" }, 403);
  await admin.from("support_canned_replies").delete().eq("id", c.req.param("id"));
  return c.json({ ok: true });
});
