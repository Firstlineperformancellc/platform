import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error("EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY must be set (see .env.example)");
}

// The anon key is a public, RLS-restricted key by design; every row a client can
// touch is governed by the policies in supabase/migrations.
// True when this page load came from a Supabase email link (the client clears the hash right after).
export const arrivedFromEmailLink = typeof window !== "undefined" && /[#&]type=(signup|magiclink|recovery)/.test(window.location.hash);
export const arrivedFromSignupConfirmation = typeof window !== "undefined" && /[#&]type=signup/.test(window.location.hash);

export const supabase = createClient(url, anonKey, {
  auth: {
    storage: Platform.OS === "web" ? undefined : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === "web",
  },
});

export function siteUrl() {
  if (Platform.OS === "web" && typeof window !== "undefined") return window.location.origin;
  return process.env.EXPO_PUBLIC_SITE_URL ?? "flp://";
}
