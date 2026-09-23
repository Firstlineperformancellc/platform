#!/usr/bin/env bash
# Publish the marketing site (site/www) on the production droplet at beta.firstlineperform.com.
# The vhost tells search engines not to index it (placeholder copy). Nothing here touches
# firstlineperform.com or the coming-soon page; that swap is a separate, explicit step.
# Usage: site/deploy/deploy-site-prod.sh            (first run creates the vhost; add DNS then --certs)
#        site/deploy/deploy-site-prod.sh --certs
set -euo pipefail
cd "$(dirname "$0")/.."
HOST=flp-prod
NAME=beta.firstlineperform.com
DEST=/var/www/$NAME/html

if [ "${1:-}" = "--certs" ]; then
  ssh "$HOST" "sudo certbot --nginx -n --agree-tos -m admin@firstlineperform.com -d $NAME && sudo systemctl reload nginx"
  curl -s -o /dev/null -w "https://$NAME -> %{http_code}\n" "https://$NAME/"
  exit 0
fi

echo "▸ vhost (created once)"
ssh "$HOST" bash -s "$NAME" "$DEST" <<'REMOTE'
set -euo pipefail
NAME="$1"; DEST="$2"
sudo mkdir -p "$DEST" && sudo chown -R flp:flp "/var/www/$NAME"
if [ ! -f "/etc/nginx/sites-available/$NAME" ]; then
  sudo tee "/etc/nginx/sites-available/$NAME" >/dev/null <<NG
server {
    listen 80; listen [::]:80;
    server_name $NAME;
    root $DEST;
    index index.html;
    add_header X-Robots-Tag "noindex, nofollow" always;
    add_header Cache-Control "no-cache, must-revalidate";
    location / { try_files \$uri \$uri.html \$uri/ =404; }
}
NG
  sudo ln -sf "/etc/nginx/sites-available/$NAME" "/etc/nginx/sites-enabled/$NAME"
  sudo nginx -t && sudo systemctl reload nginx
fi
REMOTE

echo "▸ ship site/www"
rsync -az --delete www/ "$HOST:$DEST/"
echo "▸ verify"
curl -s -o /dev/null -w "http://$NAME -> %{http_code}\n" -H "Host: $NAME" http://64.225.20.246/
