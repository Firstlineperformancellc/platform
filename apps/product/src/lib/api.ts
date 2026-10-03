import { supabase } from "./supabase";

const base = process.env.EXPO_PUBLIC_API_URL ?? "https://api-dev.firstlineperform.com";

// Calls the FLP API as the signed-in user. The API verifies the bearer token with Supabase.
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string; code?: string };
  if (res.status === 401 && body.code === "session_ended") {
    // the session was ended elsewhere or expired: clear it here so the app returns to sign-in
    await supabase.auth.signOut({ scope: "local" }).catch(() => {});
    throw new Error("Your session has ended. Sign in again to continue.");
  }
  if (!res.ok) throw new Error(body.error ?? `API error ${res.status}`);
  return body;
}
