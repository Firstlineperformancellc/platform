import { useEffect, useRef, useState, type Ref } from "react";
import { Platform, StyleSheet, TextInput, View, type TextInputProps } from "react-native";
import { colors, fonts, radius, space, type } from "@/theme/tokens";
import { Label, Small } from "./Text";

type Props = TextInputProps & { label: string; error?: string; hint?: string; ref?: Ref<TextInput> };

// Browsers fill saved logins and addresses without firing the input events React listens to, often before
// the page has hydrated, so a box can show a value the form never received (sign-in then sent an empty
// email: "missing email or phone"). On the web, copy the box's real value into the form whenever they differ.
let autofillStyled = false;
function styleAutofill() {
  if (autofillStyled || typeof document === "undefined") return;
  autofillStyled = true;
  const tag = document.createElement("style");
  // The animation exists only so "animationstart" announces an autofill; the rest keeps filled boxes on brand.
  tag.textContent = `@keyframes flp-autofill{from{}to{}}input:-webkit-autofill{animation-name:flp-autofill;-webkit-text-fill-color:${colors.white};caret-color:${colors.white};box-shadow:0 0 0 1000px ${colors.panel} inset}`;
  document.head.appendChild(tag);
}

/** The value the box actually shows, on the web; falls back to the form's value elsewhere. */
export function liveValue(ref: { current: TextInput | null }, fallback: string) {
  const el = ref.current as unknown as HTMLInputElement | null;
  return Platform.OS === "web" && el && typeof el.value === "string" && el.value ? el.value : fallback;
}

export function TextField({ label, error, hint, style, ref, ...rest }: Props) {
  const [focused, setFocused] = useState(false);
  const inner = useRef<TextInput | null>(null);
  const latest = useRef(rest);
  latest.current = rest;
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const el = inner.current as unknown as HTMLInputElement | null;
    if (!el || typeof el.addEventListener !== "function") return;
    styleAutofill();
    const sync = () => {
      const { value, onChangeText } = latest.current;
      if (onChangeText && typeof el.value === "string" && el.value !== (value ?? "")) onChangeText(el.value);
    };
    const events = ["animationstart", "change", "focus", "blur"];
    events.forEach((e) => el.addEventListener(e, sync));
    const timers = [50, 400, 1500].map((ms) => setTimeout(sync, ms));
    return () => {
      events.forEach((e) => el.removeEventListener(e, sync));
      timers.forEach(clearTimeout);
    };
  }, []);
  return (
    <View style={s.wrap}>
      <Label>{label}</Label>
      <TextInput
        placeholderTextColor={colors.faint}
        {...rest}
        ref={(node) => {
          inner.current = node;
          if (typeof ref === "function") ref(node);
          else if (ref) (ref as { current: TextInput | null }).current = node;
        }}
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
