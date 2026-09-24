import { Link } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";
import { Body, H3, Small } from "./ui/Text";
import { ago, HEADLINE, isStale, type Check, type Run, type Status } from "@/lib/health";
import { colors, fonts, radius, space } from "@/theme/tokens";

export const TONE: Record<Status, { fg: string; bg: string; glyph: string }> = {
  healthy: { fg: colors.ok, bg: colors.okSoft, glyph: "✓" },
  attention: { fg: colors.warn, bg: colors.warnSoft, glyph: "!" },
  unhealthy: { fg: colors.danger, bg: colors.dangerSoft, glyph: "✕" },
  off: { fg: colors.faint, bg: colors.panel2, glyph: "–" },
};

// The meter: a status disc, a headline, one dot per service, and the last hour of context.
export function HealthMeter({ run, onCheck, busy, showDetails = true }: { run: Run | null | undefined; onCheck?: () => void; busy?: boolean; showDetails?: boolean }) {
  const stale = run !== undefined && isStale(run);
  const state: Status | "none" | "stale" = run === undefined ? "none" : !run ? "none" : stale ? "stale" : run.overall;
  const tone = state === "none" ? TONE.off : state === "stale" ? TONE.unhealthy : TONE[state];
  const headline = run === undefined ? "Loading…" : HEADLINE[state];
  const checks: Check[] = run?.results ?? [];
  const counts = checks.reduce((m, c) => ({ ...m, [c.status]: (m[c.status] ?? 0) + 1 }), {} as Partial<Record<Status, number>>);
  const sub = !run ? "The hourly check has not run yet." : `Checked ${ago(run.ran_at)}${run.trigger === "manual" ? " (manual)" : ""} · runs every hour${stale ? " · overdue, the job timer may be down" : ""}`;

  return (
    <Card style={StyleSheet.flatten([s.card, { borderColor: state === "healthy" ? colors.line : tone.fg }])}>
      <View style={s.row}>
        <View style={[s.disc, { borderColor: tone.fg, backgroundColor: tone.bg }]}>
          <Text style={[s.glyph, { color: tone.fg }]}>{tone.glyph}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 220, gap: 4 }}>
          <Small style={{ color: colors.faint }}>SERVICE HEALTH</Small>
          <H3 style={{ color: tone.fg }}>{headline}</H3>
          <Small>{sub}</Small>
          {checks.length ? (
            <Small>
              {counts.healthy ?? 0} healthy{counts.attention ? ` · ${counts.attention} need attention` : ""}{counts.unhealthy ? ` · ${counts.unhealthy} unhealthy` : ""}{counts.off ? ` · ${counts.off} not connected` : ""}
            </Small>
          ) : null}
        </View>
        <View style={s.actions}>
          {onCheck ? <Button title="Check now" variant="secondary" small loading={busy} onPress={onCheck} /> : null}
          {showDetails ? <Link href="/admin/health" asChild><Button title="Details" variant="ghost" small /></Link> : null}
        </View>
      </View>
      {checks.length ? (
        <View style={s.chips}>
          {checks.map((c) => (
            <View key={c.key} style={[s.chip, c.status === "unhealthy" && { borderColor: colors.danger }, c.status === "attention" && { borderColor: colors.warn }]}>
              <View style={[s.dot, { backgroundColor: TONE[c.status].fg }]} />
              <View style={{ flexShrink: 1 }}>
                <Body style={{ fontFamily: fonts.semibold, color: c.status === "off" ? colors.faint : colors.ink }}>{c.label}</Body>
                <Small numberOfLines={1}>{c.detail}{c.status !== "off" && c.latency_ms ? ` · ${c.latency_ms} ms` : ""}</Small>
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

// The Control Center badge: overall state, every service as a dot, and a link to the Health tab.
export function HealthBadge({ run }: { run: Run | null | undefined }) {
  const stale = run !== undefined && isStale(run);
  const state: Status | "none" | "stale" = run === undefined ? "none" : !run ? "none" : stale ? "stale" : run.overall;
  const tone = state === "none" ? TONE.off : state === "stale" ? TONE.unhealthy : TONE[state];
  const headline = run === undefined ? "Loading…" : HEADLINE[state];
  const checks: Check[] = run?.results ?? [];
  return (
    <Link href="/admin/health" asChild>
      <Card style={StyleSheet.flatten([b.card, { borderColor: state === "healthy" || state === "none" ? colors.line : tone.fg }])}>
        <View style={b.head}>
          <View style={[b.disc, { borderColor: tone.fg, backgroundColor: tone.bg }]}><Text style={[b.glyph, { color: tone.fg }]}>{tone.glyph}</Text></View>
          <Small style={{ color: colors.faint }}>SERVICE HEALTH</Small>
          <Body style={{ fontFamily: fonts.semibold, color: tone.fg }}>{headline}</Body>
          {run ? <Small>· checked {ago(run.ran_at)}</Small> : null}
          <View style={{ flex: 1 }} />
          <Button title="Open" variant="ghost" small />
        </View>
        {checks.length ? (
          <View style={b.list}>
            {checks.map((c) => (
              <View key={c.key} style={b.item}>
                <View style={[b.dot, { backgroundColor: TONE[c.status].fg }]} />
                <Small style={{ color: c.status === "off" ? colors.faint : colors.muted }}>{c.label}</Small>
              </View>
            ))}
          </View>
        ) : null}
      </Card>
    </Link>
  );
}

const b = StyleSheet.create({
  card: { gap: space.sm, paddingVertical: 12 },
  head: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.sm },
  disc: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  glyph: { fontFamily: fonts.display, fontSize: 15, lineHeight: 18 },
  list: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
  item: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});

const s = StyleSheet.create({
  card: { gap: space.md },
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.lg },
  disc: { width: 72, height: 72, borderRadius: 36, borderWidth: 3, alignItems: "center", justifyContent: "center" },
  glyph: { fontFamily: fonts.display, fontSize: 34, lineHeight: 40 },
  actions: { flexDirection: "row", gap: space.sm, alignItems: "center" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  chip: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: colors.line2, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 8, minWidth: 200, flexGrow: 1, flexBasis: 220 },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
