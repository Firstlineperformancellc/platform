-- The admin-only guards on athletes fired for service-role and migration writes too, because
-- auth.uid() is null there and is_admin() is therefore false. Server-side writes (the API with the
-- service key, and admin SQL) carry no user id; the guards should only constrain signed-in users.
create or replace function public.guard_athlete_status() returns trigger
language plpgsql as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.status is distinct from old.status or new.approved_at is distinct from old.approved_at
       or new.payouts_enabled is distinct from old.payouts_enabled then
      raise exception 'only an admin can change athlete status';
    end if;
  end if;
  return new;
end $$;

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
  end if;
  return new;
end $$;

create or replace function public.guard_profile_role() returns trigger
language plpgsql as $$
begin
  if auth.uid() is not null and new.role is distinct from old.role and not public.is_admin() then
    raise exception 'only an admin can change a role';
  end if;
  return new;
end $$;
