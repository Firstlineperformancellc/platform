import { StyleSheet, Text, View } from "react-native";
import { colors, fonts, radius, space } from "@/theme/tokens";

type Tone = "gold" | "ok" | "warn" | "danger" | "muted";

const tones: Record<Tone, { bg: string; fg: string }> = {
  gold: { bg: colors.goldSoft, fg: colors.gold },
  ok: { bg: colors.okSoft, fg: colors.ok },
  warn: { bg: colors.warnSoft, fg: colors.warn },
  danger: { bg: colors.dangerSoft, fg: colors.danger },
  muted: { bg: colors.panel2, fg: colors.muted },
};

export function Pill({ children, tone = "gold" }: { children: string; tone?: Tone }) {
  const t = tones[tone];
  return (
    <View style={[s.pill, { backgroundColor: t.bg }]}>
      <Text style={[s.text, { color: t.fg }]}>{children}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  pill: {
    alignSelf: "flex-start",
    paddingHorizontal: space.md,
    height: 24,
    borderRadius: radius.pill,
    justifyContent: "center",
  },
  text: { fontFamily: fonts.semibold, fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase" },
});
