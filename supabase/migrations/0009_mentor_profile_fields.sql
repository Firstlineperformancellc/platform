-- Mentor self-service: a profile photo (Supabase Storage, public bucket "avatars") and the intro
-- video's playback id surfaced on the marketplace. Availability windows already exist (0004).
alter table public.athletes add column if not exists photo_path text;

insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true) on conflict (id) do nothing;

-- Mentors may manage files under their own user id; everyone may read (public bucket).
drop policy if exists avatars_owner_write on storage.objects;
create policy avatars_owner_write on storage.objects for all to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists avatars_public_read on storage.objects;
create policy avatars_public_read on storage.objects for select to anon, authenticated using (bucket_id = 'avatars');

-- column set changes, so drop and recreate (CREATE OR REPLACE cannot reorder view columns)
drop view if exists public.marketplace_mentors;
create view public.marketplace_mentors with (security_invoker = false) as
  select a.user_id, a.slug, a.display_name, a.tier, a.highest_level, a.current_team, a.badges,
         a.positions, a.specialties, a.bio, a.photo_media_id, a.photo_path, a.video_media_id,
         v.mux_playback_id as video_playback_id,
         a.capacity_on_deck,
         coalesce(s.jobs_on_deck, 0) as jobs_on_deck,
         coalesce(s.jobs_on_deck, 0) < a.capacity_on_deck as available,
         s.avg_turnaround_hours, s.avg_rating, s.rating_count, s.jobs_completed
    from public.athletes a
    left join public.mentor_stats s on s.athlete_id = a.user_id
    left join public.media v on v.id = a.video_media_id and v.status = 'ready'
   where a.status = 'approved' and a.tier is not null and a.blocked_at is null and a.deleted_at is null;
grant select on public.marketplace_mentors to anon, authenticated;

-- Published reviews are public on the mentor's profile (first name of the parent only, no email).
create or replace view public.mentor_reviews with (security_invoker = false) as
  select j.athlete_id, b.id as breakdown_id, b.rating, b.review, b.reviewed_at,
         split_part(p.full_name, ' ', 1) as parent_first_name, o.age_group, o.position
    from public.breakdowns b
    join public.jobs j on j.id = b.job_id
    join public.orders o on o.id = j.order_id
    join public.profiles p on p.id = o.parent_id
   where b.review_status = 'published' and b.rating is not null;
grant select on public.mentor_reviews to anon, authenticated;
