import { StyleSheet, View } from "react-native";
import { Brand } from "@/components/Brand";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Screen } from "@/components/ui/Screen";
import { Body, H1, H3, Label } from "@/components/ui/Text";
import { useAuth } from "@/lib/auth";
import { colors, space } from "@/theme/tokens";

const AREAS = [
  ["Athletes", "Approve applications, suspend, review profiles."],
  ["Orders", "Every order, its job, and its state."],
  ["Jobs", "Reassign, extend deadlines, close."],
  ["Sessions", "Recordings and who joined."],
  ["Refunds", "Issue and track."],
  ["Settings", "Prices, payout amounts, assignment mode."],
] as const;

export default function AdminHome() {
  const { signOut } = useAuth();
  return (
    <Screen width="page">
      <View style={s.topbar}>
        <Brand size={44} />
        <Button title="Sign out" variant="ghost" small onPress={signOut} />
      </View>
      <View>
        <Label>FLP admin</Label>
        <H1>Control center</H1>
      </View>
      <View style={s.grid}>
        {AREAS.map(([title, blurb]) => (
          <Card key={title} style={s.cell}>
            <H3>{title}</H3>
            <Body style={{ color: colors.muted }}>{blurb}</Body>
          </Card>
        ))}
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.lg },
  cell: { flexGrow: 1, flexBasis: 300 },
});
