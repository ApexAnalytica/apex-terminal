// ─── GET /api/copilot/traces/gaps ───────────────────────────────
//
// Returns the capability-gap backlog over the authenticated user's
// recent copilot turns: actions they asked for that the copilot
// couldn't perform. RLS on public.copilot_traces filters to
// auth.uid() = user_id, same as the analytics endpoint.
//
// Anonymous callers see an empty report (not a 401), matching the
// analytics route's pattern. Re-run as traces accumulate.

import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import {
  analyzeCapabilityGaps,
  type GapInputRow,
  type CapabilityGapReport,
} from "@/lib/copilot/capability-gaps";

const DEFAULT_LIMIT = 1000;
const MAX_LIMIT = 5000;

export async function GET(request: NextRequest) {
  const limitParam = request.nextUrl.searchParams.get("limit");
  const requestedLimit = limitParam ? parseInt(limitParam, 10) : DEFAULT_LIMIT;
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number.isFinite(requestedLimit) ? requestedLimit : DEFAULT_LIMIT),
  );

  let supabase;
  try {
    supabase = await createServerClient();
  } catch (err) {
    console.error("[copilot-gaps] failed to create server client:", err);
    return NextResponse.json(
      { error: "Supabase server client unavailable" },
      { status: 503 },
    );
  }

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ report: emptyReport() });
  }

  const { data, error } = await supabase
    .from("copilot_traces")
    .select("created_at, conversation_id, user_message, display_text, tool_calls")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[copilot-gaps] select failed:", error);
    return NextResponse.json({ error: "Failed to load gaps" }, { status: 500 });
  }

  const rows = (data ?? []) as GapInputRow[];
  const report = analyzeCapabilityGaps(rows);
  return NextResponse.json({ report });
}

function emptyReport(): CapabilityGapReport {
  return {
    total_turns: 0,
    turns_with_tools: 0,
    explicit_refusals: [],
    suspected_gaps: [],
    explicit_refusal_count: 0,
    suspected_gap_count: 0,
  };
}
