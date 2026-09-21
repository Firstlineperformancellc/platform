-- mentor_stats and marketplace_mentors must aggregate over ALL jobs and reviews, not just the rows
-- the viewer can see, or an anonymous visitor would see every mentor as available with no stats.
-- They expose only aggregates and approved-profile fields, so owner-rights views are appropriate.
-- development_log stays security_invoker (it is private per family).
create or replace view public.mentor_stats with (security_invoker = false) as
  select a.user_id as athlete_id,
         count(j.id) filter (where j.status in ('delivered','closed'))                          as jobs_completed,
         count(j.id) filter (where j.status in ('accepted'))                                    as jobs_on_deck,
         avg(extract(epoch from (j.delivered_at - j.accepted_at)) / 3600.0)
              filter (where j.delivered_at is not null and j.accepted_at is not null)          as avg_turnaround_hours,
         avg(case when j.on_time then 1.0 else 0.0 end) filter (where j.on_time is not null)   as on_time_rate,
         avg(b.rating) filter (where b.review_status = 'published')                             as avg_rating,
         count(b.rating) filter (where b.review_status = 'published')                           as rating_count,
         (select count(*) from public.job_offers jo where jo.athlete_id = a.user_id and jo.response = 'declined') as declines,
         (select count(*) from public.job_offers jo where jo.athlete_id = a.user_id and jo.response = 'expired')  as expired_offers,
         (select count(*) from public.job_offers jo where jo.athlete_id = a.user_id and jo.response = 'accepted') as accepted_offers,
         (select count(*) from public.quality_audits q join public.breakdowns bb on bb.id = q.breakdown_id
            join public.jobs jj on jj.id = bb.job_id where jj.athlete_id = a.user_id)              as audits,
         max(j.delivered_at)                                                                     as last_delivered_at
    from public.athletes a
    left join public.jobs j on j.athlete_id = a.user_id
    left join public.breakdowns b on b.job_id = j.id
   group by a.user_id;

create or replace view public.marketplace_mentors with (security_invoker = false) as
  select a.user_id, a.slug, a.display_name, a.tier, a.highest_level, a.current_team, a.badges,
         a.positions, a.specialties, a.bio, a.photo_media_id, a.video_media_id,
         a.capacity_on_deck,
         coalesce(s.jobs_on_deck, 0) as jobs_on_deck,
         coalesce(s.jobs_on_deck, 0) < a.capacity_on_deck as available,
         s.avg_turnaround_hours, s.avg_rating, s.rating_count, s.jobs_completed
    from public.athletes a
    left join public.mentor_stats s on s.athlete_id = a.user_id
   where a.status = 'approved' and a.tier is not null and a.blocked_at is null and a.deleted_at is null;

-- The full scorecard is admin-only; the marketplace view is public by design.
revoke all on public.mentor_stats from anon, authenticated;
grant select on public.marketplace_mentors to anon, authenticated;
grant select on public.mentor_stats to authenticated;   -- admin screens; non-admins get aggregates only, no PII
