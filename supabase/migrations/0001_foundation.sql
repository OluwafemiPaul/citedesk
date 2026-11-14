-- CiteDesk Week 1 foundation: accounts, people, access requests, approval history,
-- usage counters and platform settings, protected by row level security.
-- Run this once in the Supabase SQL editor (or with the Supabase CLI).


-- Types ---------------------------------------------------------------------

create type account_status as enum ('pending', 'approved', 'paused', 'declined', 'closed');
create type user_role as enum ('platform_owner', 'business_owner');
create type request_status as enum ('new', 'approved', 'declined', 'info_requested');

-- Tables --------------------------------------------------------------------

-- One business.
create table accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  website text,
  business_type text,
  contact_name text,
  contact_email text not null,
  status account_status not null default 'pending',
  plan text not null default 'free',
  -- Plan limits (FRD F4). Each account gets its own copy so the owner can raise one account's limits.
  limits jsonb not null default '{
    "bots": 1,
    "pages_per_bot": 50,
    "imports_per_month": 2,
    "files": 20,
    "file_mb": 10,
    "storage_mb": 50,
    "messages_per_month": 1000,
    "handoff_emails_per_month": 200,
    "team_members": 1
  }'::jsonb,
  status_reason text,
  created_at timestamptz not null default now(),
  approved_at timestamptz
);
create unique index accounts_contact_email_idx on accounts (lower(contact_email));

-- People who can sign in. One row per Supabase auth user.
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  role user_role not null default 'business_owner',
  account_id uuid references accounts (id) on delete set null,
  created_at timestamptz not null default now()
);

-- Request access form entries (FRD F1). Inserted only by the server after the bot check.
create table access_requests (
  id uuid primary key default gen_random_uuid(),
  business_name text not null,
  contact_name text not null,
  email text not null,
  website text,
  business_type text,
  page_estimate int,
  use_case text,
  ip text,
  status request_status not null default 'new',
  account_id uuid references accounts (id) on delete set null,
  reviewed_by uuid references profiles (id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now()
);
create index access_requests_status_idx on access_requests (status, created_at desc);
create index access_requests_email_idx on access_requests (lower(email), created_at desc);
create index access_requests_ip_idx on access_requests (ip, created_at desc);

-- Every status change and owner action (FRD F2.5, F3.9).
create table account_events (
  id bigint generated always as identity primary key,
  account_id uuid references accounts (id) on delete cascade,
  actor uuid references profiles (id) on delete set null,
  event text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index account_events_account_idx on account_events (account_id, created_at desc);

-- Monthly usage counters per account (FRD F3.3, F4).
create table usage_monthly (
  account_id uuid not null references accounts (id) on delete cascade,
  month date not null,
  messages int not null default 0,
  imports int not null default 0,
  pages int not null default 0,
  storage_bytes bigint not null default 0,
  handoff_emails int not null default 0,
  primary key (account_id, month)
);

-- Single row of platform wide switches and cost settings (FRD F1.7, F3.4, F3.6, F3.8).
create table platform_settings (
  id int primary key default 1 check (id = 1),
  requests_paused boolean not null default false,
  imports_paused boolean not null default false,
  cost_alert_usd numeric not null default 10,
  -- Estimated cost per unit, used only for the owner's cost estimate.
  unit_costs jsonb not null default '{
    "per_1000_messages": 0.05,
    "per_import": 0.01,
    "per_gb_storage_month": 0.02,
    "per_1000_emails": 0.40
  }'::jsonb,
  updated_at timestamptz not null default now()
);
insert into platform_settings (id) values (1);

-- Helper functions ------------------------------------------------------------

create or replace function public.is_platform_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'platform_owner');
$$;

create or replace function public.my_account_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select account_id from profiles where id = auth.uid();
$$;

-- Create a profile automatically when someone signs in for the first time.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Atomically add to this month's usage counters. Called by the server only.
create or replace function public.add_usage(
  p_account uuid,
  p_messages int default 0,
  p_imports int default 0,
  p_pages int default 0,
  p_storage_bytes bigint default 0,
  p_handoff_emails int default 0
)
returns usage_monthly
language sql
security definer
set search_path = public
as $$
  insert into usage_monthly (account_id, month, messages, imports, pages, storage_bytes, handoff_emails)
  values (p_account, date_trunc('month', now())::date, p_messages, p_imports, p_pages, p_storage_bytes, p_handoff_emails)
  on conflict (account_id, month) do update set
    messages = usage_monthly.messages + excluded.messages,
    imports = usage_monthly.imports + excluded.imports,
    pages = usage_monthly.pages + excluded.pages,
    storage_bytes = usage_monthly.storage_bytes + excluded.storage_bytes,
    handoff_emails = usage_monthly.handoff_emails + excluded.handoff_emails
  returning *;
$$;
revoke execute on function public.add_usage from public, anon, authenticated;

-- Row level security ----------------------------------------------------------
-- Rule of thumb: the platform owner can read everything; a business owner can read
-- only their own account. All writes that matter go through the server, which uses
-- the secret key and checks permissions itself.

alter table accounts enable row level security;
alter table profiles enable row level security;
alter table access_requests enable row level security;
alter table account_events enable row level security;
alter table usage_monthly enable row level security;
alter table platform_settings enable row level security;

create policy "owner reads all accounts" on accounts for select using (is_platform_owner());
create policy "business reads own account" on accounts for select using (id = my_account_id());

create policy "owner reads all profiles" on profiles for select using (is_platform_owner());
create policy "user reads own profile" on profiles for select using (id = auth.uid());

create policy "owner reads requests" on access_requests for select using (is_platform_owner());

create policy "owner reads events" on account_events for select using (is_platform_owner());
create policy "business reads own events" on account_events for select using (account_id = my_account_id());

create policy "owner reads usage" on usage_monthly for select using (is_platform_owner());
create policy "business reads own usage" on usage_monthly for select using (account_id = my_account_id());

create policy "owner reads settings" on platform_settings for select using (is_platform_owner());
