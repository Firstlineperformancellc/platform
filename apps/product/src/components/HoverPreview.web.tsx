import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Pressable, ScrollView, StyleSheet, View, type LayoutChangeEvent, type ViewStyle } from "react-native";
import type { HoverAnchor, HoverPreviewOptions } from "./HoverPreview";
import { colors, radius } from "@/theme/tokens";

const HOVER_MS = 1000; // open after the pointer has rested on the tile for a second
const CLOSE_MS = 150; // grace period for moving between the tile and the card
const GAP = 16; // keep clear of the window edges
const WIDTH = 390; // about a phone's width
const FIXED = { position: "fixed" } as unknown as ViewStyle;

type Box = { left: number; top: number; width: number; maxHeight: number; photo: number; placed: boolean };

// Rest the pointer on a tile for a second and a larger card opens over it. The card is drawn at the
// top level of the page (react-native-web gives every view its own stacking layer, so a card inside
// the grid would slide under the tiles after it), lines up with the tile, stays inside the window,
// and closes when the pointer leaves it, the page scrolls, the window resizes, or Escape is pressed.
// Only for a mouse or trackpad: touch screens have no hover and keep the plain tile.
// The anchor handlers go on the tile's own Pressable: react-native-web ends an outer Pressable's hover
// when the pointer enters an inner one, so a wrapper around the tile would never stay hovered.
export function useHoverPreview({ enabled, preview, label, onPress }: HoverPreviewOptions): { anchor: HoverAnchor; overlay: ReactNode } {
  const anchor = useRef<View>(null);
  const card = useRef<View>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [box, setBox] = useState<Box | null>(null);
  const isOpen = box !== null;

  const stop = (t: typeof openTimer) => {
    if (t.current) clearTimeout(t.current);
    t.current = null;
  };
  const close = useCallback(() => {
    stop(openTimer);
    stop(closeTimer);
    setBox(null);
  }, []);
  const closeSoon = () => {
    stop(closeTimer);
    closeTimer.current = setTimeout(close, CLOSE_MS);
  };

  const open = () => {
    const el = anchor.current as unknown as HTMLElement | null;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const width = Math.min(WIDTH, window.innerWidth - GAP * 2);
    const left = Math.max(GAP, Math.min(r.left + (r.width - width) / 2, window.innerWidth - GAP - width));
    const photo = Math.round(Math.max(180, Math.min(300, window.innerHeight * 0.36)));
    setBox({ left, top: r.top, width, maxHeight: window.innerHeight - GAP * 2, photo, placed: false });
  };

  // The card's height is known after its first layout: centre it on the tile, inside the window.
  const onLayout = (e: LayoutChangeEvent) => {
    const el = anchor.current as unknown as HTMLElement | null;
    if (!el) return;
    const h = e.nativeEvent.layout.height;
    const r = el.getBoundingClientRect();
    const top = Math.max(GAP, Math.min(r.top + (r.height - h) / 2, window.innerHeight - GAP - h));
    setBox((b) => (b && !b.placed ? { ...b, top, placed: true } : b));
  };

  useEffect(() => {
    if (!isOpen) return;
    const inCard = (t: EventTarget | null) => Boolean(t && (card.current as unknown as HTMLElement | null)?.contains(t as Node));
    const onScroll = (e: Event) => {
      if (!inCard(e.target)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [isOpen, close]);

  useEffect(() => () => { stop(openTimer); stop(closeTimer); }, []);

  const canHover = typeof window !== "undefined" && Boolean(window.matchMedia?.("(hover: hover) and (pointer: fine)").matches);

  if (!enabled) return { anchor: {}, overlay: null };
  return {
    anchor: {
      ref: anchor,
      onHoverIn: () => {
        stop(closeTimer);
        if (!canHover || isOpen) return;
        stop(openTimer);
        openTimer.current = setTimeout(open, HOVER_MS);
      },
      onHoverOut: () => {
        stop(openTimer);
        if (isOpen) closeSoon();
      },
    },
    overlay: box
      ? createPortal(
          <Pressable
            ref={card}
            accessibilityRole="button"
            accessibilityLabel={label}
            onPress={() => {
              close();
              onPress?.();
            }}
            onHoverIn={() => stop(closeTimer)}
            onHoverOut={closeSoon}
            onLayout={onLayout}
            style={[s.card, FIXED, { left: box.left, top: box.top, width: box.width, maxHeight: box.maxHeight, opacity: box.placed ? 1 : 0 }]}
          >
            <ScrollView showsVerticalScrollIndicator={false}>{preview(box.photo)}</ScrollView>
          </Pressable>,
          document.body,
        )
      : null,
  };
}

const s = StyleSheet.create({
  card: {
    zIndex: 1000,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.goldDim,
    borderRadius: radius.lg,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.7,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 14 },
  },
});
