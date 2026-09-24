// Every secret the API uses is read here and nowhere else. Missing required values fail at boot,
// not on the first request. Values come from /var/www/flp-api/.env on the server (never from git).

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable ${name}`);
  return v;
}

function optional(name: string): string | undefined {
  return process.env[name] || undefined;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 3200),
  appEnv: (process.env.APP_ENV ?? "dev") as "dev" | "prod",
  supabaseUrl: required("SUPABASE_URL"),
  supabaseServiceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
  // Wired in later weeks; optional so the skeleton boots without them.
  muxTokenId: optional("MUX_TOKEN_ID"),
  muxTokenSecret: optional("MUX_TOKEN_SECRET"),
  muxWebhookSecret: optional("MUX_WEBHOOK_SECRET"),
  muxSigningKeyId: optional("MUX_SIGNING_KEY_ID"),
  muxSigningKeyPrivate: optional("MUX_SIGNING_KEY_PRIVATE"),
  stripeSecretKey: optional("STRIPE_SECRET_KEY"),
  stripeWebhookSecret: optional("STRIPE_WEBHOOK_SECRET"),
  dailyApiKey: optional("DAILY_API_KEY"),
  dailyWebhookSecret: optional("DAILY_WEBHOOK_SECRET"),
  // Daily allows one webhook per domain: production receives it and relays events for rooms it
  // does not own (dev sessions) to this URL, unchanged, so dev verifies them with the same secret.
  dailyRelayUrl: optional("DAILY_RELAY_URL"),
  resendApiKey: optional("RESEND_API_KEY"),
  // Support desk: the address replies come from (needs the root domain verified in Resend) and the
  // shared secret the inbound-mail script presents.
  supportFrom: optional("SUPPORT_FROM"),
  inboundEmailSecret: optional("INBOUND_EMAIL_SECRET"),
};
