-- =============================================================
-- APEX Terminal — Discovery Run Persistence
-- Run this in the Supabase SQL Editor after supabase-setup.sql
--
-- Why: turns the discovery API from stateless (compute and return)
-- into durable (compute, persist, return). Lets a customer hit
-- POST /api/discovery/run from their pipeline and later retrieve
-- the same run via GET /api/discovery/runs/<id> — for audit trail,
-- cross-time comparison, and reproducibility.
-- =============================================================

-- 1. Discovery runs table
--
-- Mirrors the TypeScript DiscoveryRun shape in
-- src/lib/discovery/run-types.ts. Strongly-typed primary fields,
-- jsonb for params and result so the algorithm-specific structure
-- doesn't dictate the schema.
create table if not exists public.discovery_runs (
  id text primary key,
  cohort_id text not null,
  cohort_source_hash text,
  algorithm_id text not null,
  algorithm_version text not null,
  params jsonb not null default '{}'::jsonb,
  started_at timestamptz not null,
  completed_at timestamptz not null,
  status text not null check (status in ('succeeded', 'failed', 'partial')),
  error text,
  result jsonb not null,
  created_at timestamptz not null default now()
);

-- 2. Indexes for the queries the service layer makes
create index if not exists discovery_runs_cohort_id_idx
  on public.discovery_runs (cohort_id, created_at desc);

create index if not exists discovery_runs_algorithm_id_idx
  on public.discovery_runs (algorithm_id, created_at desc);

create index if not exists discovery_runs_created_at_idx
  on public.discovery_runs (created_at desc);

-- 3. Row-level security: service-role only (v0)
--
-- All access to this table is mediated by the /api/discovery/*
-- endpoints, which use the SUPABASE_SERVICE_ROLE_KEY and bypass RLS
-- entirely. Anon-key clients hitting the table directly get nothing.
-- When auth lands (api-key or session-based), this stays the same;
-- the auth gate moves up into the API endpoint layer.
alter table public.discovery_runs enable row level security;

-- Explicit deny-all-non-service-role policy. RLS-enabled-with-no-
-- policies already produces this behaviour; this policy is here for
-- clarity in the SQL editor.
create policy "service-role-only" on public.discovery_runs
  for all
  using (false);
