-- Mentor application, second pass: an Elite Prospects link and "why do you want to mentor", and the
-- application is created at sign-up (from the sign-up metadata) so nothing is lost when the email
-- confirmation arrives later. The public marketplace view carries the Elite Prospects link.

alter table public.athletes
  add column if not exists eliteprospects_url text,
  add column if not exists motivation text check (motivation in ('money','fulltime','help','multiple','other')),
  add column if not exists motivation_other text,
  add column if not exists special_circumstances text;   -- anything the applicant wants the reviewers to know; lets them submit an incomplete form

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  listed boolean;
  app jsonb;
  base text;
  s text;
  n int := 0;
begin
  select exists (
    select 1 from public.settings st, jsonb_array_elements_text(st.admin_emails) e
     where st.id = 1 and lower(e) = lower(coalesce(new.email, ''))
  ) into listed;
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    case
      when listed then 'admin'::public.user_role
      when new.raw_user_meta_data ->> 'role' = 'athlete' then 'athlete'::public.user_role
      else 'parent'::public.user_role
    end
  )
  on conflict (id) do nothing;

  -- A mentor application submitted with the sign-up: create the applicant row now.
  app := new.raw_user_meta_data -> 'application';
  if not listed and new.raw_user_meta_data ->> 'role' = 'athlete' and jsonb_typeof(app) = 'object' then
    base := trim(both '-' from regexp_replace(lower(coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), 'mentor')), '[^a-z0-9]+', '-', 'g'));
    if base = '' then base := 'mentor'; end if;
    s := base || '-' || substr(md5(new.id::text), 1, 4);
    while exists (select 1 from public.athletes a where a.slug = s) loop
      n := n + 1; s := base || '-' || substr(md5(new.id::text || n::text), 1, 4);
    end loop;
    insert into public.athletes (user_id, slug, display_name, bio, positions, credentials, current_team, eliteprospects_url, motivation, motivation_other, special_circumstances)
    values (
      new.id, s,
      coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), 'FLP Mentor'),
      left(coalesce(app ->> 'bio', ''), 2000),
      coalesce((select array_agg(x::public.hockey_position) from jsonb_array_elements_text(coalesce(app -> 'positions', '[]'::jsonb)) x
                 where x = any (enum_range(null::public.hockey_position)::text[])), '{}'::public.hockey_position[]),
      case when coalesce(app ->> 'team', '') <> '' then jsonb_build_array(jsonb_build_object('label', left(app ->> 'team', 120))) else '[]'::jsonb end,
      left(coalesce(app ->> 'team', ''), 120),
      nullif(left(app ->> 'eliteprospects_url', 300), ''),
      case when app ->> 'motivation' in ('money','fulltime','help','multiple','other') then app ->> 'motivation' end,
      nullif(left(app ->> 'motivation_other', 500), ''),
      nullif(left(app ->> 'special_circumstances', 2000), '')
    )
    on conflict (user_id) do nothing;
  end if;
  return new;
end $$;

-- owner-rights view (as it has been since 0009): anonymous visitors read it without rights on mentor_stats
create or replace view public.marketplace_mentors as
  select a.user_id, a.slug, a.display_name, a.tier, a.highest_level, a.current_team, a.badges,
         a.positions, a.specialties, a.bio, a.photo_media_id, a.photo_path, a.video_media_id,
         v.mux_playback_id as video_playback_id,
         a.capacity_on_deck,
         coalesce(s.jobs_on_deck, 0::bigint) as jobs_on_deck,
         coalesce(s.jobs_on_deck, 0::bigint) < a.capacity_on_deck as available,
         s.avg_turnaround_hours, s.avg_rating, s.rating_count, s.jobs_completed, s.sessions_completed,
         a.eliteprospects_url
    from public.athletes a
    left join public.mentor_stats s on s.athlete_id = a.user_id
    left join public.media v on v.id = a.video_media_id and v.status = 'ready'::public.media_status
   where a.status = 'approved' and a.tier is not null and a.blocked_at is null and a.deleted_at is null;
alter view public.marketplace_mentors set (security_invoker = false);
grant select on public.marketplace_mentors to anon, authenticated;
