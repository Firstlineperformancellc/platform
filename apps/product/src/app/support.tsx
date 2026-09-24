import { useCallback, useState } from "react";
import { Link, useFocusEffect } from "expo-router";
import { StyleSheet, View } from "react-native";
import { Brand } from "@/components/Brand";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { Screen } from "@/components/ui/Screen";
import { TextField } from "@/components/ui/TextField";
import { Body, H1, H3, Label, Small } from "@/components/ui/Text";
import { Loading, useAuth } from "@/lib/auth";
import { age, listMessages, myTickets, openTicket, requesterReply, STATUS_LABEL, type Message, type Ticket } from "@/lib/support";
import { colors, radius, space } from "@/theme/tokens";

// Contact support from inside the product, and follow your own tickets.
export default function Support() {
  const { session, profile, loading } = useAuth();
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [thread, setThread] = useState<Record<string, Message[]>>({});
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [reply, setReply] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => { if (session) myTickets().then(setTickets); }, [session]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) return <Loading />;
  const home = profile?.role === "athlete" ? "/athlete" : profile?.role === "admin" ? "/admin" : "/parent";

  async function submit() {
    if (body.trim().length < 5) return setError("Tell us what's going on.");
    setBusy("new"); setError(null); setMsg(null);
    try {
      const r = await openTicket(subject, body);
      setSubject(""); setBody("");
      setMsg(`Got it. Your ticket number is ${r.number}; you'll get an email confirmation and every reply lands in your inbox too.`);
      load();
    } catch (e) { setError((e as Error).message); }
    setBusy(null);
  }
  async function view(id: string) {
    if (open === id) return setOpen(null);
    setOpen(id);
    if (!thread[id]) setThread((cur) => ({ ...cur, [id]: [] })), listMessages(id).then((m) => setThread((cur) => ({ ...cur, [id]: m })));
  }

  return (
    <Screen title="Support" width="content">
      <View style={s.topbar}>
        <Link href={home as never} asChild><Brand size={44} /></Link>
        <Link href={home as never} asChild><Button title="Dashboard" variant="ghost" small /></Link>
      </View>
      <View>
        <Label>Support</Label>
        <H1>How can we help?</H1>
        <Small>A person at FLP reads every message, usually within a business day. You can also email support@firstlineperform.com.</Small>
      </View>
      {!session ? (
        <Card>
          <Body>Sign in to send a message from your account, or email support@firstlineperform.com.</Body>
          <Link href="/sign-in" asChild><Button title="Sign in" /></Link>
        </Card>
      ) : (
        <Card>
          <H3>Send a message</H3>
          <TextField label="Subject" value={subject} onChangeText={setSubject} placeholder="A few words" />
          <TextField label="What's going on?" value={body} onChangeText={setBody} multiline style={s.multi} placeholder="Which page, what you tapped, what happened. Screenshots can go by email." />
          <Button title="Send to support" loading={busy === "new"} onPress={submit} />
          {msg ? <Body style={{ color: colors.ok }}>{msg}</Body> : null}
          {error ? <Body style={{ color: colors.danger }}>{error}</Body> : null}
        </Card>
      )}
      {session && tickets && tickets.length > 0 ? (
        <>
          <H3>Your tickets</H3>
          {tickets.map((t) => (
            <Card key={t.id}>
              <View style={s.row}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <H3>#{t.number} · {t.subject}</H3>
                  <Small>{t.last_direction === "out" ? "FLP replied" : "You wrote"} {age(t.last_message_at)} ago</Small>
                </View>
                <Pill tone={t.status === "open" ? "gold" : t.status === "pending" ? "warn" : "ok"}>{t.status === "pending" ? "Replied, your turn" : STATUS_LABEL[t.status]}</Pill>
              </View>
              <Button title={open === t.id ? "Hide" : "Open"} variant="ghost" small onPress={() => view(t.id)} />
              {open === t.id ? (
                <View style={{ gap: space.sm }}>
                  {(thread[t.id] ?? []).map((m) => (
                    <View key={m.id} style={[s.msg, m.direction === "out" && s.out]}>
                      <Small>{m.direction === "out" ? "FLP Support" : "You"} · {new Date(m.created_at).toLocaleString()}</Small>
                      <Body style={{ whiteSpace: "pre-wrap" } as never}>{m.body_text}</Body>
                    </View>
                  ))}
                  {t.status !== "closed" ? (
                    <>
                      <TextField label="Add to this ticket" value={reply[t.id] ?? ""} onChangeText={(v) => setReply({ ...reply, [t.id]: v })} multiline style={s.multiSmall} />
                      <Button title="Send" small loading={busy === t.id} disabled={!(reply[t.id] ?? "").trim()} onPress={async () => { setBusy(t.id); try { await requesterReply(t.id, reply[t.id]); setReply({ ...reply, [t.id]: "" }); setThread((cur) => ({ ...cur, [t.id]: [] })); listMessages(t.id).then((m) => setThread((cur) => ({ ...cur, [t.id]: m }))); load(); } catch (e) { setError((e as Error).message); } setBusy(null); }} />
                    </>
                  ) : null}
                </View>
              ) : null}
            </Card>
          ))}
        </>
      ) : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, flexWrap: "wrap" },
  multi: { minHeight: 120, textAlignVertical: "top" },
  multiSmall: { minHeight: 72, textAlignVertical: "top" },
  msg: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: space.md, gap: 4 },
  out: { borderColor: colors.gold, backgroundColor: colors.goldSoft },
});
