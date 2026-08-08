-- Run this in Supabase SQL Editor

-- Personal memory facts the AI learns about the user
create table if not exists public.user_memory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  fact text not null,
  category text default 'general',
  source text default 'chat',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists user_memory_user_id_idx on public.user_memory(user_id);

alter table public.user_memory enable row level security;

create policy "Users read own memory"
  on public.user_memory for select
  using (auth.uid() = user_id);

create policy "Users insert own memory"
  on public.user_memory for insert
  with check (auth.uid() = user_id);

create policy "Users update own memory"
  on public.user_memory for update
  using (auth.uid() = user_id);

create policy "Users delete own memory"
  on public.user_memory for delete
  using (auth.uid() = user_id);

-- Projects / workspaces
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  color text default '#6366f1',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists projects_user_id_idx on public.projects(user_id);

alter table public.projects enable row level security;

create policy "Users manage own projects"
  on public.projects for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Link conversations to projects
alter table public.conversations
  add column if not exists project_id uuid references public.projects(id) on delete set null;

create index if not exists conversations_project_id_idx on public.conversations(project_id);
