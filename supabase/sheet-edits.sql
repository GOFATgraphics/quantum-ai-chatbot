-- Run this in Supabase SQL Editor

-- A journal of every change Quantumy makes to a Google Sheet.
--
-- Google's Sheets API has no undo. Ctrl+Z is a feature of the browser tab you
-- are editing in — it lives in that session and cannot be triggered from
-- outside it — and Drive's revision API cannot roll a spreadsheet back either.
-- So undo has to be built: before each write, what was in those cells is
-- recorded here, and undo puts it back.
--
-- Two consequences worth knowing. This only reverses edits Quantumy made, not
-- edits made by hand in the browser. And it is a real write going the other
-- way, so it appears in the sheet's version history like any other change.
create table if not exists public.sheet_edits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  spreadsheet_id text not null,
  -- 'values' = cells written, 'note' = an in-cell note, 'create' = a new file.
  kind text not null check (kind in ('values', 'note', 'create')),
  -- The exact A1 range that was written, expanded to the block actually
  -- touched: a write anchored at B2 with a 3x4 block records B2:E4.
  range text not null,
  -- What was there before, and what replaced it. For 'values' these are 2-D
  -- arrays read back as formulas, so restoring a cell restores its formula
  -- rather than the number the formula happened to produce. For 'note' they
  -- are the note text or null. For 'create', the new file's title.
  before_state jsonb,
  after_state jsonb,
  -- Set when a write was too large to journal. Undo refuses these rather than
  -- half-restoring them.
  too_large boolean not null default false,

  undone boolean not null default false,
  created_at timestamptz not null default now(),
  undone_at timestamptz
);

-- Undo asks one question — "what was the last thing I changed?" — so the index
-- matches it exactly.
create index if not exists sheet_edits_user_recent_idx
  on public.sheet_edits(user_id, created_at desc);

alter table public.sheet_edits enable row level security;

create policy "Users manage own sheet edits"
  on public.sheet_edits for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Optional housekeeping: the journal only earns its keep for recent edits, and
-- a before-image of a wide write is not small. Run this whenever, or leave it
-- to a scheduled job.
--   delete from public.sheet_edits where created_at < now() - interval '30 days';
