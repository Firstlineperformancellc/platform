import { useCallback, useState } from "react";
import { Link, useFocusEffect } from "expo-router";
import { StyleSheet, View } from "react-native";
import { Brand } from "@/components/Brand";
import { MentorSessions } from "@/components/MentorSessions";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { Screen } from "@/components/ui/Screen";
import { Body, H1, H2, H3, Label, Small } from "@/components/ui/Text";
import { useAuth } from "@/lib/auth";
import { acceptOffer, declineOffer, hoursLeft, listMyJobs, listOpenOffers, type MyJob, type Offer } from "@/lib/jobs";
import { supabase } from "@/lib/supabase";
import { money, TIER_LABEL, useSettings, type Tier } from "@/lib/settings";
import { firstName, type Athlete } from "@/lib/types";
import { colors, space } from "@/theme/tokens";

function who(o: { players: { first_name: string; last_name: string } | null; age_group: string; position: string; skill_level: string } | null) {
  if (!o) return "Youth athlete";
  const p = o.players;
  const name = p ? `${p.first_name}${p.last_name ? ` ${p.last_name[0]}.` : ""}` : "Youth athlete";
  return `${name} · ${o.age_group} ${o.position} · ${o.skill_level}`;
}

export default function AthleteHome() {
  const { profile, session, signOut } = useAuth();
  const { settings } = useSettings();
  const [athlete, setAthlete] = useState<Athlete | null | undefined>(undefined);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [jobs, setJobs] = useState<MyJob[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    const { data } = await supabase
      .from("athletes")
      .select("user_id, slug, display_name, bio, positions, status, payouts_enabled, tier")
      .eq("user_id", session.user.id)
      .maybeSingle();
    setAthlete((data as Athlete | null) ?? null);
    if (data?.status === "approved") {
      setOffers(await listOpenOffers());
      setJobs(await listMyJobs());
    }
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function respond(jobId: string, accept: boolean) {
    setBusy(jobId);
    setError(null);
    try {
      await (accept ? acceptOffer(jobId) : declineOffer(jobId));
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(null);
  }

  const status = athlete?.status;
  const onDeck = jobs.filter((j) => j.status === "accepted");
  const done = jobs.filter((j) => j.status === "delivered" || j.status === "closed");

  return (
    <Screen title="Your jobs" width="page">
      <View style={s.topbar}>
        <Brand size={44} />
        <View style={{ flexDirection: "row", gap: space.sm }}>
          <Link href="/athlete/profile" asChild>
            <Button title="My profile" variant="secondary" small />
          </Link>
          <Link href="/support" asChild><Button title="Support" variant="ghost" small /></Link>
          <Button title="Sign out" variant="ghost" small onPress={signOut} />
        </View>
      </View>
      <View>
        <Label>FLP Mentor{athlete?.tier ? ` · ${TIER_LABEL[athlete.tier as Tier]}` : ""}</Label>
        <H1>Welcome, {firstName(profile?.full_name)}</H1>
      </View>

      {status === "applied" ? (
        <Card>
          <Pill tone="warn">Application in review</Pill>
          <H3>FLP is reviewing your application</H3>
          <Body style={{ color: colors.muted }}>You'll get an email as soon as you're approved. Requests appear here after that.</Body>
        </Card>
      ) : status === "suspended" || status === "deactivated" ? (
        <Card>
          <Pill tone="danger">{status === "suspended" ? "Suspended" : "Deactivated"}</Pill>
          <Body style={{ color: colors.muted }}>Contact team@firstlineperform.com.</Body>
        </Card>
      ) : status === "approved" ? (
        <>
          <View>
            <H2>New requests</H2>
            {offers.length === 0 ? <Body style={{ color: colors.muted }}>Nothing waiting on you.</Body> : null}
          </View>
          {offers.map((o) => (
            <Card key={o.id}>
              <View style={s.row}>
                <H3>{who(o.jobs.orders)}</H3>
                <Pill tone={o.rank === 1 ? "gold" : "muted"}>{o.rank === 1 ? "First choice" : "Second choice"}</Pill>
              </View>
              <Body>{o.jobs.orders?.focus_areas.join(", ")}</Body>
              {o.jobs.orders?.notes ? <Body style={{ color: colors.muted }}>{o.jobs.orders.notes}</Body> : null}
              <View style={s.row}>
                <Small>
                  You earn {o.jobs.orders?.mentor_share_cents != null ? money(o.jobs.orders.mentor_share_cents) : ""} · {hoursLeft(o.expires_at)}h left to accept ·{" "}
                  {settings?.rules.turnaround_hours ?? 72}h turnaround once you do
                </Small>
              </View>
              <View style={s.row}>
                <Button title="Accept" small loading={busy === o.job_id} onPress={() => respond(o.job_id, true)} />
                <Button title="Decline" variant="ghost" small disabled={busy === o.job_id} onPress={() => respond(o.job_id, false)} />
              </View>
            </Card>
          ))}
          {error ? <Body style={{ color: colors.danger }}>{error}</Body> : null}

          <MentorSessions />

          <View>
            <H2>On deck</H2>
            {onDeck.length === 0 ? <Body style={{ color: colors.muted }}>No breakdowns in progress.</Body> : null}
          </View>
          {onDeck.map((j) => (
            <Card key={j.id}>
              <View style={s.row}>
                <H3>{who(j.orders)}</H3>
                <Pill tone={(hoursLeft(j.due_at) ?? 0) < 12 ? "danger" : "gold"}>{`${hoursLeft(j.due_at) ?? 0}h left`}</Pill>
              </View>
              <Body>{j.orders?.focus_areas.join(", ")}</Body>
              <Small>
                Film: {j.orders?.film_youtube_url ? "YouTube link" : j.orders?.media?.status === "ready" ? "ready to watch" : j.orders?.film_media_id ? "processing" : "not uploaded yet"}
              </Small>
              <Link href={{ pathname: "/athlete/jobs/[id]", params: { id: j.id } }} asChild>
                <Button title="Open the job" variant="secondary" small />
              </Link>
            </Card>
          ))}

          {done.length > 0 ? (
            <View>
              <H2>Completed</H2>
              {done.map((j) => (
                <Link key={j.id} href={{ pathname: "/athlete/jobs/[id]", params: { id: j.id } }}>
                  <Small style={{ color: colors.gold }}>{who(j.orders)} · delivered</Small>
                </Link>
              ))}
            </View>
          ) : null}
        </>
      ) : athlete === null ? (
        <Card>
          <H3>Finish your application</H3>
          <Body style={{ color: colors.muted }}>Your account is confirmed. Two minutes more and FLP can review you: positions, your playing history, a short bio.</Body>
          <Link href="/apply" asChild>
            <Button title="Finish your application" />
          </Link>
        </Card>
      ) : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, flexWrap: "wrap", justifyContent: "space-between" },
});
