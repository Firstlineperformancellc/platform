-- Admin Users page: account state on profiles, an admin-only directory view with spend and
-- activity counts, and an admin-only activity timeline across the tables that record what a
-- person did. Suspension and deletion are enforced at the auth layer (bans) by the API; these
-- columns make the state visible and let the API refuse calls from suspended accounts.

alter table public.profiles
  add column if not exists suspended_at timestamptz,
  add column if not exists suspended_reason text,
  add column if not exists deleted_at timestamptz;

-- Directory: one row per account, admin eyes only.
create or replace view public.admin_users with (security_invoker = false) as
  select p.id, p.email, p.full_name, p.role, p.created_at, p.suspended_at, p.suspended_reason, p.deleted_at,
         u.last_sign_in_at, u.email_confirmed_at, u.banned_until,
         a.slug as mentor_slug, a.status as mentor_status, a.tier as mentor_tier,
         (select count(*) from public.players pl where pl.parent_id = p.id) as players,
         (select count(*) from public.orders o where o.parent_id = p.id and o.paid_at is not null) as orders,
         (select coalesce(sum(o.price_cents), 0) from public.orders o where o.parent_id = p.id and o.paid_at is not null and o.status <> 'refunded') as spent_orders_cents,
         (select coalesce(sum(s.price_cents), 0) from public.sessions s where s.parent_id = p.id and s.paid_at is not null and s.status not in ('cancelled','declined','expired','no_show_mentor')) as spent_sessions_cents,
         (select coalesce(sum(k.price_cents), 0) from public.session_packs k where k.parent_id = p.id and k.paid_at is not null) as spent_packs_cents,
         (select coalesce(sum(o.price_cents), 0) from public.orders o where o.parent_id = p.id and o.status = 'refunded') as refunded_cents,
         (select count(*) from public.sessions s where s.parent_id = p.id or s.athlete_id = p.id) as sessions,
         (select count(*) from public.jobs j where j.athlete_id = p.id and j.status in ('delivered','closed')) as breakdowns_delivered,
         (select coalesce(sum(y.amount_cents), 0) from public.payouts y where y.athlete_id = p.id and y.status in ('owed','held','paid')) as earned_cents,
         (select coalesce(sum(y.amount_cents), 0) from public.payouts y where y.athlete_id = p.id and y.status = 'paid') as paid_out_cents
    from public.profiles p
    join auth.users u on u.id = p.id
    left join public.athletes a on a.user_id = p.id
   where public.is_admin();
revoke all on public.admin_users from anon;
grant select on public.admin_users to authenticated;

-- Timeline: the major events involving a person, newest first when queried.
create or replace view public.admin_user_activity with (security_invoker = false) as
  select * from (
    select p.id as user_id, p.created_at as at, 'account.created' as kind, p.role::text as detail, null::uuid as ref from public.profiles p
    union all
    select u.id, u.last_sign_in_at, 'signed_in', null, null from auth.users u where u.last_sign_in_at is not null
    union all
    select o.parent_id, o.paid_at, 'order.placed', 'breakdown · ' || o.tier || ' · $' || (o.price_cents / 100)::text, o.id from public.orders o where o.paid_at is not null
    union all
    select o.parent_id, o.refunded_at, 'order.refunded', '$' || (o.price_cents / 100)::text, o.id from public.orders o where o.refunded_at is not null
    union all
    select o.parent_id, m.created_at, 'film.uploaded', coalesce(m.title, ''), o.id from public.orders o join public.media m on m.id = o.film_media_id
    union all
    select j.athlete_id, j.accepted_at, 'job.accepted', null, j.order_id from public.jobs j where j.accepted_at is not null and j.athlete_id is not null
    union all
    select j.athlete_id, j.delivered_at, 'breakdown.delivered', case when j.on_time then 'on time' else 'late' end, j.order_id from public.jobs j where j.delivered_at is not null and j.athlete_id is not null
    union all
    select o.parent_id, j.delivered_at, 'breakdown.received', null, o.id from public.jobs j join public.orders o on o.id = j.order_id where j.delivered_at is not null
    union all
    select o.parent_id, b.reviewed_at, 'review.left', b.rating::text || ' stars', b.id from public.breakdowns b join public.jobs j on j.id = b.job_id join public.orders o on o.id = j.order_id where b.reviewed_at is not null
    union all
    select q.filed_by, q.opened_at, 'audit.filed', left(q.reason, 80), q.id from public.quality_audits q
    union all
    select q.filed_by, q.closed_at, 'audit.closed', q.outcome, q.id from public.quality_audits q where q.closed_at is not null
    union all
    select s.parent_id, s.created_at, 'session.booked', s.format || case when s.pack_id is not null then ' · credit' else ' · $' || (s.price_cents / 100)::text end, s.id from public.sessions s
    union all
    select s.athlete_id, s.created_at, 'session.requested', s.format, s.id from public.sessions s
    union all
    select s.athlete_id, s.ended_at, 'session.completed', null, s.id from public.sessions s where s.status = 'completed' and s.ended_at is not null
    union all
    select s.parent_id, s.ended_at, 'session.completed', null, s.id from public.sessions s where s.status = 'completed' and s.ended_at is not null
    union all
    select s.parent_id, s.cancelled_at, 'session.' || s.status, s.cancel_reason, s.id from public.sessions s where s.cancelled_at is not null
    union all
    select s.parent_id, s.reviewed_at, 'review.left', s.rating::text || ' stars', s.id from public.sessions s where s.reviewed_at is not null
    union all
    select k.parent_id, k.paid_at, 'pack.bought', 'Season Arc · $' || (k.price_cents / 100)::text, k.id from public.session_packs k where k.paid_at is not null
    union all
    select y.athlete_id, y.paid_at, 'payout.paid', '$' || (y.amount_cents / 100)::text, y.id from public.payouts y where y.paid_at is not null
    union all
    select l.target_id, l.created_at, 'admin.' || l.action, coalesce(l.meta->>'reason', l.meta->>'status', l.meta->>'mode', ''), null from public.audit_log l where l.target_type in ('profile','athlete','user') and l.target_id is not null
  ) x
  where public.is_admin() and x.at is not null;
revoke all on public.admin_user_activity from anon;
grant select on public.admin_user_activity to authenticated;
