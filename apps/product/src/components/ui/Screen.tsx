import { ScrollView, StyleSheet, View, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, layout, space } from "@/theme/tokens";

type Props = {
  children: React.ReactNode;
  width?: keyof typeof layout;
  center?: boolean;
  style?: ViewStyle;
};

// Laptop-first page frame: a centered column of a chosen width, scrolling as a whole.
export function Screen({ children, width = "content", center, style }: Props) {
  return (
    <SafeAreaView style={s.safe}>
      <ScrollView
        contentContainerStyle={[s.scroll, center && s.center]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[s.column, { maxWidth: layout[width] }, style]}>{children}</View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { flexGrow: 1, paddingHorizontal: space.xl, paddingVertical: space.xxl, alignItems: "center" },
  center: { justifyContent: "center" },
  column: { width: "100%", gap: space.xl },
});
