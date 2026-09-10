-- Run this in Supabase SQL Editor

-- Remote MCP servers a user has connected.
--
-- Anthropic makes the MCP connection itself, server-side, from the Messages
-- API: the url and token here are handed to Anthropic on each request rather
-- than dialled from this app. That is why there is no callback flow and no
-- refresh cycle the way there is for OAuth connectors.
--
-- auth_token is a bearer credential for somebody's Slack, Linear or internal
-- server, so it gets the same treatment as the OAuth tokens in connectors:
-- readable by the service role only, never by the browser. Row-level security
-- is row level, so the column grants below are the part that actually keeps it
-- out of reach of anything running in the page.
create table if not exists public.mcp_servers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  -- The identifier Anthropic matches between mcp_servers and the mcp_toolset
  -- entry. Slugged on the way in, and unique per user because two servers
  -- sharing a name would make that match ambiguous.
  name text not null,
  -- What the user typed, shown in the UI.
  label text,
  url text not null,
  auth_token text,

  enabled boolean not null default true,
  -- Set when a request to Anthropic reports the server failed, so the UI can
  -- say which one is broken instead of the whole chat looking broken.
  last_error text,
  last_used_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (user_id, name)
);

create index if not exists mcp_servers_user_idx on public.mcp_servers(user_id);

alter table public.mcp_servers enable row level security;

create policy "Users read own mcp servers"
  on public.mcp_servers for select
  using (auth.uid() = user_id);

create policy "Users delete own mcp servers"
  on public.mcp_servers for delete
  using (auth.uid() = user_id);

-- Inserts and updates go through /api/connectors/mcp with the service role, so
-- the token is only ever written from the server and never has to pass back
-- through the browser to be edited.

-- Column privileges: the token is not among the readable columns. Postgres has
-- no column-level revoke against a table-wide grant, so the table grant is
-- dropped and the safe columns are granted back by name.
revoke select on public.mcp_servers from anon, authenticated;

grant select (
  id,
  user_id,
  name,
  label,
  url,
  enabled,
  last_error,
  last_used_at,
  created_at,
  updated_at
) on public.mcp_servers to anon, authenticated;

grant delete on public.mcp_servers to authenticated;

-- Verify. The first should fail; the second should return rows.
--   set local role authenticated;
--   select auth_token from public.mcp_servers;   -- expected: denied
--   select name, url from public.mcp_servers;    -- expected: rows
