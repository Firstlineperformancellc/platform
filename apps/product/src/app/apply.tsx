import { useState } from "react";
import { Link, useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Brand } from "@/components/Brand";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Screen } from "@/components/ui/Screen";
import { TextField } from "@/components/ui/TextField";
import { Body, H1, Label, Small } from "@/components/ui/Text";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { marketingUrl } from "@/lib/site";
import { applicantConfirmUrl, EXISTS_MESSAGE, resendConfirmation, saveApplicationRows, signUpOutcome, stashApplication } from "@/lib/signup";
import { useEffect } from "react";
import { GENDERS, MOTIVATIONS, normaliseEliteProspects, POSITIONS, type Gender, type HockeyPosition, type Motivation } from "@/lib/types";
import { Dropdown } from "@/components/ui/Dropdown";
import { colors, fonts, radius, space } from "@/theme/tokens";


// Athlete application. Creates the account and an athlete profile in "applied" state;
// FLP approves it from the admin panel before the athlete can see any jobs.
export default function Apply() {
  const router = useRouter();
  const { session, profile, signOut } = useAuth();
  // Signed in already (email confirmed after applying): only the profile is missing.
  const finishing = Boolean(session && profile?.role === "athlete");
  const wrongRole = Boolean(session && profile && profile.role !== "athlete");
  useEffect(() => {
    // Already has a mentor profile: nothing to finish here.
    if (!finishing) return;
    supabase.from("athletes").select("user_id").eq("user_id", session!.user.id).maybeSingle().then(({ data }) => {
      if (data) router.replace("/athlete");
    });
  }, [finishing, session, router]);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [team, setTeam] = useState("");
  const [bio, setBio] = useState("");
  const [positions, setPositions] = useState<HockeyPosition[]>([]);
  const [epUrl, setEpUrl] = useState("");
  const [motivations, setMotivations] = useState<Motivation[]>([]);
  const [age, setAge] = useState("");
  const [gender, setGender] = useState<Gender | null>(null);
  const [motivationOther, setMotivationOther] = useState("");
  const [special, setSpecial] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [resending, setResending] = useState(false);

  function toggle(p: HockeyPosition) {
    setPositions((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]));
  }

  async function submit() {
    // Anything in the special-circumstances box lets an incomplete application through to the reviewers.
    const partial = special.trim().length > 0;
    if (!partial && positions.length === 0) return setError("Pick at least one position you can review, or tell us about your circumstances below.");
    if (!partial && motivations.length === 0) return setError("Tell us why you want to mentor.");
    if (!partial && motivations.includes("other") && !motivationOther.trim()) return setError("Add a few words about why you want to mentor.");
    const ageNum = age.trim() ? Number(age.trim()) : null;
    if (!partial && (ageNum === null || !Number.isInteger(ageNum) || ageNum < 16 || ageNum > 99)) return setError("Enter your age.");
    if (ageNum !== null && (!Number.isInteger(ageNum) || ageNum < 13 || ageNum > 110)) return setError("That age doesn't look right.");
    if (!partial && !gender) return setError("Pick a gender, or \"Prefer not to say\".");
    const ep = normaliseEliteProspects(epUrl);
    if (epUrl.trim() && !ep) return setError("That doesn't look like an eliteprospects.com link.");
    const application = { bio: bio.trim(), positions, team: team.trim(), eliteprospects_url: ep, motivations, motivation_other: motivations.includes("other") ? motivationOther.trim() : null, special_circumstances: special.trim() || null, age: ageNum, gender };
    if (finishing) {
      setBusy(true);
      setError(null);
      const name = fullName.trim() || profile?.full_name || "FLP Mentor";
      try { await saveApplicationRows(session!.user.id, name, application); } catch (e) { setBusy(false); return setError((e as Error).message); }
      setBusy(false);
      return router.replace({ pathname: "/applied", params: { email: session!.user.email ?? "" } });
    }
    if (!fullName.trim()) return setError("Enter your name.");
    if (password.length < 8) return setError("Use a password of at least 8 characters.");
    setBusy(true);
    setError(null);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: fullName.trim(), role: "athlete", application }, emailRedirectTo: applicantConfirmUrl() },
    });
    if (error) {
      setBusy(false);
      return setError(error.message);
    }
    const outcome = signUpOutcome(data);
    if (outcome === "exists") {
      setBusy(false);
      return setError(EXISTS_MESSAGE);
    }
    if (outcome === "check_email" || !data.session) {
      // A brand-new account has its application saved by the database already. An account that
      // already existed (unconfirmed) does not, so keep the answers here until the link brings them back.
      stashApplication(email.trim(), fullName.trim(), application);
      setBusy(false);
      return router.replace({ pathname: "/applied", params: { email: email.trim(), confirm: "1" } });
    }
    // Confirmations off (development): make sure the applicant row exists, then say thanks.
    const { data: existing } = await supabase.from("athletes").select("user_id").eq("user_id", data.session.user.id).maybeSingle();
    if (!existing) {
      try { await saveApplicationRows(data.session.user.id, fullName, application); } catch (e) { setBusy(false); return setError((e as Error).message); }
    }
    setBusy(false);
    router.replace({ pathname: "/applied", params: { email: email.trim() } });
  }

  return (
    <Screen title="Apply as a mentor" width="form" center>
      <Brand size={96} />
      <H1 center>{finishing ? "Your email is confirmed." : "Apply as an athlete"}</H1>
      <Body center style={{ color: colors.muted }}>
        {finishing ? "One more step: finish your application below. FLP reviews every application and you'll hear back by email." : "FLP reviews every application. You'll hear back by email once you're approved."}
      </Body>
      {wrongRole ? (
        <Card>
          <Body>You're signed in as a {profile?.role === "admin" ? "FLP admin" : "parent"}. Mentor accounts use their own email address.</Body>
          <Button title="Sign out and apply with another email" variant="secondary" onPress={signOut} />
        </Card>
      ) : null}
      <Card>
        {finishing ? (
          <Body style={{ color: colors.muted }}>Signed in as {session?.user.email}. Your account is active; these details are what FLP reviews.</Body>
        ) : null}
        <TextField label="Your name" value={fullName} onChangeText={setFullName} autoComplete="name" placeholder={finishing ? profile?.full_name : undefined} />
        {finishing ? null : (
          <>
            <TextField
              label="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
            />
            <TextField
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="new-password"
              hint="At least 8 characters."
            />
          </>
        )}
        <TextField label="Current or highest team" value={team} onChangeText={setTeam} placeholder="e.g. Michigan Tech, NCAA D1" />
        <View style={s.pair}>
          <View style={{ width: 110 }}><TextField label="Age" value={age} onChangeText={(v) => setAge(v.replace(/[^0-9]/g, "").slice(0, 3))} keyboardType="number-pad" /></View>
          <View style={{ flex: 1, minWidth: 180 }}><Dropdown label="Gender" options={GENDERS} value={gender ? [gender] : []} onChange={(v) => setGender((v[0] as Gender) ?? null)} single placeholder="Choose" /></View>
        </View>
        <View style={{ gap: space.sm }}>
          <Label>Positions you can review</Label>
          <View style={s.chips}>
            {POSITIONS.map((p) => {
              const on = positions.includes(p.key);
              return (
                <Pressable
                  key={p.key}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  onPress={() => toggle(p.key)}
                  style={[s.chip, on && s.chipOn]}
                >
                  <Text style={[s.chipText, on && s.chipTextOn]}>{p.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        <TextField label="Elite Prospects profile link" value={epUrl} onChangeText={setEpUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="eliteprospects.com/player/…" hint="Optional, but it speeds up our review." />
        <Dropdown label="Why do you want to be a mentor?" options={MOTIVATIONS} value={motivations} onChange={(v) => setMotivations(v as Motivation[])} placeholder="Choose one or more" />
        {motivations.includes("other") ? <TextField label="Tell us in your own words" value={motivationOther} onChangeText={setMotivationOther} multiline maxLength={1000} style={{ height: 80, paddingTop: space.md, textAlignVertical: "top" }} /> : null}
        <TextField
          label="Short bio"
          value={bio}
          onChangeText={setBio}
          multiline
          numberOfLines={3}
          maxLength={1000}
          style={s.threeLines}
          placeholder="Where you've played and what you're best at teaching."
          hint={`${bio.length} / 1000`}
        />
        <TextField
          label="Are there any special circumstances you think our team should know about during the approval process?"
          value={special}
          onChangeText={setSpecial}
          multiline
          numberOfLines={3}
          maxLength={1000}
          style={s.threeLines}
          hint={`Optional. If you fill this in, you can submit without completing every field above. ${special.length} / 1000`}
        />
        {error ? <Body style={{ color: colors.danger }}>{error}</Body> : null}
        {notice ? <Body style={{ color: colors.ok }}>{notice}</Body> : null}
        {sentTo ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <Button title="Resend the email" variant="ghost" small loading={resending} onPress={async () => { setResending(true); setError(null); try { await resendConfirmation(sentTo); setNotice(`Sent again to ${sentTo}.`); } catch (e) { setError((e as Error).message); } setResending(false); }} />
            <Link href="/sign-in" asChild><Button title="Already confirmed? Sign in" variant="ghost" small /></Link>
          </View>
        ) : null}
        <Small>
          By creating an account you agree to FLP's{" "}
          <Small style={s.link} onPress={() => window.open(marketingUrl("terms.html"), "_blank", "noopener")}>Terms</Small> and{" "}
          <Small style={s.link} onPress={() => window.open(marketingUrl("privacy.html"), "_blank", "noopener")}>Privacy Policy</Small>.
        </Small>
        <Button title={finishing ? "Finish application" : "Submit application"} full loading={busy} disabled={wrongRole} onPress={submit} />
      </Card>
      <Small center>
        Already applied?{" "}
        <Link href="/sign-in" style={s.link}>
          Sign in
        </Link>
      </Small>
    </Screen>
  );
}

const s = StyleSheet.create({
  pair: { flexDirection: "row", flexWrap: "wrap", gap: space.md, alignItems: "flex-start" },
  threeLines: { height: 86, paddingTop: space.md, textAlignVertical: "top" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  chip: {
    height: 40,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.line2,
    backgroundColor: colors.panel,
    justifyContent: "center",
  },
  chipOn: { borderColor: colors.gold, backgroundColor: colors.goldSoft },
  chipText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.muted },
  chipTextOn: { color: colors.gold },
  link: { color: colors.gold, fontFamily: "Barlow_600SemiBold" },
});
