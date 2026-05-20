// ─── GET /api/discovery/algorithms ───────────────────────────────────
//
// Returns the catalog of registered discovery algorithms — id, version,
// description, and default params. A client uses this to discover what
// it can call POST /api/discovery/run with.
//
// AUTH: gated by the same API-key check as the rest of /api/discovery/*.
// The catalog is technically public metadata (no customer data), but
// gating keeps the auth surface consistent and avoids leaking the
// existence of experimental / customer-private algorithms when they
// land later.

import { NextResponse } from "next/server";
import { listAlgorithms } from "@/lib/discovery/algorithm-registry";
import { requireApiKey } from "@/lib/discovery/api-key-auth";

export async function GET(req: Request) {
  const auth = await requireApiKey(req);
  if (!auth.ok) return auth.response;

  return NextResponse.json(
    { algorithms: listAlgorithms() },
    { status: 200 },
  );
}
