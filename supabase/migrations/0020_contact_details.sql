-- Contact details on every account (phone existed; address is new), shown to admins on the Users
-- page. People edit their own from the parent Account page or the mentor profile page.
alter table public.profiles add column if not exists address text;

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
         (select coalesce(sum(y.amount_cents), 0) from public.payouts y where y.athlete_id = p.id and y.status = 'paid') as paid_out_cents,
         p.phone, p.address
    from public.profiles p
    join auth.users u on u.id = p.id
    left join public.athletes a on a.user_id = p.id
   where public.is_admin();
revoke all on public.admin_users from anon;
grant select on public.admin_users to authenticated;
