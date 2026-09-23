#!/usr/bin/env bash
# Build the product app's web export on the Mac and ship it to flp-dev-01.
# Usage: apps/product/deploy/deploy-dev.sh          (needs apps/product/.env for the dev project)
# Serves at https://dev.firstlineperform.com. Production gets its own script at promotion time.
set -euo pipefail
cd "$(dirname "$0")/.."

HOST=flp-dev
DEST=/var/www/dev.firstlineperform.com/html
OUT=dist

echo "▸ typecheck"
./node_modules/.bin/tsc --noEmit

echo "▸ export web (dev env, fresh cache)"
rm -rf "$OUT"
# Metro caches transformed modules with env values inlined; a production release on this Mac would
# otherwise leak into the next dev export. Clear it and pin the dev values from .env explicitly.
set -a; . ./.env; set +a
./node_modules/.bin/expo export --platform web --output-dir "$OUT" --clear >/dev/null
grep -q "$(grep '^EXPO_PUBLIC_SUPABASE_URL=' .env | cut -d= -f2- | sed 's#https://##')" "$OUT"/_expo/static/js/web/*.js || { echo "bundle does not reference the dev Supabase project; aborting"; exit 1; }
if grep -q "sbvojmprxienxacwrsfp" "$OUT"/_expo/static/js/web/*.js; then echo "bundle references the production project; aborting"; exit 1; fi

echo "▸ ship"
rsync -az --delete "$OUT"/ "$HOST:$DEST/"

echo "▸ verify"
curl -s -o /dev/null -w "https://dev.firstlineperform.com -> %{http_code}\n" https://dev.firstlineperform.com/welcome
