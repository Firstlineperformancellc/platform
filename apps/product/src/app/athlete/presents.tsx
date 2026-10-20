import { useCallback, useState } from "react";
import { Link, useFocusEffect } from "expo-router";
import { StyleSheet, View } from "react-native";
import { Brand } from "@/components/Brand";
import { VideoUpload } from "@/components/VideoUpload";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { Screen } from "@/components/ui/Screen";
import { TextField } from "@/components/ui/TextField";
import { Body, H1, H2, H3, Label, Small } from "@/components/ui/Text";
import { Loading } from "@/lib/auth";
import { athleteRequests, attachVideo, declineRequest, getMyPresentsSettings, money, PRESENTS_NAME, sendVideo, STATUS_LABEL, type AthleteRequest, type PresentsSettings } from "@/lib/presents";
import { colors, radius, space } from "@/theme/tokens";

// The athlete's First Line Presents queue: what to record, what FLP is holding or checking, what went
// out, what closed. The API never sends the buyer's identity; the athlete sees the request, not the person.

const day = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) : "");
const daysLeft = (iso: string | null) => (iso ? Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000) : null);
const CLOSED: AthleteRequest["status"][] = ["declined", "expired", "refunded", "cancelled"];

export default function AthletePresents() {
  const [rows, setRows] = useState<AthleteRequest[] | null>(null);
  const [settings, setSettings] = useState<PresentsSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null); // outlives the card that produced it; the list reloads after each send or decline

  const load = useCallback(() => {
    athleteRequests().then(setRows).catch((e) => { setError((e as Error).message); setRows([]); });
    getMyPresentsSettings().then(setSettings).catch(() => setSettings(null));
  }, []);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!rows) return <Loading />;

  const toRecord = rows.filter((r) => r.status === "open");
  const held = rows.filter((r) => r.status === "flagged");
  const checking = rows.filter((r) => r.status === "in_review");
  const delivered = rows.filter((r) => r.status === "delivered");
  const closed = rows.filter((r) => CLOSED.includes(r.status));
  const live = Boolean(settings && settings.presents_enabled && !settings.presents_blocked_at && settings.presents_price_cents != null);

  return (
    <Screen title={PRESENTS_NAME} width="content">
      <View style={s.topbar}>
        <Link href="/athlete" asChild><Brand size={44} /></Link>
        <View style={s.topRight}>
          <Link href="/athlete" asChild><Button title="Dashboard" variant="ghost" small /></Link>
          <Link href="/athlete/profile" asChild><Button title="Presents settings" variant="ghost" small /></Link>
        </View>
      </View>
      <View>
        <Label>{PRESENTS_NAME}</Label>
        <H1>Your requests</H1>
        <Body style={{ color: colors.muted }}>Each one is a short personal video for one person. Record it your way, upload it here, and send.</Body>
      </View>
      {notice ? <Body style={{ color: colors.ok }}>{notice}</Body> : null}
      {error ? <Body style={{ color: colors.danger }}>{error}</Body> : null}

      <View>
        <H2>To record</H2>
        {toRecord.length === 0 ? (
          <Body style={{ color: colors.muted }}>
            {live ? "Nothing waiting on you. New requests land here, and you get an email." : settings?.presents_blocked_at ? `FLP has switched ${PRESENTS_NAME} off for your profile.` : "Nothing yet. Switch it on from My profile and families can start ordering."}
          </Body>
        ) : null}
      </View>
      {toRecord.map((r) => (
        <OpenRequest key={r.id} r={r} onChanged={(text) => { setNotice(text); load(); }} />
      ))}

      {held.length > 0 ? (
        <View style={{ gap: space.md }}>
          <H2>Held by FLP</H2>
          {held.map((r) => (
            <Card key={r.id}>
              <View style={s.row}>
                <H3>For {r.recipient_name}</H3>
                <Pill tone="warn">With FLP</Pill>
              </View>
              <Body style={{ color: colors.muted }}>FLP is checking this request before you see it. Nothing to do yet; it appears under To record once it's cleared.</Body>
              <Small>{r.occasion}{r.due_at ? ` · due ${day(r.due_at)}` : ""} · you earn {money(r.athlete_share_cents)}</Small>
            </Card>
          ))}
        </View>
      ) : null}

      {checking.length > 0 ? (
        <View style={{ gap: space.md }}>
          <H2>Being checked</H2>
          {checking.map((r) => (
            <Card key={r.id}>
              <View style={s.row}>
                <H3>For {r.recipient_name}</H3>
                <Pill tone="gold">Being checked by FLP</Pill>
              </View>
              <Body style={{ color: colors.muted }}>Your video is in. {r.recipient_minor ? "FLP checks every video made for someone under 18 before it goes out" : "FLP checks this video before it goes out"}, usually within a day.</Body>
              <Small>{r.occasion} · you earn {money(r.athlete_share_cents)} once it's delivered</Small>
            </Card>
          ))}
        </View>
      ) : null}

      {delivered.length > 0 ? (
        <View style={{ gap: space.md }}>
          <H2>Delivered</H2>
          {delivered.map((r) => (
            <Card key={r.id} style={{ padding: space.lg }}>
              <View style={s.row}>
                <View style={{ flex: 1, minWidth: 200 }}>
                  <Body>For {r.recipient_name} · {r.occasion}</Body>
                  <Small>Delivered {day(r.delivered_at)} · {money(r.athlete_share_cents)}{r.rating ? ` · rated ${r.rating}/5` : ""}</Small>
                </View>
                <Pill tone="ok">Delivered</Pill>
              </View>
            </Card>
          ))}
        </View>
      ) : null}

      {closed.length > 0 ? (
        <View style={{ gap: space.md }}>
          <H2>Closed</H2>
          {closed.map((r) => (
            <Card key={r.id} style={{ padding: space.lg }}>
              <View style={s.row}>
                <View style={{ flex: 1, minWidth: 200 }}>
                  <Body>For {r.recipient_name} · {r.occasion}</Body>
                  <Small>{STATUS_LABEL[r.status]}{r.declined_reason ? ` · ${r.declined_reason}` : ""}</Small>
                </View>
                <Pill tone="muted">{r.status === "declined" ? "Declined" : r.status === "expired" ? "Expired" : r.status === "cancelled" ? "Cancelled" : "Refunded"}</Pill>
              </View>
            </Card>
          ))}
        </View>
      ) : null}
    </Screen>
  );
}

const SENT: Record<"delivered" | "in_review" | "declined", (r: AthleteRequest) => string> = {
  delivered: (r) => `Sent. ${r.recipient_name}'s video is delivered, and ${money(r.athlete_share_cents)} is on its way to your earnings.`,
  in_review: (r) => `Sent. FLP gives ${r.recipient_name}'s video a quick check before it goes out, usually within a day; your share is paid when it's delivered.`,
  declined: (r) => `Declined. The request for ${r.recipient_name} is closed and the family has been refunded.`,
};

// One request waiting to be recorded: the brief, the upload, send or decline.
function OpenRequest({ r, onChanged }: { r: AthleteRequest; onChanged: (notice: string) => void }) {
  const [mediaId, setMediaId] = useState<string | null>(r.video_media_id);
  const [processing, setProcessing] = useState(false);
  const [busy, setBusy] = useState<"send" | "decline" | null>(null);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const [done, setDone] = useState<"delivered" | "in_review" | "declined" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const left = daysLeft(r.due_at);

  async function attach(id: string) {
    setError(null);
    setProcessing(true);
    try {
      await attachVideo(r.id, id);
      setMediaId(id);
    } catch (e) {
      setError((e as Error).message);
      setProcessing(false);
    }
  }

  async function send() {
    if (!mediaId) return setError("Upload the video first.");
    setBusy("send");
    setError(null);
    try {
      const res = await sendVideo(r.id);
      setDone(res.status);
      onChanged(SENT[res.status](r));
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(null);
  }

  async function decline() {
    setBusy("decline");
    setError(null);
    try {
      await declineRequest(r.id, reason.trim());
      setDone("declined");
      onChanged(SENT.declined(r));
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(null);
  }

  if (done) {
    // Shown only until the list reloads and this request moves to its new section.
    return (
      <Card>
        <H3>For {r.recipient_name}</H3>
        {done === "delivered" ? <Pill tone="ok">Delivered</Pill> : done === "in_review" ? <Pill tone="gold">Being checked by FLP</Pill> : <Pill tone="muted">Declined</Pill>}
        <Body style={{ color: colors.muted }}>{SENT[done](r)}</Body>
      </Card>
    );
  }

  return (
    <Card>
      <View style={s.row}>
        <H3>For {r.recipient_name}</H3>
        <View style={s.pills}>
          {r.recipient_minor ? <Pill tone="muted">Under 18 · FLP checks it first</Pill> : null}
          {left !== null ? <Pill tone={left <= 1 ? "danger" : "gold"}>{left <= 0 ? "Due today" : `${left} day${left === 1 ? "" : "s"} left`}</Pill> : null}
        </View>
      </View>
      {r.review_note ? (
        <View style={s.note}>
          <Small style={{ color: colors.warn }}>FLP asked for another take</Small>
          <Body>{r.review_note}</Body>
        </View>
      ) : null}
      <View style={s.brief}>
        <Fact label="Occasion" value={r.occasion} />
        {r.from_name ? <Fact label="From" value={r.from_name} /> : null}
        {r.team ? <Fact label="Team" value={r.team} /> : null}
        {r.due_at ? <Fact label="Due" value={day(r.due_at)} /> : null}
        <Fact label="You earn" value={money(r.athlete_share_cents)} />
      </View>
      <View>
        <Label>What they'd like you to say</Label>
        <Body>{r.instructions}</Body>
      </View>
      <View style={{ gap: space.sm }}>
        <Label>Your video</Label>
        {mediaId ? <Pill tone={processing ? "gold" : "ok"}>{processing ? "Uploaded, processing" : "Video attached"}</Pill> : null}
        <VideoUpload purpose="presents_video" buttonTitle={mediaId ? "Replace the video" : "Upload your video"} onUploaded={attach} onReady={() => setProcessing(false)} />
      </View>
      {error ? <Body style={{ color: colors.danger }}>{error}</Body> : null}
      <View style={s.row}>
        <Button title="Send" loading={busy === "send"} disabled={!mediaId || processing || busy !== null} onPress={send} />
        {!declining ? <Button title="Can't do this one" variant="ghost" small disabled={busy !== null} onPress={() => setDeclining(true)} /> : null}
      </View>
      {processing ? <Small>Send unlocks once the video has finished processing, usually a minute or two.</Small> : null}
      {declining ? (
        <View style={s.declineBox}>
          <TextField label="Why not? (FLP sees this; the family just gets a refund)" value={reason} onChangeText={(v) => setReason(v.slice(0, 300))} placeholder="e.g. Away with the team this week" />
          <View style={s.row}>
            <Button title="Decline and refund them" variant="danger" small loading={busy === "decline"} onPress={decline} />
            <Button title="Keep it" variant="ghost" small disabled={busy !== null} onPress={() => { setDeclining(false); setReason(""); }} />
          </View>
        </View>
      ) : null}
    </Card>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ minWidth: 120 }}>
      <Label>{label}</Label>
      <Body>{value}</Body>
    </View>
  );
}

const s = StyleSheet.create({
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md },
  topRight: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: space.sm },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, flexWrap: "wrap", justifyContent: "space-between" },
  pills: { flexDirection: "row", gap: space.sm, flexWrap: "wrap" },
  brief: { flexDirection: "row", flexWrap: "wrap", gap: space.lg },
  note: { borderWidth: 1, borderColor: colors.warn, borderRadius: radius.md, padding: space.md, gap: 2, backgroundColor: colors.warnSoft },
  declineBox: { borderWidth: 1, borderColor: colors.line2, borderRadius: radius.md, padding: space.md, gap: space.md },
});
