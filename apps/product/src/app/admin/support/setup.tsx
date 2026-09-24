import { View } from "react-native";
import { SupportShell } from "@/components/SupportShell";
import { Card } from "@/components/ui/Card";
import { Body, H3, Small } from "@/components/ui/Text";
import { colors } from "@/theme/tokens";

// How mail reaches and leaves the desk. Nothing to click here; it's the reference.
export default function SupportSetup() {
  return (
    <SupportShell title="Mail setup">
      <Card>
        <H3>How a ticket gets here</H3>
        <Body>Three doors, one queue.</Body>
        <Body>• <Body style={{ color: colors.ink }}>Email</Body> to support@firstlineperform.com. A small script in that mailbox hands every new message to the platform within five minutes. Replies from customers land on the same ticket by the [FLP-123] tag in the subject.</Body>
        <Body>• <Body style={{ color: colors.ink }}>In the app</Body>: parents and mentors have a Contact support link on their dashboard.</Body>
        <Body>• <Body style={{ color: colors.ink }}>The website</Body>: the contact page posts straight into the queue.</Body>
      </Card>
      <Card>
        <H3>How a reply goes out</H3>
        <Body>Every reply you send from a ticket is a real email to the requester, from FLP Support, threaded onto their conversation so it shows up under the message they sent. They can answer by replying to it.</Body>
        <Small>The sending address is support@firstlineperform.com once the root domain is verified with the mail provider; until then replies come from the platform's mail domain with support@ as the reply-to. Scott handles that switch.</Small>
      </Card>
      <Card>
        <H3>Habits that keep this working</H3>
        <View style={{ gap: 4 }}>
          <Body>• Answer from the ticket, not from Gmail, so the thread and the record stay in one place.</Body>
          <Body>• "Wait for their answer" after a reply moves the ticket out of the inbox until they write back; it comes back on its own.</Body>
          <Body>• Internal notes are never emailed. Use them to hand a ticket to someone else with context.</Body>
          <Body>• Tags are free text: billing, film room, bug, mentor. Search finds them.</Body>
        </View>
      </Card>
    </SupportShell>
  );
}


