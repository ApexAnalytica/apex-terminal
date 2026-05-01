// ─── POST /api/discovery/run ─────────────────────────────────────────
//
// Runs a discovery algorithm against a Cohort posted in the request
// body and returns the resulting DiscoveryRun JSON.
//
// Body shape:
//   {
//     cohort: Cohort,                    // required, validated
//     algorithm: { id: string,
//                  params?: object }     // required, looked up in registry
//   }
//
// Response shape: DiscoveryRun (see src/lib/discovery/run-types.ts).
//
// PRIVACY: the cohort validator hard-rejects bodies whose
// source.containsPHI is anything other than literal false. The API
// surface refuses to ingest PHI even if the caller mislabels it.
//
// PERSISTENCE: v0 is stateless — the run is computed and returned but
// not persisted server-side. The caller is responsible for storing
// the run record. Persistence (Vercel KV / Supabase / S3) lands when
// the multi-tenant deployment story does; the wire format does not
// change.

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getAlgorithm } from "@/lib/discovery/algorithm-registry";
import {
  CohortValidationError,
  validateCohort,
} from "@/lib/discovery/cohort-validator";
import { buildDiscoveryRun } from "@/lib/discovery/run-types";

interface RunRequestBody {
  cohort: unknown;
  algorithm: {
    id: string;
    params?: Record<string, unknown>;
  };
}

export async function POST(req: NextRequest) {
  let body: RunRequestBody;
  try {
    body = (await req.json()) as RunRequestBody;
  } catch (e) {
    return NextResponse.json(
      { error: `invalid json body: ${(e as Error).message}` },
      { status: 400 },
    );
  }

  if (!body.algorithm || typeof body.algorithm.id !== "string") {
    return NextResponse.json(
      { error: "algorithm.id is required" },
      { status: 400 },
    );
  }

  const algorithm = getAlgorithm(body.algorithm.id);
  if (!algorithm) {
    return NextResponse.json(
      {
        error: `unknown algorithm: ${body.algorithm.id}`,
        hint: "GET /api/discovery/algorithms lists available ids",
      },
      { status: 404 },
    );
  }

  // Validate the cohort. The validator enforces the privacy contract,
  // size limits, and structural integrity before the algorithm runs.
  let cohort;
  try {
    cohort = validateCohort(body.cohort);
  } catch (e) {
    if (e instanceof CohortValidationError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }

  const startedAt = new Date().toISOString();
  let result;
  try {
    result = algorithm.run(cohort, body.algorithm.params);
  } catch (e) {
    return NextResponse.json(
      {
        error: `algorithm ${algorithm.id} threw: ${(e as Error).message}`,
      },
      { status: 500 },
    );
  }
  const completedAt = new Date().toISOString();

  const run = buildDiscoveryRun({
    id: randomUUID(),
    cohort,
    algorithm: { id: algorithm.id, version: algorithm.version },
    params: { ...algorithm.defaultParams, ...(body.algorithm.params ?? {}) },
    startedAt,
    completedAt,
    result,
  });

  return NextResponse.json(run, { status: 200 });
}
