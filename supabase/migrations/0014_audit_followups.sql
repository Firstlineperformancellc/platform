-- Audit follow-ups approved by Scott 2026-09-21 (all but the late-cancel rule).

-- 1. Admins change data only through the API, so every action lands in audit_log.
drop policy if exists jobs_admin_write on public.jobs;
drop policy if exists sessions_admin_write on public.sessions;
drop policy if exists job_offers_admin_write on public.job_offers;
drop policy if exists qca_admin_write on public.quality_audits;
drop policy if exists settings_admin on public.settings;
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
drop policy if exists players_parent on public.players;
create policy players_parent on public.players for all to authenticated
  using (parent_id = auth.uid()) with check (parent_id = auth.uid());
drop policy if exists players_admin_read on public.players;
create policy players_admin_read on public.players for select to authenticated using (public.is_admin());
drop policy if exists athletes_self_update on public.athletes;
create policy athletes_self_update on public.athletes for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 5. A mentor sees an order and its youth athlete while an offer is open or once they hold the job;
--    declined and expired offers take that visibility with them.
create or replace function public.athlete_has_job_for_order(oid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.jobs j where j.order_id = oid and j.athlete_id = auth.uid())
      or exists (select 1 from public.jobs j join public.job_offers jo on jo.job_id = j.id
                 where j.order_id = oid and jo.athlete_id = auth.uid() and jo.response is null)
$$;
create or replace function public.athlete_works_with_player(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.orders o join public.jobs j on j.order_id = o.id
                 where o.player_id = pid and j.athlete_id = auth.uid())
      or exists (select 1 from public.orders o join public.jobs j on j.order_id = o.id
                 join public.job_offers jo on jo.job_id = j.id
                 where o.player_id = pid and jo.athlete_id = auth.uid() and jo.response is null)
      or exists (select 1 from public.sessions s where s.player_id = pid and s.athlete_id = auth.uid())
$$;
drop policy if exists jobs_read on public.jobs;
create policy jobs_read on public.jobs for select to authenticated using (
  athlete_id = auth.uid()
  or exists (select 1 from public.job_offers jo where jo.job_id = jobs.id and jo.athlete_id = auth.uid() and jo.response is null)
  or public.parent_owns_order(order_id)
  or public.is_admin()
);

-- 6 + 7. Capacity counts open offers as well as accepted jobs; the full scorecard is admin-only.
create or replace view public.mentor_stats with (security_invoker = false) as
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
           count(*) filter (where status = 'completed')      as sessions_completed,
           count(*) filter (where status = 'no_show_mentor') as session_no_shows,
           count(*) filter (where status = 'declined')       as session_declines
      from public.sessions group by athlete_id
  ),
  late as (
    select actor_id as athlete_id, count(*) as session_late_cancels
      from public.audit_log where action = 'session.mentor_late_cancel' group by actor_id
  )
  select a.user_id as athlete_id,
         count(j.id) filter (where j.status in ('delivered','closed'))                          as jobs_completed,
         count(j.id) filter (where j.status in ('accepted'))
           + (select count(*) from public.job_offers jo where jo.athlete_id = a.user_id and jo.response is null) as jobs_on_deck,
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
create or replace view public.mentor_stats_admin with (security_invoker = false) as
  select * from public.mentor_stats where public.is_admin();
revoke all on public.mentor_stats_admin from anon;
grant select on public.mentor_stats_admin to authenticated;

-- 8. An email change on the sign-in account flows to the profile (admin seats are granted by email).
create or replace function public.handle_user_email_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = coalesce(new.email, '') where id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed after update of email on auth.users
  for each row execute function public.handle_user_email_change();

-- 9. Media remembers its Mux playback policy so the app knows when a token is required.
alter table public.media add column if not exists mux_playback_policy text
  check (mux_playback_policy in ('public','signed'));
