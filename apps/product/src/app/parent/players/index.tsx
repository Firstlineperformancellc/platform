import { useCallback, useState } from "react";
import { Link, useFocusEffect } from "expo-router";
import { StyleSheet, View } from "react-native";
import { Brand } from "@/components/Brand";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { Screen } from "@/components/ui/Screen";
import { Body, H1, H3, Label, Small } from "@/components/ui/Text";
import { Loading } from "@/lib/auth";
import { listPlayers, playerName, type Player } from "@/lib/players";
import { colors, space } from "@/theme/tokens";

export default function Players() {
  const [players, setPlayers] = useState<Player[] | null>(null);
  useFocusEffect(
    useCallback(() => {
      listPlayers().then(setPlayers);
    }, []),
  );

  return (
    <Screen title="Your youth athletes" width="page">
      <View style={s.topbar}>
        <Brand size={44} />
        <Link href="/parent" asChild>
          <Button title="Dashboard" variant="ghost" small />
        </Link>
      </View>
      <View style={s.headrow}>
        <View>
          <Label>Parent / Guardian</Label>
          <H1>Your youth athletes</H1>
        </View>
        <Link href="/parent/players/new" asChild>
          <Button title="Add a youth athlete" />
        </Link>
      </View>
      {players === null ? (
        <Loading />
      ) : players.length === 0 ? (
        <Card>
          <H3>No youth athletes yet</H3>
          <Body style={{ color: colors.muted }}>
            Add your player once. Every breakdown and Film Room session you order is filed under them, and their
            Development Log grows from the first order on.
          </Body>
        </Card>
      ) : (
        <View style={s.grid}>
          {players.map((p) => (
            <Card key={p.id} style={s.cell}>
              <View style={s.row}>
                <H3>{playerName(p)}</H3>
                <Pill tone="gold">{p.age_group}</Pill>
              </View>
              <Small>
                {p.position[0].toUpperCase() + p.position.slice(1)} · {p.skill_level}
                {p.current_team ? ` · ${p.current_team}` : ""}
              </Small>
              <View style={s.row}>
                <Link href={{ pathname: "/parent/order", params: { player: p.id } }} asChild>
                  <Button title="Order a breakdown" small />
                </Link>
                <Link href={{ pathname: "/parent/players/[id]/log", params: { id: p.id } }} asChild>
                  <Button title="Development Log" variant="secondary" small />
                </Link>
                <Link href={{ pathname: "/parent/players/[id]", params: { id: p.id } }} asChild>
                  <Button title="Edit" variant="ghost" small />
                </Link>
              </View>
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headrow: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: space.md },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.lg },
  cell: { flexGrow: 1, flexBasis: 300, maxWidth: 420 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md, flexWrap: "wrap" },
});
