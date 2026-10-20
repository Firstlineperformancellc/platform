import { useCallback, useRef, useState } from "react";
import { Link, useFocusEffect, type Href } from "expo-router";
import { Linking, Platform, StyleSheet, View } from "react-native";
import { AdminShell } from "@/components/AdminShell";
import { MuxPlayer } from "@/components/MuxPlayer";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Choice } from "@/components/ui/Choice";
import { Pill } from "@/components/ui/Pill";
import { TextField } from "@/components/ui/TextField";
import { Body, H3, Small } from "@/components/ui/Text";
import { Loading } from "@/lib/auth";
import { adminApprove, adminRefund, adminReject, adminRelease, adminRequests, adminResolve, money, STATUS_LABEL, type AdminRequest, type RequestStatus } from "@/lib/presents";
import { colors, space } from "@/theme/tokens";

type Filter = "in_review" | "flagged" | "problems" | "open" | "delivered" | "all";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "in_review", label: "To check" },
  { key: "flagged", label: "Held" },
  { key: "problems", label: "Problems" },
  { key: "open", label: "Open" },
  { key: "delivered", label: "Delivered" },
  { key: "all", label: "All" },
];
const CLOSED: RequestStatus[] = ["declined", "expired", "refunded", "cancelled"];
const hasProblem = (r: AdminRequest) => r.status === "delivered" && !!r.problem_at;
const matches = (f: Filter, r: AdminRequest) => (f === "all" ? true : f === "problems" ? hasProblem(r) : r.status === f);
// Problems and All come from the whole list; every other view asks the API for that status.
const fetchFor = (f: Filter): "all" | RequestStatus => (f === "problems" || f === "all" ? "all" : f);
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString() : "–");
const tone = (r: AdminRequest) => (hasProblem(r) ? "danger" : r.status === "in_review" || r.status === "flagged" ? "warn" : r.status === "delivered" ? "ok" : r.status === "open" ? "gold" : "muted");
function openTab(url: string) {
  if (Platform.OS === "web" && typeof window !== "undefined") window.open(url, "_blank", "noopener");
  else Linking.openURL(url).catch(() => {});
}

// First Line Presents, FLP's side: videos waiting for a check before delivery, requests held on a
// flagged word, problems families reported, and refunds. Dense on purpose, like Orders and jobs.
export default function AdminPresents() {
  const [rows, setRows] = useState<AdminRequest[] | null>(null);
  const [filter, setFilter] = useState<Filter | null>(null);
  const filterRef = useRef<Filter | null>(null); // the focus effect reloads whatever is picked without re-running on every change
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [watching, setWatching] = useState<string | null>(null);
  const [panel, setPanel] = useState<{ id: string; kind: "reject" | "refund" | "close" } | null>(null);
  const [text, setText] = useState(""); // the note to the athlete, or the refund reason
  const [amount, setAmount] = useState("");

  const load = useCallback(async (want: Filter | null) => {
    try {
      const got = await adminRequests(fetchFor(want ?? "all"));
      // first visit opens on the list that needs someone: to check, then held, then problems, else everything
      const next = want ?? (["in_review", "flagged", "problems"] as Filter[]).find((k) => got.some((r) => matches(k, r))) ?? "all";
      filterRef.current = next;
      setFilter(next);
      setRows(got.filter((r) => matches(next, r)));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      load(filterRef.current);
    }, [load]),
  );

  function pick(f: Filter) {
    filterRef.current = f;
    setFilter(f);
    setRows(null);
    setPanel(null);
    load(f);
  }
  function openPanel(id: string, kind: "reject" | "refund" | "close") {
    setPanel({ id, kind });
    setText("");
    setAmount("");
    setError(null);
    setNote(null);
  }
  async function run(key: string, fn: () => Promise<string | void>) {
    setBusy(key);
    setError(null);
    setNote(null);
    try {
      const msg = await fn();
      if (msg) setNote(msg);
      setPanel(null);
      setText("");
      setAmount("");
      await load(filterRef.current);
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(null);
  }

  const needy = filter === "in_review" || filter === "flagged" || filter === "problems";
  return (
    <AdminShell title="First Line Presents">
      <Small>
        Personal video messages from FLP athletes. Videos for under-18 recipients (or all of them, per Settings) wait here before delivery; a request with a word from the review list is held before the athlete sees it. A problem report holds the athlete's payout until you decide.
      </Small>
      <Choice label="Show" options={FILTERS} value={filter} onChange={(v) => pick(v as Filter)} />
      {error ? <Body style={{ color: colors.danger }}>{error}</Body> : null}
      {note ? <Body style={{ color: colors.ok }}>{note}</Body> : null}
      {!rows ? <Loading /> : rows.length === 0 ? <Body style={{ color: colors.muted }}>{needy ? "Nothing needs you." : "Nothing in this view."}</Body> : null}
      {(rows ?? []).map((r) => {
        const left = r.price_cents - r.refunded_cents;
        const refundable = !!r.paid_at && left > 0 && !CLOSED.includes(r.status);
        const canWatch = !!r.video_media_id && (r.status === "in_review" || r.status === "delivered");
        const mine = panel?.id === r.id ? panel.kind : null;
        return (
          <Card key={r.id}>
            <View style={s.head}>
              <View style={{ flex: 1, gap: 2 }}>
                <H3>
                  {r.occasion} for {r.recipient_name} · {money(r.price_cents)}
                </H3>
                <Small>
                  Athlete:{" "}
                  {r.athlete ? (
                    <Link href={`/presents/${r.athlete.slug}` as Href}>
                      <Small style={{ color: colors.gold }}>{r.athlete.display_name} ↗</Small>
                    </Link>
                  ) : (
                    "?"
                  )}{" "}
                  keeps {money(r.athlete_share_cents)} · from {r.from_name || "–"}{r.team ? ` · ${r.team}` : ""}
                </Small>
                <Small>
                  Buyer {r.buyer_name || "–"} ({r.buyer_email}) · requested {day(r.created_at)}{r.paid_at ? ` · paid ${day(r.paid_at)}` : " · not paid"}{r.due_at ? ` · due ${day(r.due_at)}` : ""}{r.delivered_at ? ` · delivered ${day(r.delivered_at)}` : ""}
                </Small>
                <Body style={{ color: colors.muted }}>“{r.instructions}”</Body>
                {r.flags.length ? <Small style={{ color: colors.warn }}>Held on: {r.flags.join(", ")}</Small> : null}
                {r.review_note ? <Small>FLP note: {r.review_note}</Small> : null}
                {r.declined_reason ? <Small>Declined: {r.declined_reason}</Small> : null}
                {r.problem_text ? <Small style={{ color: colors.danger }}>Problem reported {day(r.problem_at)}: {r.problem_text}</Small> : null}
                {r.refunded_cents > 0 ? <Small style={{ color: colors.warn }}>Refunded {money(r.refunded_cents)} of {money(r.price_cents)}</Small> : null}
                {r.refund_error ? <Small style={{ color: colors.danger }}>Stripe refund did not go through: {r.refund_error}</Small> : null}
              </View>
              <View style={{ alignItems: "flex-end", gap: 6 }}>
                <Pill tone={tone(r)}>{STATUS_LABEL[r.status]}</Pill>
                {r.recipient_minor ? <Pill tone="warn">Under 18</Pill> : null}
                {hasProblem(r) ? <Pill tone="danger">Problem</Pill> : null}
                {r.rating ? <Pill tone="muted">{`Rated ${r.rating} of 5`}</Pill> : null}
              </View>
            </View>
            {watching === r.id && r.video_media_id ? (
              <MuxPlayer mediaId={r.video_media_id} title={`Video for ${r.recipient_name}`} processingText="The video is still processing; try again in a few minutes." />
            ) : null}
            <View style={s.actions}>
              {canWatch ? <Button title={watching === r.id ? "Hide video" : "Watch"} variant="secondary" small onPress={() => setWatching(watching === r.id ? null : r.id)} /> : null}
              {r.status === "in_review" ? (
                <>
                  <Button title="Approve and deliver" small loading={busy === r.id} onPress={() => run(r.id, async () => { await adminApprove(r.id); return `Delivered to ${r.buyer_email}.`; })} />
                  {mine !== "reject" ? <Button title="Send back" variant="ghost" small onPress={() => openPanel(r.id, "reject")} /> : null}
                </>
              ) : null}
              {r.status === "flagged" ? (
                <>
                  <Button title="Release to athlete" small loading={busy === r.id} onPress={() => run(r.id, async () => { await adminRelease(r.id); return `Released; ${r.athlete?.display_name ?? "the athlete"} can see the request now.`; })} />
                  {mine !== "close" ? <Button title="Refund and close" variant="danger" small onPress={() => openPanel(r.id, "close")} /> : null}
                </>
              ) : null}
              {hasProblem(r) ? (
                <Button title="No refund, release payout" variant="secondary" small loading={busy === `v-${r.id}`} onPress={() => run(`v-${r.id}`, async () => { await adminResolve(r.id); return "Problem closed with no refund; the athlete's payout is owed again."; })} />
              ) : null}
              {refundable && r.status !== "flagged" && mine !== "refund" ? <Button title="Refund" variant="ghost" small onPress={() => openPanel(r.id, "refund")} /> : null}
              {r.status === "delivered" ? (
                <Small style={{ color: colors.gold }} onPress={() => openTab(r.view_url)}>
                  Buyer's page ↗
                </Small>
              ) : null}
            </View>
            {mine === "reject" ? (
              <View style={s.panel}>
                <TextField label="Note to the athlete" value={text} onChangeText={setText} placeholder="What to change in the next take" />
                <View style={s.actions}>
                  <Button title="Send back to re-record" variant="danger" small loading={busy === `x-${r.id}`} onPress={() => run(`x-${r.id}`, async () => { await adminReject(r.id, text.trim()); return "Sent back; the athlete has your note and two more days."; })} />
                  <Button title="Cancel" variant="ghost" small onPress={() => setPanel(null)} />
                  <Small style={{ flexBasis: "100%" }}>The video is removed, the request reopens, and the athlete gets your note by email.</Small>
                </View>
              </View>
            ) : null}
            {mine === "refund" || mine === "close" ? (
              <View style={s.panel}>
                {mine === "refund" ? <TextField label={`Amount ($), blank for all ${money(left)}`} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" style={{ minWidth: 200 }} /> : null}
                <TextField label="Reason (emailed to the buyer)" value={text} onChangeText={setText} style={{ minWidth: 240 }} />
                <View style={s.actions}>
                  <Button
                    title={mine === "close" ? `Refund ${money(left)} and close` : "Refund"}
                    variant="danger"
                    small
                    loading={busy === `r-${r.id}`}
                    onPress={() => {
                      const amt = mine === "close" || amount.trim() === "" ? undefined : Math.round(Number(amount) * 100);
                      if (amt !== undefined && (!Number.isFinite(amt) || amt <= 0)) return setError("Enter a refund amount above zero, or leave it blank for the full amount.");
                      run(`r-${r.id}`, async () => {
                        const res = await adminRefund(r.id, amt, text.trim());
                        return `Refunded ${money(res.refundedCents)}${res.full ? "; the request is closed and the athlete's payout is voided" : ""}.`;
                      });
                    }}
                  />
                  <Button title="Cancel" variant="ghost" small onPress={() => setPanel(null)} />
                  <Small style={{ flexBasis: "100%" }}>{r.stripe_payment_intent_id ? "The money goes back to the buyer's card through Stripe. A full refund closes the request and voids the athlete's payout." : "This request was not charged through Stripe (free preview), so this only records the refund."}</Small>
                </View>
              </View>
            ) : null}
          </Card>
        );
      })}
    </AdminShell>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: "row", gap: space.md, alignItems: "flex-start" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, alignItems: "center" },
  panel: { gap: space.sm, padding: space.md, borderWidth: 1, borderColor: colors.line2, borderRadius: 8 },
});
