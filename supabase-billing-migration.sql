-- =============================================================
-- APEX Terminal — Billing / Tier Migration (Phase 1)
-- Idempotent. Safe to re-run.
-- Run AFTER supabase-setup.sql in the Supabase SQL Editor.
--
-- This migration:
--   1. Introduces a `tier` enum (replacing the binary access_type
--      check) with the institutional plan set.
--   2. Adds billing-state columns (subscription_status, period
--      bounds, mercury_invoice_id, seats, domain_access).
--   3. Backfills existing rows from `access_type`/`trial_expires_at`.
--   4. Updates the handle_new_user() trigger to write `tier` and
--      `current_period_end`.
--   5. Creates a `tier_features` reference table used by Phase 2
--      domain-level gating.
--
-- The legacy `access_type` column is RETAINED for one deprecation
-- release. Application code reads `tier` exclusively after this
-- migration; a later migration drops the column.
-- =============================================================

begin;

-- 1. Tier enum -------------------------------------------------
do $$ begin
  create type public.tier as enum (
    'trial',
    'analyst',
    'multi_domain',
    'enterprise',
    'trusted',
    'expired'
  );
exception when duplicate_object then null; end $$;

-- 2. New columns on profiles ----------------------------------
alter table public.profiles
  add column if not exists tier                 public.tier,
  add column if not exists subscription_status  text
    check (subscription_status in ('active','past_due','canceled','pending','none')),
  add column if not exists current_period_start timestamptz,
  add column if not exists current_period_end   timestamptz,
  add column if not exists mercury_invoice_id   text,
  add column if not exists seats                integer not null default 1,
  add column if not exists domain_access        text[];   -- NULL => use tier default

-- 2a. Tighten `seats` constraints on already-applied databases.
-- (No-op on a fresh apply; a re-run from v1 brings the column to spec.)
update public.profiles set seats = 1 where seats is null;
alter table public.profiles
  alter column seats set default 1,
  alter column seats set not null;
alter table public.profiles drop constraint if exists profiles_seats_check;
alter table public.profiles add constraint profiles_seats_check check (seats >= 1);

-- 3. Backfill `tier` from legacy access_type ------------------
update public.profiles
set tier = case access_type
             when 'trusted' then 'trusted'::public.tier
             when 'trial'   then 'trial'::public.tier
             else 'trial'::public.tier
           end
where tier is null;

-- 4. Backfill current_period_end for trial rows ---------------
update public.profiles
set current_period_end = trial_expires_at
where tier = 'trial'
  and current_period_end is null
  and trial_expires_at is not null;

update public.profiles
set current_period_start = created_at
where tier = 'trial'
  and current_period_start is null;

-- 5. Backfill subscription_status -----------------------------
update public.profiles
set subscription_status = case
  when tier in ('trial','trusted') then 'active'
  else 'none'
end
where subscription_status is null;

-- 6. Constrain `tier` and relax legacy access_type ------------
alter table public.profiles
  alter column tier set not null,
  alter column tier set default 'trial'::public.tier;

alter table public.profiles
  drop constraint if exists profiles_access_type_check;

alter table public.profiles
  alter column access_type drop not null;

-- 7. handle_new_user — write `tier` + `current_period_end` ----
create or replace function public.handle_new_user()
returns trigger as $$
declare
  _tier        public.tier;
  _caller_role text;
  _period_end  timestamptz;
  _meta_tier   text;
begin
  _caller_role := coalesce(current_setting('request.jwt.claim.role', true), 'anon');

  if _caller_role = 'service_role' then
    -- Prefer explicit `tier` metadata; fall back to legacy `access_type`.
    _meta_tier := coalesce(
      nullif(new.raw_user_meta_data->>'tier', ''),
      nullif(new.raw_user_meta_data->>'access_type', '')
    );
    begin
      _tier := coalesce(_meta_tier::public.tier, 'trial'::public.tier);
    exception when invalid_text_representation then
      _tier := 'trial'::public.tier;   -- bad metadata => fail-closed to trial
    end;
  else
    _tier := 'trial'::public.tier;     -- never trust browser metadata
  end if;

  _period_end := case
    when _tier = 'trial' then now() + interval '48 hours'
    else null   -- paid tiers: admin sets period explicitly post-Mercury
  end;

  insert into public.profiles (
    id, email,
    access_type,
    tier,
    trial_expires_at,
    current_period_start,
    current_period_end,
    subscription_status,
    org_name
  ) values (
    new.id,
    new.email,
    -- Legacy column: keep populated with 'trial' or 'trusted' for
    -- back-compat with anything that still reads it; new tiers
    -- write NULL (column NOT NULL was relaxed in step 6).
    case when _tier in ('trial','trusted') then _tier::text else null end,
    _tier,
    case when _tier = 'trial' then _period_end else null end,
    case when _tier in ('trial','trusted') then now() else null end,
    _period_end,
    case when _tier in ('trial','trusted') then 'active' else 'none' end,
    new.raw_user_meta_data->>'org_name'
  );
  return new;
end;
$$ language plpgsql security definer;

-- 8. Tier features reference table (Phase 2 reads this) -------
create table if not exists public.tier_features (
  tier        public.tier primary key,
  domain_ids  text[] not null default '{}',
  description text,
  updated_at  timestamptz default now()
);

alter table public.tier_features enable row level security;

do $$ begin
  create policy "tier_features readable by authed"
    on public.tier_features for select
    using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
-- writes are service-role only (no policy => RLS denies)

-- Seed defaults. Phase 2 will refine the public-domain list.
insert into public.tier_features (tier, domain_ids, description) values
  ('trial',        '{}', 'All public domains during 48hr eval (resolved at runtime)'),
  ('analyst',      '{}', 'Single domain, set per-customer via profiles.domain_access'),
  ('multi_domain', '{}', 'All public domains (resolved at runtime)'),
  ('enterprise',   '{}', 'All public domains + custom subgraphs (per-customer overrides)'),
  ('trusted',      '{}', 'Internal/comp accounts — all public domains'),
  ('expired',      '{}', 'No access — upgrade wall')
on conflict (tier) do nothing;

-- 8a. Phase 2 seed: populate tier_features.domain_ids with the
-- current public domain set. Only updates rows still at the empty
-- default ('{}') so admin overrides are preserved on re-run. The
-- canonical list lives in src/components/DomainSelector.tsx —
-- update both when a new public domain ships.
update public.tier_features
set domain_ids = array[
      'energy-systems',
      'manufacturing',
      'supply-chain',
      'financial-contagion',
      'sovereign-risk',
      'infrastructure',
      'defense-isr',
      'macro-labor',
      'macro-inflation',
      't1d-beta-cell',
      't1d-vx880'
    ],
    updated_at = now()
where tier in ('trial','multi_domain','enterprise','trusted')
  and (domain_ids = '{}' or domain_ids is null);

-- 9. Phase 3 cron helper: flip lapsed trials to 'expired'. -----
-- Idempotent. Safe to invoke on a schedule. Returns the number of
-- rows transitioned so cron logs are useful. Uses current_period_end
-- as the source of truth (matches middleware's isExpired()), with a
-- legacy fallback to trial_expires_at for any rows the backfill
-- missed.
create or replace function public.expire_trial_users()
returns integer as $$
declare
  _count integer;
begin
  update public.profiles
  set tier = 'expired'::public.tier,
      subscription_status = 'none'
  where tier = 'trial'::public.tier
    and coalesce(current_period_end, trial_expires_at) is not null
    and coalesce(current_period_end, trial_expires_at) <= now();
  get diagnostics _count = row_count;
  return _count;
end;
$$ language plpgsql security definer;

commit;
