import { useEffect, useState } from "react";
import { Link, useLocalSearchParams } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { Brand } from "@/components/Brand";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Screen } from "@/components/ui/Screen";
import { Body, H1, H3, Label, Small } from "@/components/ui/Text";
import { resendConfirmation } from "@/lib/signup";
import { marketingUrl } from "@/lib/site";
import { colors, fonts, radius, space } from "@/theme/tokens";

// After a mentor application is submitted. With ?confirm=1 the email still needs confirming.
export default function Applied() {
  const params = useLocalSearchParams<{ email?: string; confirm?: string }>();
  // The page is prerendered without query params; read them only after hydration so the first
  // client render matches the static HTML (otherwise React reports a text mismatch).
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const email = hydrated ? params.email : undefined;
  const needsConfirm = hydrated && params.confirm === "1";
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const steps = [
    { n: "1", title: "We review every application", body: "A member of the FLP team reads each one before a mentor joins the marketplace. That review exists to keep the young athletes on this platform safe, so we take our time with it." },
    { n: "2", title: "Watch your inbox", body: `Every update comes by email${email ? ` to ${email}` : ""}. Check your spam folder if nothing arrives, and add firstlineperform.com to your safe-sender list so nothing from us goes missing.` },
    { n: "3", title: "Then you're live", body: "Once approved you'll get an email with your next steps. Your profile goes onto the marketplace and families can start booking you." },
  ];
  return (
    <Screen title="Application received" width="form" center>
      <Brand size={96} />
      <View style={{ alignItems: "center", gap: 6 }}>
        <Label>Mentor application</Label>
        <H1 center>Thank you for applying.</H1>
        <Body center style={{ color: colors.muted }}>Your application is in. Here is what happens next.</Body>
      </View>
      {needsConfirm ? (
        <Card style={s.confirm}>
          <H3 style={{ color: colors.gold }}>First, confirm your email</H3>
          <Body>We sent a confirmation link{email ? ` to ${email}` : ""}. Opening it activates your account. It can take a couple of minutes to arrive, so check spam too.</Body>
          <View style={s.row}>
            <Button title="Resend the email" variant="secondary" small loading={busy} onPress={async () => { if (!email) return; setBusy(true); setError(null); try { await resendConfirmation(email); setNote(`Sent again to ${email}.`); } catch (e) { setError((e as Error).message); } setBusy(false); }} />
            {note ? <Small style={{ color: colors.ok }}>{note}</Small> : null}
            {error ? <Small style={{ color: colors.danger }}>{error}</Small> : null}
          </View>
        </Card>
      ) : null}
      <Card style={{ gap: space.md }}>
        {steps.map((st) => (
          <View key={st.n} style={s.step}>
            <View style={s.num}><Text style={s.numText}>{st.n}</Text></View>
            <View style={{ flex: 1, gap: 2 }}>
              <H3>{st.title}</H3>
              <Body style={{ color: colors.muted }}>{st.body}</Body>
            </View>
          </View>
        ))}
      </Card>
      <View style={s.row}>
        {needsConfirm ? null : <Link href="/sign-in" asChild><Button title="Sign in" /></Link>}
        <Button title="Back to firstlineperform.com" variant="ghost" onPress={() => window.open(marketingUrl(""), "_self")} />
      </View>
      <Small center>Questions? Email support@firstlineperform.com.</Small>
    </Screen>
  );
}

const s = StyleSheet.create({
  confirm: { borderColor: colors.gold, backgroundColor: colors.goldSoft },
  row: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, alignItems: "center", justifyContent: "center" },
  step: { flexDirection: "row", gap: space.md, alignItems: "flex-start" },
  num: { width: 32, height: 32, borderRadius: 16, borderWidth: 1.5, borderColor: colors.gold, alignItems: "center", justifyContent: "center" },
  numText: { fontFamily: fonts.display, fontSize: 16, color: colors.gold },
});
