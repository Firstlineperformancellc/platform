import { Image } from "expo-image";
import { StyleSheet, View } from "react-native";
import { Label } from "./ui/Text";
import { space } from "@/theme/tokens";

export function Brand({ size = 120, caption }: { size?: number; caption?: string }) {
  return (
    <View style={s.wrap}>
      <Image
        source={require("@/assets/images/logo.png")}
        style={{ width: size, height: size }}
        contentFit="contain"
        accessibilityLabel="First Line Performance"
      />
      {caption ? <Label center>{caption}</Label> : null}
    </View>
  );
}

const s = StyleSheet.create({ wrap: { alignItems: "center", gap: space.md } });
