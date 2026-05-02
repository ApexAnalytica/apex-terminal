// ─── GET /api/discovery/runs ─────────────────────────────────────────
//
// Lists persisted DiscoveryRuns, newest first. Optional filters by
// cohortId / algorithmId. Hard limit 200 / default 50.
//
// Query params:
//   ?cohortId=<string>      — filter to runs of a specific cohort
//   ?algorithmId=<string>   — filter to runs of a specific algorithm
//   ?limit=<int 1-200>      — max rows (default 50)

import { NextRequest, NextResponse } from "next/server";
import {
  listRuns,
  isPersistenceAvailable,
} from "@/lib/discovery/persistence";

export async function GET(req: NextRequest) {
  if (!isPersistenceAvailable()) {
    return NextResponse.json(
      {
        error: "persistence layer unavailable",
        hint:
          "the discovery API is deployed without a Supabase backend; runs are computed but not durably stored",
      },
      { status: 503 },
    );
  }

  const url = new URL(req.url);
  const cohortId = url.searchParams.get("cohortId") ?? undefined;
  const algorithmId = url.searchParams.get("algorithmId") ?? undefined;
  const limitRaw = url.searchParams.get("limit");
  let limit: number | undefined;
  if (limitRaw !== null) {
    const n = Number(limitRaw);
    if (!Number.isFinite(n) || n < 1 || n > 200) {
      return NextResponse.json(
        { error: "limit must be an integer in [1, 200]" },
        { status: 400 },
      );
    }
    limit = Math.floor(n);
  }

  const runs = await listRuns({ cohortId, algorithmId, limit });
  return NextResponse.json({ runs, count: runs.length }, { status: 200 });
}
