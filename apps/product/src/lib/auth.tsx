import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { Redirect } from "expo-router";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { supabase } from "./supabase";
import type { Profile, Role } from "./types";
import { colors } from "@/theme/tokens";

type AuthState = {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState>({
  session: null,
  profile: null,
  loading: true,
  refresh: async () => {},
  signOut: async () => {},
});

async function fetchProfile(session: Session | null): Promise<Profile | null> {
  if (!session) return null;
  const { data } = await supabase
    .from("profiles")
    .select("id, role, full_name, email")
    .eq("id", session.user.id)
    .maybeSingle();
  return (data as Profile | null) ?? null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    setSession(data.session);
    setProfile(await fetchProfile(data.session));
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      // Supabase asks that no other client call run inside this callback; defer it.
      setTimeout(async () => {
        setProfile(await fetchProfile(next));
        setLoading(false);
      }, 0);
    });
    return () => sub.subscription.unsubscribe();
  }, [refresh]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
  }, []);

  return (
    <AuthContext.Provider value={{ session, profile, loading, refresh, signOut }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

export function Loading() {
  return (
    <View style={s.loading}>
      <ActivityIndicator color={colors.gold} />
    </View>
  );
}

// Route-group guard: signed in and holding the given role, or redirected.
export function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { session, profile, loading } = useAuth();
  if (loading) return <Loading />;
  if (!session) return <Redirect href="/sign-in" />;
  if (!profile) return <Loading />;
  if (profile.role !== role) return <Redirect href="/" />;
  return <>{children}</>;
}

const s = StyleSheet.create({
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
});
