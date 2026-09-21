-- Film Room ratings count toward the mentor's public rating and show on the profile alongside
-- breakdown reviews. Scorecard picks up session counts, no-shows and late cancels.
alter table public.sessions add column if not exists reviewed_at timestamptz;

drop view if exists public.marketplace_mentors;
drop view if exists public.mentor_stats;
drop view if exists public.mentor_reviews;

create view public.mentor_stats with (security_invoker = false) as
  with ratings as (
    select j.athlete_id, b.rating
      from public.breakdowns b join public.jobs j on j.id = b.job_id
     where b.review_status = 'published' and b.rating is not null
    union all
    select s.athlete_id, s.rating from public.sessions s
     where s.review_status = 'published' and s.rating is not null
  ),
  sess as (
    select athlete_id,
           count(*) filter (where status = 'completed')                                   as sessions_completed,
           count(*) filter (where status = 'no_show_mentor')                              as session_no_shows,
           count(*) filter (where status = 'declined')                                    as session_declines
      from public.sessions group by athlete_id
  ),
  late as (
    select actor_id as athlete_id, count(*) as session_late_cancels
      from public.audit_log where action = 'session.mentor_late_cancel' group by actor_id
  )
  select a.user_id as athlete_id,
         count(j.id) filter (where j.status in ('delivered','closed'))                          as jobs_completed,
         count(j.id) filter (where j.status in ('accepted'))                                    as jobs_on_deck,
         avg(extract(epoch from (j.delivered_at - j.accepted_at)) / 3600.0)
              filter (where j.delivered_at is not null and j.accepted_at is not null)          as avg_turnaround_hours,
         avg(case when j.on_time then 1.0 else 0.0 end) filter (where j.on_time is not null)   as on_time_rate,
         (select avg(r.rating) from ratings r where r.athlete_id = a.user_id)                   as avg_rating,
         (select count(*) from ratings r where r.athlete_id = a.user_id)                        as rating_count,
         (select count(*) from public.job_offers jo where jo.athlete_id = a.user_id and jo.response = 'declined') as declines,
         (select count(*) from public.job_offers jo where jo.athlete_id = a.user_id and jo.response = 'expired')  as expired_offers,
         (select count(*) from public.job_offers jo where jo.athlete_id = a.user_id and jo.response = 'accepted') as accepted_offers,
         (select count(*) from public.quality_audits q join public.breakdowns bb on bb.id = q.breakdown_id
            join public.jobs jj on jj.id = bb.job_id where jj.athlete_id = a.user_id)              as audits,
         max(j.delivered_at)                                                                     as last_delivered_at,
         coalesce(max(se.sessions_completed), 0)                                                 as sessions_completed,
         coalesce(max(se.session_no_shows), 0)                                                   as session_no_shows,
         coalesce(max(se.session_declines), 0)                                                   as session_declines,
         coalesce(max(l.session_late_cancels), 0)                                                as session_late_cancels
    from public.athletes a
    left join public.jobs j on j.athlete_id = a.user_id
    left join sess se on se.athlete_id = a.user_id
    left join late l on l.athlete_id = a.user_id
   group by a.user_id;
revoke all on public.mentor_stats from anon, authenticated;
grant select on public.mentor_stats to authenticated;

create view public.marketplace_mentors with (security_invoker = false) as
  select a.user_id, a.slug, a.display_name, a.tier, a.highest_level, a.current_team, a.badges,
         a.positions, a.specialties, a.bio, a.photo_media_id, a.photo_path, a.video_media_id,
         v.mux_playback_id as video_playback_id,
         a.capacity_on_deck,
         coalesce(s.jobs_on_deck, 0) as jobs_on_deck,
         coalesce(s.jobs_on_deck, 0) < a.capacity_on_deck as available,
         s.avg_turnaround_hours, s.avg_rating, s.rating_count, s.jobs_completed, s.sessions_completed
    from public.athletes a
    left join public.mentor_stats s on s.athlete_id = a.user_id
    left join public.media v on v.id = a.video_media_id and v.status = 'ready'
   where a.status = 'approved' and a.tier is not null and a.blocked_at is null and a.deleted_at is null;
grant select on public.marketplace_mentors to anon, authenticated;

create view public.mentor_reviews with (security_invoker = false) as
  select j.athlete_id, 'breakdown'::text as kind, b.id as breakdown_id, null::uuid as session_id,
         b.rating, b.review, b.reviewed_at,
         split_part(p.full_name, ' ', 1) as parent_first_name, o.age_group, o.position::text as position
    from public.breakdowns b
    join public.jobs j on j.id = b.job_id
    join public.orders o on o.id = j.order_id
    join public.profiles p on p.id = o.parent_id
   where b.review_status = 'published' and b.rating is not null
  union all
  select s.athlete_id, 'session', null, s.id, s.rating, s.review, coalesce(s.reviewed_at, s.updated_at),
         split_part(p.full_name, ' ', 1), pl.age_group, pl.position::text
    from public.sessions s
    join public.players pl on pl.id = s.player_id
    join public.profiles p on p.id = s.parent_id
   where s.review_status = 'published' and s.rating is not null;
grant select on public.mentor_reviews to anon, authenticated;
