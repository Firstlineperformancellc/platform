import { useCallback, useMemo, useState } from "react";
import { useFocusEffect } from "expo-router";
import { StyleSheet, View } from "react-native";
import { AdminShell } from "@/components/AdminShell";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Choice } from "@/components/ui/Choice";
import { Pill } from "@/components/ui/Pill";
import { TextField } from "@/components/ui/TextField";
import { Body, H3, Small } from "@/components/ui/Text";
import { deleteUser, listUsers, suspendUser, unsuspendUser, userActivity, type ActivityRow, type AdminUser } from "@/lib/admin";
import { useAuth } from "@/lib/auth";
import { money } from "@/lib/settings";
import { colors, space } from "@/theme/tokens";

const ROLE: Record<AdminUser["role"], string> = { parent: "Parent", athlete: "Mentor", admin: "Admin" };
const KIND: Record<string, string> = {
  "account.created": "Account created", signed_in: "Signed in", "order.placed": "Ordered a breakdown", "order.refunded": "Order refunded",
  "film.uploaded": "Uploaded game film", "job.accepted": "Accepted a breakdown", "breakdown.delivered": "Delivered a breakdown", "breakdown.received": "Received a breakdown",
  "review.left": "Left a review", "audit.filed": "Filed a Quality Control Audit", "audit.closed": "Audit closed", "session.booked": "Booked a Film Room",
  "session.requested": "Received a Film Room request", "session.completed": "Film Room completed", "session.cancelled": "Film Room cancelled",
  "session.declined": "Film Room declined", "session.expired": "Film Room request expired", "session.no_show_mentor": "Mentor no-show", "session.no_show_parent": "Family no-show",
  "pack.bought": "Bought a Season Arc", "payout.paid": "Payout sent",
};
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

function status(u: AdminUser): { label: string; tone: "ok" | "warn" | "danger" | "muted" } {
  if (u.deleted_at) return { label: "Deleted", tone: "danger" };
  if (u.suspended_at) return { label: "Suspended", tone: "danger" };
  if (!u.email_confirmed_at) return { label: "Unconfirmed", tone: "warn" };
  if (u.role === "athlete" && u.mentor_status && u.mentor_status !== "approved") return { label: `Mentor: ${u.mentor_status}`, tone: "warn" };
  return { label: "Active", tone: "ok" };
}

// Every account on the platform: who they are, what they've done, what they've spent, and the levers.
export default function AdminUsers() {
  const { session } = useAuth();
  const [rows, setRows] = useState<AdminUser[] | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [open, setOpen] = useState<string | null>(null);
  const [activity, setActivity] = useState<Record<string, ActivityRow[]>>({});
  const [reason, setReason] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    listUsers().then(setRows).catch((e) => setError((e as Error).message));
  }, []);
  useFocusEffect(load);

  async function toggle(id: string) {
    if (open === id) return setOpen(null);
    setOpen(id);
    if (!activity[id]) {
      try {
        const a = await userActivity(id);
        setActivity((cur) => ({ ...cur, [id]: a }));
      } catch (e) {
        setError((e as Error).message);
      }
    }
  }

  async function run(key: string, fn: () => Promise<unknown>, done?: string) {
    setBusy(key);
    setError(null);
    setMsg(null);
    try {
      await fn();
      if (done) setMsg(done);
      setConfirm(null);
      load();
      if (open) setActivity((cur) => ({ ...cur, [open]: [] }));
      if (open) userActivity(open).then((a) => setActivity((cur) => ({ ...cur, [open]: a }))).catch(() => {});
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(null);
  }

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (rows ?? []).filter((u) => {
      if (needle && !`${u.full_name} ${u.email}`.toLowerCase().includes(needle)) return false;
      if (filter === "parents") return u.role === "parent";
      if (filter === "mentors") return u.role === "athlete";
      if (filter === "admins") return u.role === "admin";
      if (filter === "suspended") return Boolean(u.suspended_at || u.deleted_at);
      return true;
    });
  }, [rows, q, filter]);

  const spent = (u: AdminUser) => u.spent_orders_cents + u.spent_sessions_cents + u.spent_packs_cents;

  return (
    <AdminShell title="Users">
      <View style={s.toolbar}>
        <View style={{ flexGrow: 1, flexBasis: 260 }}>
          <TextField label="Search" value={q} onChangeText={setQ} placeholder="Name or email" autoCapitalize="none" />
        </View>
        <Choice
          label="Show"
          options={[{ key: "all", label: `All (${rows?.length ?? 0})` }, { key: "parents", label: "Parents" }, { key: "mentors", label: "Mentors" }, { key: "admins", label: "Admins" }, { key: "suspended", label: "Suspended / deleted" }]}
          value={filter}
          onChange={(v) => setFilter(v as string)}
        />
      </View>
      {msg ? <Body style={{ color: colors.ok }}>{msg}</Body> : null}
      {error ? <Body style={{ color: colors.danger }}>{error}</Body> : null}
      {rows === null ? <Body style={{ color: colors.muted }}>Loading…</Body> : shown.length === 0 ? <Body style={{ color: colors.muted }}>No accounts match.</Body> : null}
      {shown.map((u) => {
        const st = status(u);
        const isMe = u.id === session?.user.id;
        const canAct = !isMe && u.role !== "admin" && !u.deleted_at;
        const isOpen = open === u.id;
        return (
          <Card key={u.id}>
            <View style={s.head}>
              <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
                <H3>{u.full_name || "(no name)"}{isMe ? " · you" : ""}</H3>
                <Small>{u.email}</Small>
                <Small>
                  Joined {new Date(u.created_at).toLocaleDateString()} · last sign-in {u.last_sign_in_at ? when(u.last_sign_in_at) : "never"}
                </Small>
              </View>
              <View style={s.pills}>
                <Pill tone={u.role === "admin" ? "gold" : "muted"}>{ROLE[u.role]}</Pill>
                <Pill tone={st.tone}>{st.label}</Pill>
              </View>
            </View>
            <View style={s.stats}>
              {u.role === "athlete" ? (
                <>
                  <Stat k="Breakdowns delivered" v={String(u.breakdowns_delivered)} />
                  <Stat k="Film Rooms" v={String(u.sessions)} />
                  <Stat k="Earned" v={money(u.earned_cents)} />
                  <Stat k="Paid out" v={money(u.paid_out_cents)} />
                  {u.mentor_tier ? <Stat k="Tier" v={u.mentor_tier.toUpperCase()} /> : null}
                </>
              ) : (
                <>
                  <Stat k="Youth athletes" v={String(u.players)} />
                  <Stat k="Breakdowns" v={String(u.orders)} />
                  <Stat k="Film Rooms" v={String(u.sessions)} />
                  <Stat k="Spent" v={money(spent(u))} />
                  {u.refunded_cents ? <Stat k="Refunded" v={money(u.refunded_cents)} /> : null}
                </>
              )}
            </View>
            {u.suspended_reason ? <Small style={{ color: colors.danger }}>Reason: {u.suspended_reason}</Small> : null}
            <View style={s.row}>
              <Button title={isOpen ? "Hide activity" : "Activity"} variant="ghost" small onPress={() => toggle(u.id)} />
              {canAct && !u.suspended_at ? (
                <>
                  <TextField label="Reason (emailed to them)" value={reason[u.id] ?? ""} onChangeText={(v) => setReason({ ...reason, [u.id]: v })} placeholder="optional" style={{ minWidth: 220 }} />
                  <Button title="Suspend" variant="danger" small loading={busy === `s-${u.id}`} onPress={() => run(`s-${u.id}`, () => suspendUser(u.id, reason[u.id] ?? ""), `${u.full_name || u.email} suspended.`)} />
                </>
              ) : null}
              {canAct && u.suspended_at ? <Button title="Unsuspend" small loading={busy === `u-${u.id}`} onPress={() => run(`u-${u.id}`, () => unsuspendUser(u.id), `${u.full_name || u.email} restored.`)} /> : null}
              {canAct ? (
                confirm === u.id ? (
                  <>
                    <Small style={{ color: colors.danger }}>Delete {u.email}? Accounts with orders or sessions are deactivated instead of erased.</Small>
                    <Button title="Yes, delete" variant="danger" small loading={busy === `d-${u.id}`} onPress={() => run(`d-${u.id}`, async () => { const r = await deleteUser(u.id); setMsg(r.mode === "deleted" ? "Account deleted." : "Account deactivated (it has history)."); })} />
                    <Button title="Keep" variant="ghost" small onPress={() => setConfirm(null)} />
                  </>
                ) : (
                  <Button title="Delete" variant="ghost" small onPress={() => setConfirm(u.id)} />
                )
              ) : null}
            </View>
            {isOpen ? (
              <View style={s.timeline}>
                {!activity[u.id] ? (
                  <Small>Loading activity…</Small>
                ) : activity[u.id].length === 0 ? (
                  <Small>No activity yet.</Small>
                ) : (
                  activity[u.id].map((a, i) => (
                    <View key={`${a.kind}-${a.at}-${i}`} style={s.event}>
                      <Small style={{ minWidth: 150, color: colors.muted }}>{when(a.at)}</Small>
                      <Body>{KIND[a.kind] ?? a.kind.replace("admin.", "Admin: ").replace(/[._]/g, " ")}</Body>
                      {a.detail ? <Small>{a.detail}</Small> : null}
                    </View>
                  ))
                )}
              </View>
            ) : null}
          </Card>
        );
      })}
    </AdminShell>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <View style={{ minWidth: 110 }}>
      <Small>{k}</Small>
      <Body>{v}</Body>
    </View>
  );
}

const s = StyleSheet.create({
  toolbar: { flexDirection: "row", flexWrap: "wrap", gap: space.md, alignItems: "flex-end" },
  head: { flexDirection: "row", gap: space.md, alignItems: "flex-start", flexWrap: "wrap" },
  pills: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  stats: { flexDirection: "row", flexWrap: "wrap", gap: space.lg },
  row: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, alignItems: "flex-end" },
  timeline: { borderTopWidth: 1, borderTopColor: colors.line, paddingTop: space.sm, gap: 6 },
  event: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, alignItems: "baseline" },
});
