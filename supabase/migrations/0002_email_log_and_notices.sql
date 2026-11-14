-- CiteDesk 0002: email log and in app notices.
--
-- email_log records every email CiteDesk tries to send (sent, failed or only logged),
-- so the platform owner can see failures instead of guessing.
-- notices is the in app copy of anything important we email to a business, so nothing
-- is lost when an email fails or lands in spam.

create table email_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  account_id uuid references accounts (id) on delete set null,
  kind text not null,                 -- for example request_received, approved, limit_alert
  to_addresses text[] not null,
  subject text not null,
  body text not null,                 -- kept so the owner can copy it and send it by hand if needed
  provider text not null,             -- smtp, resend or log
  status text not null check (status in ('sent', 'failed', 'logged')),
  error text
);
create index email_log_created_idx on email_log (created_at desc);
create index email_log_status_idx on email_log (status, created_at desc);

create table notices (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  account_id uuid not null references accounts (id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null,
  read_at timestamptz
);
create index notices_account_idx on notices (account_id, created_at desc);

grant all on email_log, notices to service_role;
grant select on email_log, notices to authenticated;

alter table email_log enable row level security;
alter table notices enable row level security;

create policy "owner reads email log" on email_log for select using (is_platform_owner());
create policy "owner reads notices" on notices for select using (is_platform_owner());
create policy "business reads own notices" on notices for select using (account_id = my_account_id());
