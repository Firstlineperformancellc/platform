import { useEffect, useState } from "react";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";
import { Brand } from "@/components/Brand";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Choice } from "@/components/ui/Choice";
import { Screen } from "@/components/ui/Screen";
import { TextField } from "@/components/ui/TextField";
import { Body, H1, Label, Small } from "@/components/ui/Text";
import { Loading } from "@/lib/auth";
import { getPlayer, savePlayer, type PlayerInput } from "@/lib/players";
import { useSettings } from "@/lib/settings";
import type { HockeyPosition } from "@/lib/types";
import { colors, space } from "@/theme/tokens";

const EMPTY: PlayerInput = { first_name: "", last_name: "", age_group: "", position: "forward", skill_level: "", current_team: "", notes: "" };

// One screen for both "new" and "edit": the route param is the player id or the word "new".
export default function PlayerForm() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === "new";
  const router = useRouter();
  const { settings } = useSettings();
  const [form, setForm] = useState<PlayerInput | null>(isNew ? EMPTY : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isNew && id) getPlayer(id).then((p) => setForm(p ? { ...EMPTY, ...p } : EMPTY));
  }, [id, isNew]);

  if (!form || !settings) return <Loading />;
  const set = (patch: Partial<PlayerInput>) => setForm({ ...form, ...patch });

  async function submit() {
    if (!form) return;
    if (!form.first_name.trim()) return setError("Enter a first name.");
    if (!form.age_group) return setError("Pick an age group.");
    if (!form.skill_level) return setError("Pick a level.");
    setBusy(true);
    setError(null);
    try {
      await savePlayer({ ...form, first_name: form.first_name.trim(), last_name: form.last_name.trim() }, isNew ? undefined : id);
      router.replace("/parent/players");
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <Screen width="form">
      <View style={s.topbar}>
        <Brand size={44} />
        <Link href="/parent/players" asChild>
          <Button title="Back" variant="ghost" small />
        </Link>
      </View>
      <View>
        <Label>Youth athlete</Label>
        <H1>{isNew ? "Add a youth athlete" : "Edit youth athlete"}</H1>
        <Body style={{ color: colors.muted }}>Only a first name and last initial ever appear to an FLP Mentor.</Body>
      </View>
      <Card>
        <TextField label="First name" value={form.first_name} onChangeText={(v) => set({ first_name: v })} autoComplete="off" />
        <TextField label="Last name" value={form.last_name} onChangeText={(v) => set({ last_name: v })} hint="Shown as an initial." />
        <Choice label="Age group" options={settings.taxonomy.age_groups.map((a) => ({ key: a, label: a }))} value={form.age_group} onChange={(v) => set({ age_group: v as string })} />
        <Choice label="Position" options={settings.taxonomy.positions} value={form.position} onChange={(v) => set({ position: v as HockeyPosition })} />
        <Choice label="Level" options={settings.taxonomy.skill_levels.map((l) => ({ key: l, label: l }))} value={form.skill_level} onChange={(v) => set({ skill_level: v as string })} />
        <TextField label="Current team" value={form.current_team} onChangeText={(v) => set({ current_team: v })} placeholder="e.g. Detroit Little Caesars 14U AAA" />
        {error ? <Body style={{ color: colors.danger }}>{error}</Body> : null}
        <Button title={isNew ? "Add youth athlete" : "Save"} full loading={busy} onPress={submit} />
        <Small>You're their Original Coach. Everything ordered here is filed under them.</Small>
      </Card>
    </Screen>
  );
}

const s = StyleSheet.create({ topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" } });
