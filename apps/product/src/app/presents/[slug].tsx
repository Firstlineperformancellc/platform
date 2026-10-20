import { useEffect, useState } from "react";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import { Linking, Platform, StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { Brand } from "@/components/Brand";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Card } from "@/components/ui/Card";
import { Choice } from "@/components/ui/Choice";
import { Dropdown } from "@/components/ui/Dropdown";
import { Screen } from "@/components/ui/Screen";
import { TextField } from "@/components/ui/TextField";
import { Body, H1, H3, Label, Small } from "@/components/ui/Text";
import { Loading, useAuth } from "@/lib/auth";
import { avatarUrl } from "@/lib/mentorProfile";
import { openExternal } from "@/lib/open";
import { createRequest, getProvider, money, PRESENTS_NAME, presentsRules, type PresentsProvider } from "@/lib/presents";
import { levelLabel, useSettings } from "@/lib/settings";
import { colors, fonts, radius, space } from "@/theme/tokens";

const MAX_INSTRUCTIONS = 500;

// One athlete's First Line Presents page: who they are, a sample, and the request form. Public; no account needed.
export default function PresentsRequest() {
  const { slug, cancelled } = useLocalSearchParams<{ slug: string; cancelled?: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const { settings } = useSettings();
  const [provider, setProvider] = useState<PresentsProvider | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [recipient, setRecipient] = useState("");
  const [minor, setMinor] = useState<"yes" | "no" | "">("");
  const [occasion, setOccasion] = useState("");
  const [from, setFrom] = useState("");
  const [instructions, setInstructions] = useState("");
  const [team, setTeam] = useState("");
  const [email, setEmail] = useState("");
  const [adult, setAdult] = useState(false);
  const [name, setName] = useState("");

  useEffect(() => {
    if (!slug) return;
    getProvider(slug)
      .then(setProvider)
      .catch((e) => {
        setProvider(null);
        setError((e as Error).message);
      });
  }, [slug]);

  if (provider === undefined) return <Loading />;
  if (!provider)
    return (
      <Screen title={PRESENTS_NAME} width="form" center>
        <H1 center>Athlete not found</H1>
        {error ? <Body center style={{ color: colors.danger }}>{error}</Body> : null}
        <View style={{ alignItems: "center" }}>
          <Link href="/presents" asChild>
            <Button title="All athletes" variant="secondary" />
          </Link>
        </View>
      </Screen>
    );

  const first = provider.display_name.split(" ")[0];
  const level = provider.tier_name ?? levelLabel(settings, provider.highest_level);
  const occasions = provider.occasions.length ? provider.occasions : presentsRules(settings?.rules).occasions;
  const days = `${provider.days} day${provider.days === 1 ? "" : "s"}`;
  const who = recipient.trim() || "the recipient";
  const signedInEmail = session?.user.email ?? null;

  async function submit() {
    if (!provider) return;
    setError(null);
    if (!recipient.trim()) return setError("Who is the video for? First name only.");
    if (!minor) return setError(`Tell us whether ${who} is under 18.`);
    if (!occasion) return setError("Pick an occasion.");
    if (!instructions.trim()) return setError(`Tell ${first} what to say.`);
    if (!signedInEmail && !email.trim()) return setError("Enter the email address the video should go to.");
    setBusy(true);
    try {
      if (!signedInEmail && !adult) { setError("First Line Presents is bought by adults. Tick the box to confirm you're 18 or over; a parent or guardian can order for a young player."); setBusy(false); return; }
      const res = await createRequest({
        slug: provider.slug,
        recipientName: recipient.trim(),
        recipientMinor: minor === "yes",
        occasion,
        fromName: from.trim(),
        instructions: instructions.trim(),
        team: team.trim() || undefined,
        buyerEmail: signedInEmail ? undefined : email.trim(),
        buyerName: signedInEmail ? undefined : name.trim() || undefined,
        buyerAdult: signedInEmail ? undefined : adult,
      });
      if (res.checkoutUrl) {
        if (Platform.OS === "web") window.location.assign(res.checkoutUrl);
        else await Linking.openURL(res.checkoutUrl);
        return;
      }
      // Free preview on dev: the request is already open, so go straight to its page.
      router.replace({ pathname: "/presents/view", params: { r: res.requestId, t: res.token, ...(res.devPaid ? { paid: "1" } : {}) } });
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  const form = (
    <>
      <TextField label="Who is it for?" value={recipient} onChangeText={setRecipient} maxLength={60} autoCapitalize="words" placeholder="First name" hint="First name only. That's all the athlete needs." />
      <Choice
        label={`Is ${who} under 18?`}
        options={[
          { key: "yes", label: "Yes, under 18", hint: "FLP checks the video before it goes out" },
          { key: "no", label: "No, 18 or over" },
        ]}
        value={minor}
        onChange={(v) => setMinor(v as "yes" | "no")}
      />
      <Dropdown label="Occasion" single options={occasions.map((o) => ({ key: o, label: o }))} value={occasion ? [occasion] : []} onChange={(v) => setOccasion(v[0] ?? "")} placeholder="Pick one" />
      <TextField label="From" value={from} onChangeText={setFrom} maxLength={80} autoCapitalize="words" placeholder="Mom and Dad, Coach Dan, the whole team…" />
      <TextField
        label={`What should ${first} say?`}
        value={instructions}
        onChangeText={(v) => setInstructions(v.slice(0, MAX_INSTRUCTIONS))}
        multiline
        maxLength={MAX_INSTRUCTIONS}
        style={s.multi}
        placeholder={`Who ${who} is, what's happening, anything ${first} should know.`}
        hint={`${instructions.length}/${MAX_INSTRUCTIONS} · No contact details; the athlete only records a video.`}
      />
      <TextField label="Team (optional)" value={team} onChangeText={setTeam} maxLength={80} autoCapitalize="words" placeholder="Their team, if it matters for the message" />
      {signedInEmail ? (
        <Small>Signed in as {signedInEmail}. The private link to the video goes there.</Small>
      ) : (
        <>
          <TextField label="Your email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" placeholder="Where the private link should go" />
          <TextField label="Your name (optional)" value={name} onChangeText={setName} maxLength={120} autoCapitalize="words" autoComplete="name" />
          <Checkbox label="I'm 18 or over. A parent or guardian can order for a young player." checked={adult} onChange={setAdult} />
        </>
      )}
      <Body style={{ color: colors.muted }}>
        {money(provider.price_cents)} · delivered within {days} · refunded automatically if not delivered
      </Body>
      {error ? <Body style={{ color: colors.danger }}>{error}</Body> : null}
      <Button title={`Request a video · ${money(provider.price_cents)}`} onPress={submit} loading={busy} disabled={!provider.available} />
    </>
  );

  return (
    <Screen title={`${provider.display_name} · ${PRESENTS_NAME}`} width="content">
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
        <H1>A video from {provider.display_name}</H1>
      </View>

      <Card style={s.card}>
        <View style={s.head}>
          <Avatar path={provider.photo_path} name={provider.display_name} />
          <View style={{ flex: 1, gap: 2 }}>
            <H3>{provider.display_name}</H3>
            <Small>{[level, provider.current_team].filter(Boolean).join(" · ")}</Small>
          </View>
          <Body style={s.price}>{money(provider.price_cents)}</Body>
        </View>
        {provider.blurb.trim() ? <Body>{provider.blurb}</Body> : null}
        <View style={s.meta}>
          <Small>Delivered within {days}</Small>
          {provider.rating_count > 0 ? <Small>★ {Number(provider.avg_rating).toFixed(1)} ({provider.rating_count})</Small> : null}
          {provider.delivered_count > 0 ? <Small>{provider.delivered_count} delivered</Small> : null}
          {provider.eliteprospects_url ? (
            <Small style={{ color: colors.gold }} onPress={() => openExternal(async () => provider.eliteprospects_url!)}>
              Elite Prospects profile ↗
            </Small>
          ) : null}
        </View>
      </Card>

      {provider.sample_playback_id && Platform.OS === "web" ? (
        <Card>
          <H3>A sample from {first}</H3>
          <iframe
            src={`https://player.mux.com/${provider.sample_playback_id}?primary-color=%23d4a32c&accent-color=%23000000`}
            style={{ border: 0, width: "100%", aspectRatio: "16 / 9", borderRadius: radius.md }}
            allow="fullscreen"
            allowFullScreen
            title={`${provider.display_name} sample`}
          />
        </Card>
      ) : null}

      <Card>
        <H3>Request a video</H3>
        <Small>No account needed. You pay through Stripe, and the private link to the video goes to your email.</Small>
        {cancelled ? <Body style={{ color: colors.warn }}>Checkout was cancelled and nothing was charged. The form is here when you're ready.</Body> : null}
        {provider.available ? (
          form
        ) : (
          <>
            <Body style={{ color: colors.warn }}>{first} isn't taking requests right now. Check back soon, or pick another athlete.</Body>
            <Link href="/presents" asChild>
              <Button title="All athletes" variant="secondary" small />
            </Link>
            <View pointerEvents="none" style={{ opacity: 0.45, gap: space.md }}>
              {form}
            </View>
          </>
        )}
      </Card>
      <Small>
        The request is one-way: {first} records a video and that's it. Videos for athletes under 18 are checked by FLP before delivery. If the video isn't delivered on time, the payment is refunded on its own.
      </Small>
    </Screen>
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

const s = StyleSheet.create({
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  card: { gap: space.sm },
  head: { flexDirection: "row", gap: space.md, alignItems: "flex-start" },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.panel2 },
  avatarEmpty: { borderWidth: 1, borderColor: colors.line2, alignItems: "center", justifyContent: "center" },
  initials: { color: colors.gold, fontFamily: fonts.semibold, fontSize: 20 },
  price: { color: colors.gold, fontFamily: fonts.semibold, fontSize: 20 },
  meta: { flexDirection: "row", flexWrap: "wrap", gap: space.md, alignItems: "center" },
  multi: { minHeight: 120, paddingTop: space.md, textAlignVertical: "top" },
});
