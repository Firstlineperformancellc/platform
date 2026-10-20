import { useCallback, useEffect, useState } from "react";
import { Link, useLocalSearchParams } from "expo-router";
import { Platform, StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { Brand } from "@/components/Brand";
import { MuxPlayer } from "@/components/MuxPlayer";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { Screen } from "@/components/ui/Screen";
import { TextField } from "@/components/ui/TextField";
import { Body, H1, H3, Label, Small } from "@/components/ui/Text";
import { Loading } from "@/lib/auth";
import { avatarUrl } from "@/lib/mentorProfile";
import { openExternal } from "@/lib/open";
import {
  getRequest, getRequestPlayback, money, PRESENTS_NAME, rateRequest, reportProblem, STATUS_LABEL, viewPath,
  type BuyerRequest, type RequestPlayback, type RequestStatus,
} from "@/lib/presents";
import { useSettings } from "@/lib/settings";
import { colors, fonts, space } from "@/theme/tokens";

// The buyer's page for one request: /presents/view?r=<id>&t=<token>. The token is the key, so no sign-in is
// needed; a signed-in buyer or an admin can open it without the token too.
export default function PresentsView() {
  const { r, t, paid } = useLocalSearchParams<{ r?: string; t?: string; paid?: string }>();
  const { settings } = useSettings();
  const [req, setReq] = useState<BuyerRequest | null | undefined>(undefined);
  const [pb, setPb] = useState<RequestPlayback | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [problem, setProblem] = useState("");
  const [waited, setWaited] = useState(false);

  // Static export: the query string is only known once the page has hydrated. If it never carries an id, say so after a beat.
  useEffect(() => {
    const id = setTimeout(() => setWaited(true), 1500);
    return () => clearTimeout(id);
  }, []);

  const load = useCallback(() => {
    if (!r) return;
    getRequest(r, t ?? null)
      .then(setReq)
      .catch((e) => {
        setReq(null);
        setError((e as Error).message);
      });
  }, [r, t]);
  useEffect(() => {
    load();
  }, [load]);

  // Playback (and the download) come with the private token, so a guest can watch. Tokens last two hours; refresh under a long visit.
  const delivered = req?.status === "delivered";
  useEffect(() => {
    if (!r || !delivered) {
      setPb(undefined);
      return;
    }
    let live = true;
    const go = () => getRequestPlayback(r, t ?? null).then((p) => live && setPb(p)).catch(() => live && setPb(null));
    go();
    const timer = setInterval(go, 90 * 60 * 1000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [r, t, delivered]);

  if (!r) {
    if (!waited) return <Loading />;
    return (
      <Screen title={PRESENTS_NAME} width="form" center>
        <H1 center>This link is incomplete</H1>
        <Body center style={{ color: colors.muted }}>Open the link from your email again, or find the video under My videos if you bought it while signed in.</Body>
        <View style={{ alignItems: "center" }}>
          <Link href="/presents" asChild>
            <Button title="First Line Presents" variant="secondary" />
          </Link>
        </View>
      </Screen>
    );
  }
  if (req === undefined) return <Loading />;
  if (!req)
    return (
      <Screen title={PRESENTS_NAME} width="form" center>
        <H1 center>Video not found</H1>
        <Body center style={{ color: colors.muted }}>{error ?? "This link doesn't match a request. Check the email it came in, or sign in if you bought it from your account."}</Body>
        <View style={{ alignItems: "center" }}>
          <Link href="/presents" asChild>
            <Button title="First Line Presents" variant="secondary" />
          </Link>
        </View>
      </Screen>
    );

  const token = t ?? req.token ?? null;
  const athlete = req.athlete?.display_name ?? "the athlete";
  const athleteFirst = athlete.split(" ")[0];
  const due = when(req.due_at);
  const refund = req.refunded_cents > 0 ? req.refunded_cents : req.price_cents;
  const ready = pb?.ready ? pb : null;

  async function rate(n: number) {
    if (!req) return;
    setBusy(`rate${n}`);
    setError(null);
    try {
      await rateRequest(req.id, n, token);
      setReq({ ...req, rating: n });
      setNotice("Thanks. That goes to the athlete and to FLP.");
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(null);
  }
  async function report() {
    if (!req) return;
    setBusy("report");
    setError(null);
    try {
      await reportProblem(req.id, problem.trim(), token);
      setProblem("");
      setNotice("Got it. FLP will look at the video and email you.");
      load();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(null);
  }
  async function copyLink() {
    if (!req || !token) return;
    const path = viewPath(req.id, token);
    const url = Platform.OS === "web" ? `${window.location.origin}${path}` : path;
    try {
      await navigator.clipboard.writeText(url);
      setCopied("Link copied. Anyone with it can watch, so share it with care.");
    } catch {
      setCopied(url);
    }
  }

  return (
    <Screen title={`For ${req.recipient_name} · ${PRESENTS_NAME}`} width="content">
      <View style={s.topbar}>
        <Link href="/" asChild>
          <Brand size={44} />
        </Link>
        <Link href="/presents" asChild>
          <Button title="All athletes" variant="ghost" small />
        </Link>
      </View>
      <View>
        <Label>{PRESENTS_NAME}</Label>
        <H1>A video for {req.recipient_name}</H1>
        <View style={s.row}>
          <Pill tone={tone(req.status)}>{STATUS_LABEL[req.status]}</Pill>
          <Small>
            {req.occasion} · from {athlete} · {money(req.price_cents)}
          </Small>
        </View>
      </View>

      {paid && (req.status === "open" || req.status === "flagged") ? (
        <Body style={{ color: colors.ok }}>
          {settings?.rules.payments_mode === "free_preview" ? "Request placed (preview, no charge)." : "Payment received."} Keep this link: it's where the video appears, and it's in your email too.
        </Body>
      ) : null}
      {notice ? <Body style={{ color: colors.ok }}>{notice}</Body> : null}
      {error ? <Body style={{ color: colors.danger }}>{error}</Body> : null}

      {delivered ? (
        <>
          <Card>
            <View style={s.row}>
              <H3>The video</H3>
              {req.delivered_at ? <Small>Delivered {when(req.delivered_at)}</Small> : null}
            </View>
            <MuxPlayer playback={pb} title={`${athlete} for ${req.recipient_name}`} processingText="The video is on its way through processing. Give it a few minutes and reload." />
            <View style={s.row}>
              {ready?.mp4Url ? <Button title="Download" variant="secondary" small onPress={() => openExternal(async () => ready.mp4Url!)} /> : null}
              {token ? <Button title="Copy private link" variant="ghost" small onPress={copyLink} /> : null}
            </View>
            {copied ? <Small selectable>{copied}</Small> : null}
            {req.refunded_cents > 0 ? <Small>FLP refunded {money(req.refunded_cents)} on this request.</Small> : null}
          </Card>

          <Card>
            <H3>{req.rating ? "Your rating" : "How was it?"}</H3>
            <View style={s.row}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Button key={n} title={`${n} ★`} small variant={req.rating === n ? "secondary" : "ghost"} loading={busy === `rate${n}`} disabled={busy !== null && busy !== `rate${n}`} onPress={() => rate(n)} />
              ))}
            </View>
            <Small>1 is poor, 5 is great. You can change it any time.</Small>
          </Card>

          {req.problem_at ? (
            <Card>
              <H3>Problem reported</H3>
              <Body style={{ color: colors.muted }}>You told FLP on {when(req.problem_at)}. We're looking at the video and will email you.</Body>
              {req.problem_text ? <Small>"{req.problem_text}"</Small> : null}
            </Card>
          ) : req.can_report ? (
            <Card>
              <H3>Something wrong with it?</H3>
              <Body style={{ color: colors.muted }}>Wrong name, wrong occasion, won't play: tell FLP and a person will look at it.</Body>
              <TextField label="What went wrong" value={problem} onChangeText={setProblem} multiline maxLength={1000} style={s.multi} placeholder="A sentence or two is plenty." />
              <Button title="Report a problem" variant="secondary" small onPress={report} loading={busy === "report"} disabled={problem.trim().length < 10} />
            </Card>
          ) : null}
        </>
      ) : null}

      {req.status === "draft" ? (
        <Card>
          <H3>Not paid yet</H3>
          <Body style={{ color: colors.muted }}>This request was started but the payment didn't go through. Nothing was charged.</Body>
          {req.athlete ? (
            <Link href={{ pathname: "/presents/[slug]", params: { slug: req.athlete.slug } }} asChild>
              <Button title={`Start again with ${athleteFirst}`} variant="secondary" small />
            </Link>
          ) : null}
        </Card>
      ) : null}

      {req.status === "open" ? (
        <Card>
          <H3>What happens next</H3>
          <Body style={{ color: colors.muted }}>
            {athleteFirst} has the request and records the video on their phone.{due ? ` It's due by ${due}.` : ""} When it's ready, it appears on this page and an email with this link goes to the address you gave.
          </Body>
          <Small>If it isn't delivered by then, the payment is refunded on its own.</Small>
        </Card>
      ) : null}

      {req.status === "flagged" ? (
        <Card>
          <H3>What happens next</H3>
          <Body style={{ color: colors.muted }}>
            FLP is taking a quick look at the request before {athleteFirst} sees it. That usually takes less than a day and doesn't move the due date{due ? ` (${due})` : ""}.
          </Body>
        </Card>
      ) : null}

      {req.status === "in_review" ? (
        <Card>
          <H3>What happens next</H3>
          <Body style={{ color: colors.muted }}>
            {athleteFirst} has recorded the video and FLP is checking it before it's delivered, as we do for every video made for a young athlete. You'll get an email with this link as soon as it's released, usually within a day.
          </Body>
        </Card>
      ) : null}

      {req.status === "declined" || req.status === "expired" || req.status === "refunded" || req.status === "cancelled" ? (
        <Card>
          <H3>{STATUS_LABEL[req.status]}</H3>
          <Body style={{ color: colors.muted }}>
            {req.status === "declined" ? `${athleteFirst} wasn't able to record this one. ` : req.status === "expired" ? "The video wasn't delivered in time. " : ""}
            {settings?.rules.payments_mode === "free_preview" ? "Nothing was charged." : `The refund of ${money(refund)} is on its way back to the card you paid with. It can take a few business days to show on your statement.`}
          </Body>
          <Link href="/presents" asChild>
            <Button title="Pick another athlete" variant="secondary" small />
          </Link>
        </Card>
      ) : null}

      <Card style={{ gap: space.sm }}>
        <View style={s.head}>
          {req.athlete ? <Avatar path={req.athlete.photo_path} name={req.athlete.display_name} /> : null}
          <View style={{ flex: 1, gap: 2 }}>
            <H3>The request</H3>
            <Small>Placed {when(req.created_at)}</Small>
          </View>
        </View>
        <Line k="For" v={req.recipient_name} />
        <Line k="Occasion" v={req.occasion} />
        <Line k="From" v={req.from_name} />
        <Line k="Team" v={req.team} />
        <Line k="Athlete" v={athlete} />
        {req.instructions ? (
          <View style={{ gap: 2 }}>
            <Label>What to say</Label>
            <Body>{req.instructions}</Body>
          </View>
        ) : null}
      </Card>
    </Screen>
  );
}

function Line({ k, v }: { k: string; v: string | null | undefined }) {
  if (!v) return null;
  return (
    <View style={s.line}>
      <Label>{k}</Label>
      <Body>{v}</Body>
    </View>
  );
}

// The athlete's photo, or their initials when they haven't added one.
function Avatar({ path, name }: { path: string | null; name: string }) {
  const uri = avatarUrl(path);
  if (uri) return <Image source={{ uri }} style={s.avatar} contentFit="cover" />;
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");
  return (
    <View style={[s.avatar, s.avatarEmpty]}>
      <Body style={s.initials}>{initials}</Body>
    </View>
  );
}

const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }) : "");

function tone(status: RequestStatus): "ok" | "gold" | "warn" | "muted" {
  if (status === "delivered") return "ok";
  if (status === "open" || status === "draft") return "gold";
  if (status === "flagged" || status === "in_review") return "warn";
  return "muted";
}

const s = StyleSheet.create({
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  row: { flexDirection: "row", alignItems: "center", gap: space.sm, flexWrap: "wrap" },
  head: { flexDirection: "row", gap: space.md, alignItems: "center" },
  line: { flexDirection: "row", alignItems: "baseline", gap: space.md, flexWrap: "wrap" },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.panel2 },
  avatarEmpty: { borderWidth: 1, borderColor: colors.line2, alignItems: "center", justifyContent: "center" },
  initials: { color: colors.gold, fontFamily: fonts.semibold },
  multi: { minHeight: 100, paddingTop: space.md, textAlignVertical: "top" },
});
