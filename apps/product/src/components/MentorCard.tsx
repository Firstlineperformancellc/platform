import { Pressable, StyleSheet, View } from "react-native";
import { Card } from "./ui/Card";
import { Pill } from "./ui/Pill";
import { Body, H3, Small } from "./ui/Text";
import { turnaroundLabel, type MarketplaceMentor } from "@/lib/mentors";
import { levelLabel, money, TIER_LABEL, type Settings } from "@/lib/settings";
import { colors, radius, space } from "@/theme/tokens";

type Props = {
  mentor: MarketplaceMentor;
  settings: Settings;
  selected?: "first" | "second" | null;
  onPress?: () => void;
  compact?: boolean;
};

export function MentorCard({ mentor: m, settings, selected, onPress, compact }: Props) {
  const price = settings.breakdown_prices[m.tier];
  const inner = (
    <Card style={[s.card, selected === "first" && s.first, selected === "second" && s.second]}>
      <View style={s.head}>
        <View style={{ flex: 1, gap: 2 }}>
          <H3>{m.display_name}</H3>
          <Small>
            {TIER_LABEL[m.tier]} · {levelLabel(settings, m.highest_level)}
            {m.current_team ? ` · ${m.current_team}` : ""}
          </Small>
        </View>
        <View style={{ alignItems: "flex-end", gap: 6 }}>
          <Body style={{ color: colors.gold, fontFamily: "Barlow_600SemiBold" }}>{money(price)}</Body>
          {m.available ? <Pill tone="ok">Available</Pill> : <Pill tone="warn">Waitlist</Pill>}
        </View>
      </View>
      {!compact ? <Body style={{ color: colors.muted }} numberOfLines={3}>{m.bio}</Body> : null}
      <View style={s.meta}>
        <Small>{turnaroundLabel(m.avg_turnaround_hours)}</Small>
        <Small>
          {m.rating_count > 0 ? `★ ${m.avg_rating?.toFixed(1)} (${m.rating_count})` : "No ratings yet"}
        </Small>
        <Small>{m.positions.map((p) => p[0].toUpperCase() + p.slice(1)).join(" · ")}</Small>
        {m.badges.map((b) => (
          <Pill key={b} tone="gold">
            {settings.taxonomy.badges.find((x) => x.key === b)?.label ?? b}
          </Pill>
        ))}
      </View>
      {selected ? <Pill tone="gold">{selected === "first" ? "First choice" : "Second choice"}</Pill> : null}
    </Card>
  );
  return onPress ? (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ hovered }: { hovered?: boolean }) => [hovered && s.hover]}>
      {inner}
    </Pressable>
  ) : (
    inner
  );
}

const s = StyleSheet.create({
  card: { gap: space.sm },
  head: { flexDirection: "row", gap: space.md, alignItems: "flex-start" },
  meta: { flexDirection: "row", flexWrap: "wrap", gap: space.md, alignItems: "center" },
  first: { borderColor: colors.gold, borderWidth: 2 },
  second: { borderColor: colors.goldDim, borderWidth: 2, borderStyle: "dashed" },
  hover: { borderRadius: radius.lg, opacity: 0.95 },
});
