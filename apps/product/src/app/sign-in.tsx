import { useState } from "react";
import { Link, useRouter } from "expo-router";
import { Platform, StyleSheet, View } from "react-native";
import { Brand } from "@/components/Brand";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Screen } from "@/components/ui/Screen";
import { TextField } from "@/components/ui/TextField";
import { Body, H1, Small } from "@/components/ui/Text";
import { siteUrl, supabase } from "@/lib/supabase";
import { colors, space } from "@/theme/tokens";

export default function SignIn() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<"password" | "link" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function withPassword() {
    setBusy("password");
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(null);
    if (error) return setError(error.message);
    router.replace("/");
  }

  async function forgot() {
    if (!email.trim()) return setError("Enter your email first.");
    setBusy("link");
    setError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${siteUrl()}/reset-password` });
    setBusy(null);
    if (error) return setError(error.message);
    setNotice("Check your email for a link to set a new password.");
  }

  async function withLink() {
    if (!email.trim()) return setError("Enter your email first.");
    setBusy("link");
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
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
          autoComplete="password"
          textContentType="password"
          onSubmitEditing={withPassword}
        />
        {error ? <Body style={{ color: colors.danger }}>{error}</Body> : null}
        {notice ? <Body style={{ color: colors.ok }}>{notice}</Body> : null}
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
