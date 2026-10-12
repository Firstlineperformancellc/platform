-- Email the team when a mentor application arrives. The API's five-minute job sends one notice per
-- applicant and stamps this column so nobody is told twice.
alter table public.athletes add column if not exists team_notified_at timestamptz;

-- Everyone who applied before this existed counts as already announced (no backlog of emails).
update public.athletes set team_notified_at = coalesce(created_at, now()) where team_notified_at is null;
