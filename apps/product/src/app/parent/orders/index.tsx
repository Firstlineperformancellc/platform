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
import { listOrders, orderJob, statusLabel, type Order } from "@/lib/orders";
import { playerName } from "@/lib/players";
import { money, TIER_LABEL } from "@/lib/settings";
import { colors, space } from "@/theme/tokens";

export default function Orders() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  useFocusEffect(
    useCallback(() => {
      listOrders().then(setOrders);
    }, []),
  );
  return (
    <Screen width="page" title="Your breakdowns">
      <View style={s.topbar}>
        <Brand size={44} />
        <Link href="/parent" asChild>
          <Button title="Dashboard" variant="ghost" small />
        </Link>
      </View>
      <View style={s.headrow}>
        <View>
          <Label>Parent / Guardian</Label>
          <H1>Your breakdowns</H1>
        </View>
        <Link href="/parent/order" asChild>
          <Button title="Order a breakdown" />
        </Link>
      </View>
      {orders === null ? (
        <Loading />
      ) : orders.length === 0 ? (
        <Card>
          <H3>No breakdowns yet</H3>
          <Body style={{ color: colors.muted }}>Pick an FLP Mentor, upload a game, and the first one lands here.</Body>
        </Card>
      ) : (
        orders.map((o) => {
          const job = orderJob(o);
          const tone = o.status === "delivered" || o.status === "closed" ? "ok" : o.status === "unassigned" ? "warn" : o.status === "refunded" ? "danger" : "gold";
          return (
            <Card key={o.id}>
              <View style={s.row}>
                <View style={{ flex: 1, gap: 2 }}>
                  <H3>
                    {o.players ? playerName(o.players) : "Youth athlete"} · {o.age_group} {o.position}
                  </H3>
                  <Small>
                    {TIER_LABEL[o.tier]} mentor · {money(o.price_cents)} · ordered {new Date(o.created_at).toLocaleDateString()}
                    {job?.due_at && o.status === "accepted" ? ` · due ${new Date(job.due_at).toLocaleString()}` : ""}
                  </Small>
                </View>
                <Pill tone={tone}>{statusLabel(o)}</Pill>
              </View>
              <View style={s.row}>
                <Link href={{ pathname: "/parent/orders/[id]", params: { id: o.id } }} asChild>
                  <Button title={o.status === "delivered" || o.status === "closed" ? "Watch the breakdown" : "Open"} variant="secondary" small />
                </Link>
                {!o.film_media_id && !o.film_youtube_url && ["paid", "offered", "accepted", "unassigned"].includes(o.status) ? (
                  <Link href={{ pathname: "/parent/upload", params: { order: o.id } }} asChild>
                    <Button title="Upload film" small />
                  </Link>
                ) : null}
              </View>
            </Card>
          );
        })
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headrow: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: space.md },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md, flexWrap: "wrap" },
});
