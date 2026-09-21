import { Hono } from "hono";
import { admin, userFromBearer } from "../supabase.js";
import { getSettings, shareCents, type Tier } from "../settings.js";
import { stripe, stripeConfigured } from "../stripe.js";
import { openJobForOrder } from "../jobs.js";
import { env } from "../env.js";
import { appUrl } from "../notify.js";

export const orders = new Hono();

type Body = {
  playerId: string;
  mentorSlug: string;
  secondChoiceSlug?: string | null;
  waitDays?: number | null;
  focusAreas?: string[];
  notes?: string;
  youtubeUrl?: string | null;
};

// POST /orders — price the order from the mentor's tier, create it, and hand back a checkout URL.
// Charged at checkout (Scott, 2026-09-21), including waitlisted orders.
orders.post("/", async (c) => {
  const user = await userFromBearer(c.req.header("authorization"));
  if (!user) return c.json({ error: "sign in first" }, 401);
  const body = (await c.req.json().catch(() => null)) as Body | null;
  if (!body?.playerId || !body.mentorSlug) return c.json({ error: "playerId and mentorSlug are required" }, 400);

  const s = await getSettings();
  const { data: player } = await admin.from("players").select("id, parent_id, position, age_group, skill_level").eq("id", body.playerId).maybeSingle();
  if (!player || player.parent_id !== user.id) return c.json({ error: "youth athlete not found" }, 404);

  const { data: first } = await admin.from("marketplace_mentors").select("user_id, tier, available").eq("slug", body.mentorSlug).maybeSingle();
  if (!first) return c.json({ error: "mentor not found" }, 404);
  let second: { user_id: string } | null = null;
  if (body.secondChoiceSlug) {
    const { data } = await admin.from("marketplace_mentors").select("user_id").eq("slug", body.secondChoiceSlug).maybeSingle();
    second = data;
    if (second?.user_id === first.user_id) second = null;
  }
  if (s.rules.second_choice_required && !second) return c.json({ error: "a second choice is required" }, 400);

  const tier = first.tier as Tier;
  const price = s.breakdown_prices[tier];
  const share = shareCents(price, s.mentor_share_pct[tier]);

  const { data: order, error } = await admin
    .from("orders")
    .insert({
      parent_id: user.id,
      player_id: player.id,
      position: player.position,
      age_group: player.age_group,
      skill_level: player.skill_level,
      focus_areas: body.focusAreas ?? [],
      notes: (body.notes ?? "").slice(0, 2000),
      tier,
      price_cents: price,
      mentor_share_cents: share,
      currency: s.currency,
      first_choice_athlete_id: first.user_id,
      second_choice_athlete_id: second?.user_id ?? null,
      wait_days: first.available ? null : (body.waitDays ?? s.rules.wait_days_default),
      film_youtube_url: body.youtubeUrl || null,
      status: "draft",
    })
    .select("id")
    .single();
  if (error || !order) return c.json({ error: error?.message ?? "could not create order" }, 500);

  if (stripeConfigured && stripe) {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: user.email ?? undefined,
      line_items: [{ quantity: 1, price_data: { currency: s.currency, unit_amount: price, product_data: { name: `FLP breakdown · ${tier.toUpperCase()} mentor` } } }],
      metadata: { orderId: order.id },
      success_url: appUrl(`/parent/orders/${order.id}?paid=1`),
      cancel_url: appUrl(`/parent/order?cancelled=1&order=${order.id}`),
    });
    await admin.from("orders").update({ stripe_checkout_session_id: session.id }).eq("id", order.id);
    return c.json({ orderId: order.id, checkoutUrl: session.url });
  }

  if (env.appEnv === "dev") {
    // Dev shortcut while Stripe keys are pending: treat the order as paid immediately.
    await admin.from("orders").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", order.id);
    await openJobForOrder(order.id);
    return c.json({ orderId: order.id, devPaid: true });
  }
  return c.json({ error: "payments are not configured" }, 503);
});

// POST /orders/:id/film — attach the uploaded game film (or a YouTube link) to the order.
orders.post("/:id/film", async (c) => {
  const user = await userFromBearer(c.req.header("authorization"));
  if (!user) return c.json({ error: "sign in first" }, 401);
  const id = c.req.param("id");
  const body = (await c.req.json().catch(() => ({}))) as { mediaId?: string; youtubeUrl?: string };
  const { data: order } = await admin.from("orders").select("id, parent_id").eq("id", id).maybeSingle();
  if (!order || order.parent_id !== user.id) return c.json({ error: "order not found" }, 404);
  if (body.mediaId) {
    const { data: media } = await admin.from("media").select("id, owner_id").eq("id", body.mediaId).maybeSingle();
    if (!media || media.owner_id !== user.id) return c.json({ error: "media not found" }, 404);
    await admin.from("orders").update({ film_media_id: media.id }).eq("id", id);
  } else if (body.youtubeUrl) {
    await admin.from("orders").update({ film_youtube_url: body.youtubeUrl }).eq("id", id);
  } else return c.json({ error: "mediaId or youtubeUrl required" }, 400);
  return c.json({ ok: true });
});
