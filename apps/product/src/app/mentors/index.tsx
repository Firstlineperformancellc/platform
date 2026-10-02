import { useEffect, useState } from "react";
import { Link, useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";
import { Brand } from "@/components/Brand";
import { MentorCard } from "@/components/MentorCard";
import { Button } from "@/components/ui/Button";
import { Choice } from "@/components/ui/Choice";
import { Screen } from "@/components/ui/Screen";
import { Body, H1, H3, Label, Small } from "@/components/ui/Text";
import { Loading, useAuth } from "@/lib/auth";
import { listMentors, sortMentors, type MarketplaceMentor } from "@/lib/mentors";
import { marketOptions, useSettings } from "@/lib/settings";
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
        groups(sortMentors(mentors, marketOptions(settings)), marketOptions(settings).group_by_tier).map((g) => (
          <View key={g.key} style={{ gap: space.sm }}>
            {g.title ? (
              <View>
                <H3>{g.title}</H3>
                {g.description ? <Small>{g.description}</Small> : null}
              </View>
            ) : null}
            <View style={s.grid}>
              {g.mentors.map((m) => (
                <View key={m.user_id} style={s.cell}>
                  <MentorCard mentor={m} settings={settings} onPress={() => router.push({ pathname: "/mentors/[slug]", params: { slug: m.slug } })} />
                </View>
              ))}
            </View>
          </View>
        ))
      )}
    </Screen>
  );
}

// One group for the whole list, or one per level in hierarchy order.
function groups(list: MarketplaceMentor[], byLevel: boolean): { key: string; title: string | null; description: string | null; mentors: MarketplaceMentor[] }[] {
  if (!byLevel) return [{ key: "all", title: null, description: null, mentors: list }];
  const out: { key: string; title: string | null; description: string | null; mentors: MarketplaceMentor[]; sort: number }[] = [];
  for (const m of list) {
    let g = out.find((x) => x.key === m.tier);
    if (!g) { g = { key: m.tier, title: m.tier_name ?? m.tier, description: m.tier_description || null, mentors: [], sort: m.tier_sort ?? 999 }; out.push(g); }
    g.mentors.push(m);
  }
  return out.sort((a, b) => a.sort - b.sort);
}

const s = StyleSheet.create({
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.lg },
  cell: { flexGrow: 1, flexBasis: 340, maxWidth: 520 },
});
