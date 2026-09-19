import Mux from "@mux/mux-node";
import { env } from "./env.js";

// One Mux client for the service. Token comes from the env file the account owner filled in.
export const mux = new Mux({
  tokenId: env.muxTokenId,
  tokenSecret: env.muxTokenSecret,
  webhookSecret: env.muxWebhookSecret,
});

export const muxConfigured = Boolean(env.muxTokenId && env.muxTokenSecret);
