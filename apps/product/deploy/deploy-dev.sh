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

echo "▸ export web"
rm -rf "$OUT"
./node_modules/.bin/expo export --platform web --output-dir "$OUT" >/dev/null

echo "▸ ship"
rsync -az --delete "$OUT"/ "$HOST:$DEST/"

echo "▸ verify"
curl -s -o /dev/null -w "https://dev.firstlineperform.com -> %{http_code}\n" https://dev.firstlineperform.com/welcome
