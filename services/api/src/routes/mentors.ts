import { Hono } from "hono";
import { admin, userFromBearer } from "../supabase.js";
import { stripe } from "../stripe.js";
import { appUrl } from "../notify.js";

// Mentor self-service that needs the server: Stripe Connect onboarding and status.
// Profile fields are edited directly through Supabase under RLS (athletes_self_update).
export const mentors = new Hono();

async function mentorOf(authorization: string | undefined) {
  const user = await userFromBearer(authorization);
  if (!user) return null;
  const { data } = await admin.from("athletes").select("user_id, display_name, stripe_account_id, payouts_enabled, status").eq("user_id", user.id).maybeSingle();
  return data ? { user, athlete: data } : null;
}

// POST /mentors/me/connect — create the Express account if needed and return an onboarding link.
mentors.post("/me/connect", async (c) => {
  const m = await mentorOf(c.req.header("authorization"));
  if (!m) return c.json({ error: "sign in as a mentor" }, 401);
  if (!stripe) return c.json({ error: "Payout setup opens once FLP's Stripe account is connected." }, 503);
  if (m.athlete.status !== "approved") return c.json({ error: "payout setup opens after approval" }, 400);
  let accountId = m.athlete.stripe_account_id;
  if (!accountId) {
    const acct = await stripe.accounts.create({
      type: "express",
      email: m.user.email ?? undefined,
      capabilities: { transfers: { requested: true } },
      business_type: "individual",
      metadata: { athleteId: m.user.id },
    });
    accountId = acct.id;
    await admin.from("athletes").update({ stripe_account_id: accountId }).eq("user_id", m.user.id);
  }
  const link = await stripe.accountLinks.create({
    account: accountId,
    type: "account_onboarding",
    refresh_url: appUrl("/athlete/profile?connect=refresh"),
    return_url: appUrl("/athlete/profile?connect=return"),
  });
  return c.json({ url: link.url });
});

// GET /mentors/me/connect — refresh payouts_enabled from Stripe.
mentors.get("/me/connect", async (c) => {
  const m = await mentorOf(c.req.header("authorization"));
  if (!m) return c.json({ error: "sign in as a mentor" }, 401);
  if (!stripe || !m.athlete.stripe_account_id) return c.json({ configured: Boolean(stripe), connected: false, payouts_enabled: false });
  const acct = await stripe.accounts.retrieve(m.athlete.stripe_account_id);
  const enabled = Boolean(acct.payouts_enabled && acct.charges_enabled !== undefined);
  if (enabled !== m.athlete.payouts_enabled) await admin.from("athletes").update({ payouts_enabled: enabled }).eq("user_id", m.user.id);
  return c.json({ configured: true, connected: true, payouts_enabled: enabled, requirements: acct.requirements?.currently_due ?? [] });
});
