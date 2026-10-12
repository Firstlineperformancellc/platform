-- Delete a mentor so they can start over with the same email and phone, while keeping a full record
-- that an admin can look up and restore. The live account is wiped (name, email, phone, address)
-- and hidden; everything it had at the moment of deletion is stored here. Written by the API only.
create table if not exists public.deleted_accounts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.profiles (id) on delete set null,  -- the wiped account (kept for history)
  role        public.user_role not null,
  email       text not null,
  full_name   text,
  phone       text,
  display_name text,
  snapshot    jsonb not null,           -- profile, mentor row, application answers, sign-in details
  reason      text,
  deleted_by  uuid references public.profiles (id) on delete set null,
  deleted_at  timestamptz not null default now(),
  restored_at timestamptz,
  restored_by uuid references public.profiles (id) on delete set null
);
create index if not exists deleted_accounts_email on public.deleted_accounts (lower(email));
create index if not exists deleted_accounts_user on public.deleted_accounts (user_id);

alter table public.deleted_accounts enable row level security;
drop policy if exists deleted_accounts_admin_read on public.deleted_accounts;
create policy deleted_accounts_admin_read on public.deleted_accounts for select to authenticated using (public.is_admin());
revoke insert, update, delete on public.deleted_accounts from anon, authenticated;
