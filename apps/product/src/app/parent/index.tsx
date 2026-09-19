import { Link } from "expo-router";
import { StyleSheet, View } from "react-native";
import { Brand } from "@/components/Brand";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { Screen } from "@/components/ui/Screen";
import { Body, H1, H3, Label, Small } from "@/components/ui/Text";
import { useAuth } from "@/lib/auth";
import { firstName } from "@/lib/types";
import { colors, space } from "@/theme/tokens";

export default function ParentHome() {
  const { profile, signOut } = useAuth();
  return (
    <Screen width="page">
      <View style={s.topbar}>
        <Brand size={44} />
        <Button title="Sign out" variant="ghost" small onPress={signOut} />
      </View>
      <View>
        <Label>Parent account</Label>
        <H1>Welcome, {firstName(profile?.full_name)}</H1>
      </View>
      <View style={s.grid}>
        <Card style={s.cell}>
          <H3>Your players</H3>
          <Body style={{ color: colors.muted }}>No players yet. Add your player to order their first breakdown.</Body>
          <Button title="Add a player" variant="secondary" disabled />
          <Small>Opens with the order flow.</Small>
        </Card>
        <Card style={s.cell}>
          <H3>Order a breakdown</H3>
          <Body style={{ color: colors.muted }}>
            Upload game film, tell the athlete what to look for, and get a recorded breakdown back.
          </Body>
          <Button title="Order a breakdown" disabled />
          <Pill tone="muted">Coming next</Pill>
        </Card>
        <Card style={s.cell}>
          <H3>Upload test</H3>
          <Body style={{ color: colors.muted }}>
            Try the game-film upload: chunked, resumable, streams back when processed.
          </Body>
          <Link href="/parent/upload" asChild>
            <Button title="Test an upload" variant="secondary" />
          </Link>
          <Pill tone="gold">Week 1 spike</Pill>
        </Card>
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.lg },
  cell: { flexGrow: 1, flexBasis: 320 },
});
