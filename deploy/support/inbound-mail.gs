/**
 * FLP support inbox → platform. Paste into script.google.com while signed in as the account that
 * receives support@firstlineperform.com, set the two constants, run `setup` once (it asks for Gmail
 * permission and installs a 5-minute trigger). Every new message addressed to support@ is posted
 * to the API. Handled messages are remembered by id (and the thread gets the label "FLP/Ticketed"
 * so a human can see what went over); the API also ignores a message it has already stored.
 */
var API_URL = "https://api.firstlineperform.com/support/inbound";  // dev: https://api-dev.firstlineperform.com/support/inbound
var SECRET  = "PASTE_INBOUND_EMAIL_SECRET_HERE";                     // INBOUND_EMAIL_SECRET from the API env file
var LABEL   = "FLP/Ticketed";
var QUERY   = "to:support@firstlineperform.com newer_than:3d -from:support@firstlineperform.com";
var STORE   = PropertiesService.getScriptProperties();

function setup() {
  GmailApp.getUserLabelByName(LABEL) || GmailApp.createLabel(LABEL);
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger("handOver").timeBased().everyMinutes(5).create();
  handOver();
}

function handOver() {
  var label = GmailApp.getUserLabelByName(LABEL) || GmailApp.createLabel(LABEL);
  var done = JSON.parse(STORE.getProperty("handled") || "[]");
  var seen = {}; done.forEach(function (id) { seen[id] = true; });
  GmailApp.search(QUERY, 0, 50).forEach(function (thread) {
    thread.getMessages().forEach(function (m) {
      var id = m.getId();
      if (seen[id] || m.isDraft()) return;
      var refs = (m.getHeader("References") || "").split(/\s+/).filter(String);
      var payload = {
        from: m.getFrom(), to: m.getTo(), subject: m.getSubject(), date: m.getDate().toISOString(),
        text: m.getPlainBody(), html: m.getBody(),
        messageId: m.getHeader("Message-ID") || null, inReplyTo: m.getHeader("In-Reply-To") || null, references: refs,
        attachments: m.getAttachments().map(function (a) { return { name: a.getName(), size: a.getSize() }; })
      };
      var res = UrlFetchApp.fetch(API_URL, { method: "post", contentType: "application/json", headers: { "x-inbound-secret": SECRET }, payload: JSON.stringify(payload), muteHttpExceptions: true });
      if (res.getResponseCode() < 300) {
        seen[id] = true; done.push(id); thread.addLabel(label);
      } else {
        console.error("FLP inbound failed " + res.getResponseCode() + ": " + res.getContentText());
      }
    });
  });
  STORE.setProperty("handled", JSON.stringify(done.slice(-2000)));
}
