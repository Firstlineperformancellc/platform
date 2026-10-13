-- A mentor's tier sets their prices and share, so only an admin may set or change it, in any status.
-- Before this, a mentor who was not currently approved (applied, suspended, deactivated) could change
-- their own tier directly and keep it on reinstatement. New rows already have tier forced to null for
-- non-admins (guard_athlete_insert, 0013). Everything else in this guard is unchanged from 0025.
create or replace function public.guard_athlete_admin_fields() returns trigger
language plpgsql as $$
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
