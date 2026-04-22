-- =============================================================
-- APEX Terminal — Supabase Setup
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor)
-- =============================================================

-- 1. Create profiles table
create table if not exists public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  email text not null,
  access_type text not null default 'trial' check (access_type in ('trusted', 'trial')),
  trial_expires_at timestamptz,
  org_name text,
  created_at timestamptz default now()
);

-- 2. Enable Row Level Security
alter table public.profiles enable row level security;

-- 3. RLS policies
-- Users can read their own profile
create policy "Users can read own profile"
  on public.profiles for select
  using (auth.uid() = id);

-- Users can update their own org_name
create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Service role can do everything (used by triggers)
-- (service role bypasses RLS by default, no policy needed)

-- 4. Auto-create profile on signup
-- SECURITY NOTE: access_type from client metadata is ONLY trusted when
-- the user is created via supabase.auth.admin.createUser() (service-role).
-- Browser-initiated signUp() always sends client-controlled metadata, so
-- we check whether the caller is service-role by inspecting the JWT role
-- claim. If it's 'service_role', we honour the metadata; otherwise we
-- force 'trial'. This closes the hole where a browser client could POST
-- access_type='trusted' directly to the Supabase auth endpoint.
create or replace function public.handle_new_user()
returns trigger as $$
declare
  _access_type text;
  _caller_role text;
begin
  -- Detect whether this insert was made by the service-role client
  _caller_role := coalesce(current_setting('request.jwt.claim.role', true), 'anon');

  if _caller_role = 'service_role' then
    _access_type := coalesce(new.raw_user_meta_data->>'access_type', 'trial');
  else
    _access_type := 'trial';  -- never trust browser-supplied metadata
  end if;

  insert into public.profiles (id, email, access_type, trial_expires_at, org_name)
  values (
    new.id,
    new.email,
    _access_type,
    case
      when _access_type = 'trial'
      then now() + interval '48 hours'
      else null
    end,
    new.raw_user_meta_data->>'org_name'
  );
  return new;
end;
$$ language plpgsql security definer;

-- 5. Trigger on auth.users insert
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- =============================================================
-- ADDING TRUSTED USERS
-- =============================================================
-- To add a trusted user AFTER they sign up, run:
--
--   update public.profiles
--   set access_type = 'trusted', trial_expires_at = null
--   where email = 'user@example.com';
--
-- Or to pre-create a trusted user, first create them via
-- Supabase Dashboard > Authentication > Users > Add User,
-- then the trigger auto-creates the profile as 'trial'.
-- Then run the update above to flip them to 'trusted'.
-- =============================================================
