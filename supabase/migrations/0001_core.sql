-- FLP platform — schema v1: core entities and row-level security.
-- Applied to the dev project first; production gets the same file at promotion.
-- Open product decisions are parameterized in public.settings rather than hard-coded.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.user_role      as enum ('parent', 'athlete', 'admin');
create type public.position       as enum ('forward', 'defense', 'goalie');
create type public.athlete_status as enum ('applied', 'approved', 'suspended');
create type public.order_status   as enum ('draft', 'paid', 'assigned', 'in_review', 'delivered', 'closed', 'refunded');
create type public.job_status     as enum ('open', 'claimed', 'delivered', 'closed', 'expired');
create type public.media_purpose  as enum ('game_film', 'breakdown', 'session_recording', 'profile_photo');
create type public.media_source   as enum ('upload', 'youtube');
create type public.media_status   as enum ('pending', 'uploading', 'processing', 'ready', 'errored');
create type public.session_status as enum ('requested', 'scheduled', 'in_progress', 'completed', 'cancelled', 'no_show');
create type public.payout_status  as enum ('pending', 'paid', 'failed');
create type public.assignment_mode as enum ('pool', 'matched', 'parent_picks');

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Settings (single row): pricing and behaviour FLP controls without a deploy
-- ---------------------------------------------------------------------------
create table public.settings (
  id                     int primary key default 1 check (id = 1),
  assignment_mode        public.assignment_mode not null default 'pool',
  breakdown_price_cents  int not null default 27900,
  breakdown_payout_cents int not null default 8500,
  session_price_cents    int not null default 0,
  session_payout_cents   int not null default 0,
  session_minutes        int not null default 30,
  job_due_hours          int not null default 48,
  currency               text not null default 'usd',
  updated_at             timestamptz not null default now()
);
insert into public.settings (id) values (1);

-- ---------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  role        public.user_role not null default 'parent',
  full_name   text not null default '',
  email       text not null,
  phone       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger profiles_updated before update on public.profiles for each row execute function public.set_updated_at();

-- A player belongs to a parent and is never a login.
create table public.players (
  id           uuid primary key default gen_random_uuid(),
  parent_id    uuid not null references public.profiles (id) on delete cascade,
  first_name   text not null,
  last_name    text not null default '',
  age_group    text not null,            -- e.g. 14U; list supplied by FLP
  position     public.position not null,
  skill_level  text not null,            -- e.g. AAA; list supplied by FLP
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index players_parent_idx on public.players (parent_id);
create trigger players_updated before update on public.players for each row execute function public.set_updated_at();

create table public.athletes (
  user_id            uuid primary key references public.profiles (id) on delete cascade,
  slug               text not null unique,
  display_name       text not null,
  photo_media_id     uuid,                                  -- fk added after media exists
  bio                text not null default '',
  credentials        jsonb not null default '[]'::jsonb,   -- [{label, org, years}]
  specialties        text[] not null default '{}',
  positions          public.position[] not null default '{}',
  status             public.athlete_status not null default 'applied',
  stripe_account_id  text unique,
  payouts_enabled    boolean not null default false,
  approved_at        timestamptz,
  approved_by        uuid references public.profiles (id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create trigger athletes_updated before update on public.athletes for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Media: a Mux asset (or a YouTube link) owned by someone, for a purpose
-- ---------------------------------------------------------------------------
create table public.media (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references public.profiles (id) on delete cascade,
  purpose          public.media_purpose not null,
  source           public.media_source not null default 'upload',
  status           public.media_status not null default 'pending',
  mux_upload_id    text unique,
  mux_asset_id     text unique,
  mux_playback_id  text,
  youtube_url      text,
  duration_seconds numeric,
  title            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint media_source_shape check (
    (source = 'youtube' and youtube_url is not null) or (source = 'upload')
  )
);
create index media_owner_idx on public.media (owner_id);
create trigger media_updated before update on public.media for each row execute function public.set_updated_at();
alter table public.athletes add constraint athletes_photo_fk foreign key (photo_media_id) references public.media (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Orders and jobs
-- ---------------------------------------------------------------------------
create table public.orders (
  id                          uuid primary key default gen_random_uuid(),
  parent_id                   uuid not null references public.profiles (id) on delete restrict,
  player_id                   uuid not null references public.players (id) on delete restrict,
  position                    public.position not null,
  age_group                   text not null,
  skill_level                 text not null,
  focus_areas                 text[] not null default '{}',
  notes                       text not null default '',
  preferred_athlete_id        uuid references public.athletes (user_id),   -- set by a booking link
  film_media_id               uuid references public.media (id),
  price_cents                 int not null,
  currency                    text not null default 'usd',
  stripe_checkout_session_id  text unique,
  stripe_payment_intent_id    text unique,
  status                      public.order_status not null default 'draft',
  paid_at                     timestamptz,
  refunded_at                 timestamptz,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);
create index orders_parent_idx on public.orders (parent_id);
create index orders_status_idx on public.orders (status);
create trigger orders_updated before update on public.orders for each row execute function public.set_updated_at();

-- One job per paid order. Reassignment history is kept in audit_log.
create table public.jobs (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null unique references public.orders (id) on delete cascade,
  athlete_id    uuid references public.athletes (user_id),
  status        public.job_status not null default 'open',
  claimed_at    timestamptz,
  due_at        timestamptz,
  delivered_at  timestamptz,
  closed_at     timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint jobs_claimed_shape check (
    (status = 'open' and athlete_id is null) or (status <> 'open' and athlete_id is not null)
  )
);
create index jobs_athlete_idx on public.jobs (athlete_id);
create index jobs_status_idx on public.jobs (status);
create trigger jobs_updated before update on public.jobs for each row execute function public.set_updated_at();

create table public.breakdowns (
  id            uuid primary key default gen_random_uuid(),
  job_id        uuid not null unique references public.jobs (id) on delete cascade,
  media_id      uuid not null references public.media (id),
  takeaways     text not null default '',
  drills        text not null default '',
  rating        int check (rating between 1 and 5),
  review        text,
  reviewed_at   timestamptz,
  delivered_at  timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create trigger breakdowns_updated before update on public.breakdowns for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Live mentoring sessions: booked by the parent, always recorded
-- ---------------------------------------------------------------------------
create table public.sessions (
  id                  uuid primary key default gen_random_uuid(),
  athlete_id          uuid not null references public.athletes (user_id),
  parent_id           uuid not null references public.profiles (id),
  player_id           uuid not null references public.players (id),
  status              public.session_status not null default 'requested',
  scheduled_at        timestamptz,
  duration_minutes    int not null default 30,
  price_cents         int not null default 0,
  stripe_payment_intent_id text unique,
  daily_room_name     text unique,
  recording_media_id  uuid references public.media (id),
  parent_joined_at    timestamptz,
  athlete_joined_at   timestamptz,
  ended_at            timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index sessions_athlete_idx on public.sessions (athlete_id);
create index sessions_parent_idx on public.sessions (parent_id);
create trigger sessions_updated before update on public.sessions for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Money out, notifications, audit
-- ---------------------------------------------------------------------------
create table public.payouts (
  id                  uuid primary key default gen_random_uuid(),
  athlete_id          uuid not null references public.athletes (user_id),
  job_id              uuid references public.jobs (id),
  session_id          uuid references public.sessions (id),
  amount_cents        int not null,
  currency            text not null default 'usd',
  stripe_transfer_id  text unique,
  status              public.payout_status not null default 'pending',
  created_at          timestamptz not null default now(),
  paid_at             timestamptz,
  constraint payouts_one_source check ((job_id is null) <> (session_id is null))
);
create index payouts_athlete_idx on public.payouts (athlete_id);

create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  channel     text not null check (channel in ('email', 'push')),
  template    text not null,
  payload     jsonb not null default '{}'::jsonb,
  sent_at     timestamptz,
  error       text,
  created_at  timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

create table public.audit_log (
  id           bigint generated always as identity primary key,
  actor_id     uuid references public.profiles (id),
  action       text not null,          -- e.g. athlete.approve, job.reassign, order.refund
  target_type  text not null,
  target_id    uuid,
  meta         jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index audit_target_idx on public.audit_log (target_type, target_id);

-- ---------------------------------------------------------------------------
-- New auth user -> profile row (role defaults to parent; athletes apply)
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
create or replace function public.my_role() returns public.user_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;
create or replace function public.is_admin() returns boolean
language sql stable as $$ select public.my_role() = 'admin' $$;
create or replace function public.is_approved_athlete() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.athletes where user_id = auth.uid() and status = 'approved')
$$;

alter table public.settings      enable row level security;
alter table public.profiles      enable row level security;
alter table public.players       enable row level security;
alter table public.athletes      enable row level security;
alter table public.media         enable row level security;
alter table public.orders        enable row level security;
alter table public.jobs          enable row level security;
alter table public.breakdowns    enable row level security;
alter table public.sessions      enable row level security;
alter table public.payouts       enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_log     enable row level security;

-- settings: everyone signed in can read prices; only admins change them
create policy settings_read  on public.settings for select to authenticated using (true);
create policy settings_admin on public.settings for update to authenticated using (public.is_admin());

-- profiles: you see yourself; admins see everyone; role changes are admin-only (enforced by trigger below)
create policy profiles_self   on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid() or public.is_admin());
create or replace function public.guard_profile_role() returns trigger
language plpgsql as $$
begin
  if new.role is distinct from old.role and not public.is_admin() then
    raise exception 'only an admin can change a role';
  end if;
  return new;
end $$;
create trigger profiles_role_guard before update on public.profiles for each row execute function public.guard_profile_role();

-- players: the parent owns them; admins see all; an athlete sees a player only through a job or session (read-only)
create policy players_parent on public.players for all to authenticated
  using (parent_id = auth.uid() or public.is_admin()) with check (parent_id = auth.uid() or public.is_admin());
create policy players_athlete_read on public.players for select to authenticated using (
  exists (select 1 from public.orders o join public.jobs j on j.order_id = o.id where o.player_id = players.id and j.athlete_id = auth.uid())
  or exists (select 1 from public.sessions s where s.player_id = players.id and s.athlete_id = auth.uid())
);

-- athletes: approved profiles are public (booking links); an athlete edits their own; admins everything
create policy athletes_public_read on public.athletes for select to anon, authenticated using (status = 'approved' or user_id = auth.uid() or public.is_admin());
create policy athletes_self_insert on public.athletes for insert to authenticated with check (user_id = auth.uid());
create policy athletes_self_update on public.athletes for update to authenticated using (user_id = auth.uid() or public.is_admin());
create or replace function public.guard_athlete_status() returns trigger
language plpgsql as $$
begin
  if (new.status is distinct from old.status or new.approved_at is distinct from old.approved_at
      or new.payouts_enabled is distinct from old.payouts_enabled) and not public.is_admin() then
    raise exception 'only an admin can change athlete status';
  end if;
  return new;
end $$;
create trigger athletes_status_guard before update on public.athletes for each row execute function public.guard_athlete_status();

-- media: the owner; the athlete on the job it belongs to; the parent of the order a breakdown was delivered to; admins
create policy media_owner on public.media for all to authenticated
  using (owner_id = auth.uid() or public.is_admin()) with check (owner_id = auth.uid() or public.is_admin());
create policy media_job_read on public.media for select to authenticated using (
  exists (select 1 from public.orders o join public.jobs j on j.order_id = o.id where o.film_media_id = media.id and j.athlete_id = auth.uid())
  or exists (select 1 from public.breakdowns b join public.jobs j on j.id = b.job_id join public.orders o on o.id = j.order_id where b.media_id = media.id and o.parent_id = auth.uid())
  or exists (select 1 from public.athletes a where a.photo_media_id = media.id and a.status = 'approved')
);

-- orders: the parent; the athlete holding the job (read); admins
create policy orders_parent on public.orders for all to authenticated
  using (parent_id = auth.uid() or public.is_admin()) with check (parent_id = auth.uid() or public.is_admin());
create policy orders_athlete_read on public.orders for select to authenticated using (
  exists (select 1 from public.jobs j where j.order_id = orders.id and j.athlete_id = auth.uid())
);

-- jobs: approved athletes see the open pool and their own; parents see the job on their order; admins all.
-- Claiming and state changes go through the API service (service role), not direct client writes.
create policy jobs_pool_read on public.jobs for select to authenticated using (
  (status = 'open' and public.is_approved_athlete())
  or athlete_id = auth.uid()
  or exists (select 1 from public.orders o where o.id = jobs.order_id and o.parent_id = auth.uid())
  or public.is_admin()
);
create policy jobs_admin_write on public.jobs for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- breakdowns: the delivering athlete writes; the parent reads and rates; admins all
create policy breakdowns_athlete on public.breakdowns for all to authenticated
  using (exists (select 1 from public.jobs j where j.id = breakdowns.job_id and j.athlete_id = auth.uid()) or public.is_admin())
  with check (exists (select 1 from public.jobs j where j.id = breakdowns.job_id and j.athlete_id = auth.uid()) or public.is_admin());
create policy breakdowns_parent_read on public.breakdowns for select to authenticated using (
  exists (select 1 from public.jobs j join public.orders o on o.id = j.order_id where j.id = breakdowns.job_id and o.parent_id = auth.uid())
);
create policy breakdowns_parent_rate on public.breakdowns for update to authenticated using (
  exists (select 1 from public.jobs j join public.orders o on o.id = j.order_id where j.id = breakdowns.job_id and o.parent_id = auth.uid())
);

-- sessions: parent and athlete on the session; admins all. Booking goes through the API service.
create policy sessions_party_read on public.sessions for select to authenticated
  using (parent_id = auth.uid() or athlete_id = auth.uid() or public.is_admin());
create policy sessions_admin_write on public.sessions for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- payouts: the athlete reads their own; admins all; writes only via service role
create policy payouts_athlete_read on public.payouts for select to authenticated using (athlete_id = auth.uid() or public.is_admin());

-- notifications: your own; admins all
create policy notifications_self on public.notifications for select to authenticated using (user_id = auth.uid() or public.is_admin());

-- audit: admins only
create policy audit_admin on public.audit_log for select to authenticated using (public.is_admin());
