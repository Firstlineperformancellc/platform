import { StyleSheet, View, type ViewProps } from "react-native";
import { colors, radius, space } from "@/theme/tokens";

export function Card({ style, ...rest }: ViewProps) {
  return <View {...rest} style={[s.card, style]} />;
}

const s = StyleSheet.create({
  card: {
    backgroundColor: colors.panel,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: space.xl,
    gap: space.md,
  },
});
