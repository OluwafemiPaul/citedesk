-- CiteDesk 0003: bots, AI keys, verified domains, knowledge base and website imports (Week 2).
-- Every business owned table carries account_id so row level security can isolate businesses (FRD F14.1).

-- One bot per business for now (plan limit "bots" is 1). Settings from the setup wizard.
create table bots (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null unique references accounts (id) on delete cascade,
  public_id text not null unique default replace(gen_random_uuid()::text, '-', ''),
  name text not null default 'Help assistant',
  welcome_message text not null default 'Hi! Ask me anything about our business.',
  brand_color text not null default '#4f46e5',
  logo_url text,
  bubble_position text not null default 'right' check (bubble_position in ('left', 'right')),
  handoff_email text,
  hours_note text,
  custom_keywords text[] not null default '{}',
  provider text check (provider in ('anthropic', 'openai')),
  model text,
  setup_step int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Encrypted provider keys (FRD F6.4). Never readable from the browser: no grants to authenticated.
create table ai_keys (
  bot_id uuid primary key references bots (id) on delete cascade,
  account_id uuid not null references accounts (id) on delete cascade,
  provider text not null check (provider in ('anthropic', 'openai')),
  encrypted_key text not null,
  last4 text not null,
  last_tested_at timestamptz,
  last_test_ok boolean,
  last_error text,
  updated_at timestamptz not null default now()
);

-- Websites the business has proved it owns (FRD F7.1).
create table domains (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts (id) on delete cascade,
  domain text not null,
  token text not null default replace(gen_random_uuid()::text, '-', ''),
  method text check (method in ('meta', 'file', 'dns')),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (account_id, domain)
);

create table articles (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts (id) on delete cascade,
  bot_id uuid not null references bots (id) on delete cascade,
  title text not null,
  body text not null,
  source text not null check (source in ('website', 'upload', 'manual')),
  source_url text,
  source_name text,          -- file name for uploads
  status text not null default 'draft' check (status in ('draft', 'approved', 'archived')),
  content_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index articles_bot_idx on articles (bot_id, status, updated_at desc);
create unique index articles_bot_url_idx on articles (bot_id, source_url) where source_url is not null and source = 'website';

-- Searchable pieces of approved articles (FRD F8.5, F9.2). Full text search, no AI cost.
create table chunks (
  id bigint generated always as identity primary key,
  article_id uuid not null references articles (id) on delete cascade,
  bot_id uuid not null references bots (id) on delete cascade,
  ord int not null,
  text text not null,
  fts tsvector generated always as (to_tsvector('english', text)) stored
);
create index chunks_fts_idx on chunks using gin (fts);
create index chunks_bot_idx on chunks (bot_id);

-- Website imports run in small batches so they fit serverless time limits and can resume.
create table import_jobs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts (id) on delete cascade,
  bot_id uuid not null references bots (id) on delete cascade,
  domain text not null,
  status text not null default 'running' check (status in ('running', 'done', 'failed', 'stopped')),
  queue text[] not null default '{}',
  seen text[] not null default '{}',
  disallow text[] not null default '{}',   -- robots.txt rules for our user agent
  page_limit int not null,
  pages_imported int not null default 0,
  skipped jsonb not null default '[]',      -- [{url, reason}]
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index import_jobs_bot_idx on import_jobs (bot_id, created_at desc);

-- Search approved chunks for one bot. Any word may match (OR), ranked by cover density.
create or replace function search_chunks(p_bot uuid, p_query text, p_limit int default 6)
returns table (article_id uuid, title text, source_url text, text text, rank real)
language sql stable
set search_path = public
as $$
  with q as (
    select to_tsquery('simple', string_agg(quote_literal(l), ' | ')) as query
    from unnest(tsvector_to_array(to_tsvector('english', p_query))) as l
  )
  select c.article_id, a.title, a.source_url, c.text, ts_rank_cd(c.fts, q.query) as rank
  from chunks c
  join articles a on a.id = c.article_id and a.status = 'approved'
  cross join q
  where c.bot_id = p_bot and q.query is not null and c.fts @@ q.query
  order by rank desc
  limit greatest(1, least(p_limit, 20));
$$;

-- Bytes of article text a business stores, for the storage limit (FRD F4).
create or replace function article_storage(p_account uuid)
returns bigint language sql stable set search_path = public
as $$ select coalesce(sum(octet_length(title) + octet_length(body)), 0)::bigint from articles where account_id = p_account and status <> 'archived' $$;

-- Grants ------------------------------------------------------------------------
grant all on bots, ai_keys, domains, articles, chunks, import_jobs to service_role;
grant usage, select on all sequences in schema public to service_role;
grant select on bots, domains, articles, import_jobs to authenticated;
revoke execute on function public.search_chunks from public, anon, authenticated;
revoke execute on function public.article_storage from public, anon, authenticated;
grant execute on function public.article_storage to service_role;
grant execute on function public.search_chunks to service_role;

-- Row level security ----------------------------------------------------------------
alter table bots enable row level security;
alter table ai_keys enable row level security;
alter table domains enable row level security;
alter table articles enable row level security;
alter table chunks enable row level security;
alter table import_jobs enable row level security;

create policy "owner reads bots" on bots for select using (is_platform_owner());
create policy "business reads own bot" on bots for select using (account_id = my_account_id());
create policy "owner reads domains" on domains for select using (is_platform_owner());
create policy "business reads own domains" on domains for select using (account_id = my_account_id());
create policy "owner reads articles" on articles for select using (is_platform_owner());
create policy "business reads own articles" on articles for select using (account_id = my_account_id());
create policy "owner reads imports" on import_jobs for select using (is_platform_owner());
create policy "business reads own imports" on import_jobs for select using (account_id = my_account_id());
-- ai_keys and chunks: no policies, so only the server (service role) can read them.
