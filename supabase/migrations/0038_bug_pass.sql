-- 0038 Bug pass, 2026-10-24.
--  1. Signed-out visitors no longer read the base athletes table (every signed-out screen uses the public views).
--  2. The settings row no longer shows the admin allow-list to the public: only the columns the app and site read.
--  3. A mentor's jobs-on-deck can be as high as a level's default (1..20), matching mentor_tiers.capacity_default.
--  4. One payout per Film Room session, enforced by the database.
--  5. players.last_initial, so mentor screens can show "Mason K." without carrying the surname.
drop policy if exists athletes_public_read on public.athletes;
create policy athletes_public_read on public.athletes for select to authenticated
  using (status = 'approved' or user_id = auth.uid() or public.is_admin());

revoke select on public.settings from anon, authenticated;
grant select (id, assignment_mode, currency, breakdown_prices, mentor_share_pct, session_prices, rules, taxonomy, marketplace, updated_at) on public.settings to anon, authenticated;

alter table public.athletes drop constraint if exists athletes_capacity_on_deck_check;
alter table public.athletes add constraint athletes_capacity_on_deck_check check (capacity_on_deck between 1 and 20);

create unique index if not exists payouts_session_uidx on public.payouts (session_id) where session_id is not null;

alter table public.players add column if not exists last_initial text generated always as (left(last_name, 1)) stored;
