-- A Film Room can produce more than one Daily recording (the mentor drops and rejoins, the
-- recording restarts). Keep every recording id on the session; recording_daily_id stays the latest.
alter table public.sessions add column if not exists recordings jsonb not null default '[]'::jsonb;
