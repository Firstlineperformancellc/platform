-- U-19 (2026-09-27 review spec): a mentor's career history on their profile. The mentor enters the
-- rows (with a paste-and-parse helper in the app); nothing is fetched from Elite Prospects. FLP owns
-- the rows; `source` leaves room for an API adapter later. Public reads go through a view with
-- security_invoker OFF, the same pattern and the same caution as marketplace_mentors.

alter table public.athletes
  add column if not exists awards text[] not null default '{}',
  add column if not exists career_note text;
alter table public.athletes drop constraint if exists athletes_career_len;
alter table public.athletes add constraint athletes_career_len check (
  (career_note is null or char_length(career_note) <= 120)
  and coalesce(array_length(awards, 1), 0) <= 20);

create table if not exists public.mentor_career (
  id          uuid primary key default gen_random_uuid(),
  athlete_id  uuid not null references public.athletes (user_id) on delete cascade,
  season      text not null check (season ~ '^\d{4}(-\d{2})?$'),
  team        text not null check (char_length(team) between 1 and 80),
  league      text check (league is null or char_length(league) <= 60),
  games       int check (games is null or games between 0 and 200),
  goals       int check (goals is null or goals between 0 and 500),
  assists     int check (assists is null or assists between 0 and 500),
  points      int check (points is null or points between 0 and 1000),
  pim         int check (pim is null or pim between 0 and 1000),
  gaa         numeric(5,2) check (gaa is null or gaa between 0 and 20),
  sv_pct      numeric(5,3) check (sv_pct is null or sv_pct between 0 and 1),
  sort_order  int not null default 0,
  visible     boolean not null default true,
  source      text not null default 'mentor' check (source in ('mentor', 'ep_api')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists mentor_career_athlete on public.mentor_career (athlete_id, sort_order);
drop trigger if exists mentor_career_updated on public.mentor_career;
create trigger mentor_career_updated before update on public.mentor_career
  for each row execute function public.set_updated_at();

alter table public.mentor_career enable row level security;
drop policy if exists mentor_career_own on public.mentor_career;
create policy mentor_career_own on public.mentor_career for all to authenticated
  using (athlete_id = auth.uid() or public.is_admin()) with check (athlete_id = auth.uid() or public.is_admin());

-- 40 seasons per mentor, enforced here as well as at the API.
create or replace function public.guard_mentor_career_cap() returns trigger language plpgsql as $$
begin
  if (select count(*) from public.mentor_career where athlete_id = new.athlete_id) >= 40 then
    raise exception 'a mentor can list at most 40 seasons';
  end if;
  return new;
end $$;
drop trigger if exists mentor_career_cap on public.mentor_career;
create trigger mentor_career_cap before insert on public.mentor_career
  for each row execute function public.guard_mentor_career_cap();

-- One atomic replace, called by the API with validated rows: everything or nothing.
create or replace function public.replace_mentor_career(p_athlete uuid, p_rows jsonb, p_awards text[], p_note text)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.mentor_career where athlete_id = p_athlete;
  insert into public.mentor_career (athlete_id, season, team, league, games, goals, assists, points, pim, gaa, sv_pct, sort_order, visible)
  select p_athlete, r ->> 'season', r ->> 'team', nullif(r ->> 'league', ''),
         (r ->> 'games')::int, (r ->> 'goals')::int, (r ->> 'assists')::int, (r ->> 'points')::int, (r ->> 'pim')::int,
         (r ->> 'gaa')::numeric, (r ->> 'sv_pct')::numeric, ord - 1, coalesce((r ->> 'visible')::boolean, true)
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) with ordinality as x(r, ord);
  update public.athletes set awards = coalesce(p_awards, '{}'), career_note = nullif(p_note, '') where user_id = p_athlete;
end $$;
revoke all on function public.replace_mentor_career(uuid, jsonb, text[], text) from public, anon, authenticated;

-- Public read: visible rows of mentors the marketplace lists. security_invoker stays OFF.
create or replace view public.mentor_career_public as
  select c.id, c.athlete_id, c.season, c.team, c.league, c.games, c.goals, c.assists, c.points, c.pim, c.gaa, c.sv_pct, c.sort_order
    from public.mentor_career c
    join public.athletes a on a.user_id = c.athlete_id
    join public.mentor_tiers t on t.key = a.tier
   where c.visible and a.status = 'approved' and a.blocked_at is null and a.deleted_at is null
     and a.listed and t.archived_at is null and (t.visible or t.direct_link);
alter view public.mentor_career_public set (security_invoker = false);
grant select on public.mentor_career_public to anon, authenticated;

-- marketplace_mentors, recreated from 0031 with awards and career_note appended at the end.
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
         case when t.price_visible then coalesce((a.price_overrides ->> 'season_arc')::int,   t.season_arc_cents) end      as season_arc_cents,
         a.teaching_focus, a.who_i_help,
         a.awards, a.career_note
    from public.athletes a
    join public.mentor_tiers t on t.key = a.tier
    left join public.mentor_stats s on s.athlete_id = a.user_id
    left join public.media v on v.id = a.video_media_id and v.status = 'ready'::public.media_status
   where a.status = 'approved' and a.blocked_at is null and a.deleted_at is null
     and a.listed and t.archived_at is null and (t.visible or t.direct_link);
alter view public.marketplace_mentors set (security_invoker = false);
grant select on public.marketplace_mentors to anon, authenticated;
