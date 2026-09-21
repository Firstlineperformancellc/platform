-- Product model v2, from the 2026-09-20 decisions (docs/DECISIONS.md, entry 2026-09-21):
-- mentor tiers and tier pricing, parent-picks marketplace with capacity and second choice,
-- offer/acceptance window, the Player Development Worksheet, gated reviews, Quality Control
-- Audits, manual payout ledger, Film Room session fields, and settings that hold every rule
-- and list Alex has not finalized. Statuses move from enums to text + check constraints so
-- future states are a data change, not a type change.

-- ---------------------------------------------------------------------------
-- Settings: prices, splits, rules, taxonomy. All editable from admin, none in code.
-- ---------------------------------------------------------------------------
alter table public.settings
  drop column if exists breakdown_price_cents,
  drop column if exists breakdown_payout_cents,
  drop column if exists session_price_cents,
  drop column if exists session_payout_cents,
  drop column if exists session_minutes,
  drop column if exists job_due_hours;

alter table public.settings
  add column if not exists breakdown_prices jsonb not null default '{"pro":100000,"pwhl":25000,"ncaa":17500}'::jsonb,
  add column if not exists mentor_share_pct jsonb not null default '{"pro":70,"pwhl":60,"ncaa":60}'::jsonb,
  add column if not exists session_prices jsonb not null default '{}'::jsonb,   -- {format:{tier:cents}} — Alex to set
  add column if not exists rules jsonb not null default '{
    "accept_hours": 48, "accept_nudge_hours": 24, "turnaround_hours": 72, "reminder_hours": [24, 48],
    "qca_window_days": 7, "review_auto_publish_min": 3, "capacity_default": 3, "capacity_max": 5,
    "wait_days_default": 3, "second_choice_required": false,
    "session_cancel_hours": 24, "session_grace_minutes": 10, "courtesy_rebooks": 1,
    "recap_due_hours": 24, "recording_retention_days": 90, "payout_hold_during_qca": true,
    "mentors_may_decline_sessions": true, "parent_present_default": false
  }'::jsonb,
  add column if not exists taxonomy jsonb not null default '{
    "age_groups": ["8U","10U","12U","14U","16U","18U"],
    "positions": [{"key":"forward","label":"Forward"},{"key":"defense","label":"Defense"},{"key":"goalie","label":"Goalie"}],
    "skill_levels": ["House","A","AA","AAA"],
    "focus_skater": ["Hockey IQ","Skating","Shooting","Passing","Positioning","Defensive play","Game awareness","Other"],
    "focus_goalie": ["Rebound control","Positioning","Angle play","Puck tracking","Odd-man rushes","Game IQ","Communication","Mental game"],
    "levels": [
      {"key":"nhl","label":"NHL","tier":"pro"},{"key":"ahl","label":"AHL","tier":"pro"},{"key":"echl","label":"ECHL","tier":"pro"},
      {"key":"euro_pro","label":"European pro (SHL, Liiga, KHL, NL, DEL)","tier":"pro"},
      {"key":"pwhl","label":"PWHL","tier":"pwhl"},
      {"key":"ncaa_d1","label":"NCAA Division 1","tier":"ncaa"},{"key":"ncaa_d3","label":"NCAA Division 3","tier":"ncaa"},{"key":"usports","label":"U Sports (Canada)","tier":"ncaa"},
      {"key":"ohl","label":"OHL","tier":null},{"key":"whl","label":"WHL","tier":null},{"key":"qmjhl","label":"QMJHL","tier":null},
      {"key":"ushl","label":"USHL","tier":null},{"key":"nahl","label":"NAHL","tier":null},{"key":"bchl","label":"BCHL","tier":null}
    ],
    "badges": [{"key":"national_team","label":"National team"},{"key":"national_champion","label":"National champion"}]
  }'::jsonb;
update public.settings set assignment_mode = 'parent_picks' where id = 1;

-- ---------------------------------------------------------------------------
-- Mentors (athletes table): tier, level, capacity, availability, admin flags
-- ---------------------------------------------------------------------------
-- policies that mention status must be dropped before the column type changes; recreated below
drop policy if exists athletes_public_read on public.athletes;
drop policy if exists jobs_pool_read on public.jobs;

alter table public.athletes alter column status drop default;
alter table public.athletes alter column status type text using status::text;
alter table public.athletes alter column status set default 'applied';
alter table public.athletes add constraint athletes_status_chk
  check (status in ('applied','approved','suspended','deactivated'));
drop type if exists public.athlete_status;

alter table public.athletes
  add column if not exists tier text check (tier in ('pro','pwhl','ncaa')),
  add column if not exists highest_level text,                 -- key from settings.taxonomy.levels
  add column if not exists current_team text not null default '',
  add column if not exists badges text[] not null default '{}',
  add column if not exists verified boolean not null default false,
  add column if not exists capacity_on_deck int not null default 3 check (capacity_on_deck between 1 and 5),
  add column if not exists video_media_id uuid references public.media (id) on delete set null,
  add column if not exists availability jsonb not null default '[]'::jsonb,   -- [{dow:2,start:"19:00",end:"21:00"}] mentor local
  add column if not exists timezone text not null default 'America/Detroit',
  add column if not exists blocked_at timestamptz,
  add column if not exists deleted_at timestamptz;

-- ---------------------------------------------------------------------------
-- Youth athletes (players)
-- ---------------------------------------------------------------------------
alter table public.players
  add column if not exists current_team text not null default '',
  add column if not exists notes text not null default '';

-- ---------------------------------------------------------------------------
-- Orders: tier pricing, mentor choice, second choice, waiting
-- ---------------------------------------------------------------------------
alter table public.orders alter column status drop default;
alter table public.orders alter column status type text using status::text;
alter table public.orders alter column status set default 'draft';
alter table public.orders add constraint orders_status_chk
  check (status in ('draft','paid','offered','accepted','in_review','delivered','closed','refunded','unassigned'));
drop type if exists public.order_status;

alter table public.orders
  add column if not exists tier text check (tier in ('pro','pwhl','ncaa')),
  add column if not exists mentor_share_cents int,
  add column if not exists first_choice_athlete_id uuid references public.athletes (user_id),
  add column if not exists second_choice_athlete_id uuid references public.athletes (user_id),
  add column if not exists wait_days int,
  add column if not exists waitlisted_at timestamptz,
  add column if not exists film_youtube_url text;
-- preferred_athlete_id (from v1) is superseded by first_choice_athlete_id
update public.orders set first_choice_athlete_id = preferred_athlete_id where first_choice_athlete_id is null;

-- ---------------------------------------------------------------------------
-- Jobs and offers: acceptance window, turnaround from acceptance
-- ---------------------------------------------------------------------------
alter table public.jobs drop constraint if exists jobs_claimed_shape;
alter table public.jobs alter column status drop default;
alter table public.jobs alter column status type text using status::text;
alter table public.jobs alter column status set default 'offered';
alter table public.jobs add constraint jobs_status_chk
  check (status in ('offered','waiting','accepted','delivered','closed','expired','unassigned','reassigned'));
drop type if exists public.job_status;

alter table public.jobs
  add column if not exists accepted_at timestamptz,
  add column if not exists on_time boolean;
-- accepted_at starts the 72h clock; due_at = accepted_at + rules.turnaround_hours

create table if not exists public.job_offers (
  id            uuid primary key default gen_random_uuid(),
  job_id        uuid not null references public.jobs (id) on delete cascade,
  athlete_id    uuid not null references public.athletes (user_id),
  rank          int not null check (rank in (1, 2, 3)),        -- 1 first choice, 2 second choice, 3 admin assigned
  offered_at    timestamptz not null default now(),
  expires_at    timestamptz not null,
  responded_at  timestamptz,
  response      text check (response in ('accepted','declined','expired')),
  nudged_at     timestamptz
);
create index job_offers_job_idx on public.job_offers (job_id);
create index job_offers_athlete_idx on public.job_offers (athlete_id, response);

-- ---------------------------------------------------------------------------
-- Breakdowns: the worksheet and gated reviews
-- ---------------------------------------------------------------------------
alter table public.breakdowns
  add column if not exists worksheet jsonb not null default '{}'::jsonb,
  -- {strengths:[], improvements:[], clips:[{time,situation,what_happened,improve,takeaway}],
  --  drills:[{area,drill,description,frequency,notes}], next_steps:[], notes:""}
  add column if not exists worksheet_pdf_path text,
  add column if not exists review_status text not null default 'none'
    check (review_status in ('none','pending_admin','published','hidden'));

-- ---------------------------------------------------------------------------
-- Film Room sessions: booking, recap, gated reviews, cancellation
-- ---------------------------------------------------------------------------
alter table public.sessions alter column status drop default;
alter table public.sessions alter column status type text using status::text;
alter table public.sessions alter column status set default 'requested';
alter table public.sessions add constraint sessions_status_chk
  check (status in ('requested','scheduled','in_progress','completed','cancelled','no_show_parent','no_show_mentor','declined','expired'));
drop type if exists public.session_status;

alter table public.sessions
  add column if not exists format text not null default 'film_room_30'
    check (format in ('film_room_30','film_room_60','addon_30','season_arc')),
  add column if not exists source text not null default 'marketplace' check (source in ('breakdown','marketplace')),
  add column if not exists breakdown_id uuid references public.breakdowns (id),
  add column if not exists film_media_id uuid references public.media (id),
  add column if not exists parent_note text not null default '',
  add column if not exists parent_present boolean not null default false,
  add column if not exists mentor_share_cents int,
  add column if not exists recap jsonb,                    -- {takeaways:[], drills:[], next_step:""}
  add column if not exists recap_due_at timestamptz,
  add column if not exists recap_at timestamptz,
  add column if not exists rating int check (rating between 1 and 5),
  add column if not exists review text,
  add column if not exists review_status text not null default 'none'
    check (review_status in ('none','pending_admin','published','hidden')),
  add column if not exists cancelled_by uuid references public.profiles (id),
  add column if not exists cancelled_at timestamptz,
  add column if not exists recording_expires_at timestamptz,
  add column if not exists recording_kept boolean not null default false;   -- keepsake (Phase 2)

-- ---------------------------------------------------------------------------
-- Quality Control Audits
-- ---------------------------------------------------------------------------
create table if not exists public.quality_audits (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null check (kind in ('breakdown','session')),
  breakdown_id  uuid references public.breakdowns (id),
  session_id    uuid references public.sessions (id),
  filed_by      uuid not null references public.profiles (id),
  reason        text not null,
  status        text not null default 'open' check (status in ('open','closed')),
  outcome       text check (outcome in ('dismissed','refund_partial','refund_full','reassigned','other')),
  refund_cents  int,
  notes         text not null default '',
  actions       jsonb not null default '[]'::jsonb,        -- [{at, by, action, note}]
  opened_at     timestamptz not null default now(),
  closed_at     timestamptz,
  closed_by     uuid references public.profiles (id),
  constraint qca_one_target check ((breakdown_id is null) <> (session_id is null))
);
create index qca_status_idx on public.quality_audits (status, opened_at desc);

-- ---------------------------------------------------------------------------
-- Payout ledger: manual from admin until a payout rule is chosen
-- ---------------------------------------------------------------------------
alter table public.payouts alter column status drop default;
alter table public.payouts alter column status type text using status::text;
alter table public.payouts alter column status set default 'owed';
alter table public.payouts add constraint payouts_status_chk
  check (status in ('owed','held','paid','failed','voided'));
drop type if exists public.payout_status;

alter table public.payouts
  add column if not exists held_reason text,
  add column if not exists paid_by uuid references public.profiles (id),
  add column if not exists batch_id uuid,
  add column if not exists note text not null default '';

-- ---------------------------------------------------------------------------
-- Views: the Development Log and the mentor scorecard. security_invoker so RLS applies.
-- ---------------------------------------------------------------------------
create or replace view public.development_log with (security_invoker = true) as
  select o.player_id, o.parent_id, 'breakdown'::text as kind, b.delivered_at as occurred_at,
         j.athlete_id as mentor_id, b.id as breakdown_id, null::uuid as session_id,
         b.worksheet as detail, b.rating
    from public.breakdowns b
    join public.jobs j on j.id = b.job_id
    join public.orders o on o.id = j.order_id
  union all
  select s.player_id, s.parent_id, 'session'::text, coalesce(s.recap_at, s.ended_at, s.scheduled_at),
         s.athlete_id, s.breakdown_id, s.id, s.recap, s.rating
    from public.sessions s
   where s.status = 'completed';

create or replace view public.mentor_stats with (security_invoker = true) as
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

-- ---------------------------------------------------------------------------
-- Public marketplace read: approved mentors with availability derived from capacity
-- ---------------------------------------------------------------------------
create or replace view public.marketplace_mentors with (security_invoker = true) as
  select a.user_id, a.slug, a.display_name, a.tier, a.highest_level, a.current_team, a.badges,
         a.positions, a.specialties, a.bio, a.photo_media_id, a.video_media_id,
         a.capacity_on_deck,
         coalesce(s.jobs_on_deck, 0) as jobs_on_deck,
         coalesce(s.jobs_on_deck, 0) < a.capacity_on_deck as available,
         s.avg_turnaround_hours, s.avg_rating, s.rating_count, s.jobs_completed
    from public.athletes a
    left join public.mentor_stats s on s.athlete_id = a.user_id
   where a.status = 'approved' and a.tier is not null;

-- ---------------------------------------------------------------------------
-- RLS for the new tables
-- ---------------------------------------------------------------------------
alter table public.job_offers enable row level security;
alter table public.quality_audits enable row level security;

create policy job_offers_athlete_read on public.job_offers for select to authenticated
  using (athlete_id = auth.uid() or public.parent_owns_job(job_id) or public.is_admin());
create policy job_offers_admin_write on public.job_offers for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy qca_parent on public.quality_audits for select to authenticated
  using (filed_by = auth.uid() or public.is_admin());
create policy qca_parent_file on public.quality_audits for insert to authenticated
  with check (filed_by = auth.uid());
create policy qca_admin_write on public.quality_audits for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Recreated policies (text statuses)
create policy athletes_public_read on public.athletes for select to anon, authenticated
  using (status = 'approved' or user_id = auth.uid() or public.is_admin());
create policy jobs_read on public.jobs for select to authenticated using (
  athlete_id = auth.uid()
  or exists (select 1 from public.job_offers jo where jo.job_id = jobs.id and jo.athlete_id = auth.uid())
  or public.parent_owns_order(order_id)
  or public.is_admin()
);

-- Guard: only admins change verified / capacity ceiling / blocked / tier after approval
create or replace function public.guard_athlete_admin_fields() returns trigger
language plpgsql as $$
begin
  if not public.is_admin() then
    if new.verified is distinct from old.verified or new.blocked_at is distinct from old.blocked_at
       or new.deleted_at is distinct from old.deleted_at then
      raise exception 'only an admin can change verification or block state';
    end if;
    if old.status = 'approved' and new.tier is distinct from old.tier then
      raise exception 'tier changes after approval go through an admin';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists athletes_admin_fields_guard on public.athletes;
create trigger athletes_admin_fields_guard before update on public.athletes
  for each row execute function public.guard_athlete_admin_fields();
