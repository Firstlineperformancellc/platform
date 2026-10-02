import { Pressable, StyleSheet, Text, View } from "react-native";
import { Small } from "./Text";
import { colors, fonts, space } from "@/theme/tokens";

// A labelled tick box. `hint` explains what unticked means when that is not obvious.
export function Checkbox({ label, checked, onChange, hint, disabled }: { label: string; checked: boolean; onChange: (next: boolean) => void; hint?: string; disabled?: boolean }) {
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked, disabled }} disabled={disabled} onPress={() => onChange(!checked)} style={[s.row, disabled && { opacity: 0.5 }]}>
      <View style={[s.box, checked && s.boxOn]}>{checked ? <Text style={s.tick}>✓</Text> : null}</View>
      <View style={{ flexShrink: 1 }}>
        <Text style={s.label}>{label}</Text>
        {hint ? <Small>{hint}</Small> : null}
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start", gap: space.sm, paddingVertical: 4 },
  box: { width: 22, height: 22, borderRadius: 5, borderWidth: 1.5, borderColor: colors.line2, alignItems: "center", justifyContent: "center", marginTop: 1 },
  boxOn: { borderColor: colors.gold, backgroundColor: colors.goldSoft },
  tick: { color: colors.gold, fontSize: 14, lineHeight: 16, fontFamily: fonts.semibold },
  label: { fontFamily: fonts.medium, fontSize: 15, color: colors.ink },
});
