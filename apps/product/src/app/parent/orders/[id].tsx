import { useCallback, useState } from "react";
import { Link, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Platform, StyleSheet, View } from "react-native";
import { Brand } from "@/components/Brand";
import { BreakdownPanel } from "@/components/BreakdownPanel";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { Screen } from "@/components/ui/Screen";
import { Body, H1, H3, Label, Small } from "@/components/ui/Text";
import { Loading } from "@/lib/auth";
import { getOrder, orderJob, statusLabel, type Order } from "@/lib/orders";
import { playerName } from "@/lib/players";
import { money, TIER_LABEL, useSettings } from "@/lib/settings";
import { colors, radius, space } from "@/theme/tokens";

export default function OrderPage() {
  const { id, paid } = useLocalSearchParams<{ id: string; paid?: string }>();
  const { settings } = useSettings();
  const [order, setOrder] = useState<Order | null | undefined>(undefined);

  useFocusEffect(
    useCallback(() => {
      if (id) getOrder(id).then(setOrder);
    }, [id]),
  );

  if (order === undefined || !settings) return <Loading />;
  if (!order)
    return (
      <Screen width="form" center>
        <H1 center>Order not found</H1>
        <Link href="/parent" asChild>
          <Button title="Dashboard" variant="secondary" />
        </Link>
      </Screen>
    );

  const hasFilm = Boolean(order.film_media_id || order.film_youtube_url);
  const filmReady = order.media?.status === "ready";
  const job = orderJob(order);
  const tone = order.status === "delivered" ? "ok" : order.status === "unassigned" ? "warn" : order.status === "refunded" ? "danger" : "gold";

  return (
    <Screen width="content">
      <View style={s.topbar}>
        <Brand size={44} />
        <Link href="/parent" asChild>
          <Button title="Dashboard" variant="ghost" small />
        </Link>
      </View>
      <View>
        <Label>Breakdown · {order.players ? playerName(order.players) : ""}</Label>
        <H1>{statusLabel(order)}</H1>
        <View style={s.row}>
          <Pill tone={tone}>{order.status.replace("_", " ")}</Pill>
          <Small>
            {TIER_LABEL[order.tier]} mentor · {money(order.price_cents)} · {order.position} · {order.age_group} · {order.skill_level}
          </Small>
        </View>
      </View>

      {paid && !hasFilm ? <Body style={{ color: colors.ok }}>Payment received. One more step: upload the game film.</Body> : null}

      {!hasFilm ? (
        <Card>
          <H3>Upload the game film</H3>
          <Body style={{ color: colors.muted }}>
            Full games are fine, the bigger the better. The upload resumes on its own if your connection drops. Your mentor gets it
            the moment it's processed.
          </Body>
          <Link href={{ pathname: "/parent/upload", params: { order: order.id } }} asChild>
            <Button title="Upload film" />
          </Link>
        </Card>
      ) : (
        <Card>
          <View style={s.row}>
            <H3>Game film</H3>
            {order.film_youtube_url ? <Pill tone="gold">YouTube</Pill> : filmReady ? <Pill tone="ok">Ready</Pill> : <Pill tone="warn">Processing</Pill>}
          </View>
          {filmReady && order.media?.mux_playback_id && Platform.OS === "web" ? (
            <iframe
              src={`https://player.mux.com/${order.media.mux_playback_id}?primary-color=%23d4a32c&accent-color=%23000000`}
              style={{ border: 0, width: "100%", aspectRatio: "16 / 9", borderRadius: radius.md }}
              allow="fullscreen"
              allowFullScreen
              title="Game film"
            />
          ) : null}
        </Card>
      )}

      {job && ["delivered", "closed"].includes(order.status) ? <BreakdownPanel jobId={job.id} /> : null}

      <Card>
        <H3>Where it stands</H3>
        <Timeline order={order} />
        {order.waitlisted_at && order.status === "paid" ? (
          <Small>
            Holding your spot with your first choice for {order.wait_days} day{order.wait_days === 1 ? "" : "s"}. If they don't free up,
            it goes to your second choice.
          </Small>
        ) : null}
        {job?.due_at && order.status === "accepted" ? <Small>Due {new Date(job.due_at).toLocaleString()}</Small> : null}
      </Card>

      <Card>
        <H3>What you asked for</H3>
        <Body>{order.focus_areas.join(", ")}</Body>
        {order.notes ? <Body style={{ color: colors.muted }}>{order.notes}</Body> : null}
      </Card>
    </Screen>
  );
}

function Timeline({ order }: { order: Order }) {
  const hasFilm = Boolean(order.film_media_id || order.film_youtube_url);
  const steps = [
    { label: "Paid", done: Boolean(order.paid_at) },
    { label: "Film uploaded", done: hasFilm },
    { label: order.waitlisted_at && order.status === "paid" ? "Waiting for your mentor" : "Mentor offered", done: ["offered", "accepted", "delivered", "closed"].includes(order.status) },
    { label: "Accepted, in progress", done: ["accepted", "delivered", "closed"].includes(order.status) },
    { label: "Breakdown delivered", done: ["delivered", "closed"].includes(order.status) },
  ];
  return (
    <View style={{ gap: space.sm }}>
      {steps.map((st) => (
        <View key={st.label} style={s.step}>
          <View style={[s.dot, st.done && s.dotOn]} />
          <Body style={{ color: st.done ? colors.white : colors.faint }}>{st.label}</Body>
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, flexWrap: "wrap", marginTop: space.sm },
  step: { flexDirection: "row", alignItems: "center", gap: space.md },
  dot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: colors.line2 },
  dotOn: { backgroundColor: colors.gold, borderColor: colors.gold },
});
