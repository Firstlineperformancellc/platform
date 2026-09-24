-- Service Health Meter: the API checks every connected service once an hour (and on demand from
-- the admin panel), keeps the results, and the admin overview shows the meter. Writes go through
-- the API; admins read under RLS.

create table if not exists public.service_health_runs (
  id          uuid primary key default gen_random_uuid(),
  ran_at      timestamptz not null default now(),
  trigger     text not null default 'schedule' check (trigger in ('schedule','manual')),
  overall     text not null check (overall in ('healthy','attention','unhealthy')),
  duration_ms int not null default 0,
  results     jsonb not null default '[]'::jsonb   -- [{key, label, status, latency_ms, detail}]
);
create index if not exists service_health_runs_ran_at_idx on public.service_health_runs (ran_at desc);

-- Things outside the API that prove they are alive by calling in (the support@ mailbox script).
create table if not exists public.service_heartbeats (
  service      text primary key,
  last_seen_at timestamptz not null default now(),
  meta         jsonb not null default '{}'::jsonb
);

alter table public.service_health_runs enable row level security;
alter table public.service_heartbeats  enable row level security;
create policy service_health_runs_read on public.service_health_runs for select to authenticated using (public.is_admin());
create policy service_heartbeats_read  on public.service_heartbeats  for select to authenticated using (public.is_admin());
