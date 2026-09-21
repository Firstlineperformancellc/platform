import { admin } from "./supabase.js";
import { getSettings } from "./settings.js";
import { alreadySent, appUrl, notify } from "./notify.js";
import { cancelAndRefund, completeSession } from "./routes/sessions.js";
import { deleteRecording } from "./daily.js";

const iso = (t: number) => new Date(t).toISOString();

// Time-based session work, run by the same timer as the job tick.
export async function sessionsTick() {
  const s = await getSettings();
  const r = s.rules as Record<string, number | number[]>;
  const now = Date.now();
  const report = { expiredRequests: 0, reminders: 0, autoCompleted: 0, recordingsDeleted: 0 };

  // Requested sessions the mentor never answered.
  const { data: stale } = await admin.from("sessions").select("id").eq("status", "requested").not("accept_by", "is", null).lt("accept_by", iso(now));
  for (const x of stale ?? []) {
    await cancelAndRefund(x.id, "expired", "Your FLP Mentor didn't confirm in time", null);
    report.expiredRequests++;
  }

  // Reminders to both sides.
  const hours = (r.session_reminder_hours as number[]) ?? [24, 1];
  const { data: upcoming } = await admin.from("sessions").select("id, athlete_id, parent_id, scheduled_at").eq("status", "scheduled").gte("scheduled_at", iso(now)).lte("scheduled_at", iso(now + 25 * 3600000));
  for (const x of upcoming ?? []) {
    const untilMs = new Date(x.scheduled_at!).getTime() - now;
    for (const h of hours) {
      if (untilMs <= h * 3600000) {
        for (const [uid, path] of [[x.parent_id, `/parent/sessions/${x.id}`], [x.athlete_id, "/athlete"]] as const) {
          const template = `session.reminder.${h}`;
          if (await alreadySent(uid, template, x.id)) continue;
          await notify(uid, template, h >= 24 ? "Film Room tomorrow" : "Film Room in one hour",
            `<p>Your Film Room starts ${new Date(x.scheduled_at!).toLocaleString("en-US", { timeZone: "America/Detroit", dateStyle: "medium", timeStyle: "short" })} ET.</p><p><a href="${appUrl(path)}" style="color:#d4a32c">Open</a></p>`,
            { targetId: x.id });
          report.reminders++;
        }
      }
    }
  }

  // Sessions past their end that nobody closed: complete them so the recap clock and payout start.
  const { data: ended } = await admin.from("sessions").select("id, scheduled_at, duration_minutes, athlete_joined_at").in("status", ["scheduled", "in_progress"]).lt("scheduled_at", iso(now - 3 * 3600000));
  for (const x of ended ?? []) {
    if (x.athlete_joined_at) {
      await completeSession(x.id);
      report.autoCompleted++;
    }
    // If the mentor never joined, leave it for the parent's no-show report or admin.
  }

  // Recording retention.
  const { data: old } = await admin.from("sessions").select("id, recording_daily_id").eq("recording_status", "ready").eq("recording_kept", false).lt("recording_expires_at", iso(now));
  for (const x of old ?? []) {
    if (x.recording_daily_id) await deleteRecording(x.recording_daily_id).catch(() => null);
    await admin.from("sessions").update({ recording_status: "deleted" }).eq("id", x.id);
    report.recordingsDeleted++;
  }
  return report;
}
