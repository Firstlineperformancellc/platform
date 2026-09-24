import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { StyleSheet, View } from "react-native";
import { SupportShell } from "@/components/SupportShell";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { TextField } from "@/components/ui/TextField";
import { Body, H3, Small } from "@/components/ui/Text";
import { deleteCanned, listCanned, saveCanned, type Canned } from "@/lib/support";
import { colors, space } from "@/theme/tokens";

// Saved replies the whole team shares. Insert one into a reply, then edit it before sending.
export default function CannedReplies() {
  const [rows, setRows] = useState<Canned[]>([]);
  const [draft, setDraft] = useState<{ id?: string; title: string; body: string; sort: string }>({ title: "", body: "", sort: "0" });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => { listCanned().then(setRows); }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key); setError(null);
    try { await fn(); load(); } catch (e) { setError((e as Error).message); }
    setBusy(null);
  }

  return (
    <SupportShell title="Canned replies">
      <Card>
        <H3>{draft.id ? "Edit reply" : "New canned reply"}</H3>
        <TextField label="Title (what you'll pick from the list)" value={draft.title} onChangeText={(v) => setDraft({ ...draft, title: v })} />
        <TextField label="Body" value={draft.body} onChangeText={(v) => setDraft({ ...draft, body: v })} multiline style={s.multi} />
        <TextField label="Sort order" value={draft.sort} onChangeText={(v) => setDraft({ ...draft, sort: v })} keyboardType="number-pad" style={{ maxWidth: 120 }} />
        <View style={s.row}>
          <Button title={draft.id ? "Save changes" : "Add reply"} small loading={busy === "save"} disabled={!draft.title.trim() || !draft.body.trim()} onPress={() => run("save", async () => { await saveCanned({ id: draft.id, title: draft.title, body: draft.body, sort: Number(draft.sort) || 0 }); setDraft({ title: "", body: "", sort: "0" }); })} />
          {draft.id ? <Button title="Cancel" variant="ghost" small onPress={() => setDraft({ title: "", body: "", sort: "0" })} /> : null}
        </View>
        {error ? <Body style={{ color: colors.danger }}>{error}</Body> : null}
      </Card>
      {rows.map((c) => (
        <Card key={c.id}>
          <H3>{c.title}</H3>
          <Body style={{ color: colors.muted }}>{c.body}</Body>
          <View style={s.row}>
            <Button title="Edit" variant="secondary" small onPress={() => setDraft({ id: c.id, title: c.title, body: c.body, sort: String(c.sort) })} />
            <Button title="Delete" variant="ghost" small loading={busy === c.id} onPress={() => run(c.id, () => deleteCanned(c.id))} />
            <Small>order {c.sort}</Small>
          </View>
        </Card>
      ))}
    </SupportShell>
  );
}

const s = StyleSheet.create({ row: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, alignItems: "center" }, multi: { minHeight: 110, textAlignVertical: "top" } });
