// ─── GET /api/discovery/runs/[id] ────────────────────────────────────
//
// Fetches a previously-persisted DiscoveryRun by id. Used by anyone
// who wants to retrieve a run after the original /api/discovery/run
// response has been discarded — audit trail, cross-time comparison,
// reproducibility.

import { NextResponse } from "next/server";
import { getRun, isPersistenceAvailable } from "@/lib/discovery/persistence";
import { requireApiKey } from "@/lib/discovery/api-key-auth";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(req: Request, ctx: RouteContext) {
  // API key gate first. Once PR 3 lands customer_id scoping, this
  // will also filter the getRun lookup to the authenticated customer
  // so callers can't fetch runs they don't own.
  const auth = await requireApiKey(req);
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

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

  const run = await getRun(id);
  if (!run) {
    return NextResponse.json({ error: "run not found", id }, { status: 404 });
  }
  return NextResponse.json(run, { status: 200 });
}
