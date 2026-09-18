// Design tokens extracted from FLP's brand mockups: black field, gold and white,
// bold italic condensed display type. Every color and size in the app comes from here.

export const colors = {
  bg: "#000000",
  panel: "#0C0C0C",
  panel2: "#141414",
  line: "#1F1F1F",
  line2: "#2C2C2C",
  gold: "#D4A32C",
  goldBright: "#F0C75E",
  goldDim: "#8A6A1C",
  goldSoft: "rgba(212,163,44,0.12)",
  white: "#FFFFFF",
  ink: "#F2F2F2",
  muted: "#B5B5B5",
  faint: "#6F6F6F",
  ok: "#4CC38A",
  okSoft: "rgba(76,195,138,0.14)",
  warn: "#F5A623",
  warnSoft: "rgba(245,166,35,0.14)",
  danger: "#E5484D",
  dangerSoft: "rgba(229,72,77,0.14)",
  focus: "#7FB0FF",
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;

export const radius = { sm: 6, md: 10, lg: 14, pill: 999 } as const;

export const fonts = {
  display: "BarlowCondensed_800ExtraBold_Italic",
  displayBold: "BarlowCondensed_700Bold_Italic",
  body: "Barlow_400Regular",
  medium: "Barlow_500Medium",
  semibold: "Barlow_600SemiBold",
} as const;

export const type = {
  display: 44,
  h1: 32,
  h2: 24,
  h3: 19,
  body: 16,
  small: 14,
  label: 12,
} as const;

// Laptop-first: content sits in a centered column; forms are narrower still.
export const layout = { page: 1120, content: 760, form: 460 } as const;
