import { createClient } from "@supabase/supabase-js";
import { env } from "./env.js";

// Service-role client: bypasses row-level security. Only this service holds this key, and every
// route that uses it is responsible for its own authorization (the caller's JWT or a webhook signature).
export const admin = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// A client acting as the caller: verifies the bearer token the app sends and returns the user id,
// so routes can enforce "only this parent" / "only this athlete" rules against the database.
export async function userFromBearer(authorization: string | undefined) {
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : undefined;
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return null;
  // A suspended or deleted account keeps a valid token for up to an hour; refuse it here regardless.
  const { data: p } = await admin.from("profiles").select("suspended_at, deleted_at").eq("id", data.user.id).maybeSingle();
  if (p?.suspended_at || p?.deleted_at) return null;
  return data.user;
}
