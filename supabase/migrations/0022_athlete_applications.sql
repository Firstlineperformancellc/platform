-- Application answers move out of public.athletes (readable by everyone once a mentor is approved)
-- into public.athlete_applications, readable only by the applicant and admins. Adds age, and
-- "why do you want to mentor" becomes multi-select.

create table if not exists public.athlete_applications (
  user_id               uuid primary key references public.athletes (user_id) on delete cascade,
  motivations           text[] not null default '{}' check (motivations <@ array['money','fulltime','help','multiple','other']::text[]),
  motivation_other      text,
  special_circumstances text,
  age                   int check (age between 13 and 110),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create trigger athlete_applications_updated before update on public.athlete_applications for each row execute function public.set_updated_at();

-- carry over anything 0021 stored on the mentor row
insert into public.athlete_applications (user_id, motivations, motivation_other, special_circumstances)
  select user_id, case when motivation is null then '{}'::text[] else array[motivation] end, motivation_other, special_circumstances
    from public.athletes
   where motivation is not null or motivation_other is not null or special_circumstances is not null
  on conflict (user_id) do nothing;
alter table public.athletes
  drop column if exists motivation,
  drop column if exists motivation_other,
  drop column if exists special_circumstances;

alter table public.athlete_applications enable row level security;
create policy athlete_applications_read on public.athlete_applications for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy athlete_applications_self_insert on public.athlete_applications for insert to authenticated
  with check (user_id = auth.uid());
create policy athlete_applications_self_update on public.athlete_applications for update to authenticated
  using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());

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

  -- A mentor application submitted with the sign-up: create the applicant row and the answers now.
  app := new.raw_user_meta_data -> 'application';
  if not listed and new.raw_user_meta_data ->> 'role' = 'athlete' and jsonb_typeof(app) = 'object' then
    base := trim(both '-' from regexp_replace(lower(coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), 'mentor')), '[^a-z0-9]+', '-', 'g'));
    if base = '' then base := 'mentor'; end if;
    s := base || '-' || substr(md5(new.id::text), 1, 4);
    while exists (select 1 from public.athletes a where a.slug = s) loop
      n := n + 1; s := base || '-' || substr(md5(new.id::text || n::text), 1, 4);
    end loop;
    insert into public.athletes (user_id, slug, display_name, bio, positions, credentials, current_team, eliteprospects_url)
    values (
      new.id, s,
      coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), 'FLP Mentor'),
      left(coalesce(app ->> 'bio', ''), 1000),
      coalesce((select array_agg(x::public.hockey_position) from jsonb_array_elements_text(coalesce(app -> 'positions', '[]'::jsonb)) x
                 where x = any (enum_range(null::public.hockey_position)::text[])), '{}'::public.hockey_position[]),
      case when coalesce(app ->> 'team', '') <> '' then jsonb_build_array(jsonb_build_object('label', left(app ->> 'team', 120))) else '[]'::jsonb end,
      left(coalesce(app ->> 'team', ''), 120),
      nullif(left(app ->> 'eliteprospects_url', 300), '')
    )
    on conflict (user_id) do nothing;

    mots := coalesce((select array_agg(distinct x) from jsonb_array_elements_text(
              case when jsonb_typeof(app -> 'motivations') = 'array' then app -> 'motivations' else '[]'::jsonb end) x
              where x in ('money','fulltime','help','multiple','other')), '{}'::text[]);
    yrs := case when (app ->> 'age') ~ '^[0-9]{1,3}$' and (app ->> 'age')::int between 13 and 110 then (app ->> 'age')::int end;
    insert into public.athlete_applications (user_id, motivations, motivation_other, special_circumstances, age)
    values (new.id, mots, nullif(left(app ->> 'motivation_other', 1000), ''), nullif(left(app ->> 'special_circumstances', 1000), ''), yrs)
    on conflict (user_id) do nothing;
  end if;
  return new;
end $$;
