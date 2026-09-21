import { useEffect, useState } from "react";
import { Link, useLocalSearchParams } from "expo-router";
import { StyleSheet, View } from "react-native";
import { Brand } from "@/components/Brand";
import { MentorCard } from "@/components/MentorCard";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Screen } from "@/components/ui/Screen";
import { Body, H1, H3, Label, Small } from "@/components/ui/Text";
import { Loading, useAuth } from "@/lib/auth";
import { getMentor, type MarketplaceMentor } from "@/lib/mentors";
import { money, TIER_LABEL, useSettings } from "@/lib/settings";
import { colors, space } from "@/theme/tokens";

// Public profile and booking link: /mentors/<slug>. This is the mentor's advertising deck.
export default function MentorProfile() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { session, profile } = useAuth();
  const { settings } = useSettings();
  const [mentor, setMentor] = useState<MarketplaceMentor | null | undefined>(undefined);

  useEffect(() => {
    if (slug) getMentor(slug).then(setMentor);
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
      <Card>
        <H3>Order a breakdown with {mentor.display_name.split(" ")[0]}</H3>
        <Body style={{ color: colors.muted }}>
          {money(price)} per game. Upload the film, say what to look for, and get a recorded breakdown plus a Player
          Development Worksheet back within 72 hours of acceptance.
          {!mentor.available ? " This mentor is at capacity right now; you can join the waitlist and name a second choice." : ""}
        </Body>
        {canOrder ? (
          <Link href={session ? orderHref : "/sign-up"} asChild>
            <Button title={session ? "Order a breakdown" : "Create a parent account to order"} />
          </Link>
        ) : (
          <Small>Sign in with a parent account to order.</Small>
        )}
        <Small>Film Room mentoring sessions with {mentor.display_name.split(" ")[0]} open once pricing is set.</Small>
      </Card>
    </Screen>
  );
}

const s = StyleSheet.create({ topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" } });
