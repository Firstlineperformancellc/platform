import { useEffect, useState } from "react";
import { Link, useLocalSearchParams } from "expo-router";
import { StyleSheet, View } from "react-native";
import { Brand } from "@/components/Brand";
import { WorksheetView } from "@/components/WorksheetView";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { Screen } from "@/components/ui/Screen";
import { Body, H1, H3, Label, Small } from "@/components/ui/Text";
import { Loading } from "@/lib/auth";
import type { Worksheet } from "@/lib/breakdowns";
import { getPlayer, playerName, type Player } from "@/lib/players";
import { supabase } from "@/lib/supabase";
import { colors, space } from "@/theme/tokens";

type Entry = {
  kind: "breakdown" | "session";
  occurred_at: string;
  mentor_id: string;
  breakdown_id: string | null;
  session_id: string | null;
  detail: Worksheet | { takeaways?: string[]; drills?: string[]; next_step?: string } | null;
  rating: number | null;
};

// The Development Log: every breakdown and Film Room recap for one youth athlete, oldest first,
// so a parent (or the next coach) can read the arc from the first order on.
export default function DevelopmentLog() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [player, setPlayer] = useState<Player | null | undefined>(undefined);
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [mentors, setMentors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!id) return;
    getPlayer(id).then(setPlayer);
    supabase
      .from("development_log")
      .select("kind, occurred_at, mentor_id, breakdown_id, session_id, detail, rating")
      .eq("player_id", id)
      .order("occurred_at", { ascending: true })
      .then(async ({ data }) => {
        const rows = (data ?? []) as Entry[];
        setEntries(rows);
        const ids = [...new Set(rows.map((r) => r.mentor_id).filter(Boolean))];
        if (ids.length) {
          const { data: ms } = await supabase.from("athletes").select("user_id, display_name").in("user_id", ids);
          setMentors(Object.fromEntries((ms ?? []).map((m) => [m.user_id, m.display_name])));
        }
      });
  }, [id]);

  if (player === undefined || entries === null) return <Loading />;
  if (!player)
    return (
      <Screen width="form" center>
        <H1 center>Youth athlete not found</H1>
      </Screen>
    );

  return (
    <Screen width="content" title={`${playerName(player)} · Development Log`}>
      <View style={s.topbar}>
        <Brand size={44} />
        <Link href="/parent/players" asChild>
          <Button title="Youth athletes" variant="ghost" small />
        </Link>
      </View>
      <View>
        <Label>Development Log</Label>
        <H1>{playerName(player)}</H1>
        <Small>
          {player.age_group} · {player.position} · {player.skill_level}
          {player.current_team ? ` · ${player.current_team}` : ""}
        </Small>
      </View>
      {entries.length === 0 ? (
        <Card>
          <H3>Nothing logged yet</H3>
          <Body style={{ color: colors.muted }}>Every delivered breakdown and Film Room recap lands here, in order, so you can see the arc.</Body>
          <Link href={{ pathname: "/parent/order", params: { player: player.id } }} asChild>
            <Button title="Order the first breakdown" />
          </Link>
        </Card>
      ) : (
        entries.map((e, i) => (
          <Card key={`${e.kind}-${e.breakdown_id ?? e.session_id ?? i}`}>
            <View style={s.row}>
              <View style={{ flex: 1, gap: 2 }}>
                <H3>{e.kind === "breakdown" ? "Breakdown" : "Film Room session"}</H3>
                <Small>
                  {new Date(e.occurred_at).toLocaleDateString()} · {mentors[e.mentor_id] ?? "FLP Mentor"}
                </Small>
              </View>
              {e.rating ? <Pill tone="gold">{`${e.rating}★`}</Pill> : null}
            </View>
            {e.kind === "breakdown" && e.detail && "clips" in e.detail ? <WorksheetView w={e.detail as Worksheet} /> : null}
            {e.kind === "session" && e.detail && "takeaways" in e.detail ? (
              <View style={{ gap: 4 }}>
                {(e.detail.takeaways ?? []).map((t, j) => (
                  <Body key={j}>• {t}</Body>
                ))}
                {e.detail.next_step ? <Body style={{ color: colors.gold }}>Next: {e.detail.next_step}</Body> : null}
              </View>
            ) : null}
          </Card>
        ))
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md, flexWrap: "wrap" },
});
