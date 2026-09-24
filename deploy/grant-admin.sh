#!/usr/bin/env bash
# Promote an existing account to admin on a Supabase project (the first admin seat; later seats
# are granted from the admin panel). The person signs up as a parent first and confirms their email.
# Usage: deploy/grant-admin.sh <project-ref> <email>
#   prod: deploy/grant-admin.sh sbvojmprxienxacwrsfp someone@firstlineperform.com
set -euo pipefail
REF="${1:?project ref}"
EMAIL="${2:?email}"
cd "$(dirname "$0")/.."
safe="$(printf "%s" "$EMAIL" | tr -d "'\\\\")"
npx --no-install supabase db query --linked --project-ref "$REF" -o json \
  "update public.profiles set role = 'admin' where lower(email) = lower('$safe') returning email, role" 2>&1 \
  | python3 -c 'import json,sys
raw=sys.stdin.read(); i=min([k for k in (raw.find("{"), raw.find("[")) if k>=0] or [-1])
try:
    rows=(lambda d: d if isinstance(d,list) else d.get("rows"))(json.JSONDecoder().raw_decode(raw[i:])[0]) or []
    print("  " + ", ".join(r["email"] + " -> " + r["role"] for r in rows) if rows else "  no account with that email yet")
except Exception: print("  (could not parse the result)")'
npx --no-install supabase db query --linked --project-ref "$REF" -o json \
  "insert into public.audit_log (actor_id, action, target_type, target_id, meta) select null, 'admin.grant', 'profile', id, jsonb_build_object('email', email, 'via', 'deploy/grant-admin.sh') from public.profiles where lower(email) = lower('$safe') and role = 'admin'" >/dev/null 2>&1 || true
