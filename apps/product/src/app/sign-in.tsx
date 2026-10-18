import { useRef, useState } from "react";
import { Link, useRouter } from "expo-router";
import { Platform, StyleSheet, View, type TextInput } from "react-native";
import { Brand } from "@/components/Brand";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Screen } from "@/components/ui/Screen";
import { liveValue, TextField } from "@/components/ui/TextField";
import { Body, H1, Small } from "@/components/ui/Text";
import { resendConfirmation } from "@/lib/signup";
import { siteUrl, supabase } from "@/lib/supabase";
import { colors, space } from "@/theme/tokens";

export default function SignIn() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<"password" | "link" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const emailRef = useRef<TextInput | null>(null);
  const passwordRef = useRef<TextInput | null>(null);
  // Read what the boxes show, not only what was typed: a browser-filled login may never have reached state.
  const currentEmail = () => liveValue(emailRef, email).trim();

  async function withPassword() {
    const address = currentEmail();
    const secret = liveValue(passwordRef, password);
    if (!address) return setError("Enter your email first.");
    if (!secret) return setError("Enter your password, or use a sign-in link below.");
    setBusy("password");
    setError(null);
    setNotice(null);
    setUnconfirmed(false);
    const { error } = await supabase.auth.signInWithPassword({ email: address, password: secret });
    setBusy(null);
    if (error && /not confirmed/i.test(error.message)) {
      setUnconfirmed(true);
      return setError("This email isn't confirmed yet. Send yourself a new confirmation link, open it, and you're in.");
    }
    if (error) return setError(error.message);
    router.replace("/");
  }

  async function resend() {
    setBusy("link");
    setError(null);
    try {
      await resendConfirmation(currentEmail(), siteUrl());
      setUnconfirmed(false);
      setNotice("We sent a new confirmation link. It can take a couple of minutes, so check spam too. Open it within 24 hours.");
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(null);
  }

  async function forgot() {
    if (!currentEmail()) return setError("Enter your email first.");
    setBusy("link");
    setError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(currentEmail(), { redirectTo: `${siteUrl()}/reset-password` });
    setBusy(null);
    if (error) return setError(error.message);
    setNotice("Check your email for a link to set a new password.");
  }

  async function withLink() {
    if (!currentEmail()) return setError("Enter your email first.");
    setBusy("link");
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: currentEmail(),
      options: { emailRedirectTo: siteUrl(), shouldCreateUser: false },
    });
    setBusy(null);
    if (error) return setError(error.message);
    setNotice("Check your email for a sign-in link.");
  }

  return (
    <Screen title="Sign in" width="form" center>
      <Brand size={96} />
      <H1 center>Sign in</H1>
      <Card>
        <TextField
          ref={emailRef}
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
        />
        <TextField
          ref={passwordRef}
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="password"
          textContentType="password"
          onSubmitEditing={withPassword}
        />
        {error ? <Body style={{ color: colors.danger }}>{error}</Body> : null}
        {notice ? <Body style={{ color: colors.ok }}>{notice}</Body> : null}
        {unconfirmed ? <Button title="Send me a new confirmation link" variant="secondary" full loading={busy === "link"} disabled={!!busy} onPress={resend} /> : null}
        <View style={s.actions}>
          <Button title="Sign in" full loading={busy === "password"} disabled={!!busy} onPress={withPassword} />
          {Platform.OS === "web" ? (
            <Button
              title="Email me a sign-in link"
              variant="ghost"
              full
              loading={busy === "link"}
              disabled={!!busy}
              onPress={withLink}
            />
          ) : null}
          <Button title="Forgot your password?" variant="ghost" full disabled={!!busy} onPress={forgot} />
        </View>
      </Card>
      <Small center>
        New here?{" "}
        <Link href="/welcome" style={s.link}>
          Create an account
        </Link>
      </Small>
    </Screen>
  );
}

const s = StyleSheet.create({
  actions: { gap: space.sm, marginTop: space.sm },
  link: { color: colors.gold, fontFamily: "Barlow_600SemiBold" },
});
