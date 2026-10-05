# Decisions

Dated, with who decided and why. Newest at the bottom. Verbal agreements get written here the same day.

## 2026-09-18 — Architecture and start (Scott, answering the spec's section 10)

| # | Decision | Chosen | Why |
|---|---|---|---|
| D1 | Codebase strategy | One Expo app for web, iOS, Android | Only option where the two-week appify window is credible; pipeline already shipped once with Moonscribed |
| D2 | Video provider | Mux | Most mature resumable direct upload for multi-GB film from phones |
| D3 | Call provider | Daily.co | Prebuilt call UI; recording locked on at the room level |
| D4 | Email provider | Resend | Known tool, already used by the deck, sends from a subdomain |
| D5 | iOS purchase path | External link to web checkout for breakdowns; mentoring booked in-app | Avoids Apple's cut and separate iOS pricing; mentoring qualifies as a person-to-person service. Alex to be told what it means for iOS |
| D6 | Admin panel | Inside the product app, web-only, admin role | One codebase, one login, one deploy, one handover |
| D7 | Marketing site | Static on the droplet, grown from the coming-soon page | Fast, indexable, editable without a product deploy |
| D8 | Communications deck | Frozen except for fixes | Every hour on the deck is an hour off the product |
| D9 | Week-1 start | 2026-09-07 as week 1; contract mark 2026-11-11; no slack added | "As fast as possible" |
| D10 | Repo, CLAUDE.md, memory | Go | Done 2026-09-18 |

## 2026-09-18 — Deck folder moved into FLP (Scott)

`~/Desktop/FLP DECK` moved to `~/Desktop/FLP/deck` per the isolation rule. Remains its own git repository; ignored by the FLP repo.

## 2026-09-21 — Product decisions from the Alex meeting (Scott's notes, Sept 20) and follow-ups

**Naming.** The customer-side player is the **youth athlete**. Reviewers are **FLP Mentors** ("FLP Mentor" in all screen text). The parent is the account holder: warm copy calls them the **Original Coach (OC)**; forms, receipts, legal text, and admin say **Parent / Guardian** (hybrid, Scott 2026-09-21).

**Breakdown pricing and splits.** Three mentor tiers, priced by the tier, always the same price for every mentor in a tier:

| Tier | Breakdown price | Split (mentor / FLP) |
|---|---|---|
| Pro (NHL, AHL, ECHL, European pro leagues) | $1,000 | 70 / 30 |
| PWHL | $250 | 60 / 40 |
| NCAA (D1, D3, U Sports) | $175 | 60 / 40 |

Junior levels (OHL/WHL/QMJHL, USHL/NAHL/BCHL) are selectable as "highest level played" but **not offered as mentors at launch**. A mentor's tier is the **highest level they ever played**; they may explain a current lower level in their bio. National team / national champion credentials are a **profile badge, no price change**. Tier claims are **unverified but accepted**; admin holds a **verified / unverified** flag, not shown publicly.

**Deliverable.** The recorded breakdown plus the **Player Development Worksheet** (Alex's sample, `docs/reference/FLP Player Development Worksheet.docx`): strengths, areas to improve, game-situations table (clip time, situation, what happened, what to improve, key takeaway), recommended workouts and drills table (area, drill, description, frequency, notes), next steps, additional notes. Built as an in-app form; header auto-filled; **minimum one clip row and one drill row**, form nudges toward three clips; youth athlete gets a **branded PDF** (Scott delegated both calls to Claude).

**Turnaround and acceptance.** A mentor has **48 hours to accept** an offered job (nudged at 24). The **72-hour turnaround starts at acceptance**. Mentor reminders at **24 and 48 hours** after acceptance, email now, push once apps ship. Admin sees a metered view of outstanding work.

**Assignment model.** **Parent picks the mentor** from the marketplace. Each mentor profile is also their advertising: bio, optional video (**no length cap**), specialties. Mentors set capacity as **jobs on deck** (unfinished jobs), **default 3, mentor may raise to 5**. Marketplace shows available / unavailable and each mentor's **average turnaround** ("New" until they've delivered). Parent names a **second choice** (optional, strongly suggested — default). If the first choice is unavailable, the parent is asked **how many days to wait** before the job goes to the second choice (prompt suggests a default). If both fail: **admin queue** to assign or refund (default).

**Charging.** Parent is **charged at checkout**, including when joining a waitlist. Noted: Stripe keeps its fee on refunds; authorize-then-capture was offered and not taken.

**Reviews.** 1–5 stars plus testimonial after delivery. **3 stars and above publish automatically; below 3 goes to admin review** before it appears.

**Quality Control Audit (QCA).** A dissatisfied parent may file within **7 days** of delivery. Admin (Alex/Bryan) reviews the video, worksheet, and reason; outcomes: refund, reassign to another mentor, or other; notes and action taken recorded; audit opened and closed. Applies to mentoring sessions too. Payout hold while an audit is open: **default yes** pending the payout decision.

**Mentor scorecard (admin only).** Average turnaround, on-time %, ratings, jobs completed, acceptance rate, declines and expired offers, QCA count and outcomes, worksheet completeness, last active, verified flag. Admin actions: **suspend / unsuspend**, **deactivate and block**, **deactivate and delete**.

**Mentor payouts.** Timing **undecided**. Default: **manual from admin** — per-mentor and per-job ledger (owed, held, paid), date filters, Stripe reconciliation view, Pay per job or batch via Stripe Connect. When a rule is chosen it becomes an automatic trigger on the same plumbing.

**Mentoring = Film Room** (Scott's structure sent to Alex 2026-09-21; long-form research in `docs/MENTORING_PROPOSAL.md`). Recorded live call where mentor and youth athlete watch the athlete's own film; starts from the worksheet, ends with a mentor recap (three takeaways, one or two drills, one next step) within 24 hours that appends to the **Development Log**; parent rates with the same 3-star gate. Two doors: the delivered-breakdown offer and the marketplace (marketplace bookings must attach film). Prep screen for the mentor. Same mentor by default, one-tap rebook, same wait-or-second-choice prompt. Mentors set **recurring weekly windows** plus a sessions-on-deck cap. Parent picks a slot, **pays at booking**, calendar invite, reminders at 24h and 1h. Recordings locked on, notice on join, **kept 90 days** for admin, then a family prompt to download or pay to keep (**keepsake storage — Phase 2, price and free allowance TBD**). QCA applies. **Pricing: Alex to decide**; Claude's proposed table stays as reference. **Session rules to be added later; built as settings** with these defaults: 24-hour cancellation, 10-minute grace, one courtesy rebook per family, mentor no-show refunds and marks the scorecard, mentors accept or decline a session like a breakdown, "parent present" is the family's choice.

**Taxonomy.** Alex's lists pending. Starter lists in settings, editable in admin: age groups 8U–18U; positions forward / defense / goalie; skill levels House, A, AA, AAA; skater focus areas hockey IQ, skating, shooting, passing, positioning, defensive play, game awareness, other; goalie focus areas rebound control, positioning, angle play, puck tracking, odd-man rushes, game IQ, communication, mental game.

**Profiles.** Rudimentary fields now (youth athlete: first name, last initial, age group, position, skill level, current team, parent behind it; mentor: display name, photo, tier and highest level, current team/status, positions reviewed, specialties, bio, optional video, admin-only verified flag, computed stats). Depth to be discussed around week 3.

**Scope note.** The mentor marketplace with capacity, availability, second choice, waitlist, and acceptance window, and the worksheet deliverable, are additions to the contract's thirteen items. Scott chose to absorb them (2026-09-21). Junior mentor tier and keepsake recordings are parked.

## 2026-09-21 — Film Room sessions live on dev (Daily connected)

- **Session prices are Claude's proposal until Alex sets them** (Scott: "use your suggested session prices for now"). Film Room 30 min: Pro $349 / PWHL $119 / NCAA $89. 60 min: $599 / $199 / $149. Add-on 30 min within 14 days of a delivered breakdown: $299 / $99 / $69. Season Arc (4 × 30 min over 8 weeks): $1,199 / $399 / $299. Mentor share follows the tier split. Editable in /admin/settings.
- **Booking rules** (settings.rules): 30-minute slots inside the mentor's availability windows, 12 hours' lead, 14 days ahead, mentor confirms within 24 hours or the parent is refunded, free cancellation up to 24 hours before (inside the window the parent forfeits and the mentor is still paid; a mentor cancelling inside the window is logged against their scorecard), 10-minute grace, recap due within 24 hours, recordings kept 90 days.
- **Recording nobody can stop, enforced in Daily configuration.** Rooms are created with no recording permission at all. The mentor's meeting token carries `enable_recording: cloud`, `start_cloud_recording: true`, `enable_recording_ui: false`, and admin rights limited to participants; the parent's token carries none. Verified live on 2026-09-21: recording starts when the mentor joins, neither screen shows a stop control, and a rejoin starts a fresh recording. Every recording id is kept on the session (`sessions.recordings`); admin can open each one through a one-hour Daily access link.
- **Daily account:** domain `firstlineperform`, API key and webhook secret in the API env only; webhook registered with `services/api/deploy/daily-webhook.sh` (events recording.started, recording.ready-to-download, meeting.ended; HMAC-verified). `meeting.ended` closes a session only once the booked time is essentially over, so a mid-session reconnect doesn't end it; the timer closes anything left.
- **Ratings:** Film Room ratings use the same 3-star gate and count toward the mentor's public rating alongside breakdown reviews.
- **Parked:** pulling Daily recordings into Mux so families can rewatch in the app player (storage cost per session); a parent-side "no show" adjudication screen for admin (today: audit log + ledger).

## 2026-09-21 — Audit pass (Scott asked for a full check; bugs fixed, judgment calls listed)

- **Client access is read-mostly by policy.** Direct Supabase writes from the app are limited to what the app does: a parent's youth athletes and a mentor's own profile fields. Orders, jobs, breakdowns, sessions, media, audits, payouts, reviews and settings change only through the API, which checks the caller and logs admin actions. Migration 0013.
- **Applications start plain.** Whatever a client sends, a new mentor row is stored as an unverified, untiered applicant with no payout account. Admin sets tier at approval, and approval without a tier is refused (the marketplace only lists tiered mentors).
- **Prices and lists are public.** Signed-out visitors read the settings row so the marketplace and profiles render with prices. Nothing sensitive lives there.
- **Film Room prices and session rules are editable in /admin/settings** (they were documented as editable before this pass but the screen lacked them).

## 2026-09-21 — Audit follow-ups (Scott: all but the late-cancel rule)

- **Admins have no direct database writes.** Every admin action goes through the API and lands in `audit_log`. Admin accounts read everything.
- **Offer visibility is scoped to the offer.** A mentor sees an order and the youth athlete's name while their offer is open and after they accept; a declined or expired offer takes that access away.
- **Capacity counts open offers.** A mentor holding three accepted jobs and two unanswered offers is at five on deck.
- **The full scorecard is admin-only.** The public marketplace keeps rating, count, turnaround and completed jobs.
- **Mentor no-show is automatic.** A booked Film Room the mentor never joins becomes a mentor no-show 24 hours after its end: full refund, scorecard mark, mentor and admin notified.
- **A first choice who is no longer listed is skipped**, not waited for; the order goes to the second choice or the admin queue at once.
- **Family video is signed.** Game film and breakdowns are uploaded with Mux signed playback; the API issues two-hour tokens only to the owner, the mentor on the accepted job, the parent the breakdown was delivered to, or an admin. Intro videos stay public for the marketplace. Live on dev 2026-09-21: the Mux token `flp-api-dev` carries Video and System scope, the signing key was created with `services/api/deploy/mux-signing-key.sh`, and a bare stream URL for a family upload returns 403 at Mux.
- **Kept:** a mentor cancelling an unconfirmed request inside the 24-hour window still counts as a late cancel on their scorecard (Scott, 2026-09-21).

## 2026-09-23 — Production stack live (pre-launch)

- **Hosts.** app.firstlineperform.com (web app) and api.firstlineperform.com (API) on droplet flp-prod-01 (64.225.20.246), Supabase project `flp-platform-prod` (Pro). firstlineperform.com keeps the coming-soon page until Scott explicitly ships the marketing site.
- **Release path.** `deploy/release.sh` only, from a clean `main` in sync with GitHub; tags `vYYYY.MM.DD-N`; `deploy/rollback.sh` restores the previous API build. Production database changes go through `deploy/migrate.sh`, run by Scott. Claude does not write to production.
- **First release** v2026.09.23-1 with provider keys empty: payments, uploads, video rooms and email stay off in production until the keys are pasted and a release is run.

## 2026-09-23 — Provider wiring for production

- **Resend** sends from `mail.firstlineperform.com` (verified). Two sending-only keys, `flp-api-dev` and `flp-api-prod`, scoped to that domain. The same prod key is the SMTP password in the production Supabase project, so sign-up and password emails also go through Resend. Auth emails use FLP-branded templates in `supabase/templates`.
- **Mux** has two environments: `Development` (the original, used by dev) and `Production`. Each has its own access token, webhook and signing key. Family film in production is signed from the first upload.
- **Daily allows one webhook per domain.** It points at production; production relays events for rooms it doesn't own to dev over the same signature, and room names carry the environment (`flp-prod-…`, `flp-dev-…`) so the two can't collide.
- **Production auth config** is pushed from `supabase/config.toml`'s `[remotes.production]` overrides: app URL, redirect list, confirmed sign-ups, a one-minute email rate limit.

## 2026-09-23 — Pre-demo sweep

- **Free preview payments switch.** `settings.rules.payments_mode` is `stripe` (charge at checkout when Stripe is configured) or `free_preview` (orders and Film Room bookings complete with no charge, for demos and the beta). Admin flips it on the Settings page; a red banner shows in admin while it's on; every flip is audit-logged. Switch back to Stripe before real families use the platform.
- **Applicants finish on first sign-in.** With confirmed sign-ups, the mentor application creates the account first and the mentor profile after the applicant's first sign-in, from the dashboard card or the apply page.
- **Phone-safe opening.** Join links, worksheet PDFs and recordings open through a helper that survives mobile popup blocking.
- **Password reset** exists (sign-in page, branded email, `/reset-password`). **Terms and Privacy** are linked at sign-up and on the application, pointing at the drafts until counsel's versions replace them.

## 2026-09-24 — Admin Users page

- **Every account in one place.** Admin sees all parents, mentors and admins with search, role and status filters, joined and last sign-in dates, youth athletes, orders, Film Rooms, and money: what a parent has spent (and been refunded) or what a mentor has earned and been paid.
- **Suspend and unsuspend** lock the account at the sign-in layer, refuse its API calls immediately, pull a mentor off the marketplace, email the person with the reason, and log the action.
- **Delete** erases an account outright only when nothing references it; an account with orders, sessions or payouts is deactivated instead, so ledgers and other people's records keep their history. Admins are managed from Settings, not deletable from Users, and nobody can act on their own account.
- **Activity timeline** per account: created, sign-ins, orders, film uploads, breakdowns accepted and delivered, reviews, audits, Film Rooms booked and completed, packs, payouts, and every admin action on the account.
- **Guard:** users cannot change their own suspension or deletion flags.

## 2026-09-24 — Support desk

- **One queue, three doors.** Email to support@firstlineperform.com, the in-app Support page (parents and mentors, linked from their dashboards), and the website's contact form all create tickets in the same table. Admin works them at `/admin/support`, which has its own navigation: Queue (Inbox, Waiting on customer, Resolved, All, search), Canned replies, Mail setup. The admin overview carries a full-width Support desk tile under the existing tiles with the two counts that matter: waiting on FLP, waiting on customer.
- **Mail stays on Google Workspace.** Inbound is a Google Apps Script in the support@ mailbox (`deploy/support/inbound-mail.gs`) that posts each new message to `POST /support/inbound` with a shared secret every five minutes; replies from customers thread onto their ticket by the `[FLP-n]` subject tag, then by In-Reply-To/References, then by an open ticket from the same sender. Duplicates are dropped by Message-ID; automated senders are ignored. Attachments are recorded by name and stay in the mailbox.
- **Every reply is a real email** sent through Resend from the support identity (`SUPPORT_FROM`; until the root domain is verified in Resend it falls back to the platform mail identity with support@ as reply-to), threaded onto the customer's last message, with the ticket tag in the subject. Internal notes are never mailed and never move a ticket in the queue. Replying defaults the ticket to "Waiting on customer" and assigns it to the replier; a customer's reply reopens it.
- **Access.** Admins read everything; a requester with an account reads their own tickets and the in/out messages, never notes. All writes go through the API, which audit-logs replies and updates and notifies admins of new tickets and replies. Anonymous website posts have a honeypot field and a per-address rate limit.
- **Lesson:** on web, a `Link asChild` around a component whose `style` is an array turns the array into an object with numeric keys and blanks the page; pass a flattened style.

## 2026-09-24 — Service Health Meter

- **Once an hour the API probes every connected service** with one small read-only request and an 8-second limit: database, sign-in (Supabase Auth), file storage (both buckets), Mux (plus the signing key), Daily, Resend (a sending-only key answers "restricted", which counts as alive), the support@ mailbox script (it pings `/support/heartbeat` on every run; silent for 20 minutes turns red), Stripe, the web app, the marketing site, and the server's disk. The 5-minute job tick runs it when the last run is about an hour old; admins can also press Check now.
- **Three states plus one.** Healthy, Needs attention (answered, but the setup is incomplete), Unhealthy (no answer or refused). "Not connected" services (Stripe until it exists) are shown but never counted, so the meter can be green before launch. If no run lands for two hours the meter reads "Checks overdue", which means the job timer itself is down.
- **Reporting.** One email to every admin when a service turns unhealthy and one when it recovers; nothing repeats hourly. Runs are kept for 30 days (`service_health_runs`, admin-read RLS; migration 0019).
- **Placement.** Health is its own admin tab (`/admin/health`: meter, each service, last 48 runs). The Control Center carries a slim badge with the overall state and one dot per service, linking to the tab. Scott reviewed a mockup (`docs/mockups/service-health-meter.html`) before it shipped.

## 2026-09-25 — Contact details and Contact button on Users

- **Every account carries name, email, phone and mailing address** (migration 0020 adds `profiles.address`; phone existed). People fill them in themselves: parents on a new Account page, mentors at the bottom of their profile page. Only the owner can edit them; admins see them on the Users tile.
- **Contact sends a real email from the Users tile** and opens a support ticket for it (status "waiting on customer", assigned to the sender), so the person's reply threads straight back into the Support desk by the `[FLP-n]` tag. It goes out from the support identity with support@ as reply-to, is audit-logged as `user.contact`, and the tile reports honestly if the mail provider refused the address.

## 2026-09-28 — Mentor application, second pass

- **The application is saved with the sign-up.** The form's answers travel in the sign-up metadata and the sign-up trigger creates the applicant row at once, so nothing is lost when email confirmation comes later (before this, everything but the account was discarded and re-asked). Admins see the application the moment it is submitted.
- **New questions:** an Elite Prospects profile link (optional; accepted only on eliteprospects.com; shown on the public profile and editable by the mentor), "Why do you want to be a mentor?" (extra money / full time as primary income / help young athletes / multiple reasons / other with free text), and "Are there any special circumstances you think our team should know about during the approval process?". Anything in that last box lets the application through without the other answers, and it shows in amber on the admin card.
- **A thank-you page** (`/applied`) follows every submission: the safety-review explanation, watch your inbox and add firstlineperform.com to your safe-sender list, and what happens on approval. When the email still needs confirming it leads with that, with a Resend button.
- **Answers are private (migration 0022).** Why-they-mentor (now multi-select from a drop-down), the "other" text, special circumstances and a new age question live in `athlete_applications`, readable only by the applicant and admins. They were briefly on the mentor row, which anyone can read once a mentor is approved. Bio and special-circumstances boxes are three lines tall with a 1,000-character limit.
- **Gender** (migration 0023) is asked beside age as a single-pick drop-down: Male, Female, Non-binary, Prefer not to say. Stored in the private application table.
- **Lesson:** the public `marketplace_mentors` view runs with owner rights so anonymous visitors can read it; recreating it with `security_invoker` silently breaks the marketplace for visitors. Prerendered pages must not render query parameters on first paint (React hydration mismatch).

## 2026-10-02 — Mentor levels and the marketplace control center

- **Levels are data.** The three fixed tiers (pro, pwhl, ncaa) were hard-wired into four database constraints and three price maps. They now live in `mentor_tiers` (migration 0024), seeded from the prices in force. Admin → Marketplace adds, renames, orders, hides, prices and retires levels. Each level carries its own breakdown price, mentor share and Film Room prices; the old price sections on Settings are gone.
- **Per level:** name, a line of description, place in the hierarchy (top of the list is the top level), **Visible** (unticked = private: its mentors are not on the public marketplace or orderable) and **Show the price** (unticked = tiles read "Please contact for pricing", the profile offers "Contact FLP for pricing" into the support desk, and self-serve checkout and booking are refused by the API).
- **Deleting a level:** refused while mentors are on it; retired instead of deleted when past orders or sessions carry it, so history keeps its name; deleted outright when nothing ever used it. Retired levels can be restored.
- **Mentor tiles:** admins choose what every tile shows (price, availability, rating, turnaround, positions, badges, bio), how the list is ordered (hierarchy, rating or name), and whether it is grouped under level headings, with a live preview. Each approved mentor has **Listed** and **Featured** switches; featured mentors come first.
- **Privacy:** the levels table is admin-only. Everyone else reads `mentor_tiers_public`, which leaves out private and retired levels, the mentor share, and the prices of by-arrangement levels. A mentor always sees their own level's name. Mentors cannot list or feature themselves.
- **Extras Scott chose (migration 0025):** a mentor can carry **custom prices** that override their level's (admin only; orders, Film Room and Season Arc all charge them; the mentor's share still follows the level's percentage). A private level can be **bookable by direct link**: out of the marketplace list, but a mentor's profile link opens and parents can order from it. Each level can set its own **turnaround hours** (drives the delivery clock and the wording parents see) and **jobs on deck** a mentor starts with when they join it. Each level can have a **colour** for its name on the tiles. Parents get a **Level filter** on the marketplace. Every level change is kept in **mentor_tier_history** with who made it, shown per mentor in the control center.
- **Tooling:** the deploy scripts pin the Supabase CLI version (`npx -y supabase@2.118.0`), because each new CLI release broke the cached unpinned one.

## 2026-10-03 — Sign-out ends one device, and an ended session says so

- **What happened:** Alex was working in the level controls on one device, signed out on another, and his next saves were refused with "admin only". Supabase's default sign-out ends every session a person has, on every device.
- **Sign out is now local** to the device it is pressed on.
- **An ended or invalid session gets its own answer** on all admin routes (401, "Your session has ended. Sign in again.") before the role check; the app clears the dead session and returns to sign-in. "admin only" (403) now means only that: a valid session that is not an admin.

## 2026-10-05 — Billing: how money moves through Stripe

- **Shape:** parents pay FLP through Stripe Checkout (breakdowns, Film Room sessions, Season Arc packs). FLP is the merchant of record. Mentors are paid by a Stripe transfer to their own Connect Express account. FLP never holds money outside Stripe. Runbook: `docs/STRIPE_SETUP.md`.
- **Transfers are tied to the charge that funded them** (`source_transaction`), so a mentor can never be paid more than the parent paid, and a payout does not wait on FLP's balance settling. Every refund and transfer carries an idempotency key built from the business event, so a retry can never move money twice.
- **Stripe is the source of truth for payment state.** The webhook marks orders and sessions paid, releases a Film Room slot when a checkout is abandoned (Stripe's expiry at 31 minutes, with a 45-minute sweep behind it), records refunds made in the Stripe dashboard, puts a mentor's payout on hold when a card is disputed, and switches a mentor's payouts on when Stripe finishes verifying them. Each event is processed once (`stripe_events`); a failure hands the event back to Stripe to retry.
- **Refunds:** admins refund an order in full or in part from Orders & jobs. A full refund closes the order and voids an unpaid payout. A payout that already went out is not pulled back; the admin is told the amount and decides. A refund Stripe refuses is reported as a failure, never as done.
- **Payout timing is a setting, Manual by default.** On Manual an admin presses Pay on the ledger. On Automatic each payout is sent once it is older than the waiting period (default 7 days, the audit window). Held payouts are never sent. A real failure notifies the admins once and is retried every six hours; a mentor who has not finished Stripe setup, or a sale that was never charged (free preview), stays owed with the reason on the ledger and no alarm.
- **Mentors** see their earnings (paid, on its way, on hold) and can open their Stripe Express dashboard from their profile.
- **Two webhook endpoints, two secrets:** one for FLP's own account, one for connected accounts. `services/api/deploy/stripe-webhook.sh` creates both and writes the signing secrets into the env file, so no secret is copied by hand.
- **Not built, by decision pending:** sales tax collection, pulling money back from a mentor after a refund, and mentor tax forms beyond what Stripe Express provides.
