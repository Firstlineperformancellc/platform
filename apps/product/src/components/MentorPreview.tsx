import { StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { Pill } from "./ui/Pill";
import { Body, Display, H3, Label, Small } from "./ui/Text";
import { avatarUrl } from "@/lib/mentorProfile";
import { priceOf, turnaroundLabel, type MarketplaceMentor } from "@/lib/mentors";
import { levelLabel, marketOptions, money, TIER_LABEL, type Settings } from "@/lib/settings";
import { colors, space } from "@/theme/tokens";

// The expanded tile: a large photo, then as much about the mentor as fits a phone-sized card. It
// follows the same marketplace display options as the tile (price, rating, bio and so on).
export function MentorPreview({ mentor: m, settings, photoHeight, hint }: { mentor: MarketplaceMentor; settings: Settings; photoHeight: number; hint?: string }) {
  const o = marketOptions(settings);
  const price = priceOf(m, settings, "breakdown");
  const tierName = m.tier_name ?? TIER_LABEL[m.tier];
  const level = levelLabel(settings, m.highest_level);
  const sub = [level && level.toLowerCase() !== tierName.toLowerCase() ? level : null, m.current_team].filter(Boolean).join(" · ");
  const uri = avatarUrl(m.photo_path);
  const initials = m.display_name.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const awards = (m.awards ?? []).filter(Boolean).slice(0, 3);
  return (
    <View>
      {uri ? (
        // The whole photo, never cropped (portrait headshots lose the face when cropped to a wide strip),
        // over a blurred, darkened copy of itself that fills the rest of the frame.
        <View style={[s.photo, { height: photoHeight }]}>
          <Image source={{ uri }} style={[StyleSheet.absoluteFill, s.backdrop]} contentFit="cover" blurRadius={28} />
          <View style={[StyleSheet.absoluteFill, s.shade]} />
          <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="contain" transition={120} />
        </View>
      ) : (
        <View style={[s.photo, s.photoEmpty, { height: photoHeight }]}>
          <Display style={{ color: colors.goldDim }}>{initials}</Display>
        </View>
      )}
      <View style={s.body}>
        <View style={s.head}>
          <View style={{ flex: 1, gap: 4 }}>
            <View style={s.nameRow}>
              <H3 style={s.name}>{m.display_name}</H3>
              {m.featured ? <Pill tone="gold">Featured</Pill> : null}
            </View>
            <Small>
              <Small style={[s.level, m.tier_color ? { color: m.tier_color } : null]}>{tierName}</Small>
              {sub ? ` · ${sub}` : ""}
            </Small>
          </View>
          <View style={{ alignItems: "flex-end", gap: 6 }}>
            {!o.show_price ? null : m.price_visible === false || price == null ? (
              <Small style={{ color: colors.gold, textAlign: "right" }}>Please contact{"\n"}for pricing</Small>
            ) : (
              <Body style={{ color: colors.gold, fontFamily: "Barlow_600SemiBold" }}>{money(price)}</Body>
            )}
            {!o.show_availability ? null : m.available ? <Pill tone="ok">Available</Pill> : <Pill tone="warn">Waitlist</Pill>}
          </View>
        </View>
        <View style={s.meta}>
          {o.show_turnaround ? <Small>{turnaroundLabel(m.avg_turnaround_hours)}</Small> : null}
          {o.show_rating ? <Small>{m.rating_count > 0 ? `★ ${m.avg_rating?.toFixed(1)} (${m.rating_count})` : "No ratings yet"}</Small> : null}
          {o.show_positions ? <Small>{m.positions.map((p) => p[0].toUpperCase() + p.slice(1)).join(" · ")}</Small> : null}
        </View>
        {o.show_badges && m.badges.length ? (
          <View style={s.meta}>
            {m.badges.map((b) => (
              <Pill key={b} tone="gold">{settings.taxonomy.badges.find((x) => x.key === b)?.label ?? b}</Pill>
            ))}
          </View>
        ) : null}
        {o.show_bio && m.bio?.trim() ? <Body style={{ color: colors.ink }} numberOfLines={6}>{m.bio}</Body> : null}
        {m.teaching_focus ? (
          <View style={s.section}>
            <Label>What I'm best at teaching</Label>
            <Small numberOfLines={3}>{m.teaching_focus}</Small>
          </View>
        ) : null}
        {m.who_i_help ? (
          <View style={s.section}>
            <Label>Who I want to help</Label>
            <Small numberOfLines={3}>{m.who_i_help}</Small>
          </View>
        ) : null}
        {awards.length ? (
          <View style={s.section}>
            <Label>Awards and honours</Label>
            {awards.map((a, i) => (
              <Small key={i} numberOfLines={1}>{a}</Small>
            ))}
          </View>
        ) : null}
        {hint ? <Small style={s.hint}>{hint}</Small> : null}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  photo: { width: "100%", backgroundColor: colors.panel2, overflow: "hidden" },
  backdrop: { transform: [{ scale: 1.2 }] },
  shade: { backgroundColor: "rgba(0,0,0,0.35)" },
  photoEmpty: { alignItems: "center", justifyContent: "center", borderBottomWidth: 1, borderBottomColor: colors.line2 },
  body: { padding: space.lg, gap: space.sm },
  head: { flexDirection: "row", gap: space.md, alignItems: "flex-start" },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  name: { fontSize: 22, lineHeight: 28 },
  level: { fontFamily: "Barlow_600SemiBold", color: colors.gold },
  meta: { flexDirection: "row", flexWrap: "wrap", gap: space.md, alignItems: "center" },
  section: { gap: 2, marginTop: space.xs },
  hint: { color: colors.gold, fontFamily: "Barlow_600SemiBold", marginTop: space.xs },
});
