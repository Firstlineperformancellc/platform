#!/usr/bin/env bash
# Register the FLP API's single Daily webhook and store its signing secret in one or more env files.
# Daily allows one webhook per domain, so it points at production, which relays events for rooms it
# does not own to dev (DAILY_RELAY_URL). Both environments therefore need the same secret.
# Usage: deploy/daily-webhook.sh <webhook-url> <env-file> [<env-file>...]
#   deploy/daily-webhook.sh https://api.firstlineperform.com/webhooks/daily .env.prod .env.dev
# Reads DAILY_API_KEY from the first env file, replaces any webhook already at that URL, and writes
# DAILY_WEBHOOK_SECRET into every env file given. Prints only the webhook id, state, and secret length.
set -euo pipefail
URL="${1:?webhook url}"
shift
[ "$#" -ge 1 ] || { echo "give at least one env file"; exit 1; }
ENV_FILES=("$@")
ENV_FILE="${ENV_FILES[0]}"
cd "$(dirname "$0")/.."

KEY="$(grep '^DAILY_API_KEY=' "$ENV_FILE" | cut -d= -f2- | tr -d '[:space:]')"
[ -n "$KEY" ] || { echo "DAILY_API_KEY is empty in $ENV_FILE"; exit 1; }
API="https://api.daily.co/v1"
auth=(-H "Authorization: Bearer $KEY" -H "content-type: application/json")

# Daily allows one webhook per domain: remove whatever is there so the new one can take its place.
existing="$(curl -sf "${auth[@]}" "$API/webhooks" | python3 -c '
import json,sys; d=json.load(sys.stdin); ws=d.get("data",d) if isinstance(d,dict) else d
print(" ".join(w["uuid"] for w in ws))')"
for id in $existing; do
  curl -sf -X DELETE "${auth[@]}" "$API/webhooks/$id" >/dev/null && echo "removed old webhook $id"
done

body="$(python3 -c 'import json,sys; print(json.dumps({"url": sys.argv[1], "eventTypes": ["recording.started","recording.ready-to-download","meeting.ended"]}))' "$URL")"
resp="$(curl -s --fail-with-body -X POST "${auth[@]}" -d "$body" "$API/webhooks")"

python3 - "$resp" "${ENV_FILES[@]}" <<'PY'
import json, re, sys
resp, env_paths = sys.argv[1], sys.argv[2:]
d = json.loads(resp)
secret = d.get("hmac") or ""
print(f"webhook {d.get('uuid')} state={d.get('state')} events={d.get('eventTypes')}")
if not secret:
    sys.exit("Daily did not return an hmac secret; nothing written")
for env_path in env_paths:
    s = open(env_path).read()
    if re.search(r"^DAILY_WEBHOOK_SECRET=.*$", s, flags=re.M):
        s = re.sub(r"^DAILY_WEBHOOK_SECRET=.*$", "DAILY_WEBHOOK_SECRET=" + secret, s, flags=re.M)
    else:
        s = s.rstrip("\n") + "\nDAILY_WEBHOOK_SECRET=" + secret + "\n"
    open(env_path, "w").write(s)
    print(f"DAILY_WEBHOOK_SECRET written to {env_path} ({len(secret)} chars)")
PY
