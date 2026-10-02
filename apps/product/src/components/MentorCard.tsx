import { Pressable, StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { avatarUrl } from "@/lib/mentorProfile";
import { Card } from "./ui/Card";
import { Pill } from "./ui/Pill";
import { Body, H3, Small } from "./ui/Text";
import { turnaroundLabel, type MarketplaceMentor } from "@/lib/mentors";
import { levelLabel, marketOptions, money, TIER_LABEL, type Settings } from "@/lib/settings";
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
  const o = marketOptions(settings);
  const priceHidden = m.price_visible === false;
  const inner = (
    <Card style={[s.card, selected === "first" && s.first, selected === "second" && s.second]}>
      <View style={s.head}>
        {m.photo_path ? <Image source={{ uri: avatarUrl(m.photo_path)! }} style={s.avatar} contentFit="cover" /> : <View style={[s.avatar, s.avatarEmpty]} />}
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <H3>{m.display_name}</H3>
            {m.featured ? <Pill tone="gold">Featured</Pill> : null}
          </View>
          <Small>
            {[m.tier_name ?? TIER_LABEL[m.tier], levelLabel(settings, m.highest_level)].filter((x, i, all) => x && all.findIndex((y) => y.toLowerCase() === x.toLowerCase()) === i).join(" · ")}
            {m.current_team ? ` · ${m.current_team}` : ""}
          </Small>
        </View>
        <View style={{ alignItems: "flex-end", gap: 6 }}>
          {!o.show_price ? null : priceHidden || price == null ? (
            <Small style={{ color: colors.gold, textAlign: "right" }}>Please contact{"\n"}for pricing</Small>
          ) : (
            <Body style={{ color: colors.gold, fontFamily: "Barlow_600SemiBold" }}>{money(price)}</Body>
          )}
          {!o.show_availability ? null : m.available ? <Pill tone="ok">Available</Pill> : <Pill tone="warn">Waitlist</Pill>}
        </View>
      </View>
      {!compact && o.show_bio ? <Body style={{ color: colors.muted }} numberOfLines={3}>{m.bio}</Body> : null}
      <View style={s.meta}>
        {o.show_turnaround ? <Small>{turnaroundLabel(m.avg_turnaround_hours)}</Small> : null}
        {o.show_rating ? (
          <Small>
            {m.rating_count > 0 ? `★ ${m.avg_rating?.toFixed(1)} (${m.rating_count})` : "No ratings yet"}
          </Small>
        ) : null}
        {o.show_positions ? <Small>{m.positions.map((p) => p[0].toUpperCase() + p.slice(1)).join(" · ")}</Small> : null}
        {(o.show_badges ? m.badges : []).map((b) => (
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
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.panel2 },
  avatarEmpty: { borderWidth: 1, borderColor: colors.line2 },
  head: { flexDirection: "row", gap: space.md, alignItems: "flex-start" },
  meta: { flexDirection: "row", flexWrap: "wrap", gap: space.md, alignItems: "center" },
  first: { borderColor: colors.gold, borderWidth: 2 },
  second: { borderColor: colors.goldDim, borderWidth: 2, borderStyle: "dashed" },
  hover: { borderRadius: radius.lg, opacity: 0.95 },
});
