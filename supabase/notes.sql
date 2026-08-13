-- Run this in Supabase SQL Editor

-- User-captured notes: explicit "save this" entries, distinct from user_memory
-- (which the AI infers on its own). Structured as a short task/reminder list.
create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  note text not null,
  project text,
  status text not null default 'open',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists notes_user_id_idx on public.notes(user_id);

alter table public.notes enable row level security;

create policy "Users manage own notes"
  on public.notes for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
