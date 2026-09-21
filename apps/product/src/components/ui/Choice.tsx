import { Pressable, StyleSheet, Text, View } from "react-native";
import { Label } from "./Text";
import { colors, fonts, radius, space } from "@/theme/tokens";

type Option = { key: string; label: string; hint?: string };

type Props = {
  label: string;
  options: Option[];
  value: string[] | string | null;
  onChange: (next: string[] | string) => void;
  multiple?: boolean;
  hint?: string;
};

// Chip-style picker used throughout the order wizard: single or multiple select.
export function Choice({ label, options, value, onChange, multiple, hint }: Props) {
  const selected = new Set(Array.isArray(value) ? value : value ? [value] : []);
  function toggle(key: string) {
    if (multiple) {
      const next = new Set(selected);
      next.has(key) ? next.delete(key) : next.add(key);
      onChange([...next]);
    } else onChange(key);
  }
  return (
    <View style={s.wrap}>
      <Label>{label}</Label>
      <View style={s.chips}>
        {options.map((o) => {
          const on = selected.has(o.key);
          return (
            <Pressable
              key={o.key}
              accessibilityRole={multiple ? "checkbox" : "radio"}
              accessibilityState={{ checked: on }}
              onPress={() => toggle(o.key)}
              style={({ hovered }: { hovered?: boolean }) => [s.chip, hovered && s.chipHover, on && s.chipOn]}
            >
              <Text style={[s.text, on && s.textOn]}>{o.label}</Text>
              {o.hint ? <Text style={[s.hint, on && s.textOn]}>{o.hint}</Text> : null}
            </Pressable>
          );
        })}
      </View>
      {hint ? <Text style={s.help}>{hint}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: space.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  chip: {
    minHeight: 40,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.line2,
    backgroundColor: colors.panel,
    justifyContent: "center",
  },
  chipHover: { borderColor: colors.faint },
  chipOn: { borderColor: colors.gold, backgroundColor: colors.goldSoft },
  text: { fontFamily: fonts.semibold, fontSize: 15, color: colors.muted },
  textOn: { color: colors.gold },
  hint: { fontFamily: fonts.body, fontSize: 12, color: colors.faint, marginTop: 2 },
  help: { fontFamily: fonts.body, fontSize: 13, color: colors.faint },
});
