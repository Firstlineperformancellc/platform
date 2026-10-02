import { useEffect, useState } from "react";
import { Link } from "expo-router";
import { StyleSheet, View } from "react-native";
import { AdminShell } from "@/components/AdminShell";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { TextField } from "@/components/ui/TextField";
import { Choice } from "@/components/ui/Choice";
import { Pill } from "@/components/ui/Pill";
import { Body, H3, Small } from "@/components/ui/Text";
import { grantAdmin, patchSettings } from "@/lib/admin";
import { Loading } from "@/lib/auth";
import { useSettings } from "@/lib/settings";
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

// Prices, splits, rules, and lists. Everything here changes the product without a deploy.
export default function AdminSettings() {
  const { settings } = useSettings();
  const [rules, setRules] = useState<Record<string, string>>({});
  const [lists, setLists] = useState<Record<string, string>>({});
  const [adminEmail, setAdminEmail] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!settings) return;
    setRules(Object.fromEntries(RULES.map((r) => [r.key, String((settings.rules as Record<string, unknown>)[r.key] ?? "")])));
    setLists(Object.fromEntries(LISTS.map((l) => [l.key, ((settings.taxonomy as Record<string, unknown>)[l.key] as string[]).join(", ")])));
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
