import { useCallback, useEffect, useState } from "react";
import { Link, useFocusEffect } from "expo-router";
import { StyleSheet, View } from "react-native";
import { Brand } from "@/components/Brand";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Choice } from "@/components/ui/Choice";
import { Pill } from "@/components/ui/Pill";
import { Screen } from "@/components/ui/Screen";
import { Body, Display, H1, H3, Label, Small } from "@/components/ui/Text";
import { Loading, useAuth } from "@/lib/auth";
import { myRevenue, type MentorRevenue, type RevenueDays } from "@/lib/mentorProfile";
import { money } from "@/lib/settings";
import { supabase } from "@/lib/supabase";
import { colors, space } from "@/theme/tokens";

type Row = {
  presents_request_id?: string | null;
  id: string; status: "owed" | "held" | "paid" | "voided" | "failed"; amount_cents: number; created_at: string; paid_at: string | null; held_reason: string | null;
  jobs: { delivered_at: string | null } | null; sessions: { scheduled_at: string | null; duration_minutes: number | null } | null;
};
const LABEL = { owed: "On its way", held: "On hold", paid: "Paid", voided: "Cancelled", failed: "Failed" } as const;
const TONE = { owed: "gold", held: "warn", paid: "ok", voided: "muted", failed: "danger" } as const;
const day = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "");

// A mentor's money: what has been paid, what is on its way, and every job or session behind it.
export default function Earnings() {
  const { session } = useAuth();
  const [rows, setRows] = useState<Row[] | null>(null);
  useFocusEffect(useCallback(() => {
    if (!session) return;
    supabase.from("payouts").select("id, status, amount_cents, created_at, paid_at, held_reason, presents_request_id, jobs(delivered_at), sessions(scheduled_at, duration_minutes)").eq("athlete_id", session.user.id).order("created_at", { ascending: false }).limit(300)
      .then(({ data }) => setRows((data ?? []) as unknown as Row[]));
  }, [session]));
  // Your numbers (U-15): earned, paid, owed, and what was left on the table, fetched once per window.
  const [days, setDays] = useState<RevenueDays>(90);
  const [rev, setRev] = useState<MentorRevenue | null>(null);
  useEffect(() => {
    if (!session) return;
    let live = true;
    setRev(null);
    myRevenue(days).then((r) => { if (live) setRev(r); }).catch(() => {});
    return () => { live = false; };
  }, [session, days]);
  if (!rows) return <Loading />;
  const sum = (st: Row["status"]) => rows.filter((r) => r.status === st).reduce((n, r) => n + r.amount_cents, 0);
  return (
    <Screen title="Earnings" width="content">
      <View style={s.topbar}>
        <Link href="/athlete" asChild><Brand size={44} /></Link>
        <Link href="/athlete" asChild><Button title="Dashboard" variant="ghost" small /></Link>
      </View>
      <View>
        <Label>FLP Mentor</Label>
        <H1>Earnings</H1>
      </View>
      <View style={s.grid}>
        <Card style={s.cell}><Display style={{ color: colors.gold }}>{money(sum("paid"))}</Display><H3>Paid</H3><Small>Sent to your bank through Stripe.</Small></Card>
        <Card style={s.cell}><Display style={{ color: colors.ink }}>{money(sum("owed"))}</Display><H3>On its way</H3><Small>Earned and waiting to be sent.</Small></Card>
        {sum("held") > 0 ? <Card style={s.cell}><Display style={{ color: colors.warn }}>{money(sum("held"))}</Display><H3>On hold</H3><Small>Held while FLP looks into something.</Small></Card> : null}
      </View>
      <Card>
        <H3>Your numbers</H3>
        <Choice label="Since" options={[{ key: "90", label: "Last 90 days" }, { key: "all", label: "All time" }]} value={String(days)} onChange={(v) => setDays(v === "all" ? "all" : 90)} />
        <View style={s.grid}>
          <Num k="Earned" v={rev ? money(rev.earned_cents) : "–"} />
          <Num k="Paid out" v={rev ? money(rev.paid_cents) : "–"} />
          <Num k="Owed" v={rev ? money(rev.owed_cents) : "–"} />
          <Num k="Left on the table" v={rev ? money(rev.left_cents) : "–"} color={colors.warn} note="Offers you declined or let expire. Each one was yours to take." />
        </View>
      </Card>
      <Card>
        <H3>Every payout</H3>
        {rows.length === 0 ? <Body style={{ color: colors.muted }}>Nothing yet. Your share appears here the moment you deliver a breakdown, finish a Film Room or send a First Line Presents video.</Body> : null}
        {rows.map((r) => (
          <View key={r.id} style={s.line}>
            <View style={{ flex: 1, minWidth: 180 }}>
              <Body>{r.presents_request_id ? "First Line Presents video" : r.sessions ? `Film Room${r.sessions.duration_minutes ? ` · ${r.sessions.duration_minutes} min` : ""}` : "Breakdown"}</Body>
              <Small>{r.sessions ? day(r.sessions.scheduled_at) : `delivered ${day(r.jobs?.delivered_at ?? r.created_at)}`}{r.paid_at ? ` · paid ${day(r.paid_at)}` : ""}{r.status === "held" && r.held_reason ? ` · ${r.held_reason}` : ""}</Small>
            </View>
            <Body style={{ color: r.status === "voided" ? colors.faint : colors.ink }}>{money(r.amount_cents)}</Body>
            <Pill tone={TONE[r.status] ?? "muted"}>{LABEL[r.status] ?? r.status}</Pill>
          </View>
        ))}
      </Card>
      <Small>Deposits, bank details and tax forms live in your Stripe dashboard, which opens from My profile.</Small>
    </Screen>
  );
}

function Num({ k, v, color, note }: { k: string; v: string; color?: string; note?: string }) {
  return (
    <View style={s.num}>
      <Small>{k}</Small>
      <H3 style={{ color: color ?? colors.ink }}>{v}</H3>
      {note ? <Small style={{ color: colors.muted }}>{note}</Small> : null}
    </View>
  );
}

const s = StyleSheet.create({
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  num: { flexGrow: 1, flexBasis: 150, gap: 2 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  cell: { flexGrow: 1, flexBasis: 200, gap: 2 },
  line: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.md, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.line },
});
