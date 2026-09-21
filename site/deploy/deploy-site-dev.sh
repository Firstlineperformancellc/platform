#!/usr/bin/env bash
# Preview the marketing site (site/www) on the dev droplet at https://dev.firstlineperform.com/site/
# Nothing here touches firstlineperform.com or the coming-soon page. Production deploy is a separate
# script written at promotion time, run only when Scott says the site ships.
set -euo pipefail
cd "$(dirname "$0")/.."

HOST=flp-dev
DEST=/var/www/site-dev/html

echo "▸ ship site/www"
ssh "$HOST" "sudo mkdir -p $DEST && sudo chown -R flp:flp /var/www/site-dev"
rsync -az --delete www/ "$HOST:$DEST/"

echo "▸ nginx location (added once)"
ssh "$HOST" bash -s <<'REMOTE'
set -euo pipefail
CONF=/etc/nginx/sites-enabled/dev.firstlineperform.com
if ! grep -q 'location /site/' "$CONF"; then
  sudo sed -i 's#^\(\s*\)location / { try_files#\1location /site/ { alias /var/www/site-dev/html/; index index.html; try_files $uri $uri/ $uri.html =404; }\n\1location / { try_files#' "$CONF"
  sudo nginx -t && sudo systemctl reload nginx
fi
REMOTE

echo "▸ verify"
curl -s -o /dev/null -w "https://dev.firstlineperform.com/site/ -> %{http_code}\n" https://dev.firstlineperform.com/site/
