import { Stack } from "expo-router";
import { Platform } from "react-native";
import { RequireRole } from "@/lib/auth";
import { Screen } from "@/components/ui/Screen";
import { Body, H1 } from "@/components/ui/Text";
import { colors } from "@/theme/tokens";

// Admin is web-only by design: it is a laptop tool, and it keeps the store builds lean.
export default function AdminLayout() {
  if (Platform.OS !== "web") {
    return (
      <Screen width="form" center>
        <H1 center>Admin is web only</H1>
        <Body center style={{ color: colors.muted }}>
          Open app.firstlineperform.com/admin in a browser.
        </Body>
      </Screen>
    );
  }
  return (
    <RequireRole role="admin">
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />
    </RequireRole>
  );
}
