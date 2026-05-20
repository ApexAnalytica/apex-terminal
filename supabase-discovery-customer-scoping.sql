-- =============================================================
-- APEX Terminal — Discovery Run Customer Scoping
-- Run this in the Supabase SQL Editor AFTER:
--   1. supabase-discovery-runs.sql   (#334, persistence table)
--   2. supabase-api-keys.sql         (#337, API-key auth)
--
-- Why: closes the last gap in the Discovery API hardening sequence.
-- After PR #337, requests are gated by API key — but the persistence
-- layer doesn't scope what each key can see. Any valid key can read
-- the full discovery_runs table via GET /api/discovery/runs. This
-- migration adds a customer_id column and the matching DB index, so
-- listRuns / getRun can filter to the authenticated customer's rows
-- and customer A literally cannot read customer B's runs.
--
-- PRE-CONDITION: discovery_runs currently has 0 rows in prod
-- (verified via /api/discovery/health → rowCount:0 as of 2026-05-16).
-- That makes customer_id NOT NULL safe from the start; no backfill
-- step needed. If this assumption ever changes (e.g. someone runs
-- the migration against a populated table), the ALTER will fail with
-- 'column contains null values' — at that point either backfill the
-- existing rows with a sentinel value first or drop them.
-- =============================================================

-- 1. Add the customer_id column
--
-- NOT NULL from the start. Every persisted run after this migration
-- carries the customer_id of the API key that created it; rows are
-- only ever read by listRuns / getRun which filter on customer_id.

alter table public.discovery_runs
  add column if not exists customer_id text not null;

-- 2. Index for the (customer_id, created_at) sort that listRuns runs
-- on every request
--
-- The existing (cohort_id, created_at) and (algorithm_id, created_at)
-- indexes don't help when the dominant filter is now customer_id.
-- Postgres can pick this index for any listRuns query (with or
-- without cohort/algorithm filters) because (customer_id) is the
-- leading column.

create index if not exists discovery_runs_customer_id_idx
  on public.discovery_runs (customer_id, created_at desc);

-- 3. Tighten the RLS policy
--
-- The existing "service-role-only" policy uses `using (false)` which
-- denies everything except service-role bypass. That stays — RLS is
-- our defense-in-depth gate. The application filter on customer_id is
-- the primary mechanism; this stays as the catch-net if a service-
-- role-bypassed query ever forgets to filter.
--
-- (No SQL change needed in this section. Documented here so a future
-- reader understands why we don't add a `using (customer_id = ...)`
-- policy: customer_id is enforced at the application layer, not via
-- per-row RLS, because service-role bypasses RLS by design.)
