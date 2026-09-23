import { useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";
import { Pill } from "./ui/Pill";
import { TextField } from "./ui/TextField";
import { Body, H3, Label, Small } from "./ui/Text";
import { WorksheetView } from "./WorksheetView";
import { MuxPlayer } from "./MuxPlayer";
import { fileAudit, getBreakdownForJob, openAuditFor, reviewBreakdown, worksheetPdfUrl, type Breakdown } from "@/lib/breakdowns";
import { mentorSlugForJob } from "@/lib/sessions";
import { useSettings } from "@/lib/settings";
import { openExternal } from "@/lib/open";
import { Link } from "expo-router";
import { colors, fonts, radius, space } from "@/theme/tokens";

// The parent's view of a delivered breakdown: video, worksheet, PDF, rating, and the audit path.
export function BreakdownPanel({ jobId }: { jobId: string }) {
  const { settings } = useSettings();
  const [bd, setBd] = useState<Breakdown | null | undefined>(undefined);
  const [audit, setAudit] = useState<{ id: string; status: string; outcome: string | null } | null>(null);
  const [rating, setRating] = useState(0);
  const [review, setReview] = useState("");
  const [reason, setReason] = useState("");
  const [showAudit, setShowAudit] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mentorSlug, setMentorSlug] = useState<string | null>(null);

  useEffect(() => {
    mentorSlugForJob(jobId).then(setMentorSlug);
    getBreakdownForJob(jobId).then(async (b) => {
      setBd(b);
      if (b) setAudit((await openAuditFor(b.id)) as typeof audit);
    });
  }, [jobId]);

  if (bd === undefined) return null;
  if (!bd) return null;

  const daysSince = (Date.now() - new Date(bd.delivered_at).getTime()) / 86400000;
  const canAudit = settings ? daysSince <= settings.rules.qca_window_days : false;
  const canAddon = settings ? daysSince <= (settings.rules.addon_window_days ?? 14) : false;

  async function submitReview() {
    if (!rating) return setError("Pick a star rating.");
    setBusy("review");
    setError(null);
    try {
      const res = await reviewBreakdown(bd!.id, rating, review);
      setBd({ ...bd!, rating, review, review_status: res.review_status });
      setMsg(res.review_status === "published" ? "Thanks. Your review is live on the mentor's profile." : "Thanks. FLP will look at this review before it appears.");
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(null);
  }

  async function submitAudit() {
    setBusy("audit");
    setError(null);
    try {
      const res = await fileAudit(bd!.id, reason);
      setAudit({ id: res.auditId, status: "open", outcome: null });
      setShowAudit(false);
      setMsg("Your Quality Control Audit is filed. Alex or Bryan at FLP will review it and get back to you.");
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(null);
  }

  async function downloadPdf() {
    setBusy("pdf");
    setError(null);
    try {
      await openExternal(async () => (await worksheetPdfUrl(bd!.id)).url);
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(null);
  }


  return (
    <Card>
      <View style={s.row}>
        <H3>Your breakdown</H3>
        <Pill tone="ok">{`Delivered ${new Date(bd.delivered_at).toLocaleDateString()}`}</Pill>
      </View>
      <MuxPlayer mediaId={bd.media_id} title="Breakdown" />

      <View style={s.row}>
        <Label>Player Development Worksheet</Label>
        <Button title="Download PDF" variant="secondary" small loading={busy === "pdf"} onPress={downloadPdf} />
      </View>
      <WorksheetView w={bd.worksheet} />

      {canAddon && mentorSlug ? (
        <View style={s.addon}>
          <View style={{ flex: 1, gap: 2 }}>
            <Label>Go through this live</Label>
            <Small>
              Book a 30-minute Film Room with the same mentor within {settings?.rules.addon_window_days ?? 14} days of delivery at the add-on price. They pull up this film and walk your
              youth athlete through it.
            </Small>
          </View>
          <Link href={{ pathname: "/mentors/[slug]", params: { slug: mentorSlug, addon: bd.id } }} asChild>
            <Button title="Book the add-on" variant="secondary" small />
          </Link>
        </View>
      ) : null}

      <View style={s.divider} />

      {bd.rating ? (
        <View style={{ gap: space.xs }}>
          <Label>Your rating</Label>
          <Stars value={bd.rating} />
          {bd.review ? <Body style={{ color: colors.muted }}>{bd.review}</Body> : null}
          {bd.review_status === "pending_admin" ? <Small>FLP is reviewing this before it appears on the mentor's profile.</Small> : null}
        </View>
      ) : (
        <View style={{ gap: space.sm }}>
          <Label>Rate this breakdown</Label>
          <Stars value={rating} onChange={setRating} />
          <TextField label="Testimonial (optional)" value={review} onChangeText={setReview} multiline style={s.multi} placeholder="What did your youth athlete get out of it?" />
          <Button title="Submit rating" small loading={busy === "review"} onPress={submitReview} />
        </View>
      )}

      {audit ? (
        <Small>
          Quality Control Audit {audit.status === "open" ? "is open with FLP." : `closed: ${audit.outcome ?? "resolved"}.`}
        </Small>
      ) : canAudit ? (
        showAudit ? (
          <View style={{ gap: space.sm }}>
            <Label>Quality Control Audit</Label>
            <Body style={{ color: colors.muted }}>
              Tell us what fell short. Alex or Bryan at FLP will watch the breakdown, read the worksheet, and decide on a refund, a
              re-review by another mentor, or another fix.
            </Body>
            <TextField label="What was wrong" value={reason} onChangeText={setReason} multiline style={s.multi} />
            <View style={s.row}>
              <Button title="File the audit" variant="danger" small loading={busy === "audit"} onPress={submitAudit} />
              <Button title="Never mind" variant="ghost" small onPress={() => setShowAudit(false)} />
            </View>
          </View>
        ) : (
          <Pressable onPress={() => setShowAudit(true)}>
            <Small style={{ color: colors.muted }}>
              Not what you expected? You can file a Quality Control Audit within {settings?.rules.qca_window_days} days of delivery.
            </Small>
          </Pressable>
        )
      ) : null}

      {msg ? <Body style={{ color: colors.ok }}>{msg}</Body> : null}
      {error ? <Body style={{ color: colors.danger }}>{error}</Body> : null}
    </Card>
  );
}

function Stars({ value, onChange }: { value: number; onChange?: (v: number) => void }) {
  return (
    <View style={{ flexDirection: "row", gap: 4 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable key={n} accessibilityRole="button" accessibilityLabel={`${n} star${n > 1 ? "s" : ""}`} disabled={!onChange} onPress={() => onChange?.(n)}>
          <Text style={[s.star, n <= value && s.starOn]}>★</Text>
        </Pressable>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  addon: { flexDirection: "row", alignItems: "center", gap: space.md, flexWrap: "wrap", padding: space.md, borderRadius: radius.md, backgroundColor: colors.goldSoft },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md, flexWrap: "wrap" },
  divider: { height: 1, backgroundColor: colors.line, marginVertical: space.sm },
  multi: { height: 84, paddingTop: space.sm, textAlignVertical: "top" },
  star: { fontSize: 28, color: colors.line2, fontFamily: fonts.body },
  starOn: { color: colors.gold },
});
