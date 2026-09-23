import { useEffect, useMemo, useState } from "react";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import { Linking, Platform, StyleSheet, View } from "react-native";
import { Brand } from "@/components/Brand";
import { MentorCard } from "@/components/MentorCard";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Choice } from "@/components/ui/Choice";
import { Pill } from "@/components/ui/Pill";
import { Screen } from "@/components/ui/Screen";
import { TextField } from "@/components/ui/TextField";
import { Body, H1, H2, H3, Label, Small } from "@/components/ui/Text";
import { api } from "@/lib/api";
import { Loading } from "@/lib/auth";
import { listMentors, type MarketplaceMentor } from "@/lib/mentors";
import { listPlayers, playerName, type Player } from "@/lib/players";
import { money, useSettings } from "@/lib/settings";
import { colors, space } from "@/theme/tokens";

type Step = "player" | "focus" | "mentor" | "review";
const STEPS: { key: Step; label: string }[] = [
  { key: "player", label: "Youth athlete" },
  { key: "focus", label: "What to look at" },
  { key: "mentor", label: "Choose your FLP Mentor" },
  { key: "review", label: "Review and pay" },
];

// The order wizard. Film upload is the step after payment, on the order page.
export default function OrderWizard() {
  const router = useRouter();
  const params = useLocalSearchParams<{ player?: string; mentor?: string; cancelled?: string }>();
  const { settings } = useSettings();
  const [step, setStep] = useState<Step>("player");
  const [players, setPlayers] = useState<Player[] | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(params.player ?? null);
  const [focus, setFocus] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [mentors, setMentors] = useState<MarketplaceMentor[] | null>(null);
  const [first, setFirst] = useState<string | null>(null);
  const [second, setSecond] = useState<string | null>(null);
  const [picking, setPicking] = useState<"first" | "second">("first");
  const [waitDays, setWaitDays] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listPlayers().then((p) => {
      setPlayers(p);
      if (!playerId && p.length === 1) setPlayerId(p[0].id);
    });
  }, [playerId]);

  const player = players?.find((p) => p.id === playerId) ?? null;

  useEffect(() => {
    if (!player) return;
    listMentors(player.position).then((ms) => {
      setMentors(ms);
      if (params.mentor && !first) {
        const m = ms.find((x) => x.slug === params.mentor);
        if (m) setFirst(m.slug);
      }
    });
  }, [player, params.mentor, first]);

  useEffect(() => {
    if (settings && !waitDays) setWaitDays(String(settings.rules.wait_days_default));
  }, [settings, waitDays]);

  const focusOptions = useMemo(() => {
    if (!settings || !player) return [];
    const list = player.position === "goalie" ? settings.taxonomy.focus_goalie : settings.taxonomy.focus_skater;
    return list.map((f) => ({ key: f, label: f }));
  }, [settings, player]);

  const firstMentor = mentors?.find((m) => m.slug === first) ?? null;
  const secondMentor = mentors?.find((m) => m.slug === second) ?? null;
  const price = settings && firstMentor ? settings.breakdown_prices[firstMentor.tier] : null;

  if (!settings || !players) return <Loading />;

  function next() {
    setError(null);
    if (step === "player") {
      if (!playerId) return setError("Pick a youth athlete, or add one.");
      return setStep("focus");
    }
    if (step === "focus") {
      if (focus.length === 0) return setError("Pick at least one thing to look at.");
      return setStep("mentor");
    }
    if (step === "mentor") {
      if (!first) return setError("Choose your FLP Mentor.");
      if (settings!.rules.second_choice_required && !second) return setError("Pick a second choice too.");
      return setStep("review");
    }
  }

  async function pay() {
    if (!playerId || !first) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ orderId: string; checkoutUrl?: string; devPaid?: boolean }>("/orders", {
        method: "POST",
        body: JSON.stringify({
          playerId,
          mentorSlug: first,
          secondChoiceSlug: second,
          waitDays: firstMentor && !firstMentor.available ? Number(waitDays) || null : null,
          focusAreas: focus,
          notes,
        }),
      });
      if (res.checkoutUrl) {
        if (Platform.OS === "web") window.location.assign(res.checkoutUrl);
        else Linking.openURL(res.checkoutUrl);
        return;
      }
      router.replace({ pathname: "/parent/orders/[id]", params: { id: res.orderId, paid: "1" } });
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  const stepIndex = STEPS.findIndex((s) => s.key === step);

  return (
    <Screen title="Order a breakdown" width="content">
      <View style={s.topbar}>
        <Brand size={44} />
        <Link href="/parent" asChild>
          <Button title="Cancel" variant="ghost" small />
        </Link>
      </View>
      <View>
        <Label>Order a breakdown</Label>
        <H1>{STEPS[stepIndex].label}</H1>
        <View style={s.steps}>
          {STEPS.map((st, i) => (
            <Pill key={st.key} tone={i === stepIndex ? "gold" : i < stepIndex ? "ok" : "muted"}>
              {`${i + 1}. ${st.label}`}
            </Pill>
          ))}
        </View>
      </View>
      {params.cancelled ? <Body style={{ color: colors.warn }}>Checkout was cancelled. Nothing was charged.</Body> : null}

      {step === "player" ? (
        <Card>
          {players.length === 0 ? (
            <>
              <Body style={{ color: colors.muted }}>Add your youth athlete first. It takes a minute and you only do it once.</Body>
              <Link href="/parent/players/new" asChild>
                <Button title="Add a youth athlete" />
              </Link>
            </>
          ) : (
            <>
              <Choice
                label="Who is this breakdown for?"
                options={players.map((p) => ({ key: p.id, label: playerName(p), hint: `${p.age_group} · ${p.position} · ${p.skill_level}` }))}
                value={playerId}
                onChange={(v) => setPlayerId(v as string)}
              />
              <Link href="/parent/players/new" asChild>
                <Button title="Add another youth athlete" variant="ghost" small />
              </Link>
            </>
          )}
        </Card>
      ) : null}

      {step === "focus" && player ? (
        <Card>
          <Small>
            {playerName(player)} · {player.age_group} · {player.position} · {player.skill_level}
          </Small>
          <Choice label="What should the mentor look at?" options={focusOptions} value={focus} onChange={(v) => setFocus(v as string[])} multiple hint="Pick everything that applies." />
          <TextField
            label="Notes for the mentor"
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={4}
            style={{ height: 110, paddingTop: space.md, textAlignVertical: "top" }}
            placeholder="What's the situation? Jersey number and color helps. Anything you want them to watch for."
          />
        </Card>
      ) : null}

      {step === "mentor" && player ? (
        <View style={{ gap: space.md }}>
          <Card>
            <View style={s.row}>
              <Body>
                {picking === "first" ? "Tap a mentor to make them your first choice." : "Now pick a second choice, in case your first can't take it."}
              </Body>
              <Choice label="" options={[{ key: "first", label: "First choice" }, { key: "second", label: "Second choice" }]} value={picking} onChange={(v) => setPicking(v as "first" | "second")} />
            </View>
            {firstMentor && !firstMentor.available ? (
              <View style={{ gap: space.sm }}>
                <Body style={{ color: colors.warn }}>
                  We understand your first choice is {firstMentor.display_name}. Right now they're at capacity. How many days should we hold
                  your spot for them before assigning the job to your second choice?
                </Body>
                <TextField label="Days to wait" value={waitDays} onChangeText={setWaitDays} keyboardType="number-pad" style={{ maxWidth: 120 }} />
              </View>
            ) : null}
            {second && second === first ? <Body style={{ color: colors.danger }}>First and second choice must be different mentors.</Body> : null}
          </Card>
          {!mentors ? (
            <Loading />
          ) : mentors.length === 0 ? (
            <Body style={{ color: colors.muted }}>No mentors review {player.position}s yet.</Body>
          ) : (
            <View style={s.grid}>
              {mentors.map((m) => (
                <View key={m.user_id} style={s.cell}>
                  <MentorCard
                    mentor={m}
                    settings={settings}
                    compact
                    selected={m.slug === first ? "first" : m.slug === second ? "second" : null}
                    onPress={() => {
                      if (picking === "first") {
                        setFirst(m.slug);
                        if (second === m.slug) setSecond(null);
                        setPicking("second");
                      } else {
                        if (m.slug === first) return;
                        setSecond(m.slug);
                      }
                    }}
                  />
                </View>
              ))}
            </View>
          )}
        </View>
      ) : null}

      {step === "review" && player && firstMentor && price != null ? (
        <Card>
          <H2>Summary</H2>
          <View style={s.line}>
            <Small>Youth athlete</Small>
            <Body>{playerName(player)} · {player.age_group} · {player.position} · {player.skill_level}</Body>
          </View>
          <View style={s.line}>
            <Small>Looking at</Small>
            <Body>{focus.join(", ")}</Body>
          </View>
          <View style={s.line}>
            <Small>FLP Mentor</Small>
            <Body>
              {firstMentor.display_name}
              {!firstMentor.available ? ` (waitlist, holding ${waitDays || settings.rules.wait_days_default} days)` : ""}
            </Body>
          </View>
          <View style={s.line}>
            <Small>Second choice</Small>
            <Body>{secondMentor ? secondMentor.display_name : "None"}</Body>
          </View>
          <View style={s.line}>
            <Small>Turnaround</Small>
            <Body>{settings.rules.turnaround_hours} hours from the moment the mentor accepts</Body>
          </View>
          <View style={[s.line, { borderTopWidth: 1, borderTopColor: colors.line, paddingTop: space.md }]}>
            <Small>Total</Small>
            <H3 style={{ color: colors.gold }}>{money(price)}</H3>
          </View>
          <Small>You're charged now. You'll upload the game film right after payment.</Small>
        </Card>
      ) : null}

      {error ? <Body style={{ color: colors.danger }}>{error}</Body> : null}

      <View style={s.nav}>
        {stepIndex > 0 ? <Button title="Back" variant="ghost" onPress={() => setStep(STEPS[stepIndex - 1].key)} /> : <View />}
        {step === "review" ? (
          <Button title={settings.rules.payments_mode === "free_preview" ? `Place order · preview, no charge` : `Pay ${price != null ? money(price) : ""}`} loading={busy} onPress={pay} />
        ) : (
          <Button title="Continue" onPress={next} disabled={step === "player" && players.length === 0} />
        )}
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  steps: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: space.md },
  row: { gap: space.md },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  cell: { flexGrow: 1, flexBasis: 300, maxWidth: 480 },
  line: { gap: 2 },
  nav: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: space.md },
});
