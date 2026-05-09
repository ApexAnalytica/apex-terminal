// ─── GET /api/copilot/traces ────────────────────────────────────
//
// Returns the authenticated user's recent copilot turns. RLS on
// public.copilot_traces (Users read own copilot traces) does the
// security work — we just need to use the auth-aware server
// client (NOT the service-role client) so auth.uid() is bound to
// the caller.
//
// Anonymous callers see an empty list, not a 401: production has
// some pre-auth surfaces and we don't want noise in the logs.

import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export interface TraceListRow {
  id: string;
  created_at: string;
  conversation_id: string;
  turn_index: number;
  user_message: string | null;
  assistant_message: string | null;
  display_text: string | null;
  tool_calls: Array<{
    name: string;
    params: Record<string, unknown>;
    result: string;
    error: string | null;
    latency_ms: number;
  }>;
  model_provider: string | null;
  model_id: string | null;
  dataset: string | null;
  active_module: string | null;
}

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
    console.error("[copilot-traces] failed to create server client:", err);
    return NextResponse.json(
      { error: "Supabase server client unavailable" },
      { status: 503 },
    );
  }

  // RLS will filter to auth.uid() = user_id automatically. The
  // explicit auth check here is defense-in-depth so anonymous
  // callers see a clean empty list rather than a Postgres error.
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ traces: [] satisfies TraceListRow[] });
  }

  const { data, error } = await supabase
    .from("copilot_traces")
    .select(
      "id, created_at, conversation_id, turn_index, user_message, assistant_message, display_text, tool_calls, model_provider, model_id, dataset, active_module",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[copilot-traces] select failed:", error);
    return NextResponse.json(
      { error: "Failed to load traces" },
      { status: 500 },
    );
  }

  return NextResponse.json({ traces: (data ?? []) as TraceListRow[] });
}
