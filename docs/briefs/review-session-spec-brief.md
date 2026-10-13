# Brief: build the FLP update spec from the review session recording

You are working in the First Line Performance (FLP) platform repository, `Firstlineperformancellc/platform`, on the `dev` branch. Your job in this session is to **evaluate a recorded review session and turn everything in it into a detailed, buildable scope and outline** that Scott (the lead developer) and his local Claude Code session will build from. You produce a document. You do not change code, deploy anything, or touch any live system.

## 1. What FLP is

First Line Performance LLC (d/b/a FLP) is a youth-hockey marketplace. Parents buy video breakdowns and live "Film Room" mentoring sessions from vetted mentors (current and former NCAA and professional players). The platform takes payment, routes work to mentors, delivers the result, and pays the mentor.

People:
- **Scott Maslowe**, Magnum Appus: lead developer and equity partner. Builds everything. He is one of the two voices on the recording.
- **Bryan Hogan**, FLP owner: the other voice on the recording. He speaks for the client.
- **Alex Leve**, FLP founder and owner: not on the recording, but may be referred to; he makes pricing and business decisions.

The contract: $16,000 fixed plus 5% equity, ten weeks from 2026-09-07, contract mark 2026-11-11, three milestones. Scope is thirteen items (below). Anything outside them is a change order, written up and approved before work starts. Internal estimates in hours are never shared with the client; size work as S / M / L only.

## 2. Read these first, in this order

They are in the repo and are the truth about what exists today. Do not guess at current behavior; cite these.

1. `CLAUDE.md` at the repo root: the standing rules, architecture, layout, infrastructure.
2. `docs/PROJECT_SPEC.md`: the original plan, the thirteen scope items, milestones, decisions needed.
3. `docs/DECISIONS.md`: every product decision since, dated. Authoritative where it conflicts with the spec.
4. `docs/manual/mentor-manual.html` and `docs/manual/admin-manual.html`: the two user manuals, written on 2026-10-13 from the live screens. They are the most accurate inventory of what the product does right now, with the real button and screen names. Use their vocabulary.
5. `docs/STRIPE_SETUP.md` and `docs/MENTORING_PROPOSAL.md` if payments or Film Room come up.
6. The code, when you need to confirm a detail: `apps/product/src/app` (screens, Expo Router), `services/api/src/routes` (API), `supabase/migrations` (schema and row security).

### The thirteen contract scope items

| # | Item | Notes |
|---|---|---|
| 01 | Marketing website | Landing, How It Works, Pricing, About, from FLP's designs |
| 02 | Accounts and authentication | Parent-owned customer accounts; athlete accounts subject to FLP approval |
| 03 | Customer order flow | Guided wizard plus secure checkout: card and Apple Pay |
| 04 | Video upload and streaming | Large-file upload with resume, YouTube link import, smooth playback |
| 05 | Athlete job board and dashboard | Available jobs, claim flow, deadlines, in-progress and completed tracking |
| 06 | Breakdown delivery | Athlete reviews film, uploads recorded breakdown, attaches takeaways and drills; customer gets a viewing page |
| 07 | Athlete profiles and booking links | Public profile with photo, bio, credentials, specialties, reviews, direct booking link |
| 08 | Live mentoring sessions | Booking, scheduling, reminders, in-platform calls; every session recorded; booked through the parent account, which may join |
| 09 | Earnings and payouts | Automated athlete payouts with guided onboarding, earnings dashboard, per-job history |
| 10 | Admin panel | Orders, customers, athletes, job reassignment, refunds, quality review, athlete approval |
| 11 | Notifications | Automated email at every step |
| 12 | Native iOS and Android apps | Customer and athlete apps with push, submitted to both stores at launch |
| 13 | QA and launch | Cross-browser, mobile, on-device testing, production deployment, launch support |

Explicitly out of V1: in-platform telestration or recording studio, Hudl import, athlete storefronts and promo kits, direct messaging between users. These are the Phase 2 parking lot.

### What is live in production as of 2026-10-13 (release v2026.10.13-7)

- Web app at app.firstlineperform.com (Expo, laptop-first, phone second). Native apps not yet built.
- Parents: sign-up, youth athlete profiles, Development Log, marketplace with level filter and grouping, order wizard with Stripe Checkout (live keys are in; Payments mode is Stripe), film upload or YouTube link, breakdown viewing page with worksheet PDF, ratings with a 3-star gate, Quality Control Audit within 7 days, Film Room booking (30/60 min, add-on, Season Arc), contact details, support tickets.
- Mentors: application with Elite Prospects link, motivations, age, gender, special circumstances, and a signed Independent Contractor Agreement; email confirmation; approval with a level; profile (photo, intro video, bio, levels, badges, specialties, capacity, Film Room weekly windows); requests with 48-hour acceptance and 24-hour nudge; job page with film, breakdown upload, Player Development Worksheet, delivery; turnaround clock (72 h default, per level) with reminders; Film Room confirm/join/finish/no-show/recap, recording locked on; Stripe Express onboarding; Earnings page; the Mentor FLP Service User Manual on the dashboard.
- Admins: Control center with counts and a health badge; Users (search, filters, activity timeline, contact, suspend, delete); Mentors (approve with tier, verify, suspend, deactivate, tier change with confirmation and history, delete with restorable record); Levels & tiles (levels with prices, share, visibility, direct link, turnaround, capacity, colour; tile display; per-mentor level, listed, featured, custom prices); Orders & jobs (assign, extend, refund); Film Room (cancel + refund, no-shows, complete, recordings); Audits (notes, close with outcome) and review moderation; Ledger (pay via Stripe, mark paid, hold, release; manual or automatic payout mode); Support desk (email, in-app, website; canned replies; internal notes; assignment); Settings (payments mode, payout mode, every rule, lists, admin seats); Service health (hourly probes, email on change); the Admin User Manual tab.
- Emails: Resend, from no-reply@mail.firstlineperform.com and support@firstlineperform.com; the team is emailed on every new mentor application.
- Marketing site: the coming-soon page is live at firstlineperform.com; the full site is in beta at beta.firstlineperform.com with pricing read from the levels table.

## 3. The inputs

- **The recording:** a three-hour video of Scott and Bryan reviewing the platform and talking through what needs to be built and changed. Scott will tell you where it is.
- **The AI transcript** of the recording, with timestamps.
- **The AI summary** of the recording.

How to use them:
- The **transcript is the source**. Read it end to end before writing anything. Do not skim.
- The **summary is a checklist**, not a source. After you have your own list from the transcript, compare it against the summary and account for every item in it: either it is in your list, or you note that the transcript doesn't support it.
- The **video is optional** and expensive to look at. If it is available and `ffmpeg` is installed, extract a still frame only at moments where the transcript shows someone referring to the screen ("this page", "right here", "see this"), and only when the frame would change what you write. A dozen frames across three hours is normal; one a minute is not.
- Mark anything inaudible or ambiguous as such. Never fill a gap with a guess.
- Attribute by voice and context: Scott is the developer explaining how things work; Bryan is the client asking for things. When a request is Bryan's, say so; when it's Scott's proposal that Bryan agreed to, say that.

## 4. The deliverable

Write one file: `docs/UPDATE_SPEC_<YYYY-MM-DD>.md`, dated the day of the review session. Plain language, short sentences, no filler. It is for Scott and his build session, so it can be technical, but every item must also be understandable by Bryan and Alex, because the change-order section will be shown to them.

### Required structure

**A. Summary.** What the session was, who was on it, the five to ten headline outcomes.

**B. Decisions made.** Anything Bryan and Scott actually settled, as a numbered list with the timestamp. These bind the build.

**C. Requested changes.** The heart of the document. One entry per change, numbered `U-01`, `U-02`, … in the order they were raised, and grouped under these headings: Marketing site · Accounts and sign-up · Parent experience and order flow · Mentor experience · Breakdown delivery and worksheet · Film Room · Admin panel · Payments and payouts · Notifications and email · Native apps · Content, copy and design · Operations and support. Each entry has exactly these fields:

- **Title.** Imperative, specific.
- **Asked by / when.** Who, and the transcript timestamp(s). Quote the key sentence when the wording matters.
- **Today.** What the platform does now, citing the manual section or the screen name. "Does not exist" is a valid answer.
- **Change.** The new behavior, concretely: what the user sees, what changes in data, what the API must do, what email goes out. If the request is ambiguous, write the most likely reading and flag it.
- **Acceptance.** Two to six checkable statements that would prove it is done.
- **Scope.** One of: `In contract (item NN)`, `Change order`, `Phase 2`, `Undecided`. Reason in one line.
- **Priority.** Bryan's words if he gave them (must have, soon, nice to have, someday), otherwise your read, labelled as such.
- **Size.** S (under a day), M (one to three days), L (a week or more). Never hours.
- **Touches.** The areas of the code: screens, API routes, tables, emails, site pages. Reuse what exists; name it.
- **Depends on / blocks.** Other U-numbers, external inputs (Alex's pricing, a Stripe step, store accounts), or nothing.
- **Open questions.** Anything that must be answered before building.

**D. Updates to existing features vs new features.** Two short lists of U-numbers, so the build plan can interleave fixes with builds.

**E. Questions for Bryan and Alex.** Everything you could not resolve from the recording, grouped by who can answer it.

**F. Questions for Scott.** Technical or sequencing questions only he can answer.

**G. Proposed build order.** Group the U-numbers into three to six releases with a one-line rationale each. Respect the contract clock (week 6 of 10 as of 2026-10-13; web launch planned end of week 6; apps submitted end of week 8; contract mark 2026-11-11) and dependencies. Put must-haves that unblock launch first, change orders after approval, Phase 2 last. Do not estimate dates; sequence only.

**H. Change orders for the client.** For every `Change order` item, a plain-language paragraph Scott can paste into a note to Alex and Bryan: what it is, why it is outside the thirteen items, and its size as S / M / L. No internal reasoning, no hours.

**I. Appendix.** A timestamp index of the whole session (every five to ten minutes, one line on what was being discussed); items that were raised and then dropped or withdrawn, with why; and anything inaudible.

## 5. Rules for this session

- **Spec only.** Do not write application code, run migrations, deploy, or touch production, DNS, or any client-facing page. Reading the code is fine and expected.
- **Do not propose a rewrite.** Everything maps onto what exists. If a request contradicts a recorded decision in `docs/DECISIONS.md`, say so in the entry rather than silently overriding it.
- **The product's non-negotiables stand** unless Bryan explicitly reopened one on the recording: parent-owned accounts, no direct messaging between athletes and players, every session recorded with no off-the-record option, money never held outside Stripe, two environments with production moved only by the release script.
- **Isolation.** FLP uses only FLP-owned accounts and services. Never suggest reusing anything from another project.
- **No multi-agent fan-outs or parallel sub-agents.** Read and write as one session.
- **No secrets.** Nothing from `.env` files, no keys, no tokens, in the document or in chat.
- **Commit the document** on a branch named `spec/review-<YYYY-MM-DD>` with a Conventional Commit message (`docs(spec): update spec from the <date> review session`). Do not merge it; Scott will.
- **When done,** reply with: the number of U-items by scope class, the top five must-haves, the open questions that block the most work, and the path to the file.

## 6. How this document will be used

Scott will read it, answer section F, get Bryan and Alex's answers to section E, and then hand the file to his local Claude Code session, which builds on the `dev` branch and releases to production on his word. Every U-entry should be written so that a developer who was not on the recording could build it from the entry alone, and so that Bryan could read the title, the change, and the acceptance criteria and say "yes, that's what I meant."
