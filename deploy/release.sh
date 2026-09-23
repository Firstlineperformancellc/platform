#!/usr/bin/env bash
# Promote a build to production. Runs from the Mac, only from a clean checkout of main, and tags
# the release. Production hosts: app.firstlineperform.com (static web export) and
# api.firstlineperform.com (Hono on Node) on droplet flp-prod-01 (ssh alias flp-prod).
# It never touches firstlineperform.com or the coming-soon page.
# Usage: deploy/release.sh                 (tags vYYYY.MM.DD-N automatically)
#        deploy/release.sh --tag v2026.10.18-1
set -euo pipefail
cd "$(dirname "$0")/.."

HOST=flp-prod
APP_DEST=/var/www/app.firstlineperform.com/html
API_DEST=/var/www/flp-api

TAG="${2:-}"
[ "${1:-}" = "--tag" ] || TAG=""

echo "▸ preflight"
branch="$(git rev-parse --abbrev-ref HEAD)"
[ "$branch" = "main" ] || { echo "release only from main (on $branch)"; exit 1; }
[ -z "$(git status --porcelain)" ] || { echo "working tree not clean"; exit 1; }
git fetch -q origin main && [ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] || { echo "main is not in sync with origin"; exit 1; }
[ -f services/api/.env.prod ] || { echo "services/api/.env.prod missing"; exit 1; }
[ -f apps/product/.env.prod ] || { echo "apps/product/.env.prod missing"; exit 1; }
for k in SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY MUX_TOKEN_ID MUX_TOKEN_SECRET MUX_WEBHOOK_SECRET MUX_SIGNING_KEY_ID MUX_SIGNING_KEY_PRIVATE STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET DAILY_API_KEY DAILY_WEBHOOK_SECRET RESEND_API_KEY TICK_SECRET APP_ORIGIN; do
  grep -qE "^$k=.+" services/api/.env.prod || { echo "services/api/.env.prod: $k is empty"; exit 1; }
done
grep -q "^APP_ENV=prod" services/api/.env.prod || { echo "services/api/.env.prod must set APP_ENV=prod"; exit 1; }
if [ -z "$TAG" ]; then
  d="$(date +%Y.%m.%d)"; n=1
  while git rev-parse -q --verify "refs/tags/v$d-$n" >/dev/null; do n=$((n+1)); done
  TAG="v$d-$n"
fi

echo "▸ typecheck + build (tag $TAG)"
( cd services/api && ./node_modules/.bin/tsc -p tsconfig.json )
( cd apps/product && ./node_modules/.bin/tsc --noEmit && rm -rf dist && cp .env.prod .env.production.local && ./node_modules/.bin/expo export --platform web --output-dir dist >/dev/null; rm -f .env.production.local )

echo "▸ ship api"
ssh "$HOST" "mkdir -p $API_DEST/next $API_DEST/deploy"
rsync -az --delete services/api/dist/ "$HOST:$API_DEST/next/dist/"
rsync -az services/api/package.json services/api/package-lock.json "$HOST:$API_DEST/next/"
rsync -az services/api/deploy/ "$HOST:$API_DEST/deploy/"
rsync -az services/api/.env.prod "$HOST:$API_DEST/.env" && ssh "$HOST" "chmod 600 $API_DEST/.env"
ssh "$HOST" bash -s <<'REMOTE'
set -euo pipefail
cd /var/www/flp-api/next && /usr/local/bin/npm ci --omit=dev --no-audit --no-fund >/dev/null
cd /var/www/flp-api && rm -rf previous && { [ -d current ] && mv current previous || true; } && cp -R next current
if [ ! -f /etc/systemd/system/flp-api.service ]; then
  sudo cp deploy/flp-api.service /etc/systemd/system/flp-api.service && sudo systemctl daemon-reload && sudo systemctl enable flp-api >/dev/null
fi
if [ ! -f /etc/systemd/system/flp-api-tick.timer ]; then
  sudo cp deploy/flp-api-tick.service deploy/flp-api-tick.timer /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable --now flp-api-tick.timer >/dev/null
fi
sudo systemctl restart flp-api && sleep 2 && systemctl is-active flp-api >/dev/null
curl -sf -o /dev/null http://127.0.0.1:3200/health
REMOTE

echo "▸ ship app"
rsync -az --delete apps/product/dist/ "$HOST:$APP_DEST/"

echo "▸ tag"
git tag -a "$TAG" -m "release $TAG" && git push -q origin "$TAG"

echo "▸ verify"
curl -s -o /dev/null -w "https://app.firstlineperform.com -> %{http_code}\n" https://app.firstlineperform.com/welcome
curl -s -o /dev/null -w "https://api.firstlineperform.com/health -> %{http_code}\n" https://api.firstlineperform.com/health
echo "released $TAG"
