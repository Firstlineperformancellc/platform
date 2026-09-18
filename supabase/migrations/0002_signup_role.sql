-- Let an athlete application create an athlete-role profile at signup.
-- Only 'athlete' is honored from client metadata; admin is granted by hand, never at signup.

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    case when new.raw_user_meta_data ->> 'role' = 'athlete' then 'athlete'::public.user_role else 'parent'::public.user_role end
  )
  on conflict (id) do nothing;
  return new;
end $$;
