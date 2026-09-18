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
