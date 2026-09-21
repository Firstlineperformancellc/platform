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
  const report = { expiredRequests: 0, reminders: 0, autoCompleted: 0, mentorNoShows: 0, recordingsDeleted: 0 };

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
  const { data: ended } = await admin.from("sessions").select("id, athlete_id, scheduled_at, duration_minutes, athlete_joined_at").in("status", ["scheduled", "in_progress"]).lt("scheduled_at", iso(now - 3 * 3600000));
  for (const x of ended ?? []) {
    if (x.athlete_joined_at) {
      await completeSession(x.id);
      report.autoCompleted++;
      continue;
    }
    // The mentor never joined. A day after the booked end it becomes a mentor no-show: the family is
    // refunded, the scorecard records it, admin hears about it.
    const ends = new Date(x.scheduled_at!).getTime() + (x.duration_minutes ?? 30) * 60000;
    if (now >= ends + 24 * 3600000) {
      await cancelAndRefund(x.id, "no_show_mentor", "Your FLP Mentor didn't join", null);
      await admin.from("audit_log").insert({ actor_id: null, action: "session.no_show_mentor", target_type: "session", target_id: x.id, meta: { auto: true } });
      await notify(x.athlete_id, "session.no_show", "You missed a Film Room",
        `<p>A booked Film Room passed without you joining. The family has been refunded and this is on your scorecard. If something went wrong, reply to this email.</p>`, { targetId: x.id });
      const { data: admins } = await admin.from("profiles").select("id").eq("role", "admin");
      for (const a of admins ?? []) await notify(a.id, "session.no_show.admin", "Mentor no-show on a Film Room", `<p>A mentor never joined a booked session; the family was refunded automatically.</p><p><a href="${appUrl("/admin/sessions")}" style="color:#d4a32c">Film Room sessions</a></p>`, { targetId: x.id });
      report.mentorNoShows++;
    }
  }

  // Recording retention.
  const { data: old } = await admin.from("sessions").select("id, recording_daily_id, recordings").eq("recording_status", "ready").eq("recording_kept", false).lt("recording_expires_at", iso(now));
  for (const x of old ?? []) {
    const ids = new Set(((x.recordings ?? []) as { id: string }[]).map((r) => r.id));
    if (x.recording_daily_id) ids.add(x.recording_daily_id);
    for (const id of ids) await deleteRecording(id).catch(() => null);
    await admin.from("sessions").update({ recording_status: "deleted" }).eq("id", x.id);
    report.recordingsDeleted++;
  }
  return report;
}
