import { Link, usePathname } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { AdminShell } from "./AdminShell";
import { colors, fonts, radius, space } from "@/theme/tokens";

const NAV = [
  { href: "/admin/support", label: "Queue" },
  { href: "/admin/support/canned", label: "Canned replies" },
  { href: "/admin/support/setup", label: "Mail setup" },
] as const;

// The support desk lives inside admin with its own second-level navigation.
export function SupportShell({ title, children }: { title: string; children: React.ReactNode }) {
  const path = usePathname();
  return (
    <AdminShell title={title}>
      <View style={s.sub}>
        {NAV.map((n) => {
          const on = n.href === "/admin/support" ? path === "/admin/support" || /^\/admin\/support\/[0-9a-f-]{36}/.test(path) : path.startsWith(n.href);
          return (
            <Link key={n.href} href={n.href} style={[s.item, on && s.on]}>
              <Text style={[s.text, on && s.textOn]}>{n.label}</Text>
            </Link>
          );
        })}
        <Text style={s.addr}>support@firstlineperform.com</Text>
      </View>
      {children}
    </AdminShell>
  );
}

const s = StyleSheet.create({
  sub: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.sm, borderBottomWidth: 1, borderBottomColor: colors.line, paddingBottom: space.sm },
  item: { paddingHorizontal: space.md, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line2 },
  on: { borderColor: colors.gold, backgroundColor: colors.goldSoft },
  text: { fontFamily: fonts.semibold, fontSize: 14, color: colors.muted },
  textOn: { color: colors.gold },
  addr: { marginLeft: "auto", fontFamily: fonts.medium, fontSize: 13, color: colors.faint },
});
