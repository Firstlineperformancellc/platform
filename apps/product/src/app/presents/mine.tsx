import { useEffect, useState } from "react";
import { Link } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import { Brand } from "@/components/Brand";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { Screen } from "@/components/ui/Screen";
import { Body, H1, H3, Label, Small } from "@/components/ui/Text";
import { Loading, useAuth } from "@/lib/auth";
import { money, myRequests, PRESENTS_NAME, STATUS_LABEL, type BuyerRequest, type RequestStatus } from "@/lib/presents";
import { colors, radius, space } from "@/theme/tokens";

// A signed-in buyer's First Line Presents requests. Guests have their private link instead.
export default function MyPresents() {
  const { session, profile, loading } = useAuth();
  const [rows, setRows] = useState<BuyerRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    myRequests()
      .then(setRows)
      .catch((e) => {
        setRows([]);
        setError((e as Error).message);
      });
  }, [session]);

  if (loading) return <Loading />;
  if (!session)
    return (
      <Screen title={`My videos · ${PRESENTS_NAME}`} width="form" center>
        <Label center>{PRESENTS_NAME}</Label>
        <H1 center>Your videos</H1>
        <Body center style={{ color: colors.muted }}>
          Videos bought while signed in are listed here. If you bought one without an account, the private link in your email opens it.
        </Body>
        <View style={s.stack}>
          <Link href="/sign-in" asChild>
            <Button title="Sign in" variant="secondary" />
          </Link>
          <Link href="/presents" asChild>
            <Button title="Browse athletes" variant="ghost" />
          </Link>
        </View>
      </Screen>
    );

  const home = profile?.role === "athlete" ? "/athlete" : profile?.role === "admin" ? "/admin" : "/parent";

  return (
    <Screen title={`My videos · ${PRESENTS_NAME}`} width="content">
      <View style={s.topbar}>
        <Link href="/" asChild>
          <Brand size={44} />
        </Link>
        <View style={s.actions}>
          <Link href="/presents" asChild>
            <Button title="Browse athletes" variant="ghost" small />
          </Link>
          <Link href={home} asChild>
            <Button title="Dashboard" variant="ghost" small />
          </Link>
        </View>
      </View>
      <View>
        <Label>{PRESENTS_NAME}</Label>
        <H1>Your videos</H1>
        <Body style={{ color: colors.muted }}>Every video you've requested from an FLP athlete, newest first. Open one to watch, download or share its private link.</Body>
      </View>
      {error ? <Body style={{ color: colors.danger }}>{error}</Body> : null}
      {!rows ? (
        <Loading />
      ) : rows.length === 0 ? (
        !error ? (
          <Card>
            <Body style={{ color: colors.muted }}>Nothing yet. When you request a video, it shows up here.</Body>
            <Link href="/presents" asChild>
              <Button title="Browse athletes" variant="secondary" small />
            </Link>
          </Card>
        ) : null
      ) : (
        rows.map((r) => (
          <Link key={r.id} href={{ pathname: "/presents/view", params: { r: r.id, ...(r.token ? { t: r.token } : {}) } }} asChild>
            <Pressable accessibilityRole="link" accessibilityLabel={`Video for ${r.recipient_name} from ${r.athlete?.display_name ?? "an FLP athlete"}, ${STATUS_LABEL[r.status]}`} style={s.press}>
              <Card style={s.card}>
                <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
                  <H3>For {r.recipient_name}</H3>
                  <Small>
                    {r.occasion} · {r.athlete?.display_name ?? "FLP athlete"} · {money(r.price_cents)} · {new Date(r.created_at).toLocaleDateString()}
                  </Small>
                </View>
                <Pill tone={tone(r.status)}>{STATUS_LABEL[r.status]}</Pill>
              </Card>
            </Pressable>
          </Link>
        ))
      )}
    </Screen>
  );
}

function tone(status: RequestStatus): "ok" | "gold" | "warn" | "muted" {
  if (status === "delivered") return "ok";
  if (status === "open" || status === "draft") return "gold";
  if (status === "flagged" || status === "in_review") return "warn";
  return "muted";
}

const s = StyleSheet.create({
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  actions: { flexDirection: "row", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" },
  stack: { alignItems: "center", gap: space.sm },
  press: { borderRadius: radius.lg },
  card: { flexDirection: "row", alignItems: "center", gap: space.md, flexWrap: "wrap", paddingVertical: space.lg },
});
