-- Suspension and deletion flags on a profile are set by admins through the API only. A user who
-- still holds an unexpired token must not be able to clear them with a direct update.
create or replace function public.guard_profile_role() returns trigger
language plpgsql as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.role is distinct from old.role then raise exception 'only an admin can change a role'; end if;
    if new.email is distinct from old.email then raise exception 'email is managed by your sign-in account'; end if;
    if new.suspended_at is distinct from old.suspended_at or new.suspended_reason is distinct from old.suspended_reason
       or new.deleted_at is distinct from old.deleted_at then
      raise exception 'account state is managed by FLP';
    end if;
  end if;
  return new;
end $$;
