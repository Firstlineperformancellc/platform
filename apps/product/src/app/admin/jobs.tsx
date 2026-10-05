import { useCallback, useState } from "react";
import { TextField } from "@/components/ui/TextField";
import { useFocusEffect } from "expo-router";
import { StyleSheet, View } from "react-native";
import { AdminShell } from "@/components/AdminShell";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Choice } from "@/components/ui/Choice";
import { Pill } from "@/components/ui/Pill";
import { Body, H3, Small } from "@/components/ui/Text";
import { assignJob, extendJob, listJobs, refundOrder, type AdminJob } from "@/lib/admin";
import { Loading } from "@/lib/auth";
import { listMentors, type MarketplaceMentor } from "@/lib/mentors";
import { money, TIER_LABEL, type Tier } from "@/lib/settings";
import { colors, space } from "@/theme/tokens";

const who = (o: AdminJob["orders"]) => (o?.players ? `${o.players.first_name}${o.players.last_name ? ` ${o.players.last_name[0]}.` : ""}` : "Youth athlete");
const left = (iso: string | null) => (iso ? Math.round((new Date(iso).getTime() - Date.now()) / 3600000) : null);

// The metered view Alex asked for: every job, who has it, how long they've had it, what's late.
export default function AdminJobs() {
  const [jobs, setJobs] = useState<AdminJob[] | null>(null);
  const [mentors, setMentors] = useState<MarketplaceMentor[]>([]);
  const [filter, setFilter] = useState("attention");
  const [assign, setAssign] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refundFor, setRefundFor] = useState<string | null>(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(() => {
    listJobs().then(setJobs).catch((e) => setError(e.message));
    listMentors().then(setMentors);
  }, []);
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

  const shown = (jobs ?? []).filter((j) => {
    if (filter === "attention") return ["unassigned", "waiting", "offered"].includes(j.status) || (j.status === "accepted" && (left(j.due_at) ?? 99) < 24);
    if (filter === "active") return ["offered", "waiting", "accepted"].includes(j.status);
    if (filter === "done") return ["delivered", "closed"].includes(j.status);
    return true;
  });

  return (
    <AdminShell title="Orders and jobs">
      <Choice
        label="Show"
        options={[{ key: "attention", label: "Needs attention" }, { key: "active", label: "Active" }, { key: "done", label: "Delivered" }, { key: "all", label: "All" }]}
        value={filter}
        onChange={(v) => setFilter(v as string)}
      />
      {error ? <Body style={{ color: colors.danger }}>{error}</Body> : null}
      {note ? <Body style={{ color: colors.ok }}>{note}</Body> : null}
      {!jobs ? <Loading /> : shown.length === 0 ? <Body style={{ color: colors.muted }}>Nothing needs you.</Body> : null}
      {shown.map((j) => {
        const o = j.orders;
        const hoursLeft = left(j.due_at);
        const openOffer = j.job_offers.find((x) => x.response == null);
        const tone = j.status === "unassigned" ? "danger" : j.status === "waiting" ? "warn" : j.status === "accepted" && (hoursLeft ?? 99) < 12 ? "danger" : j.status === "delivered" ? "ok" : "gold";
        const candidates = mentors.filter((m) => !o || m.positions.includes(o.position as MarketplaceMentor["positions"][number]));
        return (
          <Card key={j.id}>
            <View style={s.head}>
              <View style={{ flex: 1, gap: 2 }}>
                <H3>
                  {who(o)} · {o?.age_group} {o?.position} · {o?.skill_level}
                </H3>
                <Small>
                  {o ? `${TIER_LABEL[o.tier as Tier]} · ${money(o.price_cents)}` : ""} · parent {o?.parent?.full_name ?? ""} ({o?.parent?.email ?? ""}) · ordered{" "}
                  {new Date(j.created_at).toLocaleDateString()}
                </Small>
                <Small>
                  Choices: {o?.first?.display_name ?? "–"} / {o?.second?.display_name ?? "none"} · Film:{" "}
                  {o?.film_youtube_url ? "YouTube" : o?.film_media_id ? "uploaded" : "missing"}
                </Small>
              </View>
              <View style={{ alignItems: "flex-end", gap: 6 }}>
                <Pill tone={tone}>{j.status}</Pill>
                {j.status === "accepted" && hoursLeft != null ? <Pill tone={hoursLeft < 12 ? "danger" : "muted"}>{`${hoursLeft}h left`}</Pill> : null}
                {j.status === "delivered" ? <Pill tone={j.on_time ? "ok" : "warn"}>{j.on_time ? "On time" : "Late"}</Pill> : null}
              </View>
            </View>
            <Small>
              {j.mentor ? `Mentor: ${j.mentor.display_name}` : openOffer ? `Offered to ${openOffer.athletes?.display_name ?? "?"} (choice ${openOffer.rank}), expires ${new Date(openOffer.expires_at).toLocaleString()}` : j.status === "waiting" ? `Waiting ${o?.wait_days ?? "?"} days for first choice since ${o?.waitlisted_at ? new Date(o.waitlisted_at).toLocaleDateString() : "?"}` : "No mentor"}
            </Small>
            {["unassigned", "waiting", "offered", "accepted"].includes(j.status) ? (
              <View style={s.actions}>
                <Choice
                  label={j.status === "accepted" ? "Reassign to" : "Assign to"}
                  options={candidates.map((m) => ({ key: m.user_id, label: m.display_name, hint: m.available ? "available" : "at capacity" }))}
                  value={assign[j.id] ?? null}
                  onChange={(v) => setAssign({ ...assign, [j.id]: v as string })}
                />
                <Button title={j.status === "accepted" ? "Reassign" : "Assign"} small loading={busy === j.id} disabled={!assign[j.id]} onPress={() => run(j.id, () => assignJob(j.id, assign[j.id]))} />
                {j.status === "accepted" ? <Button title="Extend 24h" variant="secondary" small onPress={() => run(j.id, () => extendJob(j.id, 24))} /> : null}
              </View>
            ) : null}
            {j.orders?.paid_at ? (() => {
              const o = j.orders!;
              const left = o.price_cents - (o.refunded_cents ?? 0);
              return (
                <View style={{ gap: 6 }}>
                  {(o.refunded_cents ?? 0) > 0 ? <Small style={{ color: colors.warn }}>Refunded {money(o.refunded_cents ?? 0)} of {money(o.price_cents)}</Small> : null}
                  {left > 0 && refundFor !== j.id ? <View style={s.actions}><Button title="Refund order" variant="ghost" small onPress={() => { setRefundFor(j.id); setRefundAmount(""); setRefundReason(""); setNote(null); }} /></View> : null}
                  {refundFor === j.id ? (
                    <View style={s.actions}>
                      <TextField label={`Amount ($), blank for all ${money(left)}`} value={refundAmount} onChangeText={setRefundAmount} keyboardType="decimal-pad" style={{ minWidth: 200 }} />
                      <TextField label="Reason (emailed to the parent)" value={refundReason} onChangeText={setRefundReason} style={{ minWidth: 240 }} />
                      <Button title="Refund" variant="danger" small loading={busy === `r-${j.id}`} onPress={() => { const amt = refundAmount.trim() === "" ? undefined : Math.round(Number(refundAmount) * 100); if (amt !== undefined && (!Number.isFinite(amt) || amt <= 0)) return setError("Enter a refund amount above zero, or leave it blank for the full amount."); run(`r-${j.id}`, async () => { const r = await refundOrder(o.id, amt, refundReason.trim() || undefined); setRefundFor(null); setNote(`Refunded ${money(r.refundedCents)}${r.full ? "; the order is closed and the mentor's payout is voided" : ""}${r.charged ? "" : ". This order was not charged through Stripe, so no money moved"}.${r.mentorPaidCents > 0 ? ` The mentor was already paid ${money(r.mentorPaidCents)} for this order; that payment stands.` : ""}`); }); }} />
                      <Button title="Cancel" variant="ghost" small onPress={() => setRefundFor(null)} />
                      <Small style={{ flexBasis: "100%" }}>{o.stripe_payment_intent_id ? "The money goes back to the parent's card through Stripe. A full refund closes the order and voids the mentor's payout." : "This order was not charged through Stripe (free preview), so this only records the refund."}</Small>
                    </View>
                  ) : null}
                </View>
              );
            })() : null}
          </Card>
        );
      })}
    </AdminShell>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: "row", gap: space.md, alignItems: "flex-start" },
  actions: { gap: space.sm },
});
