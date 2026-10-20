import { useEffect, useState } from "react";
import { Link, useLocalSearchParams } from "expo-router";
import { Platform, StyleSheet, View } from "react-native";
import { Brand } from "@/components/Brand";
import { BookSession } from "@/components/BookSession";
import { CareerTable } from "@/components/CareerTable";
import { MentorCard } from "@/components/MentorCard";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Screen } from "@/components/ui/Screen";
import { Body, H1, H3, Label, Small } from "@/components/ui/Text";
import { Loading, useAuth } from "@/lib/auth";
import { hasGoalie, hasSkater, listCareerPublic, type CareerPublicRow } from "@/lib/career";
import { getMentor, listReviews, type MarketplaceMentor, type MentorReview, priceOf } from "@/lib/mentors";
import { money as presentsMoney } from "@/lib/presents";
import { money, TIER_LABEL, useSettings } from "@/lib/settings";
import { colors, radius, space } from "@/theme/tokens";

// Public profile and booking link: /mentors/<slug>. This is the mentor's advertising deck.
export default function MentorProfile() {
  const { slug, addon } = useLocalSearchParams<{ slug: string; addon?: string }>();
  const { session, profile } = useAuth();
  const { settings } = useSettings();
  const [mentor, setMentor] = useState<MarketplaceMentor | null | undefined>(undefined);
  const [reviews, setReviews] = useState<MentorReview[]>([]);
  const [career, setCareer] = useState<CareerPublicRow[]>([]);

  useEffect(() => {
    if (!slug) return;
    getMentor(slug).then((m) => {
      setMentor(m);
      if (m) {
        listReviews(m.user_id).then(setReviews);
        listCareerPublic(m.user_id).then(setCareer);
      }
    });
  }, [slug]);

  if (mentor === undefined || !settings) return <Loading />;
  if (!mentor)
    return (
      <Screen title="FLP Mentor" width="form" center>
        <H1 center>Mentor not found</H1>
        <Link href="/mentors" asChild>
          <Button title="Back to mentors" variant="secondary" />
        </Link>
      </Screen>
    );

  const price = priceOf(mentor, settings, "breakdown") ?? 0;
  const turnaround = mentor.turnaround_hours ?? settings.rules.turnaround_hours;
  const first = mentor.display_name.split(" ")[0];
  const orderHref = { pathname: "/parent/order" as const, params: { mentor: mentor.slug } };
  const canOrder = !session || profile?.role === "parent";
  const showCareer = career.length > 0 || (mentor.awards ?? []).length > 0 || !!mentor.career_note;

  return (
    <Screen title="FLP Mentor" width="content">
      <View style={s.topbar}>
        <Link href="/mentors" asChild>
          <Brand size={44} />
        </Link>
        <Link href="/mentors" asChild>
          <Button title="All mentors" variant="ghost" small />
        </Link>
      </View>
      <View>
        <Label>FLP Mentor · {mentor.tier_name ?? TIER_LABEL[mentor.tier]}</Label>
        <H1>{mentor.display_name}</H1>
      </View>
      {/* compact: the header card drops the clamped excerpt because the full bio is right below. */}
      <MentorCard mentor={mentor} settings={settings} compact />
      {mentor.bio.trim() || mentor.teaching_focus || mentor.who_i_help ? (
        <Card>
          <H3>About {first}</H3>
          {paragraphs(mentor.bio).map((t, i) => (
            <Body key={i}>{t}</Body>
          ))}
          {mentor.teaching_focus ? (
            <View style={s.section}>
              <Label>What I'm best at teaching</Label>
              {paragraphs(mentor.teaching_focus).map((t, i) => (
                <Body key={i}>{t}</Body>
              ))}
            </View>
          ) : null}
          {mentor.who_i_help ? (
            <View style={s.section}>
              <Label>Who I want to help</Label>
              {paragraphs(mentor.who_i_help).map((t, i) => (
                <Body key={i}>{t}</Body>
              ))}
            </View>
          ) : null}
        </Card>
      ) : null}
      {mentor.eliteprospects_url && !showCareer ? (
        <Small style={{ color: colors.gold }} onPress={() => window.open(mentor.eliteprospects_url!, "_blank", "noopener")}>Elite Prospects profile ↗</Small>
      ) : null}

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

      {showCareer ? (
        <Card>
          <H3>Career</H3>
          {career.length > 0 ? <CareerTable rows={career} goalie={hasGoalie(mentor.positions)} skater={hasSkater(mentor.positions) || !hasGoalie(mentor.positions)} /> : null}
          {(mentor.awards ?? []).length > 0 ? (
            <View style={s.section}>
              <Label>Awards and honours</Label>
              {(mentor.awards ?? []).map((a, i) => (
                <Body key={i}>{a}</Body>
              ))}
            </View>
          ) : null}
          {mentor.career_note ? <Small>{mentor.career_note}</Small> : null}
          {mentor.eliteprospects_url ? (
            <Small style={{ color: colors.gold }} onPress={() => window.open(mentor.eliteprospects_url!, "_blank", "noopener")}>Source: Elite Prospects ↗</Small>
          ) : (
            <Small style={{ color: colors.muted }}>Entered by {first}.</Small>
          )}
        </Card>
      ) : null}

      {mentor.price_visible === false ? (
        <Card>
          <H3>Work with {first}</H3>
          <Body style={{ color: colors.muted }}>Pricing for {first} is by arrangement. Tell us what you're looking for and FLP will set it up with you.</Body>
          <Link href={{ pathname: "/support", params: { subject: `Pricing for ${mentor.display_name}` } }} asChild>
            <Button title="Contact FLP for pricing" />
          </Link>
        </Card>
      ) : (
      <>
      <Card>
        <H3>Order a breakdown with {first}</H3>
        <Body style={{ color: colors.muted }}>
          {money(price)} per game. Upload the film, say what to look for, and get a recorded breakdown plus a Player Development
          Worksheet back within {turnaround} hours of acceptance.
          {!mentor.available ? " This mentor is at capacity right now; you can join the waitlist and name a second choice." : ""}
        </Body>
        {canOrder ? (
          <Link href={session ? orderHref : "/sign-up"} asChild>
            <Button title={session ? "Order a breakdown" : "Create a parent account to order"} />
          </Link>
        ) : (
          <Small>Sign in with a parent account to order.</Small>
        )}
      </Card>

      <BookSession mentor={mentor} settings={settings} addonBreakdownId={addon ?? null} />
      </>
      )}


      {reviews.length > 0 ? (
        <Card>
          <H3>What parents say</H3>
          {reviews.map((r) => (
            <View key={r.session_id ?? r.breakdown_id ?? r.reviewed_at} style={s.review}>
              <View style={s.row}>
                <Body style={{ color: colors.gold }}>{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</Body>
                <Small>
                  {r.parent_first_name}, parent of a {r.age_group} {r.position} · {r.kind === "session" ? "Film Room" : "breakdown"} · {new Date(r.reviewed_at).toLocaleDateString()}
                </Small>
              </View>
              {r.review ? <Body>{r.review}</Body> : null}
            </View>
          ))}
        </Card>
      ) : null}

      {/* First Line Presents is the last thing on the page, after the mentoring offers and the reviews. */}
      {mentor.presents_enabled && mentor.presents_price_cents != null ? (
        <Card style={s.presents}>
          <Label>Also from {first}</Label>
          <Body style={{ color: colors.muted }}>First Line Presents: a personal video message, {presentsMoney(mentor.presents_price_cents)}.</Body>
          <Link href={{ pathname: "/presents/[slug]", params: { slug: mentor.slug } }} asChild>
            <Button title="Request a video" variant="secondary" small />
          </Link>
        </Card>
      ) : null}
    </Screen>
  );
}

// A bio keeps its paragraphs: a blank line starts a new one, and a single line break stays a line break.
const paragraphs = (text: string | null | undefined) => (text ?? "").split(/\n\s*\n/).map((t) => t.trim()).filter(Boolean);

const s = StyleSheet.create({
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  section: { gap: 4, marginTop: space.xs },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, flexWrap: "wrap" },
  review: { borderTopWidth: 1, borderTopColor: colors.line, paddingTop: space.sm, gap: 4 },
  presents: { gap: space.sm, paddingVertical: space.lg },
});
