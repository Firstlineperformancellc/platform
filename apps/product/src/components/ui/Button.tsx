import { ActivityIndicator, Pressable, StyleSheet, Text, type PressableProps, type ViewStyle } from "react-native";
import { colors, fonts, radius, space } from "@/theme/tokens";

type Variant = "primary" | "secondary" | "ghost" | "danger";

type Props = Omit<PressableProps, "style"> & {
  title: string;
  variant?: Variant;
  loading?: boolean;
  full?: boolean;
  small?: boolean;
  style?: ViewStyle;
};

export function Button({ title, variant = "primary", loading, full, small, disabled, style, ...rest }: Props) {
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={off}
      {...rest}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        s.base,
        small && s.small,
        variantStyle[variant],
        full && { alignSelf: "stretch" },
        hovered && !off && hoverStyle[variant],
        pressed && !off && { transform: [{ scale: 0.985 }] },
        off && { opacity: 0.55 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === "primary" ? colors.bg : colors.gold} />
      ) : (
        <Text style={[s.text, small && s.textSmall, textStyle[variant]]}>{title}</Text>
      )}
    </Pressable>
  );
}

const s = StyleSheet.create({
  base: {
    alignSelf: "flex-start",
    alignItems: "center",
    justifyContent: "center",
    height: 48,
    minWidth: 140,
    paddingHorizontal: space.xl,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  small: { height: 38, minWidth: 0, paddingHorizontal: space.lg },
  text: {
    fontFamily: fonts.display,
    fontSize: 18,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.bg,
  },
  textSmall: { fontSize: 15 },
});

const variantStyle: Record<Variant, ViewStyle> = {
  primary: { backgroundColor: colors.gold },
  secondary: { backgroundColor: "transparent", borderColor: colors.gold },
  ghost: { backgroundColor: "transparent", borderColor: "transparent" },
  danger: { backgroundColor: "transparent", borderColor: colors.danger },
};

const hoverStyle: Record<Variant, ViewStyle> = {
  primary: { backgroundColor: colors.goldBright },
  secondary: { backgroundColor: colors.goldSoft },
  ghost: { backgroundColor: colors.panel2 },
  danger: { backgroundColor: colors.dangerSoft },
};

const textStyle: Record<Variant, { color: string }> = {
  primary: { color: colors.bg },
  secondary: { color: colors.gold },
  ghost: { color: colors.muted },
  danger: { color: colors.danger },
};
