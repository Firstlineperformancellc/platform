import { Link } from "expo-router";
import { StyleSheet, View } from "react-native";
import { Brand } from "@/components/Brand";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Screen } from "@/components/ui/Screen";
import { Body, H1, H3, Label, Small } from "@/components/ui/Text";
import { useAuth } from "@/lib/auth";
import { firstName } from "@/lib/types";
import { colors, space } from "@/theme/tokens";

export default function ParentHome() {
  const { profile, signOut } = useAuth();
  return (
    <Screen title="Dashboard" width="page">
      <View style={s.topbar}>
        <Brand size={44} />
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Link href="/parent/account" asChild><Button title="Account" variant="ghost" small /></Link>
          <Link href="/support" asChild><Button title="Support" variant="ghost" small /></Link>
          <Button title="Sign out" variant="ghost" small onPress={signOut} />
        </View>
      </View>
      <View>
        <Label>Parent account</Label>
        <H1>Welcome, {firstName(profile?.full_name)}</H1>
      </View>
      <View style={s.grid}>
        <Card style={s.cell}>
          <H3>Your youth athletes</H3>
          <Body style={{ color: colors.muted }}>Add your player once. Every breakdown and Film Room session is filed under them.</Body>
          <Link href="/parent/players" asChild>
            <Button title="Your youth athletes" variant="secondary" />
          </Link>
        </Card>
        <Card style={s.cell}>
          <H3>Order a breakdown</H3>
          <Body style={{ color: colors.muted }}>
            Upload game film, tell the athlete what to look for, and get a recorded breakdown back.
          </Body>
          <Link href="/parent/order" asChild>
            <Button title="Order a breakdown" />
          </Link>
          <Link href="/mentors" asChild>
            <Button title="Browse FLP Mentors" variant="ghost" small />
          </Link>
          <Link href="/parent/orders" asChild>
            <Button title="Your breakdowns" variant="ghost" small />
          </Link>
        </Card>
        <Card style={s.cell}>
          <H3>Film Room</H3>
          <Body style={{ color: colors.muted }}>
            A live, recorded video session with an FLP Mentor. Book from any mentor's profile; the recap lands in the Development Log.
          </Body>
          <Link href="/mentors" asChild>
            <Button title="Book a Film Room" variant="secondary" />
          </Link>
          <Link href="/parent/sessions" asChild>
            <Button title="Your sessions" variant="ghost" small />
          </Link>
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
