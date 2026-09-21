import { admin } from "./supabase.js";
import { getSettings } from "./settings.js";
import { alreadySent, appUrl, notify } from "./notify.js";

// The assignment engine. Parent picks a mentor; the job is OFFERED to that mentor with an
// acceptance window; on decline or expiry it goes to the second choice; if nobody takes it the job
// lands in the admin queue (UNASSIGNED). If the first choice is at capacity the job WAITS for the
// number of days the parent chose, then falls through the same path. Accepting starts the
// turnaround clock. tick() is called by a timer to move time-based states along.

const hours = (h: number) => h * 3600 * 1000;
const iso = (t: number) => new Date(t).toISOString();

async function mentorAvailable(athleteId: string) {
  const { data } = await admin.from("marketplace_mentors").select("available").eq("user_id", athleteId).maybeSingle();
  return Boolean(data?.available);
}

async function orderOf(jobId: string) {
  const { data } = await admin
    .from("jobs")
    .select("id, status, order_id, athlete_id, accepted_at, due_at, orders(id, parent_id, player_id, first_choice_athlete_id, second_choice_athlete_id, wait_days, waitlisted_at, tier, price_cents)")
    .eq("id", jobId)
    .single();
  return data as unknown as {
    id: string; status: string; order_id: string; athlete_id: string | null; accepted_at: string | null; due_at: string | null;
    orders: { id: string; parent_id: string; player_id: string; first_choice_athlete_id: string | null; second_choice_athlete_id: string | null; wait_days: number | null; waitlisted_at: string | null; tier: string; price_cents: number };
  };
}

async function playerLabel(playerId: string) {
  const { data } = await admin.from("players").select("first_name, last_name, position, age_group").eq("id", playerId).maybeSingle();
  if (!data) return "a youth athlete";
  const li = data.last_name ? ` ${data.last_name[0]}.` : "";
  return `${data.first_name}${li} (${data.age_group} ${data.position})`;
}

export async function offerJob(jobId: string, athleteId: string, rank: 1 | 2 | 3) {
  const s = await getSettings();
  const now = Date.now();
  await admin.from("job_offers").insert({ job_id: jobId, athlete_id: athleteId, rank, expires_at: iso(now + hours(s.rules.accept_hours)) });
  await admin.from("jobs").update({ status: "offered", athlete_id: null }).eq("id", jobId);
  const job = await orderOf(jobId);
  await admin.from("orders").update({ status: "offered" }).eq("id", job.order_id);
  const who = await playerLabel(job.orders.player_id);
  await notify(athleteId, "offer.new", "New breakdown request",
    `<p>A parent chose you to break down film for <b>${who}</b>.</p><p>You have ${s.rules.accept_hours} hours to accept. Once you accept, the ${s.rules.turnaround_hours}-hour turnaround starts.</p><p><a href="${appUrl("/athlete")}" style="color:#d4a32c">Open your jobs</a></p>`,
    { targetId: jobId });
}

async function nextOffer(jobId: string) {
  const job = await orderOf(jobId);
  const o = job.orders;
  const { data: offers } = await admin.from("job_offers").select("athlete_id, rank").eq("job_id", jobId);
  const tried = new Set((offers ?? []).map((x) => x.athlete_id));
  if (o.second_choice_athlete_id && !tried.has(o.second_choice_athlete_id)) {
    return offerJob(jobId, o.second_choice_athlete_id, 2);
  }
  await admin.from("jobs").update({ status: "unassigned", athlete_id: null }).eq("id", jobId);
  await admin.from("orders").update({ status: "unassigned" }).eq("id", o.id);
  await notify(o.parent_id, "order.unassigned", "We're finding your youth athlete a mentor",
    `<p>Your chosen FLP Mentor${o.second_choice_athlete_id ? "s weren't" : " wasn't"} able to take this job in time. FLP is assigning it by hand and you'll hear from us shortly.</p>`,
    { targetId: o.id });
}

// Called when payment lands (Stripe webhook, or the dev shortcut).
export async function openJobForOrder(orderId: string) {
  const s = await getSettings();
  const { data: o } = await admin.from("orders").select("id, parent_id, player_id, first_choice_athlete_id, second_choice_athlete_id, wait_days, status").eq("id", orderId).single();
  if (!o) throw new Error("order not found");
  const { data: existing } = await admin.from("jobs").select("id").eq("order_id", orderId).maybeSingle();
  if (existing) return existing.id;
  const { data: job } = await admin.from("jobs").insert({ order_id: orderId, status: "waiting" }).select("id").single();
  if (!job) throw new Error("could not create job");
  const first = o.first_choice_athlete_id;
  if (first && (await mentorAvailable(first))) {
    await offerJob(job.id, first, 1);
  } else if (first) {
    const waitDays = o.wait_days ?? s.rules.wait_days_default;
    await admin.from("orders").update({ waitlisted_at: new Date().toISOString(), wait_days: waitDays, status: "paid" }).eq("id", orderId);
    await admin.from("jobs").update({ status: "waiting" }).eq("id", job.id);
    await notify(o.parent_id, "order.waitlisted", "You're on the waitlist",
      `<p>Your first-choice FLP Mentor is at capacity. We'll hold your spot for ${waitDays} day${waitDays === 1 ? "" : "s"}; if they free up, they get the job, otherwise it goes to your second choice.</p>`,
      { targetId: orderId });
  } else {
    await nextOffer(job.id);
  }
  return job.id;
}

export async function respondToOffer(jobId: string, athleteId: string, response: "accepted" | "declined") {
  const s = await getSettings();
  const { data: offer } = await admin
    .from("job_offers")
    .select("id, expires_at")
    .eq("job_id", jobId)
    .eq("athlete_id", athleteId)
    .is("response", null)
    .maybeSingle();
  if (!offer) throw new Error("no open offer for this job");
  const now = Date.now();
  if (new Date(offer.expires_at).getTime() < now) throw new Error("this offer has expired");
  await admin.from("job_offers").update({ response, responded_at: iso(now) }).eq("id", offer.id);
  const job = await orderOf(jobId);
  if (response === "accepted") {
    await admin.from("jobs").update({ status: "accepted", athlete_id: athleteId, accepted_at: iso(now), due_at: iso(now + hours(s.rules.turnaround_hours)), claimed_at: iso(now) }).eq("id", jobId);
    await admin.from("orders").update({ status: "accepted" }).eq("id", job.order_id);
    await notify(job.orders.parent_id, "order.accepted", "Your FLP Mentor accepted",
      `<p>Your breakdown is in progress. Expect it within ${s.rules.turnaround_hours} hours.</p><p><a href="${appUrl(`/parent/orders/${job.order_id}`)}" style="color:#d4a32c">Track it</a></p>`,
      { targetId: job.order_id });
  } else {
    await nextOffer(jobId);
  }
}

// Time-based transitions. Safe to run every few minutes; every step is idempotent.
export async function tick() {
  const s = await getSettings();
  const now = Date.now();
  const report = { expired: 0, waitedOut: 0, nudges: 0, reminders: 0 };

  // 1. Expire offers past their window and move on.
  const { data: stale } = await admin.from("job_offers").select("id, job_id").is("response", null).lt("expires_at", iso(now));
  for (const o of stale ?? []) {
    await admin.from("job_offers").update({ response: "expired", responded_at: iso(now) }).eq("id", o.id);
    await nextOffer(o.job_id);
    report.expired++;
  }

  // 2. Nudge mentors sitting on an offer past the nudge point.
  const { data: open } = await admin.from("job_offers").select("id, job_id, athlete_id, offered_at").is("response", null).is("nudged_at", null);
  for (const o of open ?? []) {
    if (now - new Date(o.offered_at).getTime() >= hours(s.rules.accept_nudge_hours)) {
      await notify(o.athlete_id, "offer.nudge", "A breakdown request is waiting on you",
        `<p>You have less than ${s.rules.accept_hours - s.rules.accept_nudge_hours} hours left to accept a request before it moves to another mentor.</p><p><a href="${appUrl("/athlete")}" style="color:#d4a32c">Respond now</a></p>`,
        { targetId: o.job_id });
      await admin.from("job_offers").update({ nudged_at: iso(now) }).eq("id", o.id);
      report.nudges++;
    }
  }

  // 3. Waitlisted orders: wait period over -> offer first choice if now available, else fall through.
  const { data: waiting } = await admin.from("jobs").select("id, order_id, orders(first_choice_athlete_id, wait_days, waitlisted_at)").eq("status", "waiting");
  for (const w of (waiting ?? []) as unknown as { id: string; order_id: string; orders: { first_choice_athlete_id: string | null; wait_days: number | null; waitlisted_at: string | null } }[]) {
    const first = w.orders.first_choice_athlete_id;
    const startedAt = w.orders.waitlisted_at ? new Date(w.orders.waitlisted_at).getTime() : now;
    const waitMs = (w.orders.wait_days ?? s.rules.wait_days_default) * 24 * 3600 * 1000;
    if (first && (await mentorAvailable(first))) {
      await offerJob(w.id, first, 1);
    } else if (now - startedAt >= waitMs) {
      await nextOffer(w.id);
      report.waitedOut++;
    }
  }

  // 4. Turnaround reminders for accepted jobs.
  const { data: active } = await admin.from("jobs").select("id, athlete_id, accepted_at, due_at").eq("status", "accepted");
  for (const j of active ?? []) {
    if (!j.athlete_id || !j.accepted_at) continue;
    const elapsed = now - new Date(j.accepted_at).getTime();
    for (const h of s.rules.reminder_hours) {
      if (elapsed >= hours(h)) {
        const template = `job.reminder.${h}`;
        if (await alreadySent(j.athlete_id, template, j.id)) continue;
        const left = Math.max(0, Math.round((new Date(j.due_at!).getTime() - now) / 3600000));
        await notify(j.athlete_id, template, `${left} hours left on a breakdown`,
          `<p>Friendly reminder: a breakdown you accepted is due in about ${left} hours.</p><p><a href="${appUrl("/athlete")}" style="color:#d4a32c">Open the job</a></p>`,
          { targetId: j.id });
        report.reminders++;
      }
    }
  }
  return report;
}
