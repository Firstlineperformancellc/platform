import { Link } from "expo-router";
import { StyleSheet, View } from "react-native";
import { Brand } from "@/components/Brand";
import { Button } from "@/components/ui/Button";
import { Screen } from "@/components/ui/Screen";
import { Body, Display, Small } from "@/components/ui/Text";
import { colors, space } from "@/theme/tokens";

export default function Welcome() {
  return (
    <Screen width="form" center>
      <Brand size={140} caption="Real insight. Real athletes. Real development." />
      <Display center>
        Personalized feedback from <Display gold>high-level athletes</Display>
      </Display>
      <Body center style={{ color: colors.muted }}>
        Parents order a video breakdown of their player's game film. Athletes who have played at the next level
        deliver it.
      </Body>
      <View style={s.actions}>
        <Link href="/sign-up" asChild>
          <Button title="I'm a parent" full />
        </Link>
        <Link href="/apply" asChild>
          <Button title="I'm an athlete" variant="secondary" full />
        </Link>
      </View>
      <Small center>
        Already have an account?{" "}
        <Link href="/sign-in" style={s.link}>
          Sign in
        </Link>
      </Small>
    </Screen>
  );
}

const s = StyleSheet.create({
  actions: { gap: space.md },
  link: { color: colors.gold, fontFamily: "Barlow_600SemiBold" },
});
