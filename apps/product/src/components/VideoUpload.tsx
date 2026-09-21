import { useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { createUpload, type UpChunk } from "@mux/upchunk";
import { Button } from "./ui/Button";
import { Pill } from "./ui/Pill";
import { Body, H3, Small } from "./ui/Text";
import { api } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { colors, radius, space } from "@/theme/tokens";

type Phase = "idle" | "requesting" | "uploading" | "paused" | "processing" | "ready" | "error";

type Props = {
  purpose: "game_film" | "breakdown";
  buttonTitle?: string;
  onUploaded?: (mediaId: string) => void; // bytes are in; Mux is processing
  onReady?: (mediaId: string, playbackId: string | null) => void; // Mux finished
};

function fmtBytes(n: number) {
  if (n > 1e9) return `${(n / 1e9).toFixed(2)} GB`;
  if (n > 1e6) return `${(n / 1e6).toFixed(1)} MB`;
  return `${Math.round(n / 1e3)} KB`;
}

// Resumable direct-to-Mux upload with pause/resume and offline handling. Web only until week 7.
export function VideoUpload({ purpose, buttonTitle = "Choose a video file", onUploaded, onReady }: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [file, setFile] = useState<{ name: string; size: number } | null>(null);
  const [progress, setProgress] = useState(0);
  const [online, setOnline] = useState(true);
  const [mediaId, setMediaId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const upload = useRef<UpChunk | null>(null);

  useEffect(() => {
    if (!mediaId || (phase !== "processing" && phase !== "uploading")) return;
    const t = setInterval(async () => {
      const { data } = await supabase.from("media").select("status, mux_playback_id").eq("id", mediaId).maybeSingle();
      if (!data) return;
      if (data.status === "ready") {
        setPhase("ready");
        onReady?.(mediaId, data.mux_playback_id);
      }
      if (data.status === "errored") {
        setPhase("error");
        setError("The video could not be processed. Try a different file.");
      }
    }, 3000);
    return () => clearInterval(t);
  }, [mediaId, phase, onReady]);

  async function pick() {
    setError(null);
    const picked = await DocumentPicker.getDocumentAsync({ type: "video/*", copyToCacheDirectory: false, multiple: false });
    if (picked.canceled || !picked.assets[0]) return;
    const asset = picked.assets[0];
    if (Platform.OS !== "web" || !asset.file) return setError("Uploading from the app arrives with the native build. Use a browser for now.");
    setFile({ name: asset.name, size: asset.size ?? asset.file.size });
    setPhase("requesting");
    try {
      const { mediaId, uploadUrl } = await api<{ mediaId: string; uploadUrl: string }>("/uploads", {
        method: "POST",
        body: JSON.stringify({ purpose, title: asset.name }),
      });
      setMediaId(mediaId);
      setPhase("uploading");
      const up = createUpload({ endpoint: uploadUrl, file: asset.file, chunkSize: 30 * 1024, dynamicChunkSize: true, attempts: 10, delayBeforeAttempt: 2 });
      upload.current = up;
      up.on("progress", (e) => setProgress(Math.round(e.detail)));
      up.on("offline", () => setOnline(false));
      up.on("online", () => setOnline(true));
      up.on("error", (e) => {
        setPhase("error");
        setError(e.detail?.message ?? "Upload failed.");
      });
      up.on("success", () => {
        setProgress(100);
        setPhase("processing");
        onUploaded?.(mediaId);
      });
    } catch (err) {
      setPhase("error");
      setError((err as Error).message);
    }
  }

  return (
    <View style={{ gap: space.sm }}>
      {phase === "idle" || phase === "error" ? <Button title={buttonTitle} variant={purpose === "breakdown" ? "primary" : "primary"} onPress={pick} /> : null}
      {file ? (
        <View>
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
            <Small>{progress}%</Small>
            {!online ? <Pill tone="warn">Offline, will resume</Pill> : null}
            {phase === "processing" ? <Pill tone="gold">Processing</Pill> : null}
            {phase === "uploading" ? <Button title="Pause" variant="secondary" small onPress={() => { upload.current?.pause(); setPhase("paused"); }} /> : null}
            {phase === "paused" ? <Button title="Resume" small onPress={() => { upload.current?.resume(); setPhase("uploading"); }} /> : null}
          </View>
        </View>
      ) : null}
      {phase === "ready" ? <Pill tone="ok">Ready</Pill> : null}
      {error ? <Body style={{ color: colors.danger }}>{error}</Body> : null}
    </View>
  );
}

const s = StyleSheet.create({
  track: { height: 10, borderRadius: radius.pill, backgroundColor: colors.panel2, overflow: "hidden" },
  fill: { height: "100%", backgroundColor: colors.gold },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, flexWrap: "wrap" },
});
