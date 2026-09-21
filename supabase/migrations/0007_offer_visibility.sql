-- A mentor who has been OFFERED a job must be able to read the order (focus areas, notes) and the
-- youth athlete's name to decide. The v1 helpers only recognized accepted jobs (jobs.athlete_id).
-- Film stays accepted-only: fewer eyes on a minor's game film until the mentor has committed.
create or replace function public.athlete_has_job_for_order(oid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.jobs j where j.order_id = oid and j.athlete_id = auth.uid())
      or exists (select 1 from public.jobs j join public.job_offers jo on jo.job_id = j.id
                 where j.order_id = oid and jo.athlete_id = auth.uid())
$$;

create or replace function public.athlete_works_with_player(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.orders o join public.jobs j on j.order_id = o.id
                 where o.player_id = pid and j.athlete_id = auth.uid())
      or exists (select 1 from public.orders o join public.jobs j on j.order_id = o.id
                 join public.job_offers jo on jo.job_id = j.id
                 where o.player_id = pid and jo.athlete_id = auth.uid())
      or exists (select 1 from public.sessions s where s.player_id = pid and s.athlete_id = auth.uid())
$$;
