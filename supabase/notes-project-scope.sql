-- Run this in Supabase SQL Editor (after notes.sql)
-- Extends notes with project scoping, structured fields, and reminder tracking.

alter table public.notes
  add column if not exists project_id uuid references public.projects(id) on delete set null,
  add column if not exists note_type text not null default 'action_item',
  add column if not exists priority text not null default 'medium',
  add column if not exists due_date timestamptz,
  add column if not exists tags text[],
  add column if not exists trade_ref text,
  add column if not exists last_reminded_at timestamptz;

create index if not exists notes_project_id_idx on public.notes(project_id);
create index if not exists notes_due_date_idx on public.notes(due_date) where status = 'open';

-- 'dismissed' joins 'open'/'done' as a valid status; 'overdue' is computed
-- from due_date at query time, not stored.
alter table public.notes drop constraint if exists notes_status_check;
alter table public.notes add constraint notes_status_check
  check (status in ('open', 'done', 'dismissed'));
