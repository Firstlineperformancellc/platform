import { randomBytes } from "node:crypto";
import { admin } from "./supabase.js";
import { notifyAdmins } from "./billing.js";
import { appUrl } from "./notify.js";

// When a payment or video provider refuses a request that a parent (or mentor) made, they get a
// plain message with a short reference instead of "internal error", the server log gets the
// provider's own words under that reference, and the admins get one email per kind of failure per
// 15 minutes, so the team hears about it before the customer has to tell them.

export type FailureKind = "checkout" | "upload" | "video_room";

export const newRef = () => randomBytes(3).toString("hex").toUpperCase();

// The provider's answer in one line: Stripe errors carry type/code/requestId, Mux and Daily a message.
export function describeError(err: unknown) {
  const e = (err ?? {}) as { type?: string; code?: string; message?: string; requestId?: string; statusCode?: number; status?: number; raw?: { message?: string } };
  return {
    message: String(e.raw?.message ?? e.message ?? err).replace(/\s+/g, " ").slice(0, 400),
    code: e.code ?? null,
    type: e.type ?? (err as Error)?.name ?? null,
    status: e.statusCode ?? e.status ?? null,
    requestId: e.requestId ?? null,
  };
}

const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);
const WINDOW_MS = 15 * 60000;
const SUBJECT: Record<FailureKind, string> = {
  checkout: "A parent couldn't start checkout",
  upload: "A video upload couldn't start",
  video_room: "A Film Room video room couldn't be created",
};
const PROVIDER: Record<FailureKind, string> = { checkout: "Stripe", upload: "Mux", video_room: "Daily" };

export async function providerFailed(kind: FailureKind, what: string, err: unknown, context: Record<string, unknown> = {}): Promise<string> {
  const ref = newRef();
  const d = describeError(err);
  console.error(`[${kind}] ${what} failed ref=${ref} ${JSON.stringify({ ...context, ...d })}`);
  try {
    const template = `admin.${kind}_failed`;
    const since = new Date(Date.now() - WINDOW_MS).toISOString();
    const { data: recent } = await admin.from("notifications").select("id").eq("template", template).gte("created_at", since).limit(1);
    if (!recent?.length) {
      const html =
        `<p>${esc(what)} failed just now. ${kind === "checkout" ? "Nothing was charged; the customer saw a message asking them to try again later." : "The customer saw a message asking them to try again."}</p>` +
        `<p><b>${PROVIDER[kind]} said:</b> ${esc(d.message)}${d.code ? ` (code <code>${esc(String(d.code))}</code>)` : ""}</p>` +
        `<p>Reference <b>${ref}</b>. Further failures in the next 15 minutes are logged under their own references without another email.</p>` +
        `<p><a href="${appUrl("/admin/health")}" style="color:#d4a32c">Service health</a></p>`;
      await notifyAdmins(`admin.${kind}_failed`, SUBJECT[kind], html, String(context.id ?? ref));
    }
  } catch (e) {
    console.error(`team alert for ref=${ref} failed: ${(e as Error).message}`);
  }
  return ref;
}

export const checkoutDownMessage = (ref: string) =>
  `We couldn't open the secure payment page, so nothing was charged. FLP has been told and is on it. Please try again a little later. (Reference ${ref})`;
