import { Link, usePathname } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { Brand } from "./Brand";
import { Button } from "./ui/Button";
import { Screen } from "./ui/Screen";
import { H1, Label } from "./ui/Text";
import { useAuth } from "@/lib/auth";
import { useSettings } from "@/lib/settings";
import { colors, fonts, radius, space } from "@/theme/tokens";

const NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/mentors", label: "Mentors" },
  { href: "/admin/jobs", label: "Orders & jobs" },
  { href: "/admin/sessions", label: "Film Room" },
  { href: "/admin/audits", label: "Audits" },
  { href: "/admin/ledger", label: "Ledger" },
  { href: "/admin/support", label: "Support" },
  { href: "/admin/health", label: "Health" },
  { href: "/admin/settings", label: "Settings" },
] as const;

export function AdminShell({ title, children }: { title: string; children: React.ReactNode }) {
  const { signOut } = useAuth();
  const { settings } = useSettings();
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
      {settings?.rules.payments_mode === "free_preview" ? (
        <View style={s.banner}>
          <Text style={s.bannerText}>Free preview mode: orders and bookings go through with no charge. Switch to Stripe in Settings before real families use this.</Text>
        </View>
      ) : null}
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
  nav: { flexDirection: "row", flexWrap: "wrap", gap: 4, backgroundColor: colors.panel, borderRadius: radius.md, padding: 4, flexShrink: 1, minWidth: 0 },
  navItem: { paddingHorizontal: space.md, paddingVertical: 6, borderRadius: radius.sm },
  navOn: { backgroundColor: colors.goldSoft },
  navText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.muted },
  navTextOn: { color: colors.gold },
  banner: { backgroundColor: colors.dangerSoft, borderRadius: radius.md, padding: space.md },
  bannerText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.danger },
});
