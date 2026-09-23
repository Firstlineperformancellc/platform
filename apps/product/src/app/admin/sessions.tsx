import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { StyleSheet, View } from "react-native";
import { AdminShell } from "@/components/AdminShell";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Choice } from "@/components/ui/Choice";
import { Pill } from "@/components/ui/Pill";
import { TextField } from "@/components/ui/TextField";
import { Body, H3, Small } from "@/components/ui/Text";
import { adminCancelSession, adminCompleteSession, adminNoShow } from "@/lib/admin";
import { FORMAT_LABEL, listSessions, minutesUntil, playerName, recordingLink, STATUS_LABEL, whenLabel, type Session } from "@/lib/sessions";
import { money } from "@/lib/settings";
import { openExternal } from "@/lib/open";
import { colors, space } from "@/theme/tokens";

// Every Film Room on the platform with the levers Alex and Bryan need: cancel with a refund,
// mark a no-show, close a session that never got closed, and open recordings for QCA.
export default function AdminSessions() {
  const [rows, setRows] = useState<Session[] | null>(null);
  const [filter, setFilter] = useState("attention");
  const [reason, setReason] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    listSessions().then(setRows).catch((e) => setError((e as Error).message));
  }, []);
  useFocusEffect(load);

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      load();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(null);
  }

  async function openRecording(id: string, recordingId?: string) {
    await run(recordingId ?? id, () => openExternal(async () => (await recordingLink(id, recordingId)).url));
  }

  const live = (r: Session) => ["requested", "scheduled", "in_progress"].includes(r.status);
  const shown = (rows ?? []).filter((r) => {
    const mins = minutesUntil(r.scheduled_at);
    if (filter === "attention") return (live(r) && mins < 0) || (r.status === "completed" && !r.recap) || r.status.startsWith("no_show");
    if (filter === "upcoming") return live(r) && mins >= 0;
    if (filter === "done") return ["completed"].includes(r.status);
    return true;
  });
  const tone = (st: string) => (st === "completed" ? "ok" : st === "scheduled" || st === "in_progress" ? "gold" : st === "requested" ? "warn" : st.startsWith("no_show") ? "danger" : "muted");

  return (
    <AdminShell title="Film Room sessions">
      <Choice
        label="Show"
        options={[{ key: "attention", label: "Needs attention" }, { key: "upcoming", label: "Upcoming" }, { key: "done", label: "Completed" }, { key: "all", label: "All" }]}
        value={filter}
        onChange={(v) => setFilter(v as string)}
      />
      {error ? <Body style={{ color: colors.danger }}>{error}</Body> : null}
      {rows === null ? <Body style={{ color: colors.muted }}>Loading…</Body> : shown.length === 0 ? <Body style={{ color: colors.muted }}>Nothing in this view.</Body> : null}
      {shown.map((r) => {
        const mins = minutesUntil(r.scheduled_at);
        const past = mins < 0;
        return (
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

            {live(r) ? (
              <View style={{ gap: space.sm }}>
                <TextField label="Reason (goes to the parent)" value={reason[r.id] ?? ""} onChangeText={(v) => setReason({ ...reason, [r.id]: v })} placeholder="e.g. Mentor had an emergency; full refund issued" />
                <View style={s.row}>
                  <Button title="Cancel + refund" variant="danger" small loading={busy === `c-${r.id}`} onPress={() => run(`c-${r.id}`, () => adminCancelSession(r.id, reason[r.id] ?? ""))} />
                  {past && r.status !== "requested" ? (
                    <>
                      <Button title="Mentor no-show" variant="secondary" small loading={busy === `nm-${r.id}`} onPress={() => run(`nm-${r.id}`, () => adminNoShow(r.id, "mentor"))} />
                      <Button title="Family no-show" variant="secondary" small loading={busy === `np-${r.id}`} onPress={() => run(`np-${r.id}`, () => adminNoShow(r.id, "parent"))} />
                      <Button title="Mark completed" small loading={busy === `d-${r.id}`} onPress={() => run(`d-${r.id}`, () => adminCompleteSession(r.id))} />
                    </>
                  ) : null}
                </View>
              </View>
            ) : null}

            <View style={s.row}>
              {r.recordings?.length && r.recording_status !== "deleted" ? (
                r.recordings.map((rec, i) => (
                  <Button
                    key={rec.id}
                    title={r.recordings.length > 1 ? `Recording ${i + 1}${rec.duration ? ` · ${Math.round(rec.duration / 60)} min` : ""}` : "Open recording"}
                    variant="secondary"
                    small
                    loading={busy === rec.id}
                    onPress={() => openRecording(r.id, rec.id)}
                  />
                ))
              ) : r.recording_status === "ready" ? (
                <Button title="Open recording" variant="secondary" small loading={busy === r.id} onPress={() => openRecording(r.id)} />
              ) : (
                <Small>Recording: {r.recording_status ?? "none"}</Small>
              )}
            </View>
          </Card>
        );
      })}
    </AdminShell>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.md, flexWrap: "wrap", justifyContent: "space-between" },
});
