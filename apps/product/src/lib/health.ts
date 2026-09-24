import { api } from "./api";
import { supabase } from "./supabase";

// Service Health Meter reads (admins, under RLS) and the one write (run now) through the API.
export type Status = "healthy" | "attention" | "unhealthy" | "off";
export type Overall = Exclude<Status, "off">;
export type Check = { key: string; label: string; status: Status; latency_ms: number; detail: string };
export type Run = { id: string; ran_at: string; trigger: "schedule" | "manual"; overall: Overall; duration_ms: number; results: Check[] };

export async function latestRun(): Promise<Run | null> {
  const { data, error } = await supabase.from("service_health_runs").select("id, ran_at, trigger, overall, duration_ms, results").order("ran_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Run | null) ?? null;
}
export async function recentRuns(n = 48): Promise<Run[]> {
  const { data } = await supabase.from("service_health_runs").select("id, ran_at, trigger, overall, duration_ms, results").order("ran_at", { ascending: false }).limit(n);
  return ((data ?? []) as Run[]).reverse();
}
export const runNow = () => api<{ ok: true; run: Run }>("/admin/health/run", { method: "POST" });

export const STALE_MS = 2 * 3600000; // checks are hourly; older than this means the timer is not running
export const isStale = (run: Run | null) => !run || Date.now() - new Date(run.ran_at).getTime() > STALE_MS;
export function ago(iso: string) {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
}
export const HEADLINE: Record<Overall | "none" | "stale", string> = { healthy: "All systems healthy", attention: "Needs attention", unhealthy: "Unhealthy", none: "No checks yet", stale: "Checks overdue" };
