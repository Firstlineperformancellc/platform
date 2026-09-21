import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { StyleSheet, View } from "react-native";
import { AdminShell } from "@/components/AdminShell";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Choice } from "@/components/ui/Choice";
import { Pill } from "@/components/ui/Pill";
import { TextField } from "@/components/ui/TextField";
import { Body, H2, H3, Small } from "@/components/ui/Text";
import { closeAudit, listAudits, listPendingReviews, moderateReview, noteAudit, type AdminAudit, type PendingReview } from "@/lib/admin";
import { Loading } from "@/lib/auth";
import { listMentors, type MarketplaceMentor } from "@/lib/mentors";
import { money } from "@/lib/settings";
import { colors, space } from "@/theme/tokens";

export default function AdminAudits() {
  const [audits, setAudits] = useState<AdminAudit[] | null>(null);
  const [reviews, setReviews] = useState<PendingReview[]>([]);
  const [mentors, setMentors] = useState<MarketplaceMentor[]>([]);
  const [draft, setDraft] = useState<Record<string, { outcome: string; note: string; refund: string; reassignTo: string | null }>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    listAudits().then(setAudits).catch((e) => setError(e.message));
    listPendingReviews().then(setReviews);
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

  const d = (id: string) => draft[id] ?? { outcome: "", note: "", refund: "", reassignTo: null };
  const setD = (id: string, patch: Partial<ReturnType<typeof d>>) => setDraft({ ...draft, [id]: { ...d(id), ...patch } });

  return (
    <AdminShell title="Quality Control Audits">
      {error ? <Body style={{ color: colors.danger }}>{error}</Body> : null}
      {!audits ? <Loading /> : audits.length === 0 ? <Body style={{ color: colors.muted }}>No audits filed.</Body> : null}
      {audits?.map((a) => {
        const j = a.breakdowns?.jobs;
        const player = j?.orders.players ? `${j.orders.players.first_name} ${j.orders.players.last_name?.[0] ?? ""}.` : "Youth athlete";
        const dd = d(a.id);
        return (
          <Card key={a.id}>
            <View style={s.head}>
              <View style={{ flex: 1, gap: 2 }}>
                <H3>
                  {player} · mentor {j?.athletes?.display_name ?? "?"}
                </H3>
                <Small>
                  Filed {new Date(a.opened_at).toLocaleString()} by {a.filer?.full_name} ({a.filer?.email}) · order {j ? money(j.orders.price_cents) : ""}
                  {a.breakdowns?.rating ? ` · rated ${a.breakdowns.rating}★` : ""}
                </Small>
              </View>
              <Pill tone={a.status === "open" ? "warn" : "ok"}>{a.status === "open" ? "Open" : `Closed: ${a.outcome?.replace("_", " ")}`}</Pill>
            </View>
            <Body>{a.reason}</Body>
            {a.actions.length > 1 ? (
              <View style={{ gap: 2 }}>
                {a.actions.slice(1).map((x, i) => (
                  <Small key={i}>
                    {new Date(x.at).toLocaleString()} · {x.action}
                    {x.note ? ` · ${x.note}` : ""}
                  </Small>
                ))}
              </View>
            ) : null}
            {a.status === "open" ? (
              <View style={{ gap: space.sm }}>
                <TextField label="Note" value={dd.note} onChangeText={(t) => setD(a.id, { note: t })} multiline style={s.multi} placeholder="What you looked at and what you decided." />
                <View style={s.row}>
                  <Button title="Add note" variant="secondary" small disabled={!dd.note.trim()} loading={busy === a.id + "n"} onPress={() => run(a.id + "n", async () => { await noteAudit(a.id, dd.note); setD(a.id, { note: "" }); })} />
                </View>
                <Choice
                  label="Close with"
                  options={[{ key: "dismissed", label: "Dismiss" }, { key: "refund_partial", label: "Partial refund" }, { key: "refund_full", label: "Full refund" }, { key: "reassigned", label: "Reassign to another mentor" }, { key: "other", label: "Other" }]}
                  value={dd.outcome}
                  onChange={(v) => setD(a.id, { outcome: v as string })}
                />
                {dd.outcome === "refund_partial" ? <TextField label="Refund amount (dollars)" value={dd.refund} onChangeText={(t) => setD(a.id, { refund: t })} keyboardType="decimal-pad" style={{ maxWidth: 160 }} /> : null}
                {dd.outcome === "reassigned" ? (
                  <Choice label="New mentor" options={mentors.map((m) => ({ key: m.user_id, label: m.display_name, hint: m.available ? "available" : "at capacity" }))} value={dd.reassignTo} onChange={(v) => setD(a.id, { reassignTo: v as string })} />
                ) : null}
                <Button
                  title="Close audit"
                  small
                  disabled={!dd.outcome || (dd.outcome === "reassigned" && !dd.reassignTo)}
                  loading={busy === a.id}
                  onPress={() =>
                    run(a.id, () =>
                      closeAudit(a.id, {
                        outcome: dd.outcome,
                        note: dd.note,
                        refundCents: dd.outcome === "refund_partial" ? Math.round(Number(dd.refund) * 100) : undefined,
                        reassignTo: dd.reassignTo ?? undefined,
                      }),
                    )
                  }
                />
              </View>
            ) : a.notes ? (
              <Small>Resolution: {a.notes}</Small>
            ) : null}
          </Card>
        );
      })}

      <H2>Reviews to moderate</H2>
      {reviews.length === 0 ? <Body style={{ color: colors.muted }}>No ratings under 3 stars waiting.</Body> : null}
      {reviews.map((r) => (
        <Card key={r.id}>
          <View style={s.head}>
            <View style={{ flex: 1 }}>
              <H3>
                {r.rating}★ for {r.jobs?.athletes?.display_name ?? "?"}
              </H3>
              {r.review ? <Body style={{ color: colors.muted }}>{r.review}</Body> : <Small>No testimonial text.</Small>}
            </View>
            <View style={s.row}>
              <Button title="Publish" small loading={busy === r.id} onPress={() => run(r.id, () => moderateReview(r.id, "published"))} />
              <Button title="Hide" variant="ghost" small onPress={() => run(r.id, () => moderateReview(r.id, "hidden"))} />
            </View>
          </View>
        </Card>
      ))}
    </AdminShell>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: "row", gap: space.md, alignItems: "flex-start", flexWrap: "wrap" },
  row: { flexDirection: "row", gap: space.sm, flexWrap: "wrap" },
  multi: { height: 80, paddingTop: space.sm, textAlignVertical: "top" },
});
