-- 0035 Announcements: one plain email to account holders for service notices ("the site will be down
-- for updates tonight"), never marketing. Sent by an admin from Admin > Announcements through the API,
-- which writes a notifications row per recipient the way every other email is recorded; this table is
-- the send itself and its running tally. Written by the API only; admins read it under RLS.
create table if not exists public.broadcasts (
  id               uuid primary key default gen_random_uuid(),
  sent_by          uuid references public.profiles (id),
  audience         text not null check (audience in ('everyone','parents','mentors','admins','me')),
  subject          text not null,
  body             text not null,                          -- the plain text the admin typed
  recipient_count  int not null default 0,
  sent_count       int not null default 0,
  failed_count     int not null default 0,
  failures         jsonb not null default '[]'::jsonb,     -- [{email, error}], capped by the API
  body_hash        text,                                   -- sha256 of subject + body: the repeat check
  created_at       timestamptz not null default now(),
  finished_at      timestamptz                             -- null while a big send is still going out
);
create index if not exists broadcasts_created_idx on public.broadcasts (created_at desc);
create index if not exists broadcasts_hash_idx on public.broadcasts (body_hash, created_at desc);

alter table public.broadcasts enable row level security;
drop policy if exists broadcasts_admin_read on public.broadcasts;
create policy broadcasts_admin_read on public.broadcasts for select to authenticated using (public.is_admin());
revoke insert, update, delete on public.broadcasts from anon, authenticated;
