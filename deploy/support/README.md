# Support desk: mail wiring

Tickets reach the desk three ways: email to support@firstlineperform.com, the in-app Support page,
and the website's contact form. Admins answer from /admin/support; every reply is an email.

## Inbound (support@ → tickets)

Mail stays on Google Workspace. A Google Apps Script in the mailbox that receives support@
(`inbound-mail.gs`) posts each new message to the API every five minutes.

1. Make sure support@firstlineperform.com delivers to a mailbox you can sign into (a Workspace user,
   or an alias of admin@).
2. Signed in as that account, open https://script.google.com, New project, paste `inbound-mail.gs`.
3. Set `API_URL` (production or dev) and `SECRET` = the `INBOUND_EMAIL_SECRET` line of the matching
   API env file.
4. Run `setup` once from the editor. Approve the Gmail and "connect to external service" permissions.
   That installs the trigger and processes anything already waiting.
5. Send a test email to support@ and watch it appear in /admin/support within five minutes. The
   message gets the Gmail label "FLP/Ticketed" once it's handed over. Each run also pings the API, so
   the Service Health Meter on the admin overview shows "Support inbox" as healthy while the script is alive.

## Outbound (replies from support@)

Replies go through Resend. To send *from* support@firstlineperform.com (rather than the platform
mail domain with a reply-to), verify the root domain in Resend: add `firstlineperform.com` as a
domain there, add its records at GoDaddy (they live on `resend._domainkey` and a `send` subdomain and
do not touch Workspace's MX), then set `SUPPORT_FROM=FLP Support <support@firstlineperform.com>` in
the API env file and release.
