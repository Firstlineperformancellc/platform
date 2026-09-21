import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { StyleSheet, View } from "react-native";
import { AdminShell } from "@/components/AdminShell";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Choice } from "@/components/ui/Choice";
import { Pill } from "@/components/ui/Pill";
import { Body, H3, Small } from "@/components/ui/Text";
import { listMentors, patchMentor, type AdminMentor } from "@/lib/admin";
import { Loading } from "@/lib/auth";
import { levelLabel, TIER_LABEL, useSettings, type Tier } from "@/lib/settings";
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

  const load = useCallback(() => listMentors().then(setMentors).catch((e) => setError(e.message)), []);
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

  const shown = (mentors ?? []).filter((m) => (filter === "all" ? true : m.status === filter));

  return (
    <AdminShell title="FLP Mentors">
      <Choice
        label="Show"
        options={[{ key: "applied", label: "Applications" }, { key: "approved", label: "Approved" }, { key: "suspended", label: "Suspended" }, { key: "deactivated", label: "Deactivated" }, { key: "all", label: "All" }]}
        value={filter}
        onChange={(v) => setFilter(v as string)}
      />
      {error ? <Body style={{ color: colors.danger }}>{error}</Body> : null}
      {!mentors || !settings ? <Loading /> : shown.length === 0 ? <Body style={{ color: colors.muted }}>Nothing here.</Body> : null}
      {mentors && settings
        ? shown.map((m) => {
            const level = settings.taxonomy.levels.find((l) => l.key === m.highest_level);
            const suggestedTier = (m.tier ?? level?.tier ?? "ncaa") as Tier;
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

                {m.status !== "applied" && st ? (
                  <View style={s.stats}>
                    <Stat k="Completed" v={String(st.jobs_completed)} />
                    <Stat k="On deck" v={`${st.jobs_on_deck} / ${m.capacity_on_deck}`} />
                    <Stat k="Avg turnaround" v={hrs(st.avg_turnaround_hours)} />
                    <Stat k="On time" v={pct(st.on_time_rate)} />
                    <Stat k="Rating" v={st.avg_rating ? `${Number(st.avg_rating).toFixed(1)} (${st.rating_count})` : "–"} />
                    <Stat k="Accepted / declined / expired" v={`${st.accepted_offers} / ${st.declines} / ${st.expired_offers}`} />
                    <Stat k="Audits" v={String(st.audits)} />
                    <Stat k="Last delivered" v={st.last_delivered_at ? new Date(st.last_delivered_at).toLocaleDateString() : "–"} />
                  </View>
                ) : null}

                <View style={s.actions}>
                  {m.status === "applied" ? (
                    <>
                      <Choice label="Tier" options={(["pro", "pwhl", "ncaa"] as Tier[]).map((t) => ({ key: t, label: TIER_LABEL[t] }))} value={tier} onChange={(v) => setTierPick({ ...tierPick, [m.user_id]: v as Tier })} />
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
                    <>
                      <Button title="Reactivate" small onPress={() => act(m.user_id, { status: "approved", block: false })} />
                      <Button title="Delete account" variant="danger" small onPress={() => act(m.user_id, { remove: true })} />
                    </>
                  ) : null}
                </View>
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
});
