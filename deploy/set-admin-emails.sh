#!/usr/bin/env bash
# Set the admin allowlist on a project and promote any of those accounts that already exist.
# Usage: deploy/set-admin-emails.sh <project-ref> <email> [<email>...]
#   prod: deploy/set-admin-emails.sh sbvojmprxienxacwrsfp alex@firstlineperform.com bryan@firstlineperform.com
set -euo pipefail
REF="${1:?project ref}"; shift
[ "$#" -ge 1 ] || { echo "give at least one email"; exit 1; }
cd "$(dirname "$0")/.."
list="$(python3 -c 'import json,sys; print(json.dumps([e.strip().lower() for e in sys.argv[1:]]))' "$@")"
safe="${list//\'/}"
q() { npx --no-install supabase db query --linked --project-ref "$REF" "$1"; }
q "update public.settings set admin_emails = '$safe'::jsonb where id = 1" >/dev/null
q "update public.profiles p set role = 'admin' where lower(p.email) in (select lower(e) from jsonb_array_elements_text('$safe'::jsonb) e) and p.role <> 'admin'" >/dev/null
q "insert into public.audit_log (actor_id, action, target_type, target_id, meta) select null, 'admin.allowlist', 'settings', null, jsonb_build_object('emails', '$safe'::jsonb, 'via', 'deploy/set-admin-emails.sh')" >/dev/null
echo "allowlist on $REF: $list"
q "select p.email, p.role from public.profiles p where lower(p.email) in (select lower(e) from jsonb_array_elements_text('$safe'::jsonb) e)" 2>/dev/null \
  2>&1 | python3 -c 'import json,sys
raw=sys.stdin.read(); i=raw.find("{")
rows=(json.JSONDecoder().raw_decode(raw[i:])[0].get("rows") if i>=0 else None) or []
print("existing accounts promoted:", ", ".join(r["email"] + " (" + r["role"] + ")" for r in rows) if rows else "none yet; they become admins when they sign up")'
