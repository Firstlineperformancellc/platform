-- Cross-table RLS checks caused policy recursion (media -> orders -> jobs -> orders ...).
-- Postgres evaluates the referenced table's own policies inside a policy subquery, which loops.
-- Fix: express every cross-table check as a SECURITY DEFINER function. Functions owned by the
-- table owner bypass RLS internally, so the check is a plain lookup and the loop disappears.
-- Each function answers one question about the caller (auth.uid()) and nothing else.

create or replace function public.athlete_has_job_for_order(oid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.jobs j where j.order_id = oid and j.athlete_id = auth.uid())
$$;

create or replace function public.parent_owns_order(oid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.orders o where o.id = oid and o.parent_id = auth.uid())
$$;

create or replace function public.parent_owns_job(jid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.jobs j join public.orders o on o.id = j.order_id
                 where j.id = jid and o.parent_id = auth.uid())
$$;

create or replace function public.athlete_holds_job(jid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.jobs j where j.id = jid and j.athlete_id = auth.uid())
$$;

create or replace function public.athlete_can_read_media(mid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.orders o join public.jobs j on j.order_id = o.id
                 where o.film_media_id = mid and j.athlete_id = auth.uid())
$$;

create or replace function public.parent_can_read_media(mid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.breakdowns b join public.jobs j on j.id = b.job_id
                 join public.orders o on o.id = j.order_id
                 where b.media_id = mid and o.parent_id = auth.uid())
$$;

create or replace function public.is_approved_athlete_photo(mid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.athletes a where a.photo_media_id = mid and a.status = 'approved')
$$;

create or replace function public.athlete_works_with_player(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.orders o join public.jobs j on j.order_id = o.id
                 where o.player_id = pid and j.athlete_id = auth.uid())
      or exists (select 1 from public.sessions s where s.player_id = pid and s.athlete_id = auth.uid())
$$;

-- Recreate the policies that referenced other tables directly.
drop policy if exists players_athlete_read on public.players;
create policy players_athlete_read on public.players for select to authenticated
  using (public.athlete_works_with_player(id));

drop policy if exists media_job_read on public.media;
create policy media_job_read on public.media for select to authenticated using (
  public.athlete_can_read_media(id) or public.parent_can_read_media(id) or public.is_approved_athlete_photo(id)
);

drop policy if exists orders_athlete_read on public.orders;
create policy orders_athlete_read on public.orders for select to authenticated
  using (public.athlete_has_job_for_order(id));

drop policy if exists jobs_pool_read on public.jobs;
create policy jobs_pool_read on public.jobs for select to authenticated using (
  (status = 'open' and public.is_approved_athlete())
  or athlete_id = auth.uid()
  or public.parent_owns_order(order_id)
  or public.is_admin()
);

drop policy if exists breakdowns_athlete on public.breakdowns;
create policy breakdowns_athlete on public.breakdowns for all to authenticated
  using (public.athlete_holds_job(job_id) or public.is_admin())
  with check (public.athlete_holds_job(job_id) or public.is_admin());

drop policy if exists breakdowns_parent_read on public.breakdowns;
create policy breakdowns_parent_read on public.breakdowns for select to authenticated
  using (public.parent_owns_job(job_id));

drop policy if exists breakdowns_parent_rate on public.breakdowns;
create policy breakdowns_parent_rate on public.breakdowns for update to authenticated
  using (public.parent_owns_job(job_id));
