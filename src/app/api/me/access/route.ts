import { NextResponse } from "next/server";
import { getUserAccess } from "@/lib/billing-server";

// Returns the authed user's resolved tier + effective domain access.
// Used by the client (DomainSelector, upgrade CTAs) to gate UI.
// Middleware enforces auth on this route; if it leaks through to an
// unauthed request we still 401 explicitly.
export async function GET() {
  const access = await getUserAccess();
  if (!access) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  return NextResponse.json(access, {
    // Per-user data, never cache.
    headers: { "Cache-Control": "private, no-store" },
  });
}
