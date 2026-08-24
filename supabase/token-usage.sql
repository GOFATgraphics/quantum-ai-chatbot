-- Token usage accounting for Quantumy.
--
-- One row per model turn (not per API round-trip): a single chat turn can make
-- up to 24 Anthropic calls as tools run, and billing only makes sense summed
-- across the whole turn. The row records what was actually billed, split the
-- way Anthropic bills it, plus an estimate of how the context window was spent
-- so the admin dashboard can show the composition, not just the total.
--
-- Run this once in the Supabase SQL editor. Nothing is backfilled: usage
-- accumulates from the moment the instrumented build is deployed.

create table if not exists public.token_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  -- No foreign key on purpose: a deleted chat should not delete the record of
  -- what it cost, and a turn can start before its conversation row is written.
  conversation_id uuid,

  -- 'chat' | 'title' | 'suggestions' — which endpoint spent the tokens.
  endpoint text not null default 'chat',
  model text,

  -- Billed input, split as Anthropic splits it. input_tokens is fresh input
  -- only; cached input is counted in the two cache columns and priced
  -- differently (writes cost more than fresh, reads cost far less).
  input_tokens bigint not null default 0,
  cache_read_input_tokens bigint not null default 0,
  cache_creation_input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,

  -- Turn shape: how many API round-trips and tool executions it took.
  rounds integer not null default 1,
  tool_calls integer not null default 0,
  duration_ms integer,
  stop_reason text,

  -- Largest single-request input of the turn (fresh + cache read + cache
  -- write). This is the "how full did the context window get" number; the
  -- sum above double-counts history that is resent every round.
  peak_context_tokens bigint not null default 0,
  context_window integer not null default 200000,

  -- Estimated split of peak_context_tokens across prompt components:
  -- { system_prompt, user_context, tools, history, tool_results, assistant }
  context_breakdown jsonb,

  created_at timestamptz not null default now()
);

create index if not exists token_usage_created_at_idx
  on public.token_usage (created_at desc);
create index if not exists token_usage_user_created_idx
  on public.token_usage (user_id, created_at desc);
create index if not exists token_usage_conversation_idx
  on public.token_usage (conversation_id)
  where conversation_id is not null;

alter table public.token_usage enable row level security;

-- Users may read their own usage; nobody but the service role may write it.
-- Admin reads go through the server with the service-role key (which bypasses
-- RLS) and are gated by requireAdmin, matching the other admin endpoints.
drop policy if exists "token_usage_select_own" on public.token_usage;
create policy "token_usage_select_own"
  on public.token_usage for select
  using (auth.uid() = user_id);
