import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { StyleSheet, View } from "react-native";
import { AdminShell } from "@/components/AdminShell";
import { HealthMeter, TONE } from "@/components/HealthMeter";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { Body, H3, Small } from "@/components/ui/Text";
import { ago, latestRun, recentRuns, runNow, type Run } from "@/lib/health";
import { colors, space } from "@/theme/tokens";

const LABEL = { healthy: "Healthy", attention: "Needs attention", unhealthy: "Unhealthy", off: "Not connected" } as const;
const PILL = { healthy: "ok", attention: "warn", unhealthy: "danger", off: "muted" } as const;

// Everything the meter knows: each service with its last answer, and the last two days of runs.
export default function ServiceHealth() {
  const [run, setRun] = useState<Run | null | undefined>(undefined);
  const [history, setHistory] = useState<Run[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => { latestRun().then(setRun).catch((e) => setError((e as Error).message)); recentRuns(48).then(setHistory); }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function check() {
    setBusy(true); setError(null);
    try { const r = await runNow(); setRun(r.run); recentRuns(48).then(setHistory); } catch (e) { setError((e as Error).message); }
    setBusy(false);
  }

  return (
    <AdminShell title="Service health">
      <HealthMeter run={run} onCheck={check} busy={busy} showDetails={false} />
      {error ? <Body style={{ color: colors.danger }}>{error}</Body> : null}
      <Card>
        <H3>Each service</H3>
        {(run?.results ?? []).map((c) => (
          <View key={c.key} style={s.line}>
            <View style={[s.dot, { backgroundColor: TONE[c.status].fg }]} />
            <View style={{ flex: 1, minWidth: 160 }}>
              <Body>{c.label}</Body>
              <Small>{c.detail}</Small>
            </View>
            <Small>{c.status !== "off" ? `${c.latency_ms} ms` : ""}</Small>
            <Pill tone={PILL[c.status]}>{LABEL[c.status]}</Pill>
          </View>
        ))}
        {run === null ? <Body style={{ color: colors.muted }}>No run yet. Press Check now, or wait for the hourly one.</Body> : null}
      </Card>
      <Card>
        <H3>Last {history.length || 48} checks</H3>
        <View style={s.strip}>
          {history.map((r) => (
            <View key={r.id} style={[s.tick, { backgroundColor: TONE[r.overall].fg }]} />
          ))}
        </View>
        {history.length ? <Small>{ago(history[0].ran_at)} → {ago(history[history.length - 1].ran_at)}. Green healthy, amber needs attention, red unhealthy.</Small> : <Small>Nothing yet.</Small>}
      </Card>
      <Card>
        <H3>How this works</H3>
        <Body style={{ color: colors.muted }}>Once an hour the API sends one small, read-only request to each connected service and records the answer. "Needs attention" means it answered but something about the setup is incomplete; "Unhealthy" means it did not answer or refused us. When a service turns unhealthy, and when it recovers, every admin gets an email. "Not connected" services are not counted.</Body>
      </Card>
    </AdminShell>
  );
}

const s = StyleSheet.create({
  line: { flexDirection: "row", alignItems: "center", gap: space.md, flexWrap: "wrap", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.line },
  dot: { width: 10, height: 10, borderRadius: 5 },
  strip: { flexDirection: "row", gap: 3, flexWrap: "wrap" },
  tick: { width: 10, height: 22, borderRadius: 2 },
});
