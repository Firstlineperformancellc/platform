import { Platform, StyleSheet, View } from "react-native";
import { AdminShell } from "@/components/AdminShell";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Body, H3, Small } from "@/components/ui/Text";
import { ADMIN_MANUAL, MANUAL, manualUrl, openAdminManual, openManual } from "@/lib/legal";
import { colors, space } from "@/theme/tokens";

const SECTIONS = [
  "How the platform fits together",
  "Your first day: signing in, the Control center, admin seats",
  "Users: every account, suspend, delete, contact",
  "Mentors: applications, approval, tiers, deletion and restore",
  "Levels & tiles: the marketplace control center",
  "Orders & jobs: the breakdown pipeline and refunds",
  "Film Room: sessions, no-shows, recordings",
  "Audits and reviews",
  "The payout ledger and Stripe",
  "Support desk",
  "Settings: every rule explained",
  "Service health",
  "Emails the platform sends",
  "Quick reference and glossary",
];

// The admin manual lives here as a tab so it is one click from any admin page; the PDF itself is
// served with the app and opens in its own tab (and, on the web, reads inline below).
export default function AdminManual() {
  const inline = Platform.OS === "web";
  return (
    <AdminShell title="Admin User Manual">
      <Card style={{ borderColor: colors.goldDim }}>
        <View style={s.row}>
          <View style={{ flex: 1, minWidth: 240, gap: 4 }}>
            <H3>{ADMIN_MANUAL.title}</H3>
            <Body style={{ color: colors.muted }}>How to run First Line Performance from this control panel. Searchable PDF with bookmarks; press Ctrl+F or ⌘F inside it to find anything.</Body>
          </View>
          <View style={{ gap: space.sm }}>
            <Button title="Open in a new tab" small onPress={openAdminManual} />
            <Button title={MANUAL.title} variant="ghost" small onPress={openManual} />
          </View>
        </View>
      </Card>
      {inline ? <PdfFrame src={manualUrl("admin")} /> : null}
      <Card>
        <H3>What's inside</H3>
        {SECTIONS.map((t, i) => (
          <Small key={t}>{String(i + 1).padStart(2, "0")}  {t}</Small>
        ))}
      </Card>
    </AdminShell>
  );
}

// Web only: the browser's own PDF viewer in the page. Rendered through the DOM, outside React Native's view tree.
function PdfFrame({ src }: { src: string }) {
  if (Platform.OS !== "web") return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { unstable_createElement } = require("react-native-web") as { unstable_createElement: (type: string, props: Record<string, unknown>) => React.ReactElement };
  return unstable_createElement("iframe", { src, title: "Admin User Manual", style: { width: "100%", height: "80vh", border: `1px solid ${colors.line}`, borderRadius: 8, background: "#111" } });
}

const s = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.md },
});
