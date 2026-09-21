-- Audit 2026-09-21: least privilege for direct client access. Every state change already goes
-- through the API (service role); these policies let clients write only what the app actually
-- writes (players, their own athlete profile) and read the rest. Also lets signed-out visitors
-- read prices and lists so the public marketplace renders.

-- settings: prices, rules and lists are public information
drop policy if exists settings_read on public.settings;
create policy settings_read on public.settings for select to anon, authenticated using (true);

-- orders: the parent reads; creation, film, status and money are API-only
drop policy if exists orders_parent on public.orders;
create policy orders_parent_read on public.orders for select to authenticated
  using (parent_id = auth.uid() or public.is_admin());

-- breakdowns: mentor and parent read; delivery, ratings and moderation are API-only
drop policy if exists breakdowns_athlete on public.breakdowns;
drop policy if exists breakdowns_parent_rate on public.breakdowns;
create policy breakdowns_athlete_read on public.breakdowns for select to authenticated
  using (public.athlete_holds_job(job_id) or public.is_admin());

-- media: the owner reads their own rows (upload progress); rows are created by the API
drop policy if exists media_owner on public.media;
create policy media_owner_read on public.media for select to authenticated
  using (owner_id = auth.uid() or public.is_admin());

-- quality audits: filed through the API (window check, payout hold, ownership)
drop policy if exists qca_parent_file on public.quality_audits;

-- athletes: an application always starts as a plain applicant, whatever the client sends
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
  end if;
  return new;
end $$;
drop trigger if exists athletes_insert_guard on public.athletes;
create trigger athletes_insert_guard before insert on public.athletes
  for each row execute function public.guard_athlete_insert();

-- athletes: the payout account is FLP's to set; media on the profile must be the mentor's own upload
create or replace function public.guard_athlete_admin_fields() returns trigger
language plpgsql as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.verified is distinct from old.verified or new.blocked_at is distinct from old.blocked_at
       or new.deleted_at is distinct from old.deleted_at then
      raise exception 'only an admin can change verification or block state';
    end if;
    if old.status = 'approved' and new.tier is distinct from old.tier then
      raise exception 'tier changes after approval go through an admin';
    end if;
    if new.stripe_account_id is distinct from old.stripe_account_id then
      raise exception 'the payout account is managed by FLP';
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

-- profiles: email mirrors the auth account and is what admin seats are granted by; users don't edit it
create or replace function public.guard_profile_role() returns trigger
language plpgsql as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.role is distinct from old.role then raise exception 'only an admin can change a role'; end if;
    if new.email is distinct from old.email then raise exception 'email is managed by your sign-in account'; end if;
  end if;
  return new;
end $$;
