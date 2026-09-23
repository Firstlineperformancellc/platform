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
npx --no-install supabase db query --linked --project-ref "$REF" \
  "update public.profiles set role = 'admin' where lower(email) = lower('$safe') returning email, role" 2>&1 \
  | grep -E '"(email|role)"' | tr -d ' ,' | paste - - || true
npx --no-install supabase db query --linked --project-ref "$REF" \
  "insert into public.audit_log (actor_id, action, target_type, target_id, meta) select null, 'admin.grant', 'profile', id, jsonb_build_object('email', email, 'via', 'deploy/grant-admin.sh') from public.profiles where lower(email) = lower('$safe') and role = 'admin'" >/dev/null 2>&1 || true
echo "done; if nothing printed above, no account with that email exists yet"
