import Stripe from "stripe";
import { env } from "./env.js";

// Optional until Scott adds the FLP Stripe test keys; the dev environment can mark orders paid
// without it. Never enabled in production without keys: openJobForOrder is only reachable via a
// verified webhook or the dev-only shortcut.
export const stripe = env.stripeSecretKey ? new Stripe(env.stripeSecretKey) : null;
export const stripeConfigured = Boolean(stripe && env.stripeWebhookSecret);
