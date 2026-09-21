-- Film Room sessions: booking against mentor availability, Daily rooms, recordings, recaps,
-- packs (Season Arc). Prices seeded with Claude's proposal (Scott, 2026-09-21) until Alex sets them.

update public.settings set
  session_prices = '{
    "film_room_30": {"pro": 34900, "pwhl": 11900, "ncaa": 8900},
    "film_room_60": {"pro": 59900, "pwhl": 19900, "ncaa": 14900},
    "addon_30":     {"pro": 29900, "pwhl": 9900,  "ncaa": 6900},
    "season_arc":   {"pro": 119900,"pwhl": 39900, "ncaa": 29900}
  }'::jsonb,
  rules = rules || '{
    "session_slot_minutes": 30, "session_min_lead_hours": 12, "session_accept_hours": 24,
    "session_book_ahead_days": 14, "addon_window_days": 14, "season_arc_sessions": 4, "season_arc_weeks": 8,
    "session_reminder_hours": [24, 1]
  }'::jsonb
where id = 1;

alter table public.sessions
  add column if not exists accept_by timestamptz,
  add column if not exists paid_at timestamptz,
  add column if not exists stripe_checkout_session_id text unique,
  add column if not exists pack_id uuid,
  add column if not exists daily_room_url text,
  add column if not exists recording_daily_id text,
  add column if not exists recording_status text check (recording_status in ('none','recording','ready','deleted')) default 'none',
  add column if not exists no_show_by text check (no_show_by in ('parent','mentor')),
  add column if not exists cancel_reason text,
  add column if not exists tier text check (tier in ('pro','pwhl','ncaa'));

-- Prepaid Season Arc packs: N sessions with one mentor, used within a window.
create table if not exists public.session_packs (
  id            uuid primary key default gen_random_uuid(),
  parent_id     uuid not null references public.profiles (id),
  player_id     uuid not null references public.players (id),
  athlete_id    uuid not null references public.athletes (user_id),
  tier          text not null check (tier in ('pro','pwhl','ncaa')),
  sessions_total int not null,
  sessions_used  int not null default 0,
  price_cents   int not null,
  mentor_share_cents int not null,
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text unique,
  paid_at       timestamptz,
  expires_at    timestamptz not null,
  created_at    timestamptz not null default now()
);
alter table public.session_packs enable row level security;
create policy packs_party_read on public.session_packs for select to authenticated
  using (parent_id = auth.uid() or athlete_id = auth.uid() or public.is_admin());
alter table public.sessions add constraint sessions_pack_fk foreign key (pack_id) references public.session_packs (id);

-- Parents book through the API (service role); mentors/parents read their own; admins everything (policies exist).
-- The Development Log already includes completed sessions with a recap.
