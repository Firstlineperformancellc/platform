#!/usr/bin/env bash
# beta.firstlineperform.com used to carry the marketing site before launch. Since 2026-10-24 it serves one
# page, site/moved/index.html, which says the site has moved and sends the visitor to the same path at
# firstlineperform.com after seven seconds. Every path on beta gets that page; search engines are told
# not to index it. Usage: site/deploy/deploy-site-moved.sh
set -euo pipefail
cd "$(dirname "$0")/.."
HOST=flp-prod
NAME=beta.firstlineperform.com
DEST=/var/www/$NAME/html

echo "▸ vhost: every path serves the moved page"
ssh "$HOST" bash -s "$NAME" "$DEST" <<'REMOTE'
set -euo pipefail
NAME="$1"; DEST="$2"
CONF="/etc/nginx/sites-available/$NAME"
sudo mkdir -p "$DEST" && sudo chown -R flp:flp "/var/www/$NAME"
CERT_BLOCK="$(sudo sed -n '/listen 443 ssl; # managed by Certbot/,/ssl_dhparam/p' "$CONF")"
[ -n "$CERT_BLOCK" ] || { echo "could not find certbot's TLS block in $CONF; stopping"; exit 1; }
sudo tee "$CONF" >/dev/null <<NG
# beta.firstlineperform.com: "we've moved" page (site/moved in the platform repo, site/deploy/deploy-site-moved.sh).
server {
    server_name $NAME;
    root $DEST;
    index index.html;
    add_header X-Robots-Tag "noindex, nofollow" always;
    add_header Cache-Control "no-cache, must-revalidate";
    location = /logo.png { }
    location / { try_files /index.html =404; }

$CERT_BLOCK
}
server {
    listen 80; listen [::]:80;
    server_name $NAME;
    return 301 https://$NAME\$request_uri;
}
NG
sudo nginx -t
REMOTE

echo "▸ ship site/moved"
rsync -az --delete moved/ "$HOST:$DEST/"
scp -q logo.png "$HOST:$DEST/logo.png"
ssh "$HOST" "sudo systemctl reload nginx"

echo "▸ verify"
curl -s -o /dev/null -w "https://$NAME/ -> %{http_code}\n" "https://$NAME/"
curl -s -o /dev/null -w "https://$NAME/pricing.html -> %{http_code} (same page)\n" "https://$NAME/pricing.html"
curl -s "https://$NAME/anything" | grep -c "We've moved"
