// ─── POST /api/copilot/trace ────────────────────────────────────
//
// Receives a copilot TurnTrace from the browser and inserts it
// into public.copilot_traces. Uses the service-role client (the
// table has RLS but no insert policy — only the server side, with
// a verified user_id from the session, may write).
//
// Logging is best-effort. Failures here MUST NOT cascade into the
// user's chat experience — the route returns 4xx/5xx but the
// client treats logging as fire-and-forget.

import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

const supabaseAdmin = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// ─── Validation ─────────────────────────────────────────────────

interface IncomingTrace {
  conversation_id?: unknown;
  turn_index?: unknown;
  user_message?: unknown;
  assistant_message?: unknown;
  display_text?: unknown;
  tool_calls?: unknown;
  model_provider?: unknown;
  model_id?: unknown;
  system_prompt_hash?: unknown;
  system_prompt_size?: unknown;
  dataset?: unknown;
  active_module?: unknown;
  selected_node?: unknown;
  active_shock_count?: unknown;
  client_meta?: unknown;
}

function isString(v: unknown): v is string {
  return typeof v === "string";
}
function isInt(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && Number.isInteger(v);
}
function isArray(v: unknown): v is unknown[] {
  return Array.isArray(v);
}

// Hard caps so a misbehaving client can't fill the table with
// gigabyte rows. These are generous — typical assistant message
// is a few KB, system prompt is ~50-200KB.
const MAX_MESSAGE_LEN = 200_000;
const MAX_TOOL_CALLS = 50;
const MAX_TOOL_RESULT_LEN = 50_000;

function clampString(v: unknown, max: number): string | null {
  if (!isString(v)) return null;
  return v.length > max ? v.slice(0, max) : v;
}

interface ToolCallShape {
  name: string;
  params: Record<string, unknown>;
  result: string;
  error: string | null;
  latency_ms: number;
}

function sanitizeToolCalls(input: unknown): ToolCallShape[] | null {
  if (!isArray(input)) return null;
  if (input.length > MAX_TOOL_CALLS) return null;
  const out: ToolCallShape[] = [];
  for (const tc of input) {
    if (typeof tc !== "object" || tc === null) return null;
    const t = tc as Record<string, unknown>;
    if (!isString(t.name) || t.name.length > 200) return null;
    const params =
      typeof t.params === "object" && t.params !== null && !Array.isArray(t.params)
        ? (t.params as Record<string, unknown>)
        : {};
    const result = clampString(t.result, MAX_TOOL_RESULT_LEN) ?? "";
    const error = t.error === null || t.error === undefined ? null : clampString(t.error, 1000);
    const latency_ms = isInt(t.latency_ms) && t.latency_ms >= 0 ? t.latency_ms : 0;
    out.push({ name: t.name, params, result, error, latency_ms });
  }
  return out;
}

// ─── Handler ────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  let body: IncomingTrace;
  try {
    body = (await request.json()) as IncomingTrace;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!isString(body.conversation_id) || body.conversation_id.length > 100) {
    return NextResponse.json({ error: "Invalid conversation_id" }, { status: 400 });
  }
  if (!isInt(body.turn_index) || body.turn_index < 0) {
    return NextResponse.json({ error: "Invalid turn_index" }, { status: 400 });
  }
  const toolCalls = sanitizeToolCalls(body.tool_calls);
  if (toolCalls === null) {
    return NextResponse.json({ error: "Invalid tool_calls" }, { status: 400 });
  }

  // Resolve user_id from the auth session (don't trust the client
  // to claim it). null is fine — anonymous traces are allowed.
  let userId: string | null = null;
  try {
    const supabaseSession = await createServerClient();
    const { data } = await supabaseSession.auth.getUser();
    userId = data.user?.id ?? null;
  } catch {
    // Anonymous turn — leave userId null.
  }

  const row = {
    user_id: userId,
    conversation_id: body.conversation_id,
    turn_index: body.turn_index,
    user_message: clampString(body.user_message, MAX_MESSAGE_LEN),
    assistant_message: clampString(body.assistant_message, MAX_MESSAGE_LEN),
    display_text: clampString(body.display_text, MAX_MESSAGE_LEN),
    tool_calls: toolCalls,
    model_provider: clampString(body.model_provider, 50),
    model_id: clampString(body.model_id, 200),
    system_prompt_hash: clampString(body.system_prompt_hash, 64),
    system_prompt_size: isInt(body.system_prompt_size) ? body.system_prompt_size : null,
    dataset: clampString(body.dataset, 100),
    active_module: clampString(body.active_module, 50),
    selected_node: clampString(body.selected_node, 200),
    active_shock_count: isInt(body.active_shock_count) ? body.active_shock_count : null,
    client_meta:
      typeof body.client_meta === "object" && body.client_meta !== null && !Array.isArray(body.client_meta)
        ? (body.client_meta as Record<string, unknown>)
        : {},
  };

  const { error } = await supabaseAdmin.from("copilot_traces").insert(row);
  if (error) {
    console.error("[copilot-trace] insert failed:", error);
    return NextResponse.json({ error: "Failed to log trace" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
