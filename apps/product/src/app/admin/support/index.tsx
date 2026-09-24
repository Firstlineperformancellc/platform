import { useCallback, useMemo, useState } from "react";
import { Link, useFocusEffect } from "expo-router";
import { StyleSheet, View } from "react-native";
import { SupportShell } from "@/components/SupportShell";
import { Card } from "@/components/ui/Card";
import { Choice } from "@/components/ui/Choice";
import { Pill } from "@/components/ui/Pill";
import { TextField } from "@/components/ui/TextField";
import { Body, H3, Small } from "@/components/ui/Text";
import { age, listTickets, STATUS_LABEL, type Ticket } from "@/lib/support";
import { colors, space } from "@/theme/tokens";

const PRIORITY_TONE = { low: "muted", normal: "muted", high: "warn", urgent: "danger" } as const;

// The queue. Open first, oldest unanswered at the top; the rest by last activity.
export default function SupportQueue() {
  const [rows, setRows] = useState<Ticket[] | null>(null);
  const [view, setView] = useState("open");
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  useFocusEffect(useCallback(() => { listTickets().then(setRows).catch((e) => setError((e as Error).message)); }, []));

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = (rows ?? []).filter((t) => {
      if (needle && !`${t.number} ${t.subject} ${t.requester_email} ${t.requester_name} ${t.tags.join(" ")}`.toLowerCase().includes(needle)) return false;
      if (view === "open") return t.status === "open";
      if (view === "pending") return t.status === "pending";
      if (view === "resolved") return t.status === "resolved" || t.status === "closed";
      return true;
    });
    if (view === "open") list.sort((a, b) => (a.last_direction === "in" ? 0 : 1) - (b.last_direction === "in" ? 0 : 1) || a.last_message_at.localeCompare(b.last_message_at));
    return list;
  }, [rows, view, q]);

  const counts = useMemo(() => ({ open: (rows ?? []).filter((t) => t.status === "open").length, pending: (rows ?? []).filter((t) => t.status === "pending").length }), [rows]);

  return (
    <SupportShell title="Support">
      <View style={s.toolbar}>
        <View style={{ flexGrow: 1, flexBasis: 240 }}>
          <TextField label="Search" value={q} onChangeText={setQ} placeholder="Ticket number, subject, email, tag" autoCapitalize="none" />
        </View>
        <Choice label="View" options={[{ key: "open", label: `Inbox (${counts.open})` }, { key: "pending", label: `Waiting on customer (${counts.pending})` }, { key: "resolved", label: "Resolved" }, { key: "all", label: "All" }]} value={view} onChange={(v) => setView(v as string)} />
      </View>
      {error ? <Body style={{ color: colors.danger }}>{error}</Body> : null}
      {rows === null ? <Body style={{ color: colors.muted }}>Loading…</Body> : shown.length === 0 ? <Body style={{ color: colors.muted }}>{view === "open" ? "Inbox zero." : "Nothing here."}</Body> : null}
      {shown.map((t) => (
        <Link key={t.id} href={{ pathname: "/admin/support/[id]", params: { id: t.id } }} asChild>
          <Card style={StyleSheet.flatten([s.row, t.status === "open" && t.last_direction === "in" && s.needs])}>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <View style={s.line}>
                <Small style={{ color: colors.faint }}>#{t.number}</Small>
                <H3>{t.subject || "(no subject)"}</H3>
              </View>
              <Small>
                {t.requester_name ? `${t.requester_name} · ` : ""}{t.requester_email} · via {t.channel} · {t.last_direction === "in" ? "waiting on us" : t.last_direction === "out" ? "we replied" : "note"} {age(t.last_message_at)} ago
                {t.assignee ? ` · ${t.assignee.full_name}` : " · unassigned"}
              </Small>
            </View>
            <View style={s.pills}>
              {t.priority !== "normal" ? <Pill tone={PRIORITY_TONE[t.priority]}>{t.priority}</Pill> : null}
              <Pill tone={t.status === "open" ? "gold" : t.status === "pending" ? "warn" : "ok"}>{STATUS_LABEL[t.status]}</Pill>
            </View>
          </Card>
        </Link>
      ))}
    </SupportShell>
  );
}

const s = StyleSheet.create({
  toolbar: { flexDirection: "row", flexWrap: "wrap", gap: space.md, alignItems: "flex-end" },
  row: { flexDirection: "row", gap: space.md, alignItems: "flex-start", flexWrap: "wrap" },
  needs: { borderColor: colors.gold },
  line: { flexDirection: "row", gap: space.sm, alignItems: "baseline", flexWrap: "wrap" },
  pills: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
});
