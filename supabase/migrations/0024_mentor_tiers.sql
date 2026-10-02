-- Mentor levels become data. Until now the three tiers (pro, pwhl, ncaa) were hard-wired into four
-- check constraints and three JSON maps on settings. This moves them into public.mentor_tiers, where
-- admins add, rename, order, hide, price and retire them, and adds the marketplace controls:
-- per-mentor "listed" and "featured", and what the mentor tiles show.

create table if not exists public.mentor_tiers (
  key                   text primary key check (key ~ '^[a-z0-9_]{2,40}$'),
  name                  text not null,
  description           text not null default '',
  sort                  int  not null default 100,           -- hierarchy: lower sorts first
  visible               boolean not null default true,       -- false = private: its mentors are not on the public marketplace
  price_visible         boolean not null default true,       -- false = "Please contact for pricing"; no self-serve checkout
  breakdown_price_cents int  not null default 0 check (breakdown_price_cents >= 0),
  mentor_share_pct      int  not null default 60 check (mentor_share_pct between 0 and 100),
  film_room_30_cents    int  check (film_room_30_cents >= 0),
  film_room_60_cents    int  check (film_room_60_cents >= 0),
  addon_30_cents        int  check (addon_30_cents >= 0),
  season_arc_cents      int  check (season_arc_cents >= 0),
  archived_at           timestamptz,                         -- retired: kept only so history keeps its label
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
drop trigger if exists mentor_tiers_updated on public.mentor_tiers;
create trigger mentor_tiers_updated before update on public.mentor_tiers for each row execute function public.set_updated_at();

-- seed from the prices in force today
insert into public.mentor_tiers (key, name, sort, breakdown_price_cents, mentor_share_pct, film_room_30_cents, film_room_60_cents, addon_30_cents, season_arc_cents)
select k,
       case k when 'pro' then 'Pro' when 'pwhl' then 'PWHL' when 'ncaa' then 'NCAA' else initcap(replace(k, '_', ' ')) end,
       case k when 'pro' then 10 when 'pwhl' then 20 when 'ncaa' then 30 else 100 end,
       coalesce((s.breakdown_prices ->> k)::int, 0),
       coalesce((s.mentor_share_pct ->> k)::int, 60),
       (s.session_prices -> 'film_room_30' ->> k)::int,
       (s.session_prices -> 'film_room_60' ->> k)::int,
       (s.session_prices -> 'addon_30' ->> k)::int,
       (s.session_prices -> 'season_arc' ->> k)::int
  from public.settings s, jsonb_object_keys(s.breakdown_prices) k
 where s.id = 1
on conflict (key) do nothing;
-- any tier already in use that the price map did not know about
insert into public.mentor_tiers (key, name)
  select distinct a.tier, initcap(replace(a.tier, '_', ' ')) from public.athletes a where a.tier is not null
on conflict (key) do nothing;

-- the fixed three-value checks go; a mentor's level must exist
alter table public.athletes      drop constraint if exists athletes_tier_check;
alter table public.orders        drop constraint if exists orders_tier_check;
alter table public.sessions      drop constraint if exists sessions_tier_check;
alter table public.session_packs drop constraint if exists session_packs_tier_check;
alter table public.athletes drop constraint if exists athletes_tier_fkey;
alter table public.athletes add constraint athletes_tier_fkey foreign key (tier) references public.mentor_tiers (key) on update cascade on delete restrict;

-- per-mentor marketplace controls (admin only, see the guard below)
alter table public.athletes
  add column if not exists listed   boolean not null default true,
  add column if not exists featured boolean not null default false;

-- what the mentor tiles show, and how the marketplace is ordered
alter table public.settings
  add column if not exists marketplace jsonb not null default
    '{"show_price":true,"show_rating":true,"show_turnaround":true,"show_availability":true,"show_badges":true,"show_positions":true,"show_bio":true,"group_by_tier":false,"sort":"tier"}'::jsonb;

-- the table itself is admin-only; everyone else reads the view below
alter table public.mentor_tiers enable row level security;
drop policy if exists mentor_tiers_admin_read on public.mentor_tiers;
create policy mentor_tiers_admin_read on public.mentor_tiers for select to authenticated using (public.is_admin());

create or replace function public.my_tier() returns text
language sql stable security definer set search_path = public as $$
  select a.tier from public.athletes a where a.user_id = auth.uid()
$$;

-- Public face of the levels: only visible, live levels (plus a mentor's own), and no prices where the
-- level says "contact for pricing". Owner-rights view, like marketplace_mentors.
create or replace view public.mentor_tiers_public as
  select t.key, t.name, t.description, t.sort, t.price_visible,
         case when t.price_visible then t.breakdown_price_cents end as breakdown_price_cents,
         case when t.price_visible then t.film_room_30_cents end    as film_room_30_cents,
         case when t.price_visible then t.film_room_60_cents end    as film_room_60_cents,
         case when t.price_visible then t.addon_30_cents end        as addon_30_cents,
         case when t.price_visible then t.season_arc_cents end      as season_arc_cents
    from public.mentor_tiers t
   where t.archived_at is null and (t.visible or t.key = public.my_tier());
alter view public.mentor_tiers_public set (security_invoker = false);
grant select on public.mentor_tiers_public to anon, authenticated;

-- only an admin may list, unlist or feature a mentor
create or replace function public.guard_athlete_admin_fields() returns trigger
language plpgsql as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.verified is distinct from old.verified or new.blocked_at is distinct from old.blocked_at
       or new.deleted_at is distinct from old.deleted_at then
      raise exception 'only an admin can change verification or block state';
    end if;
    if new.listed is distinct from old.listed or new.featured is distinct from old.featured then
      raise exception 'marketplace listing is managed by FLP';
    end if;
    if old.status = 'approved' and new.tier is distinct from old.tier then
      raise exception 'tier changes after approval go through an admin';
    end if;
    if new.stripe_account_id is distinct from old.stripe_account_id then
      raise exception 'the payout account is managed by FLP';
    end if;
    if new.video_media_id is distinct from old.video_media_id and new.video_media_id is not null
       and not exists (select 1 from public.media m where m.id = new.video_media_id and m.owner_id = auth.uid() and m.purpose = 'intro_video') then
      raise exception 'the intro video must be your own upload';
    end if;
    if new.photo_media_id is distinct from old.photo_media_id and new.photo_media_id is not null
       and not exists (select 1 from public.media m where m.id = new.photo_media_id and m.owner_id = auth.uid()) then
      raise exception 'the profile photo must be your own upload';
    end if;
  end if;
  return new;
end $$;

-- The marketplace: approved, listed mentors on a visible, live level. Owner-rights view (anonymous
-- visitors read it); new columns are appended.
create or replace view public.marketplace_mentors as
  select a.user_id, a.slug, a.display_name, a.tier, a.highest_level, a.current_team, a.badges,
         a.positions, a.specialties, a.bio, a.photo_media_id, a.photo_path, a.video_media_id,
         v.mux_playback_id as video_playback_id,
         a.capacity_on_deck,
         coalesce(s.jobs_on_deck, 0::bigint) as jobs_on_deck,
         coalesce(s.jobs_on_deck, 0::bigint) < a.capacity_on_deck as available,
         s.avg_turnaround_hours, s.avg_rating, s.rating_count, s.jobs_completed, s.sessions_completed,
         a.eliteprospects_url,
         t.name as tier_name, t.sort as tier_sort, t.price_visible, t.description as tier_description, a.featured
    from public.athletes a
    join public.mentor_tiers t on t.key = a.tier
    left join public.mentor_stats s on s.athlete_id = a.user_id
    left join public.media v on v.id = a.video_media_id and v.status = 'ready'::public.media_status
   where a.status = 'approved' and a.blocked_at is null and a.deleted_at is null
     and a.listed and t.visible and t.archived_at is null;
alter view public.marketplace_mentors set (security_invoker = false);
grant select on public.marketplace_mentors to anon, authenticated;
