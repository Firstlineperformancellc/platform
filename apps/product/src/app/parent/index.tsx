import { Link } from "expo-router";
import { StyleSheet, View } from "react-native";
import { Brand } from "@/components/Brand";
import { ExplainerVideo } from "@/components/ExplainerVideo";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Screen } from "@/components/ui/Screen";
import { Body, H1, H3, Label, Small } from "@/components/ui/Text";
import { useAuth } from "@/lib/auth";
import { openParentGuide } from "@/lib/legal";
import { presentsRules } from "@/lib/presents";
import { useSettings } from "@/lib/settings";
import { firstName } from "@/lib/types";
import { colors, space } from "@/theme/tokens";

export default function ParentHome() {
  const { profile, signOut } = useAuth();
  const { settings } = useSettings();
  return (
    <Screen title="Dashboard" width="page">
      <View style={s.topbar}>
        <Brand size={44} />
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <Link href="/parent/account" asChild><Button title="Account" variant="ghost" small /></Link>
          <Link href="/support" asChild><Button title="Support" variant="ghost" small /></Link>
          <Button title="Sign out" variant="ghost" small onPress={signOut} />
        </View>
      </View>
      <View>
        <Label>Parent account</Label>
        <H1>Welcome, {firstName(profile?.full_name)}</H1>
      </View>
      {/* The Parent Guide, one quiet card; the PDF ships with the app under /manual. */}
      <Card style={s.slim}>
        <Label>Parent Guide</Label>
        <Body style={{ color: colors.muted }}>How ordering, uploading, Film Rooms and ratings work. Searchable PDF.</Body>
        <View style={s.row}>
          <Button title="Open the guide" variant="ghost" small onPress={openParentGuide} />
        </View>
      </Card>
      {/* The parent explainer, set from admin Settings; nothing renders until Alex drops a video in. */}
      <ExplainerVideo playbackId={settings?.rules.explainer_parent_playback_id} title="How FLP works" label="Watch how it works" />
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
      {/* First Line Presents is an extra, kept below and quieter than the mentoring cards, and follows the admin switch. */}
      {presentsRules(settings?.rules).enabled ? (
      <Card style={s.slim}>
        <Label>First Line Presents</Label>
        <Body style={{ color: colors.muted }}>A personal video message from an FLP athlete for a birthday, a big game or a comeback.</Body>
        <View style={s.row}>
          <Link href="/presents" asChild>
            <Button title="Browse athletes" variant="ghost" small />
          </Link>
          <Link href="/presents/mine" asChild>
            <Button title="My videos" variant="ghost" small />
          </Link>
        </View>
      </Card>
      ) : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.lg },
  cell: { flexGrow: 1, flexBasis: 320 },
  slim: { gap: space.sm, paddingVertical: space.lg },
  row: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
});
