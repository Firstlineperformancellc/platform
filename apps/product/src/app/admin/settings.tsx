import { useEffect, useState } from "react";
import { Link } from "expo-router";
import { StyleSheet, View } from "react-native";
import { AdminShell } from "@/components/AdminShell";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { TextField } from "@/components/ui/TextField";
import { Checkbox } from "@/components/ui/Checkbox";
import { Choice } from "@/components/ui/Choice";
import { Pill } from "@/components/ui/Pill";
import { Body, H3, Small } from "@/components/ui/Text";
import { grantAdmin, patchSettings } from "@/lib/admin";
import { Loading } from "@/lib/auth";
import { useSettings } from "@/lib/settings";
import { presentsRules } from "@/lib/presents";
import { colors, space } from "@/theme/tokens";

const RULES: { key: string; label: string; hint: string }[] = [
  { key: "accept_hours", label: "Hours to accept an offer", hint: "Then it moves to the second choice." },
  { key: "accept_nudge_hours", label: "Nudge mentors after (hours)", hint: "Reminder before the window closes." },
  { key: "turnaround_hours", label: "Turnaround (hours from acceptance)", hint: "" },
  { key: "qca_window_days", label: "Days to file a Quality Control Audit", hint: "" },
  { key: "review_auto_publish_min", label: "Auto-publish reviews at (stars)", hint: "Below this an admin looks first." },
  { key: "capacity_default", label: "Default jobs on deck", hint: "" },
  { key: "capacity_max", label: "Max jobs on deck a mentor may set", hint: "" },
  { key: "wait_days_default", label: "Suggested waitlist days", hint: "" },
  { key: "session_cancel_hours", label: "Film Room cancellation window (hours)", hint: "" },
  { key: "session_grace_minutes", label: "Film Room grace (minutes)", hint: "" },
  { key: "recap_due_hours", label: "Mentor recap due (hours after session)", hint: "" },
  { key: "recording_retention_days", label: "Session recording retention (days)", hint: "" },
  { key: "session_accept_hours", label: "Hours a mentor has to confirm a Film Room", hint: "Then the parent is refunded." },
  { key: "session_min_lead_hours", label: "Earliest booking (hours ahead)", hint: "" },
  { key: "session_book_ahead_days", label: "Booking horizon (days)", hint: "" },
  { key: "addon_window_days", label: "Add-on price window after a breakdown (days)", hint: "" },
  { key: "season_arc_sessions", label: "Sessions in a Season Arc", hint: "" },
  { key: "season_arc_weeks", label: "Weeks to use a Season Arc", hint: "" },
];
const LISTS: { key: string; label: string }[] = [
  { key: "age_groups", label: "Age groups" },
  { key: "skill_levels", label: "Skill levels" },
  { key: "focus_skater", label: "Focus areas, skaters" },
  { key: "focus_goalie", label: "Focus areas, goalies" },
];
// Video slots on the parent dashboard, the mentor dashboard and the film upload step. Public Mux playback ids.
const VIDEOS: { key: "explainer_parent_playback_id" | "explainer_mentor_playback_id" | "upload_help_playback_id"; label: string }[] = [
  { key: "explainer_parent_playback_id", label: "Parent explainer (Mux playback id)" },
  { key: "explainer_mentor_playback_id", label: "Mentor explainer (Mux playback id)" },
  { key: "upload_help_playback_id", label: "Upload walkthrough (Mux playback id)" },
];
const VIDEO_HINT = "Public playback id from the Mux dashboard, e.g. the part after stream.mux.com/ in the video URL. Blank hides the slot.";

// Prices, splits, rules, and lists. Everything here changes the product without a deploy.
export default function AdminSettings() {
  const { settings } = useSettings();
  const [rules, setRules] = useState<Record<string, string>>({});
  const [payoutDays, setPayoutDays] = useState("");
  // First Line Presents, edited as text and sent as the API expects (cents, whole numbers, word lists)
  const [pr, setPr] = useState({ enabled: true, share: "", min: "", max: "", days: "", review: "minors" as "minors" | "all", problemDays: "", occasions: "", blocklist: "" });
  const [lists, setLists] = useState<Record<string, string>>({});
  const [videos, setVideos] = useState<Record<string, string>>({});
  const [adminEmail, setAdminEmail] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!settings) return;
    setPayoutDays(settings.rules.payout_delay_days != null ? String(settings.rules.payout_delay_days) : "");
    const p = presentsRules(settings.rules);
    setPr({ enabled: p.enabled, share: String(p.sharePct), min: String(p.minCents / 100), max: String(p.maxCents / 100), days: String(p.maxDays), review: p.review, problemDays: String(p.problemDays), occasions: p.occasions.join(", "), blocklist: p.blocklist.join(", ") });
    setRules(Object.fromEntries(RULES.map((r) => [r.key, String((settings.rules as Record<string, unknown>)[r.key] ?? "")])));
    setLists(Object.fromEntries(LISTS.map((l) => [l.key, ((settings.taxonomy as Record<string, unknown>)[l.key] as string[]).join(", ")])));
    setVideos(Object.fromEntries(VIDEOS.map((v) => [v.key, settings.rules[v.key] ?? ""])));
  }, [settings]);

  if (!settings) return <Loading />;

  async function save(section: string, patch: Record<string, unknown>) {
    setBusy(section);
    setError(null);
    setMsg(null);
    try {
      await patchSettings(patch);
      setMsg("Saved. Takes effect on the next screen load for everyone.");
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(null);
  }

  return (
    <AdminShell title="Settings">
      {msg ? <Body style={{ color: colors.ok }}>{msg}</Body> : null}
      {error ? <Body style={{ color: colors.danger }}>{error}</Body> : null}

      <Card>
        <View style={s.row}>
          <H3>Payments</H3>
          <Pill tone={settings.rules.payments_mode === "free_preview" ? "danger" : "ok"}>{settings.rules.payments_mode === "free_preview" ? "Free preview: nothing is charged" : "Stripe: parents are charged"}</Pill>
        </View>
        <Small>
          Free preview lets orders and Film Room bookings go through without a card, for demos and beta testing. Switch back to Stripe before real
          families use the platform.
        </Small>
        <Choice
          label="Mode"
          options={[{ key: "stripe", label: "Stripe (charge at checkout)" }, { key: "free_preview", label: "Free preview (no charge)" }]}
          value={settings.rules.payments_mode ?? "stripe"}
          onChange={(v) => save("payments", { rules: { payments_mode: v } })}
        />
      </Card>

      <Card>
        <View style={s.row}>
          <H3>Mentor payouts</H3>
          <Pill tone={settings.rules.payout_mode === "auto" ? "ok" : "muted"}>{settings.rules.payout_mode === "auto" ? "Automatic" : "Manual"}</Pill>
        </View>
        <Small>
          Manual: an admin presses Pay via Stripe on the Ledger for each payout. Automatic: every owed payout is sent to the mentor on its own once the waiting period has passed, unless it is on hold. Held and disputed payouts are never sent automatically.
        </Small>
        <Choice
          label="How mentors are paid"
          options={[{ key: "manual", label: "Manual (admin releases each one)" }, { key: "auto", label: "Automatic after the waiting period" }]}
          value={settings.rules.payout_mode ?? "manual"}
          onChange={(v) => save("payouts", { rules: { payout_mode: v } })}
        />
        <View style={s.grid}>
          <View style={s.cell}>
            <TextField label="Waiting period (days after delivery)" value={payoutDays} onChangeText={(v) => setPayoutDays(v.replace(/[^0-9]/g, ""))} keyboardType="number-pad" placeholder={String(settings.rules.qca_window_days)} hint="Blank uses the audit window, so a parent's audit can still stop the payout." />
          </View>
        </View>
        <Button title="Save waiting period" small loading={busy === "payoutDays"} onPress={() => save("payoutDays", { rules: { payout_delay_days: payoutDays.trim() === "" ? settings.rules.qca_window_days : Number(payoutDays) } })} />
      </Card>

      <Card>
        <H3>Explainer videos</H3>
        <Small>Short videos that play on the parent dashboard, the mentor dashboard and the film upload step. Upload to Mux, paste the playback id here, and the slot appears; blank keeps it hidden.</Small>
        {VIDEOS.map((v) => (
          <TextField key={v.key} label={v.label} value={videos[v.key] ?? ""} onChangeText={(t) => setVideos({ ...videos, [v.key]: t })} autoCapitalize="none" autoCorrect={false} hint={VIDEO_HINT} />
        ))}
        <Button title="Save explainer videos" small loading={busy === "videos"} onPress={() => save("videos", { rules: Object.fromEntries(VIDEOS.map((v) => [v.key, (videos[v.key] ?? "").trim()])) })} />
      </Card>

      <Card>
        <View style={s.row}>
          <H3>First Line Presents</H3>
          <Pill tone={pr.enabled ? "ok" : "muted"}>{pr.enabled ? "On" : "Off"}</Pill>
        </View>
        <Small>
          Personal video messages from FLP athletes, sold alongside mentoring. Mentors switch it on from My profile; athletes approved for Presents only never appear in the mentor marketplace. The floor and ceiling bound what an athlete may charge.
        </Small>
        <Checkbox label="First Line Presents is on" checked={pr.enabled} onChange={(v) => setPr({ ...pr, enabled: v })} hint="Off empties the Presents pages, removes the badges and cards, and stops new requests. Requests already paid are still finished." />
        <View style={s.grid}>
          <View style={s.cell}><TextField label="FLP share (%)" value={pr.share} onChangeText={(v) => setPr({ ...pr, share: v.replace(/[^0-9]/g, "") })} keyboardType="number-pad" hint="The athlete keeps the rest." /></View>
          <View style={s.cell}><TextField label="Lowest price ($)" value={pr.min} onChangeText={(v) => setPr({ ...pr, min: v })} keyboardType="decimal-pad" /></View>
          <View style={s.cell}><TextField label="Highest price ($)" value={pr.max} onChangeText={(v) => setPr({ ...pr, max: v })} keyboardType="decimal-pad" /></View>
          <View style={s.cell}><TextField label="Longest delivery window (days, 1 to 14)" value={pr.days} onChangeText={(v) => setPr({ ...pr, days: v.replace(/[^0-9]/g, "") })} keyboardType="number-pad" hint="Athletes pick their own window up to this." /></View>
          <View style={s.cell}><TextField label="Days a buyer has to report a problem" value={pr.problemDays} onChangeText={(v) => setPr({ ...pr, problemDays: v.replace(/[^0-9]/g, "") })} keyboardType="number-pad" hint="A report holds the athlete's payout until you decide." /></View>
        </View>
        <Choice
          label="Review before delivery"
          options={[{ key: "minors", label: "Under-18 recipients" }, { key: "all", label: "All videos" }]}
          value={pr.review}
          onChange={(v) => setPr({ ...pr, review: v as "minors" | "all" })}
          hint="Reviewed videos wait under Presents until an admin approves them."
        />
        <TextField label="Occasions" value={pr.occasions} onChangeText={(v) => setPr({ ...pr, occasions: v })} hint="Comma-separated. Blank restores the standard list." />
        <TextField label="Review word list" value={pr.blocklist} onChangeText={(v) => setPr({ ...pr, blocklist: v })} hint="Comma-separated. A request containing any of these is held for FLP before the athlete sees it." />
        <Button
          title="Save Presents settings"
          small
          loading={busy === "presents"}
          onPress={() => {
            const whole = (v: string) => (v.trim() === "" ? undefined : Number(v));
            const cents = (v: string) => (v.trim() === "" ? undefined : Math.round(Number(v) * 100));
            const words = (v: string) => v.split(",").map((x) => x.trim()).filter(Boolean);
            save("presents", { rules: { presents_enabled: pr.enabled, presents_share_pct: whole(pr.share), presents_min_cents: cents(pr.min), presents_max_cents: cents(pr.max), presents_max_days: whole(pr.days), presents_review: pr.review, presents_problem_days: whole(pr.problemDays), presents_occasions: words(pr.occasions), presents_blocklist: words(pr.blocklist) } });
          }}
        />
      </Card>

      <Card>
        <H3>Prices and mentor levels</H3>
        <Small>Prices, the mentor's share and the level hierarchy now live under Levels & tiles, on each level.</Small>
        <Link href="/admin/marketplace" asChild><Button title="Open levels & tiles" variant="secondary" small /></Link>
      </Card>

      <Card>
        <H3>Rules</H3>
        <View style={s.grid}>
          {RULES.map((r) => (
            <View key={r.key} style={s.cell}>
              <TextField label={r.label} value={rules[r.key] ?? ""} onChangeText={(v) => setRules({ ...rules, [r.key]: v })} keyboardType="number-pad" hint={r.hint || undefined} />
            </View>
          ))}
        </View>
        <Button title="Save rules" small loading={busy === "rules"} onPress={() => save("rules", { rules: Object.fromEntries(RULES.map((r) => [r.key, Number(rules[r.key])])) })} />
      </Card>

      <Card>
        <H3>Lists</H3>
        <Small>Comma-separated. These fill the dropdowns parents and mentors see.</Small>
        {LISTS.map((l) => (
          <TextField key={l.key} label={l.label} value={lists[l.key] ?? ""} onChangeText={(v) => setLists({ ...lists, [l.key]: v })} />
        ))}
        <Button
          title="Save lists"
          small
          loading={busy === "lists"}
          onPress={() => save("lists", { taxonomy: Object.fromEntries(LISTS.map((l) => [l.key, (lists[l.key] ?? "").split(",").map((x) => x.trim()).filter(Boolean)])) })}
        />
      </Card>

      <Card>
        <H3>Admin seats</H3>
        <Small>The person signs up as a parent first; then their account is promoted here.</Small>
        <TextField label="Email" value={adminEmail} onChangeText={setAdminEmail} autoCapitalize="none" keyboardType="email-address" />
        <Button
          title="Make admin"
          small
          disabled={!adminEmail.trim()}
          loading={busy === "admin"}
          onPress={async () => {
            setBusy("admin");
            setError(null);
            try {
              await grantAdmin(adminEmail.trim());
              setMsg(`${adminEmail.trim()} is now an admin.`);
              setAdminEmail("");
            } catch (e) {
              setError((e as Error).message);
            }
            setBusy(null);
          }}
        />
      </Card>
    </AdminShell>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.md, flexWrap: "wrap", justifyContent: "space-between" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.lg },
  cell: { flexGrow: 1, flexBasis: 220, maxWidth: 320, gap: space.sm },
});
