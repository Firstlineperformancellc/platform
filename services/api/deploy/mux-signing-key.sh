#!/usr/bin/env bash
# Create a Mux signing key for signed playback and store it in the env file.
# Usage: deploy/mux-signing-key.sh <env-file>        e.g. deploy/mux-signing-key.sh .env.dev
# Reads MUX_TOKEN_ID / MUX_TOKEN_SECRET from the env file, asks Mux for a new signing key, and
# writes MUX_SIGNING_KEY_ID and MUX_SIGNING_KEY_PRIVATE (base64 PEM, as Mux returns it) into the
# same file. Prints only the key id. Run once per environment; the private key is never echoed.
set -euo pipefail
ENV_FILE="${1:?env file}"
cd "$(dirname "$0")/.."

ID="$(grep '^MUX_TOKEN_ID=' "$ENV_FILE" | cut -d= -f2- | tr -d '[:space:]')"
SECRET="$(grep '^MUX_TOKEN_SECRET=' "$ENV_FILE" | cut -d= -f2- | tr -d '[:space:]')"
[ -n "$ID" ] && [ -n "$SECRET" ] || { echo "MUX_TOKEN_ID / MUX_TOKEN_SECRET missing in $ENV_FILE"; exit 1; }

resp="$(curl -s --fail-with-body -u "$ID:$SECRET" -X POST -H "content-type: application/json" -d '{}' https://api.mux.com/system/v1/signing-keys)"

python3 - "$ENV_FILE" <<'PY' "$resp"
import json, re, sys
env_path, resp = sys.argv[1], sys.argv[2]
d = json.loads(resp).get("data", {})
key_id, private_key = d.get("id") or "", d.get("private_key") or ""
if not key_id or not private_key:
    sys.exit("Mux did not return a signing key; nothing written")
s = open(env_path).read()
def put(s, name, value):
    if re.search(rf"^{name}=.*$", s, flags=re.M):
        return re.sub(rf"^{name}=.*$", f"{name}={value}", s, flags=re.M)
    return s.rstrip("\n") + f"\n{name}={value}\n"
s = put(s, "MUX_SIGNING_KEY_ID", key_id)
s = put(s, "MUX_SIGNING_KEY_PRIVATE", private_key)
open(env_path, "w").write(s)
print(f"signing key {key_id} created; MUX_SIGNING_KEY_ID and MUX_SIGNING_KEY_PRIVATE written to {env_path} ({len(private_key)} chars)")
PY
