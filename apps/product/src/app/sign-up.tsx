import { useState } from "react";
import { Link, useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";
import { Brand } from "@/components/Brand";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Screen } from "@/components/ui/Screen";
import { TextField } from "@/components/ui/TextField";
import { Body, H1, Small } from "@/components/ui/Text";
import { supabase } from "@/lib/supabase";
import { marketingUrl } from "@/lib/site";
import { checkEmailMessage, EXISTS_MESSAGE, resendConfirmation, signUpOutcome } from "@/lib/signup";
import { colors } from "@/theme/tokens";

// Parent account. The player is added afterwards as a profile under this account, never as a login.
export default function SignUp() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [resending, setResending] = useState(false);

  async function submit() {
    if (!fullName.trim()) return setError("Enter your name.");
    if (password.length < 8) return setError("Use a password of at least 8 characters.");
    setBusy(true);
    setError(null);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: fullName.trim(), role: "parent" } },
    });
    setBusy(false);
    if (error) return setError(error.message);
    const outcome = signUpOutcome(data);
    if (outcome === "signed_in") return router.replace("/");
    if (outcome === "exists") return setError(EXISTS_MESSAGE);
    setSentTo(email.trim());
    setNotice(checkEmailMessage(email.trim(), ""));
  }

  return (
    <Screen title="Create an account" width="form" center>
      <Brand size={96} />
      <H1 center>Create a parent account</H1>
      <Body center style={{ color: colors.muted }}>
        You'll add your player next. Players never have their own login.
      </Body>
      <Card>
        <TextField label="Your name" value={fullName} onChangeText={setFullName} autoComplete="name" textContentType="name" />
        <TextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
        />
        <TextField
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
          hint="At least 8 characters."
          onSubmitEditing={submit}
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
        <Button title="Create account" full loading={busy} onPress={submit} />
      </Card>
      <Small center>
        Already have an account?{" "}
        <Link href="/sign-in" style={s.link}>
          Sign in
        </Link>
      </Small>
    </Screen>
  );
}

const s = StyleSheet.create({ link: { color: colors.gold, fontFamily: "Barlow_600SemiBold" } });
