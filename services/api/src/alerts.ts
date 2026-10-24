import { admin } from "./supabase.js";
import { adminIds, alreadySent, appUrl, notify } from "./notify.js";

// U-04: the admins hear about every new parent account. The tick looks for parents not yet announced,
// emails each admin who has "New parent accounts" on, and stamps the profile so it never repeats.
// Only the last week counts, so a long gap never replays history; and on the very first run after
// the column arrives, a backlog bigger than 20 is stamped quietly instead of mailed.

const WINDOW_MS = 7 * 86400000;
const TEMPLATE = "account.new_parent";
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
const when = (iso: string) => `${new Date(iso).toLocaleString("en-US", { timeZone: "America/Detroit", dateStyle: "medium", timeStyle: "short" })} ET`;

export async function signupAlertsTick() {
  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  const { data, count, error } = await admin
    .from("profiles")
    .select("id, full_name, email, created_at", { count: "exact" })
    .eq("role", "parent")
    .is("signup_alerted_at", null)
    .is("deleted_at", null)
    .gte("created_at", since)
    .order("created_at")
    .limit(50);
  if (error) throw new Error("signup alerts query failed: " + error.message);
  const rows = (data ?? []) as { id: string; full_name: string; email: string; created_at: string }[];
  if (rows.length === 0) return { sent: 0 };

  // First run ever (nothing stamped yet) with a real backlog: nobody wants twenty emails at once.
  const { count: stamped } = await admin.from("profiles").select("id", { count: "exact", head: true }).not("signup_alerted_at", "is", null);
  const qualify = count ?? rows.length;
  if ((stamped ?? 0) === 0 && qualify > 20) {
    await admin.from("profiles").update({ signup_alerted_at: new Date().toISOString() }).eq("role", "parent").is("signup_alerted_at", null).gte("created_at", since);
    return { sent: 0, skipped: qualify };
  }

  const recipients = await adminIds("new_accounts");
  let sent = 0;
  for (const p of rows) {
    const name = p.full_name.trim();
    const html =
      `<p>A parent just created an account on First Line Performance.</p>` +
      `<p><b>${esc(name || "No name yet")}</b><br/>${esc(p.email)}<br/>${esc(when(p.created_at))}</p>` +
      `<p><a href="${appUrl("/admin/users")}" style="color:#d4a32c">Open Users</a></p>`;
    for (const a of recipients) {
      if (await alreadySent(a, TEMPLATE, p.id)) continue;
      await notify(a, TEMPLATE, `New parent account: ${name || p.email}`, html, { targetId: p.id });
      sent++;
    }
    // Stamped after the emails, so a crash mid-loop retries (alreadySent keeps the retry from doubling).
    await admin.from("profiles").update({ signup_alerted_at: new Date().toISOString() }).eq("id", p.id);
  }
  return { sent, accounts: rows.length };
}
