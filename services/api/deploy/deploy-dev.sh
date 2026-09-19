#!/usr/bin/env bash
# Build the API on the Mac, ship it to flp-dev-01, install production deps there, restart the service.
# Usage: services/api/deploy/deploy-dev.sh     (needs services/api/.env.dev with the runtime values)
set -euo pipefail
cd "$(dirname "$0")/.."

HOST=flp-dev
DEST=/var/www/flp-api

echo "▸ typecheck + build"
./node_modules/.bin/tsc -p tsconfig.json

echo "▸ ship"
ssh "$HOST" "mkdir -p $DEST/next $DEST/deploy"
rsync -az --delete dist/ "$HOST:$DEST/next/dist/"
rsync -az package.json package-lock.json "$HOST:$DEST/next/"
rsync -az deploy/ "$HOST:$DEST/deploy/"
if [ -f .env.dev ]; then
  rsync -az .env.dev "$HOST:$DEST/.env"
  ssh "$HOST" "chmod 600 $DEST/.env"
fi

echo "▸ install + switch + restart"
ssh "$HOST" bash -s <<'REMOTE'
set -euo pipefail
cd /var/www/flp-api/next && /usr/local/bin/npm ci --omit=dev --no-audit --no-fund >/dev/null
cd /var/www/flp-api && rm -rf current && cp -R next current
if [ ! -f /etc/systemd/system/flp-api.service ]; then
  sudo cp deploy/flp-api.service /etc/systemd/system/flp-api.service
  sudo systemctl daemon-reload && sudo systemctl enable flp-api >/dev/null
fi
sudo systemctl restart flp-api && sleep 2 && systemctl is-active flp-api
curl -s -o /dev/null -w 'local health %{http_code}\n' http://127.0.0.1:3200/health
REMOTE
echo "▸ live: https://api-dev.firstlineperform.com/health"
