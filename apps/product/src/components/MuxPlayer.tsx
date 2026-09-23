import { Platform, StyleSheet, View } from "react-native";
import { Body, Small } from "./ui/Text";
import { playerSrc, usePlayback } from "@/lib/media";
import { openExternal } from "@/lib/open";
import { colors, radius } from "@/theme/tokens";

type Props = { mediaId: string | null | undefined; title: string; processingText?: string; downloadLabel?: string };

// One player for every family video: asks the API for playback (and tokens for signed assets).
export function MuxPlayer({ mediaId, title, processingText = "The video is still processing. Check back in a few minutes.", downloadLabel }: Props) {
  const pb = usePlayback(mediaId);
  if (!mediaId || pb === undefined) return null;
  if (pb === null) return <Body style={{ color: colors.muted }}>This video isn't available to you.</Body>;
  if (!pb.ready) return <Body style={{ color: colors.muted }}>{processingText}</Body>;
  if (Platform.OS !== "web") return <Body style={{ color: colors.muted }}>Playback in the app arrives with the native build.</Body>;
  return (
    <View style={{ gap: 6 }}>
      <iframe src={playerSrc(pb)} style={{ border: 0, width: "100%", aspectRatio: "16 / 9", borderRadius: radius.md }} allow="fullscreen" allowFullScreen title={title} />
      {downloadLabel && pb.mp4Url ? (
        <Small>
          To record with your own screen recorder, play it here or{" "}
          <Small style={s.link} onPress={() => openExternal(async () => pb.mp4Url!)}>
            {downloadLabel}
          </Small>
          . The download becomes available a few minutes after the film finishes processing.
        </Small>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({ link: { color: colors.gold } });
