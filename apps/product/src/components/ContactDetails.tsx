import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";
import { TextField } from "./ui/TextField";
import { Body, H3, Small } from "./ui/Text";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { colors, space } from "@/theme/tokens";

// Name, phone and mailing address on the person's own profile row. Admins see these on the Users page.
export function ContactDetails() {
  const { session, refresh } = useAuth();
  const [form, setForm] = useState({ full_name: "", phone: "", address: "" });
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!session) return;
    supabase.from("profiles").select("full_name, phone, address").eq("id", session.user.id).maybeSingle().then(({ data }) => {
      if (data) setForm({ full_name: data.full_name ?? "", phone: data.phone ?? "", address: data.address ?? "" });
      setLoaded(true);
    });
  }, [session]);
  async function save() {
    if (!session) return;
    setBusy(true); setMsg(null); setError(null);
    const { error: e } = await supabase.from("profiles").update({ full_name: form.full_name.trim(), phone: form.phone.trim() || null, address: form.address.trim() || null }).eq("id", session.user.id);
    if (e) setError(e.message); else { setMsg("Saved."); refresh(); }
    setBusy(false);
  }
  return (
    <Card>
      <H3>Your details</H3>
      <Small>How FLP reaches you if we need to. Your sign-in email is {session?.user.email ?? ""}; write to support to change it.</Small>
      {loaded ? (
        <>
          <TextField label="Full name" value={form.full_name} onChangeText={(v) => setForm({ ...form, full_name: v })} autoCapitalize="words" />
          <TextField label="Phone" value={form.phone} onChangeText={(v) => setForm({ ...form, phone: v })} keyboardType="phone-pad" placeholder="(555) 555-5555" />
          <TextField label="Mailing address" value={form.address} onChangeText={(v) => setForm({ ...form, address: v })} multiline style={s.multi} placeholder={"Street\nCity, State ZIP"} />
          <View style={s.row}>
            <Button title="Save details" small loading={busy} onPress={save} />
            {msg ? <Body style={{ color: colors.ok }}>{msg}</Body> : null}
            {error ? <Body style={{ color: colors.danger }}>{error}</Body> : null}
          </View>
        </>
      ) : (
        <Small>Loading…</Small>
      )}
    </Card>
  );
}

const s = StyleSheet.create({ multi: { minHeight: 80, textAlignVertical: "top" }, row: { flexDirection: "row", alignItems: "center", gap: space.md, flexWrap: "wrap" } });
