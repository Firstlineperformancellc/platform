# FLP — First Line Performance

Client build for First Line Performance LLC (d/b/a FLP), Alex Leve and Bryan Hogan. Developer: Magnum Appus (Scott Maslowe). Contract: Software Development Agreement re Quote MA-2026-014, $16,000 fixed + 5% equity, ten weeks from 2026-09-07, contract mark 2026-11-11. Full plan: `docs/PROJECT_SPEC.md`. Decisions: `docs/DECISIONS.md`.

## The isolation rule (standing, non-negotiable)

FLP is a self-contained project that will be handed to the client in its entirety. It could be given to a stranger tomorrow with no dependency on anything else Scott owns, and Scott could delete every FLP account without touching anything else he runs.

- **Files:** everything FLP lives under this folder. No symlinks out, no code pulled in by path from any other project.
- **Version control:** this repo and the deck's repo (`deck/`, its own git repo) have their own remotes in an FLP-owned GitHub organization. No shared history with any Magnum Appus or maslowe repo.
- **Accounts:** every service (DigitalOcean, Supabase, Stripe, Mux, Daily, Resend, Expo, Apple, Google, GitHub, Sentry) is created under an FLP identity (admin@firstlineperform.com or an alias), in its own team or organization with its own billing. Never inside a team, project, database, server, or API key another project uses.
- **Identity:** Scott's presence is always a removable member (SSH key, GitHub seat, team role), never the owner of record. At handover Alex rotates credentials and removes Scott; nothing else changes.
- **Knowledge is exempt:** patterns, hosting approaches, and prior work are fair to consult. Reuse the idea, never the resource.
- **Temporary exception:** Scott's Magnum Appus address sits in the Workspace recovery slot until handover.

## Non-negotiables in the product

- Customer accounts are parent-owned. The player is a profile under the parent, never a login. No direct messaging between athletes and players.
- Every mentoring session is recorded, with no off-the-record option, booked through the parent account, which may join at any time. Enforced in code and provider configuration, not policy.
- Money is never held by us: Stripe holds funds, Stripe Connect pays athletes.
- Two environments, Development and Production. Production is touched only by the release script.

## Architecture (decided 2026-09-18, see docs/DECISIONS.md)

One Expo app (Expo Router, TypeScript) shipping to web, iOS, and Android. Admin panel inside it under an admin role. Static marketing site on the droplet. Supabase for Postgres, auth, storage, RLS. Small Node API service on the droplet for webhooks and the job state machine. Mux for video, Daily for calls, Stripe Checkout and Connect for money, Resend for email, Expo Push for notifications, Sentry for errors.

## Layout

- `apps/product/` — the product app (Expo SDK 57, Expo Router, TypeScript; `src/app` routes, `src/components/ui` kit, `src/theme/tokens.ts`, `src/lib/supabase.ts` + `auth.tsx`). Own `node_modules` and `.env` (copy `.env.example`). Run the web build with `npm --prefix apps/product run web` (port 8081) or the `product-web` launch config. Typecheck: `./node_modules/.bin/tsc --noEmit` inside the app. Laptop-first, phone second.
- `supabase/` — migrations and the CLI config linked to the dev project.
- `site/` — the live marketing/coming-soon page at firstlineperform.com (nginx on droplet `flp-web-01`).
- `deck/` — the client communications deck at comms.firstlineperform.com. Separate git repo, deploy with `deck/deploy/deploy.sh`. Frozen except for fixes.
- `docs/` — spec, decisions, and the handover package as it grows.
- `Current Landscape/` — client-supplied brand mockups, pilot video, signed agreement. Reference only, not tracked in git.

## Infrastructure

Supabase: FLP org "First Line Performance LLC" (pyrnphumzvmzfaruamno). Dev project `flp-platform-dev` (ref uspbmbvoxotbelribjgo, us-east-1, free), linked from this repo; apply migrations with `npx supabase db query --linked -f supabase/migrations/<file>` and record the version in `supabase_migrations.schema_migrations` (no DB password needed). The deck uses the org's other project (nkctthacwjvxytyvndxx). Production project comes at promotion (Pro). GitHub: github.com/Firstlineperformancellc with repos `platform` (this repo, `main` + `dev`) and `deck` (`dev`). Push through the SSH host alias `github.com-flp`, key `~/.ssh/flp_github`, which is registered on the FLP GitHub account; Scott's personal GitHub login is never used for FLP. DigitalOcean account admin@firstlineperform.com, doctl context `flp` (default). Droplet `flp-web-01` (Ubuntu 26.04, NYC3, 157.245.213.222), `ssh flp-web` as user `flp`, SSH key `~/.ssh/flp_do`. Cloud firewall `flp-web` by tag `flp`. Let's Encrypt with auto-renew. DNS at GoDaddy. Google Workspace with admin@ and aliases.

## Ways of working

- Propose before changing anything that is live or hard to reverse. Production infra, DNS, client-facing pages, and the deck are all "live".
- No multi-agent workflows or fact-check fan-outs unless Scott asks by name.
- Sunday demo every week; milestone reviews in weeks 4, 5, and 8. Client feedback within 3 business days per the contract.
- Anything not in the contract's thirteen scope items is written up and approved before work starts.
- Branches: `dev` is integration, `main` is production. Conventional Commits. Nothing merges red.
- Secrets never in git or chat. Each environment has its own store.
