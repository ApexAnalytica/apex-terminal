// ─── GET /api/discovery/algorithms ───────────────────────────────────
//
// Returns the catalog of registered discovery algorithms — id, version,
// description, and default params. A client uses this to discover what
// it can call POST /api/discovery/run with.

import { NextResponse } from "next/server";
import { listAlgorithms } from "@/lib/discovery/algorithm-registry";

export async function GET() {
  return NextResponse.json(
    { algorithms: listAlgorithms() },
    { status: 200 },
  );
}
