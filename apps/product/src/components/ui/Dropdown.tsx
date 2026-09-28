import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Label, Small } from "./Text";
import { colors, fonts, radius, space } from "@/theme/tokens";

type Option = { key: string; label: string };
type Props = { label: string; options: Option[]; value: string[]; onChange: (next: string[]) => void; placeholder?: string; hint?: string };

// A drop-down that allows several picks. Tap the field to open the list, tap rows to tick them.
export function Dropdown({ label, options, value, onChange, placeholder = "Choose…", hint }: Props) {
  const [open, setOpen] = useState(false);
  const chosen = options.filter((o) => value.includes(o.key)).map((o) => o.label);
  function toggle(key: string) {
    onChange(value.includes(key) ? value.filter((k) => k !== key) : [...value, key]);
  }
  return (
    <View style={{ gap: 6 }}>
      <Label>{label}</Label>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen((o) => !o)} style={[s.field, open && s.fieldOpen]}>
        <Text style={[s.value, chosen.length === 0 && s.placeholder]} numberOfLines={2}>{chosen.length ? chosen.join(", ") : placeholder}</Text>
        <Text style={s.chevron}>{open ? "▴" : "▾"}</Text>
      </Pressable>
      {open ? (
        <View style={s.menu}>
          {options.map((o) => {
            const on = value.includes(o.key);
            return (
              <Pressable key={o.key} accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={() => toggle(o.key)} style={s.row}>
                <View style={[s.box, on && s.boxOn]}>{on ? <Text style={s.tick}>✓</Text> : null}</View>
                <Text style={[s.rowText, on && s.rowTextOn]}>{o.label}</Text>
              </Pressable>
            );
          })}
          <Pressable accessibilityRole="button" onPress={() => setOpen(false)} style={s.done}><Text style={s.doneText}>Done</Text></Pressable>
        </View>
      ) : null}
      {hint ? <Small>{hint}</Small> : null}
    </View>
  );
}

const s = StyleSheet.create({
  field: { minHeight: 48, borderWidth: 1, borderColor: colors.line2, borderRadius: radius.md, backgroundColor: colors.panel2, paddingHorizontal: space.md, paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: space.sm },
  fieldOpen: { borderColor: colors.gold },
  value: { flex: 1, fontFamily: fonts.body, fontSize: 16, color: colors.ink },
  placeholder: { color: colors.faint },
  chevron: { color: colors.muted, fontSize: 14 },
  menu: { borderWidth: 1, borderColor: colors.line2, borderRadius: radius.md, backgroundColor: colors.panel, paddingVertical: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.md, paddingVertical: 11 },
  box: { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: colors.line2, alignItems: "center", justifyContent: "center" },
  boxOn: { borderColor: colors.gold, backgroundColor: colors.goldSoft },
  tick: { color: colors.gold, fontSize: 13, lineHeight: 15, fontFamily: fonts.semibold },
  rowText: { flex: 1, fontFamily: fonts.body, fontSize: 15, color: colors.muted },
  rowTextOn: { color: colors.ink },
  done: { alignSelf: "flex-end", paddingHorizontal: space.md, paddingVertical: 8 },
  doneText: { fontFamily: fonts.displayBold, fontSize: 13, letterSpacing: 1, color: colors.gold, textTransform: "uppercase" },
});
