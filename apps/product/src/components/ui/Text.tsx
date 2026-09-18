import { Text as RNText, StyleSheet, type TextProps } from "react-native";
import { colors, fonts, type } from "@/theme/tokens";

type Props = TextProps & { gold?: boolean; center?: boolean };

function make(base: object) {
  return function T({ style, gold, center, ...rest }: Props) {
    return (
      <RNText
        {...rest}
        style={[base, gold && { color: colors.gold }, center && { textAlign: "center" }, style]}
      />
    );
  };
}

const s = StyleSheet.create({
  display: {
    fontFamily: fonts.display,
    fontSize: type.display,
    lineHeight: type.display * 0.98,
    color: colors.white,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  h1: {
    fontFamily: fonts.display,
    fontSize: type.h1,
    lineHeight: type.h1 * 1.02,
    color: colors.white,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  h2: {
    fontFamily: fonts.displayBold,
    fontSize: type.h2,
    lineHeight: type.h2 * 1.08,
    color: colors.white,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  h3: { fontFamily: fonts.semibold, fontSize: type.h3, lineHeight: type.h3 * 1.3, color: colors.white },
  body: { fontFamily: fonts.body, fontSize: type.body, lineHeight: type.body * 1.5, color: colors.ink },
  small: { fontFamily: fonts.body, fontSize: type.small, lineHeight: type.small * 1.5, color: colors.muted },
  label: {
    fontFamily: fonts.semibold,
    fontSize: type.label,
    lineHeight: type.label * 1.4,
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 1.6,
  },
});

export const Display = make(s.display);
export const H1 = make(s.h1);
export const H2 = make(s.h2);
export const H3 = make(s.h3);
export const Body = make(s.body);
export const Small = make(s.small);
export const Label = make(s.label);
