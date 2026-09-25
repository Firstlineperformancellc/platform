import { Link } from "expo-router";
import { StyleSheet, View } from "react-native";
import { Brand } from "@/components/Brand";
import { ContactDetails } from "@/components/ContactDetails";
import { Button } from "@/components/ui/Button";
import { Screen } from "@/components/ui/Screen";
import { H1, Label } from "@/components/ui/Text";

export default function ParentAccount() {
  return (
    <Screen title="Account" width="content">
      <View style={s.topbar}>
        <Link href="/parent" asChild><Brand size={44} /></Link>
        <Link href="/parent" asChild><Button title="Dashboard" variant="ghost" small /></Link>
      </View>
      <View>
        <Label>Parent account</Label>
        <H1>Your details</H1>
      </View>
      <ContactDetails />
    </Screen>
  );
}

const s = StyleSheet.create({ topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" } });
