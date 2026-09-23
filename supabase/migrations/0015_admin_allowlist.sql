-- Admin seats by allowlist: an account whose email is in settings.admin_emails is created as an
-- admin the moment it signs up, whichever form it used. The list is set per project with
-- deploy/set-admin-emails.sh (Alex and Bryan on production). Later seats can still be granted
-- from the admin panel.
alter table public.settings add column if not exists admin_emails jsonb not null default '[]'::jsonb;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  listed boolean;
begin
  select exists (
    select 1 from public.settings s, jsonb_array_elements_text(s.admin_emails) e
     where s.id = 1 and lower(e) = lower(coalesce(new.email, ''))
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
  return new;
end $$;
