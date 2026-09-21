import { useEffect, useMemo, useState } from "react";
import { Link, useRouter } from "expo-router";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";
import { Choice } from "./ui/Choice";
import { TextField } from "./ui/TextField";
import { Body, H3, Label, Small } from "./ui/Text";
import { useAuth } from "@/lib/auth";
import type { MarketplaceMentor } from "@/lib/mentors";
import { listPlayers, type Player } from "@/lib/players";
import { bookSession, buyPack, dayLabel, listMyPacks, listSlots, timeLabel, type Pack, type SessionFormat } from "@/lib/sessions";
import { money, type Settings } from "@/lib/settings";
import { colors, fonts, radius, space } from "@/theme/tokens";

type Props = { mentor: MarketplaceMentor; settings: Settings; addonBreakdownId?: string | null };

// Booking a live Film Room with one mentor: format, youth athlete, a slot from the mentor's
// availability, a note, whether the parent sits in. Pays at booking (or uses a Season Arc credit).
export function BookSession({ mentor, settings, addonBreakdownId }: Props) {
  const { session, profile } = useAuth();
  const router = useRouter();
  const [players, setPlayers] = useState<Player[]>([]);
  const [packs, setPacks] = useState<Pack[]>([]);
  const [format, setFormat] = useState<SessionFormat>(addonBreakdownId ? "addon_30" : "film_room_30");
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [usePack, setUsePack] = useState(false);
  const [slots, setSlots] = useState<string[] | null>(null);
  const [startsAt, setStartsAt] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [present, setPresent] = useState(settings.rules.parent_present_default ? "yes" : "no");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isParent = Boolean(session) && profile?.role === "parent";
  const prices = settings.session_prices;
  const tier = mentor.tier;
  const first = mentor.display_name.split(" ")[0];

  useEffect(() => {
    if (!isParent) return;
    listPlayers().then((p) => {
      setPlayers(p);
      if (p.length === 1) setPlayerId(p[0].id);
    });
    listMyPacks(mentor.user_id).then(setPacks);
  }, [isParent, mentor.user_id]);

  useEffect(() => {
    setSlots(null);
    setStartsAt(null);
    listSlots(mentor.slug, format).then((r) => setSlots(r.slots)).catch((e) => setError((e as Error).message));
  }, [mentor.slug, format]);

  const openPack = packs.find((p) => p.sessions_used < p.sessions_total && new Date(p.expires_at).getTime() > Date.now());
  const byDay = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const iso of slots ?? []) {
      const k = dayLabel(iso);
      m.set(k, [...(m.get(k) ?? []), iso]);
    }
    return [...m.entries()];
  }, [slots]);

  const formatOptions: { key: SessionFormat; label: string }[] = [
    { key: "film_room_30", label: `30 min · ${money(prices.film_room_30?.[tier] ?? 0)}` },
    { key: "film_room_60", label: `60 min · ${money(prices.film_room_60?.[tier] ?? 0)}` },
  ];
  if (addonBreakdownId) formatOptions.unshift({ key: "addon_30", label: `Go through your breakdown live · 30 min · ${money(prices.addon_30?.[tier] ?? 0)}` });
  const price = usePack ? 0 : (prices[format]?.[tier] ?? 0);

  async function book() {
    if (!playerId) return setError("Pick the youth athlete.");
    if (!startsAt) return setError("Pick a time.");
    setBusy("book");
    setError(null);
    try {
      const res = await bookSession({
        mentorSlug: mentor.slug, format: usePack ? "film_room_30" : format, startsAt, playerId, note, parentPresent: present === "yes",
        breakdownId: format === "addon_30" ? addonBreakdownId : null, packId: usePack && openPack ? openPack.id : null,
      });
      if (res.checkoutUrl && Platform.OS === "web") window.location.assign(res.checkoutUrl);
      else router.push({ pathname: "/parent/sessions/[id]", params: { id: res.sessionId } });
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  async function buyArc() {
    if (!playerId) return setError("Pick the youth athlete first.");
    setBusy("pack");
    setError(null);
    try {
      const res = await buyPack(mentor.slug, playerId);
      if (res.checkoutUrl && Platform.OS === "web") window.location.assign(res.checkoutUrl);
      else {
        setPacks(await listMyPacks(mentor.user_id));
        setUsePack(true);
      }
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(null);
  }

  const arcPrice = prices.season_arc?.[tier];

  return (
    <Card>
      <H3>Film Room with {first}</H3>
      <Body style={{ color: colors.muted }}>
        A live, recorded video session: {first} pulls up the film, walks your youth athlete through it, and answers questions.
        A written recap lands in the Development Log within {settings.rules.recap_due_hours} hours.
      </Body>

      {!session ? (
        <Link href="/sign-up" asChild>
          <Button title="Create a parent account to book" />
        </Link>
      ) : !isParent ? (
        <Small>Sign in with a parent account to book.</Small>
      ) : (
        <>
          {openPack ? (
            <Choice
              label="Pay with"
              options={[
                { key: "pack", label: `Season Arc credit (${openPack.sessions_total - openPack.sessions_used} left)` },
                { key: "single", label: "Single session" },
              ]}
              value={usePack ? "pack" : "single"}
              onChange={(v) => setUsePack(v === "pack")}
            />
          ) : null}
          {!usePack ? <Choice label="Session" options={formatOptions} value={format} onChange={(v) => setFormat(v as SessionFormat)} /> : null}

          {players.length === 0 ? (
            <View style={{ gap: space.xs }}>
              <Small>Add your youth athlete first.</Small>
              <Link href="/parent/players" asChild>
                <Button title="Your youth athletes" variant="secondary" small />
              </Link>
            </View>
          ) : (
            <Choice label="Youth athlete" options={players.map((p) => ({ key: p.id, label: `${p.first_name} ${p.last_name}` }))} value={playerId} onChange={(v) => setPlayerId(v as string)} />
          )}

          <View style={{ gap: space.xs }}>
            <Label>Pick a time (shown in your time zone)</Label>
            {slots === null ? (
              <Small>Loading {first}'s openings…</Small>
            ) : slots.length === 0 ? (
              <Small>{first} hasn't opened any times in the next {settings.rules.session_book_ahead_days ?? 14} days. Check back soon.</Small>
            ) : (
              byDay.map(([day, times]) => (
                <View key={day} style={{ gap: 4 }}>
                  <Small style={{ color: colors.ink }}>{day}</Small>
                  <View style={s.times}>
                    {times.map((iso) => {
                      const on = startsAt === iso;
                      return (
                        <Pressable key={iso} accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={() => setStartsAt(iso)} style={({ hovered }: { hovered?: boolean }) => [s.slot, hovered && s.slotHover, on && s.slotOn]}>
                          <Text style={[s.slotText, on && s.slotTextOn]}>{timeLabel(iso)}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ))
            )}
          </View>

          <TextField label="What should the session focus on? (optional)" value={note} onChangeText={setNote} multiline style={s.multi} placeholder="Breakouts under pressure, the second period, anything on your mind" />
          <Choice label="Who's on the call" options={[{ key: "no", label: "Just my youth athlete" }, { key: "yes", label: "I'll sit in too" }]} value={present} onChange={(v) => setPresent(v as string)} />

          <View style={s.row}>
            <Button title={usePack ? "Book with a credit" : `Book · ${money(price)}`} loading={busy === "book"} disabled={!startsAt || !playerId} onPress={book} />
            <Small>
              {settings.rules.mentors_may_decline_sessions ? `${first} confirms within ${settings.rules.session_accept_hours ?? 24} hours or you're refunded.` : "Confirmed on booking."} Free
              cancellation up to {settings.rules.session_cancel_hours} hours before.
            </Small>
          </View>

          {arcPrice && !openPack ? (
            <View style={s.arc}>
              <Label>Season Arc</Label>
              <Body>
                {settings.rules.season_arc_sessions ?? 4} thirty-minute Film Rooms with {first} over {settings.rules.season_arc_weeks ?? 8} weeks for {money(arcPrice)}. Same
                mentor, same youth athlete, one thread of development.
              </Body>
              <Button title={`Buy a Season Arc · ${money(arcPrice)}`} variant="secondary" small loading={busy === "pack"} onPress={buyArc} />
            </View>
          ) : null}
          {error ? <Body style={{ color: colors.danger }}>{error}</Body> : null}
        </>
      )}
    </Card>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.md, flexWrap: "wrap" },
  times: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  slot: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel2 },
  slotHover: { borderColor: colors.gold },
  slotOn: { backgroundColor: colors.goldSoft, borderColor: colors.gold },
  slotText: { fontFamily: fonts.medium, fontSize: 14, color: colors.ink },
  slotTextOn: { color: colors.gold, fontFamily: fonts.semibold },
  multi: { minHeight: 72, textAlignVertical: "top" },
  arc: { borderTopWidth: 1, borderTopColor: colors.line, paddingTop: space.md, gap: space.sm },
});
