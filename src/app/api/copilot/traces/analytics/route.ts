// ─── GET /api/copilot/traces/analytics ──────────────────────────
//
// Returns aggregations over the authenticated user's recent
// copilot turns. RLS on public.copilot_traces filters to
// auth.uid() = user_id, same as the per-row endpoint at
// /api/copilot/traces.
//
// Anonymous callers see an empty summary (not a 401), matching
// the trace-list route's pattern. We do this so the trace
// browser's STATS tab works on pre-auth surfaces without
// spamming the logs.

import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { summarize, type AnalyticsInputRow, type AnalyticsSummary } from "@/lib/copilot/analytics";

// Wider than the per-row default (50) because aggregations get
// more useful the more data they see, and we're not paying for
// per-row rendering. Bounded so a malicious client can't ask
// for an unbounded fetch.
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
    console.error("[copilot-analytics] failed to create server client:", err);
    return NextResponse.json(
      { error: "Supabase server client unavailable" },
      { status: 503 },
    );
  }

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ summary: emptySummary() });
  }

  const { data, error } = await supabase
    .from("copilot_traces")
    .select("created_at, conversation_id, tool_calls, model_provider, model_id")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[copilot-analytics] select failed:", error);
    return NextResponse.json(
      { error: "Failed to load analytics" },
      { status: 500 },
    );
  }

  const rows = (data ?? []) as AnalyticsInputRow[];
  const summary = summarize(rows);
  return NextResponse.json({ summary });
}

function emptySummary(): AnalyticsSummary {
  return {
    total_turns: 0,
    total_tool_calls: 0,
    distinct_conversations: 0,
    earliest_at: null,
    latest_at: null,
    by_tool: [],
    by_model: [],
  };
}
