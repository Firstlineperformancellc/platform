import { useCallback, useMemo, useState } from "react";
import { useFocusEffect } from "expo-router";
import { StyleSheet, View } from "react-native";
import { AdminShell } from "@/components/AdminShell";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Choice } from "@/components/ui/Choice";
import { Pill } from "@/components/ui/Pill";
import { Body, H3, Label, Small } from "@/components/ui/Text";
import { holdPayout, listPayouts, mentorRevenue, payPayout, type AdminPayout, type MentorRevenue, payoutSchedule, runPayouts, type PayoutSchedule } from "@/lib/admin";
import { Loading } from "@/lib/auth";
import { money } from "@/lib/settings";
import { colors, space } from "@/theme/tokens";

// The accounting view Alex and Bryan asked for: what's owed, held, and paid, per mentor, with the
// action to pay. Stripe transfers when the mentor has onboarded; otherwise record a manual payment.
export default function AdminLedger() {
  const [rows, setRows] = useState<AdminPayout[] | null>(null);
  const [filter, setFilter] = useState("owed");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [schedule, setSchedule] = useState<PayoutSchedule | null>(null);
  const [runReport, setRunReport] = useState<string | null>(null);
  const [revenue, setRevenue] = useState<Record<string, MentorRevenue>>({}); // all-time, for "left on the table" beside each subtotal
  const load = useCallback(() => { listPayouts().then(setRows).catch((e) => setError(e.message)); payoutSchedule().then(setSchedule).catch(() => setSchedule(null)); mentorRevenue("all").then(setRevenue).catch(() => {}); }, []);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function run(id: string, fn: () => Promise<unknown>) {
    setBusy(id);
    setError(null);
    try {
      await fn();
      load();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(null);
  }

  const shown = (rows ?? []).filter((r) => (filter === "all" ? true : r.status === filter));
  const totals = useMemo(() => {
    const t = { owed: 0, held: 0, paid: 0 };
    for (const r of rows ?? []) if (r.status in t) t[r.status as keyof typeof t] += r.amount_cents;
    return t;
  }, [rows]);
  const byMentor = useMemo(() => {
    const m = new Map<string, { name: string; cents: number }>();
    for (const r of shown) {
      const cur = m.get(r.athlete_id) ?? { name: r.athletes?.display_name ?? "?", cents: 0 };
      cur.cents += r.amount_cents;
      m.set(r.athlete_id, cur);
    }
    return [...m.entries()].sort((a, b) => b[1].cents - a[1].cents);
  }, [shown]);

  return (
    <AdminShell title="Mentor payout ledger">
      {schedule ? (
        <Card>
          <View style={s.rowWrap}>
            <View style={{ flex: 1, minWidth: 240 }}>
              <Label>Payout schedule</Label>
              <Body>
                {schedule.mode === "scheduled"
                  ? `Every other Friday. Next run: ${schedule.nextRunAt ? new Date(schedule.nextRunAt).toLocaleString("en-US", { weekday: "long", month: "long", day: "numeric", hour: "numeric", timeZone: "America/New_York" }) + " Eastern" : "calculating…"}`
                  : schedule.mode === "auto" ? "Automatic: each payout goes out after the waiting period." : "Manual: press Pay via Stripe on each payout, or pay everything that is past the waiting period at once."}
              </Body>
              {schedule.lastRunAt ? <Small>Last run {new Date(schedule.lastRunAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" })} Eastern</Small> : null}
              {runReport ? <Small style={{ color: colors.ok }}>{runReport}</Small> : null}
            </View>
            <Button title="Pay everything past the waiting period now" variant="secondary" small disabled={!schedule.stripeConfigured} loading={busy === "run"} onPress={() => run("run", async () => { const r = await runPayouts(); setRunReport(`${r.paid} sent${r.failed ? `, ${r.failed} failed` : ""}${r.skipped ? `, ${r.skipped} waiting on onboarding or the problem window` : ""}.`); })} />
          </View>
        </Card>
      ) : null}
      <View style={s.totals}>
        <Card style={s.tile}>
          <Small>Owed</Small>
          <H3 style={{ color: colors.gold }}>{money(totals.owed)}</H3>
        </Card>
        <Card style={s.tile}>
          <Small>Held</Small>
          <H3 style={{ color: colors.warn }}>{money(totals.held)}</H3>
        </Card>
        <Card style={s.tile}>
          <Small>Paid</Small>
          <H3 style={{ color: colors.ok }}>{money(totals.paid)}</H3>
        </Card>
      </View>
      <Choice label="Show" options={[{ key: "owed", label: "Owed" }, { key: "held", label: "Held" }, { key: "paid", label: "Paid" }, { key: "voided", label: "Voided" }, { key: "all", label: "All" }]} value={filter} onChange={(v) => setFilter(v as string)} />
      {byMentor.length > 0 ? (
        <Card>
          <Small>By mentor, this view</Small>
          {byMentor.map(([id, { name, cents }]) => (
            <View key={id} style={s.line}>
              <Body>{name}</Body>
              <View style={s.subtotal}>
                <Body style={{ color: colors.gold }}>{money(cents)}</Body>
                {revenue[id] ? <Small style={{ color: colors.muted }}>left on the table {money(revenue[id].left_cents)}</Small> : null}
              </View>
            </View>
          ))}
        </Card>
      ) : null}
      {error ? <Body style={{ color: colors.danger }}>{error}</Body> : null}
      {!rows ? <Loading /> : shown.length === 0 ? <Body style={{ color: colors.muted }}>Nothing in this view.</Body> : null}
      {shown.map((r) => {
        const pl = r.jobs?.orders.players ?? r.sessions?.players ?? null;
        const player = pl ? `${pl.first_name} ${pl.last_name?.[0] ?? ""}.` : "";
        const stripeReady = Boolean(r.athletes?.stripe_account_id && r.athletes.payouts_enabled);
        return (
          <Card key={r.id}>
            <View style={s.head}>
              <View style={{ flex: 1, gap: 2 }}>
                <H3>
                  {r.athletes?.display_name ?? "?"} · {money(r.amount_cents)}
                </H3>
                <Small>
                  {r.presents_requests ? `Presents · ${r.presents_requests.recipient_name} · ${r.presents_requests.occasion}` : r.sessions ? `Film Room for ${player} · held ${r.sessions.scheduled_at ? new Date(r.sessions.scheduled_at).toLocaleDateString() : "–"}` : `Breakdown for ${player} · delivered ${r.jobs?.delivered_at ? new Date(r.jobs.delivered_at).toLocaleDateString() : "–"}`}{r.note ? ` · ${r.note}` : ""} · ledger {new Date(r.created_at).toLocaleDateString()}
                  {r.paid_at ? ` · paid ${new Date(r.paid_at).toLocaleDateString()}${r.stripe_transfer_id ? " via Stripe" : " manually"}` : ""}
                </Small>
                {r.held_reason ? <Small style={{ color: colors.warn }}>Held: {r.held_reason}</Small> : null}
                {r.error && r.status === "owed" ? <Small style={{ color: colors.danger }}>Last attempt did not go through: {r.error}</Small> : null}
                {r.note ? <Small>{r.note}</Small> : null}
              </View>
              <Pill tone={r.status === "paid" ? "ok" : r.status === "held" ? "warn" : r.status === "voided" ? "danger" : "gold"}>{r.status}</Pill>
            </View>
            {r.status === "owed" ? (
              <View style={s.row}>
                <Button title="Pay via Stripe" small disabled={!stripeReady} loading={busy === r.id} onPress={() => run(r.id, () => payPayout(r.id, "stripe"))} />
                <Button title="Mark paid manually" variant="secondary" small onPress={() => run(r.id, () => payPayout(r.id, "manual", "paid outside Stripe"))} />
                <Button title="Hold" variant="ghost" small onPress={() => run(r.id, () => holdPayout(r.id, true, "admin hold"))} />
                {!stripeReady ? <Small>Mentor hasn't finished Stripe onboarding.</Small> : null}
              </View>
            ) : r.status === "held" ? (
              <View style={s.row}>
                <Button title="Release" small onPress={() => run(r.id, () => holdPayout(r.id, false))} />
              </View>
            ) : null}
          </Card>
        );
      })}
    </AdminShell>
  );
}

const s = StyleSheet.create({
  rowWrap: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md, flexWrap: "wrap" },
  totals: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  tile: { flexGrow: 1, flexBasis: 160, gap: 2 },
  head: { flexDirection: "row", gap: space.md, alignItems: "flex-start" },
  row: { flexDirection: "row", gap: space.sm, flexWrap: "wrap", alignItems: "center" },
  line: { flexDirection: "row", justifyContent: "space-between", gap: space.md },
  subtotal: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", alignItems: "baseline", gap: space.sm },
});
