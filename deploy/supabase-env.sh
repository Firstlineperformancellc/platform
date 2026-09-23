#!/usr/bin/env bash
# Write a Supabase project's URL and keys into the API and app env files for an environment.
# Usage: deploy/supabase-env.sh <project-ref> <env>        e.g. deploy/supabase-env.sh sbvojmprxienxacwrsfp prod
# Fills services/api/.env.<env> (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) and apps/product/.env.<env>
# (EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY) from the Supabase CLI, creating the files
# from the examples if needed. Prints key names and lengths only; the service role key is never echoed.
set -euo pipefail
REF="${1:?project ref}"
ENVNAME="${2:?env name (dev|prod)}"
cd "$(dirname "$0")/.."

API_ENV="services/api/.env.$ENVNAME"
APP_ENV="apps/product/.env.$ENVNAME"
[ -f "$API_ENV" ] || cp services/api/.env.example "$API_ENV"
[ -f "$APP_ENV" ] || cp apps/product/.env.example "$APP_ENV"

keys="$(npx --no-install supabase projects api-keys --project-ref "$REF" -o json)"

python3 - "$REF" "$API_ENV" "$APP_ENV" <<'PY' "$keys"
import json, re, sys
ref, api_env, app_env, raw = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
rows = json.loads(raw)
by = {r.get("name"): r.get("api_key") for r in rows}
anon = by.get("anon") or ""
service = by.get("service_role") or ""
if not anon or not service:
    sys.exit("could not find anon/service_role keys in CLI output: " + ", ".join(by.keys()))
url = f"https://{ref}.supabase.co"
def put(path, pairs):
    s = open(path).read()
    for name, value in pairs:
        if re.search(rf"^{name}=.*$", s, flags=re.M):
            s = re.sub(rf"^{name}=.*$", f"{name}={value}", s, flags=re.M)
        else:
            s = s.rstrip("\n") + f"\n{name}={value}\n"
    open(path, "w").write(s)
env_name = api_env.rsplit(".", 1)[-1]
api_pairs = [("SUPABASE_URL", url), ("SUPABASE_SERVICE_ROLE_KEY", service)]
app_pairs = [("EXPO_PUBLIC_SUPABASE_URL", url), ("EXPO_PUBLIC_SUPABASE_ANON_KEY", anon)]
if env_name == "prod":
    api_pairs += [("APP_ENV", "prod"), ("APP_ORIGIN", "https://app.firstlineperform.com")]
    app_pairs += [("EXPO_PUBLIC_API_URL", "https://api.firstlineperform.com"), ("EXPO_PUBLIC_SITE_URL", "https://app.firstlineperform.com")]
put(api_env, api_pairs)
put(app_env, app_pairs)
print(f"{api_env}: SUPABASE_URL set, SUPABASE_SERVICE_ROLE_KEY set ({len(service)} chars)")
print(f"{app_env}: EXPO_PUBLIC_SUPABASE_URL set, EXPO_PUBLIC_SUPABASE_ANON_KEY set ({len(anon)} chars)")
PY
