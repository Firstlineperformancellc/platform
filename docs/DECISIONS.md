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
