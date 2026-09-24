import { useCallback, useState } from "react";
import { Link, useFocusEffect } from "expo-router";
import { StyleSheet, View } from "react-native";
import { AdminShell } from "@/components/AdminShell";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Body, Display, H3, Small } from "@/components/ui/Text";
import { counts } from "@/lib/admin";
import { ticketCounts } from "@/lib/support";
import { latestRun, type Run } from "@/lib/health";
import { HealthBadge } from "@/components/HealthMeter";
import { colors, space } from "@/theme/tokens";

export default function AdminHome() {
  const [c, setC] = useState<Awaited<ReturnType<typeof counts>> | null>(null);
  const [tc, setTc] = useState<{ open: number; pending: number } | null>(null);
  const [health, setHealth] = useState<Run | null | undefined>(undefined);
  useFocusEffect(
    useCallback(() => {
      counts().then(setC);
      ticketCounts().then(setTc).catch(() => setTc({ open: 0, pending: 0 }));
      latestRun().then(setHealth).catch(() => setHealth(null));
    }, []),
  );
  const tiles = [
    { n: c?.users, label: "Accounts", blurb: "Every parent, mentor and admin.", href: "/admin/users" as const },
    { n: c?.applications, label: "Mentor applications", blurb: "Waiting for approval.", href: "/admin/mentors" as const },
    { n: c?.needsAssignment, label: "Jobs needing a mentor", blurb: "Unassigned or waiting on a waitlist.", href: "/admin/jobs" as const },
    { n: c?.openAudits, label: "Open audits", blurb: "Quality Control Audits to resolve.", href: "/admin/audits" as const },
    { n: c?.owedPayouts, label: "Payouts owed", blurb: "Mentors waiting to be paid.", href: "/admin/ledger" as const },
    { n: c?.liveSessions, label: "Film Rooms upcoming", blurb: "Requested, scheduled, or live right now.", href: "/admin/sessions" as const },
    { n: c?.pendingReviews, label: "Reviews to moderate", blurb: "Ratings under 3 stars.", href: "/admin/audits" as const },
  ];
  return (
    <AdminShell title="Control center">
      <HealthBadge run={health} />
      <View style={s.grid}>
        {tiles.map((t) => (
          <Card key={t.label} style={[s.cell, (t.n ?? 0) > 0 && s.hot]}>
            <Display style={{ color: (t.n ?? 0) > 0 ? colors.gold : colors.faint }}>{c ? String(t.n) : "–"}</Display>
            <H3>{t.label}</H3>
            <Body style={{ color: colors.muted }}>{t.blurb}</Body>
            <Link href={t.href} asChild>
              <Button title="Open" variant="secondary" small />
            </Link>
          </Card>
        ))}
      </View>
      <Link href="/admin/support" asChild>
        <Card style={StyleSheet.flatten([s.support, (tc?.open ?? 0) > 0 && s.hot])}>
          <View style={s.supportRow}>
            <View style={{ flex: 1, minWidth: 220, gap: 4 }}>
              <H3>Support desk</H3>
              <Body style={{ color: colors.muted }}>support@firstlineperform.com, the in-app form, and the website all land here. Answer from the ticket; the reply goes out as email.</Body>
            </View>
            <View style={s.supportStats}>
              <View style={s.stat}><Display style={{ color: (tc?.open ?? 0) > 0 ? colors.gold : colors.faint }}>{tc ? String(tc.open) : "–"}</Display><Small>waiting on FLP</Small></View>
              <View style={s.stat}><Display style={{ color: colors.faint }}>{tc ? String(tc.pending) : "–"}</Display><Small>waiting on customer</Small></View>
            </View>
            <Button title="Open the desk" variant="secondary" small />
          </View>
        </Card>
      </Link>
    </AdminShell>
  );
}

const s = StyleSheet.create({
  support: { marginTop: space.sm },
  supportRow: { flexDirection: "row", flexWrap: "wrap", gap: space.lg, alignItems: "center" },
  supportStats: { flexDirection: "row", gap: space.lg },
  stat: { alignItems: "center", minWidth: 110 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.lg },
  cell: { flexGrow: 1, flexBasis: 240, maxWidth: 360 },
  hot: { borderColor: colors.goldDim },
});
