#!/usr/bin/env bash
# Publish the marketing site (site/www) at firstlineperform.com and www.firstlineperform.com on flp-web-01.
# First run (2026-10-24) replaced the coming-soon page: the old page is kept on the server at
# /var/www/firstlineperform.com/coming-soon and in the repo at site/index.html. www redirects to the
# bare domain. Rebuild first: python3 site/build.py.
# Usage: site/deploy/deploy-site-live.sh
set -euo pipefail
cd "$(dirname "$0")/.."
HOST=flp-web
NAME=firstlineperform.com
BASE=/var/www/$NAME
DEST=$BASE/html

[ -f www/index.html ] || { echo "site/www is empty; run python3 site/build.py first"; exit 1; }

echo "▸ vhost + keep the coming-soon page"
ssh "$HOST" bash -s "$NAME" "$BASE" "$DEST" <<'REMOTE'
set -euo pipefail
NAME="$1"; BASE="$2"; DEST="$3"
CONF="/etc/nginx/sites-available/$NAME"
# the coming-soon page moves aside once; nothing is deleted
if [ ! -d "$BASE/coming-soon" ] && [ -f "$DEST/index.html" ] && ! [ -f "$DEST/pricing.html" ]; then
  sudo mv "$DEST" "$BASE/coming-soon"
fi
sudo mkdir -p "$DEST" && sudo chown -R flp:flp "$BASE"
# the TLS lines certbot wrote are kept word for word; only our part of the config changes
CERT_BLOCK="$(sudo sed -n '/listen 443 ssl; # managed by Certbot/,/ssl_dhparam/{p;/ssl_dhparam/q;}' "$CONF")"   # first block only
[ -n "$CERT_BLOCK" ] || { echo "could not find certbot's TLS block in $CONF; stopping"; exit 1; }
# nginx allows "ipv6only=on" on one listen per port, so the www block carries the TLS lines without it
WWW_BLOCK="$(printf '%s\n' "$CERT_BLOCK" | sed 's/ ipv6only=on//')"
sudo tee "$CONF" >/dev/null <<NG
# firstlineperform.com: the marketing site (site/www in the platform repo, deployed by site/deploy/deploy-site-live.sh).
# www redirects to the bare domain. The coming-soon page it replaced is kept at $BASE/coming-soon.
server {
    server_name $NAME;
    root $DEST;
    index index.html;
    add_header Cache-Control "no-cache, must-revalidate";
    location /assets/ { add_header Cache-Control "public, max-age=3600"; }
    location / { try_files \$uri \$uri.html \$uri/ =404; }

$CERT_BLOCK
}
server {
    server_name www.$NAME;
    return 301 https://$NAME\$request_uri;

$WWW_BLOCK
}
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name $NAME www.$NAME;
    return 301 https://$NAME\$request_uri;
}
NG
sudo nginx -t
REMOTE

echo "▸ ship site/www"
rsync -az --delete --exclude 'assets 2' www/ "$HOST:$DEST/"
scp -q logo.png "$HOST:$DEST/logo.png"   # og:image and the favicon of the old page both live at /logo.png
ssh "$HOST" "sudo systemctl reload nginx"

echo "▸ verify"
curl -s -o /dev/null -w "https://$NAME/ -> %{http_code}\n" "https://$NAME/"
curl -s -o /dev/null -w "https://$NAME/presents.html -> %{http_code}\n" "https://$NAME/presents.html"
curl -s -o /dev/null -w "https://www.$NAME/pricing.html -> %{http_code} %{redirect_url}\n" "https://www.$NAME/pricing.html"
curl -s -o /dev/null -w "http://$NAME/ -> %{http_code} %{redirect_url}\n" "http://$NAME/"
