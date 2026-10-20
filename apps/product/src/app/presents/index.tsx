import { useEffect, useState } from "react";
import { Link, useRouter } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { Brand } from "@/components/Brand";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Screen } from "@/components/ui/Screen";
import { Body, H1, H3, Label, Small } from "@/components/ui/Text";
import { Loading, useAuth } from "@/lib/auth";
import { avatarUrl } from "@/lib/mentorProfile";
import { listProviders, money, PRESENTS_NAME, type PresentsProvider } from "@/lib/presents";
import { levelLabel, useSettings } from "@/lib/settings";
import { colors, fonts, radius, space } from "@/theme/tokens";

// First Line Presents, the directory. Public: anyone can browse and buy; a parent account is optional.
export default function PresentsDirectory() {
  const router = useRouter();
  const { session } = useAuth();
  const { settings } = useSettings();
  const [providers, setProviders] = useState<PresentsProvider[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listProviders()
      .then(setProviders)
      .catch((e) => {
        setProviders([]);
        setError((e as Error).message);
      });
  }, []);

  return (
    <Screen title={PRESENTS_NAME} width="page">
      <View style={s.topbar}>
        <Link href="/" asChild>
          <Brand size={44} />
        </Link>
        <View style={s.actions}>
          {session ? (
            <>
              <Link href="/presents/mine" asChild>
                <Button title="My videos" variant="ghost" small />
              </Link>
              <Link href="/parent" asChild>
                <Button title="Dashboard" variant="ghost" small />
              </Link>
            </>
          ) : (
            <Link href="/sign-in" asChild>
              <Button title="Sign in" variant="ghost" small />
            </Link>
          )}
        </View>
      </View>
      <View>
        <Label>{PRESENTS_NAME}</Label>
        <H1>A personal video message from an FLP athlete</H1>
        <Body style={{ color: colors.muted }}>
          Pick an athlete and an occasion, say who it's for and what to say, and they record it on their phone. It arrives as a
          private link, and FLP checks every video made for a young athlete before it goes out. No account needed: the video arrives in your email as a private link.
        </Body>
      </View>
      {error ? <Body style={{ color: colors.danger }}>{error}</Body> : null}
      {!providers ? (
        <Loading />
      ) : providers.length === 0 ? (
        !error ? <Body style={{ color: colors.muted }}>No athletes are taking requests just yet. Check back soon.</Body> : null
      ) : (
        <View style={s.grid}>
          {providers.map((p) => (
            <View key={p.user_id} style={s.cell}>
              <ProviderTile
                p={p}
                level={p.tier_name ?? levelLabel(settings, p.highest_level)}
                onPress={() => router.push({ pathname: "/presents/[slug]", params: { slug: p.slug } })}
              />
            </View>
          ))}
        </View>
      )}
      {/* Mentoring is what FLP is for; one quiet line points back to it. */}
      <View style={s.foot}>
        <Small>Looking for coaching?</Small>
        <Link href="/mentors" asChild>
          <Button title="Browse FLP Mentors" variant="ghost" small />
        </Link>
      </View>
    </Screen>
  );
}

function ProviderTile({ p, level, onPress }: { p: PresentsProvider; level: string; onPress: () => void }) {
  const days = `Delivered within ${p.days} day${p.days === 1 ? "" : "s"}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${p.display_name}, ${money(p.price_cents)}. Opens the request page`}
      onPress={onPress}
      style={({ hovered }: { hovered?: boolean }) => [hovered && s.hover]}
    >
      <Card style={s.card}>
        <View style={s.head}>
          <Avatar path={p.photo_path} name={p.display_name} />
          <View style={{ flex: 1, gap: 2 }}>
            <H3>{p.display_name}</H3>
            <Small>{[level, p.current_team].filter(Boolean).join(" · ")}</Small>
          </View>
          <Body style={s.price}>{money(p.price_cents)}</Body>
        </View>
        {p.blurb.trim() ? (
          <Body style={{ color: colors.muted }} numberOfLines={3}>
            {p.blurb}
          </Body>
        ) : null}
        <View style={s.meta}>
          <Small>{days}</Small>
          {p.rating_count > 0 ? <Small>★ {Number(p.avg_rating).toFixed(1)} ({p.rating_count})</Small> : null}
          {p.available ? null : <Small style={{ color: colors.warn }}>Not taking requests right now</Small>}
        </View>
      </Card>
    </Pressable>
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
  actions: { flexDirection: "row", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.lg },
  cell: { flexGrow: 1, flexShrink: 1, flexBasis: 340, minWidth: 0, maxWidth: 520 },
  card: { gap: space.sm },
  head: { flexDirection: "row", gap: space.md, alignItems: "flex-start" },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.panel2 },
  avatarEmpty: { borderWidth: 1, borderColor: colors.line2, alignItems: "center", justifyContent: "center" },
  initials: { color: colors.gold, fontFamily: fonts.semibold },
  price: { color: colors.gold, fontFamily: fonts.semibold },
  meta: { flexDirection: "row", flexWrap: "wrap", gap: space.md, alignItems: "center" },
  hover: { borderRadius: radius.lg, opacity: 0.95 },
  foot: { flexDirection: "row", alignItems: "center", gap: space.sm, flexWrap: "wrap" },
});
