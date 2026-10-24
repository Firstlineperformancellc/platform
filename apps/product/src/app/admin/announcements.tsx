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
import { BroadcastRepeat, listBroadcasts, previewBroadcast, sendBroadcast, type Broadcast, type BroadcastAudience, type BroadcastPreview } from "@/lib/admin";
import { Loading } from "@/lib/auth";
import { colors, radius, space } from "@/theme/tokens";

const AUDIENCES: { key: BroadcastAudience; label: string }[] = [
  { key: "everyone", label: "Everyone" },
  { key: "parents", label: "Parents" },
  { key: "mentors", label: "Mentors" },
  { key: "admins", label: "Admins" },
];
const LABEL: Record<BroadcastAudience, string> = { everyone: "everyone", parents: "parents", mentors: "mentors", admins: "admins", me: "yourself (test)" };
const SUBJECT_MAX = 120;
const BODY_MAX = 5000;
const people = (n: number) => `${n} ${n === 1 ? "person" : "people"}`;
const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const tone = (b: Broadcast) => (!b.finished_at ? "warn" : b.failed_count ? "danger" : "ok");
const tally = (b: Broadcast) => (!b.finished_at ? `${b.sent_count} of ${b.recipient_count} so far` : b.failed_count ? `${b.sent_count} sent · ${b.failed_count} failed` : `${b.sent_count} sent`);

// Announcements: one plain email to account holders for service notices ("the site will be down for
// updates on Sunday night"). Not marketing. Preview shows who it reaches, a test to yourself comes
// first, and a real send asks once more; the API asks again if the same message just went out.
export default function AdminAnnouncements() {
  const [audience, setAudience] = useState<BroadcastAudience>("everyone");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [preview, setPreview] = useState<BroadcastPreview | null>(null);
  const [step, setStep] = useState<"idle" | "confirm" | "repeat">("idle");
  const [repeatWhy, setRepeatWhy] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<Broadcast[] | null>(null);

  const load = useCallback(() => {
    listBroadcasts().then(setHistory).catch((e) => setError((e as Error).message));
  }, []);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // Any change to the audience or the message throws away the preview and the confirm step.
  function edit(fn: () => void) {
    fn();
    setPreview(null);
    setStep("idle");
  }
  const tooLong = subject.length > SUBJECT_MAX || body.length > BODY_MAX;
  const ready = subject.trim().length > 0 && body.trim().length > 0 && !tooLong;

  async function doPreview(): Promise<BroadcastPreview | null> {
    setBusy("preview");
    setError(null);
    try {
      const p = await previewBroadcast({ subject, body, audience });
      setPreview(p);
      return p;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function doSend(to: BroadcastAudience, confirmRepeat = false) {
    setBusy(to === "me" ? "me" : "send");
    setError(null);
    setMsg(null);
    try {
      const r = await sendBroadcast({ subject, body, audience: to, confirmRepeat });
      if (to === "me") {
        setMsg("Sent to you. Check your inbox, then send it for real.");
      } else if ("started" in r) {
        setMsg(`Sending to ${people(r.recipients)}. It carries on in the background; the list below fills in as it goes.`);
      } else {
        setMsg(`Sent to ${people(r.sent)}.${r.failed ? ` ${r.failed} failed: ${r.failures[0]?.error ?? "see the list below"}.` : ""}`);
      }
      if (to !== "me") {
        setSubject("");
        setBody("");
        setPreview(null);
      }
      setStep("idle");
      load();
    } catch (e) {
      if (e instanceof BroadcastRepeat) {
        setRepeatWhy(e.message);
        setStep("repeat");
      } else setError((e as Error).message);
    }
    setBusy(null);
  }

  // "Send" always goes through the count: preview first when there is none, then the inline question.
  async function askSend() {
    const p = preview ?? (await doPreview());
    if (!p) return;
    if (p.recipients === 0) {
      setError("Nobody matches that audience.");
      return;
    }
    setStep("confirm");
  }

  return (
    <AdminShell title="Announcements">
      <Small>
        One plain email to account holders for service notices: the site will be down for updates, something about how FLP Mentors works is changing, that kind of thing. Not for marketing. It goes out from no-reply with the FLP header, and every send is recorded below.
      </Small>

      <Card>
        <Choice label="Who gets it" options={AUDIENCES} value={audience} onChange={(v) => edit(() => setAudience(v as BroadcastAudience))} hint="Mentors means approved mentors. Deleted and suspended accounts are always left out." />
        <TextField label="Subject" value={subject} onChangeText={(v) => edit(() => setSubject(v))} hint={`${subject.length}/${SUBJECT_MAX}`} error={subject.length > SUBJECT_MAX ? `Keep the subject to ${SUBJECT_MAX} characters (${subject.length}).` : undefined} />
        <TextField
          label="Message"
          value={body}
          onChangeText={(v) => edit(() => setBody(v))}
          multiline
          style={s.multi}
          placeholder={"Plain text. Leave a blank line between paragraphs.\n\nIt ends with a line saying they got this because they have a First Line Performance account."}
          hint={`${body.length.toLocaleString("en-US")}/${BODY_MAX.toLocaleString("en-US")}`}
          error={body.length > BODY_MAX ? `Keep the message to ${BODY_MAX.toLocaleString("en-US")} characters (${body.length.toLocaleString("en-US")}).` : undefined}
        />
        <View style={s.row}>
          <Button title="Preview" variant="secondary" small loading={busy === "preview"} disabled={!ready || !!busy} onPress={doPreview} />
          {preview ? (
            <Body>
              Would go to {people(preview.recipients)}
              {preview.sample.length ? ` (${preview.sample.join(", ")}${preview.recipients > preview.sample.length ? ", …" : ""})` : ""}
            </Body>
          ) : null}
        </View>
        {step === "confirm" ? (
          <View style={s.ask}>
            <Body>Send to {people(preview?.recipients ?? 0)} as {LABEL[audience]}?</Body>
            <View style={s.row}>
              <Button title="Yes, send" small loading={busy === "send"} onPress={() => doSend(audience)} />
              <Button title="No" variant="ghost" small disabled={!!busy} onPress={() => setStep("idle")} />
            </View>
          </View>
        ) : step === "repeat" ? (
          <View style={s.ask}>
            <Body style={{ color: colors.warn }}>{repeatWhy}</Body>
            <View style={s.row}>
              <Button title="Yes, send it again" variant="danger" small loading={busy === "send"} onPress={() => doSend(audience, true)} />
              <Button title="No" variant="ghost" small disabled={!!busy} onPress={() => setStep("idle")} />
            </View>
          </View>
        ) : (
          <View style={s.row}>
            <Button title="Send to me first" variant="secondary" loading={busy === "me"} disabled={!ready || !!busy} onPress={() => doSend("me")} />
            <Button title="Send" loading={busy === "send"} disabled={!ready || !!busy} onPress={askSend} />
          </View>
        )}
        {msg ? <Body style={{ color: colors.ok }}>{msg}</Body> : null}
        {error ? <Body style={{ color: colors.danger }}>{error}</Body> : null}
      </Card>

      <H3>Sent</H3>
      {!history ? <Loading /> : history.length === 0 ? <Body style={{ color: colors.muted }}>Nothing sent yet.</Body> : null}
      {(history ?? []).map((b) => (
        <Card key={b.id} style={s.item}>
          <View style={s.head}>
            <View style={{ flex: 1, gap: 2 }}>
              <H3>{b.subject}</H3>
              <Small>
                {when(b.created_at)} · to {LABEL[b.audience]} · by {b.sender?.full_name || b.sender?.email || "?"}
              </Small>
            </View>
            <Pill tone={tone(b)}>{tally(b)}</Pill>
          </View>
          {b.failed_count ? (
            <Small style={{ color: colors.danger }}>
              Failed: {b.failures.slice(0, 5).map((f) => `${f.email} (${f.error})`).join("; ")}
              {b.failures.length > 5 ? ` and ${b.failed_count - 5} more` : ""}
            </Small>
          ) : null}
        </Card>
      ))}
    </AdminShell>
  );
}

const s = StyleSheet.create({
  multi: { minHeight: 180, paddingTop: space.md, textAlignVertical: "top" },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, flexWrap: "wrap" },
  ask: { gap: space.sm, padding: space.md, borderRadius: radius.md, backgroundColor: colors.panel2 },
  head: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: space.md, flexWrap: "wrap" },
  item: { gap: space.sm },
});
