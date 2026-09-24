-- Support desk: tickets from email (support@firstlineperform.com), the app, and the marketing
-- site, answered from the admin panel. Writes go through the API; admins read under RLS.

create table if not exists public.support_tickets (
  id              uuid primary key default gen_random_uuid(),
  number          int generated always as identity,          -- the human ticket number: [FLP-123]
  subject         text not null default '',
  status          text not null default 'open' check (status in ('open','pending','resolved','closed')),
  priority        text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  channel         text not null default 'email' check (channel in ('email','app','site')),
  requester_email text not null,
  requester_name  text not null default '',
  requester_id    uuid references public.profiles (id) on delete set null,   -- matched by email when known
  assigned_to     uuid references public.profiles (id) on delete set null,
  tags            text[] not null default '{}',
  last_message_at timestamptz not null default now(),
  last_direction  text not null default 'in' check (last_direction in ('in','out','note')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  resolved_at     timestamptz
);
create unique index if not exists support_tickets_number_idx on public.support_tickets (number);
create index if not exists support_tickets_status_idx on public.support_tickets (status, last_message_at desc);
create index if not exists support_tickets_requester_idx on public.support_tickets (lower(requester_email));
create trigger support_tickets_updated before update on public.support_tickets for each row execute function public.set_updated_at();

create table if not exists public.support_messages (
  id            uuid primary key default gen_random_uuid(),
  ticket_id     uuid not null references public.support_tickets (id) on delete cascade,
  direction     text not null check (direction in ('in','out','note')),
  author_id     uuid references public.profiles (id) on delete set null,   -- admin for out/note
  from_email    text not null default '',
  to_email      text not null default '',
  subject       text not null default '',
  body_text     text not null default '',
  body_html     text,
  message_id    text,           -- email Message-ID we sent or received (threading)
  in_reply_to   text,
  attachments   jsonb not null default '[]'::jsonb,   -- [{name, size, url?}]
  created_at    timestamptz not null default now()
);
create index if not exists support_messages_ticket_idx on public.support_messages (ticket_id, created_at);
create unique index if not exists support_messages_message_id_idx on public.support_messages (message_id) where message_id is not null;

create table if not exists public.support_canned_replies (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  body        text not null,
  sort        int not null default 0,
  updated_by  uuid references public.profiles (id) on delete set null,
  updated_at  timestamptz not null default now()
);

alter table public.support_tickets enable row level security;
alter table public.support_messages enable row level security;
alter table public.support_canned_replies enable row level security;
-- admins read everything; a signed-in requester reads their own tickets and the non-note messages
create policy support_tickets_read on public.support_tickets for select to authenticated
  using (public.is_admin() or requester_id = auth.uid());
create policy support_messages_read on public.support_messages for select to authenticated
  using (public.is_admin() or (direction <> 'note' and exists (select 1 from public.support_tickets t where t.id = ticket_id and t.requester_id = auth.uid())));
create policy support_canned_read on public.support_canned_replies for select to authenticated using (public.is_admin());

insert into public.support_canned_replies (title, body, sort) values
 ('Got it, looking now', 'Thanks for reaching out. I''m looking into this now and will get back to you shortly.', 1),
 ('Need more detail', 'Thanks for the note. To track this down I need a little more: which page were you on, what did you tap, and what happened next? A screenshot helps a lot.', 2),
 ('Breakdown timing', 'Once your mentor accepts, they have 72 hours to deliver. You''ll get an email the moment it lands, and it also appears on your order page under Your breakdowns.', 3),
 ('Film Room join', 'The Join the room button appears on the session page 15 minutes before the start, for both you and your mentor. If it doesn''t, reload the page once; if it still doesn''t, reply here and we''ll sort it out.', 4),
 ('Resolved', 'This should be sorted now. Reply here if anything else comes up, and thanks for your patience.', 5)
on conflict do nothing;
