import Mux from "@mux/mux-node";
import { env } from "./env.js";

// One Mux client for the service. Token comes from the env file the account owner filled in.
// The signing key (deploy/mux-signing-key.sh) lets the API mint short-lived playback tokens for
// signed assets: family film and breakdowns are never playable from a bare URL.
export const mux = new Mux({
  tokenId: env.muxTokenId,
  tokenSecret: env.muxTokenSecret,
  webhookSecret: env.muxWebhookSecret,
  jwtSigningKey: env.muxSigningKeyId ?? null,
  jwtPrivateKey: env.muxSigningKeyPrivate ?? null,
});

export const muxConfigured = Boolean(env.muxTokenId && env.muxTokenSecret);
export const muxSigningConfigured = Boolean(env.muxSigningKeyId && env.muxSigningKeyPrivate);
