import { StyleSheet, View } from "react-native";
import { MuxPlayer } from "./MuxPlayer";
import { Label } from "./ui/Text";
import { space } from "@/theme/tokens";

// A video slot the admin fills from Settings with a public Mux playback id (the explainer videos,
// the upload walkthrough). Renders nothing until a video is set, so the slot costs the page nothing empty.
export function ExplainerVideo({ playbackId, title, label }: { playbackId: string | null | undefined; title: string; label?: string }) {
  const id = (playbackId ?? "").trim();
  if (!id) return null;
  return (
    <View style={s.wrap}>
      {label ? <Label>{label}</Label> : null}
      <MuxPlayer title={title} playback={{ ready: true, playbackId: id, policy: "public", tokens: null, mp4Url: null }} />
    </View>
  );
}

const s = StyleSheet.create({ wrap: { gap: space.sm, width: "100%" } });
