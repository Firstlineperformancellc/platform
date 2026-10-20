import { useCallback, useEffect, useState } from "react";
import { openExternal } from "@/lib/open";
import { Link, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import { Linking, Platform, StyleSheet, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { Brand } from "@/components/Brand";
import { VideoUpload } from "@/components/VideoUpload";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { Choice } from "@/components/ui/Choice";
import { Dropdown } from "@/components/ui/Dropdown";
import { Pill } from "@/components/ui/Pill";
import { Screen } from "@/components/ui/Screen";
import { ContactDetails } from "@/components/ContactDetails";
import { CareerEditor } from "@/components/CareerEditor";
import { TextField } from "@/components/ui/TextField";
import { Body, H1, H3, Label, Small } from "@/components/ui/Text";
import { Loading } from "@/lib/auth";
import { avatarUrl, BIO_MAX, connectStatus, SECTION_MAX, stripeDashboard, DOW, getMyProfile, saveMyProfile, startConnect, uploadAvatar, type AvailabilityWindow, type MentorProfile } from "@/lib/mentorProfile";
import { listMyCareer, type CareerRow } from "@/lib/career";
import { athleteTake, getMyPresentsSettings, money, PRESENTS_NAME, presentsRules, saveMyPresentsSettings, type PresentsSettings } from "@/lib/presents";
import { levelLabel, TIER_LABEL, useSettings, type Tier } from "@/lib/settings";
import type { HockeyPosition } from "@/lib/types";
import { colors, radius, space } from "@/theme/tokens";

// The First Line Presents settings as the form holds them (text boxes keep strings until save).
type PresentsForm = {
  enabled: boolean; price: string; days: number; limit: string; pausedUntil: string; occasions: string[]; blurb: string;
};
const PRESENTS_BLURB_MAX = 300;
const toPresentsForm = (ps: PresentsSettings): PresentsForm => ({
  enabled: ps.presents_enabled,
  price: ps.presents_price_cents != null ? String(Math.round(ps.presents_price_cents / 100)) : "",
  days: ps.presents_days,
  limit: String(ps.presents_open_limit),
  pausedUntil: ps.presents_paused_until ? ps.presents_paused_until.slice(0, 10) : "",
  occasions: ps.presents_occasions ?? [],
  blurb: ps.presents_blurb ?? "",
});

// The mentor's own profile: this is their advertising deck on the marketplace plus their working
// settings (capacity, Film Room availability) and payout setup.
export default function MentorProfileScreen() {
  const { connect } = useLocalSearchParams<{ connect?: string }>();
  const { settings } = useSettings();
  const [p, setP] = useState<MentorProfile | null | undefined>(undefined);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [payout, setPayout] = useState<{ configured: boolean; connected: boolean; payouts_enabled: boolean } | null>(null);
  const [career, setCareer] = useState<CareerRow[] | undefined>(undefined);
  const [ps, setPs] = useState<PresentsSettings | null | undefined>(undefined); // as saved
  const [pf, setPf] = useState<PresentsForm | null>(null); // as being edited

  const loadPresents = useCallback(
    () =>
      getMyPresentsSettings()
        .then((row) => {
          setPs(row);
          setPf(row ? toPresentsForm(row) : null);
        })
        .catch(() => setPs(null)),
    [],
  );
  const load = useCallback(() => Promise.all([getMyProfile().then(setP), listMyCareer().then(setCareer), loadPresents()]), [loadPresents]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );
  useEffect(() => {
    connectStatus().then(setPayout).catch(() => setPayout({ configured: false, connected: false, payouts_enabled: false }));
  }, [connect]);

  // Positions, workload and Film Room windows are mentoring settings; a Presents-only athlete has none.
  const mentoring = ps?.offers_mentoring !== false;
  if (p === undefined || !settings || ps === undefined) return <Loading />;
  if (!p)
  return (
      <Screen title="Your profile" width="form" center>
        <H1 center>No mentor profile yet</H1>
        <Link href="/apply" asChild>
          <Button title="Apply as a mentor" />
        </Link>
      </Screen>
    );

  const set = (patch: Partial<MentorProfile>) => setP({ ...p, ...patch });

  async function save(section: string, patch: Parameters<typeof saveMyProfile>[0]) {
    setBusy(section);
    setError(null);
    setMsg(null);
    try {
      await saveMyProfile(patch);
      setMsg("Saved.");
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(null);
  }

  async function pickPhoto() {
    const picked = await DocumentPicker.getDocumentAsync({ type: "image/*", multiple: false });
    if (picked.canceled || !picked.assets[0]?.file) return;
    setBusy("photo");
    try {
      const path = await uploadAvatar(picked.assets[0].file);
      await saveMyProfile({ photo_path: path });
      set({ photo_path: path });
      setMsg("Photo updated.");
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(null);
  }

  async function onboard() {
    setBusy("connect");
    setError(null);
    try {
      const { url } = await startConnect();
      if (Platform.OS === "web") window.location.assign(url);
      else Linking.openURL(url);
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  const windows = p.availability ?? [];
  const setWindow = (i: number, patch: Partial<AvailabilityWindow>) => set({ availability: windows.map((w, j) => (j === i ? { ...w, ...patch } : w)) });

  // First Line Presents: the athlete's switch, price and working limits. The database enforces the price
  // bounds, the 18+ rule and that the sample is their own upload; FLP's switch-off wins over all of it.
  const rules = presentsRules(settings.rules as Record<string, unknown>);
  const dayOptions = [3, 5, 7].filter((d) => d <= rules.maxDays);
  if (dayOptions.length === 0) dayOptions.push(rules.maxDays);
  const presentsPriceCents = pf && pf.price.trim() && /^\d+$/.test(pf.price.trim()) ? Number(pf.price.trim()) * 100 : null;
  const presentsBlocked = Boolean(ps?.presents_blocked_at);
  const presentsLive = Boolean(ps && ps.presents_enabled && !ps.presents_blocked_at && ps.presents_price_cents != null && p.status === "approved");
  const setPf2 = (patch: Partial<PresentsForm>) => (pf ? setPf({ ...pf, ...patch }) : undefined);

  async function savePresents() {
    if (!pf) return;
    setError(null);
    setMsg(null);
    if (pf.price.trim() && presentsPriceCents === null) return setError("Enter the price in whole dollars, like 75.");
    if (pf.enabled && presentsPriceCents === null) return setError("Set a price before switching First Line Presents on.");
    const limit = Number(pf.limit.trim());
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) return setError("The open requests limit is a whole number from 1 to 100.");
    const paused = pf.pausedUntil.trim();
    if (paused && (!/^\d{4}-\d{2}-\d{2}$/.test(paused) || Number.isNaN(Date.parse(paused)))) return setError("Enter the pause date as YYYY-MM-DD, or leave it blank.");
    setBusy("presents");
    try {
      await saveMyPresentsSettings({
        presents_enabled: pf.enabled,
        presents_price_cents: presentsPriceCents,
        presents_days: dayOptions.includes(pf.days) ? pf.days : dayOptions[dayOptions.length - 1],
        presents_open_limit: limit,
        presents_paused_until: paused || null,
        presents_occasions: pf.occasions.filter((o) => rules.occasions.includes(o)),
        presents_blurb: pf.blurb.trim().slice(0, PRESENTS_BLURB_MAX),
      });
      await loadPresents();
      setMsg("Saved.");
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(null);
  }

  async function savePresentsSample(mediaId: string) {
    setError(null);
    try {
      await saveMyPresentsSettings({ presents_sample_media_id: mediaId });
      await loadPresents();
      setMsg("Sample video saved. It appears on your Presents page once it has finished processing.");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <Screen title="Your profile" width="content">
      <View style={s.topbar}>
        <Brand size={44} />
        <Link href="/athlete" asChild>
          <Button title="Your jobs" variant="ghost" small />
        </Link>
      </View>
      <View>
        <Label>{ps && !ps.offers_mentoring ? `FLP Athlete · ${PRESENTS_NAME}` : `FLP Mentor${p.tier ? ` · ${TIER_LABEL[p.tier as Tier]}` : ""}`}</Label>
        <H1>Your profile</H1>
        <View style={s.row}>
          <Pill tone={p.status === "approved" ? "ok" : "warn"}>{p.status}</Pill>
          {p.verified ? <Pill tone="ok">Verified by FLP</Pill> : null}
          {p.status === "approved" ? (
            <Link href={mentoring ? { pathname: "/mentors/[slug]", params: { slug: p.slug } } : { pathname: "/presents/[slug]", params: { slug: p.slug } }}>
              <Small style={{ color: colors.gold }}>See your public page</Small>
            </Link>
          ) : null}
        </View>
      </View>
      {msg ? <Body style={{ color: colors.ok }}>{msg}</Body> : null}
      {error ? <Body style={{ color: colors.danger }}>{error}</Body> : null}

      <Card>
        <H3>How parents see you</H3>
        <View style={s.row}>
          {p.photo_path ? <Image source={{ uri: avatarUrl(p.photo_path)! }} style={s.avatar} contentFit="cover" /> : <View style={[s.avatar, s.avatarEmpty]} />}
          <Button title={p.photo_path ? "Change photo" : "Add a photo"} variant="secondary" small loading={busy === "photo"} onPress={pickPhoto} />
        </View>
        <TextField label="Display name" value={p.display_name} onChangeText={(v) => set({ display_name: v })} />
        <TextField label="Current team or status" value={p.current_team} onChangeText={(v) => set({ current_team: v })} placeholder="e.g. Michigan Tech alum, now coaching in Grand Rapids" />
        <TextField label="Elite Prospects profile link" value={p.eliteprospects_url ?? ""} onChangeText={(v) => set({ eliteprospects_url: v || null })} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="eliteprospects.com/player/…" />
        <Choice
          label="Highest level you played"
          options={settings.taxonomy.levels.map((l) => ({ key: l.key, label: l.label, hint: l.tier ? TIER_LABEL[l.tier] : "not offered yet" }))}
          value={p.highest_level}
          onChange={(v) => set({ highest_level: v as string })}
          hint={p.status === "approved" && mentoring ? "Your tier is set by FLP from this. If you're playing at a lower level now, say so in your bio." : undefined}
        />
        {mentoring ? (
        <Choice label="Positions you review" options={settings.taxonomy.positions} value={p.positions} onChange={(v) => set({ positions: v as HockeyPosition[] })} multiple />
        ) : null}
        <Choice label="Credentials" options={settings.taxonomy.badges} value={p.badges} onChange={(v) => set({ badges: v as string[] })} multiple hint="Shown as a badge. FLP may verify." />
        <TextField label="Specialties (comma-separated)" value={p.specialties.join(", ")} onChangeText={(v) => set({ specialties: v.split(",").map((x) => x.trim()).filter(Boolean) })} placeholder="e.g. Breakouts, gap control, reading the play" />
        <TextField label="Bio" value={p.bio} onChangeText={(v) => set({ bio: v.slice(0, BIO_MAX) })} multiline maxLength={BIO_MAX} style={s.bio} placeholder="Where you've played, how you coach, what a family can expect from you. Blank lines make paragraphs." hint={`${p.bio.length.toLocaleString()} / ${BIO_MAX.toLocaleString()} · shown in full on your public page`} />
        <TextField label="What I'm best at teaching (optional)" value={p.teaching_focus ?? ""} onChangeText={(v) => set({ teaching_focus: v.slice(0, SECTION_MAX) })} multiline maxLength={SECTION_MAX} style={s.multi} placeholder="e.g. Reading the play in the defensive zone, puck protection along the boards." hint={`${(p.teaching_focus ?? "").length} / ${SECTION_MAX} · a headed section on your public page`} />
        <TextField label="Who I want to help (optional)" value={p.who_i_help ?? ""} onChangeText={(v) => set({ who_i_help: v.slice(0, SECTION_MAX) })} multiline maxLength={SECTION_MAX} style={s.multi} placeholder="e.g. U12 to U16 defensemen who want to make the jump to AAA." hint={`${(p.who_i_help ?? "").length} / ${SECTION_MAX}`} />
        <Button
          title="Save profile"
          small
          loading={busy === "profile"}
          onPress={() => save("profile", { display_name: p.display_name.trim(), current_team: p.current_team.trim(), highest_level: p.highest_level, positions: p.positions, badges: p.badges, specialties: p.specialties, bio: p.bio.trim(), teaching_focus: p.teaching_focus?.trim() || null, who_i_help: p.who_i_help?.trim() || null })}
        />
      </Card>

      <Card>
        <H3>Intro video (optional)</H3>
        <Body style={{ color: colors.muted }}>A short hello for parents: who you are, what you're good at, who you can help. No length limit, but a minute lands best.</Body>
        {p.video_media_id ? <Pill tone="ok">Video on your profile</Pill> : null}
        <VideoUpload purpose="intro_video" buttonTitle={p.video_media_id ? "Replace video" : "Upload a video"} onUploaded={(mediaId) => save("video", { video_media_id: mediaId }).then(() => set({ video_media_id: mediaId }))} />
      </Card>

      {career !== undefined ? (
        <CareerEditor positions={p.positions} initialRows={career} initialAwards={p.awards ?? []} initialNote={p.career_note} onSaved={load} />
      ) : null}

      {mentoring ? (
      <Card>
        <H3>Workload</H3>
        <Choice
          label="Breakdowns on deck at once"
          options={Array.from({ length: settings.rules.capacity_max }, (_, i) => ({ key: String(i + 1), label: String(i + 1) }))}
          value={String(p.capacity_on_deck)}
          onChange={(v) => set({ capacity_on_deck: Number(v) })}
          hint="When you're at this number the marketplace shows you as unavailable until you deliver one."
        />
        <Button title="Save workload" small loading={busy === "workload"} onPress={() => save("workload", { capacity_on_deck: p.capacity_on_deck })} />
      </Card>
      ) : null}

      {mentoring ? (
      <Card>
        <H3>Film Room availability</H3>
        <Body style={{ color: colors.muted }}>Weekly windows when parents can book a live session with you. Times are in your local time zone ({p.timezone}).</Body>
        {windows.map((w, i) => (
          <View key={i} style={s.window}>
            <Choice label="" options={DOW.map((d, di) => ({ key: String(di), label: d }))} value={String(w.dow)} onChange={(v) => setWindow(i, { dow: Number(v) })} />
            <View style={s.row}>
              <TextField label="From" value={w.start} onChangeText={(v) => setWindow(i, { start: v })} placeholder="19:00" style={{ width: 110 }} />
              <TextField label="To" value={w.end} onChangeText={(v) => setWindow(i, { end: v })} placeholder="21:00" style={{ width: 110 }} />
              <Button title="Remove" variant="ghost" small onPress={() => set({ availability: windows.filter((_, j) => j !== i) })} />
            </View>
          </View>
        ))}
        <View style={s.row}>
          <Button title="Add a window" variant="secondary" small onPress={() => set({ availability: [...windows, { dow: 2, start: "19:00", end: "21:00" }] })} />
          <Button title="Save availability" small loading={busy === "availability"} onPress={() => save("availability", { availability: windows.filter((w) => /^\d{2}:\d{2}$/.test(w.start) && /^\d{2}:\d{2}$/.test(w.end)) })} />
        </View>
        <Small>Parents book 30 or 60 minute Film Rooms inside these windows, up to {settings.rules.session_book_ahead_days ?? 14} days ahead.</Small>
      </Card>
      ) : null}

      <Card>
        <H3>Getting paid</H3>
        {payout?.payouts_enabled ? (
          <>
            <Pill tone="ok">Payouts enabled</Pill>
            <Body style={{ color: colors.muted }}>FLP pays your share through Stripe after each delivered breakdown, completed Film Room and First Line Presents video. Your Stripe dashboard shows every deposit, your bank details and your tax forms.</Body>
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              <Button title="Open my Stripe dashboard" variant="secondary" small loading={busy === "dash"} onPress={() => { setBusy("dash"); openExternal(async () => (await stripeDashboard()).url).catch((e) => setError((e as Error).message)).finally(() => setBusy(null)); }} />
              <Link href="/athlete/earnings" asChild><Button title="My earnings" variant="ghost" small /></Link>
            </View>
          </>
        ) : payout?.connected ? (
          <>
            <Pill tone="warn">Setup incomplete</Pill>
            <Body style={{ color: colors.muted }}>Stripe still needs some details before payouts can start.</Body>
            <Button title="Finish payout setup" small loading={busy === "connect"} onPress={onboard} />
          </>
        ) : payout?.configured ? (
          <>
            <Body style={{ color: colors.muted }}>Payouts go to your bank through Stripe. Setup takes about five minutes and asks for your identity and a bank account.</Body>
            <Button title="Set up payouts" small loading={busy === "connect"} onPress={onboard} />
          </>
        ) : (
          <Body style={{ color: colors.muted }}>Payout setup opens once FLP's Stripe account is connected. You'll get an email.</Body>
        )}
      </Card>

      {pf && ps ? (
        <Card>
          <H3>{PRESENTS_NAME}</H3>
          <Body style={{ color: colors.muted }}>Personal video messages for families, teammates and coaches, separate from your mentoring work. You set the price; FLP handles payment and pays your share the same way.</Body>
          {presentsBlocked ? (
            <View style={{ gap: space.sm }}>
              <Pill tone="danger">Switched off by FLP</Pill>
              <Body style={{ color: colors.muted }}>FLP has switched {PRESENTS_NAME} off for your profile. Contact support if you think that's a mistake.</Body>
              <Link href="/support" asChild><Button title="Contact support" variant="ghost" small /></Link>
            </View>
          ) : null}
          {!rules.enabled && !presentsBlocked ? <Small>{PRESENTS_NAME} isn't taking requests right now. Your settings are kept for when it reopens.</Small> : null}
          <Checkbox label={`Offer ${PRESENTS_NAME}`} checked={pf.enabled && !presentsBlocked} onChange={(v) => setPf2({ enabled: v })} disabled={presentsBlocked} hint={presentsLive ? "Live. Families can order from your Presents page." : p.status !== "approved" ? "Opens once FLP approves your profile." : "Off. Nobody can order until you switch it on and save."} />
          {presentsLive ? (
            <Link href={{ pathname: "/presents/[slug]", params: { slug: p.slug } }}>
              <Small style={{ color: colors.gold }}>Your Presents page: /presents/{p.slug}</Small>
            </Link>
          ) : null}
          <View style={{ maxWidth: 320 }}>
            <TextField
              label="Price (whole dollars)"
              value={pf.price}
              onChangeText={(v) => setPf2({ price: v.replace(/[^0-9]/g, "").slice(0, 5) })}
              keyboardType="number-pad"
              placeholder={String(Math.round(rules.minCents / 100))}
              hint={`${presentsPriceCents !== null ? `You keep ${money(athleteTake(presentsPriceCents, rules.sharePct))} of ${money(presentsPriceCents)}. ` : ""}Between ${money(rules.minCents)} and ${money(rules.maxCents)}; FLP's share is ${rules.sharePct}%.`}
            />
          </View>
          <View style={[s.row, { alignItems: "flex-start" }]}>
            <View style={{ width: 160 }}>
              <Dropdown label="Delivery time" options={dayOptions.map((d) => ({ key: String(d), label: `${d} days` }))} value={[String(pf.days)]} onChange={(v) => setPf2({ days: Number(v[0]) })} single placeholder="Choose" />
            </View>
            <View style={{ width: 160 }}>
              <TextField label="Open requests limit" value={pf.limit} onChangeText={(v) => setPf2({ limit: v.replace(/[^0-9]/g, "").slice(0, 3) })} keyboardType="number-pad" hint="1 to 100 at once" />
            </View>
            <View style={{ width: 160 }}>
              <TextField label="Pause until" value={pf.pausedUntil} onChangeText={(v) => setPf2({ pausedUntil: v.replace(/[^0-9-]/g, "").slice(0, 10) })} placeholder="YYYY-MM-DD" autoCapitalize="none" autoCorrect={false} hint="Blank = not paused" />
            </View>
          </View>
          <View style={{ gap: space.xs }}>
            <Label>Occasions I'll do</Label>
            <Small>Leave them all unticked to take any occasion.</Small>
            <View style={s.wrapRow}>
              {rules.occasions.map((o) => (
                <Checkbox key={o} label={o} checked={pf.occasions.includes(o)} onChange={(on) => setPf2({ occasions: on ? [...pf.occasions.filter((x) => x !== o), o] : pf.occasions.filter((x) => x !== o) })} />
              ))}
            </View>
          </View>
          <TextField label="About my Presents" value={pf.blurb} onChangeText={(v) => setPf2({ blurb: v.slice(0, PRESENTS_BLURB_MAX) })} multiline maxLength={PRESENTS_BLURB_MAX} style={s.multi} placeholder="e.g. Happy to do birthdays and pre-game pep talks. Tell me the player's position and I'll work it in." hint={`${pf.blurb.length} / ${PRESENTS_BLURB_MAX} · shown on your Presents page`} />
          <Button title="Save Presents settings" variant="secondary" small loading={busy === "presents"} onPress={savePresents} />
          <View style={{ gap: space.sm }}>
            <Label>Sample video</Label>
            <Small>
              {ps.presents_sample_media_id
                ? "Families see this sample on your Presents page."
                : p.video_media_id
                  ? "Your intro video is shown as the sample until you add one made for Presents."
                  : "No sample yet: a short example of the kind of message you'd record. Until you add one, your Presents page shows no video."}
            </Small>
            <VideoUpload purpose="presents_sample" buttonTitle={ps.presents_sample_media_id ? "Replace the sample" : "Upload a sample"} onUploaded={savePresentsSample} />
          </View>
        </Card>
      ) : null}
      <ContactDetails />
    </Screen>
  );
}

const s = StyleSheet.create({
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, flexWrap: "wrap" },
  wrapRow: { flexDirection: "row", flexWrap: "wrap", columnGap: space.lg },
  avatar: { width: 88, height: 88, borderRadius: 44, backgroundColor: colors.panel2 },
  avatarEmpty: { borderWidth: 1, borderColor: colors.line2 },
  multi: { height: 120, paddingTop: space.sm, textAlignVertical: "top" },
  bio: { height: 220, paddingTop: space.sm, textAlignVertical: "top" },
  window: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: space.md, gap: space.sm },
});
