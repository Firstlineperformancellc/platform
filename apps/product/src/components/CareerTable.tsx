import { ScrollView, StyleSheet, View } from "react-native";
import { Body, Small } from "@/components/ui/Text";
import { fmtGaa, fmtSv, type CareerRow } from "@/lib/career";
import { colors, space } from "@/theme/tokens";

// Read-only career table, used on the public profile. Columns follow the mentor's positions.
export function CareerTable({ rows, goalie, skater }: { rows: CareerRow[]; goalie: boolean; skater: boolean }) {
  const cols: { key: string; label: string; w: number; get: (r: CareerRow) => string; right?: boolean }[] = [
    { key: "season", label: "Season", w: 78, get: (r) => r.season },
    { key: "team", label: "Team", w: 180, get: (r) => r.team },
    { key: "league", label: "League", w: 90, get: (r) => r.league ?? "" },
    { key: "games", label: "GP", w: 44, get: (r) => (r.games == null ? "" : String(r.games)), right: true },
  ];
  if (skater) cols.push(
    { key: "goals", label: "G", w: 40, get: (r) => (r.goals == null ? "" : String(r.goals)), right: true },
    { key: "assists", label: "A", w: 40, get: (r) => (r.assists == null ? "" : String(r.assists)), right: true },
    { key: "points", label: "P", w: 44, get: (r) => (r.points == null ? "" : String(r.points)), right: true },
    { key: "pim", label: "PIM", w: 48, get: (r) => (r.pim == null ? "" : String(r.pim)), right: true },
  );
  if (goalie) cols.push(
    { key: "gaa", label: "GAA", w: 56, get: (r) => fmtGaa(r.gaa), right: true },
    { key: "sv", label: "SV%", w: 56, get: (r) => fmtSv(r.sv_pct), right: true },
  );
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View>
        <View style={[s.row, s.head]}>
          {cols.map((c) => (
            <Small key={c.key} style={[{ width: c.w }, c.right && s.right]}>{c.label}</Small>
          ))}
        </View>
        {rows.map((r, i) => (
          <View key={i} style={s.row}>
            {cols.map((c) => (
              <Body key={c.key} style={[{ width: c.w }, c.right && s.right, c.key === "team" && s.team]} numberOfLines={1}>{c.get(r)}</Body>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: "row", gap: space.sm, paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.line, alignItems: "center" },
  head: { borderTopWidth: 0, paddingBottom: 2 },
  right: { textAlign: "right" },
  team: { fontWeight: "600" },
});
