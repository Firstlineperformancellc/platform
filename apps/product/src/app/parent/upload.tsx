import { useEffect, useRef, useState } from "react";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import { Platform, StyleSheet, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { createUpload, type UpChunk } from "@mux/upchunk";
import { Brand } from "@/components/Brand";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { Screen } from "@/components/ui/Screen";
import { Body, H1, H3, Label, Small } from "@/components/ui/Text";
import { api } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { colors, radius, space } from "@/theme/tokens";

type Phase = "idle" | "requesting" | "uploading" | "paused" | "processing" | "ready" | "error";
type MediaRow = { id: string; status: string; mux_playback_id: string | null; duration_seconds: number | null };

function fmtBytes(n: number) {
  if (n > 1e9) return `${(n / 1e9).toFixed(2)} GB`;
  if (n > 1e6) return `${(n / 1e6).toFixed(1)} MB`;
  return `${Math.round(n / 1e3)} KB`;
}

// Week-1 upload spike: pick a game file, upload it straight to Mux in resumable chunks,
// survive a dropped connection, then stream it back. This screen becomes step 2 of the order wizard.
export default function UploadSpike() {
  const { order } = useLocalSearchParams<{ order?: string }>();
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [file, setFile] = useState<{ name: string; size: number } | null>(null);
  const [progress, setProgress] = useState(0);
  const [online, setOnline] = useState(true);
  const [mediaId, setMediaId] = useState<string | null>(null);
  const [media, setMedia] = useState<MediaRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const upload = useRef<UpChunk | null>(null);

  // Poll the media row until Mux reports it ready (webhook writes the row).
  useEffect(() => {
    if (!mediaId || (phase !== "processing" && phase !== "uploading")) return;
    const t = setInterval(async () => {
      const { data } = await supabase
        .from("media")
        .select("id, status, mux_playback_id, duration_seconds")
        .eq("id", mediaId)
        .maybeSingle();
      if (!data) return;
      setMedia(data as MediaRow);
      if (data.status === "ready") setPhase("ready");
      if (data.status === "errored") {
        setPhase("error");
        setError("Mux could not process this file.");
      }
    }, 3000);
    return () => clearInterval(t);
  }, [mediaId, phase]);

  async function pickAndUpload() {
    setError(null);
    const picked = await DocumentPicker.getDocumentAsync({ type: "video/*", copyToCacheDirectory: false, multiple: false });
    if (picked.canceled || !picked.assets[0]) return;
    const asset = picked.assets[0];
    if (Platform.OS !== "web" || !asset.file) {
      setError("Native upload lands in week 7. Use a browser for this test.");
      return;
    }
    setFile({ name: asset.name, size: asset.size ?? asset.file.size });
    setPhase("requesting");
    try {
      const { mediaId, uploadUrl } = await api<{ mediaId: string; uploadUrl: string }>("/uploads", {
        method: "POST",
        body: JSON.stringify({ purpose: "game_film", title: asset.name }),
      });
      setMediaId(mediaId);
      setStartedAt(Date.now());
      setPhase("uploading");
      const up = createUpload({
        endpoint: uploadUrl,
        file: asset.file,
        chunkSize: 30 * 1024, // KB units: 30 MB chunks
        dynamicChunkSize: true,
        attempts: 10,
        delayBeforeAttempt: 2,
      });
      upload.current = up;
      up.on("progress", (e) => setProgress(Math.round(e.detail)));
      up.on("offline", () => setOnline(false));
      up.on("online", () => setOnline(true));
      up.on("error", (e) => {
        setPhase("error");
        setError(e.detail?.message ?? "Upload failed.");
      });
      up.on("success", async () => {
        setProgress(100);
        setPhase("processing");
        if (order) {
          try {
            await api("/orders/" + order + "/film", { method: "POST", body: JSON.stringify({ mediaId }) });
          } catch (err) {
            setError("Uploaded, but attaching it to the order failed: " + (err as Error).message);
          }
        }
      });
    } catch (err) {
      setPhase("error");
      setError((err as Error).message);
    }
  }

  function pause() {
    upload.current?.pause();
    setPhase("paused");
  }
  function resume() {
    upload.current?.resume();
    setPhase("uploading");
  }

  const elapsed = startedAt ? Math.round((Date.now() - startedAt) / 1000) : 0;

  return (
    <Screen width="content">
      <View style={s.topbar}>
        <Brand size={44} />
        <Link href={order ? { pathname: "/parent/orders/[id]", params: { id: order } } : "/parent"} asChild>
          <Button title="Back" variant="ghost" small />
        </Link>
      </View>
      <View>
        <Label>{order ? "Step 2 of your order" : "Upload test"}</Label>
        <H1>Game film upload</H1>
        <Body style={{ color: colors.muted }}>
          Pick a full game file. It uploads straight to the video service in chunks, pauses if the connection drops,
          and resumes on its own. When processing finishes it plays back below.
        </Body>
      </View>

      <Card>
        {phase === "idle" || phase === "error" ? (
          <Button title="Choose a video file" onPress={pickAndUpload} />
        ) : null}

        {file ? (
          <View style={{ gap: space.xs }}>
            <H3>{file.name}</H3>
            <Small>{fmtBytes(file.size)}</Small>
          </View>
        ) : null}

        {phase === "requesting" ? <Body>Preparing upload…</Body> : null}

        {phase === "uploading" || phase === "paused" || phase === "processing" ? (
          <View style={{ gap: space.sm }}>
            <View style={s.track}>
              <View style={[s.fill, { width: `${progress}%` }]} />
            </View>
            <View style={s.row}>
              <Small>
                {progress}% · {elapsed}s
              </Small>
              {!online ? <Pill tone="warn">Offline, will resume</Pill> : null}
              {phase === "processing" ? <Pill tone="gold">Processing</Pill> : null}
            </View>
            <View style={s.row}>
              {phase === "uploading" ? <Button title="Pause" variant="secondary" small onPress={pause} /> : null}
              {phase === "paused" ? <Button title="Resume" small onPress={resume} /> : null}
            </View>
          </View>
        ) : null}

        {phase === "ready" && media?.mux_playback_id ? (
          <View style={{ gap: space.sm }}>
            <Pill tone="ok">Ready</Pill>
            <Small>
              {media.duration_seconds ? `${Math.round(media.duration_seconds / 60)} min` : ""} · media {media.id.slice(0, 8)}
            </Small>
            {order ? (
              <Button title="Back to your order" small onPress={() => router.replace({ pathname: "/parent/orders/[id]", params: { id: order } })} />
            ) : null}
            {Platform.OS === "web" ? (
              <View style={s.player}>
                {/* Mux's hosted player: adaptive HLS, no bundling risk. Signed playback lands in week 2. */}
                <iframe
                  src={`https://player.mux.com/${media.mux_playback_id}?primary-color=%23d4a32c&accent-color=%23000000`}
                  style={{ border: 0, width: "100%", aspectRatio: "16 / 9", borderRadius: radius.md }}
                  allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture; fullscreen"
                  allowFullScreen
                  title="Game film"
                />
              </View>
            ) : (
              <Body style={{ color: colors.muted }}>Playback in the app arrives with the native build.</Body>
            )}
          </View>
        ) : null}

        {error ? <Body style={{ color: colors.danger }}>{error}</Body> : null}
      </Card>
    </Screen>
  );
}

const s = StyleSheet.create({
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  track: { height: 10, borderRadius: radius.pill, backgroundColor: colors.panel2, overflow: "hidden" },
  fill: { height: "100%", backgroundColor: colors.gold },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, flexWrap: "wrap" },
  player: { width: "100%" },
});
