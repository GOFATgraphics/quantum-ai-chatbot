-- Run this in Supabase SQL Editor (after supabase/mcp-servers.sql)

-- Limit which of a server's tools are exposed.
--
-- A toolset expands to the server's entire catalogue, and a catalogue is
-- prompt: a Make account contributes tens of thousands of tokens of tool
-- definitions to every request whether or not any of them is wanted. Naming
-- the handful actually used cuts that, and narrows what the model can reach
-- for. Null means everything, which is the existing behaviour.
alter table public.mcp_servers
  add column if not exists allowed_tools text[];

-- The column is not sensitive, so it joins the set the browser may read.
grant select (
  id, user_id, name, label, url, enabled, allowed_tools,
  last_error, last_used_at, created_at, updated_at
) on public.mcp_servers to anon, authenticated;
