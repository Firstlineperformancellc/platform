import { useCallback, useState } from "react";
import { Link, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Platform, StyleSheet, View } from "react-native";
import { Brand } from "@/components/Brand";
import { VideoUpload } from "@/components/VideoUpload";
import { WorksheetView } from "@/components/WorksheetView";
import { MuxPlayer } from "@/components/MuxPlayer";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { Screen } from "@/components/ui/Screen";
import { TextField } from "@/components/ui/TextField";
import { Body, H1, H2, H3, Label, Small } from "@/components/ui/Text";
import { Loading } from "@/lib/auth";
import { deliverBreakdown, emptyWorksheet, getBreakdownForJob, type Breakdown, type Worksheet } from "@/lib/breakdowns";
import { hoursLeft, listMyJobs, type MyJob } from "@/lib/jobs";
import { colors, radius, space } from "@/theme/tokens";

// The mentor's job: watch the film, record the breakdown with their own tools, upload it, fill in the
// Player Development Worksheet, deliver. Film is visible only after acceptance (RLS).
export default function JobScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [job, setJob] = useState<MyJob | null | undefined>(undefined);
  const [existing, setExisting] = useState<Breakdown | null>(null);
  const [mediaId, setMediaId] = useState<string | null>(null);
  const [videoReady, setVideoReady] = useState(false);
  const [w, setW] = useState<Worksheet>(emptyWorksheet());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      listMyJobs().then((jobs) => setJob(jobs.find((j) => j.id === id) ?? null));
      if (id) getBreakdownForJob(id).then(setExisting);
    }, [id]),
  );

  if (job === undefined) return <Loading />;
  if (!job)
    return (
      <Screen title="Breakdown job" width="form" center>
        <H1 center>Job not found</H1>
        <Link href="/athlete" asChild>
          <Button title="Back to your jobs" variant="secondary" />
        </Link>
      </Screen>
    );

  const o = job.orders;
  const player = o?.players ? `${o.players.first_name}${o.players.last_name ? ` ${o.players.last_name[0]}.` : ""}` : "Youth athlete";
  const filmPlayback = o?.media?.mux_playback_id ?? null;
  const left = hoursLeft(job.due_at);

  const setList = (key: "strengths" | "improvements" | "next_steps", i: number, v: string) =>
    setW({ ...w, [key]: w[key].map((x, j) => (j === i ? v : x)) });
  const setClip = (i: number, patch: Partial<Worksheet["clips"][0]>) => setW({ ...w, clips: w.clips.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const setDrill = (i: number, patch: Partial<Worksheet["drills"][0]>) => setW({ ...w, drills: w.drills.map((d, j) => (j === i ? { ...d, ...patch } : d)) });

  async function deliver() {
    if (!mediaId) return setError("Upload your recorded breakdown first.");
    setBusy(true);
    setError(null);
    try {
      const res = await deliverBreakdown(job!.id, mediaId, w);
      router.replace({ pathname: "/athlete/jobs/[id]", params: { id: job!.id, delivered: res.onTime ? "ontime" : "late" } });
      setExisting(await getBreakdownForJob(job!.id));
      setJob({ ...job!, status: "delivered" });
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  return (
    <Screen title="Breakdown job" width="content">
      <View style={s.topbar}>
        <Brand size={44} />
        <Link href="/athlete" asChild>
          <Button title="Your jobs" variant="ghost" small />
        </Link>
      </View>
      <View>
        <Label>Breakdown for</Label>
        <H1>{player}</H1>
        <View style={s.row}>
          <Small>
            {o?.age_group} {o?.position} · {o?.skill_level}
          </Small>
          {job.status === "accepted" ? <Pill tone={(left ?? 0) < 12 ? "danger" : "gold"}>{`${left ?? 0}h left`}</Pill> : <Pill tone="ok">{job.status}</Pill>}
        </View>
      </View>

      <Card>
        <H3>What the parent asked for</H3>
        <Body>{o?.focus_areas.join(", ")}</Body>
        {o?.notes ? <Body style={{ color: colors.muted }}>{o.notes}</Body> : null}
      </Card>

      <Card>
        <View style={s.row}>
          <H3>Game film</H3>
          {o?.film_youtube_url ? <Pill tone="gold">YouTube</Pill> : filmPlayback ? <Pill tone="ok">Ready</Pill> : o?.film_media_id ? <Pill tone="warn">Processing</Pill> : <Pill tone="warn">Not uploaded yet</Pill>}
        </View>
        {o?.film_youtube_url ? (
          <Body>
            The parent shared a YouTube link. Open it, screen-record your breakdown from there.{" "}
            <Body style={{ color: colors.gold }} onPress={() => (Platform.OS === "web" ? window.open(o.film_youtube_url!, "_blank") : null)}>
              {o.film_youtube_url}
            </Body>
          </Body>
        ) : filmPlayback && o?.film_media_id ? (
          <MuxPlayer mediaId={o.film_media_id} title="Game film" downloadLabel="download the MP4" />
        ) : (
          <Body style={{ color: colors.muted }}>The film shows here as soon as the parent's upload finishes processing.</Body>
        )}
      </Card>

      {existing ? (
        <Card>
          <Pill tone="ok">Delivered</Pill>
          <H3>Your breakdown</H3>
          <MuxPlayer mediaId={existing.media_id} title="Breakdown" />
          <WorksheetView w={existing.worksheet} />
        </Card>
      ) : job.status === "accepted" ? (
        <>
          <Card>
            <H2>1. Upload your recorded breakdown</H2>
            <Body style={{ color: colors.muted }}>
              Record with whatever you use, Loom, QuickTime, OBS, your phone. Then upload the file here. It can keep processing while you fill in the worksheet.
            </Body>
            <VideoUpload purpose="breakdown" buttonTitle="Upload breakdown video" onUploaded={(m) => setMediaId(m)} onReady={() => setVideoReady(true)} />
            {mediaId && !videoReady ? <Small>Uploaded. You can deliver now; processing finishes in the background.</Small> : null}
          </Card>

          <Card>
            <H2>2. Player Development Worksheet</H2>
            <Body style={{ color: colors.muted }}>
              This goes to the youth athlete with your video, and FLP turns it into a PDF they keep. At least one clip and one drill.
            </Body>
            <Label>Strengths: what they did well</Label>
            {w.strengths.map((v, i) => (
              <TextField key={i} label={`Strength ${i + 1}`} value={v} onChangeText={(t) => setList("strengths", i, t)} />
            ))}
            <Label>Areas to improve</Label>
            {w.improvements.map((v, i) => (
              <TextField key={i} label={`Area ${i + 1}`} value={v} onChangeText={(t) => setList("improvements", i, t)} />
            ))}

            <Label>Game situations from the film</Label>
            {w.clips.map((c, i) => (
              <View key={i} style={s.block}>
                <View style={s.row}>
                  <Small>Clip {i + 1}</Small>
                  {w.clips.length > 1 ? <Button title="Remove" variant="ghost" small onPress={() => setW({ ...w, clips: w.clips.filter((_, j) => j !== i) })} /> : null}
                </View>
                <TextField label="Clip / time" value={c.time} onChangeText={(t) => setClip(i, { time: t })} placeholder="e.g. 12:40 second period" />
                <TextField label="Situation" value={c.situation} onChangeText={(t) => setClip(i, { situation: t })} placeholder="e.g. Odd-man rush against, 2-on-1" />
                <TextField label="What happened" value={c.what_happened} onChangeText={(t) => setClip(i, { what_happened: t })} multiline style={s.multi} />
                <TextField label="What to improve" value={c.improve} onChangeText={(t) => setClip(i, { improve: t })} multiline style={s.multi} />
                <TextField label="Key takeaway" value={c.takeaway} onChangeText={(t) => setClip(i, { takeaway: t })} />
              </View>
            ))}
            <Button title="Add another clip" variant="secondary" small onPress={() => setW({ ...w, clips: [...w.clips, { time: "", situation: "", what_happened: "", improve: "", takeaway: "" }] })} />

            <Label>Recommended workouts and drills</Label>
            {w.drills.map((d, i) => (
              <View key={i} style={s.block}>
                <View style={s.row}>
                  <Small>Drill {i + 1}</Small>
                  {w.drills.length > 1 ? <Button title="Remove" variant="ghost" small onPress={() => setW({ ...w, drills: w.drills.filter((_, j) => j !== i) })} /> : null}
                </View>
                <TextField label="Area of focus" value={d.area} onChangeText={(t) => setDrill(i, { area: t })} placeholder="e.g. Lower body strength, explosiveness" />
                <TextField label="Workout / drill" value={d.drill} onChangeText={(t) => setDrill(i, { drill: t })} />
                <TextField label="Description" value={d.description} onChangeText={(t) => setDrill(i, { description: t })} multiline style={s.multi} />
                <TextField label="Frequency" value={d.frequency} onChangeText={(t) => setDrill(i, { frequency: t })} placeholder="e.g. 3x per week" />
                <TextField label="Notes" value={d.notes} onChangeText={(t) => setDrill(i, { notes: t })} />
              </View>
            ))}
            <Button title="Add another drill" variant="secondary" small onPress={() => setW({ ...w, drills: [...w.drills, { area: "", drill: "", description: "", frequency: "", notes: "" }] })} />

            <Label>Next steps: their action plan</Label>
            {w.next_steps.map((v, i) => (
              <TextField key={i} label={`Step ${i + 1}`} value={v} onChangeText={(t) => setList("next_steps", i, t)} />
            ))}
            <TextField label="Additional notes" value={w.notes} onChangeText={(t) => setW({ ...w, notes: t })} multiline style={s.multi} placeholder="Extra feedback, reminders, or resources." />

            {error ? <Body style={{ color: colors.danger }}>{error}</Body> : null}
            <Button title="Deliver breakdown" full loading={busy} onPress={deliver} />
            <Small>Delivering sends the youth athlete an email and starts your payout.</Small>
          </Card>
        </>
      ) : (
        <Card>
          <Body style={{ color: colors.muted }}>This job is {job.status}.</Body>
        </Card>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, flexWrap: "wrap", justifyContent: "space-between", marginTop: space.xs },
  block: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: space.md, gap: space.sm },
  multi: { height: 84, paddingTop: space.sm, textAlignVertical: "top" },
});
