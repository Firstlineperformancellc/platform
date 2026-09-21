import { admin } from "./supabase.js";
import { getSettings } from "./settings.js";

// Turn a mentor's weekly availability windows (in their own time zone) into concrete bookable
// start times, minus anything already booked, minus the lead-time cutoff.

export type Window = { dow: number; start: string; end: string };

// Offset (ms) of `tz` at the given UTC instant, via Intl (no tz library needed).
function tzOffsetMs(date: Date, tz: string) {
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
  return asUtc - date.getTime();
}

// Local wall-clock (y, m, d, hh:mm) in tz -> UTC Date.
export function zonedToUtc(y: number, m: number, d: number, hhmm: string, tz: string) {
  const [hh, mm] = hhmm.split(":").map(Number);
  const guess = new Date(Date.UTC(y, m, d, hh, mm));
  const off = tzOffsetMs(guess, tz);
  const first = new Date(guess.getTime() - off);
  // second pass handles DST edges
  return new Date(guess.getTime() - tzOffsetMs(first, tz));
}

export async function slotsForMentor(athleteId: string, minutes: number): Promise<string[]> {
  const s = await getSettings();
  const r = s.rules as Record<string, number>;
  const step = r.session_slot_minutes ?? 30;
  const lead = (r.session_min_lead_hours ?? 12) * 3600 * 1000;
  const days = r.session_book_ahead_days ?? 14;

  const { data: a } = await admin.from("athletes").select("availability, timezone").eq("user_id", athleteId).maybeSingle();
  const windows = ((a?.availability ?? []) as Window[]).filter((w) => /^\d{2}:\d{2}$/.test(w.start) && /^\d{2}:\d{2}$/.test(w.end));
  const tz = a?.timezone || "America/Detroit";
  if (windows.length === 0) return [];

  const now = Date.now();
  const horizon = now + days * 86400 * 1000;
  const { data: booked } = await admin
    .from("sessions")
    .select("scheduled_at, duration_minutes")
    .eq("athlete_id", athleteId)
    .in("status", ["requested", "scheduled", "in_progress"])
    .gte("scheduled_at", new Date(now - 6 * 3600 * 1000).toISOString());
  const taken = (booked ?? []).map((b) => ({ s: new Date(b.scheduled_at!).getTime(), e: new Date(b.scheduled_at!).getTime() + (b.duration_minutes ?? 30) * 60000 }));

  const out: string[] = [];
  // Walk local calendar days in the mentor's tz.
  const localNow = new Date(now + tzOffsetMs(new Date(now), tz));
  for (let dayIdx = 0; dayIdx <= days; dayIdx++) {
    const day = new Date(Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate() + dayIdx));
    const dow = day.getUTCDay();
    for (const w of windows.filter((x) => x.dow === dow)) {
      const start = zonedToUtc(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), w.start, tz).getTime();
      const end = zonedToUtc(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), w.end, tz).getTime();
      for (let t = start; t + minutes * 60000 <= end; t += step * 60000) {
        if (t < now + lead || t > horizon) continue;
        const clash = taken.some((b) => t < b.e && t + minutes * 60000 > b.s);
        if (!clash) out.push(new Date(t).toISOString());
      }
    }
  }
  return out;
}
