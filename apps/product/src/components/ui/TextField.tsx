import { useState } from "react";
import { StyleSheet, TextInput, View, type TextInputProps } from "react-native";
import { colors, fonts, radius, space, type } from "@/theme/tokens";
import { Label, Small } from "./Text";

type Props = TextInputProps & { label: string; error?: string; hint?: string };

export function TextField({ label, error, hint, style, ...rest }: Props) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={s.wrap}>
      <Label>{label}</Label>
      <TextInput
        placeholderTextColor={colors.faint}
        {...rest}
        onFocus={(e) => {
          setFocused(true);
          rest.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          rest.onBlur?.(e);
        }}
        style={[s.input, focused && s.focused, !!error && s.errored, style]}
      />
      {error ? <Small style={{ color: colors.danger }}>{error}</Small> : hint ? <Small>{hint}</Small> : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: space.sm },
  input: {
    height: 48,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.line2,
    backgroundColor: colors.panel,
    color: colors.white,
    fontFamily: fonts.body,
    fontSize: type.body,
  },
  focused: { borderColor: colors.gold },
  errored: { borderColor: colors.danger },
});
