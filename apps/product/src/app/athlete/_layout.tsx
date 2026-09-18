import { Stack } from "expo-router";
import { RequireRole } from "@/lib/auth";
import { colors } from "@/theme/tokens";

export default function AthleteLayout() {
  return (
    <RequireRole role="athlete">
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />
    </RequireRole>
  );
}
