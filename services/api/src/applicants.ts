import { admin } from "./supabase.js";
import { env } from "./env.js";
import { getSettings } from "./settings.js";
import { sendMail, mailShell, appUrl } from "./notify.js";

// Tell the team when someone applies to be a mentor, once per applicant.
// Recipients: TEAM_NOTIFY_EMAIL (comma-separated). Production falls back to team@firstlineperform.com;
// dev sends nothing unless the variable is set, so test sign-ups never reach the team's inbox.
const recipients = () =>
  (env.teamNotifyEmail ?? (env.appEnv === "prod" ? "team@firstlineperform.com" : ""))
    .split(",").map((s) => s.trim()).filter(Boolean);

const MOTIVATION: Record<string, string> = {
  money: "Extra money",
  fulltime: "Mentor full time as primary income",
  help: "Help young athletes",
  multiple: "Multiple reasons",
  other: "Other",
};
const GENDER: Record<string, string> = { male: "Male", female: "Female", nonbinary: "Non-binary", unspecified: "Prefer not to say" };

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
const multiline = (s: string) => esc(s).replace(/\n/g, "<br/>");
const row = (label: string, value: string) =>
  `<tr><td style="padding:4px 14px 4px 0;color:#9a9a9a;vertical-align:top;white-space:nowrap">${label}</td><td style="padding:4px 0;color:#f2f2f2">${value}</td></tr>`;

type AppAnswers = { motivations: string[] | null; motivation_other: string | null; special_circumstances: string | null; age: number | null; gender: string | null; agreement_signed_name?: string | null; agreement_signed_at?: string | null; agreement_residence?: string | null; agreement_guardian_name?: string | null };
export type Applicant = {
  user_id: string; display_name: string; status: string; created_at: string;
  highest_level: string | null; current_team: string | null; positions: string[] | null; eliteprospects_url: string | null;
  profiles: { email: string | null; phone: string | null; full_name: string | null } | null;
  application: AppAnswers | AppAnswers[] | null;
};

export async function notifyTeamOfNewApplicants() {
  const to = recipients();
  if (to.length === 0) return { sent: 0, skipped: "no team recipient configured" };

  // Only recent applications: if mail was off for a while, nobody gets a flood of stale notices.
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const { data, error } = await admin
    .from("athletes")
    .select("user_id, display_name, status, created_at, highest_level, current_team, positions, eliteprospects_url, profiles!athletes_user_id_fkey(email, phone, full_name), application:athlete_applications(motivations, motivation_other, special_circumstances, age, gender, agreement_signed_name, agreement_signed_at, agreement_residence, agreement_guardian_name)")
    .is("team_notified_at", null)
    .gte("created_at", since)
    .order("created_at")
    .limit(20);
  if (error) throw new Error("applicants query failed: " + error.message);
  const rows = (data ?? []) as unknown as Applicant[];
  if (rows.length === 0) return { sent: 0 };

  const settings = await getSettings().catch(() => null);
  const levels = ((settings?.taxonomy as { levels?: { key: string; label: string }[] } | undefined)?.levels) ?? [];

  let sent = 0, failed = 0, alreadyHandled = 0;
  for (const a of rows) {
    // Approved or turned away before the job got to it: nothing to announce.
    if (a.status !== "applied") {
      await admin.from("athletes").update({ team_notified_at: new Date().toISOString() }).eq("user_id", a.user_id);
      alreadyHandled++;
      continue;
    }
    const { data: auth } = await admin.auth.admin.getUserById(a.user_id);
    const confirmed = !!auth?.user?.email_confirmed_at;
    const { subject, html, email } = buildNotice(a, levels, confirmed, auth?.user?.email ?? "");
    let ok = true;
    for (const addr of to) {
      const r = await sendMail({ to: addr, subject, html, replyTo: email || undefined });
      if (!r.sent) { ok = false; console.error(`team notice for ${a.user_id} to ${addr} failed: ${r.error}`); }
    }
    // Stamp only when it went out, so a mail hiccup is retried on the next run.
    if (ok) {
      await admin.from("athletes").update({ team_notified_at: new Date().toISOString() }).eq("user_id", a.user_id);
      sent++;
    } else failed++;
  }
  return { sent, failed, alreadyHandled };
}

// The email itself, separate so it can be previewed and tested without sending anything.
export function buildNotice(a: Applicant, levels: { key: string; label: string }[], confirmed: boolean, authEmail = "") {
  const levelLabel = (k: string | null) => (k ? levels.find((l) => l.key === k)?.label ?? k : "");
    const app = Array.isArray(a.application) ? a.application[0] : a.application;
    const name = a.profiles?.full_name || a.display_name;
    const email = a.profiles?.email ?? authEmail;
    const why: string[] = (app?.motivations ?? []).map((m: string) => MOTIVATION[m] ?? m);
    if (app?.motivation_other) why.push(`Other: ${app.motivation_other}`);
    const applied = new Date(a.created_at).toLocaleString("en-US", { timeZone: "America/Detroit", dateStyle: "medium", timeStyle: "short" });

    const details = [
      row("Name", esc(name)),
      row("Email", email ? `<a href="mailto:${esc(email)}" style="color:#d4a32c">${esc(email)}</a>` : "not given"),
      a.profiles?.phone ? row("Phone", esc(a.profiles.phone)) : "",
      row("Highest level", esc(levelLabel(a.highest_level) || "not given")),
      a.current_team ? row("Current team", esc(a.current_team)) : "",
      a.positions?.length ? row("Positions", esc(a.positions.join(", "))) : "",
      app?.age || app?.gender ? row("Age · gender", esc([app?.age ? String(app.age) : null, app?.gender ? GENDER[app.gender] ?? app.gender : null].filter(Boolean).join(" · "))) : "",
      a.eliteprospects_url ? row("Elite Prospects", `<a href="${esc(a.eliteprospects_url)}" style="color:#d4a32c">profile</a>`) : "",
      why.length ? row("Why", esc(why.join("; "))) : "",
      app?.special_circumstances ? row("Special circumstances", `<span style="color:#f0b84a">${multiline(app.special_circumstances)}</span>`) : "",
      row("Contractor agreement", app?.agreement_signed_at
        ? esc(`Signed as "${app.agreement_signed_name ?? ""}"${app.agreement_residence ? `, ${app.agreement_residence}` : ""}${app.agreement_guardian_name ? ` (guardian: ${app.agreement_guardian_name})` : ""}`)
        : `<span style="color:#f0b84a">Not signed</span>`),
      row("Applied", `${esc(applied)} ET`),
      row("Email confirmed", confirmed ? "Yes" : `<span style="color:#f0b84a">Not yet. They can't sign in until they click the link in their confirmation email.</span>`),
    ].join("");

    const subject = `New mentor application: ${name}`;
    const html = mailShell("A new mentor is waiting for approval",
      `<p>${esc(name)} just applied to mentor on First Line Performance.</p>
       <table style="border-collapse:collapse;font-size:14px;margin:8px 0 16px">${details}</table>
       <p><a href="${appUrl("/admin/mentors")}" style="display:inline-block;background:#d4a32c;color:#000;padding:10px 16px;border-radius:6px;text-decoration:none;font-weight:700">Review in admin</a></p>`);

  return { subject, html, email };
}
