-- Run this in Supabase SQL Editor
--
-- Support tables/functions for Google Cross-Account Protection (RISC).
-- api/security-events.js receives signed security event tokens from Google
-- (e.g. "this user's Google sessions were revoked", "this account was
-- disabled for hijacking") and needs to: (1) not process the same event
-- twice if Google redelivers it, and (2) map a Google account ID (sub) to
-- the matching Supabase user and kill their active sessions. Neither of
-- those is exposed by the normal PostgREST/service-role surface, so both
-- are SECURITY DEFINER functions, callable only by the service role.

create table if not exists public.risc_events (
  jti text primary key,
  event_type text not null,
  user_id uuid references auth.users(id) on delete set null,
  received_at timestamptz not null default now(),
  raw jsonb
);

alter table public.risc_events enable row level security;
-- No policies: this table is only ever touched via the service role key
-- from api/security-events.js, never from an authenticated client.

create or replace function public.find_user_id_by_provider_sub(p_sub text, p_provider text default 'google')
returns uuid
language sql
security definer
set search_path = public, auth
as $$
  select user_id
  from auth.identities
  where provider = p_provider
    and provider_id = p_sub
  limit 1;
$$;

create or replace function public.revoke_user_sessions(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  affected integer;
begin
  delete from auth.sessions where user_id = p_user_id;
  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke all on function public.find_user_id_by_provider_sub(text, text) from public, anon, authenticated;
revoke all on function public.revoke_user_sessions(uuid) from public, anon, authenticated;
grant execute on function public.find_user_id_by_provider_sub(text, text) to service_role;
grant execute on function public.revoke_user_sessions(uuid) to service_role;
