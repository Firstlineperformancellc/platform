import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { TextField } from "@/components/ui/TextField";
import { Body, H3, Label, Small } from "@/components/ui/Text";
import { AWARDS_MAX, CAREER_MAX_ROWS, emptyRow, fmtGaa, fmtSv, hasGoalie, hasSkater, parseCareerPaste, saveCareer, type CareerRow } from "@/lib/career";
import type { HockeyPosition } from "@/lib/types";
import { colors, radius, space } from "@/theme/tokens";

type Props = { positions: HockeyPosition[]; initialRows: CareerRow[]; initialAwards: string[]; initialNote: string | null; onSaved?: () => void };

// The mentor's "Career" card: an editable table of seasons, a paste-from-Elite-Prospects helper that
// turns copied text into rows for review, an awards list, a one-line note, and a confirmation.
export function CareerEditor({ positions, initialRows, initialAwards, initialNote, onSaved }: Props) {
  const goalie = hasGoalie(positions);
  const skater = hasSkater(positions) || !goalie;
  const [rows, setRows] = useState<CareerRow[]>(initialRows);
  const [awards, setAwards] = useState<string[]>(initialAwards);
  const [note, setNote] = useState(initialNote ?? "");
  const [paste, setPaste] = useState("");
  const [preview, setPreview] = useState<{ rows: CareerRow[]; skipped: number } | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setRow = (i: number, patch: Partial<CareerRow>) => setRows((cur) => cur.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const move = (i: number, d: -1 | 1) => setRows((cur) => { const n = [...cur]; const j = i + d; if (j < 0 || j >= n.length) return cur; [n[i], n[j]] = [n[j]!, n[i]!]; return n; });
  const int = (v: string) => (v.trim() === "" ? null : Number.isInteger(Number(v)) ? Number(v) : null);
  const dec = (v: string) => (v.trim() === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);

  function readPaste() {
    setError(null);
    const r = parseCareerPaste(paste, goalie && !hasSkater(positions));
    if (r.rows.length === 0) return setError("Couldn't find any seasons in that text. Copy the rows of the stats table, one season per line.");
    setPreview(r);
  }

  async function save() {
    setError(null);
    setMsg(null);
    if (rows.length > CAREER_MAX_ROWS) return setError(`You can list up to ${CAREER_MAX_ROWS} seasons.`);
    if (!confirmed) return setError("Tick \"I confirm this information is accurate\" before saving.");
    setBusy(true);
    try {
      await saveCareer(rows, awards.map((a) => a.trim()).filter(Boolean), note.trim() || null);
      setMsg("Career saved. It shows on your public page now.");
      onSaved?.();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  return (
    <Card>
      <H3>Career</H3>
      <Body style={{ color: colors.muted }}>Your seasons, teams and stats, shown on your public page so a parent sees your history without leaving FLP. Fill the table by hand, or paste it from Elite Prospects and check the result.</Body>

      <View style={s.pasteBox}>
        <Label>Paste from Elite Prospects</Label>
        <Small>On your Elite Prospects page, select the rows of the stats table, copy, and paste here. One season per line. Nothing is fetched; only what you paste is read.</Small>
        <TextField label="" value={paste} onChangeText={setPaste} multiline style={s.paste} placeholder={"2021-22\tMichigan Tech\tNCAA\t34\t10\t15\t25\t12"} />
        <View style={s.actions}>
          <Button title="Read the paste" variant="secondary" small onPress={readPaste} disabled={!paste.trim()} />
          {preview ? <Button title="Discard" variant="ghost" small onPress={() => setPreview(null)} /> : null}
        </View>
        {preview ? (
          <View style={{ gap: space.xs }}>
            <Small>Found {preview.rows.length} season{preview.rows.length === 1 ? "" : "s"}{preview.skipped ? `, skipped ${preview.skipped} line${preview.skipped === 1 ? "" : "s"} that weren't seasons` : ""}. Check them, then add them to your table and fix anything there.</Small>
            {preview.rows.slice(0, 8).map((r, i) => (
              <Small key={i}>{r.season} · {r.team}{r.league ? ` · ${r.league}` : ""} · GP {r.games ?? "–"}{goalie && !hasSkater(positions) ? ` · GAA ${fmtGaa(r.gaa) || "–"} · SV% ${fmtSv(r.sv_pct) || "–"}` : ` · ${r.goals ?? "–"} G ${r.assists ?? "–"} A ${r.points ?? "–"} P`}</Small>
            ))}
            {preview.rows.length > 8 ? <Small>… and {preview.rows.length - 8} more.</Small> : null}
            <View style={s.actions}>
              <Button title="Use these rows" small onPress={() => { setRows(preview.rows.slice(0, CAREER_MAX_ROWS)); setPreview(null); setPaste(""); }} />
              <Button title="Add to my rows" variant="secondary" small onPress={() => { setRows((cur) => [...cur, ...preview.rows].slice(0, CAREER_MAX_ROWS)); setPreview(null); setPaste(""); }} />
            </View>
          </View>
        ) : null}
      </View>

      <Label>Seasons ({rows.length} of {CAREER_MAX_ROWS})</Label>
      {rows.length === 0 ? <Small>No seasons yet. Paste them above or add a row.</Small> : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ gap: space.xs }}>
          {rows.map((r, i) => (
            <View key={i} style={[s.row, !r.visible && s.hidden]}>
              <TextField label={i === 0 ? "Season" : ""} value={r.season} onChangeText={(v) => setRow(i, { season: v })} placeholder="2021-22" style={{ width: 92 }} />
              <TextField label={i === 0 ? "Team" : ""} value={r.team} onChangeText={(v) => setRow(i, { team: v })} style={{ width: 190 }} />
              <TextField label={i === 0 ? "League" : ""} value={r.league ?? ""} onChangeText={(v) => setRow(i, { league: v || null })} style={{ width: 100 }} />
              <TextField label={i === 0 ? "GP" : ""} value={r.games == null ? "" : String(r.games)} onChangeText={(v) => setRow(i, { games: int(v) })} keyboardType="number-pad" style={s.num} />
              {skater ? (
                <>
                  <TextField label={i === 0 ? "G" : ""} value={r.goals == null ? "" : String(r.goals)} onChangeText={(v) => setRow(i, { goals: int(v) })} keyboardType="number-pad" style={s.num} />
                  <TextField label={i === 0 ? "A" : ""} value={r.assists == null ? "" : String(r.assists)} onChangeText={(v) => setRow(i, { assists: int(v) })} keyboardType="number-pad" style={s.num} />
                  <TextField label={i === 0 ? "P" : ""} value={r.points == null ? "" : String(r.points)} onChangeText={(v) => setRow(i, { points: int(v) })} keyboardType="number-pad" style={s.num} />
                  <TextField label={i === 0 ? "PIM" : ""} value={r.pim == null ? "" : String(r.pim)} onChangeText={(v) => setRow(i, { pim: int(v) })} keyboardType="number-pad" style={s.num} />
                </>
              ) : null}
              {goalie ? (
                <>
                  <TextField label={i === 0 ? "GAA" : ""} value={r.gaa == null ? "" : String(r.gaa)} onChangeText={(v) => setRow(i, { gaa: dec(v) })} keyboardType="decimal-pad" style={s.num} placeholder="2.45" />
                  <TextField label={i === 0 ? "SV%" : ""} value={r.sv_pct == null ? "" : String(r.sv_pct)} onChangeText={(v) => setRow(i, { sv_pct: dec(v) })} keyboardType="decimal-pad" style={s.num} placeholder=".915" />
                </>
              ) : null}
              <View style={s.rowActions}>
                <Checkbox label="Show" checked={r.visible} onChange={(v) => setRow(i, { visible: v })} />
                <Button title="▲" variant="ghost" small onPress={() => move(i, -1)} disabled={i === 0} />
                <Button title="▼" variant="ghost" small onPress={() => move(i, 1)} disabled={i === rows.length - 1} />
                <Button title="Remove" variant="ghost" small onPress={() => setRows((cur) => cur.filter((_, j) => j !== i))} />
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
      <View style={s.actions}>
        <Button title="Add a season" variant="secondary" small onPress={() => setRows((cur) => (cur.length >= CAREER_MAX_ROWS ? cur : [...cur, emptyRow()]))} disabled={rows.length >= CAREER_MAX_ROWS} />
      </View>
      <Small>Hidden rows stay here but don't show on your public page.</Small>

      <Label>Awards and honours ({awards.length} of {AWARDS_MAX})</Label>
      {awards.map((a, i) => (
        <View key={i} style={s.awardRow}>
          <TextField label="" value={a} onChangeText={(v) => setAwards((cur) => cur.map((x, j) => (j === i ? v : x)))} placeholder="e.g. All-Conference First Team 2022" style={{ flex: 1, minWidth: 220 }} maxLength={120} />
          <Button title="Remove" variant="ghost" small onPress={() => setAwards((cur) => cur.filter((_, j) => j !== i))} />
        </View>
      ))}
      <View style={s.actions}>
        <Button title="Add an award" variant="secondary" small onPress={() => setAwards((cur) => (cur.length >= AWARDS_MAX ? cur : [...cur, ""]))} disabled={awards.length >= AWARDS_MAX} />
      </View>
      <TextField label="One line under the table (optional)" value={note} onChangeText={(v) => setNote(v.slice(0, 120))} placeholder="e.g. Captain 2022-23" hint={`${note.length} / 120`} />

      <Checkbox label="I confirm this information is accurate." checked={confirmed} onChange={setConfirmed} />
      {error ? <Body style={{ color: colors.danger }}>{error}</Body> : null}
      {msg ? <Body style={{ color: colors.ok }}>{msg}</Body> : null}
      <Button title="Save career" small loading={busy} onPress={save} />
    </Card>
  );
}

const s = StyleSheet.create({
  pasteBox: { gap: space.sm, padding: space.md, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md },
  paste: { height: 110, paddingTop: space.sm, textAlignVertical: "top", fontFamily: "Menlo" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, alignItems: "center" },
  row: { flexDirection: "row", gap: space.xs, alignItems: "flex-end" },
  hidden: { opacity: 0.55 },
  num: { width: 62 },
  rowActions: { flexDirection: "row", alignItems: "center", gap: 2, paddingBottom: 4 },
  awardRow: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, alignItems: "flex-end" },
});
