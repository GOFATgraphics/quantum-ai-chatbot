-- Recurring background agents (e.g. every 24h: check Gmail, draft a summary).
-- Run in Supabase SQL editor.

create table if not exists public.agent_schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  kind text not null default 'daily_gmail_digest',
  title text not null default 'Daily email summary',
  enabled boolean not null default true,
  interval_hours int not null default 24 check (interval_hours between 1 and 168),
  next_run_at timestamptz not null default now(),
  last_run_at timestamptz,
  last_status text,
  last_error text,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists agent_schedules_due_idx
  on public.agent_schedules (enabled, next_run_at);

create index if not exists agent_schedules_user_idx
  on public.agent_schedules (user_id);

create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid references public.agent_schedules(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  status text not null default 'running' check (status in ('running', 'done', 'failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  result jsonb,
  error text
);

create index if not exists agent_runs_schedule_idx
  on public.agent_runs (schedule_id, started_at desc);

alter table public.agent_schedules enable row level security;
alter table public.agent_runs enable row level security;

create policy "Users can view own schedules"
  on public.agent_schedules for select using (auth.uid() = user_id);
create policy "Users can insert own schedules"
  on public.agent_schedules for insert with check (auth.uid() = user_id);
create policy "Users can update own schedules"
  on public.agent_schedules for update using (auth.uid() = user_id);
create policy "Users can delete own schedules"
  on public.agent_schedules for delete using (auth.uid() = user_id);

create policy "Users can view own runs"
  on public.agent_runs for select using (auth.uid() = user_id);
