#!/usr/bin/env bash
# Apply every migration in supabase/migrations to a Supabase project, in order, skipping the ones
# already recorded in supabase_migrations.schema_migrations. Also creates the storage buckets the
# API expects. Uses the Supabase CLI's Management API session (no database password).
# Usage: deploy/migrate.sh <project-ref>
#   dev:  deploy/migrate.sh uspbmbvoxotbelribjgo
#   prod: deploy/migrate.sh sbvojmprxienxacwrsfp
set -euo pipefail
REF="${1:?project ref}"
cd "$(dirname "$0")/.."
q() { npx --no-install supabase db query --linked --project-ref "$REF" "$@"; }

echo "▸ project $REF"
q "create schema if not exists supabase_migrations; create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text)" >/dev/null
applied="$(q "select string_agg(version, ' ') as v from supabase_migrations.schema_migrations" 2>/dev/null | python3 -c 'import json,sys
raw=sys.stdin.read(); i=raw.find("{")
try:
    d=json.loads(raw[i:]) if i>=0 else {}; print((d.get("rows") or [{}])[0].get("v") or "")
except Exception: print("")')"
[ -n "$applied" ] || { echo "could not read the applied-migrations list; refusing to guess"; exit 1; }

for f in supabase/migrations/*.sql; do
  v="$(basename "$f" | cut -d_ -f1)"
  n="$(basename "$f" .sql | cut -d_ -f2-)"
  if [[ " $applied " == *" $v "* ]]; then echo "  = $v $n (already applied)"; continue; fi
  out="$(q -f "$f" 2>&1)" || true
  if echo "$out" | grep -qiE '"error"|ERROR:|failed'; then
    echo "  ✗ $v $n"; echo "$out" | head -8; exit 1
  fi
  q "insert into supabase_migrations.schema_migrations (version, name) values ('$v', '$n') on conflict do nothing" >/dev/null
  echo "  + $v $n"
done

echo "▸ storage buckets"
q "insert into storage.buckets (id, name, public) values ('worksheets','worksheets',false) on conflict (id) do nothing; insert into storage.buckets (id, name, public) values ('avatars','avatars',true) on conflict (id) do nothing" >/dev/null
echo "▸ verify"
q "select (select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE') as tables, (select count(*) from pg_policies where schemaname='public') as policies, (select count(*) from supabase_migrations.schema_migrations) as migrations, (select count(*) from storage.buckets) as buckets" 2>&1 | grep -E '"(tables|policies|migrations|buckets)"' | tr -d ' ,' | paste - - - -
