#!/usr/bin/env bash
# Register the FLP API's Daily webhook and store its signing secret in the env file.
# Usage: deploy/daily-webhook.sh <env-file> <webhook-url>
#   e.g. deploy/daily-webhook.sh .env.dev https://api-dev.firstlineperform.com/webhooks/daily
# Reads DAILY_API_KEY from the env file, creates the webhook (or replaces one already
# pointing at the same URL), and writes DAILY_WEBHOOK_SECRET into the env file.
# Prints only the webhook id, state, and the secret's length. Nothing secret is echoed.
set -euo pipefail
ENV_FILE="${1:?env file}"
URL="${2:?webhook url}"
cd "$(dirname "$0")/.."

KEY="$(grep '^DAILY_API_KEY=' "$ENV_FILE" | cut -d= -f2- | tr -d '[:space:]')"
[ -n "$KEY" ] || { echo "DAILY_API_KEY is empty in $ENV_FILE"; exit 1; }
API="https://api.daily.co/v1"
auth=(-H "Authorization: Bearer $KEY" -H "content-type: application/json")

# Remove any earlier webhook for this URL so the secret in the file always matches Daily's.
existing="$(curl -sf "${auth[@]}" "$API/webhooks" | python3 -c '
import json,sys; d=json.load(sys.stdin); ws=d.get("data",d) if isinstance(d,dict) else d
print(" ".join(w["uuid"] for w in ws if w.get("url")==sys.argv[1]))' "$URL")"
for id in $existing; do
  curl -sf -X DELETE "${auth[@]}" "$API/webhooks/$id" >/dev/null && echo "removed old webhook $id"
done

body="$(python3 -c 'import json,sys; print(json.dumps({"url": sys.argv[1], "eventTypes": ["recording.started","recording.ready-to-download","meeting.ended"]}))' "$URL")"
resp="$(curl -sf -X POST "${auth[@]}" -d "$body" "$API/webhooks")"

python3 - "$ENV_FILE" <<'PY' "$resp"
import json, re, sys
env_path, resp = sys.argv[1], sys.argv[2]
d = json.loads(resp)
secret = d.get("hmac") or ""
print(f"webhook {d.get('uuid')} state={d.get('state')} events={d.get('eventTypes')}")
if not secret:
    sys.exit("Daily did not return an hmac secret; nothing written")
s = open(env_path).read()
if re.search(r"^DAILY_WEBHOOK_SECRET=.*$", s, flags=re.M):
    s = re.sub(r"^DAILY_WEBHOOK_SECRET=.*$", "DAILY_WEBHOOK_SECRET=" + secret, s, flags=re.M)
else:
    s = s.rstrip("\n") + "\nDAILY_WEBHOOK_SECRET=" + secret + "\n"
open(env_path, "w").write(s)
print(f"DAILY_WEBHOOK_SECRET written to {env_path} ({len(secret)} chars)")
PY
