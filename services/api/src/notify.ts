import { Resend } from "resend";
import { admin } from "./supabase.js";
import { env } from "./env.js";

// Every notification is written to the notifications table first (admin can see what was sent),
// then emailed through Resend when a key is configured. Without a key it is logged only.
const resend = env.resendApiKey ? new Resend(env.resendApiKey) : null;
const FROM = process.env.MAIL_FROM ?? "First Line Performance <no-reply@mail.firstlineperform.com>";

export async function notify(userId: string, template: string, subject: string, html: string, payload: Record<string, unknown> = {}) {
  const { data: profile } = await admin.from("profiles").select("email, full_name").eq("id", userId).maybeSingle();
  const { data: row } = await admin
    .from("notifications")
    .insert({ user_id: userId, channel: "email", template, payload: { subject, ...payload } })
    .select("id")
    .single();
  if (!resend || !profile?.email) return;
  try {
    await resend.emails.send({ from: FROM, to: profile.email, subject, html: shell(subject, html) });
    if (row) await admin.from("notifications").update({ sent_at: new Date().toISOString() }).eq("id", row.id);
  } catch (err) {
    if (row) await admin.from("notifications").update({ error: (err as Error).message }).eq("id", row.id);
  }
}

// Has a notification of this template already gone to this user for this target? (idempotent reminders)
export async function alreadySent(userId: string, template: string, targetId: string) {
  const { count } = await admin
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("template", template)
    .contains("payload", { targetId });
  return (count ?? 0) > 0;
}

function shell(title: string, body: string) {
  return `<!doctype html><body style="margin:0;background:#000;color:#f2f2f2;font-family:Helvetica,Arial,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px">
    <div style="font-weight:800;font-style:italic;letter-spacing:.06em;text-transform:uppercase;color:#d4a32c;font-size:14px">First Line Performance</div>
    <h1 style="font-size:22px;margin:16px 0 12px;color:#fff">${title}</h1>
    <div style="font-size:15px;line-height:1.5;color:#dcdcdc">${body}</div>
    <p style="margin-top:28px;font-size:12px;color:#777">Questions? team@firstlineperform.com</p>
  </div></body>`;
}

// Support mail: to any address, from the support identity when the domain is verified, threaded.
export async function sendMail(opts: { to: string; subject: string; html: string; text?: string; from?: string; replyTo?: string; inReplyTo?: string; references?: string[] }) {
  if (!resend) return { sent: false as const, id: null, error: "mail not configured" };
  const headers: Record<string, string> = {};
  if (opts.inReplyTo) headers["In-Reply-To"] = opts.inReplyTo;
  if (opts.references?.length) headers["References"] = opts.references.join(" ");
  try {
    const r = await resend.emails.send({
      from: opts.from ?? FROM, to: opts.to, subject: opts.subject, html: opts.html, text: opts.text,
      replyTo: opts.replyTo, headers: Object.keys(headers).length ? headers : undefined,
    });
    if (r.error) return { sent: false as const, id: null, error: r.error.message };
    return { sent: true as const, id: r.data?.id ?? null, error: null };
  } catch (err) {
    return { sent: false as const, id: null, error: (err as Error).message };
  }
}
export const mailShell = shell;

export const appUrl = (path: string) => `${process.env.APP_ORIGIN ?? "https://dev.firstlineperform.com"}${path}`;
