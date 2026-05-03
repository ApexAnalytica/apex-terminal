// ─── Discovery Run Persistence ────────────────────────────────────────
//
// Service layer for writing/reading `DiscoveryRun` records to/from
// Supabase. All access is mediated by the `/api/discovery/*` routes
// using the service-role key (RLS-bypassing). When auth lands, the
// gate moves up into the route layer; this service layer doesn't change.
//
// The functions here are GRACEFULLY DEGRADING — the discovery pipeline
// is the load-bearing path. If Supabase is down or env vars are stub,
// `persistRun` returns null/error and the caller continues. The run is
// still computed and returned to the caller; only the durability story
// degrades. Tests assert this behaviour.

import { createClient as createServiceClient, type SupabaseClient } from "@supabase/supabase-js";
import type { DiscoveryRun, DiscoveryResult } from "./run-types";

// ─── Module-level service client (state machine) ─────────────────────
//
// Three states:
//   - "uninit"   : lazy init pending; first getService() call reads env
//   - "live"     : a SupabaseClient is available (either lazy-initialised
//                  from real env or injected via a test hook)
//   - "disabled" : explicit no-op; getService() always returns null
//                  (used in tests AND when stub env detected)
//
// The explicit "disabled" state is necessary because tests run in
// environments (Vercel build) where the real env vars exist but we
// want graceful-degrade behaviour. Without it, the lazy init succeeds
// against real Supabase and tests assert against real responses.

type ServiceState =
  | { kind: "uninit" }
  | { kind: "live"; client: SupabaseClient }
  | { kind: "disabled" };

let _state: ServiceState = { kind: "uninit" };

function isStubEnv(url: string, key: string): boolean {
  // Detect CI placeholder values. Must stay in sync with
  // .github/workflows/pr-validate.yml.
  if (!url || !key) return true;
  if (
    url.includes("placeholder") ||
    url.includes("ci-stub") ||
    url.includes("example.invalid")
  ) return true;
  if (key.includes("placeholder") || key.includes("ci-stub")) return true;
  return false;
}

function getService(): SupabaseClient | null {
  if (_state.kind === "live") return _state.client;
  if (_state.kind === "disabled") return null;

  // uninit → consult env and either materialize or disable.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (isStubEnv(url, key)) {
    _state = { kind: "disabled" };
    return null;
  }
  const client = createServiceClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  _state = { kind: "live", client };
  return client;
}

/**
 * Inject a service client. Used in tests:
 *   - pass a fake → forces "live" with the fake
 *   - pass null   → forces "disabled" regardless of env vars
 *
 * The graceful-degrade tests need the disabled state explicitly because
 * they run on Vercel's build env where the real env vars exist; without
 * the explicit disable, the lazy init would create a real client and
 * the tests would assert against real Supabase responses.
 */
export function setServiceClientForTesting(client: SupabaseClient | null): void {
  _state = client === null ? { kind: "disabled" } : { kind: "live", client };
}

/**
 * Clear the test override and restore lazy-init behaviour. Use in
 * afterEach so subsequent tests start from the default state.
 */
export function resetServiceClientForTesting(): void {
  _state = { kind: "uninit" };
}

// ─── Row shape (the database mirror of DiscoveryRun) ──────────────────

interface DiscoveryRunRow {
  id: string;
  cohort_id: string;
  cohort_source_hash: string | null;
  algorithm_id: string;
  algorithm_version: string;
  params: Record<string, unknown>;
  started_at: string;
  completed_at: string;
  status: "succeeded" | "failed" | "partial";
  error: string | null;
  result: DiscoveryResult;
}

function runToRow(run: DiscoveryRun): DiscoveryRunRow {
  return {
    id: run.id,
    cohort_id: run.cohortId,
    cohort_source_hash: run.cohortSourceHash ?? null,
    algorithm_id: run.algorithm.id,
    algorithm_version: run.algorithm.version,
    params: run.params,
    started_at: run.startedAt,
    completed_at: run.completedAt,
    status: run.status,
    error: run.error ?? null,
    result: run.result,
  };
}

function rowToRun(row: DiscoveryRunRow): DiscoveryRun {
  return {
    id: row.id,
    cohortId: row.cohort_id,
    cohortSourceHash: row.cohort_source_hash ?? undefined,
    algorithm: { id: row.algorithm_id, version: row.algorithm_version },
    params: row.params,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    status: row.status,
    error: row.error ?? undefined,
    result: row.result,
  };
}

// ─── Public API ───────────────────────────────────────────────────────

export interface PersistResult {
  /** True if the row was persisted; false if persistence was skipped or failed. */
  persisted: boolean;
  /** Reason persistence was skipped or failed (when persisted=false). */
  reason?: string;
}

/**
 * Persist a DiscoveryRun. Gracefully degrades:
 *   - If service client unavailable (stub env / no Supabase) → returns
 *     {persisted:false, reason:"service-unavailable"}.
 *   - If insert fails → returns {persisted:false, reason:<error>}.
 *   - On success → {persisted:true}.
 *
 * Never throws.
 */
export async function persistRun(run: DiscoveryRun): Promise<PersistResult> {
  const service = getService();
  if (!service) {
    return { persisted: false, reason: "service-unavailable" };
  }
  try {
    const row = runToRow(run);
    const { error } = await service.from("discovery_runs").insert(row);
    if (error) {
      return { persisted: false, reason: error.message };
    }
    return { persisted: true };
  } catch (e) {
    return {
      persisted: false,
      reason: `unexpected: ${(e as Error).message}`,
    };
  }
}

/** Read a run by id. Returns null on miss or service unavailability. */
export async function getRun(id: string): Promise<DiscoveryRun | null> {
  const service = getService();
  if (!service) return null;
  try {
    const { data, error } = await service
      .from("discovery_runs")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error || !data) return null;
    return rowToRun(data as DiscoveryRunRow);
  } catch {
    return null;
  }
}

export interface ListRunsOptions {
  cohortId?: string;
  algorithmId?: string;
  /** Max rows to return. Default 50, hard cap 200. */
  limit?: number;
}

/**
 * List runs, newest first. Filtering is index-supported via
 * (cohort_id, created_at desc) and (algorithm_id, created_at desc).
 * Returns [] on service unavailability.
 */
export async function listRuns(
  options: ListRunsOptions = {},
): Promise<DiscoveryRun[]> {
  const service = getService();
  if (!service) return [];
  const limit = Math.min(options.limit ?? 50, 200);
  try {
    // Chain order: eq filters first (so they apply before order/limit
    // and so the test fake's terminal `.limit()` sees them).
    let query = service.from("discovery_runs").select("*");
    if (options.cohortId) query = query.eq("cohort_id", options.cohortId);
    if (options.algorithmId) query = query.eq("algorithm_id", options.algorithmId);
    const { data, error } = await query
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return (data as DiscoveryRunRow[]).map(rowToRun);
  } catch {
    return [];
  }
}

/**
 * For tests: explicitly check whether the persistence layer would
 * actually try to talk to Supabase given the current env. Lets tests
 * assert the graceful-degrade path runs under stub envs.
 */
export function isPersistenceAvailable(): boolean {
  return getService() !== null;
}
