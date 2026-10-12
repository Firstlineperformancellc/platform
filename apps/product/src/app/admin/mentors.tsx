import { useCallback, useState } from "react";
import { GENDER_LABEL, MOTIVATION_LABEL } from "@/lib/types";
import { useFocusEffect, Link } from "expo-router";
import { StyleSheet, View } from "react-native";
import { AdminShell } from "@/components/AdminShell";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Choice } from "@/components/ui/Choice";
import { Pill } from "@/components/ui/Pill";
import { Body, H3, Small } from "@/components/ui/Text";
import { deleteMentor, listDeletedMentors, listMentors, patchMentor, restoreMentor, type AdminMentor, type DeletedMentor } from "@/lib/admin";
import { TextField } from "@/components/ui/TextField";
import { Loading } from "@/lib/auth";
import { levelLabel, TIER_LABEL, useSettings, type Tier } from "@/lib/settings";
import { listAllTiers, type TierAdmin } from "@/lib/tiers";
import { colors, space } from "@/theme/tokens";

const pct = (v: number | null | undefined) => (v == null ? "–" : `${Math.round(v * 100)}%`);
const hrs = (v: number | null | undefined) => (v == null ? "–" : `${Math.round(v)}h`);

export default function AdminMentors() {
  const { settings } = useSettings();
  const [mentors, setMentors] = useState<AdminMentor[] | null>(null);
  const [filter, setFilter] = useState<string>("applied");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tierPick, setTierPick] = useState<Record<string, Tier>>({});
  const [levels, setLevels] = useState<TierAdmin[]>([]);
  const [deleted, setDeleted] = useState<DeletedMentor[] | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const [picked, setPicked] = useState(false); // the admin chose a filter; stop choosing for them
  const load = useCallback(() => {
    listAllTiers().then((ls) => setLevels(ls.filter((t) => !t.archived_at))).catch(() => {});
    listDeletedMentors().then(setDeleted).catch(() => setDeleted([]));
    return listMentors().then((ms) => {
      setMentors(ms);
      // open on the list that has people in it: applications when any are waiting, otherwise the approved mentors
      setFilter((cur) => (picked ? cur : ms.some((m) => m.status === "applied") ? "applied" : "approved"));
    }).catch((e) => setError(e.message));
  }, [picked]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function act(id: string, patch: Record<string, unknown>) {
    setBusy(id);
    setError(null);
    try {
      await patchMentor(id, patch);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(null);
  }

  async function remove(m: AdminMentor) {
    setBusy(m.user_id);
    setError(null);
    setMsg(null);
    try {
      await deleteMentor(m.user_id, reason);
      setConfirm(null);
      setReason("");
      setMsg(`${m.display_name} deleted. Their email is free to sign up again, and their record is under Deleted.`);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(null);
  }

  async function restore(d: DeletedMentor) {
    setBusy(d.id);
    setError(null);
    setMsg(null);
    try {
      await restoreMentor(d.id);
      setMsg(`${d.display_name || d.email} restored.`);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(null);
  }

  const shown = filter === "deleted" ? [] : (mentors ?? []).filter((m) => (filter === "all" ? true : m.status === filter));
  const deletedOpen = (deleted ?? []).filter((d) => !d.restored_at);
  const count = (status: string) => (mentors ?? []).filter((m) => m.status === status).length;

  return (
    <AdminShell title="FLP Mentors">
      <Card style={StyleSheet.flatten([{ borderColor: colors.goldDim }])}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.md }}>
          <View style={{ flex: 1, minWidth: 220 }}>
            <H3>Levels, prices and marketplace tiles</H3>
            <Small>Add or retire mentor levels, set their order, prices and visibility, choose what the tiles show, and control who is listed, featured or custom-priced.</Small>
          </View>
          <Link href="/admin/marketplace" asChild><Button title="Open levels & tiles" variant="secondary" small /></Link>
        </View>
      </Card>
      <Choice
        label="Show"
        options={[{ key: "applied", label: `Applications (${count("applied")})` }, { key: "approved", label: `Approved (${count("approved")})` }, { key: "suspended", label: `Suspended (${count("suspended")})` }, { key: "deactivated", label: `Deactivated (${count("deactivated")})` }, { key: "all", label: `All (${(mentors ?? []).length})` }, { key: "deleted", label: `Deleted (${deletedOpen.length})` }]}
        value={filter}
        onChange={(v) => { setPicked(true); setFilter(v as string); }}
      />
      {error ? <Body style={{ color: colors.danger }}>{error}</Body> : null}
      {msg ? <Body style={{ color: colors.ok }}>{msg}</Body> : null}
      {filter === "deleted" ? (
        !deleted ? <Loading /> : deleted.length === 0 ? <Body style={{ color: colors.muted }}>No deleted mentors.</Body> : (
          deleted.map((d) => (
            <Card key={d.id}>
              <View style={s.head}>
                <View style={{ flex: 1, gap: 2 }}>
                  <H3>{d.display_name || d.full_name || d.email}</H3>
                  <Small>{d.email}{d.phone ? ` · ${d.phone}` : ""}{d.snapshot?.athlete?.current_team ? ` · ${d.snapshot.athlete.current_team}` : ""}</Small>
                  <Small>Deleted {new Date(d.deleted_at).toLocaleString()}{d.deleter?.full_name || d.deleter?.email ? ` by ${d.deleter?.full_name || d.deleter?.email}` : ""}{d.snapshot?.athlete?.status ? ` · was ${d.snapshot.athlete.status}` : ""}</Small>
                  {d.reason ? <Small>Reason: {d.reason}</Small> : null}
                </View>
                <Pill tone={d.restored_at ? "ok" : "danger"}>{d.restored_at ? "restored" : "deleted"}</Pill>
              </View>
              {d.restored_at ? (
                <Small>Restored {new Date(d.restored_at).toLocaleString()}.</Small>
              ) : (
                <View style={s.actions}>
                  <Button title="Restore" small loading={busy === d.id} disabled={!d.user_id} onPress={() => restore(d)} />
                  <Small style={{ color: colors.muted }}>Puts their name, email, phone and profile back as they were, if that email hasn't signed up again.</Small>
                </View>
              )}
            </Card>
          ))
        )
      ) : !mentors || !settings ? <Loading /> : shown.length === 0 ? <Body style={{ color: colors.muted }}>{filter === "applied" ? "No applications waiting. Approved mentors are under Approved." : "Nobody in this list."}</Body> : null}
      {mentors && settings
        ? shown.map((m) => {
            const level = settings.taxonomy.levels.find((l) => l.key === m.highest_level);
            const fallback = levels[levels.length - 1]?.key ?? "ncaa";
            const suggestedTier = (m.tier ?? (level?.tier && levels.some((t) => t.key === level.tier) ? level.tier : fallback)) as Tier;
            const tier = tierPick[m.user_id] ?? suggestedTier;
            const st = m.stats;
            return (
              <Card key={m.user_id}>
                <View style={s.head}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <H3>{m.display_name}</H3>
                    <Small>
                      {m.profiles?.email} · {m.positions.join(", ")} · {m.current_team || m.credentials?.[0]?.label || "no team listed"}
                    </Small>
                    <Small>Highest level: {levelLabel(settings, m.highest_level) || "not set"}</Small>
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 6 }}>
                    <Pill tone={m.status === "approved" ? "ok" : m.status === "applied" ? "warn" : "danger"}>{m.status}</Pill>
                    {m.tier ? <Pill tone="gold">{TIER_LABEL[m.tier as Tier]}</Pill> : null}
                    <Pill tone={m.verified ? "ok" : "muted"}>{m.verified ? "Verified" : "Unverified"}</Pill>
                  </View>
                </View>
                {m.bio ? <Body style={{ color: colors.muted }}>{m.bio}</Body> : null}
                {m.application?.special_circumstances ? <Body style={{ color: colors.warn }}>Special circumstances: {m.application.special_circumstances}</Body> : null}
                {m.application?.age || m.application?.gender ? <Small>{[m.application?.age ? `Age ${m.application.age}` : null, m.application?.gender ? GENDER_LABEL[m.application.gender] : null].filter(Boolean).join(" · ")}</Small> : null}
                {m.application?.motivations?.length ? <Small>Why they want to mentor: {m.application.motivations.map((k) => MOTIVATION_LABEL[k].replace(" (multiple fields selectable)", "")).join(" · ")}{m.application.motivations.includes("other") && m.application.motivation_other ? ` — ${m.application.motivation_other}` : ""}</Small> : null}
                {m.eliteprospects_url ? <Small style={{ color: colors.gold }} onPress={() => window.open(m.eliteprospects_url!, "_blank", "noopener")}>Elite Prospects profile ↗</Small> : <Small style={{ color: colors.faint }}>No Elite Prospects link given.</Small>}

                {m.status !== "applied" && st ? (
                  <View style={s.stats}>
                    <Stat k="Completed" v={String(st.jobs_completed)} />
                    <Stat k="On deck" v={`${st.jobs_on_deck} / ${m.capacity_on_deck}`} />
                    <Stat k="Avg turnaround" v={hrs(st.avg_turnaround_hours)} />
                    <Stat k="On time" v={pct(st.on_time_rate)} />
                    <Stat k="Rating" v={st.avg_rating ? `${Number(st.avg_rating).toFixed(1)} (${st.rating_count})` : "–"} />
                    <Stat k="Accepted / declined / expired" v={`${st.accepted_offers} / ${st.declines} / ${st.expired_offers}`} />
                    <Stat k="Audits" v={String(st.audits)} />
                    <Stat k="Film Rooms" v={String(st.sessions_completed)} />
                    <Stat k="No-shows / late cancels / declines" v={`${st.session_no_shows} / ${st.session_late_cancels} / ${st.session_declines}`} />
                    <Stat k="Last delivered" v={st.last_delivered_at ? new Date(st.last_delivered_at).toLocaleDateString() : "–"} />
                  </View>
                ) : null}

                <View style={s.actions}>
                  {m.status === "applied" ? (
                    <>
                      <Choice label="Tier" options={levels.map((t) => ({ key: t.key, label: t.visible ? t.name : `${t.name} (private)` }))} value={tier} onChange={(v) => setTierPick({ ...tierPick, [m.user_id]: v as Tier })} />
                      <Button title="Approve" small loading={busy === m.user_id} onPress={() => act(m.user_id, { status: "approved", tier })} />
                      <Button title="Decline" variant="danger" small onPress={() => act(m.user_id, { status: "deactivated" })} />
                    </>
                  ) : null}
                  {m.status === "approved" ? (
                    <>
                      <Button title={m.verified ? "Mark unverified" : "Mark verified"} variant="secondary" small onPress={() => act(m.user_id, { verified: !m.verified })} />
                      <Button title="Suspend" variant="danger" small onPress={() => act(m.user_id, { status: "suspended" })} />
                    </>
                  ) : null}
                  {m.status === "suspended" ? (
                    <>
                      <Button title="Unsuspend" small onPress={() => act(m.user_id, { status: "approved" })} />
                      <Button title="Deactivate & block" variant="danger" small onPress={() => act(m.user_id, { status: "deactivated", block: true })} />
                    </>
                  ) : null}
                  {m.status === "deactivated" ? (
                    <Button title="Reactivate" small onPress={() => act(m.user_id, { status: "approved", block: false })} />
                  ) : null}
                  {confirm === m.user_id ? null : <Button title="Delete" variant="ghost" small onPress={() => { setConfirm(m.user_id); setReason(""); setError(null); }} />}
                </View>
                {confirm === m.user_id ? (
                  <View style={s.confirm}>
                    <Body style={{ color: colors.danger, fontWeight: "700" }}>Are you sure you want to delete this user?</Body>
                    <Small>{m.display_name} ({m.profiles?.email}) will be removed from FLP and their email freed so they can sign up again from scratch. A full record is kept under Deleted, where you can restore it.</Small>
                    <TextField label="Reason (for the record)" value={reason} onChangeText={setReason} placeholder="optional" />
                    <View style={s.actions}>
                      <Button title="Yes, delete" variant="danger" small loading={busy === m.user_id} onPress={() => remove(m)} />
                      <Button title="Cancel" variant="ghost" small onPress={() => setConfirm(null)} />
                    </View>
                  </View>
                ) : null}
              </Card>
            );
          })
        : null}
    </AdminShell>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <View style={s.stat}>
      <Small>{k}</Small>
      <Body>{v}</Body>
    </View>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: "row", gap: space.md, alignItems: "flex-start" },
  stats: { flexDirection: "row", flexWrap: "wrap", gap: space.lg },
  stat: { minWidth: 120 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, alignItems: "flex-end" },
  confirm: { gap: space.sm, padding: space.md, borderWidth: 1, borderColor: colors.danger, borderRadius: 8 },
});
