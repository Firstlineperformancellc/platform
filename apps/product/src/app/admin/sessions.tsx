import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { Platform, StyleSheet, View } from "react-native";
import { AdminShell } from "@/components/AdminShell";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { Body, H3, Small } from "@/components/ui/Text";
import { FORMAT_LABEL, listSessions, playerName, recordingLink, STATUS_LABEL, whenLabel, type Session } from "@/lib/sessions";
import { money } from "@/lib/settings";
import { colors, space } from "@/theme/tokens";

// Every Film Room on the platform, newest first, with the recording link for QCA.
export default function AdminSessions() {
  const [rows, setRows] = useState<Session[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      listSessions().then(setRows).catch((e) => setError((e as Error).message));
    }, []),
  );

  async function openRecording(id: string) {
    setBusy(id);
    setError(null);
    try {
      const r = await recordingLink(id);
      if (Platform.OS === "web") window.open(r.url, "_blank", "noopener");
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(null);
  }

  const tone = (st: string) => (st === "completed" ? "ok" : st === "scheduled" || st === "in_progress" ? "gold" : st === "requested" ? "warn" : st.startsWith("no_show") ? "danger" : "muted");

  return (
    <AdminShell title="Film Room sessions">
      {rows === null ? <Body style={{ color: colors.muted }}>Loading…</Body> : rows.length === 0 ? <Body style={{ color: colors.muted }}>No sessions yet.</Body> : null}
      {(rows ?? []).map((r) => (
        <Card key={r.id}>
          <View style={s.row}>
            <H3>
              {playerName(r)} with {r.athletes?.display_name ?? "mentor"}
            </H3>
            <Pill tone={tone(r.status)}>{STATUS_LABEL[r.status]}</Pill>
          </View>
          <Small>
            {whenLabel(r.scheduled_at)} · {FORMAT_LABEL[r.format]} · {r.pack_id ? "Season Arc credit" : money(r.price_cents)} · mentor share {money(r.mentor_share_cents ?? 0)}
            {r.rating ? ` · ${"★".repeat(r.rating)}${r.review_status === "pending_admin" ? " (moderate)" : ""}` : ""}
          </Small>
          {r.parent_note ? <Body style={{ color: colors.muted }}>{r.parent_note}</Body> : null}
          {r.recap ? <Small>Recap: {r.recap.takeaways.join(" · ")} → {r.recap.next_step}</Small> : r.status === "completed" ? <Small style={{ color: colors.warn }}>Recap not filed yet.</Small> : null}
          {r.cancel_reason ? <Small>{r.cancel_reason}</Small> : null}
          <View style={s.row}>
            {r.recording_status === "ready" ? <Button title="Open recording" variant="secondary" small loading={busy === r.id} onPress={() => openRecording(r.id)} /> : <Small>Recording: {r.recording_status ?? "none"}</Small>}
          </View>
        </Card>
      ))}
      {error ? <Body style={{ color: colors.danger }}>{error}</Body> : null}
    </AdminShell>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.md, flexWrap: "wrap", justifyContent: "space-between" },
});
