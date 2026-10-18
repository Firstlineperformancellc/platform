import type { ReactNode, RefObject } from "react";
import type { View } from "react-native";

// Hover previews are a web feature (HoverPreview.web.tsx); phones and tablets have no hover, so the
// native apps show the tile as it is.
export type HoverPreviewOptions = { enabled: boolean; preview: (photoHeight: number) => ReactNode; label: string; onPress?: () => void };
export type HoverAnchor = { ref?: RefObject<View | null>; onHoverIn?: () => void; onHoverOut?: () => void };

export function useHoverPreview(_: HoverPreviewOptions): { anchor: HoverAnchor; overlay: ReactNode } {
  return { anchor: {}, overlay: null };
}
