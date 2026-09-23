// ─── POST /api/tour/event ───────────────────────────────────────
//
// Receives a TourEvent from the browser and emits it to the
// request log. Today the sink is `console.log` (visible in Vercel
// runtime logs as structured JSON); a future PR can wire it to
// Supabase / Tinybird / wherever the analytics pipeline lands.
//
// Logging is best-effort. Failures here MUST NOT cascade into the
// user's tour experience — this route returns 4xx/5xx but the
// client treats logging as fire-and-forget and ignores the result.
//
// PRIVACY: events are tour-session-scoped (random uuid per open).
// We never receive a user id here. Persona / track / step id are
// product analytics, not user identifiers.

import { NextRequest, NextResponse } from "next/server";

// ─── Validation ─────────────────────────────────────────────────

const ALLOWED_EVENTS = new Set([
  "tour_started",
  "first_run_completed",
  "deep_dive_launched",
  "deep_dive_completed",
  "tour_closed",
]);

const ALLOWED_PHASES = new Set(["first-run", "deep-dive", "menu"]);

interface IncomingEvent {
  event?: unknown;
  stepId?: unknown;
  phase?: unknown;
  track?: unknown;
  persona?: unknown;
  tourSessionId?: unknown;
  elapsedMs?: unknown;
  clientMeta?: unknown;
}

// Hard caps so a misbehaving client can't fill the log with
// gigabyte rows. Generous for legitimate use.
const MAX_STR = 200;
const MAX_META_KEYS = 20;
const MAX_META_VAL = 500;

function isString(v: unknown): v is string {
  return typeof v === "string";
}

function clampStr(v: unknown, max: number): string | null {
  if (!isString(v)) return null;
  return v.length > max ? v.slice(0, max) : v;
}

function sanitizeClientMeta(input: unknown): Record<string, unknown> | undefined {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return undefined;
  const src = input as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  let n = 0;
  for (const k of Object.keys(src)) {
    if (n >= MAX_META_KEYS) break;
    if (k.length > 50) continue;
    const v = src[k];
    if (v === null || v === undefined) continue;
    if (typeof v === "number" || typeof v === "boolean") {
      out[k] = v;
      n += 1;
      continue;
    }
    if (typeof v === "string") {
      out[k] = v.length > MAX_META_VAL ? v.slice(0, MAX_META_VAL) : v;
      n += 1;
      continue;
    }
    // Drop anything else (objects, arrays) — keep payload bounded.
  }
  return out;
}

export async function POST(request: NextRequest) {
  let raw: IncomingEvent;
  try {
    raw = (await request.json()) as IncomingEvent;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  if (!isString(raw.event) || !ALLOWED_EVENTS.has(raw.event)) {
    return NextResponse.json({ error: "unknown event type" }, { status: 400 });
  }
  if (!isString(raw.phase) || !ALLOWED_PHASES.has(raw.phase)) {
    return NextResponse.json({ error: "unknown phase" }, { status: 400 });
  }
  const tourSessionId = clampStr(raw.tourSessionId, MAX_STR);
  if (!tourSessionId) {
    return NextResponse.json({ error: "missing tourSessionId" }, { status: 400 });
  }
  const elapsedMs =
    typeof raw.elapsedMs === "number" && Number.isFinite(raw.elapsedMs) && raw.elapsedMs >= 0
      ? Math.floor(raw.elapsedMs)
      : 0;

  const sanitized = {
    event: raw.event,
    stepId: clampStr(raw.stepId, MAX_STR),
    phase: raw.phase,
    track: clampStr(raw.track, MAX_STR),
    persona: clampStr(raw.persona, MAX_STR),
    tourSessionId,
    elapsedMs,
    clientMeta: sanitizeClientMeta(raw.clientMeta),
  };

  // Sink: structured stdout so Vercel runtime logs can be queried.
  // To wire to Supabase / Tinybird later, replace this with the
  // appropriate client call — the validated payload is exactly the
  // shape the sink will need.
  console.log("[tour-event]", JSON.stringify(sanitized));

  return NextResponse.json({ ok: true });
}
