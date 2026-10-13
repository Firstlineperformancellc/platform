-- Mentors sign the FLP Athlete Independent Contractor Agreement when they apply. The signature is
-- the typed full legal name, with the agreement version, residence, an optional guardian (minors),
-- the server time of signing and the browser it came from. Stored with the private application
-- answers (applicant + admins only). The sign-up trigger is 0023's with the agreement fields added.
alter table public.athlete_applications
  add column if not exists agreement_version text,
  add column if not exists agreement_signed_name text,
  add column if not exists agreement_residence text,
  add column if not exists agreement_guardian_name text,
  add column if not exists agreement_signed_at timestamptz,
  add column if not exists agreement_user_agent text;

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
