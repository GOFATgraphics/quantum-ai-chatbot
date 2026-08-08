-- Phase 2: Connectors
-- Run this in Supabase → SQL Editor

create table if not exists public.connectors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  provider text not null check (provider in ('gmail', 'google_drive', 'google_sheets')),
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

create index if not exists connectors_user_id_idx on public.connectors(user_id);

alter table public.connectors enable row level security;

-- Users can see their own connector metadata (tokens are still in the table;
-- the client must only SELECT safe columns — see app code).
drop policy if exists "Users can view own connectors" on public.connectors;
create policy "Users can view own connectors"
  on public.connectors for select
  using (auth.uid() = user_id);

drop policy if exists "Users can delete own connectors" on public.connectors;
create policy "Users can delete own connectors"
  on public.connectors for delete
  using (auth.uid() = user_id);

-- Inserts/updates are done by the server with the service role key only.
-- No insert/update policies for authenticated clients on purpose.
