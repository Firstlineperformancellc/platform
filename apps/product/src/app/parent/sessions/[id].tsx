import { useCallback, useState } from "react";
import { Link, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Brand } from "@/components/Brand";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { Screen } from "@/components/ui/Screen";
import { TextField } from "@/components/ui/TextField";
import { Body, H1, H3, Label, Small } from "@/components/ui/Text";
import { Loading, RequireRole } from "@/lib/auth";
import { cancelSession, FORMAT_LABEL, getSession, joinSession, minutesUntil, playerName, reportNoShow, reviewSession, STATUS_LABEL, whenLabel, type Session } from "@/lib/sessions";
import { money, useSettings } from "@/lib/settings";
import { openExternal } from "@/lib/open";
import { colors, space } from "@/theme/tokens";

const TONE: Record<string, "gold" | "ok" | "warn" | "danger" | "muted"> = {
  requested: "warn", scheduled: "gold", in_progress: "ok", completed: "ok", cancelled: "muted", declined: "muted", expired: "muted", no_show_parent: "danger", no_show_mentor: "danger",
};

export default function ParentSession() {
  return (
    <RequireRole role="parent">
      <Inner />
    </RequireRole>
  );
}

function Inner() {
  const { id, paid } = useLocalSearchParams<{ id: string; paid?: string }>();
  const { settings } = useSettings();
  const [sess, setSess] = useState<Session | null | undefined>(undefined);
  const [rating, setRating] = useState(0);
  const [review, setReview] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (id) getSession(id).then(setSess);
  }, [id]);
  useFocusEffect(load);

  if (sess === undefined || !settings) return <Loading />;
  if (!sess)
    return (
      <Screen title="Film Room" width="form" center>
        <H1 center>Session not found</H1>
        <Link href="/parent/sessions" asChild>
          <Button title="Your sessions" variant="secondary" />
        </Link>
      </Screen>
    );

  const mins = minutesUntil(sess.scheduled_at);
  const live = ["scheduled", "in_progress"].includes(sess.status);
  const canJoin = live && mins <= 15 && mins >= -(sess.duration_minutes + settings.rules.session_grace_minutes + 30);
  const inWindow = mins < settings.rules.session_cancel_hours * 60;
  const canCancel = ["requested", "scheduled"].includes(sess.status) && mins > 0;
  const canNoShow = live && mins <= -10 && mins >= -(24 * 60);
  const mentor = sess.athletes?.display_name ?? "Your FLP Mentor";

  async function run(key: string, fn: () => Promise<unknown>, after?: string) {
    setBusy(key);
    setError(null);
    setMsg(null);
    try {
      await fn();
      if (after) setMsg(after);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(null);
  }

  async function join() {
    setBusy("join");
    setError(null);
    try {
      await openExternal(async () => {
        const r = await joinSession(sess!.id);
        if (!r.url) throw new Error(r.error ?? "The room isn't ready.");
        return r.url;
      });
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(null);
  }

  return (
    <Screen title="Film Room" width="content">
      <View style={s.topbar}>
        <Link href="/parent" asChild>
          <Brand size={44} />
        </Link>
        <Link href="/parent/sessions" asChild>
          <Button title="All sessions" variant="ghost" small />
        </Link>
      </View>
      <View>
        <Label>Film Room</Label>
        <H1>
          {playerName(sess)} with {mentor}
        </H1>
      </View>

      <Card>
        <View style={s.row}>
          <H3>{whenLabel(sess.scheduled_at)}</H3>
          <Pill tone={TONE[sess.status] ?? "muted"}>{STATUS_LABEL[sess.status]}</Pill>
        </View>
        <Body style={{ color: colors.muted }}>
          {FORMAT_LABEL[sess.format]} · {sess.pack_id ? "Season Arc credit" : money(sess.price_cents)} · {sess.parent_present ? "you're sitting in" : "youth athlete only"}
        </Body>
        {sess.parent_note ? <Body>{sess.parent_note}</Body> : null}
        {paid === "1" && sess.status === "requested" ? <Small style={{ color: colors.ok }}>Paid. {mentor} has {settings.rules.session_accept_hours ?? 24} hours to confirm.</Small> : null}
        {sess.status === "requested" ? <Small>Waiting on {mentor} to confirm{sess.accept_by ? ` (by ${whenLabel(sess.accept_by)})` : ""}. If they can't, you're refunded in full.</Small> : null}
        {sess.status === "scheduled" && !canJoin ? <Small>The join button appears here 15 minutes before the start. The session is recorded and kept for {settings.rules.recording_retention_days} days.</Small> : null}
        {sess.cancel_reason ? <Small>{sess.cancel_reason}</Small> : null}

        <View style={s.row}>
          {canJoin ? <Button title={sess.status === "in_progress" ? "Rejoin the room" : "Join the room"} loading={busy === "join"} onPress={join} /> : null}
          {canCancel ? (
            <Button
              title={inWindow && sess.status === "scheduled" && !sess.pack_id ? "Cancel (no refund inside the window)" : "Cancel (full refund)"}
              variant="ghost"
              small
              loading={busy === "cancel"}
              onPress={() => run("cancel", () => cancelSession(sess.id), "Cancelled.")}
            />
          ) : null}
          {canNoShow ? <Button title={`${mentor} didn't show`} variant="danger" small loading={busy === "noshow"} onPress={() => run("noshow", () => reportNoShow(sess.id), "Reported. You'll be refunded and FLP will follow up.")} /> : null}
        </View>
      </Card>

      {sess.status === "completed" ? (
        <Card>
          <H3>Recap</H3>
          {sess.recap ? (
            <View style={{ gap: space.sm }}>
              <View style={{ gap: 2 }}>
                <Label>Takeaways</Label>
                {sess.recap.takeaways.map((t, i) => (
                  <Body key={i}>· {t}</Body>
                ))}
              </View>
              {sess.recap.drills.length ? (
                <View style={{ gap: 2 }}>
                  <Label>Drills</Label>
                  {sess.recap.drills.map((t, i) => (
                    <Body key={i}>· {t}</Body>
                  ))}
                </View>
              ) : null}
              <View style={{ gap: 2 }}>
                <Label>Next step</Label>
                <Body>{sess.recap.next_step}</Body>
              </View>
            </View>
          ) : (
            <Body style={{ color: colors.muted }}>{mentor} writes the recap within {settings.rules.recap_due_hours} hours. It lands here and in the Development Log.</Body>
          )}

          <View style={s.divider} />
          {sess.rating ? (
            <View style={{ gap: space.xs }}>
              <Label>Your rating</Label>
              <Stars value={sess.rating} />
              {sess.review ? <Body style={{ color: colors.muted }}>{sess.review}</Body> : null}
              {sess.review_status === "pending_admin" ? <Small>FLP is reviewing this before it appears on the mentor's profile.</Small> : null}
            </View>
          ) : (
            <View style={{ gap: space.sm }}>
              <Label>Rate this session</Label>
              <Stars value={rating} onChange={setRating} />
              <TextField label="Testimonial (optional)" value={review} onChangeText={setReview} multiline style={s.multi} placeholder="What did your youth athlete get out of it?" />
              <Button
                title="Submit rating"
                small
                loading={busy === "review"}
                onPress={() => {
                  if (!rating) return setError("Pick a star rating.");
                  run("review", () => reviewSession(sess.id, rating, review), "Thanks for the rating.");
                }}
              />
            </View>
          )}
        </Card>
      ) : null}

      {msg ? <Body style={{ color: colors.ok }}>{msg}</Body> : null}
      {error ? <Body style={{ color: colors.danger }}>{error}</Body> : null}
    </Screen>
  );
}

function Stars({ value, onChange }: { value: number; onChange?: (n: number) => void }) {
  return (
    <View style={{ flexDirection: "row", gap: 4 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable key={n} disabled={!onChange} onPress={() => onChange?.(n)} accessibilityRole="button" accessibilityLabel={`${n} stars`}>
          <Text style={{ fontSize: 26, color: n <= value ? colors.gold : colors.faint }}>{n <= value ? "★" : "☆"}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, flexWrap: "wrap" },
  divider: { height: 1, backgroundColor: colors.line },
  multi: { minHeight: 72, textAlignVertical: "top" },
});
