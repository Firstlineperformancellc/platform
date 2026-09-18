import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Brand } from "@/components/Brand";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { Screen } from "@/components/ui/Screen";
import { Body, H1, H3, Label } from "@/components/ui/Text";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { firstName, type Athlete } from "@/lib/types";
import { colors, space } from "@/theme/tokens";

export default function AthleteHome() {
  const { profile, session, signOut } = useAuth();
  const [athlete, setAthlete] = useState<Athlete | null | undefined>(undefined);

  useEffect(() => {
    if (!session) return;
    supabase
      .from("athletes")
      .select("user_id, slug, display_name, bio, positions, status, payouts_enabled")
      .eq("user_id", session.user.id)
      .maybeSingle()
      .then(({ data }) => setAthlete((data as Athlete | null) ?? null));
  }, [session]);

  const status = athlete?.status;

  return (
    <Screen width="page">
      <View style={s.topbar}>
        <Brand size={44} />
        <Button title="Sign out" variant="ghost" small onPress={signOut} />
      </View>
      <View>
        <Label>Athlete</Label>
        <H1>Welcome, {firstName(profile?.full_name)}</H1>
      </View>
      {status === "applied" ? (
        <Card>
          <Pill tone="warn">Application in review</Pill>
          <H3>FLP is reviewing your application</H3>
          <Body style={{ color: colors.muted }}>
            You'll get an email as soon as you're approved. Jobs appear here after that.
          </Body>
        </Card>
      ) : status === "approved" ? (
        <Card>
          <Pill tone="ok">Approved</Pill>
          <H3>Job board</H3>
          <Body style={{ color: colors.muted }}>Open jobs in your positions will list here. Coming next.</Body>
        </Card>
      ) : status === "suspended" ? (
        <Card>
          <Pill tone="danger">Suspended</Pill>
          <Body style={{ color: colors.muted }}>Contact team@firstlineperform.com.</Body>
        </Card>
      ) : athlete === null ? (
        <Card>
          <H3>Finish your application</H3>
          <Body style={{ color: colors.muted }}>Your account exists but the athlete profile is missing.</Body>
        </Card>
      ) : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md },
});
