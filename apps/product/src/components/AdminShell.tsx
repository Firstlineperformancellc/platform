import { Link, usePathname } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { Brand } from "./Brand";
import { Button } from "./ui/Button";
import { Screen } from "./ui/Screen";
import { H1, Label } from "./ui/Text";
import { useAuth } from "@/lib/auth";
import { colors, fonts, radius, space } from "@/theme/tokens";

const NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/mentors", label: "Mentors" },
  { href: "/admin/jobs", label: "Orders & jobs" },
  { href: "/admin/audits", label: "Audits" },
  { href: "/admin/ledger", label: "Ledger" },
  { href: "/admin/settings", label: "Settings" },
] as const;

export function AdminShell({ title, children }: { title: string; children: React.ReactNode }) {
  const { signOut } = useAuth();
  const path = usePathname();
  return (
    <Screen width="page">
      <View style={s.topbar}>
        <Brand size={40} />
        <View style={s.nav}>
          {NAV.map((n) => {
            const on = path === n.href || (n.href !== "/admin" && path.startsWith(n.href));
            return (
              <Link key={n.href} href={n.href} style={[s.navItem, on && s.navOn]}>
                <Text style={[s.navText, on && s.navTextOn]}>{n.label}</Text>
              </Link>
            );
          })}
        </View>
        <Button title="Sign out" variant="ghost" small onPress={signOut} />
      </View>
      <View>
        <Label>FLP admin</Label>
        <H1>{title}</H1>
      </View>
      {children}
    </Screen>
  );
}

const s = StyleSheet.create({
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md, flexWrap: "wrap" },
  nav: { flexDirection: "row", flexWrap: "wrap", gap: 4, backgroundColor: colors.panel, borderRadius: radius.md, padding: 4 },
  navItem: { paddingHorizontal: space.md, paddingVertical: 6, borderRadius: radius.sm },
  navOn: { backgroundColor: colors.goldSoft },
  navText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.muted },
  navTextOn: { color: colors.gold },
});
