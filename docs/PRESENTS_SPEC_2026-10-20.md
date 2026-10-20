# Personal video messages from FLP athletes: planning spec

**Status:** Approved by Scott on 2026-10-20 with the name **First Line Presents**; built the same day (migration 0033, `services/api/src/presents.ts`, `routes/presents.ts`, app routes under `/presents`, `site/www/presents.html`). Two changes from the plan below: the public buys without an account (email plus a private link) instead of a fan account, and the first release keeps payouts on the existing ledger timing rather than a separate hold.
**Written:** 2026-10-20 for Scott, from his brief: study Cameo, specify the same kind of service inside FLP, let mentors opt in, let athletes sign up for this service alone, show it on the site as a real but clearly secondary service, and propose names that are not "Cameo".
**Baseline:** production v2026.10.18-3, the code in this repository, `docs/DECISIONS.md`, and item U-31 of the 2026-09-27 review spec (`spec/review-2026-09-27` branch). This document supersedes U-31.
**Name:** First Line Presents (Scott, 2026-10-20). In code: `presents_requests`, `presents_providers`, `athletes.presents_*`.

---

## 1. Summary

A family or a fan picks an FLP athlete, says who the video is for and what it's for (a birthday, a big game, a comeback from injury), and pays the athlete's price through Stripe. The athlete records a short video on their phone and uploads it. FLP checks every video meant for a player under 18 before it goes out. The buyer gets it in their account and by email, and the athlete is paid through the same ledger and Stripe transfers as breakdowns and Film Rooms.

Recommendations in one place:

1. **Name:** First Line Presents ("Get a First Line Presents video from an FLP athlete"), with FLP Shout-Outs as the low-risk fallback. Run a proper trademark search before anything public. Cameo's owner is actively enforcing its mark (section 2).
2. **One athlete account, two services.** Mentors switch First Line Presents on from My profile. Athletes who only want to do First Line Presents apply through the same application with "Personal video messages" ticked and "Mentoring" unticked. They go through the same FLP approval, the same agreement (with a video addendum) and the same Stripe payout setup. No new kind of athlete account.
3. **Buyers:** parents, plus a new adult-only **fan** account that can buy First Line Presents and nothing else. This needs one contract rule reworded (section 5.4).
4. **Safety first, in code:** requests are one-way (no replies, no contact details pass either way), contact details are stripped from requests, videos for under-18 recipients are reviewed by FLP before delivery, and those videos go to the adult who bought them, never to a child.
5. **Secondary by design:** never in a hero or above mentoring, quieter visual treatment, its own pages and one band on the home page (section 7).
6. **Size:** about two working weeks for the first release. That collides with the contract clock (web launch, app submission end of week 8, contract mark 2026-11-11), so section 15 proposes order and timing.
7. **Scope:** a change order (outside the thirteen contract items), which you offered at no charge on the 2026-09-27 call. It should be written up and approved before work starts, per CLAUDE.md.

---

## 2. What Cameo is, and the name problem

**The product.** Cameo is a marketplace where fans pay a public figure to record a short personalised video. Each talent sets their own price, which Cameo's own pages and the press put anywhere from a few dollars to thousands. The buyer fills in who the video is for, the occasion and instructions, and pays at booking. The talent generally has up to seven days to record it or decline, with a paid 24-hour option on some profiles. A request that isn't fulfilled is refunded (or credited, on iOS). Completed videos aren't refundable, and talent has discretion over exactly what they say. Cameo has reported the same split for all talent, 75% to the talent and 25% to Cameo, though that figure comes from 2019 press and should be checked against current terms. Around the core product Cameo added a business version (videos licensed for brand use at much higher prices), live video calls, short paid direct messages, tips and gift cards. ([Cameo refunds page](https://www.cameo.com/refunds); [Business Insider](https://www.businessinsider.nl/what-is-cameo/); [Hypebot on the 75/25 split](https://www.hypebot.com/cameo-adds-50m-to-deliver-personalized-video-messages-from-musicians-celebrities-and-you/); [Sacra on Cameo for Business](https://sacra.com/chat/h/453f0909-cc08-4b2e-8bbb-6637661c73db/); [Reviewed.com](https://reviewed.com/lifestyle/content/review-is-cameo-worth-the-money))

**What FLP should copy:** the request form, the athlete-set price, the seven-day window, automatic refund when nothing is delivered, no refunds after delivery except for a real problem, and delivery as a private link.

**What FLP should not copy, at least at first:** paid direct messages (they would break FLP's no-direct-messaging rule), live calls (Film Room already covers live time, with recording and parent access), and a business tier (needs commercial licence terms first; Phase 2).

**The name.** "Cameo" is a registered trademark of Baron App, Inc., and the company enforces it. It sued OpenAI in October 2025 over the "Cameo" feature in Sora, won a temporary restraining order and then a preliminary injunction, and OpenAI has appealed. ([TrademarkElite record](https://www.trademarkelite.com/trademark/trademark-detail/87444650/CAMEO); [Yahoo News on the injunction](https://www.yahoo.com/news/articles/judge-temporarily-blocks-openai-using-021520979.html); [Bloomberg Law on the appeal](https://news.bloomberglaw.com/ip-law/openai-taking-trademark-suit-cameo-label-ban-to-ninth-circuit)) FLP should not use "Cameo" anywhere: not as a product name, not as "cameo-style" in public copy, and not in page titles or search metadata.

### Name options

A quick web search for each name below found no conflict for its use as a video product, except Celly. That is a knockout check only, not clearance. Before any name goes public: a USPTO search (classes 9, 35, 38, 41), app-store and domain checks, and a look by FLP's counsel (Howard).

| Name | What it says | Fit | Notes |
|---|---|---|---|
| **First Line Presents video** (recommended) | Hockey players tap their sticks to say "nice play" or to show respect. | Hockey-native, warm, earns a smile from any hockey family. Works as a noun and a verb: "Send a First Line Presents video." | No product conflict found. "Stick" is a word one UK games company has fought over in app stores, but for cricket games, not video. ([Pocket Gamer](https://www.pocketgamer.biz/stick-sports-lawyers-sheridans-explains-app-store-stick-trademark-infringements/); [Emojipedia on the gesture](https://emojipedia.org/de/eishockey)) |
| **Glove Tap** | The glove bump after a goal. | Same warmth as First Line Presents video, slightly less known. | Nothing found. |
| **Celly** | Hockey slang for a goal celebration. | Fun for birthdays and wins; less fitting for a get-well message. | Higher risk: Celly Inc. holds a CELLY registration for messaging services. ([Justia](https://trademark.justia.com/owners/celly-inc-2179735)) |
| **Tape-to-Tape** | A perfect pass, stick to stick: "a message passed straight to you." | Clever for hockey insiders; non-hockey fans may not get it. | Hockey-tape brands exist; none found using the exact phrase. |
| **The Assist** | A little help from someone who's been there. | Sports-wide, ties to mentoring. | "Assist" is a common word in many marks; expect a crowded search. |
| **Pregame** | A message before the big game. | Strong for tournaments, weak for birthdays. | Common word; crowded. |
| **FLP Shout-Outs** (safe fallback) | Exactly what it is. | Plain and instantly clear; leans on the FLP brand. | Descriptive, so hard to own on its own, but low conflict risk because the FLP name carries it. |
| **First Line Messages** | Brand-led and neutral. | Clear, dignified, a bit flat. | Low risk. |
| **Video Notes** / **Personal Notes** | Non-sports, gift-like. | Clear for gifting; loses the hockey voice. | Generic; low risk, not ownable. |

Recommendation: **First Line Presents**, presented as "First Line Presents: personal video messages from FLP athletes" so the meaning is clear to anyone who doesn't know the gesture. Fallback: **FLP Shout-Outs**.

---

## 3. How it fits FLP

These rules shape every section below.

1. **Mentoring comes first.** First Line Presents is an extra. It never appears in a hero, never above mentoring content, never in gold call-to-action styling next to "Order a breakdown" or "Book a Film Room", and the copy always ties back to the athlete's journey ("celebrate the work").
2. **The contract's safety rules still hold.**
   - Accounts are adult-owned. No child ever has a login, and a video for a child is delivered to the adult who bought it.
   - There is no direct messaging. A request is one-way text to the athlete, screened for contact details. The athlete answers only with the video, and neither side sees the other's email, phone or social handles.
   - Money is never held by FLP: Stripe Checkout takes the payment and a Stripe Connect transfer pays the athlete.
3. **Everyone on the supply side is approved by FLP.** Video-only athletes go through the same review Alex and Bryan give mentors.
4. **Reuse before building.** Mux uploads and signed playback, Stripe Checkout and transfers, the ledger and payout modes, the webhook dedupe, notifications, the support desk, the audit log and admin settings already exist. First Line Presents should be mostly new screens and one new table on top of them.

---

## 4. Who can do what

| Account | Today | With First Line Presents |
|---|---|---|
| **Mentor** (athlete account, mentoring on) | Breakdowns, Film Rooms, profile, earnings | Can switch First Line Presents on, set price and delivery days, receive and fulfil requests. Paid on the same ledger. |
| **Video-only athlete** (new: athlete account, mentoring off) | n/a | Applies with "Personal video messages" only. After approval, sets up Stripe payouts and offers First Line Presents. Not in the mentor marketplace, never offered breakdown jobs or Film Room bookings. Can add mentoring later by completing the mentoring part of the application for FLP to approve. |
| **Parent** | Youth athletes, orders, Film Rooms | Can also buy First Line Presents, for their own youth athlete or anyone else. |
| **Fan** (new: adult account) | n/a | Can buy First Line Presents and see their own purchases. Cannot add youth athletes, order breakdowns or book Film Rooms. If they later add a youth athlete, the account becomes a parent account. |
| **Admin** | Everything | Approves video-only athletes, sees all requests, checks videos for under-18 recipients, refunds, sets the rules. |

**Age rules:** athletes offering First Line Presents must be 18 or older. Some junior players are 16 or 17, and they should not take paid requests from strangers. Fans must be 18 or older, attested at sign-up.

**One role per account.** A person who is both a parent and a mentor still needs two accounts with two emails, as today. Mixing roles in one login is a separate, larger change and isn't proposed here.

---

## 5. The experience, step by step

### 5.1 A mentor turns it on

My profile gets a **First Line Presents** card:

- **Offer First Line Presents** (on/off).
- **Price:** any whole-dollar amount between the admin floor and ceiling (defaults $20 to $500). The card shows "You receive $X" at the current share.
- **Delivery time:** 3, 5 or 7 days; never more than the admin maximum.
- **Open request limit**, default 10. At the limit the profile reads "Not taking requests right now".
- **Pause until** a date, for vacations, tournaments or the season.
- **Occasions I'll do**, ticked from the admin list (birthday, good luck, congratulations, get well, pep talk, thank a coach, team shout-out, other).
- **About my First Line Presents:** one or two sentences, e.g. "I'll bring the energy for birthdays and big games."
- **Sample video:** the intro video by default; optionally one short sample made for this.

Switching it on is instant for an approved mentor. Admin can switch any athlete's First Line Presents off.

### 5.2 A video-only athlete signs up

1. Welcome page: "I'm an athlete" (unchanged), then the first question of the application: **What would you like to offer?** with "Mentoring youth athletes" and/or "Personal video messages".
2. With only video messages ticked, the form drops the mentoring questions (positions, workload, Film Room hours, mentoring motivation). It keeps name, photo, highest level played and Elite Prospects link, short bio, age (18+), and special circumstances.
3. The agreement step shows the Independent Contractor Agreement with a **Video Messages Addendum** (section 14).
4. Thank-you page, FLP review, approval email, then Stripe payout setup, as for mentors today.
5. Their public page is a slimmer profile with photo, name, level and league, bio, career block and the First Line Presents video card. It has no Order or Book buttons.

### 5.3 A parent or fan requests one

1. They find the athlete from the First Line Presents page, from a mentor's profile ("Also offers First Line Presents"), or from the small card on the parent dashboard.
2. **Request form:**
   - Who it's for: "Me" or "Someone else".
   - Recipient's first name only, plus pronunciation help (optional).
   - Is the recipient under 18? (Required; this decides the review step.)
   - Occasion, from the athlete's ticked list.
   - From (the name to say it's from).
   - What to say, up to 500 characters, with plain guidance on what to include and what not to.
   - Optional team name, e.g. "the Little Caesars U12s".
   - It never asks for last names, schools, addresses or contact details.
3. Live screening of the text: phone numbers, emails, URLs and social handles are refused on the spot ("Leave out contact details; the athlete only records a video"). A word list flags anything inappropriate for FLP to look at before the athlete sees it.
4. Price and delivery date shown, then **Stripe Checkout**. A fan without an account creates one at this step (email and password or emailed link, 18+ checkbox).
5. Confirmation: "Jordan has until Friday, October 30. If they can't do it, you're refunded automatically."

### 5.4 The fan account and a contract rule

CLAUDE.md and the agreement say "Customer accounts are parent-owned." A fan account is a customer that is not a parent. The rule's purpose holds, since fans are adults and no child gets a login, but the wording has to change before this is built. Suggested wording: *"Customer accounts are owned by adults: parents, and fans who may only buy First Line Presents. A player is a profile under a parent, never a login."*

Two alternatives if you'd rather not:
- **Parents only.** Simplest, but it shuts out grandparents, coaches and the wider fan market Alex described.
- **Guest checkout** (email only, no account). Fewer sign-ups, but delivery, re-watching, refunds and support all get harder, and the private link becomes the only protection on the video.

### 5.5 The athlete records it

1. **New request:** email to the athlete, and a **First Line Presents** section on their dashboard listing the recipient's first name, occasion, from, instructions, team, due date and what they'll earn. They never see the buyer's name, email or phone. The instructions show only after screening.
2. **Record or decline.** No accept step: like Cameo, the request is open until the athlete delivers or declines.
   - **Decline** takes a reason (not a fit, not comfortable, can't make the deadline). The buyer gets a full refund automatically, and the reason isn't shown to the buyer.
3. **Upload** from the phone through the existing Mux uploader (pause/resume already works). The video must be between 10 seconds and 3 minutes; Mux reports the length, and anything outside the range is refused with a plain message.
4. The athlete watches it back, then presses **Send**. Videos for adults go straight out; videos for under-18 recipients go to FLP review (5.6).
5. **Reminders** 48 and 24 hours before the deadline. If the deadline passes, the request expires, the buyer is refunded in full, and it counts on the athlete's scorecard.

### 5.6 FLP reviews videos for under-18 recipients

- A **Videos to check** queue in admin, with a count on the Control center. The target is a decision within 24 hours, and review time does not count against the athlete.
- **Approve** delivers the video.
- **Reject** gives a reason. The athlete can re-record once before the original deadline plus 48 hours. Otherwise the request is refunded and the athlete gets a strike.
- The admin setting can widen review to every video or narrow it to none. The default is under-18 only.

### 5.7 Delivery

- Email to the buyer ("Your First Line Presents video from Jordan is ready") and a **My videos** page in the app with signed Mux playback and a **Download** button (MP4).
- **Share link:** a private, unguessable link the buyer can send to the recipient's family. The buyer can turn it off. It never shows the athlete's contact details.
- **Rating:** 1 to 5 stars, using the same threshold rule as breakdown reviews. No free-text thank-you note at first, so nothing flows back to the athlete as a message.
- **Keeping videos:** downloadable for 12 months, then removed from Mux, with a reminder email 30 days before. This is a decision (section 16), since storage is a running cost.

### 5.8 Problems, refunds and disputes

- Declined or expired requests are refunded automatically and in full.
- After delivery, a buyer can use **Report a problem** within 7 days (wrong name, a missing instruction that mattered, poor sound or picture). Admin can refund in part or in full. Like Cameo, a video that simply wasn't to taste isn't refundable.
- Payouts wait for that 7-day window, then follow the existing Manual, Automatic or Scheduled payout setting.
- Card disputes already put the payout on hold through the existing Stripe webhook; First Line Presents join that path.

---

## 6. Rules and settings (admin-editable, with proposed defaults)

| Setting | Default |
|---|---|
| First Line Presents on for the site | Off until launch |
| Price floor / ceiling | $20 / $500 |
| FLP share | 30% (from the 2026-09-27 call; Cameo is reported at 25%) |
| Maximum delivery days | 7 |
| Open request limit per athlete | 10 |
| Video length | 10 seconds to 3 minutes |
| FLP review before delivery | Under-18 recipients |
| Review target | 24 hours |
| Report-a-problem window | 7 days |
| Video kept for download | 12 months |
| Occasions list | Birthday, Good luck, Congratulations, Get well, Pep talk, Thank a coach, Team shout-out, Other |
| Request word list | FLP-maintained list; matches go to admin before the athlete sees them |

---

## 7. Where it shows up

The aim is fully present, clearly secondary.

### Marketing site (beta now, firstlineperform.com at launch)

- **Its own page** (e.g. `presents.html`): what it is, how it works in three steps, sample videos (athletes' own samples, never customer videos at first), price range, the under-18 review promise, an FAQ, and a "Browse athletes" button into the app.
- **Navigation:** last item in the top nav, before Sign in, in the normal link style (no gold, no button). Also in the footer under Product. Alex may prefer footer-only; that's his call.
- **Home page:** one band near the bottom, after the mentoring sections and testimonials. A short headline, one line of copy and an outline-style button. Example: *"A First Line Presents video from an FLP athlete. Personal video messages for birthdays, big games and comebacks."*
- **Pricing page:** a small note at the end: "First Line Presents are priced by each athlete, from $20."
- **FAQ:** a short First Line Presents section.

### In the app

- **First Line Presents page** (`/presents`), a directory of athletes who offer it. Tiles show photo, name, level and league, price, delivery days and rating; filter by price and delivery time; sort by soonest delivery or rating.
- **Mentor profile:** a secondary card below the mentoring cards: "Also from Jordan: a personal First Line Presents video, $40, within 5 days" with a **Request a First Line Presents video** button in secondary style. This is the "tell their youth clients they're available" piece.
- **Mentor marketplace tiles:** a small icon badge ("First Line Presents") that admin can switch off under Mentor tiles. No price on the tile, so the mentoring price stays the headline.
- **Parent dashboard:** one slim card under the mentoring products: "Celebrate a moment: a First Line Presents video from an FLP athlete."
- **No pop-ups or upsells inside the mentoring flow.** The order wizard and Film Room booking never mention First Line Presents.

### Visual rules

- Secondary buttons (outline or white) for every First Line Presents action; gold stays reserved for mentoring actions.
- A small, quiet mark (a stick-tap icon) rather than a new colour family.
- Copy is warm and short, never celebrity language: "FLP athletes", not "stars" or "celebs".

---

## 8. Safety and trust

| Risk | Control |
|---|---|
| Off-platform contact through the request text | Contact details refused at entry; word-list flags held for admin; buyer and athlete identities hidden from each other. |
| Inappropriate requests | Athlete can decline for any reason; flagged requests reviewed by FLP first; prohibited-content list in the terms. |
| Inappropriate video for a child | FLP reviews every under-18 video before delivery; reject and refund path; strike on the athlete. |
| A child's personal data | First name and optional team only; no last names, schools, ages beyond "under 18", addresses or photos of the child. |
| Under-age providers | 18+ required to offer First Line Presents. |
| Unvetted athletes | Video-only athletes go through FLP approval and Stripe identity checks. |
| Impersonation | Only approved FLP athletes can offer it; the public page links to their Elite Prospects profile where set. |
| Team logos and jerseys in videos | The addendum makes the athlete responsible for having permission; FLP can remove a video (ties to U-35/U-36). |

---

## 9. Money

- **Price:** set by the athlete within the admin bounds and fixed at the moment of purchase. Later price changes don't affect open requests.
- **Payment:** Stripe Checkout, charged at purchase, same pattern as Film Rooms (charge now, refund automatically if not delivered). A card hold isn't recommended: holds generally lapse after about seven days, which is the delivery window itself.
- **Split:** athlete share = price × (1 − FLP share), recorded on the request at purchase. Stripe's processing fee comes out of FLP's share, as for the other products today. That should be confirmed with the accountant.
- **Payout:** a payout row on delivery. Transfers use the existing source-charge and idempotency pattern. The row is released after the 7-day problem window under the existing Manual, Automatic or Scheduled setting.
- **Taxes:**
  - Some states tax personalised digital content as a digital good. That is a question for FLP's accountant before launch; Stripe Tax could calculate it if needed.
  - Athletes receive Stripe's tax forms through Express, as mentors do.
  - NCAA athletes earning from this are doing NIL activity and must follow their school's disclosure rules. The sign-up says so; FLP doesn't police it.
- **Cross-border risk (applies to mentors too):** payout accounts are created as US accounts today. Canadian athletes (CHL, U Sports, PWHL) may not be able to finish setup. Worth checking with Stripe before recruiting them for either service.

---

## 10. Admin

- **Orders & jobs** gets a third section, **First Line Presents**: every request with status, athlete, buyer, price, due date, flags, and actions (refund in full or part, cancel, open video). It isn't a new top-level tab, to keep the nav short.
- **Videos to check** queue (5.6), with its count on the Control center.
- **Flagged requests** queue: requests the word list held back. Release them to the athlete, or refund.
- **Mentors** page:
  - a **Video-only** filter;
  - per-athlete First Line Presents switch and stats (delivered, declined, expired, average delivery time, rating);
  - approval of video-only applicants, which needs no level assignment.
- **Settings:** a **First Line Presents** card with the section 6 settings.
- **Ledger:** source column shows "First Line Presents video".
- **Overview tile:** requests this month, delivered on time, revenue and FLP share.

---

## 11. Emails

| To | When |
|---|---|
| Buyer | Receipt; declined and refunded; expired and refunded; in review (under-18 only); delivered with link; download expiring in 30 days; refund issued after a problem report |
| Athlete | New request; reminders at 48 and 24 hours; video approved or needs a re-record; payout sent |
| Admins | Request flagged; video to check; problem reported; any failed refund or payout (existing alert) |

All of these use the existing branded email shell and Resend sending.

---

## 12. Technical design (for the build, if approved)

### Data

- **`athletes`** gains:
  - `offers_mentoring` (default true; false for video-only athletes, which keeps them out of the mentor marketplace, job offers and Film Room booking);
  - `video_enabled`, `video_price_cents`, `video_days`, `video_open_limit`, `video_paused_until`, `video_occasions`, `video_blurb`, `video_sample_media_id`.

  `athletes.tier` is already optional, so video-only athletes need no level.
- **`profiles.role`** gains `fan`.
- **New `video_requests` table:**
  - parties: buyer, athlete;
  - the request: recipient first name, under-18 flag, occasion, from name, instructions, team;
  - status: `paid`, `flagged`, `open`, `in_review`, `delivered`, `declined`, `expired`, `refunded`, `cancelled`;
  - money: price, athlete share and FLP share at purchase;
  - Stripe checkout and payment-intent ids, refunded amount;
  - video id, due date, delivered date;
  - review decision and reviewer;
  - share-token hash, rating, problem report, and timestamps.
- **`payouts`** gains `video_request_id`, and its "exactly one source" rule widens from two sources to three.
- **`media`** gains purposes `video_message` and `video_sample`.
- **Row-level security:**
  - the buyer reads their own requests;
  - the athlete reads requests addressed to them, but through a view without buyer identity;
  - admins read everything;
  - all writes go through the API, as for jobs and sessions today.
- **Public view `video_athletes_public`:** approved, listed, video-enabled, not paused, under the open limit, with price, delivery days, rating and sample.

### API (existing Hono service)

- `POST /videos/requests`: validate, screen text, create Checkout. The webhook marks it paid.
- `POST /videos/requests/:id/decline`, `/upload`, `/send`.
- `POST /admin/videos/:id/approve|reject|refund|release`.
- `GET /videos/requests/:id/watch` (signed playback token), plus share-link create and revoke.
- **Webhooks:** the existing Stripe handler gains a video-request branch for paid, expired, refunded and disputed. The existing Mux handler checks clip length when a video is ready.
- **Tick:** reminders, expiry refunds, payout release after the problem window, and download-expiry reminders.

### App (Expo, existing kit)

- **Athlete:**
  - First Line Presents card on My profile;
  - First Line Presents section on the dashboard;
  - request page with recorder/uploader and Send.
- **Buyer:**
  - `/presents` directory;
  - request form;
  - My videos list and watch page with download and share;
  - fan sign-up path and fan home.
- **Application:** "What would you like to offer?" step and the trimmed form for video-only athletes.
- **Admin:** the screens in section 10.
- **Native apps:** the same screens. Recording with the phone camera inside the app is a later improvement; uploading from the camera roll works from day one.

### Marketing site

New page and home band generated by `site/build.py`; the athlete directory stays in the app.

### Tests

An audit script in the style of the existing ones:
- screening blocks contact details;
- the buyer never sees the athlete's contact details, and the athlete never sees the buyer's;
- an under-18 video can't be delivered without approval;
- decline and expiry refund in full;
- the payout only appears after delivery and is held through the problem window;
- a video-only athlete never receives a breakdown offer;
- a fan can't order a breakdown or book a Film Room.

---

## 13. What already exists and is reused

Mux direct upload, signed playback and MP4 renditions; Stripe Checkout, the webhook with event dedupe, refunds, dispute holds, source-charge transfers and payout modes; the ledger; the scorecard; the application, agreement-signing and approval flow; Stripe Express onboarding; the notifications table and email shell; the support desk; the audit log; admin settings; the marketing-site generator.

---

## 14. Legal and policy work (FLP and counsel, before launch)

1. **Video Messages Addendum** to the Independent Contractor Agreement, signed by every athlete who turns First Line Presents on, existing mentors included. It covers:
   - the athlete owns the recording and gives FLP a licence to host and deliver it, and the buyer a personal-use licence;
   - conduct rules and prohibited content;
   - no team or league marks, jerseys or venues without permission, with an indemnity (overlaps U-36);
   - 18+ only;
   - NIL disclosure is the athlete's responsibility;
   - FLP may remove videos and refund buyers.
2. **Buyer terms**, added to the site Terms:
   - personal, non-commercial use only; no resale and no advertising use;
   - prohibited requests;
   - refund rules as in 5.8;
   - fans must be 18+;
   - FLP's review of under-18 videos.
3. **Privacy policy:** what is collected for a recipient (first name, optional team, under-18 flag) and how long videos are kept.
4. **Contract wording:** the parent-owned-accounts rule (5.4), and a written change order recording that you're including this at no charge.
5. **Name clearance** (section 2).

---

## 15. Scope, effort and timing

**Scope:** a change order. First Line Presents isn't among the thirteen contract items; you offered it at no charge on 2026-09-27 (decision 6 of that review). CLAUDE.md requires it written up and approved before work starts. A $0 change order note to Alex does that.

**Effort for the first release:** about 10 working days.

| Part | Days |
|---|---|
| Database, rules, security policies | 1 |
| API: checkout, webhooks, lifecycle, tick, refunds, payouts | 2 |
| Athlete screens, including the video-only application path | 2 |
| Buyer screens, fan sign-up, My videos | 1.5 |
| Admin screens and settings | 1 |
| Marketing page, home band, FAQ, emails | 1 |
| Audit script, fixes, manuals (mentor, admin, parent guide sections) | 1.5 |

**Timing against the contract:** we are in week 7. The web launch items (Release 1 of the review spec) and the app submission at the end of week 8 come first, and the contract mark is 2026-11-11. Three options:

- **A. After the contract mark.** Recommended if launch and app submission are at all at risk. Spend this week settling the name, the fan-account decision, the legal addendum and the rules, so the build can start the day the contract work is signed off.
- **B. After web launch, before the contract mark.** Possible only if Release 1 lands this week. It competes with the app submission.
- **C. Phase it.** Build only the supply side now: the mentor switch, video-only applications and the "Coming soon" page, so recruits can sign up and set prices. Turn on buying later.

Option C keeps recruited athletes engaged, which is what Alex wanted, without putting payments at risk before launch.

**Later phases (not in the first release):**
- rush delivery;
- business and team orders with a commercial licence;
- a public showcase of videos buyers choose to share (adult recipients only);
- gifting by email to the recipient;
- charity split (U-22);
- in-app recording on the native apps;
- discount codes (U-48);
- a free-text thank-you note to the athlete, screened.

---

## 16. Decisions needed

**For Scott**
1. The name (section 2) and when to run a trademark search.
2. Timing option A, B or C (section 15).
3. Fan accounts, parents only, or guest checkout (5.4), and the rule wording if fans.
4. $0 change-order note to Alex, or record it in DECISIONS only.
5. Video retention: 12 months, longer, or keep while the account exists (a Mux storage cost).

**For Alex (and Bryan where marked)**
1. FLP share: 30% as discussed, or match Cameo's reported 25%?
2. Price floor and ceiling; whether NHL athletes may go above the ceiling.
3. FLP review for under-18 recipients only (recommended), all videos, or none.
4. Top-nav link, or footer and home band only.
5. Occasions list. (Bryan: anything hockey-specific, e.g. "first tournament", "made the team"?)
6. Can a fan order a First Line Presents video for someone else's child, or only parents for minors? (Recommended: anyone can, with FLP review and first name only.)
7. Should video-only athletes show their level and league like mentors? (Recommended: yes.)
8. Counsel (Howard) for the addendum, buyer terms and name clearance.

---

## 17. Risks

- **Distraction from launch.** The largest risk; see section 15.
- **Brand tone.** Celebrity framing would pull FLP away from development. The visual rules and copy rules in section 7 are there to stop that.
- **Child safety.** Mitigated by review before delivery, one-way requests and first-name-only data. It still needs FLP to staff the review queue, which is low volume at first.
- **Trademark.** Even a cleared name can draw a letter from an active enforcer if the copy imitates Cameo. Avoid "cameo-style" anywhere.
- **Cross-border payouts** for Canadian athletes (section 9).
- **Sales tax** on digital content in some states (section 9).

---

## Sources

- Cameo, Refunds & Returns: https://www.cameo.com/refunds
- Business Insider, What is Cameo: https://www.businessinsider.nl/what-is-cameo/
- Hypebot, Cameo funding and the 75/25 split: https://www.hypebot.com/cameo-adds-50m-to-deliver-personalized-video-messages-from-musicians-celebrities-and-you/
- Influencer Marketing Hub, Cameo glossary: https://influencermarketinghub.com/glossary/cameo/
- Sacra, Cameo for Business: https://sacra.com/chat/h/453f0909-cc08-4b2e-8bbb-6637661c73db/
- Reviewed.com, Is Cameo worth the money: https://reviewed.com/lifestyle/content/review-is-cameo-worth-the-money
- Tubefilter, Cameo paid out $75 million to creators in 2020: https://tubefilter.com/2021/02/17/cameo-2020-earnings-top-celebrities/
- TrademarkElite, CAMEO (Serial 87444650): https://www.trademarkelite.com/trademark/trademark-detail/87444650/CAMEO
- Yahoo News, judge blocks OpenAI from using "Cameo": https://www.yahoo.com/news/articles/judge-temporarily-blocks-openai-using-021520979.html
- Bloomberg Law, OpenAI appeals the Cameo label ban: https://news.bloomberglaw.com/ip-law/openai-taking-trademark-suit-cameo-label-ban-to-ninth-circuit
- Justia, Celly Inc. trademarks: https://trademark.justia.com/owners/celly-inc-2179735
- Pocket Gamer, Stick Sports "Stick" trademark claims: https://www.pocketgamer.biz/stick-sports-lawyers-sheridans-explains-app-store-stick-trademark-infringements/
- Emojipedia, ice hockey (the stick tap gesture): https://emojipedia.org/de/eishockey
