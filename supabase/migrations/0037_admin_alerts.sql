-- U-04 (review session, 2026-10-24): an email to the admins when a parent account is created, and a
-- switch per admin for each kind of alert. admin_alerts is an object keyed by alert type
-- (new_accounts, support, money, health, no_shows, presents) with true/false values; a missing key
-- means on. An admin edits only their own row, which profiles_update already allows, and
-- guard_profile_role keeps role, email and account state out of reach, so no new policy is needed.
-- signup_alerted_at marks the parents the admins have already heard about; the API tick stamps it.

alter table public.profiles add column if not exists admin_alerts jsonb not null default '{}';
alter table public.profiles add column if not exists signup_alerted_at timestamptz;

-- The shape the app saves: known keys only, each true or false.
create or replace function public.admin_alerts_ok(v jsonb) returns boolean
language sql immutable as $$
  select jsonb_typeof(v) = 'object'
     and not exists (
       select 1 from jsonb_each(v) kv
        where kv.key not in ('new_accounts', 'support', 'money', 'health', 'no_shows', 'presents')
           or jsonb_typeof(kv.value) <> 'boolean');
$$;
alter table public.profiles drop constraint if exists profiles_admin_alerts_shape;
alter table public.profiles add constraint profiles_admin_alerts_shape check (public.admin_alerts_ok(admin_alerts));

-- What the tick asks every five minutes: parents not yet announced.
create index if not exists profiles_signup_alert_idx on public.profiles (created_at) where role = 'parent' and signup_alerted_at is null;
