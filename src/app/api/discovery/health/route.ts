// ─── GET /api/discovery/health ────────────────────────────────────────
//
// Deploy-state diagnostic for the Discovery persistence layer. Used by
// the operator to verify after running `supabase-discovery-runs.sql`
// that the schema is live and the application can see it.
//
// Response shape:
//   {
//     ok: boolean,                  // envWired && tableExists && !error
//     persistenceAvailable: boolean, // same as isPersistenceAvailable()
//     envWired: boolean,            // service-role key + URL aren't stub
//     tableExists: boolean | null,  // probe result; null when env unwired
//     rowCount: number | null,      // discovery_runs row count
//     error: string | null,         // Supabase error message if probe failed
//     checkedAt: ISO-8601 string,   // when the probe ran
//   }
//
// AUTH: intentionally unauthenticated in v0 — exposing booleans + a
// row count to an unauth'd caller is mildly information-leaky but not
// exploitable. Will be moved behind the API-key gate when that lands
// (next PR), at which point this becomes an admin-only health check.
//
// Always returns HTTP 200 with the diagnostic body, even when probes
// fail — that's the point of a health endpoint. Operators distinguish
// healthy / unhealthy from the body, not the status code.

import { NextResponse } from "next/server";
import {
  isPersistenceAvailable,
  probeDiscoveryTable,
} from "@/lib/discovery/persistence";

export async function GET() {
  const probe = await probeDiscoveryTable();
  const persistenceAvailable = isPersistenceAvailable();
  const ok =
    probe.envWired && probe.tableExists === true && probe.error === null;
  return NextResponse.json({
    ok,
    persistenceAvailable,
    envWired: probe.envWired,
    tableExists: probe.tableExists,
    rowCount: probe.rowCount,
    error: probe.error,
    checkedAt: new Date().toISOString(),
  });
}
