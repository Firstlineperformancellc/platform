#!/usr/bin/env bash
# Create and harden the production droplet flp-prod-01 under the FLP DigitalOcean account.
# Run once, from the Mac, after Scott's explicit go (this spends money). Mirrors flp-dev-01.
# Usage: deploy/bootstrap-prod.sh            (doctl context "flp" must be active)
# Afterwards: add GoDaddy A records for app.firstlineperform.com and api.firstlineperform.com
# pointing at the printed IP, then run deploy/bootstrap-prod.sh --certs to issue certificates.
set -euo pipefail

NAME=flp-prod-01
REGION=nyc3
SIZE=s-2vcpu-2gb
IMAGE=ubuntu-26-04-x64
TAG=flp
PROJECT_NAME="First Line Performance Production"
SSH_KEY_NAME=scott-macbook-air   # the flp_do public key as registered in the FLP DigitalOcean account

if [ "${1:-}" = "--certs" ]; then
  ssh flp-prod "sudo certbot --nginx -n --agree-tos -m admin@firstlineperform.com -d app.firstlineperform.com -d api.firstlineperform.com && sudo systemctl reload nginx"
  echo "certificates issued; run deploy/release.sh from main"
  exit 0
fi

echo "▸ doctl context"
doctl account get --format Email --no-header

echo "▸ project"
pid="$(doctl projects list --format ID,Name --no-header | awk -F'  +' -v n="$PROJECT_NAME" '$2==n {print $1}')"
if [ -z "$pid" ]; then
  pid="$(doctl projects create --name "$PROJECT_NAME" --purpose "Web Application" --environment Production --format ID --no-header)"
fi
echo "  $pid"

echo "▸ ssh key"
kid="$(doctl compute ssh-key list --format ID,Name --no-header | awk -v n="$SSH_KEY_NAME" '$2==n {print $1}')"
[ -n "$kid" ] || { echo "ssh key $SSH_KEY_NAME not found in the FLP account"; exit 1; }

echo "▸ droplet"
did="$(doctl compute droplet list --format ID,Name --no-header | awk -v n="$NAME" '$2==n {print $1}')"
if [ -z "$did" ]; then
  did="$(doctl compute droplet create "$NAME" --region "$REGION" --size "$SIZE" --image "$IMAGE" --ssh-keys "$kid" --tag-names "$TAG" --enable-monitoring --wait --format ID --no-header)"
  doctl projects resources assign "$pid" --resource "do:droplet:$did" >/dev/null
fi
ip="$(doctl compute droplet get "$did" --format PublicIPv4 --no-header)"
echo "  $NAME $ip"

echo "▸ ssh alias"
if ! grep -q "^Host flp-prod$" ~/.ssh/config 2>/dev/null; then
  printf "\nHost flp-prod\n  HostName %s\n  User flp\n  IdentityFile ~/.ssh/flp_do\n  IdentitiesOnly yes\n" "$ip" >> ~/.ssh/config
fi

echo "▸ waiting for ssh"
for i in $(seq 1 30); do
  ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=5 -i ~/.ssh/flp_do "root@$ip" true 2>/dev/null && break
  sleep 5
done

echo "▸ harden + install (root on first run; the flp user with sudo after root login is closed)"
if ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=5 -i ~/.ssh/flp_do "root@$ip" true 2>/dev/null; then
  REMOTE_SSH=(ssh -o StrictHostKeyChecking=accept-new -i ~/.ssh/flp_do "root@$ip" bash -s)
else
  REMOTE_SSH=(ssh -o StrictHostKeyChecking=accept-new flp-prod sudo bash -s)
fi
"${REMOTE_SSH[@]}" <<'REMOTE'
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
# Ubuntu's first-boot updater holds the apt lock for a few minutes; wait it out.
for i in $(seq 1 60); do
  if ! fuser /var/lib/dpkg/lock-frontend /var/lib/apt/lists/lock >/dev/null 2>&1 && ! pgrep -x apt-get >/dev/null && ! pgrep -x unattended-upgr >/dev/null; then break; fi
  sleep 5
done
id flp >/dev/null 2>&1 || { adduser --disabled-password --gecos "" flp; usermod -aG sudo flp; echo "flp ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/flp; chmod 440 /etc/sudoers.d/flp; }
mkdir -p /home/flp/.ssh && cp /root/.ssh/authorized_keys /home/flp/.ssh/ && chown -R flp:flp /home/flp/.ssh && chmod 700 /home/flp/.ssh && chmod 600 /home/flp/.ssh/authorized_keys
apt-get update -q && apt-get install -y -q nginx certbot python3-certbot-nginx ufw fail2ban unattended-upgrades rsync curl >/dev/null
sed -i 's/^#\?PasswordAuthentication .*/PasswordAuthentication no/; s/^#\?PermitRootLogin .*/PermitRootLogin no/' /etc/ssh/sshd_config
systemctl restart ssh
ufw allow OpenSSH >/dev/null
ufw allow 'Nginx Full' >/dev/null
ufw --force enable >/dev/null
systemctl enable --now fail2ban >/dev/null
dpkg-reconfigure -f noninteractive unattended-upgrades
if [ ! -x /usr/local/bin/node ]; then
  ver="$(curl -fsSL https://nodejs.org/dist/latest-v24.x/ | grep -o 'node-v24[0-9.]*-linux-x64.tar.xz' | head -1)"
  curl -fsSL "https://nodejs.org/dist/latest-v24.x/$ver" -o /tmp/node.tar.xz && tar -xJf /tmp/node.tar.xz -C /usr/local --strip-components=1 && rm /tmp/node.tar.xz
fi
mkdir -p /var/www/app.firstlineperform.com/html /var/www/flp-api && chown -R flp:flp /var/www
cat > /etc/nginx/sites-available/app.firstlineperform.com <<'NG'
server {
    listen 80; listen [::]:80;
    server_name app.firstlineperform.com;
    root /var/www/app.firstlineperform.com/html;
    index index.html;
    add_header Cache-Control "no-cache, must-revalidate";
    location / { try_files $uri $uri.html $uri/ /index.html; }
}
NG
cat > /etc/nginx/sites-available/api.firstlineperform.com <<'NG'
server {
    listen 80; listen [::]:80;
    server_name api.firstlineperform.com;
    client_max_body_size 10m;
    location / {
        proxy_pass http://127.0.0.1:3200;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }
}
NG
ln -sf /etc/nginx/sites-available/app.firstlineperform.com /etc/nginx/sites-enabled/
ln -sf /etc/nginx/sites-available/api.firstlineperform.com /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
echo "server ready"
REMOTE

echo
echo "Add these A records at GoDaddy, then run: deploy/bootstrap-prod.sh --certs"
echo "  app.firstlineperform.com  A  $ip"
echo "  api.firstlineperform.com  A  $ip"
