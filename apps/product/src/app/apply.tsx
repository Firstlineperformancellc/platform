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
import { useEffect } from "react";
import { POSITIONS, type HockeyPosition } from "@/lib/types";
import { colors, fonts, radius, space } from "@/theme/tokens";

function slugify(name: string) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${base || "athlete"}-${Math.random().toString(36).slice(2, 6)}`;
}

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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function toggle(p: HockeyPosition) {
    setPositions((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]));
  }

  async function submit() {
    if (positions.length === 0) return setError("Pick at least one position you can review.");
    if (finishing) {
      setBusy(true);
      setError(null);
      const name = fullName.trim() || profile?.full_name || "FLP Mentor";
      const { error: insertError } = await supabase.from("athletes").insert({
        user_id: session!.user.id, slug: slugify(name), display_name: name, bio: bio.trim(), positions,
        credentials: team.trim() ? [{ label: team.trim() }] : [],
      });
      setBusy(false);
      if (insertError) return setError(insertError.message);
      return router.replace("/athlete");
    }
    if (!fullName.trim()) return setError("Enter your name.");
    if (password.length < 8) return setError("Use a password of at least 8 characters.");
    setBusy(true);
    setError(null);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: fullName.trim(), role: "athlete" } },
    });
    if (error) {
      setBusy(false);
      return setError(error.message);
    }
    if (!data.session) {
      setBusy(false);
      return setNotice("Check your email to confirm your account, then sign in. You'll finish the application on your first sign-in.");
    }
    const { error: insertError } = await supabase.from("athletes").insert({
      user_id: data.session.user.id,
      slug: slugify(fullName),
      display_name: fullName.trim(),
      bio: bio.trim(),
      positions,
      credentials: team.trim() ? [{ label: team.trim() }] : [],
    });
    setBusy(false);
    if (insertError) return setError(insertError.message);
    router.replace("/athlete");
  }

  return (
    <Screen title="Apply as a mentor" width="form" center>
      <Brand size={96} />
      <H1 center>Apply as an athlete</H1>
      <Body center style={{ color: colors.muted }}>
        FLP reviews every application. You'll hear back by email once you're approved.
      </Body>
      {wrongRole ? (
        <Card>
          <Body>You're signed in as a {profile?.role === "admin" ? "FLP admin" : "parent"}. Mentor accounts use their own email address.</Body>
          <Button title="Sign out and apply with another email" variant="secondary" onPress={signOut} />
        </Card>
      ) : null}
      <Card>
        {finishing ? (
          <Body style={{ color: colors.muted }}>Signed in as {session?.user.email}. Finish your mentor profile below.</Body>
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
        <TextField
          label="Short bio"
          value={bio}
          onChangeText={setBio}
          multiline
          numberOfLines={4}
          style={{ height: 110, paddingTop: space.md, textAlignVertical: "top" }}
          placeholder="Where you've played and what you're best at teaching."
        />
        {error ? <Body style={{ color: colors.danger }}>{error}</Body> : null}
        {notice ? <Body style={{ color: colors.ok }}>{notice}</Body> : null}
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
