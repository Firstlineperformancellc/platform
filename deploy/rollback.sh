#!/usr/bin/env bash
# Put the previous API build back on production (the app is static; redeploy an older tag for that).
# Usage: deploy/rollback.sh
set -euo pipefail
ssh flp-prod bash -s <<'REMOTE'
set -euo pipefail
cd /var/www/flp-api
[ -d previous ] || { echo "no previous build on the server"; exit 1; }
rm -rf rolled && mv current rolled && mv previous current && mv rolled previous
sudo systemctl restart flp-api && sleep 2 && curl -sf -o /dev/null http://127.0.0.1:3200/health && echo "api rolled back"
REMOTE
