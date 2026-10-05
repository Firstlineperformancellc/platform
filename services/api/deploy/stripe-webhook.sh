#!/usr/bin/env bash
# Register the two Stripe webhook endpoints for an environment and store their signing secrets.
#   1. FLP's own account: checkout paid / expired, refunds, disputes.
#   2. Connected accounts (mentors): account.updated, so payout readiness updates on its own.
# Usage: deploy/stripe-webhook.sh <api-base-url> <env-file>
#   dev:  deploy/stripe-webhook.sh https://api-dev.firstlineperform.com .env.dev    (test-mode key in the file)
#   prod: deploy/stripe-webhook.sh https://api.firstlineperform.com .env.prod       (live key in the file)
# Reads STRIPE_SECRET_KEY from the env file, replaces any endpoint already pointing at this URL, and
# writes STRIPE_WEBHOOK_SECRET and STRIPE_CONNECT_WEBHOOK_SECRET into the file. Prints ids and
# secret lengths only; the secrets themselves are never shown.
set -euo pipefail
BASE="${1:?api base url}"; ENV_FILE="${2:?env file}"
cd "$(dirname "$0")/.."
URL="${BASE%/}/webhooks/stripe"
KEY="$(grep '^STRIPE_SECRET_KEY=' "$ENV_FILE" | cut -d= -f2- | tr -d '[:space:]')"
[ -n "$KEY" ] || { echo "STRIPE_SECRET_KEY is empty in $ENV_FILE"; exit 1; }
case "$KEY" in sk_live_*|rk_live_*) MODE=live ;; sk_test_*|rk_test_*) MODE=test ;; *) echo "that does not look like a Stripe secret key"; exit 1 ;; esac
echo "▸ $MODE mode, endpoint $URL"
API=https://api.stripe.com/v1

existing="$(curl -sS --fail-with-body -u "$KEY:" "$API/webhook_endpoints?limit=100" | python3 -c '
import json,sys; url=sys.argv[1]
print(" ".join(e["id"] for e in json.load(sys.stdin).get("data", []) if e.get("url") == url))' "$URL")"
for id in $existing; do curl -sS --fail-with-body -u "$KEY:" -X DELETE "$API/webhook_endpoints/$id" >/dev/null && echo "  removed old endpoint $id"; done

account="$(curl -sS --fail-with-body -u "$KEY:" "$API/webhook_endpoints" \
  -d url="$URL" -d "description=FLP platform ($MODE)" \
  -d "enabled_events[]=checkout.session.completed" -d "enabled_events[]=checkout.session.async_payment_succeeded" \
  -d "enabled_events[]=checkout.session.expired" -d "enabled_events[]=charge.refunded" -d "enabled_events[]=charge.dispute.created")" \
  || { echo "  Stripe refused to create the account endpoint:"; echo "$account" | python3 -c 'import json,sys; print("  " + json.load(sys.stdin).get("error", {}).get("message", "no message"))' 2>/dev/null || true; exit 1; }
connect="$(curl -sS --fail-with-body -u "$KEY:" "$API/webhook_endpoints" \
  -d url="$URL" -d "description=FLP mentors' connected accounts ($MODE)" -d connect=true \
  -d "enabled_events[]=account.updated")" || { echo "  could not create the connected-accounts endpoint: is Connect enabled on this Stripe account?"; connect='{}'; }

python3 - "$ENV_FILE" "$account" "$connect" <<'PY'
import json, re, sys
env_path, account, connect = sys.argv[1], json.loads(sys.argv[2]), json.loads(sys.argv[3])
s = open(env_path).read()
def put(s, name, value):
    if re.search(rf"^{name}=.*$", s, flags=re.M):
        return re.sub(rf"^{name}=.*$", f"{name}={value}", s, flags=re.M)
    return s.rstrip("\n") + f"\n{name}={value}\n"
if not account.get("secret"):
    sys.exit("Stripe did not return a signing secret for the account endpoint; nothing written")
s = put(s, "STRIPE_WEBHOOK_SECRET", account["secret"])
print(f"  account endpoint {account['id']}: {len(account['enabled_events'])} events, secret written ({len(account['secret'])} chars)")
if connect.get("secret"):
    s = put(s, "STRIPE_CONNECT_WEBHOOK_SECRET", connect["secret"])
    print(f"  connect endpoint {connect['id']}: secret written ({len(connect['secret'])} chars)")
else:
    print("  connect endpoint not created; enable Connect in the Stripe dashboard and run this again")
open(env_path, "w").write(s)
PY
echo "▸ done. Deploy the API so it picks up the secrets."
