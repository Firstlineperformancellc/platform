import { statfs } from "node:fs/promises";
import { admin } from "./supabase.js";
import { env } from "./env.js";
import { mux, muxConfigured, muxSigningConfigured } from "./mux.js";
import { stripe } from "./stripe.js";
import { appUrl, notify } from "./notify.js";

// Service Health Meter. Every connected service gets one cheap, read-only probe; the worst result
// is the overall state. "off" means not connected yet (Stripe before launch) and does not count.
export type Status = "healthy" | "attention" | "unhealthy" | "off";
export type Check = { key: string; label: string; status: Status; latency_ms: number; detail: string };
export type Overall = Exclude<Status, "off">;

const RANK: Record<Status, number> = { off: -1, healthy: 0, attention: 1, unhealthy: 2 };
export const overallOf = (checks: Check[]): Overall => checks.reduce<Overall>((acc, c) => (RANK[c.status] > RANK[acc] ? (c.status as Overall) : acc), "healthy");
const TIMEOUT_MS = 8000;
const HOUR = 3600000;
const CHECK_EVERY_MS = 55 * 60000; // the tick runs every 5 min; this makes it "once an hour"

const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};
const short = (e: unknown) => String((e as Error)?.message ?? e).replace(/\s+/g, " ").slice(0, 140);

type Probe = () => Promise<{ status: Status; detail: string }>;
async function timed(key: string, label: string, probe: Probe): Promise<Check> {
  const t0 = Date.now();
  try {
    const r = await Promise.race([probe(), new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`no answer in ${TIMEOUT_MS / 1000} s`)), TIMEOUT_MS))]);
    return { key, label, status: r.status, latency_ms: Date.now() - t0, detail: r.detail };
  } catch (e) {
    return { key, label, status: "unhealthy", latency_ms: Date.now() - t0, detail: short(e) };
  }
}
const http = (url: string, init: RequestInit = {}) => fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });

const mailDomain = () => ((process.env.MAIL_FROM ?? "").match(/@([^>\s]+)/)?.[1] ?? "mail.firstlineperform.com");
const siteUrl = () => (env.appEnv === "prod" ? "https://beta.firstlineperform.com/" : "https://dev.firstlineperform.com/site/");

export async function runChecks(): Promise<Check[]> {
  return Promise.all([
    timed("database", "Database", async () => {
      const { error } = await admin.from("settings").select("id").eq("id", 1).maybeSingle();
      if (error) throw new Error(error.message);
      return { status: "healthy", detail: "Postgres answering" };
    }),
    timed("auth", "Sign-in (Supabase Auth)", async () => {
      const { error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });
      if (error) throw new Error(error.message);
      return { status: "healthy", detail: "Auth API answering" };
    }),
    timed("storage", "File storage", async () => {
      const { data, error } = await admin.storage.listBuckets();
      if (error) throw new Error(error.message);
      const names = new Set((data ?? []).map((b) => b.name));
      const missing = ["worksheets", "avatars"].filter((b) => !names.has(b));
      return missing.length ? { status: "attention", detail: `bucket missing: ${missing.join(", ")}` } : { status: "healthy", detail: "worksheets + avatars buckets present" };
    }),
    timed("mux", "Mux (video)", async () => {
      if (!muxConfigured) return { status: "off", detail: "not connected" };
      await mux.video.assets.list({ limit: 1 });
      return muxSigningConfigured ? { status: "healthy", detail: "API answering, signed playback ready" } : { status: "attention", detail: "API answering, but no signing key for family film" };
    }),
    timed("daily", "Daily (Film Room)", async () => {
      if (!env.dailyApiKey) return { status: "off", detail: "not connected" };
      const r = await http("https://api.daily.co/v1/", { headers: { authorization: `Bearer ${env.dailyApiKey}` } });
      if (r.status === 401) return { status: "unhealthy", detail: "API key rejected" };
      if (!r.ok) return { status: "unhealthy", detail: `HTTP ${r.status}` };
      const d = (await r.json()) as { domain_name?: string };
      return { status: "healthy", detail: `domain ${d.domain_name ?? "ok"}${env.dailyWebhookSecret ? "" : ", webhook secret missing"}` };
    }),
    timed("email", "Email (Resend)", async () => {
      if (!env.resendApiKey) return { status: "off", detail: "not connected" };
      const r = await http("https://api.resend.com/domains", { headers: { authorization: `Bearer ${env.resendApiKey}` } });
      const d = (await r.json().catch(() => ({}))) as { name?: string; data?: { name: string; status: string }[] };
      // a sending-only key (what FLP uses) is refused here by design: that answer proves the key is live
      if (r.status === 401 && d.name === "restricted_api_key") return { status: "healthy", detail: "sending key accepted" };
      if (r.status === 400 || r.status === 401 || r.status === 403) return { status: "unhealthy", detail: "API key rejected" };
      if (!r.ok) return { status: "unhealthy", detail: `HTTP ${r.status}` };
      const dom = (d.data ?? []).find((x) => x.name === mailDomain());
      if (!dom) return { status: "attention", detail: `${mailDomain()} not found in Resend` };
      return dom.status === "verified" ? { status: "healthy", detail: `${dom.name} verified` } : { status: "attention", detail: `${dom.name} is ${dom.status}` };
    }),
    timed("support_inbox", "Support inbox (Gmail script)", async () => {
      const { data, error } = await admin.from("service_heartbeats").select("last_seen_at, meta").eq("service", "support-inbox").maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return { status: "attention", detail: "mailbox script not installed yet" };
      const age = Date.now() - new Date(data.last_seen_at).getTime();
      return age <= 20 * 60000 ? { status: "healthy", detail: `script ran ${ago(data.last_seen_at)}` } : { status: "unhealthy", detail: `script last ran ${ago(data.last_seen_at)}` };
    }),
    timed("stripe", "Stripe (payments)", async () => {
      if (!stripe) return { status: "off", detail: "not connected (free preview)" };
      await stripe.balance.retrieve();
      return env.stripeWebhookSecret ? { status: "healthy", detail: "API answering" } : { status: "attention", detail: "API answering, webhook secret missing" };
    }),
    timed("web", "Web app", async () => {
      const r = await http(appUrl("/"), { redirect: "follow" });
      return r.ok ? { status: "healthy", detail: `${new URL(appUrl("/")).host} answering` } : { status: "unhealthy", detail: `HTTP ${r.status}` };
    }),
    timed("site", "Marketing site", async () => {
      const r = await http(siteUrl(), { redirect: "follow" });
      return r.ok ? { status: "healthy", detail: `${new URL(siteUrl()).host} answering` } : { status: "unhealthy", detail: `HTTP ${r.status}` };
    }),
    timed("disk", "Server disk", async () => {
      const s = await statfs("/");
      const free = Number(s.bavail) * Number(s.bsize), total = Number(s.blocks) * Number(s.bsize);
      const pct = Math.round((free / total) * 100);
      const gb = (free / 1e9).toFixed(1);
      return pct < 5 ? { status: "unhealthy", detail: `${pct}% free (${gb} GB)` } : pct < 15 ? { status: "attention", detail: `${pct}% free (${gb} GB)` } : { status: "healthy", detail: `${pct}% free (${gb} GB)` };
    }),
  ]);
}

export async function latestRun() {
  const { data } = await admin.from("service_health_runs").select("id, ran_at, overall, results").order("ran_at", { ascending: false }).limit(1).maybeSingle();
  return data as { id: string; ran_at: string; overall: Overall; results: Check[] } | null;
}

// Run, store, and tell the admins about anything that just broke or just recovered.
export async function recordRun(trigger: "schedule" | "manual") {
  const t0 = Date.now();
  const previous = await latestRun();
  const results = await runChecks();
  const overall = overallOf(results);
  const { data: run } = await admin.from("service_health_runs").insert({ trigger, overall, duration_ms: Date.now() - t0, results }).select("id, ran_at, overall, results").single();
  const before = new Map((previous?.results ?? []).map((c) => [c.key, c.status]));
  const broke = results.filter((c) => c.status === "unhealthy" && before.get(c.key) !== "unhealthy" && previous);
  const fixed = results.filter((c) => c.status !== "unhealthy" && before.get(c.key) === "unhealthy");
  if (broke.length || fixed.length) {
    const { data: admins } = await admin.from("profiles").select("id").eq("role", "admin");
    const line = (c: Check) => `<li><b>${c.label}</b>: ${c.detail}</li>`;
    const html = `${broke.length ? `<p>Unhealthy since this check:</p><ul>${broke.map(line).join("")}</ul>` : ""}${fixed.length ? `<p>Back to normal:</p><ul>${fixed.map(line).join("")}</ul>` : ""}<p><a href="${appUrl("/admin/health")}" style="color:#d4a32c">Service health</a></p>`;
    const subject = broke.length ? `Service health: ${broke.map((c) => c.label).join(", ")} unhealthy` : `Service health: ${fixed.map((c) => c.label).join(", ")} recovered`;
    for (const a of admins ?? []) await notify(a.id, broke.length ? "health.down" : "health.recovered", subject, html, { targetId: run?.id ?? "" });
  }
  // keep a month of history
  await admin.from("service_health_runs").delete().lt("ran_at", new Date(Date.now() - 30 * 24 * HOUR).toISOString());
  return run as { id: string; ran_at: string; overall: Overall; results: Check[] };
}

// Called by the 5-minute tick; runs the checks when the last run is about an hour old.
export async function healthTick() {
  const last = await latestRun();
  if (last && Date.now() - new Date(last.ran_at).getTime() < CHECK_EVERY_MS) return { ran: false, overall: last.overall };
  const run = await recordRun("schedule");
  return { ran: true, overall: run.overall };
}
