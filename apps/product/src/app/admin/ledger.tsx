import { useCallback, useMemo, useState } from "react";
import { useFocusEffect } from "expo-router";
import { StyleSheet, View } from "react-native";
import { AdminShell } from "@/components/AdminShell";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Choice } from "@/components/ui/Choice";
import { Pill } from "@/components/ui/Pill";
import { Body, H3, Small } from "@/components/ui/Text";
import { holdPayout, listPayouts, payPayout, type AdminPayout } from "@/lib/admin";
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

  const load = useCallback(() => listPayouts().then(setRows).catch((e) => setError(e.message)), []);
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
    const m = new Map<string, number>();
    for (const r of shown) m.set(r.athletes?.display_name ?? "?", (m.get(r.athletes?.display_name ?? "?") ?? 0) + r.amount_cents);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [shown]);

  return (
    <AdminShell title="Mentor payout ledger">
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
          {byMentor.map(([name, cents]) => (
            <View key={name} style={s.line}>
              <Body>{name}</Body>
              <Body style={{ color: colors.gold }}>{money(cents)}</Body>
            </View>
          ))}
        </Card>
      ) : null}
      {error ? <Body style={{ color: colors.danger }}>{error}</Body> : null}
      {!rows ? <Loading /> : shown.length === 0 ? <Body style={{ color: colors.muted }}>Nothing in this view.</Body> : null}
      {shown.map((r) => {
        const player = r.jobs?.orders.players ? `${r.jobs.orders.players.first_name} ${r.jobs.orders.players.last_name?.[0] ?? ""}.` : "";
        const stripeReady = Boolean(r.athletes?.stripe_account_id && r.athletes.payouts_enabled);
        return (
          <Card key={r.id}>
            <View style={s.head}>
              <View style={{ flex: 1, gap: 2 }}>
                <H3>
                  {r.athletes?.display_name ?? "?"} · {money(r.amount_cents)}
                </H3>
                <Small>
                  Breakdown for {player} · delivered {r.jobs?.delivered_at ? new Date(r.jobs.delivered_at).toLocaleDateString() : "–"} · ledger {new Date(r.created_at).toLocaleDateString()}
                  {r.paid_at ? ` · paid ${new Date(r.paid_at).toLocaleDateString()}${r.stripe_transfer_id ? " via Stripe" : " manually"}` : ""}
                </Small>
                {r.held_reason ? <Small style={{ color: colors.warn }}>Held: {r.held_reason}</Small> : null}
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
  totals: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  tile: { flexGrow: 1, flexBasis: 160, gap: 2 },
  head: { flexDirection: "row", gap: space.md, alignItems: "flex-start" },
  row: { flexDirection: "row", gap: space.sm, flexWrap: "wrap", alignItems: "center" },
  line: { flexDirection: "row", justifyContent: "space-between" },
});
