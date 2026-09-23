import { NextResponse } from "next/server";

/**
 * Stub trigger endpoint for the derivation provider. The provider has no
 * upstream API — it computes composites from other nodes' liveData[] in
 * `matchPayload`. The hook still polls this endpoint on its declared
 * cadence to drive the dispatch cycle; the response just carries a
 * timestamp.
 */
export async function GET() {
  return NextResponse.json(
    { trigger: new Date().toISOString() },
    {
      headers: {
        "x-feed-cache": "n/a",
        "x-feed-mode": "derivation",
      },
    },
  );
}
