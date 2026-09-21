import { StyleSheet, View } from "react-native";
import { Body, H3, Label, Small } from "./ui/Text";
import type { Worksheet } from "@/lib/breakdowns";
import { colors, radius, space } from "@/theme/tokens";

// Read-only rendering of the Player Development Worksheet, for the parent's page and the mentor's review.
export function WorksheetView({ w }: { w: Worksheet }) {
  return (
    <View style={{ gap: space.lg }}>
      <View style={s.twoUp}>
        <View style={s.col}>
          <Label>Strengths</Label>
          {w.strengths.map((t, i) => (
            <Body key={i}>• {t}</Body>
          ))}
        </View>
        <View style={s.col}>
          <Label>Areas to improve</Label>
          {w.improvements.map((t, i) => (
            <Body key={i}>• {t}</Body>
          ))}
        </View>
      </View>
      <View>
        <Label>Game situations breakdown</Label>
        {w.clips.map((c, i) => (
          <View key={i} style={s.rowCard}>
            <View style={s.rowHead}>
              <H3>{c.time || `Clip ${i + 1}`}</H3>
              <Small>{c.situation}</Small>
            </View>
            {c.what_happened ? <Body><Body style={s.k}>What happened: </Body>{c.what_happened}</Body> : null}
            {c.improve ? <Body><Body style={s.k}>What to improve: </Body>{c.improve}</Body> : null}
            {c.takeaway ? <Body style={{ color: colors.gold }}>{c.takeaway}</Body> : null}
          </View>
        ))}
      </View>
      <View>
        <Label>Recommended workouts and drills</Label>
        {w.drills.map((d, i) => (
          <View key={i} style={s.rowCard}>
            <View style={s.rowHead}>
              <H3>{d.drill || `Drill ${i + 1}`}</H3>
              <Small>{[d.area, d.frequency].filter(Boolean).join(" · ")}</Small>
            </View>
            {d.description ? <Body>{d.description}</Body> : null}
            {d.notes ? <Small>{d.notes}</Small> : null}
          </View>
        ))}
      </View>
      <View>
        <Label>Next steps</Label>
        {w.next_steps.map((t, i) => (
          <Body key={i}>{i + 1}. {t}</Body>
        ))}
      </View>
      {w.notes ? (
        <View>
          <Label>Additional notes</Label>
          <Body style={{ color: colors.muted }}>{w.notes}</Body>
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  twoUp: { flexDirection: "row", flexWrap: "wrap", gap: space.lg },
  col: { flexGrow: 1, flexBasis: 260, gap: 4 },
  rowCard: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: space.md, gap: 4, marginTop: space.sm },
  rowHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: space.md, flexWrap: "wrap" },
  k: { color: colors.muted },
});
