import { useEffect, useState } from "react";
import { Link, useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";
import { Brand } from "@/components/Brand";
import { MentorCard } from "@/components/MentorCard";
import { Button } from "@/components/ui/Button";
import { Choice } from "@/components/ui/Choice";
import { Screen } from "@/components/ui/Screen";
import { Body, H1, Label } from "@/components/ui/Text";
import { Loading, useAuth } from "@/lib/auth";
import { listMentors, type MarketplaceMentor } from "@/lib/mentors";
import { useSettings } from "@/lib/settings";
import type { HockeyPosition } from "@/lib/types";
import { colors, space } from "@/theme/tokens";

// The public mentor marketplace. Anyone can browse; ordering needs a parent account.
export default function Marketplace() {
  const router = useRouter();
  const { session } = useAuth();
  const { settings } = useSettings();
  const [position, setPosition] = useState<HockeyPosition | null>(null);
  const [mentors, setMentors] = useState<MarketplaceMentor[] | null>(null);

  useEffect(() => {
    listMentors(position ?? undefined).then(setMentors);
  }, [position]);

  return (
    <Screen title="FLP Mentors" width="page">
      <View style={s.topbar}>
        <Link href="/" asChild>
          <Brand size={44} />
        </Link>
        {session ? (
          <Link href="/parent" asChild>
            <Button title="Dashboard" variant="ghost" small />
          </Link>
        ) : (
          <Link href="/sign-in" asChild>
            <Button title="Sign in" variant="ghost" small />
          </Link>
        )}
      </View>
      <View>
        <Label>FLP Mentors</Label>
        <H1>Pick the athlete who's already done it</H1>
        <Body style={{ color: colors.muted }}>
          Every FLP Mentor played at the level your youth athlete is chasing. Choose one, upload the film, and get a
          recorded breakdown and development worksheet back within 72 hours of acceptance.
        </Body>
      </View>
      {settings ? (
        <Choice
          label="Position"
          options={[{ key: "", label: "All" }, ...settings.taxonomy.positions]}
          value={position ?? ""}
          onChange={(v) => setPosition((v as string) ? (v as HockeyPosition) : null)}
        />
      ) : null}
      {!mentors || !settings ? (
        <Loading />
      ) : mentors.length === 0 ? (
        <Body style={{ color: colors.muted }}>No mentors listed yet for that position.</Body>
      ) : (
        <View style={s.grid}>
          {mentors.map((m) => (
            <View key={m.user_id} style={s.cell}>
              <MentorCard mentor={m} settings={settings} onPress={() => router.push({ pathname: "/mentors/[slug]", params: { slug: m.slug } })} />
            </View>
          ))}
        </View>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.lg },
  cell: { flexGrow: 1, flexBasis: 340, maxWidth: 520 },
});
