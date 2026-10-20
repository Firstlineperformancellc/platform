import { randomBytes, timingSafeEqual } from "node:crypto";
import { admin } from "./supabase.js";
import { getSettings, presentsRules } from "./settings.js";
import { alreadySent, appUrl, mailShell, notify, sendMail } from "./notify.js";
import { notifyAdmins, refundPayment } from "./billing.js";

// First Line Presents: a personal video message from an FLP athlete, bought by a parent or by anyone
// from the site. One request, one recipient, one video. The request is one-way: the athlete never sees
// who bought it, the buyer never gets a way to reach the athlete, and a video meant for a child is
// checked by FLP before it goes out.

export type PresentsRequest = {
  id: string; athlete_id: string; buyer_id: string | null; buyer_email: string; buyer_name: string;
  recipient_name: string; recipient_minor: boolean; occasion: string; from_name: string; instructions: string; team: string;
  status: string; price_cents: number; athlete_share_cents: number; currency: string;
  stripe_checkout_session_id: string | null; stripe_payment_intent_id: string | null; refunded_cents: number; refund_error: string | null;
  video_media_id: string | null; share_token: string; flags: string[];
  paid_at: string | null; due_at: string | null; delivered_at: string | null; declined_reason: string | null;
  review_note: string | null; reviewed_by: string | null; reviewed_at: string | null; reminded: number;
  rating: number | null; problem_text: string | null; problem_at: string | null; created_at: string; updated_at: string;
};

export const PRESENTS_REQUEST_COLS = "id, athlete_id, buyer_id, buyer_email, buyer_name, recipient_name, recipient_minor, occasion, from_name, instructions, team, status, price_cents, athlete_share_cents, currency, stripe_checkout_session_id, stripe_payment_intent_id, refunded_cents, refund_error, video_media_id, share_token, flags, paid_at, due_at, delivered_at, declined_reason, review_note, reviewed_by, reviewed_at, reminded, rating, problem_text, problem_at, created_at, updated_at";

// What the athlete is allowed to see: the request, never the buyer.
export const ATHLETE_VIEW_COLS = "id, athlete_id, recipient_name, recipient_minor, occasion, from_name, instructions, team, status, price_cents, athlete_share_cents, currency, video_media_id, flags, paid_at, due_at, delivered_at, declined_reason, review_note, reviewed_at, rating, created_at";

export const newShareToken = () => randomBytes(18).toString("base64url");
export function tokenMatches(given: string | undefined | null, actual: string) {
  if (!given || given.length !== actual.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(actual));
}
export const viewUrl = (r: { id: string; share_token: string }) => appUrl(`/presents/view?r=${r.id}&t=${r.share_token}`);
export const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
// Everything a buyer or athlete typed is escaped before it goes into an email.
export const esc = (t: unknown) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

// --- Screening ---------------------------------------------------------------------------------
// Contact details are refused outright: the request must stay one-way. Words on FLP's list hold the
// request for an admin to look at before the athlete sees it.
const CONTACT: [RegExp, string][] = [
  [/[\w.+-]+@[\w-]+\.[\w.-]+/i, "an email address"],
  [/(?:\+?\d[\s().-]*){10,}/, "a phone number"],
  [/\b(?:https?:\/\/|www\.)\S+/i, "a web link"],
  [/\b[a-z0-9-]{2,}\.(?:com|net|org|io|ca|co|app|me|tv|gg|us)\b/i, "a web address"],
  [/(?:^|[\s(])@[a-z0-9_.]{3,}/i, "a social handle"],
  [/\b(?:snap(?:chat)?|insta(?:gram)?|tiktok|whatsapp|discord|telegram|facetime|text me|call me|dm me|message me|add me|hit me up)\b/i, "a way to contact someone"],
];
export function contactIn(text: string): string | null {
  for (const [re, what] of CONTACT) if (re.test(text)) return what;
  return null;
}
export function flagsIn(text: string, blocklist: string[]): string[] {
  const lower = text.toLowerCase();
  return blocklist.map((w) => w.trim().toLowerCase()).filter((w) => w && lower.includes(w));
}

// --- Messages to the buyer (an account, or just an email) --------------------------------------
export async function tellBuyer(r: { id: string; buyer_id: string | null; buyer_email: string }, template: string, subject: string, html: string) {
  if (r.buyer_id) return notify(r.buyer_id, template, subject, html, { targetId: r.id });
  await sendMail({ to: r.buyer_email, subject, html: mailShell(subject, html) });
}
const link = (href: string, label: string) => `<p><a href="${href}" style="color:#d4a32c">${label}</a></p>`;

export async function loadRequest(id: string) {
  const { data } = await admin.from("presents_requests").select(PRESENTS_REQUEST_COLS).eq("id", id).maybeSingle();
  return (data as PresentsRequest | null) ?? null;
}
async function athleteName(id: string) {
  const { data } = await admin.from("athletes").select("display_name, presents_days").eq("user_id", id).maybeSingle();
  return { name: data?.display_name ?? "your FLP athlete", days: data?.presents_days ?? 7 };
}
const when = (iso: string) => new Date(iso).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "America/New_York" });

// --- Lifecycle ---------------------------------------------------------------------------------

// Paid (Stripe webhook, or the free-preview path): start the clock and tell both sides.
export async function afterPresentsPaid(id: string, paymentIntent: string | null) {
  const r = await loadRequest(id);
  if (!r || r.status !== "draft") return;
  const a = await athleteName(r.athlete_id);
  const paidAt = new Date();
  const due = new Date(paidAt.getTime() + a.days * 86400000);
  const flagged = r.flags.length > 0;
  await admin.from("presents_requests").update({
    status: flagged ? "flagged" : "open", paid_at: paidAt.toISOString(), due_at: due.toISOString(),
    ...(paymentIntent ? { stripe_payment_intent_id: paymentIntent } : {}),
  }).eq("id", id).eq("status", "draft");
  await tellBuyer(r, "presents.receipt", `Your First Line Presents request is in`,
    `<p>Thanks. ${esc(a.name)} has until <b>${when(due.toISOString())}</b> to record a video for ${esc(r.recipient_name)}. We'll email you the moment it's ready. If ${esc(a.name)} can't do it, you're refunded automatically.</p><p>Paid: ${money(r.price_cents)}.</p>` + link(viewUrl(r), "See your request"));
  if (flagged) {
    await notifyAdmins("presents.flagged", "A Presents request needs a look before the athlete sees it",
      `<p>A request for ${esc(a.name)} used words on the review list (${esc(r.flags.join(", "))}). Release it to the athlete, or refund it.</p>` + link(appUrl("/admin/presents"), "Open First Line Presents"), id);
  } else {
    await tellAthleteNewRequest({ ...r, due_at: due.toISOString() });
  }
}

export async function tellAthleteNewRequest(r: PresentsRequest) {
  await notify(r.athlete_id, "presents.new", "A First Line Presents request is waiting for you",
    `<p>Someone asked you for a <b>${esc(r.occasion.toLowerCase())}</b> video for <b>${esc(r.recipient_name)}</b>. You earn ${money(r.athlete_share_cents)}. Record it on your phone and send it by <b>${r.due_at ? when(r.due_at) : "the due date"}</b>.</p>` + link(appUrl("/athlete/presents"), "Open your requests"), { targetId: r.id });
}

// A video uploaded and sent by the athlete: deliver it, or hold it for FLP when the recipient is a child.
export async function sendRequest(r: PresentsRequest, mediaId: string) {
  const s = await getSettings();
  const rules = presentsRules(s);
  const { data: m } = await admin.from("media").select("id, owner_id, status, duration_seconds, purpose").eq("id", mediaId).maybeSingle();
  if (!m || m.owner_id !== r.athlete_id || m.purpose !== "presents_video") return { ok: false as const, error: "that video isn't one of yours" };
  if (m.status !== "ready") return { ok: false as const, error: "the video is still processing; try again in a minute" };
  const secs = Number(m.duration_seconds ?? 0);
  if (secs && secs < rules.minSeconds) return { ok: false as const, error: `the video is too short (under ${rules.minSeconds} seconds)` };
  if (secs && secs > rules.maxSeconds) return { ok: false as const, error: `the video is too long (over ${Math.round(rules.maxSeconds / 60)} minutes); record a shorter one` };
  const review = rules.review === "all" || (rules.review === "minors" && r.recipient_minor);
  if (review) {
    await admin.from("presents_requests").update({ status: "in_review", video_media_id: mediaId, review_note: null }).eq("id", r.id);
    await notifyAdmins("presents.review", "A Presents video is waiting for your check",
      `<p>A video for ${esc(r.recipient_name)} (${r.recipient_minor ? "under 18" : "adult"}) is ready. Watch it and approve or send it back.</p>` + link(appUrl("/admin/presents"), "Open First Line Presents"), r.id);
    await tellBuyer(r, "presents.in_review", "Your First Line Presents video is almost there",
      `<p>The video for ${esc(r.recipient_name)} has been recorded. ${r.recipient_minor ? "FLP checks every video made for a young athlete before it goes out" : "FLP checks this video before it goes out"}, which usually takes less than a day.</p>` + link(viewUrl(r), "See your request"));
    return { ok: true as const, status: "in_review" };
  }
  await deliverRequest({ ...r, video_media_id: mediaId }, null);
  return { ok: true as const, status: "delivered" };
}

export async function deliverRequest(r: PresentsRequest, reviewedBy: string | null) {
  if (!r.video_media_id) throw new Error("no video to deliver");
  const now = new Date().toISOString();
  // Only the first delivery wins: a second approve, or one racing a refund or expiry, changes nothing.
  const { data: won } = await admin.from("presents_requests").update({
    status: "delivered", delivered_at: now, video_media_id: r.video_media_id,
    ...(reviewedBy ? { reviewed_by: reviewedBy, reviewed_at: now } : {}),
  }).eq("id", r.id).in("status", ["open", "in_review"]).select("id");
  if (!won?.length) return false;
  if (r.athlete_share_cents > 0) {
    // the unique index on payouts.presents_request_id makes a duplicate insert fail quietly
    await admin.from("payouts").insert({ athlete_id: r.athlete_id, presents_request_id: r.id, amount_cents: r.athlete_share_cents, currency: r.currency, status: "owed" });
  }
  const a = await athleteName(r.athlete_id);
  await tellBuyer(r, "presents.delivered", `Your video from ${a.name} is ready`,
    `<p>${esc(a.name)} recorded a video for ${esc(r.recipient_name)}. Watch it, download it, and share the private link with the family.</p>` + link(viewUrl(r), "Watch the video"));
  await notify(r.athlete_id, "presents.sent", "Your First Line Presents video went out", `<p>Your video for ${esc(r.recipient_name)} was delivered. ${money(r.athlete_share_cents)} is on your ledger.</p>` + link(appUrl("/athlete/earnings"), "See your earnings"), { targetId: r.id });
  return true;
}

// Refund everything and close the request. Used for a decline, an expiry, or an admin refund in full.
export async function closeWithRefund(r: PresentsRequest, status: "declined" | "expired" | "refunded" | "cancelled", reason: string, key: string) {
  const left = r.price_cents - r.refunded_cents;
  let refundError: string | null = null;
  if (r.stripe_payment_intent_id && left > 0) {
    const res = await refundPayment(r.stripe_payment_intent_id, left, `presents_${r.id}_${key}`);
    if (!res.ok) refundError = res.error;
  }
  await admin.from("presents_requests").update({
    status, declined_reason: reason.slice(0, 300),
    refunded_cents: refundError ? r.refunded_cents : r.price_cents, refund_error: refundError,
  }).eq("id", r.id);
  await admin.from("payouts").update({ status: "voided", note: `Presents request ${status}` }).eq("presents_request_id", r.id).in("status", ["owed", "held"]);
  const a = await athleteName(r.athlete_id);
  const why = status === "expired" ? `${esc(a.name)} didn't record the video in time` : status === "declined" ? `${esc(a.name)} couldn't take this request` : "FLP refunded this request";
  await tellBuyer(r, `presents.${status}`, `Your First Line Presents request was refunded`,
    `<p>${why}, so ${refundError ? "FLP is processing your refund of" : "we refunded"} ${money(left)}${r.stripe_payment_intent_id ? " to your card" : ""}. ${refundError ? "It will show within a few business days." : "It can take a few business days to show on your statement."}</p>` + link(appUrl("/presents"), "Choose another athlete"));
  if (refundError) await notifyAdmins("refund.failed", "A Presents refund did not go through", `<p>${refundError}</p>` + link(appUrl("/admin/presents"), "Open First Line Presents"), r.id);
  return { refundError };
}

// The scheduled sweep: reminders before the deadline, refunds after it, and stale unpaid drafts.
export async function presentsTick() {
  const now = Date.now();
  const report = { reminders: 0, expired: 0, draftsRemoved: 0 };
  // Held (flagged) requests are FLP's to release first; their clock restarts on release, so they never expire here.
  const { data: open } = await admin.from("presents_requests").select(PRESENTS_REQUEST_COLS).eq("status", "open").not("due_at", "is", null);
  for (const row of (open ?? []) as PresentsRequest[]) {
    const due = new Date(row.due_at!).getTime();
    if (due <= now) {
      await closeWithRefund(row, "expired", "not delivered by the due date", "expired");
      report.expired++;
      continue;
    }
    if (row.paid_at && now - new Date(row.paid_at).getTime() < 3600000) continue; // the new-request email just went out
    const hoursLeft = (due - now) / 3600000;
    const stage = hoursLeft <= 24 ? 2 : hoursLeft <= 48 ? 1 : 0;
    if (stage > row.reminded) {
      await notify(row.athlete_id, `presents.reminder${stage}`, `${stage === 2 ? "One day" : "Two days"} left on a Presents request`,
        `<p>Your ${esc(row.occasion.toLowerCase())} video for ${esc(row.recipient_name)} is due ${when(row.due_at!)}. ${money(row.athlete_share_cents)} is waiting on it; after the due date the family is refunded and the request closes.</p>` + link(appUrl("/athlete/presents"), "Record it now"), { targetId: row.id });
      await admin.from("presents_requests").update({ reminded: stage }).eq("id", row.id);
      report.reminders++;
    }
  }
  const { data: drafts } = await admin.from("presents_requests").delete().eq("status", "draft").lt("created_at", new Date(now - 2 * 86400000).toISOString()).select("id");
  report.draftsRemoved = (drafts ?? []).length;
  return report;
}

export { alreadySent };
