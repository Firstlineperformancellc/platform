import { useEffect, useState } from "react";
import { Link, useLocalSearchParams } from "expo-router";
import { Platform, StyleSheet, View } from "react-native";
import { Brand } from "@/components/Brand";
import { MentorCard } from "@/components/MentorCard";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Screen } from "@/components/ui/Screen";
import { Body, H1, H3, Label, Small } from "@/components/ui/Text";
import { Loading, useAuth } from "@/lib/auth";
import { getMentor, listReviews, type MarketplaceMentor, type MentorReview } from "@/lib/mentors";
import { money, TIER_LABEL, useSettings } from "@/lib/settings";
import { colors, radius, space } from "@/theme/tokens";

// Public profile and booking link: /mentors/<slug>. This is the mentor's advertising deck.
export default function MentorProfile() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { session, profile } = useAuth();
  const { settings } = useSettings();
  const [mentor, setMentor] = useState<MarketplaceMentor | null | undefined>(undefined);
  const [reviews, setReviews] = useState<MentorReview[]>([]);

  useEffect(() => {
    if (!slug) return;
    getMentor(slug).then((m) => {
      setMentor(m);
      if (m) listReviews(m.user_id).then(setReviews);
    });
  }, [slug]);

  if (mentor === undefined || !settings) return <Loading />;
  if (!mentor)
    return (
      <Screen width="form" center>
        <H1 center>Mentor not found</H1>
        <Link href="/mentors" asChild>
          <Button title="Back to mentors" variant="secondary" />
        </Link>
      </Screen>
    );

  const price = settings.breakdown_prices[mentor.tier];
  const first = mentor.display_name.split(" ")[0];
  const orderHref = { pathname: "/parent/order" as const, params: { mentor: mentor.slug } };
  const canOrder = !session || profile?.role === "parent";

  return (
    <Screen width="content">
      <View style={s.topbar}>
        <Link href="/mentors" asChild>
          <Brand size={44} />
        </Link>
        <Link href="/mentors" asChild>
          <Button title="All mentors" variant="ghost" small />
        </Link>
      </View>
      <View>
        <Label>FLP Mentor · {TIER_LABEL[mentor.tier]}</Label>
        <H1>{mentor.display_name}</H1>
      </View>
      <MentorCard mentor={mentor} settings={settings} />

      {mentor.video_playback_id && Platform.OS === "web" ? (
        <Card>
          <H3>Meet {first}</H3>
          <iframe
            src={`https://player.mux.com/${mentor.video_playback_id}?primary-color=%23d4a32c&accent-color=%23000000`}
            style={{ border: 0, width: "100%", aspectRatio: "16 / 9", borderRadius: radius.md }}
            allow="fullscreen"
            allowFullScreen
            title={`${mentor.display_name} intro`}
          />
        </Card>
      ) : null}

      <Card>
        <H3>Order a breakdown with {first}</H3>
        <Body style={{ color: colors.muted }}>
          {money(price)} per game. Upload the film, say what to look for, and get a recorded breakdown plus a Player Development
          Worksheet back within {settings.rules.turnaround_hours} hours of acceptance.
          {!mentor.available ? " This mentor is at capacity right now; you can join the waitlist and name a second choice." : ""}
        </Body>
        {canOrder ? (
          <Link href={session ? orderHref : "/sign-up"} asChild>
            <Button title={session ? "Order a breakdown" : "Create a parent account to order"} />
          </Link>
        ) : (
          <Small>Sign in with a parent account to order.</Small>
        )}
        <Small>Film Room mentoring sessions with {first} open once pricing is set.</Small>
      </Card>

      {reviews.length > 0 ? (
        <Card>
          <H3>What parents say</H3>
          {reviews.map((r) => (
            <View key={r.breakdown_id} style={s.review}>
              <View style={s.row}>
                <Body style={{ color: colors.gold }}>{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</Body>
                <Small>
                  {r.parent_first_name}, parent of a {r.age_group} {r.position} · {new Date(r.reviewed_at).toLocaleDateString()}
                </Small>
              </View>
              {r.review ? <Body>{r.review}</Body> : null}
            </View>
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, flexWrap: "wrap" },
  review: { borderTopWidth: 1, borderTopColor: colors.line, paddingTop: space.sm, gap: 4 },
});
