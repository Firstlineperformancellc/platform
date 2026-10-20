-- 0034 First Line Presents hardening, from the pre-release review (2026-10-20).
--  1. Buyers read their requests through the API only (the table policy was wider than the API's shape).
--  2. The 18+ rule cannot be sidestepped: applicants cannot edit their own age or signature, and an
--     application with no recorded age is not eligible to offer Presents.
--  3. An athlete's delivery window cannot exceed the admin's maximum.
--  4. The admin's master switch empties the public views, so every surface follows it together.
--  5. One payout per request, enforced by the database.

-- 1. presents_requests: admins only, client-side.
drop policy if exists presents_buyer_read on public.presents_requests;
create policy presents_admin_read on public.presents_requests for select to authenticated using (public.is_admin());

-- 2. Applicants cannot rewrite the facts FLP approved them on.
create or replace function public.guard_application_update() returns trigger
language plpgsql as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.age is distinct from old.age then
      raise exception 'your age on file can only be changed by FLP';
    end if;
    if new.agreement_version is distinct from old.agreement_version or new.agreement_signed_name is distinct from old.agreement_signed_name
       or new.agreement_signed_at is distinct from old.agreement_signed_at or new.agreement_guardian_name is distinct from old.agreement_guardian_name then
      raise exception 'a signed agreement cannot be edited';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists athlete_applications_update_guard on public.athlete_applications;
create trigger athlete_applications_update_guard before update on public.athlete_applications
  for each row execute function public.guard_application_update();

-- 2 + 3. The athlete guard: no recorded age means no Presents; delivery days inside the admin maximum.
create or replace function public.guard_athlete_admin_fields() returns trigger
language plpgsql as $$
declare
  lo int;
  hi int;
  max_days int;
  known_age int;
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
    if new.tier is distinct from old.tier then
      raise exception 'only an FLP admin can change a mentor''s tier';
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
    if new.offers_mentoring is distinct from old.offers_mentoring then
      raise exception 'adding or removing mentoring goes through FLP';
    end if;
    if new.presents_blocked_at is distinct from old.presents_blocked_at then
      raise exception 'only an FLP admin can switch First Line Presents off for an athlete';
    end if;
    if new.presents_sample_media_id is distinct from old.presents_sample_media_id and new.presents_sample_media_id is not null
       and not exists (select 1 from public.media m where m.id = new.presents_sample_media_id and m.owner_id = auth.uid() and m.purpose::text in ('presents_sample', 'intro_video')) then
      raise exception 'the sample video must be your own upload';
    end if;
    if new.presents_enabled and not old.presents_enabled then
      select ap.age into known_age from public.athlete_applications ap where ap.user_id = new.user_id;
      if known_age is null then
        raise exception 'First Line Presents needs your age on file; ask FLP support to add it';
      end if;
      if known_age < 18 then
        raise exception 'First Line Presents is open to athletes 18 and over';
      end if;
    end if;
    if new.presents_price_cents is distinct from old.presents_price_cents and new.presents_price_cents is not null then
      select coalesce((st.rules ->> 'presents_min_cents')::int, 2000), coalesce((st.rules ->> 'presents_max_cents')::int, 50000)
        into lo, hi from public.settings st where st.id = 1;
      if new.presents_price_cents < lo or new.presents_price_cents > hi then
        raise exception 'the price must be between $% and $%', lo / 100, hi / 100;
      end if;
    end if;
    if new.presents_days is distinct from old.presents_days then
      select coalesce((st.rules ->> 'presents_max_days')::int, 7) into max_days from public.settings st where st.id = 1;
      if new.presents_days > max_days then
        raise exception 'the delivery window can be at most % days', max_days;
      end if;
    end if;
  end if;
  return new;
end $$;

-- 4. The master switch (settings.rules.presents_enabled, default on) empties both public views.
create or replace function public.presents_live() returns boolean
language sql stable as $$
  select coalesce((st.rules ->> 'presents_enabled')::boolean, true) from public.settings st where st.id = 1;
$$;

create or replace view public.presents_providers as
  select a.user_id, a.slug, a.display_name, a.photo_media_id, a.photo_path, a.highest_level, a.current_team,
         a.offers_mentoring, a.tier, t.name as tier_name, t.sort as tier_sort, a.eliteprospects_url,
         a.presents_price_cents as price_cents, a.presents_days as days, a.presents_occasions as occasions, a.presents_blurb as blurb,
         coalesce(sv.mux_playback_id, iv.mux_playback_id) as sample_playback_id,
         a.presents_open_limit as open_limit,
         (select count(*) from public.presents_requests r where r.athlete_id = a.user_id and r.status in ('open','flagged','in_review')) as open_requests,
         (a.presents_paused_until is not null and a.presents_paused_until > now()) as paused,
         ((a.presents_paused_until is null or a.presents_paused_until <= now())
           and (select count(*) from public.presents_requests r where r.athlete_id = a.user_id and r.status in ('open','flagged','in_review')) < a.presents_open_limit) as available,
         (select round(avg(r.rating)::numeric, 1) from public.presents_requests r where r.athlete_id = a.user_id and r.rating is not null) as avg_rating,
         (select count(*) from public.presents_requests r where r.athlete_id = a.user_id and r.rating is not null) as rating_count,
         (select count(*) from public.presents_requests r where r.athlete_id = a.user_id and r.status = 'delivered') as delivered_count
    from public.athletes a
    left join public.mentor_tiers t on t.key = a.tier
    left join public.media sv on sv.id = a.presents_sample_media_id and sv.status = 'ready'::public.media_status
    left join public.media iv on iv.id = a.video_media_id and iv.status = 'ready'::public.media_status
   where a.status = 'approved' and a.blocked_at is null and a.deleted_at is null
     and a.presents_enabled and a.presents_blocked_at is null and a.presents_price_cents is not null
     and public.presents_live();
alter view public.presents_providers set (security_invoker = false);
grant select on public.presents_providers to anon, authenticated;

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
         case when a.presents_enabled and a.presents_blocked_at is null and public.presents_live() then a.presents_price_cents end as presents_price_cents
    from public.athletes a
    join public.mentor_tiers t on t.key = a.tier
    left join public.mentor_stats s on s.athlete_id = a.user_id
    left join public.media v on v.id = a.video_media_id and v.status = 'ready'::public.media_status
   where a.status = 'approved' and a.blocked_at is null and a.deleted_at is null and a.offers_mentoring
     and a.listed and t.archived_at is null and (t.visible or t.direct_link);
alter view public.marketplace_mentors set (security_invoker = false);
grant select on public.marketplace_mentors to anon, authenticated;

-- 5. One payout per request.
create unique index if not exists payouts_presents_uidx on public.payouts (presents_request_id) where presents_request_id is not null;
