import { useCallback, useState } from "react";
import { Link, useFocusEffect } from "expo-router";
import { StyleSheet, View } from "react-native";
import { Brand } from "@/components/Brand";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { Screen } from "@/components/ui/Screen";
import { Body, H1, H3, Label, Small } from "@/components/ui/Text";
import { Loading, RequireRole } from "@/lib/auth";
import { FORMAT_LABEL, listMyPacks, listSessions, playerName, STATUS_LABEL, whenLabel, type Pack, type Session } from "@/lib/sessions";
import { colors, space } from "@/theme/tokens";

export default function ParentSessions() {
  return (
    <RequireRole role="parent">
      <Inner />
    </RequireRole>
  );
}

function Inner() {
  const [rows, setRows] = useState<Session[] | null>(null);
  const [packs, setPacks] = useState<Pack[]>([]);
  useFocusEffect(
    useCallback(() => {
      listSessions().then(setRows);
      listMyPacks().then(setPacks);
    }, []),
  );
  if (!rows) return <Loading />;
  const upcoming = rows.filter((r) => ["requested", "scheduled", "in_progress"].includes(r.status)).sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  const past = rows.filter((r) => !["requested", "scheduled", "in_progress"].includes(r.status));
  return (
    <Screen title="Film Room sessions" width="content">
      <View style={s.topbar}>
        <Link href="/parent" asChild>
          <Brand size={44} />
        </Link>
        <Link href="/mentors" asChild>
          <Button title="Book a Film Room" small />
        </Link>
      </View>
      <View>
        <Label>Parent account</Label>
        <H1>Film Room sessions</H1>
      </View>
      {packs.map((p) => (
        <Card key={p.id}>
          <View style={s.row}>
            <H3>Season Arc with {p.athletes?.display_name ?? "your mentor"}</H3>
            <Pill tone={p.sessions_used < p.sessions_total ? "gold" : "muted"}>{`${p.sessions_total - p.sessions_used} of ${p.sessions_total} left`}</Pill>
          </View>
          <Small>Use them by {new Date(p.expires_at).toLocaleDateString()}.</Small>
          {p.athletes && p.sessions_used < p.sessions_total ? (
            <Link href={{ pathname: "/mentors/[slug]", params: { slug: p.athletes.slug } }} asChild>
              <Button title="Book the next one" variant="secondary" small />
            </Link>
          ) : null}
        </Card>
      ))}
      {upcoming.length === 0 && past.length === 0 ? (
        <Card>
          <Body style={{ color: colors.muted }}>No Film Rooms yet. Pick a mentor and book a time from their profile.</Body>
        </Card>
      ) : null}
      {upcoming.map((r) => (
        <Row key={r.id} r={r} />
      ))}
      {past.length ? <H3>Past</H3> : null}
      {past.map((r) => (
        <Row key={r.id} r={r} />
      ))}
    </Screen>
  );
}

function Row({ r }: { r: Session }) {
  const tone = r.status === "scheduled" || r.status === "in_progress" ? "gold" : r.status === "completed" ? "ok" : r.status === "requested" ? "warn" : "muted";
  return (
    <Link href={{ pathname: "/parent/sessions/[id]", params: { id: r.id } }} asChild>
      <Card>
        <View style={s.row}>
          <H3>
            {playerName(r)} with {r.athletes?.display_name ?? "mentor"}
          </H3>
          <Pill tone={tone}>{STATUS_LABEL[r.status]}</Pill>
        </View>
        <Small>
          {whenLabel(r.scheduled_at)} · {FORMAT_LABEL[r.format]}
          {r.status === "completed" && !r.rating ? " · rate it" : ""}
        </Small>
      </Card>
    </Link>
  );
}

const s = StyleSheet.create({
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, flexWrap: "wrap", justifyContent: "space-between" },
});
