# FLP Platform — Version 1: Project Spec and Delivery Plan

**Prepared for:** Scott Maslowe, Magnum Appus — internal review draft
**Date:** 2026-09-08
**Status:** PROPOSAL. Nothing in this document has been implemented. It exists to be read, marked up, and approved or changed before any build work starts.

---

## 0. How to read this

This is the plan I recommend for taking FLP from where it stands today (domain, mail, hosting, and a live coming-soon page) to a launched product, inside the contract's ten-week window, with the responsive web version live by the end of week 6 and the native apps submitted two weeks later.

It is organized so you can approve it in layers:

1. **What we're building and what the contract binds us to** (sections 1–3). Facts, not choices.
2. **The architecture** (sections 4–6). The one big decision, with my recommendation and the alternative.
3. **The plan** (section 7). Week by week, with what gets demoed each Sunday.
4. **How we work** (section 8). Practices and procedures for the whole build and the handover.
5. **What I need decided** (sections 10–11). Your decisions and the client's inputs, each numbered so you can answer by number.

---

## 1. The product

**FLP (First Line Performance)** is a two-sided marketplace. Parents of youth hockey players pay for personalized video breakdowns of their player's game film, delivered by vetted high-level athletes (NCAA, major junior, pro). The same athletes can also mentor players in live, recorded video sessions.

**Three kinds of users:**

| User | What they do | Account rule |
|---|---|---|
| **Customer (parent)** | Orders a breakdown for their player, uploads film, pays, receives the breakdown, books mentoring | Parent-owned. The player is never the account holder. |
| **Athlete** | Claims jobs, reviews film, uploads a recorded breakdown with takeaways and drills, runs mentoring sessions, gets paid | Applies, is approved by FLP before going live |
| **FLP admin** (Alex, Bryan) | Approves athletes, watches orders, reassigns jobs, refunds, reviews quality and session recordings | Internal |

**The customer flow, from the client's mockups:** choose position and age group and skill level, upload film (file, or a YouTube link), say what you want feedback on, review and pay, then receive the breakdown on a viewing page with the video, notes, and drills.

**The athlete flow:** dashboard with new, in-progress, and completed jobs; claim a job with a deadline; watch and download the clips; record the breakdown with their own screen-recording tool; upload it with key takeaways and drill recommendations; send. Earnings tracked per job and per month.

**Brand:** black field, gold and white, bold italic condensed type. The mockups are the design source of truth. The client's current pilot page (the video) shows the marketing voice: "Real access to the next level," mentors section, three-step how-it-works, pilot signup forms for parents and for mentors.

---

## 2. Contract anchors

Everything below is from the signed Software Development Agreement and Quote MA-2026-014. The plan in section 7 is built to satisfy these, not to reinterpret them.

**Scope of Work, thirteen items:**

| # | Item | Notes that matter for the build |
|---|---|---|
| 01 | Marketing website | Landing, How It Works, Pricing, About. Built from FLP's designs. |
| 02 | Accounts and authentication | Parent-owned customer accounts. Athlete accounts subject to FLP approval. |
| 03 | Customer order flow | Guided wizard plus secure checkout: card and Apple Pay. |
| 04 | Video upload and streaming | Large-file upload with resume, YouTube link import, smooth playback. |
| 05 | Athlete job board and dashboard | Available jobs, claim flow, deadlines, in-progress and completed tracking. |
| 06 | Breakdown delivery | Athlete reviews and downloads film, uploads their recorded breakdown, attaches takeaways and drills. Customer gets a polished viewing page. |
| 07 | Athlete profiles and booking links | Public, shareable profile with photo, bio, credentials, specialties, reviews, and a direct booking link into checkout. |
| 08 | Live mentoring sessions | Booking and scheduling, reminders, in-platform video calls. Every session recorded and retained for FLP review. Booked through the parent account, which may join at any time. |
| 09 | Earnings and payouts | Automated athlete payouts with guided onboarding, earnings dashboard, per-job history. |
| 10 | Admin panel | Orders, customers, athletes, job reassignment, refunds, breakdown quality review, athlete approval. |
| 11 | Notifications | Automated email at every step. |
| 12 | Native iOS and Android apps | Customer and athlete experiences as native apps with push notifications, submitted to both stores at launch. |
| 13 | QA and launch | Cross-browser, mobile-responsive, on-device testing, production deployment, launch support. |

**Explicitly out of scope for V1** (decided during quoting, framed to the client as sequencing): in-platform telestration and recording studio (athletes use their own screen recorder), Hudl import (no public API), athlete storefronts and promo kits, direct messaging between users.

**Milestones and money:**

| Milestone | Contract weeks | Deliverable | Payment |
|---|---|---|---|
| 1 — Foundations | 1–4 | Accounts, order flow, upload, payments, working demo | $6,400 at signing (received, plus $400 prepaid toward M2) |
| 2 — Athlete Experience | 5–7 | Job board, delivery, profiles and booking links, live mentoring, on private staging | $4,800, less the $400 |
| 3 — Launch | 8–10 | Payouts, admin, notifications, marketing site, full QA, production web launch, apps submitted | $4,800 |

**Clock:** ten weeks from the later of the Effective Date and receipt of the signing payment. The deposit was in hand by September 2, so I am treating **September 7 as the start of week 1** and **November 11 as the contract's ten-week mark**. The coming-soon page's countdown lands on November 10.

**Other binding terms the build must honor:**

- Client feedback within 3 business days of each milestone review, or the milestone is deemed accepted. Delays extend the timeline day for day.
- Milestone 3 is complete on production web launch plus store submission. Store approval is not a condition.
- All third-party accounts are created in and owned by First Line Performance LLC, billed at cost. This matches your isolation rule exactly.
- Customer accounts are parent-owned. Mentoring sessions are recorded by default with no off-the-record option, retained for FLP review, booked through the parent account. Safeguarding policy rests with FLP, but the software must enforce these mechanics.
- Client provides brand assets, copy, pricing decisions, drill content, athlete recruitment.
- Source code assigns to FLP on final payment. Until then, FLP may use it for review and testing only.
- 120-day warranty on delivered functionality from production web launch.
- Equity documentation due within 5 days of Milestone 3 completion.

---

## 3. Non-negotiables baked into the architecture

These are not features. They are constraints every design choice below respects.

1. **Total isolation and clean handover.** Every account, repo, server, database, key, and domain lives under FLP-owned identities (admin@firstlineperform.com and its aliases). At handover, Alex changes passwords and removes Scott. Nothing else has to move.
2. **App-driven from day one.** The web version launches first, but the codebase, API, auth, uploads, payments, and notifications are designed so the native apps are a packaging step, not a rewrite.
3. **Minors are never account holders.** Parent-owned accounts, player as a profile under the parent. No direct messaging. Every athlete-to-player contact happens inside a recorded, parent-bookable session or a delivered breakdown.
4. **The recording rule is enforced in code.** Sessions cannot start unrecorded. Recordings land in FLP-owned storage and are visible in admin.
5. **Money is never held by us.** Stripe holds funds. Stripe Connect pays athletes. FLP's cut is a platform fee on the charge.
6. **Two environments, always.** Development for us and for client review, Production for customers. Promotion to production is a deliberate step, never an accident.

---

## 4. Architecture

### 4.1 The one big decision: how web and apps share a codebase

Two credible options. I recommend the first.

**Option A (recommended): one Expo application that ships to web, iOS, and Android.**

The product app (customer and athlete experiences) is a single Expo project using Expo Router. Its web build is a real responsive web app served at `app.firstlineperform.com` and is the week-6 launch. Its iOS and Android builds are the same screens, the same API calls, and the same state, compiled natively with EAS in weeks 7–8. "Appifying" is then a bounded list: push notifications, the native video picker and background upload, deep links, store assets, review readiness.

Why A:
- You have shipped this exact pipeline. Moonscribed went through Expo, EAS, TestFlight, and App Store review with you at the keyboard. The traps are known and documented in your notes.
- It is the only option where the two-week appify window is credible. There is no second UI to build.
- One team, one codebase, one bug tracker, one thing to hand over.

Costs of A, stated honestly:
- React Native on web has quirks in wide desktop layouts. The athlete dashboard and admin panel need to be designed mobile-first and allowed to be plain at desktop widths. That matches the product anyway: athletes and parents are on phones.
- SEO is irrelevant inside the app, so the marketing site is separate (see 4.2).

**Option B: a Next.js web app wrapped with Capacitor for the stores.**

Best possible web developer experience and desktop layouts. The apps are the web app inside a native shell with plugins for push and files. Rejected because: you have not shipped a Capacitor app, Apple's minimum-functionality rule flags thin wrappers and a rejection cycle costs a week we do not have, and camera and microphone inside a web view for the mentoring calls is a known source of device-specific bugs.

**Decision needed: D1.**

### 4.2 The pieces

| Piece | Choice | Where it lives | Why |
|---|---|---|---|
| Marketing site | Static HTML/CSS, built from the client's designs, evolving the coming-soon page | Droplet `flp-web-01`, nginx, `firstlineperform.com` | Fast, SEO-friendly, zero framework, already hosted |
| Product app (web, iOS, Android) | Expo + Expo Router + TypeScript | Web build on the droplet at `app.firstlineperform.com`; native via EAS | See 4.1 |
| Admin panel | A route group inside the product app, web-only, gated by an admin role | Same web build at `app.firstlineperform.com/admin` | One codebase, one auth, no second deploy |
| Database, auth, storage, row security | Supabase (Postgres, Auth, Storage, Realtime) | FLP-owned Supabase organization, one project per environment | Your proven stack. Managed backups, RLS, magic links, and it hands over cleanly |
| Backend service | One small Node/TypeScript service (Hono or Fastify) | Droplet, systemd, `api.firstlineperform.com` behind nginx | Webhooks from Stripe, Mux, and Daily; signed URLs; the job state machine; scheduled reminders. Keeps business rules in one debuggable place |
| Video upload, storage, streaming | Mux: direct resumable uploads, transcoding, HLS playback, thumbnails, signed playback | FLP-owned Mux account | Handles multi-gigabyte game film, resume on flaky mobile connections, and adaptive playback without us running ffmpeg |
| Live mentoring calls | Daily.co: prebuilt call UI, cloud recording, React Native SDK and web SDK | FLP-owned Daily account | Recording is a room setting we lock on, so the "always recorded" rule is enforced by configuration |
| Payments | Stripe Checkout for orders (card and Apple Pay). Stripe Connect Express for athlete onboarding and payouts | FLP-owned Stripe account | Checkout gives us Apple Pay and PCI scope for free. Connect handles athlete identity, tax forms, and transfers |
| Transactional email | Resend, sending from a dedicated subdomain such as `mail.firstlineperform.com` | FLP-owned Resend account | Keeps app mail separate from Google Workspace's SPF and DKIM |
| Push notifications | Expo Push (weeks 7–8) | Expo account owned by FLP | Free, works with EAS, one API for both platforms |
| Error and uptime monitoring | Sentry (app and API), DigitalOcean monitoring, an uptime check | FLP-owned | We find out before the client does |
| Source control and CI | GitHub organization, GitHub Actions, EAS Build | FLP-owned org; devops@ as the owning identity | Per the kickoff email to Alex and Bryan |

**Decisions needed: D2 (Mux vs Cloudflare Stream), D3 (Daily vs LiveKit), D4 (Resend vs Postmark).** My picks are in the table. All four are commodity choices; I would not spend more than a minute on them.

### 4.3 Environments and domains

| Environment | Purpose | Web | API | Database | Payments |
|---|---|---|---|---|---|
| **Development** | Our daily work and the client's private staging review (contract Milestone 2) | `dev.firstlineperform.com` on a second $6 droplet in the "FLP Development" DO project | `api-dev.firstlineperform.com` | Supabase project `flp-dev` | Stripe test mode |
| **Production** | Real customers | `firstlineperform.com`, `app.firstlineperform.com` on `flp-web-01` | `api.firstlineperform.com` | Supabase project `flp-prod` | Stripe live mode |

Promotion is a tagged release merged from `dev` to `main`, deployed by a script, never by hand-editing on the server. This mirrors the dev-then-promote discipline you already run.

`comms.firstlineperform.com` is reserved for the project communications deck you described to Alex and Bryan (assumption: that is what the comms record is for). It is not part of the contracted scope and gets a minimal treatment (section 8.6).

### 4.4 Data model, core entities

Enough to agree on shape. Column-level design happens in week 1.

- **users** — auth identity, role (parent, athlete, admin), status.
- **players** — belongs to a parent user. Name, age group, position, skill level. Never a login.
- **athletes** — profile for an athlete user: photo, bio, credentials, specialties, approval status, Stripe Connect account id, public slug.
- **orders** — parent, player, position, focus areas, notes, price, Stripe payment intent, status (draft, paid, assigned, in_review, delivered, closed, refunded), optional preferred athlete (from a booking link).
- **media** — a Mux asset: owner, purpose (game film, breakdown), upload state, playback id, duration; or a YouTube link.
- **jobs** — one per paid order: claimed_by athlete, claimed_at, due_at, status, delivered_at, reassignment history.
- **breakdowns** — the delivered work: media reference, takeaways, drill recommendations, delivered_at, customer rating and review.
- **sessions** — mentoring: athlete, parent, player, scheduled_at, Daily room, recording reference, status, who joined and when.
- **payouts** — Stripe transfer records per job or session, athlete, amount, status.
- **notifications** — log of every email and push sent, for admin visibility and debugging.
- **audit_log** — admin actions: approvals, reassignments, refunds.

Row-level security in Postgres enforces that parents see their own orders, athletes see their claimed jobs and the open pool, and admins see everything.

### 4.5 The parts that need a policy answer before they can be built

- **YouTube link import.** A YouTube page cannot be downloaded through a supported API. Proposal: store the link, embed the player on the athlete's review screen, and let the athlete screen-record from it as they would with a file. No download button for YouTube sources. **Client input C4.**
- **iOS purchases.** Apple's rules allow non-Apple payment for real-time person-to-person services, which covers live mentoring. Asynchronous breakdowns are less clear-cut. Since 2025, apps on the US storefront may link out to web checkout. Proposal: in the iOS app, ordering a breakdown opens Stripe Checkout in the system browser via an external link; mentoring is booked in-app. Android has no such constraint. **Decision D5.**
- **Pricing mechanics.** The mockups show $279 per breakdown and $85 to the athlete. The platform needs: list price per breakdown, athlete payout amount or percentage, mentoring session price and duration, and whether a direct booking through an athlete's link pays that athlete more. **Client input C1.**

---

## 5. What already exists

Done this week and reusable as-is:

- Domain `firstlineperform.com` at GoDaddy with a lean zone, pointed at the droplet. Google Workspace live with admin@ and aliases. Two GoDaddy edits still pending (SPF simplification and the `comms` records).
- DigitalOcean account under admin@, project "First Line Performance Production," droplet `flp-web-01` (Ubuntu 26.04, NYC3, $6), cloud firewall, SSH key `flp_do`, `doctl` context `flp`. Server hardened: non-root login, root SSH off, automatic security updates, nginx, Let's Encrypt with auto-renew.
- Coming-soon page live over HTTPS with the countdown to November 10. Source and logo crop in `FLP/site/`.
- The client's brand mockups and pilot page as design references.

Not yet done, held for your go: git repository, CLAUDE.md with the isolation rule, memory entry.

---

## 6. Third-party accounts: who, when, and the critical path

All created by the client or by you from the FLP Chrome profile with admin@ (or an alias). Scott never holds a credential the client cannot rotate.

| Account | Needed by | Created by | Cost | Notes |
|---|---|---|---|---|
| **Apple Developer Program** (organization) | Week 1 start | Client, with Scott guiding | $99/yr | **Critical path.** Requires a D-U-N-S number for First Line Performance LLC. D-U-N-S can take days to two weeks; Apple's verification adds more. If this starts after week 3, the week-8 submission slips. |
| **Google Play Console** (organization) | Week 1 start | Client | $25 once | Also wants the D-U-N-S number and identity verification. Same urgency. |
| GitHub organization | Week 1 | Scott, as devops@ | Free | Repo private; admin@ read-only until final payment, per the kickoff email |
| Supabase organization | Week 1 | Scott, as admin@ | $25/mo for the production project (Pro: backups, no pausing); dev project free | |
| Stripe | Week 1 (test), week 5 (live activation) | Client owner, Scott as developer | Fees only | Live activation needs the LLC's EIN and bank account. Connect needs platform review. Start early. |
| Mux | Week 2 | Scott, as admin@ | Usage; low tens of dollars per month at launch volume | |
| Daily.co | Week 4 | Scott, as admin@ | Usage; free tier likely covers testing | |
| Resend | Week 3 | Scott, as admin@ | Free tier at launch | |
| Expo (EAS) | Week 7 | Scott, as admin@ | Free tier likely adequate, otherwise $19/mo during the build | |
| Sentry | Week 2 | Scott, as admin@ | Free tier | |
| Second DO droplet (dev) | Week 1 | Scott via doctl | $6/mo | In the FLP Development project |

Running cost at launch, excluding Stripe fees and usage: roughly $60 to $80 a month. This matches what you told the client.

---

## 7. The ten-week plan

Weeks run Monday to Sunday. Each week ends with a Sunday demo to Alex and Bryan of whatever is listed under "Show." Contract milestones are marked. The web launches at the end of week 6; apps are submitted at the end of week 8; weeks 9 and 10 absorb store review and post-launch fixes so the contract's ten-week mark is met with margin.

### Week 1 — Sept 7–13 — Foundations
- Git repo, monorepo layout, CLAUDE.md, CI running lint, typecheck, and tests on every push.
- Supabase dev and prod projects. Schema v1 from section 4.4. Row-level security from the first migration.
- Auth: parent signup and login, athlete application and login, admin role. Magic link plus password.
- Expo app skeleton with the design system extracted from the mockups: colors, type, buttons, cards.
- Dev droplet, nginx, `dev.firstlineperform.com`, API service skeleton deployed to both environments.
- Client: Apple and Google developer enrollments started; Stripe account created; pricing decisions delivered.
- **Show:** sign up as a parent, sign in on phone and laptop, see an empty dashboard in FLP's brand.

### Week 2 — Sept 14–20 — The skeleton, end to end
- Order wizard: position, age group, skill level, focus areas, notes.
- Stripe Checkout in test mode with card and Apple Pay. Webhook marks the order paid.
- Mux direct upload with resume, from phone and desktop. Playback on the order page.
- YouTube link as an alternative source.
- **Show:** a parent places a real test order, pays with a test card, uploads a full-length game, and watches it stream back. This is the week-2 truth test from the August conversation. If it exists on Sunday, the plan holds.

### Week 3 — Sept 21–27 — The athlete side
- Athlete dashboard: open jobs, claim, deadline, in-progress and completed lists.
- Review screen: watch the film, download the clips, read the parent's notes.
- Breakdown delivery: upload the recorded breakdown to Mux, add takeaways and drills, submit.
- Customer viewing page: video, notes, drills, a rating and review.
- First notifications via Resend: order confirmed, job claimed, breakdown delivered.
- Admin v1: approve athletes, see orders and jobs.
- **Show:** the full loop. An order placed by a parent is claimed by an athlete, a breakdown is uploaded, the parent watches it.

### Week 4 — Sept 28–Oct 4 — Profiles, mentoring, payouts. Contract Milestone 1 review.
- Public athlete profiles with slugs and the booking link that preselects the athlete in the wizard.
- Live mentoring: session booking from the parent account, scheduling with reminders, Daily room creation with recording locked on, parent join link, recording saved and visible in admin.
- Stripe Connect Express onboarding for athletes; automatic transfer when a job is closed; earnings dashboard and history.
- Deadline reminders and reassignment when an athlete goes quiet.
- **Show:** an athlete shares a profile link, a parent books through it, a mentoring session runs and its recording appears in admin, and the athlete sees earnings. Milestone 1 formally presented, a week ahead of its window.

### Week 5 — Oct 5–11 — Admin, notifications, marketing site. Contract Milestone 2 on staging.
- Admin panel complete: customers, orders, athletes, reassignment, refunds, quality review of breakdowns and session recordings, audit log.
- Every notification in the flow, email, with templates in FLP's brand.
- Marketing site pages from the client's designs: landing, how it works, pricing, about, athlete application.
- Security pass: RLS audit, rate limits on the API, upload size and type limits, secrets review.
- Client's real content in: copy, pricing, drill library, first real athletes onboarded on staging.
- **Show:** Milestone 2 presented on `dev.firstlineperform.com`. Invoice $4,400 ($4,800 less the $400 prepaid). Feedback due within 3 business days.

### Week 6 — Oct 12–18 — QA and web launch
- Milestone 2 revision round.
- Cross-browser and mobile-browser QA: iOS Safari, Android Chrome, desktop Chrome, Safari, Firefox. Real game-film sizes on cellular.
- Stripe live mode, Connect live, Mux and Daily production keys. Production database seeded with the client's athletes and pricing.
- DNS cutover: marketing site replaces the coming-soon page, `app.firstlineperform.com` goes live.
- **Show:** the product live at `firstlineperform.com`, a real order end to end with a real card, refunded afterward. Warranty clock starts.

### Week 7 — Oct 19–25 — Appify, part one
- EAS project, iOS and Android builds of the same app.
- Push notifications for the events that already send email.
- Native video picker and background-capable upload to Mux.
- Deep links so emails open the app when installed.
- The iOS purchase path per D5.
- App icons, splash, TestFlight and internal Play track to Alex and Bryan.
- **Show:** the app on both of their phones.

### Week 8 — Oct 26–Nov 1 — Appify, part two. Contract Milestone 3.
- On-device QA on real iPhones and Androids, including a live mentoring call phone to phone.
- Store listings: screenshots, descriptions, privacy labels, data safety form, age rating, reviewer demo accounts, review notes explaining the parent-owned model and external checkout.
- Submit to App Store and Google Play.
- **Show:** submission confirmations. Milestone 3 presented: production web live, apps submitted. Invoice $4,800. Equity documentation due within 5 days.

### Weeks 9–10 — Nov 2–11 — Review cycles, fixes, handover
- Respond to any store review feedback within the day.
- Post-launch fixes under warranty.
- Handover package complete (section 8.5). Access transfer rehearsal: Alex logs into every account and rotates a credential while you watch.
- **Show:** apps live in one or both stores, or the exact status of review, and the handover checklist signed off.

### Where the buffer is

The contract allows through week 10 for what this plan finishes in week 8. That two-week margin is the plan's honesty about three things outside our control: the client's 3-day feedback windows, Apple and Google enrollment and review, and Stripe Connect activation. If week 2's demo slips, we know with eight weeks left and we renegotiate scope before schedule.

---

## 8. Ways of working

### 8.1 Repository and code
- One private GitHub repository in the FLP organization, monorepo: `apps/product` (Expo), `apps/marketing` (static), `services/api`, `packages/shared` (types, API client, validation), `supabase/` (migrations, RLS, seed), `docs/`.
- Branches: `dev` is the integration branch and deploys to Development automatically. `main` is production and deploys on a tagged release. Feature branches merge to `dev` by pull request.
- Every pull request runs lint, typecheck, unit tests, and a Supabase migration dry run in CI. Nothing merges red.
- Commit messages follow Conventional Commits so the changelog writes itself.
- CLAUDE.md carries the isolation rule, the environment rule, and the safeguarding rules so every session honors them.

### 8.2 Environments and promotion
- Work happens against Development only. Production is touched by the release script and nothing else.
- Secrets live in each environment's own store (server env files with restricted permissions, EAS secrets, GitHub Actions secrets). No secret is ever in git or in chat.
- A `RUNBOOK.md` documents how to deploy, roll back, restore a database backup, rotate each key, and where every log is.

### 8.3 Rhythm with the client
- **Sunday demo, every week.** Thirty to sixty minutes. Show the week's work on staging, collect feedback in one written list, agree the next week's priorities. This is also where the contract's milestone reviews happen.
- **Feedback in writing within 3 business days**, consolidated, as the contract requires. I will draft the reminder email for you the day after each milestone demo.
- **One channel for decisions.** Decisions get recorded in `docs/DECISIONS.md` with a date and who made them. Verbal agreements get written down the same day.
- **Change control.** Anything not in the thirteen items is written up as an estimate and approved in writing before work starts, per the agreement. The Phase 2 list (telestration studio, storefronts, promo kit, messaging) is the parking lot.

### 8.4 Quality
- **Definition of done** for every feature: works on a phone browser and a desktop browser, RLS proves the wrong user cannot see it, has at least one automated test for the business rule, has its notification if the flow calls for one, and is demoed.
- **Automated tests:** unit tests for the job state machine, pricing and payout math, and RLS policies; end-to-end tests of the three critical flows (order and pay, claim and deliver, book and record a session) run against Development before every release.
- **Manual QA matrix** in week 6 and week 8, kept in `docs/QA.md`, with a row per device and browser.
- **Security practices, stated plainly:** least-privilege database access enforced by RLS; every API route authenticated and rate-limited; uploads restricted by type and size and only ever to Mux; dependency audit in CI; backups verified by an actual restore in week 5; no admin action without an audit row.

### 8.5 Documentation and the handover package
Written as we go, not at the end. Lives in `docs/` and hands over with the repo.
- `README.md` — what the system is and how to run it locally.
- `ARCHITECTURE.md` — this document's sections 4 through 6, kept current.
- `RUNBOOK.md` — operations: deploy, roll back, restore, rotate, monitor.
- `ACCOUNTS.md` — every third-party account, its purpose, its owner login (admin@ or alias), where the credential lives. No secrets in the file.
- `DECISIONS.md` — dated decisions and why.
- `QA.md` — the test matrix and results per release.
- `HANDOVER.md` — the checklist for the day FLP takes the keys: rotate every credential, remove Scott from every account, confirm billing on the client's card, confirm the equity documents are signed.
- The DNS zone file and the infrastructure notes from this week.

### 8.6 The communications deck
Your kickoff email promised a project "looking glass" at a `build.` subdomain, gratis. The minimal version that keeps that promise without stealing build time: a private page at `comms.firstlineperform.com` showing the current week's goals, what shipped, what is waiting on the client, links to staging and to the decisions log, and the next demo time. Updated each Sunday. If you want more than that, it is Phase 2 for our own tooling, not the client's product. **Decision D8.**

---

## 9. Risks and what the plan does about them

| Risk | Impact | Mitigation in this plan |
|---|---|---|
| Apple or Google enrollment takes weeks | Apps cannot be submitted in week 8 | Enrollment is a week-1 client task with the D-U-N-S dependency called out. Web launch is unaffected either way. |
| Client feedback or content is late | Every week of delay pushes launch | Contract clause, Sunday cadence, and a written ask list every week so nothing is a surprise |
| Stripe Connect activation or platform review stalls | Athletes cannot be paid at launch | Start in week 1 in test mode; request live activation in week 4, two weeks before it is needed |
| Apple rejects the app on payment or minimum-functionality grounds | Store launch slips past week 10 | Decision D5 chosen before the app is built; push, deep links, and native upload make the app materially more than a web wrapper; the contract already says store approval is not a condition |
| Multi-gigabyte uploads fail on mobile networks | The core product feels broken | Mux resumable uploads, tested with real game film in week 2 and again on cellular in week 6 |
| Live calls fail on some devices | Mentoring unusable for some users | Daily's prebuilt UI handles device quirks; phone-to-phone test in week 8; clear fallback message to rebook |
| Your calendar | The 35 to 40 hours a week this needs | Not the plan's to fix, but the week-2 demo is the early warning |
| Supply side: too few athletes to test with | Milestone 2 review is thin | Client owns recruitment; the plan asks for the first real athletes on staging in week 5 |

---

## 10. Decisions I need from you

Answer by number. My recommendation is stated in each.

- **D1. Codebase strategy.** Option A, one Expo app for web and native. (Recommended.) Or Option B, Next.js plus Capacitor.
- **D2. Video provider.** Mux. (Recommended.) Or Cloudflare Stream.
- **D3. Call provider.** Daily.co. (Recommended.) Or LiveKit.
- **D4. Email provider.** Resend. (Recommended.) Or Postmark.
- **D5. iOS purchase path.** External link to web checkout for breakdowns, in-app booking for mentoring. (Recommended.) Or in-app purchase for everything on iOS, which changes pricing and margins.
- **D6. Admin panel placement.** Inside the product app's web build under an admin role. (Recommended.) Or a separate small web app.
- **D7. Marketing site.** Static site on the droplet, grown from the coming-soon page. (Recommended.) Or built inside the Expo web app.
- **D8. Communications deck.** The minimal weekly status page at `comms.firstlineperform.com`. (Recommended.) Or defer entirely.
- **D9. Week-1 start.** Confirm September 7 as week 1 and November 11 as the contract mark, or tell me the Effective Date if it is later.
- **D10. The three held items.** Git init, CLAUDE.md, and the memory entry are the first act of week 1. Say go.

## 11. Inputs I need from the client, through you

- **C1. Pricing.** Breakdown list price, athlete payout per breakdown, mentoring session price and length, athlete payout per session, and whether direct bookings through an athlete's link pay differently.
- **C2. Developer enrollments.** Apple Developer Program and Google Play Console as an organization, which starts with a D-U-N-S number for First Line Performance LLC. This week.
- **C3. Stripe.** An account owned by the LLC with EIN and bank details, with Scott added as a developer.
- **C4. YouTube sources.** Confirm the embed-and-screen-record approach for YouTube links, since download is not possible.
- **C5. Content.** Site copy for the four marketing pages, the drill library, athlete application questions, the pilot signup list, and the first athletes to onboard on staging by week 5.
- **C6. Legal.** Terms of service, privacy policy, athlete agreement, and the safeguarding policy for sessions. These are the client's under the agreement; the app links to them and cannot launch without them.
- **C7. Equity paperwork.** Draft started now so it is signable within 5 days of Milestone 3.

---

## 12. Open questions I could not answer from the material

- Whether Bryan Hogan has a role in the product beyond admin (co-founder, mentor, both).
- Whether the pilot signups on the Netlify page should be migrated into the new system as leads.
- Whether athletes set their own availability for mentoring or FLP schedules on their behalf.
- What happens to an order when no athlete claims it within a set time: automatic reassignment, admin alert, or refund. The plan assumes admin alert plus manual reassignment for V1.

---

*End of spec. Nothing here has been built.*
