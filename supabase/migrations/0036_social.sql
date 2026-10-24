-- U-25 (review session, 2026-10-24): social handles on mentor profiles. Bryan: "Put social handles on
-- the mentor." Instagram, TikTok, X and YouTube, stored as handles (never URLs) in one jsonb column;
-- the app builds the links. The tile shows them behind an admin switch (settings.marketplace.show_social),
-- the public page always does. No feed import.

alter table public.athletes add column if not exists social jsonb not null default '{}';

-- The shape the app saves: an object whose keys are the four networks and whose values are bare
-- handles. The app strips a leading @ and anything up to the last / before saving; this enforces the result.
create or replace function public.social_handles_ok(v jsonb) returns boolean
language sql immutable as $$
  select jsonb_typeof(v) = 'object'
     and not exists (
       select 1 from jsonb_each(v) kv
        where kv.key not in ('instagram', 'tiktok', 'x', 'youtube')
           or jsonb_typeof(kv.value) <> 'string'
           or (kv.value #>> '{}') !~ '^[A-Za-z0-9._-]{1,60}$');
$$;
alter table public.athletes drop constraint if exists athletes_social_shape;
alter table public.athletes add constraint athletes_social_shape check (public.social_handles_ok(social));

-- marketplace_mentors as defined in 0034, with a.social appended at the end of the select list.
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
         a.awards, a.career_note,
         (a.presents_enabled and a.presents_blocked_at is null and a.presents_price_cents is not null and public.presents_live()) as presents_enabled,
         case when a.presents_enabled and a.presents_blocked_at is null and public.presents_live() then a.presents_price_cents end as presents_price_cents,
         a.social
    from public.athletes a
    join public.mentor_tiers t on t.key = a.tier
    left join public.mentor_stats s on s.athlete_id = a.user_id
    left join public.media v on v.id = a.video_media_id and v.status = 'ready'::public.media_status
   where a.status = 'approved' and a.blocked_at is null and a.deleted_at is null and a.offers_mentoring
     and a.listed and t.archived_at is null and (t.visible or t.direct_link);
alter view public.marketplace_mentors set (security_invoker = false);
grant select on public.marketplace_mentors to anon, authenticated;
