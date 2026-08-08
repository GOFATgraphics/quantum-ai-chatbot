-- Phase 2: Connectors
-- Run this in Supabase → SQL Editor

create table if not exists public.connectors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  provider text not null,
  account_email text,
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  scopes text[] default '{}',
  status text not null default 'connected' check (status in ('connected', 'error', 'revoked')),
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  unique (user_id, provider)
);

-- Expand allowed providers if table already existed with a tight check constraint
alter table public.connectors drop constraint if exists connectors_provider_check;
alter table public.connectors
  add constraint connectors_provider_check
  check (provider in (
    'gmail',
    'google_drive',
    'google_docs',
    'google_sheets',
    'google_calendar',
    'outlook',
    'excel'
  ));

create index if not exists connectors_user_id_idx on public.connectors(user_id);

alter table public.connectors enable row level security;

drop policy if exists "Users can view own connectors" on public.connectors;
create policy "Users can view own connectors"
  on public.connectors for select
  using (auth.uid() = user_id);

drop policy if exists "Users can delete own connectors" on public.connectors;
create policy "Users can delete own connectors"
  on public.connectors for delete
  using (auth.uid() = user_id);

-- Inserts/updates are done by the server with the service role key only.
