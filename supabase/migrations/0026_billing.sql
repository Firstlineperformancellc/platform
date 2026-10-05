-- Billing hardening for Stripe going live.
--   stripe_events: every webhook event id we have processed, so Stripe's retries are ignored.
--   refunded_cents: how much of an order or session has gone back to the parent (partial refunds add up).
--   payouts.error / attempted_at: what happened the last time a transfer was tried.

create table if not exists public.stripe_events (
  id          text primary key,
  type        text not null,
  received_at timestamptz not null default now()
);
alter table public.stripe_events enable row level security;   -- no policies: the API (service role) only

alter table public.orders        add column if not exists refunded_cents int not null default 0;
alter table public.sessions      add column if not exists refunded_cents int not null default 0,
                                 add column if not exists refund_error text;
alter table public.session_packs add column if not exists refunded_cents int not null default 0;
alter table public.payouts       add column if not exists error text,
                                 add column if not exists attempted_at timestamptz;
