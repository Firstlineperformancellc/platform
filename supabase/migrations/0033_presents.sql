-- 0033 First Line Presents: personal video messages from FLP athletes (spec docs/PRESENTS_SPEC_2026-10-20.md,
-- named by Scott 2026-10-20). Providers are approved athletes: mentors who opt in, or athletes approved
-- for Presents only (offers_mentoring = false; they never enter the marketplace or receive jobs).
-- Buyers are signed-in parents or the public (email + private link). Every write goes through the API.

alter type public.media_purpose add value if not exists 'presents_video';
alter type public.media_purpose add value if not exists 'presents_sample';

alter table public.athletes
  add column if not exists offers_mentoring         boolean not null default true,
  add column if not exists presents_enabled         boolean not null default false,
  add column if not exists presents_price_cents     int,
  add column if not exists presents_days            int not null default 7,
  add column if not exists presents_open_limit      int not null default 10,
  add column if not exists presents_paused_until    timestamptz,
  add column if not exists presents_occasions       text[] not null default '{}',
  add column if not exists presents_blurb           text not null default '',
  add column if not exists presents_sample_media_id uuid references public.media (id) on delete set null,
  add column if not exists presents_blocked_at      timestamptz;
alter table public.athletes drop constraint if exists athletes_presents_blurb_len;
alter table public.athletes add constraint athletes_presents_blurb_len check (char_length(presents_blurb) <= 300);
alter table public.athletes drop constraint if exists athletes_presents_days_chk;
alter table public.athletes add constraint athletes_presents_days_chk check (presents_days between 1 and 14);
alter table public.athletes drop constraint if exists athletes_presents_limit_chk;
alter table public.athletes add constraint athletes_presents_limit_chk check (presents_open_limit between 1 and 100);

-- One request = one video for one recipient. buyer_id is null for a public buyer; the share token is
-- their key to the video. Instructions are screened before the athlete sees them (flags, status flagged).
create table if not exists public.presents_requests (
  id                          uuid primary key default gen_random_uuid(),
  athlete_id                  uuid not null references public.athletes (user_id),
  buyer_id                    uuid references public.profiles (id) on delete set null,
  buyer_email                 text not null,
  buyer_name                  text not null default '',
  recipient_name              text not null,
  recipient_minor             boolean not null default false,
  occasion                    text not null,
  from_name                   text not null default '',
  instructions                text not null default '',
  team                        text not null default '',
  status                      text not null default 'draft'
                              check (status in ('draft','open','flagged','in_review','delivered','declined','expired','refunded','cancelled')),
  price_cents                 int not null,
  athlete_share_cents         int not null,
  currency                    text not null default 'usd',
  stripe_checkout_session_id  text,
  stripe_payment_intent_id    text,
  refunded_cents              int not null default 0,
  refund_error                text,
  video_media_id              uuid references public.media (id) on delete set null,
  share_token                 text not null unique,
  flags                       text[] not null default '{}',
  paid_at                     timestamptz,
  due_at                      timestamptz,
  delivered_at                timestamptz,
  declined_reason             text,
  review_note                 text,
  reviewed_by                 uuid references public.profiles (id),
  reviewed_at                 timestamptz,
  reminded                    int not null default 0,
  rating                      int check (rating between 1 and 5),
  problem_text                text,
  problem_at                  timestamptz,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  constraint presents_instructions_len check (char_length(instructions) <= 500),
  constraint presents_names_len check (char_length(recipient_name) <= 60 and char_length(from_name) <= 80 and char_length(team) <= 80 and char_length(buyer_name) <= 120)
);
drop trigger if exists presents_requests_updated on public.presents_requests;
create trigger presents_requests_updated before update on public.presents_requests for each row execute function public.set_updated_at();
create index if not exists presents_requests_athlete_idx on public.presents_requests (athlete_id, status);
create index if not exists presents_requests_buyer_idx on public.presents_requests (buyer_id);
create index if not exists presents_requests_pi_idx on public.presents_requests (stripe_payment_intent_id);
alter table public.presents_requests enable row level security;
drop policy if exists presents_buyer_read on public.presents_requests;
create policy presents_buyer_read on public.presents_requests for select to authenticated
  using (buyer_id = auth.uid() or public.is_admin());
-- Athletes read their requests through the API, which never shows them the buyer's identity.

-- Payouts: a third source.
alter table public.payouts add column if not exists presents_request_id uuid references public.presents_requests (id);
alter table public.payouts drop constraint if exists payouts_one_source;
alter table public.payouts add constraint payouts_one_source check (
  (case when job_id is null then 0 else 1 end) + (case when session_id is null then 0 else 1 end) + (case when presents_request_id is null then 0 else 1 end) = 1);
create index if not exists payouts_presents_idx on public.payouts (presents_request_id);

-- Who offers Presents right now. Owner-rights view: the marketing site and signed-out visitors read it.
create or replace view public.presents_providers as
  select a.user_id, a.slug, a.display_name, a.photo_media_id, a.photo_path, a.highest_level, a.current_team,
         a.offers_mentoring, a.tier, t.name as tier_name, t.sort as tier_sort, a.eliteprospects_url,
         a.presents_price_cents as price_cents, a.presents_days as days, a.presents_occasions as occasions, a.presents_blurb as blurb,
         coalesce(sv.mux_playback_id, iv.mux_playback_id) as sample_playback_id,
         a.presents_open_limit as open_limit,
         (select count(*) from public.presents_requests r where r.athlete_id = a.user_id and r.status in ('open','flagged','in_review')) as open_requests,
         (a.presents_paused_until is not null and a.presents_paused_until > now()) as paused,
         ((a.presents_paused_until is null or a.presents_paused_until <= now())
           and (select count(*) from public.presents_requests r where r.athlete_id = a.user_id and r.status in ('open','flagged','in_review')) < a.presents_open_limit) as available,
         (select round(avg(r.rating)::numeric, 1) from public.presents_requests r where r.athlete_id = a.user_id and r.rating is not null) as avg_rating,
         (select count(*) from public.presents_requests r where r.athlete_id = a.user_id and r.rating is not null) as rating_count,
         (select count(*) from public.presents_requests r where r.athlete_id = a.user_id and r.status = 'delivered') as delivered_count
    from public.athletes a
    left join public.mentor_tiers t on t.key = a.tier
    left join public.media sv on sv.id = a.presents_sample_media_id and sv.status = 'ready'::public.media_status
    left join public.media iv on iv.id = a.video_media_id and iv.status = 'ready'::public.media_status
   where a.status = 'approved' and a.blocked_at is null and a.deleted_at is null
     and a.presents_enabled and a.presents_blocked_at is null and a.presents_price_cents is not null;
alter view public.presents_providers set (security_invoker = false);
grant select on public.presents_providers to anon, authenticated;

-- The marketplace lists mentoring athletes only, and carries the Presents badge.
create or replace view public.marketplace_mentors as
  select a.user_id, a.slug, a.display_name, a.tier, a.highest_level, a.current_team, a.badges,
         a.positions, a.specialties, a.bio, a.photo_media_id, a.photo_path, a.video_media_id,
         v.mux_playback_id as video_playback_id,
         a.capacity_on_deck,
         coalesce(s.jobs_on_deck, 0::bigint) as jobs_on_deck,
         coalesce(s.jobs_on_deck, 0::bigint) < a.capacity_on_deck as available,
         s.avg_turnaround_hours, s.avg_rating, s.rating_count, s.jobs_completed, s.sessions_completed,
         a.eliteprospects_url,
         t.name as tier_name, t.sort as tier_sort, t.price_visible, t.description as tier_description, a.featured,
         t.visible as in_listing,
         t.color as tier_color,
         coalesce(t.turnaround_hours, (select (st.rules ->> 'turnaround_hours')::int from public.settings st where st.id = 1)) as turnaround_hours,
         case when t.price_visible then coalesce((a.price_overrides ->> 'breakdown')::int,    t.breakdown_price_cents) end as breakdown_cents,
         case when t.price_visible then coalesce((a.price_overrides ->> 'film_room_30')::int, t.film_room_30_cents) end    as film_room_30_cents,
         case when t.price_visible then coalesce((a.price_overrides ->> 'film_room_60')::int, t.film_room_60_cents) end    as film_room_60_cents,
         case when t.price_visible then coalesce((a.price_overrides ->> 'addon_30')::int,     t.addon_30_cents) end        as addon_30_cents,
         case when t.price_visible then coalesce((a.price_overrides ->> 'season_arc')::int,   t.season_arc_cents) end      as season_arc_cents,
         a.teaching_focus, a.who_i_help,
         a.awards, a.career_note,
         (a.presents_enabled and a.presents_blocked_at is null and a.presents_price_cents is not null) as presents_enabled,
         case when a.presents_enabled and a.presents_blocked_at is null then a.presents_price_cents end as presents_price_cents
    from public.athletes a
    join public.mentor_tiers t on t.key = a.tier
    left join public.mentor_stats s on s.athlete_id = a.user_id
    left join public.media v on v.id = a.video_media_id and v.status = 'ready'::public.media_status
   where a.status = 'approved' and a.blocked_at is null and a.deleted_at is null and a.offers_mentoring
     and a.listed and t.archived_at is null and (t.visible or t.direct_link);
alter view public.marketplace_mentors set (security_invoker = false);
grant select on public.marketplace_mentors to anon, authenticated;

-- Guards: Presents fields the athlete controls; the switch-off, mentoring flag and age rule FLP controls.
create or replace function public.guard_athlete_insert() returns trigger
language plpgsql as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    new.status := 'applied';
    new.tier := null;
    new.verified := false;
    new.approved_at := null;
    new.approved_by := null;
    new.payouts_enabled := false;
    new.stripe_account_id := null;
    new.blocked_at := null;
    new.deleted_at := null;
    new.presents_enabled := false;
    new.presents_blocked_at := null;
  end if;
  return new;
end $$;

create or replace function public.guard_athlete_admin_fields() returns trigger
language plpgsql as $$
declare
  lo int;
  hi int;
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.verified is distinct from old.verified or new.blocked_at is distinct from old.blocked_at
       or new.deleted_at is distinct from old.deleted_at then
      raise exception 'only an admin can change verification or block state';
    end if;
    if new.listed is distinct from old.listed or new.featured is distinct from old.featured then
      raise exception 'marketplace listing is managed by FLP';
    end if;
    if new.price_overrides is distinct from old.price_overrides then
      raise exception 'pricing is managed by FLP';
    end if;
    if new.tier is distinct from old.tier then
      raise exception 'only an FLP admin can change a mentor''s tier';
    end if;
    if new.stripe_account_id is distinct from old.stripe_account_id then
      raise exception 'the payout account is managed by FLP';
    end if;
    if new.offers_mentoring is distinct from old.offers_mentoring then
      raise exception 'adding or removing mentoring goes through FLP';
    end if;
    if new.presents_blocked_at is distinct from old.presents_blocked_at then
      raise exception 'only an FLP admin can switch First Line Presents off for an athlete';
    end if;
    if new.presents_sample_media_id is distinct from old.presents_sample_media_id and new.presents_sample_media_id is not null
       and not exists (select 1 from public.media m where m.id = new.presents_sample_media_id and m.owner_id = auth.uid() and m.purpose::text in ('presents_sample', 'intro_video')) then
      raise exception 'the sample video must be your own upload';
    end if;
    if new.presents_enabled and not old.presents_enabled then
      if exists (select 1 from public.athlete_applications ap where ap.user_id = new.user_id and ap.age is not null and ap.age < 18) then
        raise exception 'First Line Presents is open to athletes 18 and over';
      end if;
    end if;
    if new.presents_price_cents is distinct from old.presents_price_cents and new.presents_price_cents is not null then
      select coalesce((st.rules ->> 'presents_min_cents')::int, 2000), coalesce((st.rules ->> 'presents_max_cents')::int, 50000)
        into lo, hi from public.settings st where st.id = 1;
      if new.presents_price_cents < lo or new.presents_price_cents > hi then
        raise exception 'the price must be between $% and $%', lo / 100, hi / 100;
      end if;
    end if;
    if new.video_media_id is distinct from old.video_media_id and new.video_media_id is not null
       and not exists (select 1 from public.media m where m.id = new.video_media_id and m.owner_id = auth.uid() and m.purpose = 'intro_video') then
      raise exception 'the intro video must be your own upload';
    end if;
    if new.photo_media_id is distinct from old.photo_media_id and new.photo_media_id is not null
       and not exists (select 1 from public.media m where m.id = new.photo_media_id and m.owner_id = auth.uid()) then
      raise exception 'the profile photo must be your own upload';
    end if;
  end if;
  return new;
end $$;

-- Sign-up: a Presents-only application sets offers_mentoring = false.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  listed boolean;
  app jsonb;
  base text;
  s text;
  n int := 0;
  mots text[];
  yrs int;
  agr jsonb;
begin
  select exists (
    select 1 from public.settings st, jsonb_array_elements_text(st.admin_emails) e
     where st.id = 1 and lower(e) = lower(coalesce(new.email, ''))
  ) into listed;
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    case
      when listed then 'admin'::public.user_role
      when new.raw_user_meta_data ->> 'role' = 'athlete' then 'athlete'::public.user_role
      else 'parent'::public.user_role
    end
  )
  on conflict (id) do nothing;

  app := new.raw_user_meta_data -> 'application';
  if not listed and new.raw_user_meta_data ->> 'role' = 'athlete' and jsonb_typeof(app) = 'object' then
    base := trim(both '-' from regexp_replace(lower(coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), 'mentor')), '[^a-z0-9]+', '-', 'g'));
    if base = '' then base := 'mentor'; end if;
    s := base || '-' || substr(md5(new.id::text), 1, 4);
    while exists (select 1 from public.athletes a where a.slug = s) loop
      n := n + 1; s := base || '-' || substr(md5(new.id::text || n::text), 1, 4);
    end loop;
    insert into public.athletes (user_id, slug, display_name, bio, positions, credentials, current_team, eliteprospects_url, offers_mentoring)
    values (
      new.id, s,
      coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), 'FLP Mentor'),
      left(coalesce(app ->> 'bio', ''), 1000),
      coalesce((select array_agg(x::public.hockey_position) from jsonb_array_elements_text(coalesce(app -> 'positions', '[]'::jsonb)) x
                 where x = any (enum_range(null::public.hockey_position)::text[])), '{}'::public.hockey_position[]),
      case when coalesce(app ->> 'team', '') <> '' then jsonb_build_array(jsonb_build_object('label', left(app ->> 'team', 120))) else '[]'::jsonb end,
      left(coalesce(app ->> 'team', ''), 120),
      nullif(left(app ->> 'eliteprospects_url', 300), ''),
      coalesce(app ->> 'offers_mentoring', 'true') <> 'false'
    )
    on conflict (user_id) do nothing;

    mots := coalesce((select array_agg(distinct x) from jsonb_array_elements_text(
              case when jsonb_typeof(app -> 'motivations') = 'array' then app -> 'motivations' else '[]'::jsonb end) x
              where x in ('money','fulltime','help','multiple','other')), '{}'::text[]);
    yrs := case when (app ->> 'age') ~ '^[0-9]{1,3}$' and (app ->> 'age')::int between 13 and 110 then (app ->> 'age')::int end;
    agr := case when jsonb_typeof(app -> 'agreement') = 'object' then app -> 'agreement' else null end;
    insert into public.athlete_applications (user_id, motivations, motivation_other, special_circumstances, age, gender,
            agreement_version, agreement_signed_name, agreement_residence, agreement_guardian_name, agreement_signed_at, agreement_user_agent)
    values (new.id, mots, nullif(left(app ->> 'motivation_other', 1000), ''), nullif(left(app ->> 'special_circumstances', 1000), ''), yrs,
            case when app ->> 'gender' in ('male','female','nonbinary','unspecified') then app ->> 'gender' end,
            nullif(left(agr ->> 'version', 60), ''),
            nullif(left(agr ->> 'signed_name', 200), ''),
            nullif(left(agr ->> 'residence', 120), ''),
            nullif(left(agr ->> 'guardian_name', 200), ''),
            case when coalesce(agr ->> 'signed_name', '') <> '' then now() end,
            nullif(left(agr ->> 'user_agent', 400), ''))
    on conflict (user_id) do nothing;
  end if;
  return new;
end $$;
