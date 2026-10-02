import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import { AdminShell } from "@/components/AdminShell";
import { MentorCard } from "@/components/MentorCard";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { Choice } from "@/components/ui/Choice";
import { Dropdown } from "@/components/ui/Dropdown";
import { Pill } from "@/components/ui/Pill";
import { TextField } from "@/components/ui/TextField";
import { Body, H3, Small } from "@/components/ui/Text";
import { listMentors as listAdminMentors, patchMentor, type AdminMentor } from "@/lib/admin";
import { Loading } from "@/lib/auth";
import { listMentors, type MarketplaceMentor } from "@/lib/mentors";
import { MARKETPLACE_DEFAULTS, marketOptions, money, refreshSettings, useSettings, type MarketplaceOptions, type Settings } from "@/lib/settings";
import { createTier, deleteTier, listAllTiers, listTierHistory, reorderTiers, restoreTier, saveMarketplaceOptions, updateTier, type TierAdmin, type TierChange, type TierPatch } from "@/lib/tiers";
import { colors, radius, space } from "@/theme/tokens";

// What an admin types for a level; money in dollars.
type Draft = { name: string; description: string; visible: boolean; direct_link: boolean; price_visible: boolean; breakdown: string; share: string; fr30: string; fr60: string; addon: string; arc: string; turnaround: string; capacity: string; color: string };
const dollars = (c: number | null | undefined) => (c == null ? "" : String(c / 100));
const cents = (s: string) => (s.trim() === "" ? null : Math.round(Number(s) * 100));
const toDraft = (t: TierAdmin): Draft => ({ name: t.name, description: t.description, visible: t.visible, direct_link: t.direct_link, price_visible: t.price_visible, breakdown: dollars(t.breakdown_price_cents), share: String(t.mentor_share_pct), fr30: dollars(t.film_room_30_cents), fr60: dollars(t.film_room_60_cents), addon: dollars(t.addon_30_cents), arc: dollars(t.season_arc_cents), turnaround: t.turnaround_hours == null ? "" : String(t.turnaround_hours), capacity: t.capacity_default == null ? "" : String(t.capacity_default), color: t.color ?? "" });
const EMPTY: Draft = { name: "", description: "", visible: true, direct_link: false, price_visible: true, breakdown: "", share: "60", fr30: "", fr60: "", addon: "", arc: "", turnaround: "", capacity: "", color: "" };
const SWATCHES: { hex: string; label: string }[] = [
  { hex: "#D4A32C", label: "Gold" }, { hex: "#C0C6CF", label: "Silver" }, { hex: "#CD7F32", label: "Bronze" }, { hex: "#4C9BE8", label: "Blue" },
  { hex: "#4CC38A", label: "Green" }, { hex: "#E5484D", label: "Red" }, { hex: "#A78BFA", label: "Purple" }, { hex: "#F2F2F2", label: "White" },
];
const KINDS = [
  { key: "breakdown", label: "Breakdown ($)" }, { key: "film_room_30", label: "Film Room 30 ($)" }, { key: "film_room_60", label: "Film Room 60 ($)" }, { key: "addon_30", label: "Add-on 30 ($)" }, { key: "season_arc", label: "Season Arc ($)" },
] as const;
function toPatch(d: Draft): TierPatch | string {
  const nums = [d.breakdown, d.share, d.fr30, d.fr60, d.addon, d.arc, d.turnaround, d.capacity].filter((x) => x.trim() !== "");
  if (nums.some((x) => !Number.isFinite(Number(x)) || Number(x) < 0)) return "Prices and the share must be numbers, zero or more.";
  if (!d.name.trim()) return "Give the level a name.";
  return {
    name: d.name.trim(), description: d.description.trim(), visible: d.visible, direct_link: d.visible ? false : d.direct_link, price_visible: d.price_visible,
    turnaround_hours: d.turnaround.trim() === "" ? null : Math.round(Number(d.turnaround)), capacity_default: d.capacity.trim() === "" ? null : Math.round(Number(d.capacity)), color: d.color || null,
    breakdown_price_cents: cents(d.breakdown) ?? 0, mentor_share_pct: Math.round(Number(d.share || "0")),
    film_room_30_cents: cents(d.fr30), film_room_60_cents: cents(d.fr60), addon_30_cents: cents(d.addon), season_arc_cents: cents(d.arc),
  };
}
const TILE_TOGGLES: { key: keyof MarketplaceOptions; label: string }[] = [
  { key: "show_price", label: "Price" },
  { key: "show_availability", label: "Available / Waitlist" },
  { key: "show_rating", label: "Star rating" },
  { key: "show_turnaround", label: "Typical turnaround" },
  { key: "show_positions", label: "Positions" },
  { key: "show_badges", label: "Credential badges" },
  { key: "show_bio", label: "Bio excerpt" },
];

// The marketplace control center: the level hierarchy, what the mentor tiles show, and who is listed.
export default function AdminMarketplace() {
  const { settings } = useSettings();
  const [levels, setLevels] = useState<TierAdmin[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [adding, setAdding] = useState<Draft>(EMPTY);
  const [mentors, setMentors] = useState<AdminMentor[]>([]);
  const [sample, setSample] = useState<MarketplaceMentor | null>(null);
  const [opts, setOpts] = useState<MarketplaceOptions | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [pricesFor, setPricesFor] = useState<string | null>(null);
  const [priceDraft, setPriceDraft] = useState<Record<string, string>>({});
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const [history, setHistory] = useState<TierChange[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [ls, ms, fresh] = await Promise.all([listAllTiers(), listAdminMentors(), refreshSettings()]);
    setLevels(ls);
    setDrafts(Object.fromEntries(ls.map((t) => [t.key, toDraft(t)])));
    setMentors(ms.filter((m) => m.status === "approved"));
    setOpts((cur) => cur ?? marketOptions(fresh));
    listMentors().then((pub) => setSample(pub[0] ?? null)).catch(() => {});
  }, []);
  useFocusEffect(useCallback(() => { load().catch((e) => setError((e as Error).message)); }, [load]));

  if (!settings || !levels || !opts) return <AdminShell title="Mentor levels & tiles"><Loading /></AdminShell>;

  async function run(key: string, fn: () => Promise<unknown>, done?: string) {
    setBusy(key); setError(null); setMsg(null);
    try { await fn(); if (done) setMsg(done); await load(); } catch (e) { setError((e as Error).message); }
    setBusy(null);
  }
  const live = levels.filter((t) => !t.archived_at);
  const retired = levels.filter((t) => t.archived_at);
  const countOn = (key: string) => mentors.filter((m) => m.tier === key).length;
  const set = (key: string, patch: Partial<Draft>) => setDrafts((d) => ({ ...d, [key]: { ...d[key], ...patch } }));
  const move = (key: string, dir: -1 | 1) => {
    const keys = live.map((t) => t.key); const i = keys.indexOf(key); const j = i + dir;
    if (j < 0 || j >= keys.length) return;
    [keys[i], keys[j]] = [keys[j], keys[i]];
    run(`move-${key}`, () => reorderTiers(keys));
  };
  const previewSettings: Settings = { ...settings, marketplace: opts };

  const fieldsFor = (d: Draft, on: (p: Partial<Draft>) => void) => (
    <>
      <View style={s.grid}>
        <View style={s.wide}><TextField label="Level name" value={d.name} onChangeText={(v) => on({ name: v })} placeholder="e.g. Olympian" /></View>
        <View style={s.wide}><TextField label="One line about this level (optional)" value={d.description} onChangeText={(v) => on({ description: v })} placeholder="Shown under the level heading when the marketplace is grouped" /></View>
      </View>
      <View style={s.checks}>
        <Checkbox label="Visible on the marketplace" checked={d.visible} onChange={(v) => on({ visible: v })} hint={d.visible ? "Parents can see mentors on this level." : "Private: mentors on this level are hidden from the public marketplace."} />
        {!d.visible ? <Checkbox label="Bookable by direct link" checked={d.direct_link} onChange={(v) => on({ direct_link: v })} hint={d.direct_link ? "Not in the marketplace list, but a mentor's profile link works and parents can order from it." : "Fully hidden: profile links do not open and nobody can order."} /> : null}
        <Checkbox label="Show the price" checked={d.price_visible} onChange={(v) => on({ price_visible: v })} hint={d.price_visible ? "Parents see the price and can check out on their own." : "Tiles read \"Please contact for pricing\" and parents are sent to FLP instead of checkout."} />
      </View>
      <View style={s.grid}>
        <View style={s.cell}><TextField label="Breakdown ($)" value={d.breakdown} onChangeText={(v) => on({ breakdown: v })} keyboardType="decimal-pad" /></View>
        <View style={s.cell}><TextField label="Mentor share (%)" value={d.share} onChangeText={(v) => on({ share: v })} keyboardType="number-pad" /></View>
        <View style={s.cell}><TextField label="Film Room 30 min ($)" value={d.fr30} onChangeText={(v) => on({ fr30: v })} keyboardType="decimal-pad" /></View>
        <View style={s.cell}><TextField label="Film Room 60 min ($)" value={d.fr60} onChangeText={(v) => on({ fr60: v })} keyboardType="decimal-pad" /></View>
        <View style={s.cell}><TextField label="Add-on 30 min ($)" value={d.addon} onChangeText={(v) => on({ addon: v })} keyboardType="decimal-pad" /></View>
        <View style={s.cell}><TextField label="Season Arc pack ($)" value={d.arc} onChangeText={(v) => on({ arc: v })} keyboardType="decimal-pad" /></View>
        <View style={s.cell}><TextField label="Turnaround (hours)" value={d.turnaround} onChangeText={(v) => on({ turnaround: v.replace(/[^0-9]/g, "") })} keyboardType="number-pad" placeholder={`${settings.rules.turnaround_hours} (platform rule)`} /></View>
        <View style={s.cell}><TextField label="Jobs on deck for new mentors" value={d.capacity} onChangeText={(v) => on({ capacity: v.replace(/[^0-9]/g, "") })} keyboardType="number-pad" placeholder={`${settings.rules.capacity_default} (platform rule)`} /></View>
      </View>
      <View style={{ gap: 6 }}>
        <Small>Level colour on tiles</Small>
        <View style={s.swatches}>
          <Pressable accessibilityRole="button" accessibilityLabel="No colour" onPress={() => on({ color: "" })} style={[s.swatch, s.swatchNone, d.color === "" && s.swatchOn]}><Small>–</Small></Pressable>
          {SWATCHES.map((c) => (
            <Pressable key={c.hex} accessibilityRole="button" accessibilityLabel={c.label} onPress={() => on({ color: c.hex })} style={[s.swatch, { backgroundColor: c.hex }, d.color.toLowerCase() === c.hex.toLowerCase() && s.swatchOn]} />
          ))}
          <Small style={d.color ? { color: d.color } : undefined}>{d.name || "Level"}{d.color ? "" : " (default gold)"}</Small>
        </View>
      </View>
    </>
  );

  return (
    <AdminShell title="Mentor levels & tiles">
      {msg ? <Body style={{ color: colors.ok }}>{msg}</Body> : null}
      {error ? <Body style={{ color: colors.danger }}>{error}</Body> : null}

      <View>
        <H3>Mentor levels</H3>
        <Small>The hierarchy, top to bottom. Order here is the order parents see. Prices and the mentor's share live on each level.</Small>
      </View>
      {live.map((t, i) => {
        const d = drafts[t.key] ?? toDraft(t);
        const n = countOn(t.key);
        return (
          <Card key={t.key} style={StyleSheet.flatten([!t.visible && s.private])}>
            <View style={s.head}>
              <View style={s.rank}><Body style={{ color: colors.gold }}>{i + 1}</Body></View>
              <View style={{ flex: 1, minWidth: 160 }}>
                <H3>{t.name}</H3>
                <Small>{n} mentor{n === 1 ? "" : "s"} · breakdown {t.price_visible ? money(t.breakdown_price_cents) : "by arrangement"}</Small>
              </View>
              <View style={s.pills}>
                {t.visible ? <Pill tone="ok">Visible</Pill> : t.direct_link ? <Pill tone="warn">Direct link only</Pill> : <Pill tone="warn">Private</Pill>}
                {!t.price_visible ? <Pill tone="muted">Contact for pricing</Pill> : null}
              </View>
              <View style={s.pills}>
                <Button title="▲" variant="ghost" small disabled={i === 0} loading={busy === `move-${t.key}`} onPress={() => move(t.key, -1)} />
                <Button title="▼" variant="ghost" small disabled={i === live.length - 1} onPress={() => move(t.key, 1)} />
              </View>
            </View>
            {fieldsFor(d, (p) => set(t.key, p))}
            <View style={s.actions}>
              <Button title="Save level" small loading={busy === `save-${t.key}`} onPress={() => { const p = toPatch(d); if (typeof p === "string") return setError(p); run(`save-${t.key}`, () => updateTier(t.key, p), `${p.name} saved.`); }} />
              {confirm === t.key ? (
                <>
                  <Small style={{ color: colors.danger, flexShrink: 1 }}>
                    {n > 0 ? `Move its ${n} mentor${n === 1 ? "" : "s"} to another level first.` : "Delete this level? If past orders or sessions used it, it is retired instead so their history keeps its name."}
                  </Small>
                  {n === 0 ? <Button title="Yes, delete" variant="danger" small loading={busy === `del-${t.key}`} onPress={() => run(`del-${t.key}`, async () => { const r = await deleteTier(t.key); setConfirm(null); setMsg(r.archived ? `${t.name} retired (it has history).` : `${t.name} deleted.`); })} /> : null}
                  <Button title="Keep" variant="ghost" small onPress={() => setConfirm(null)} />
                </>
              ) : (
                <Button title="Delete" variant="ghost" small onPress={() => setConfirm(t.key)} />
              )}
            </View>
          </Card>
        );
      })}

      <Card>
        <H3>Add a level</H3>
        {fieldsFor(adding, (p) => setAdding((a) => ({ ...a, ...p })))}
        <View style={s.actions}>
          <Button title="Add level" small loading={busy === "add"} onPress={() => { const p = toPatch(adding); if (typeof p === "string") return setError(p); run("add", async () => { await createTier(p as TierPatch & { name: string }); setAdding(EMPTY); }, `${p.name} added at the bottom of the hierarchy. Use the arrows to place it.`); }} />
          <Small>New levels land at the bottom. Nobody is on a level until you assign mentors below.</Small>
        </View>
      </Card>

      {retired.length ? (
        <Card>
          <H3>Retired levels</H3>
          <Small>Kept only so past orders and sessions keep their label. Restore one to use it again.</Small>
          {retired.map((t) => (
            <View key={t.key} style={s.line}>
              <Body style={{ flex: 1 }}>{t.name}</Body>
              <Button title="Restore" variant="secondary" small loading={busy === `res-${t.key}`} onPress={() => run(`res-${t.key}`, () => restoreTier(t.key), `${t.name} restored as a private level. Make it visible when ready.`)} />
            </View>
          ))}
        </Card>
      ) : null}

      <Card>
        <H3>Mentor tiles</H3>
        <Small>What every tile on the marketplace shows, and how the list is ordered. Featured mentors always come first.</Small>
        <View style={s.checks}>
          {TILE_TOGGLES.map((x) => <Checkbox key={x.key} label={x.label} checked={Boolean(opts[x.key])} onChange={(v) => setOpts({ ...opts, [x.key]: v })} />)}
        </View>
        <Choice label="Order the marketplace by" options={[{ key: "tier", label: "Level hierarchy" }, { key: "rating", label: "Rating" }, { key: "name", label: "Name" }]} value={opts.sort} onChange={(v) => setOpts({ ...opts, sort: v as MarketplaceOptions["sort"] })} />
        <Checkbox label="Group the marketplace under level headings" checked={opts.group_by_tier} onChange={(v) => setOpts({ ...opts, group_by_tier: v })} />
        {sample ? (
          <View style={s.preview}>
            <Small>Preview, using {sample.display_name}:</Small>
            <MentorCard mentor={sample} settings={previewSettings} />
          </View>
        ) : null}
        <View style={s.actions}>
          <Button title="Save tile display" small loading={busy === "tiles"} onPress={() => run("tiles", () => saveMarketplaceOptions(opts), "Tile display saved.")} />
          <Button title="Reset to defaults" variant="ghost" small onPress={() => setOpts(MARKETPLACE_DEFAULTS)} />
        </View>
      </Card>

      <Card>
        <H3>Mentors on the marketplace</H3>
        <Small>Each approved mentor: their level, whether they are listed, and whether they are featured at the top.</Small>
        {mentors.length === 0 ? <Body style={{ color: colors.muted }}>No approved mentors yet.</Body> : null}
        {mentors.map((m) => {
          const lvl = levels.find((t) => t.key === m.tier);
          const hidden = m.listed === false || !lvl || !lvl.visible || Boolean(lvl.archived_at);
          const directOnly = m.listed !== false && lvl && !lvl.visible && lvl.direct_link && !lvl.archived_at;
          const custom = Object.keys(m.price_overrides ?? {}).length;
          return (
            <View key={m.user_id} style={s.mentor}>
              <View style={{ flex: 1, minWidth: 180 }}>
                <Body>{m.display_name}</Body>
                <Small style={{ color: hidden ? colors.warn : colors.ok }}>{directOnly ? "Direct link only" : hidden ? (m.listed === false ? "Not listed" : "Hidden: its level is private") : "On the marketplace"}{custom ? ` · ${custom} custom price${custom === 1 ? "" : "s"}` : ""}</Small>
              </View>
              <View style={{ width: 220 }}>
                <Dropdown label="Level" single options={live.map((t) => ({ key: t.key, label: t.visible ? t.name : `${t.name} (private)` }))} value={m.tier ? [m.tier] : []} onChange={(v) => v[0] && v[0] !== m.tier && run(`lvl-${m.user_id}`, () => patchMentor(m.user_id, { tier: v[0] }))} />
              </View>
              <Checkbox label="Listed" checked={m.listed !== false} onChange={(v) => run(`list-${m.user_id}`, () => patchMentor(m.user_id, { listed: v }))} />
              <Checkbox label="Featured" checked={Boolean(m.featured)} onChange={(v) => run(`feat-${m.user_id}`, () => patchMentor(m.user_id, { featured: v }))} />
              <View style={s.pills}>
                <Button title={pricesFor === m.user_id ? "Hide prices" : "Custom prices"} variant="ghost" small onPress={() => { if (pricesFor === m.user_id) return setPricesFor(null); setPricesFor(m.user_id); setPriceDraft(Object.fromEntries(KINDS.map((k) => [k.key, m.price_overrides?.[k.key] != null ? String((m.price_overrides[k.key] as number) / 100) : ""]))); }} />
                <Button title={historyFor === m.user_id ? "Hide history" : "Level history"} variant="ghost" small onPress={() => { if (historyFor === m.user_id) return setHistoryFor(null); setHistoryFor(m.user_id); setHistory([]); listTierHistory(m.user_id).then(setHistory).catch(() => {}); }} />
              </View>
              {pricesFor === m.user_id ? (
                <View style={s.sub}>
                  <Small>Leave a box blank to use the {lvl?.name ?? "level"} price. A custom price applies to this mentor only.</Small>
                  <View style={s.grid}>
                    {KINDS.map((k) => {
                      const base = lvl ? ({ breakdown: lvl.breakdown_price_cents, film_room_30: lvl.film_room_30_cents, film_room_60: lvl.film_room_60_cents, addon_30: lvl.addon_30_cents, season_arc: lvl.season_arc_cents } as Record<string, number | null>)[k.key] : null;
                      return <View key={k.key} style={s.cell}><TextField label={k.label} value={priceDraft[k.key] ?? ""} onChangeText={(v) => setPriceDraft({ ...priceDraft, [k.key]: v })} keyboardType="decimal-pad" placeholder={base == null ? "not set" : `${base / 100} (level)`} /></View>;
                    })}
                  </View>
                  <View style={s.actions}>
                    <Button title="Save custom prices" small loading={busy === `ov-${m.user_id}`} onPress={() => { const vals = Object.entries(priceDraft).filter(([, v]) => v.trim() !== ""); if (vals.some(([, v]) => !Number.isFinite(Number(v)) || Number(v) < 0)) return setError("Custom prices must be numbers, zero or more."); run(`ov-${m.user_id}`, () => patchMentor(m.user_id, { price_overrides: Object.fromEntries(vals.map(([k, v]) => [k, Math.round(Number(v) * 100)])) }), `Custom prices saved for ${m.display_name}.`); }} />
                    <Button title="Clear all" variant="ghost" small onPress={() => run(`ov-${m.user_id}`, async () => { await patchMentor(m.user_id, { price_overrides: {} }); setPricesFor(null); }, `${m.display_name} is back on the level's prices.`)} />
                  </View>
                </View>
              ) : null}
              {historyFor === m.user_id ? (
                <View style={s.sub}>
                  {history.length === 0 ? <Small>No level changes recorded yet. Changes made from here on are kept.</Small> : null}
                  {history.map((h) => (
                    <Small key={h.id}>{new Date(h.changed_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })} · {h.from_tier ? (levels.find((t) => t.key === h.from_tier)?.name ?? h.from_tier) : "no level"} → {h.to_tier ? (levels.find((t) => t.key === h.to_tier)?.name ?? h.to_tier) : "no level"} · by {h.by?.full_name || "an admin"}</Small>
                  ))}
                </View>
              ) : null}
            </View>
          );
        })}
      </Card>
    </AdminShell>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.md },
  rank: { width: 34, height: 34, borderRadius: 17, borderWidth: 1.5, borderColor: colors.gold, alignItems: "center", justifyContent: "center" },
  pills: { flexDirection: "row", gap: 6, alignItems: "center", flexWrap: "wrap" },
  private: { borderColor: colors.warn, borderStyle: "dashed" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  cell: { flexGrow: 1, flexBasis: 150, maxWidth: 220 },
  wide: { flexGrow: 1, flexBasis: 260 },
  checks: { flexDirection: "row", flexWrap: "wrap", columnGap: space.xl, rowGap: 2 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, alignItems: "center" },
  line: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.line },
  mentor: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.lg, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.line },
  swatches: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" },
  swatch: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: "transparent", alignItems: "center", justifyContent: "center" },
  swatchNone: { borderColor: colors.line2, backgroundColor: colors.panel2 },
  swatchOn: { borderColor: colors.ink },
  sub: { flexBasis: "100%", gap: space.sm, borderLeftWidth: 2, borderLeftColor: colors.line2, paddingLeft: space.md },
  preview: { gap: 6, borderWidth: 1, borderColor: colors.line2, borderStyle: "dashed", borderRadius: radius.md, padding: space.md, maxWidth: 560 },
});
