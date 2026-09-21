import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { Platform, StyleSheet, View } from "react-native";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";
import { Pill } from "./ui/Pill";
import { TextField } from "./ui/TextField";
import { Body, H2, H3, Label, Small } from "./ui/Text";
import { acceptSession, cancelSession, completeSession, declineSession, FORMAT_LABEL, joinSession, listSessions, minutesUntil, playerName, reportNoShow, submitRecap, whenLabel, type Session } from "@/lib/sessions";
import { money, useSettings } from "@/lib/settings";
import { colors, space } from "@/theme/tokens";

// The mentor's side of Film Room: confirm requests, join, close out, write the recap.
export function MentorSessions() {
  const { settings } = useSettings();
  const [rows, setRows] = useState<Session[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recapFor, setRecapFor] = useState<string | null>(null);
  const [take, setTake] = useState(["", "", ""]);
  const [drills, setDrills] = useState(["", ""]);
  const [next, setNext] = useState("");

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

  async function join(id: string) {
    setBusy(`join-${id}`);
    setError(null);
    try {
      const r = await joinSession(id);
      if (r.url && Platform.OS === "web") window.open(r.url, "_blank", "noopener");
      else setError(r.error ?? "The room isn't ready.");
      load();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(null);
  }

  async function sendRecap(id: string) {
    await submitRecap(id, { takeaways: take.filter((t) => t.trim()), drills: drills.filter((t) => t.trim()), next_step: next });
    setRecapFor(null);
    setTake(["", "", ""]);
    setDrills(["", ""]);
    setNext("");
  }

  const requested = rows.filter((r) => r.status === "requested");
  const upcoming = rows.filter((r) => ["scheduled", "in_progress"].includes(r.status)).sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  const needRecap = rows.filter((r) => r.status === "completed" && !r.recap);
  const done = rows.filter((r) => r.status === "completed" && r.recap);
  if (rows.length === 0) return null;

  const head = (r: Session) => `${playerName(r)}${r.players ? ` · ${r.players.age_group} ${r.players.position}` : ""}`;

  return (
    <>
      <View>
        <H2>Film Room</H2>
        {requested.length === 0 && upcoming.length === 0 && needRecap.length === 0 ? <Body style={{ color: colors.muted }}>Nothing on the calendar.</Body> : null}
      </View>
      {requested.map((r) => (
        <Card key={r.id}>
          <View style={s.row}>
            <H3>{head(r)}</H3>
            <Pill tone="warn">Confirm</Pill>
          </View>
          <Body>
            {whenLabel(r.scheduled_at)} · {FORMAT_LABEL[r.format]} · {r.parent_present ? "parent sitting in" : "youth athlete only"}
          </Body>
          {r.parent_note ? <Body style={{ color: colors.muted }}>{r.parent_note}</Body> : null}
          <Small>
            You earn {money(r.mentor_share_cents ?? 0)}.{r.accept_by ? ` Respond by ${whenLabel(r.accept_by)}.` : ""}
          </Small>
          <View style={s.row}>
            <Button title="Confirm" small loading={busy === `a-${r.id}`} onPress={() => run(`a-${r.id}`, () => acceptSession(r.id))} />
            <Button title="Can't make it" variant="ghost" small disabled={busy === `a-${r.id}`} onPress={() => run(`d-${r.id}`, () => declineSession(r.id))} />
          </View>
        </Card>
      ))}
      {upcoming.map((r) => {
        const mins = minutesUntil(r.scheduled_at);
        const canJoin = mins <= 15 && mins >= -(r.duration_minutes + (settings?.rules.session_grace_minutes ?? 10) + 30);
        return (
          <Card key={r.id}>
            <View style={s.row}>
              <H3>{head(r)}</H3>
              <Pill tone={r.status === "in_progress" ? "ok" : "gold"}>{r.status === "in_progress" ? "Live" : mins < 60 ? `${Math.max(mins, 0)} min` : whenLabel(r.scheduled_at)}</Pill>
            </View>
            <Body>
              {whenLabel(r.scheduled_at)} · {FORMAT_LABEL[r.format]} · {r.parent_present ? "parent sitting in" : "youth athlete only"}
            </Body>
            {r.parent_note ? <Body style={{ color: colors.muted }}>{r.parent_note}</Body> : null}
            <Small>Recording starts when you join and can't be turned off. Cancelling inside {settings?.rules.session_cancel_hours ?? 24} hours counts against your scorecard.</Small>
            <View style={s.row}>
              {canJoin ? <Button title={r.status === "in_progress" ? "Rejoin" : "Start the room"} small loading={busy === `join-${r.id}`} onPress={() => join(r.id)} /> : null}
              {r.status === "in_progress" || mins < -10 ? <Button title="Finish session" variant="secondary" small loading={busy === `c-${r.id}`} onPress={() => run(`c-${r.id}`, () => completeSession(r.id))} /> : null}
              {mins <= -10 ? <Button title="Family didn't show" variant="ghost" small loading={busy === `n-${r.id}`} onPress={() => run(`n-${r.id}`, () => reportNoShow(r.id))} /> : null}
              {mins > 0 ? <Button title="Cancel" variant="ghost" small loading={busy === `x-${r.id}`} onPress={() => run(`x-${r.id}`, () => cancelSession(r.id))} /> : null}
            </View>
          </Card>
        );
      })}
      {needRecap.map((r) => (
        <Card key={r.id}>
          <View style={s.row}>
            <H3>{head(r)}</H3>
            <Pill tone="danger">Recap due</Pill>
          </View>
          <Small>
            {whenLabel(r.scheduled_at)} · {FORMAT_LABEL[r.format]}
            {r.recap_due_at ? ` · due ${whenLabel(r.recap_due_at)}` : ""}
          </Small>
          {recapFor === r.id ? (
            <View style={{ gap: space.sm }}>
              <Label>Three takeaways</Label>
              {take.map((t, i) => (
                <TextField key={i} label={`Takeaway ${i + 1}`} value={t} onChangeText={(v) => setTake(take.map((x, j) => (j === i ? v : x)))} />
              ))}
              {drills.map((t, i) => (
                <TextField key={i} label={`Drill ${i + 1} (optional)`} value={t} onChangeText={(v) => setDrills(drills.map((x, j) => (j === i ? v : x)))} />
              ))}
              <TextField label="One next step" value={next} onChangeText={setNext} />
              <View style={s.row}>
                <Button title="Send the recap" small loading={busy === `r-${r.id}`} onPress={() => run(`r-${r.id}`, () => sendRecap(r.id))} />
                <Button title="Later" variant="ghost" small onPress={() => setRecapFor(null)} />
              </View>
            </View>
          ) : (
            <Button title="Write the recap" small onPress={() => setRecapFor(r.id)} />
          )}
        </Card>
      ))}
      {done.length > 0 ? (
        <View>
          {done.slice(0, 8).map((r) => (
            <Small key={r.id} style={{ color: colors.muted }}>
              {head(r)} · {whenLabel(r.scheduled_at)} · recap sent{r.rating ? ` · ${"★".repeat(r.rating)}` : ""}
            </Small>
          ))}
        </View>
      ) : null}
      {error ? <Body style={{ color: colors.danger }}>{error}</Body> : null}
    </>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.md, flexWrap: "wrap" },
});
