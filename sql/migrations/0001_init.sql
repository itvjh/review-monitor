-- 0001_init: core schema (businesses, reviews, automation_runs) + migration ledger. Safe to re-run.
create table if not exists schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);
alter table schema_migrations enable row level security;

create extension if not exists pgcrypto;

create table if not exists businesses (
  id uuid primary key default gen_random_uuid(),
  platform text not null default 'google',
  external_business_id text not null,
  business_name text not null,
  address text,
  profile_url text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (platform, external_business_id)
);

create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  platform text not null default 'google',
  business_id uuid not null references businesses(id) on delete cascade,
  review_hash text not null unique,
  external_review_id text,
  reviewer_name text,
  rating smallint not null check (rating between 1 and 5),
  review_text text not null default '',
  review_date date,
  review_date_raw text,
  owner_reply text,
  has_owner_reply boolean not null default false,
  sentiment text check (sentiment in ('positive', 'neutral', 'negative')),
  sentiment_score integer check (sentiment_score between -100 and 100),
  category text[] not null default '{}',
  priority text check (priority in ('low', 'medium', 'high', 'urgent')),
  requires_attention boolean not null default false,
  summary text,
  suggested_action text,
  language text,
  ai_confidence numeric check (ai_confidence between 0 and 1),
  raw_data jsonb,
  collected_at timestamptz not null default now(),
  analyzed_at timestamptz
);
create index if not exists reviews_business_collected on reviews (business_id, collected_at desc);
create index if not exists reviews_attention on reviews (priority) where requires_attention;

create table if not exists automation_runs (
  id uuid primary key default gen_random_uuid(),
  status text not null,            -- SUCCESS | PARTIAL | FAILED
  summary jsonb not null,
  errors jsonb not null default '[]',  -- [{business, error_code, error_message, screenshot, timestamp}]
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

-- RLS on, no policies: the public (anon) API sees nothing. A secret key or the postgres role bypasses RLS.
alter table businesses enable row level security;
alter table reviews enable row level security;
alter table automation_runs enable row level security;

insert into schema_migrations (version) values ('0001_init') on conflict do nothing;
