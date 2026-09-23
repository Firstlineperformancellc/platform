import { useEffect, useState } from "react";
import { Link, useRouter } from "expo-router";
import { StyleSheet } from "react-native";
import { Brand } from "@/components/Brand";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Screen } from "@/components/ui/Screen";
import { TextField } from "@/components/ui/TextField";
import { Body, H1, Small } from "@/components/ui/Text";
import { supabase } from "@/lib/supabase";
import { colors } from "@/theme/tokens";

// Landing page of the password-reset email. The link signs the person in with a recovery session;
// this screen sets the new password and sends them on.
export default function ResetPassword() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setReady(Boolean(data.session)));
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function submit() {
    if (password.length < 8) return setError("Use a password of at least 8 characters.");
    if (password !== again) return setError("The two passwords don't match.");
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return setError(error.message);
    router.replace("/");
  }

  return (
    <Screen title="Set a new password" width="form" center>
      <Brand size={96} />
      <H1 center>Set a new password</H1>
      <Card>
        {ready ? (
          <>
            <TextField label="New password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" hint="At least 8 characters." />
            <TextField label="New password again" value={again} onChangeText={setAgain} secureTextEntry autoComplete="new-password" onSubmitEditing={submit} />
            {error ? <Body style={{ color: colors.danger }}>{error}</Body> : null}
            <Button title="Save password" full loading={busy} onPress={submit} />
          </>
        ) : (
          <Body style={{ color: colors.muted }}>Open this page from the link in your password-reset email. If the link has expired, request a new one from the sign-in page.</Body>
        )}
      </Card>
      <Small center>
        <Link href="/sign-in" style={s.link}>
          Back to sign in
        </Link>
      </Small>
    </Screen>
  );
}

const s = StyleSheet.create({ link: { color: colors.gold, fontFamily: "Barlow_600SemiBold" } });
