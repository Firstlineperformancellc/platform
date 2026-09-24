import { useCallback, useEffect, useState } from "react";
import { Link, useFocusEffect, useLocalSearchParams } from "expo-router";
import { StyleSheet, View } from "react-native";
import { SupportShell } from "@/components/SupportShell";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Choice } from "@/components/ui/Choice";
import { Pill } from "@/components/ui/Pill";
import { TextField } from "@/components/ui/TextField";
import { Body, H3, Small } from "@/components/ui/Text";
import { Loading } from "@/lib/auth";
import { getTicket, listAdmins, listCanned, listMessages, noteTicket, replyTicket, STATUS_LABEL, updateTicket, type Canned, type Message, type Ticket, type TicketStatus } from "@/lib/support";
import { getUser, type AdminUser } from "@/lib/admin";
import { money } from "@/lib/settings";
import { colors, radius, space } from "@/theme/tokens";

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

// One ticket: the thread, the composer, and the levers.
export default function SupportTicket() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [t, setT] = useState<Ticket | null | undefined>(undefined);
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [canned, setCanned] = useState<Canned[]>([]);
  const [admins, setAdmins] = useState<{ id: string; full_name: string }[]>([]);
  const [requester, setRequester] = useState<AdminUser | null>(null);
  const [reply, setReply] = useState("");
  const [note, setNote] = useState("");
  const [closeAfter, setCloseAfter] = useState("pending");
  const [tags, setTags] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    const tk = await getTicket(id);
    setT(tk);
    if (!tk) return;
    setTags(tk.tags.join(", "));
    setMsgs(await listMessages(id));
    if (tk.requester_id) getUser(tk.requester_id).then(setRequester).catch(() => {});
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => { listCanned().then(setCanned); listAdmins().then(setAdmins); }, []);

  if (t === undefined) return <SupportShell title="Support"><Loading /></SupportShell>;
  if (!t) return <SupportShell title="Support"><Body>Ticket not found.</Body></SupportShell>;

  async function run(key: string, fn: () => Promise<unknown>, done?: string) {
    setBusy(key);
    setError(null);
    setMsg(null);
    try {
      await fn();
      if (done) setMsg(done);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(null);
  }

  return (
    <SupportShell title={`#${t.number} · ${t.subject || "(no subject)"}`}>
      <View style={s.split}>
        <View style={{ flex: 2, minWidth: 320, gap: space.md }}>
          <Card>
            <View style={s.line}>
              <Pill tone={t.status === "open" ? "gold" : t.status === "pending" ? "warn" : "ok"}>{STATUS_LABEL[t.status]}</Pill>
              {t.priority !== "normal" ? <Pill tone={t.priority === "urgent" ? "danger" : t.priority === "high" ? "warn" : "muted"}>{t.priority}</Pill> : null}
              <Small>via {t.channel} · opened {when(t.created_at)}</Small>
            </View>
            {msgs.map((m) => (
              <View key={m.id} style={[s.msg, m.direction === "out" && s.out, m.direction === "note" && s.note]}>
                <Small style={{ color: m.direction === "note" ? colors.warn : colors.muted }}>
                  {m.direction === "in" ? (t.requester_name || t.requester_email) : m.direction === "out" ? `${m.author?.full_name ?? "FLP Support"} · sent` : `${m.author?.full_name ?? "Admin"} · internal note`} · {when(m.created_at)}
                </Small>
                <Body style={{ whiteSpace: "pre-wrap" } as never}>{m.body_text}</Body>
                {m.attachments?.length ? <Small>Attachments: {m.attachments.map((a) => a.name).join(", ")} (in the mailbox)</Small> : null}
              </View>
            ))}
          </Card>

          <Card>
            <H3>Reply to {t.requester_name || t.requester_email}</H3>
            {canned.length ? (
              <Choice label="Insert a canned reply" options={canned.map((c) => ({ key: c.id, label: c.title }))} value={null} onChange={(v) => { const c = canned.find((x) => x.id === v); if (c) setReply((r) => (r ? r + "\n\n" : "") + c.body); }} />
            ) : null}
            <TextField label="Your reply (emailed from support@firstlineperform.com)" value={reply} onChangeText={setReply} multiline style={s.multi} placeholder="Write it the way you'd say it." />
            <View style={s.line}>
              <Choice label="After sending" options={[{ key: "pending", label: "Wait for their answer" }, { key: "resolved", label: "Mark resolved" }, { key: "open", label: "Keep open" }]} value={closeAfter} onChange={(v) => setCloseAfter(v as string)} />
            </View>
            <View style={s.line}>
              <Button title="Send reply" loading={busy === "reply"} disabled={!reply.trim()} onPress={() => run("reply", async () => { const r = await replyTicket(t.id, reply, closeAfter as TicketStatus); setReply(""); if (!r.mailed) setError(`Saved, but the email did not send: ${r.error ?? "mail not configured"}`); }, "Reply sent.")} />
            </View>
            <View style={s.divider} />
            <TextField label="Internal note (never emailed)" value={note} onChangeText={setNote} multiline style={s.multiSmall} placeholder="Context for Alex, Bryan or Scott." />
            <View style={s.line}><Button title="Add note" variant="secondary" small loading={busy === "note"} disabled={!note.trim()} onPress={() => run("note", async () => { await noteTicket(t.id, note); setNote(""); }, "Note added.")} /></View>
            {msg ? <Body style={{ color: colors.ok }}>{msg}</Body> : null}
            {error ? <Body style={{ color: colors.danger }}>{error}</Body> : null}
          </Card>
        </View>

        <View style={{ flex: 1, minWidth: 260, gap: space.md }}>
          <Card>
            <H3>Ticket</H3>
            <Choice label="Status" options={(["open", "pending", "resolved", "closed"] as const).map((k) => ({ key: k, label: STATUS_LABEL[k] }))} value={t.status} onChange={(v) => run("status", () => updateTicket(t.id, { status: v as TicketStatus }))} />
            <Choice label="Priority" options={[{ key: "low", label: "Low" }, { key: "normal", label: "Normal" }, { key: "high", label: "High" }, { key: "urgent", label: "Urgent" }]} value={t.priority} onChange={(v) => run("priority", () => updateTicket(t.id, { priority: v as Ticket["priority"] }))} />
            <Choice label="Assigned to" options={[{ key: "", label: "Unassigned" }, ...admins.map((a) => ({ key: a.id, label: a.full_name || "Admin" }))]} value={t.assigned_to ?? ""} onChange={(v) => run("assign", () => updateTicket(t.id, { assigned_to: (v as string) || null }))} />
            <TextField label="Tags (comma-separated)" value={tags} onChangeText={setTags} placeholder="billing, film room, bug" autoCapitalize="none" onBlur={() => run("tags", () => updateTicket(t.id, { tags: tags.split(",").map((x) => x.trim()).filter(Boolean) }))} />
          </Card>
          <Card>
            <H3>Requester</H3>
            <Body>{t.requester_name || "(no name)"}</Body>
            <Small selectable>{t.requester_email}</Small>
            {requester ? (
              <>
                <Small>{requester.role === "athlete" ? "Mentor" : requester.role === "admin" ? "Admin" : "Parent"} · joined {new Date(requester.created_at).toLocaleDateString()}{requester.suspended_at ? " · suspended" : ""}</Small>
                <Small>
                  {requester.role === "athlete" ? `${requester.breakdowns_delivered} breakdowns delivered · earned ${money(requester.earned_cents)}` : `${requester.orders} breakdowns · ${requester.sessions} Film Rooms · spent ${money(requester.spent_orders_cents + requester.spent_sessions_cents + requester.spent_packs_cents)}`}
                </Small>
                <Link href="/admin/users" asChild><Button title="Open in Users" variant="ghost" small /></Link>
              </>
            ) : (
              <Small>No account with this email.</Small>
            )}
          </Card>
        </View>
      </View>
    </SupportShell>
  );
}

const s = StyleSheet.create({
  split: { flexDirection: "row", flexWrap: "wrap", gap: space.md, alignItems: "flex-start" },
  line: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, alignItems: "center" },
  msg: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: space.md, gap: 4 },
  out: { borderColor: colors.gold, backgroundColor: colors.goldSoft },
  note: { borderColor: colors.warn, borderStyle: "dashed" },
  multi: { minHeight: 140, textAlignVertical: "top" },
  multiSmall: { minHeight: 72, textAlignVertical: "top" },
  divider: { height: 1, backgroundColor: colors.line, marginVertical: space.sm },
});
