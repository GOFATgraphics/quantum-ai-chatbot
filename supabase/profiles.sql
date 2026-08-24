-- public.profiles — the app-level mirror of auth.users.
--
-- Supabase keeps accounts in auth.users (the "auth" schema, hidden by default
-- in the Table Editor). There is no public.users table and there shouldn't be.
-- This app reads public.profiles for email, preferred_name and is_admin, but
-- no migration in this repo ever created it. Run this in Supabase → SQL Editor.
-- Safe to re-run.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  preferred_name text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Users read own profile" on public.profiles;
create policy "Users read own profile"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "Users update own profile" on public.profiles;
create policy "Users update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- A user can edit their own row, so is_admin has to be protected separately or
-- anyone could promote themselves. Only an existing admin may change the flag.
create or replace function public.guard_profile_admin_flag()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_admin is distinct from old.is_admin then
    if not exists (
      select 1 from public.profiles p where p.id = auth.uid() and p.is_admin
    ) then
      raise exception 'Only an admin can change is_admin';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_guard_admin on public.profiles;
create trigger profiles_guard_admin
  before update on public.profiles
  for each row execute function public.guard_profile_admin_flag();

-- Every new signup gets a profile row automatically.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, preferred_name)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data ->> 'preferred_name',
      new.raw_user_meta_data ->> 'full_name',
      split_part(coalesce(new.email, ''), '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill anyone who signed up before this migration existed.
insert into public.profiles (id, email, preferred_name)
select
  u.id,
  u.email,
  coalesce(
    u.raw_user_meta_data ->> 'preferred_name',
    u.raw_user_meta_data ->> 'full_name',
    split_part(coalesce(u.email, ''), '@', 1)
  )
from auth.users u
on conflict (id) do nothing;

-- Bootstrap the first admin. Change the address if you use a different one.
update public.profiles
set is_admin = true
where email = 'gofatahmad@gmail.com';
