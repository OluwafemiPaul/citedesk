-- CiteDesk 0004: public chat, conversations, tickets and dashboard data (Week 3).

-- Bot additions: public help page address, install check, data retention.
alter table bots add column slug text unique;
alter table bots add column installed_at timestamptz;
alter table bots add column installed_on text;
alter table bots add column retention_days int not null default 90 check (retention_days in (30, 90, 365));
alter table bots add column show_powered_by boolean not null default true;

-- Self hosted mode: approve requests automatically (FRD F13.3).
alter table platform_settings add column auto_approve boolean not null default false;

create table conversations (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts (id) on delete cascade,
  bot_id uuid not null references bots (id) on delete cascade,
  visitor_id text not null,
  channel text not null check (channel in ('widget', 'help')),
  page_url text,
  handoff boolean not null default false,
  message_count int not null default 0,
  started_at timestamptz not null default now(),
  last_at timestamptz not null default now()
);
create index conversations_bot_idx on conversations (bot_id, last_at desc);
create index conversations_visitor_idx on conversations (bot_id, visitor_id, last_at desc);

create table messages (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts (id) on delete cascade,
  conversation_id uuid not null references conversations (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  question text,                          -- for assistant rows: the question being answered (gaps report)
  citations jsonb not null default '[]',  -- [{id, title, url}]
  confidence text,
  status text,                            -- answered, handoff, unavailable
  handoff_reason text,
  ticket jsonb,                           -- draft ticket from the engine, used if the visitor leaves an email
  rating smallint check (rating in (-1, 1)),
  created_at timestamptz not null default now()
);
create index messages_conv_idx on messages (conversation_id, created_at);
create index messages_account_idx on messages (account_id, created_at desc);

create table tickets (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts (id) on delete cascade,
  bot_id uuid not null references bots (id) on delete cascade,
  conversation_id uuid references conversations (id) on delete set null,
  summary text not null,
  category text not null,
  priority text not null check (priority in ('low', 'normal', 'high', 'urgent')),
  reason text not null,
  question text not null,
  transcript text not null,               -- kept even if the conversation is deleted by retention
  visitor_email text not null,
  visitor_name text,
  status text not null default 'open' check (status in ('open', 'closed')),
  email_status text,                      -- sent, failed, over_limit, no_handoff_email
  created_at timestamptz not null default now(),
  closed_at timestamptz
);
create index tickets_account_idx on tickets (account_id, status, created_at desc);

grant all on conversations, messages, tickets to service_role;
grant select on conversations, messages, tickets to authenticated;

alter table conversations enable row level security;
alter table messages enable row level security;
alter table tickets enable row level security;

create policy "owner reads conversations" on conversations for select using (is_platform_owner());
create policy "business reads own conversations" on conversations for select using (account_id = my_account_id());
create policy "owner reads messages" on messages for select using (is_platform_owner());
create policy "business reads own messages" on messages for select using (account_id = my_account_id());
create policy "owner reads tickets" on tickets for select using (is_platform_owner());
create policy "business reads own tickets" on tickets for select using (account_id = my_account_id());

-- Daily cleanup (FRD F12.8): delete conversations older than each bot's retention setting,
-- and email log entries older than 180 days. Tickets keep their own transcript copy.
create or replace function cleanup_old_data()
returns int language plpgsql security definer set search_path = public
as $$
declare removed int;
begin
  delete from conversations c using bots b
  where c.bot_id = b.id and c.last_at < now() - make_interval(days => b.retention_days);
  get diagnostics removed = row_count;
  delete from email_log where created_at < now() - interval '180 days';
  delete from import_jobs where created_at < now() - interval '90 days';
  return removed;
end $$;
revoke execute on function public.cleanup_old_data from public, anon, authenticated;
grant execute on function public.cleanup_old_data to service_role;
