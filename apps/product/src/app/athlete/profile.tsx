import { useCallback, useEffect, useState } from "react";
import { Link, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import { Linking, Platform, StyleSheet, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { Brand } from "@/components/Brand";
import { VideoUpload } from "@/components/VideoUpload";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Choice } from "@/components/ui/Choice";
import { Pill } from "@/components/ui/Pill";
import { Screen } from "@/components/ui/Screen";
import { TextField } from "@/components/ui/TextField";
import { Body, H1, H3, Label, Small } from "@/components/ui/Text";
import { Loading } from "@/lib/auth";
import { avatarUrl, connectStatus, DOW, getMyProfile, saveMyProfile, startConnect, uploadAvatar, type AvailabilityWindow, type MentorProfile } from "@/lib/mentorProfile";
import { levelLabel, TIER_LABEL, useSettings, type Tier } from "@/lib/settings";
import type { HockeyPosition } from "@/lib/types";
import { colors, radius, space } from "@/theme/tokens";

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

  const load = useCallback(() => getMyProfile().then(setP), []);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );
  useEffect(() => {
    connectStatus().then(setPayout).catch(() => setPayout({ configured: false, connected: false, payouts_enabled: false }));
  }, [connect]);

  if (p === undefined || !settings) return <Loading />;
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

  return (
    <Screen title="Your profile" width="content">
      <View style={s.topbar}>
        <Brand size={44} />
        <Link href="/athlete" asChild>
          <Button title="Your jobs" variant="ghost" small />
        </Link>
      </View>
      <View>
        <Label>FLP Mentor{p.tier ? ` · ${TIER_LABEL[p.tier as Tier]}` : ""}</Label>
        <H1>Your profile</H1>
        <View style={s.row}>
          <Pill tone={p.status === "approved" ? "ok" : "warn"}>{p.status}</Pill>
          {p.verified ? <Pill tone="ok">Verified by FLP</Pill> : null}
          {p.status === "approved" ? (
            <Link href={{ pathname: "/mentors/[slug]", params: { slug: p.slug } }}>
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
        <Choice
          label="Highest level you played"
          options={settings.taxonomy.levels.map((l) => ({ key: l.key, label: l.label, hint: l.tier ? TIER_LABEL[l.tier] : "not offered yet" }))}
          value={p.highest_level}
          onChange={(v) => set({ highest_level: v as string })}
          hint={p.status === "approved" ? "Your tier is set by FLP from this. If you're playing at a lower level now, say so in your bio." : undefined}
        />
        <Choice label="Positions you review" options={settings.taxonomy.positions} value={p.positions} onChange={(v) => set({ positions: v as HockeyPosition[] })} multiple />
        <Choice label="Credentials" options={settings.taxonomy.badges} value={p.badges} onChange={(v) => set({ badges: v as string[] })} multiple hint="Shown as a badge. FLP may verify." />
        <TextField label="Specialties (comma-separated)" value={p.specialties.join(", ")} onChangeText={(v) => set({ specialties: v.split(",").map((x) => x.trim()).filter(Boolean) })} placeholder="e.g. Breakouts, gap control, reading the play" />
        <TextField label="Bio" value={p.bio} onChangeText={(v) => set({ bio: v })} multiline style={s.multi} placeholder="Where you've played, what you're best at teaching, who you want to help." />
        <Button
          title="Save profile"
          small
          loading={busy === "profile"}
          onPress={() => save("profile", { display_name: p.display_name.trim(), current_team: p.current_team.trim(), highest_level: p.highest_level, positions: p.positions, badges: p.badges, specialties: p.specialties, bio: p.bio.trim() })}
        />
      </Card>

      <Card>
        <H3>Intro video (optional)</H3>
        <Body style={{ color: colors.muted }}>A short hello for parents: who you are, what you're good at, who you can help. No length limit, but a minute lands best.</Body>
        {p.video_media_id ? <Pill tone="ok">Video on your profile</Pill> : null}
        <VideoUpload purpose="intro_video" buttonTitle={p.video_media_id ? "Replace video" : "Upload a video"} onUploaded={(mediaId) => save("video", { video_media_id: mediaId }).then(() => set({ video_media_id: mediaId }))} />
      </Card>

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

      <Card>
        <H3>Getting paid</H3>
        {payout?.payouts_enabled ? (
          <>
            <Pill tone="ok">Payouts enabled</Pill>
            <Body style={{ color: colors.muted }}>FLP pays your share after each delivered breakdown through Stripe.</Body>
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
    </Screen>
  );
}

const s = StyleSheet.create({
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, flexWrap: "wrap" },
  avatar: { width: 88, height: 88, borderRadius: 44, backgroundColor: colors.panel2 },
  avatarEmpty: { borderWidth: 1, borderColor: colors.line2 },
  multi: { height: 120, paddingTop: space.sm, textAlignVertical: "top" },
  window: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: space.md, gap: space.sm },
});
