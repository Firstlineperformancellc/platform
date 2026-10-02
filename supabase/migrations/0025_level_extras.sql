-- Level extras: direct-link (unlisted but bookable) levels, per-level turnaround and capacity,
-- a level colour for the tiles, per-mentor price overrides, and a history of level changes.

alter table public.mentor_tiers
  add column if not exists direct_link      boolean not null default false,              -- private, but its mentors can be ordered through their profile link
  add column if not exists turnaround_hours int check (turnaround_hours between 1 and 720),   -- null = the platform rule
  add column if not exists capacity_default int check (capacity_default between 1 and 20),    -- jobs on deck a mentor starts with on this level
  add column if not exists color            text check (color ~ '^#[0-9a-fA-F]{6}$');

-- One mentor priced differently from their level: {breakdown, film_room_30, film_room_60, addon_30, season_arc} in cents.
alter table public.athletes add column if not exists price_overrides jsonb not null default '{}'::jsonb;

create table if not exists public.mentor_tier_history (
  id          uuid primary key default gen_random_uuid(),
  athlete_id  uuid not null references public.athletes (user_id) on delete cascade,
  from_tier   text,
  to_tier     text,
  changed_by  uuid references public.profiles (id) on delete set null,
  changed_at  timestamptz not null default now()
);
create index if not exists mentor_tier_history_athlete_idx on public.mentor_tier_history (athlete_id, changed_at desc);
alter table public.mentor_tier_history enable row level security;
drop policy if exists mentor_tier_history_admin_read on public.mentor_tier_history;
create policy mentor_tier_history_admin_read on public.mentor_tier_history for select to authenticated using (public.is_admin());

-- price overrides are FLP's to set
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
    if new.price_overrides is distinct from old.price_overrides then
      raise exception 'pricing is managed by FLP';
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

-- Public face of the levels: live levels that are visible, direct-link, or the viewer's own.
create or replace view public.mentor_tiers_public as
  select t.key, t.name, t.description, t.sort, t.price_visible,
         case when t.price_visible then t.breakdown_price_cents end as breakdown_price_cents,
         case when t.price_visible then t.film_room_30_cents end    as film_room_30_cents,
         case when t.price_visible then t.film_room_60_cents end    as film_room_60_cents,
         case when t.price_visible then t.addon_30_cents end        as addon_30_cents,
         case when t.price_visible then t.season_arc_cents end      as season_arc_cents,
         t.visible, t.color, t.turnaround_hours
    from public.mentor_tiers t
   where t.archived_at is null and (t.visible or t.direct_link or t.key = public.my_tier());
alter view public.mentor_tiers_public set (security_invoker = false);
grant select on public.mentor_tiers_public to anon, authenticated;

-- The marketplace: approved, listed mentors on a live level that is visible or direct-link.
-- in_listing says whether the mentor belongs in the browsable list; direct-link mentors are found by
-- their profile link only. Prices are the mentor's own where FLP set one, else the level's.
create or replace view public.marketplace_mentors as
  select a.user_id, a.slug, a.display_name, a.tier, a.highest_level, a.current_team, a.badges,
         a.positions, a.specialties, a.bio, a.photo_media_id, a.photo_path, a.video_media_id,
         v.mux_playback_id as video_playback_id,
         a.capacity_on_deck,
         coalesce(s.jobs_on_deck, 0::bigint) as jobs_on_deck,
         coalesce(s.jobs_on_deck, 0::bigint) < a.capacity_on_deck as available,
         s.avg_turnaround_hours, s.avg_rating, s.rating_count, s.jobs_completed, s.sessions_completed,
         a.eliteprospects_url,
         t.name as tier_name, t.sort as tier_sort, t.price_visible, t.description as tier_description, a.featured,
         t.visible as in_listing,
         t.color as tier_color,
         coalesce(t.turnaround_hours, (select (st.rules ->> 'turnaround_hours')::int from public.settings st where st.id = 1)) as turnaround_hours,
         case when t.price_visible then coalesce((a.price_overrides ->> 'breakdown')::int,    t.breakdown_price_cents) end as breakdown_cents,
         case when t.price_visible then coalesce((a.price_overrides ->> 'film_room_30')::int, t.film_room_30_cents) end    as film_room_30_cents,
         case when t.price_visible then coalesce((a.price_overrides ->> 'film_room_60')::int, t.film_room_60_cents) end    as film_room_60_cents,
         case when t.price_visible then coalesce((a.price_overrides ->> 'addon_30')::int,     t.addon_30_cents) end        as addon_30_cents,
         case when t.price_visible then coalesce((a.price_overrides ->> 'season_arc')::int,   t.season_arc_cents) end      as season_arc_cents
    from public.athletes a
    join public.mentor_tiers t on t.key = a.tier
    left join public.mentor_stats s on s.athlete_id = a.user_id
    left join public.media v on v.id = a.video_media_id and v.status = 'ready'::public.media_status
   where a.status = 'approved' and a.blocked_at is null and a.deleted_at is null
     and a.listed and t.archived_at is null and (t.visible or t.direct_link);
alter view public.marketplace_mentors set (security_invoker = false);
grant select on public.marketplace_mentors to anon, authenticated;
