// @vitest-environment node
//
// Tests for POST /api/copilot/trace. Covers the client_meta sanitization
// path that landed alongside the failed-action-attempt capture feature.
// We don't exercise the Supabase insert here — that's the trivial
// passthrough at the bottom of the route. We DO exercise the validation +
// shape rules because they're what protect the `client_meta jsonb` column
// from misshapen inputs.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ─── Mocks ──────────────────────────────────────────────────────
//
// The route depends on two Supabase clients (server-client for auth,
// service-role client for the insert). We mock both to a noop so the
// validation path runs end-to-end without an env or network.

const insertSpy = vi.fn(async () => ({ error: null }));
let capturedRow: Record<string, unknown> | null = null;

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: () => ({
      insert: async (row: Record<string, unknown>) => {
        capturedRow = row;
        return insertSpy();
      },
    }),
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: null } }),
    },
  }),
}));

beforeEach(() => {
  insertSpy.mockClear();
  capturedRow = null;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
});

async function postTrace(body: Record<string, unknown>) {
  const { POST } = await import("../route");
  const req = new NextRequest("http://localhost/api/copilot/trace", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
  return POST(req);
}

const validTraceBase = {
  conversation_id: "cv_test_123",
  turn_index: 0,
  user_message: "test",
  assistant_message: "ack",
  display_text: "ack",
  tool_calls: [],
  model_provider: "anthropic",
  model_id: "claude",
  system_prompt_hash: "abc123",
  system_prompt_size: 1024,
  dataset: "main",
  active_module: "pearl",
  selected_node: null,
  active_shock_count: 0,
};

describe("POST /api/copilot/trace — client_meta sanitization", () => {
  it("accepts a well-formed failed_action_attempts array", async () => {
    const res = await postTrace({
      ...validTraceBase,
      client_meta: {
        failed_action_attempts: [
          { raw: "[ACTION:add_shock:TAIWAN]", name: "add_shock", reason: "square_brackets" },
          { raw: "<<<ACTION:teleport:mars>>>", name: "teleport", reason: "unknown_tool" },
        ],
      },
    });
    expect(res.status).toBe(200);
    expect(capturedRow?.client_meta).toEqual({
      failed_action_attempts: [
        { raw: "[ACTION:add_shock:TAIWAN]", name: "add_shock", reason: "square_brackets" },
        { raw: "<<<ACTION:teleport:mars>>>", name: "teleport", reason: "unknown_tool" },
      ],
    });
  });

  it("defaults to an empty object when client_meta is missing", async () => {
    const res = await postTrace(validTraceBase);
    expect(res.status).toBe(200);
    expect(capturedRow?.client_meta).toEqual({});
  });

  it("drops malformed failed_action_attempts entries individually", async () => {
    const res = await postTrace({
      ...validTraceBase,
      client_meta: {
        failed_action_attempts: [
          { raw: "[ACTION:ok:1]", name: "ok", reason: "square_brackets" },
          { raw: 42, name: "bad", reason: "x" }, // raw must be a string — drop
          null, // not an object — drop
          { raw: "missing-name", reason: "x" }, // missing name — drop
        ],
      },
    });
    expect(res.status).toBe(200);
    const cm = capturedRow?.client_meta as Record<string, unknown>;
    expect(cm.failed_action_attempts).toEqual([
      { raw: "[ACTION:ok:1]", name: "ok", reason: "square_brackets" },
    ]);
  });

  it("passes through unrecognized client_meta keys for forward-compat", async () => {
    const res = await postTrace({
      ...validTraceBase,
      client_meta: { future_field: "some_value", another: 42 },
    });
    expect(res.status).toBe(200);
    const cm = capturedRow?.client_meta as Record<string, unknown>;
    expect(cm.future_field).toBe("some_value");
    expect(cm.another).toBe(42);
  });

  it("strips __proto__ to avoid prototype-pollution shapes", async () => {
    // JSON.parse handles the __proto__ key correctly without polluting,
    // but we also want to make sure the sanitizer doesn't COPY it into
    // the output as an own property.
    const body = JSON.parse(
      `{"conversation_id":"cv_test_123","turn_index":0,"tool_calls":[],"client_meta":{"__proto__":{"polluted":true},"ok":"kept"}}`,
    );
    const res = await postTrace(body);
    expect(res.status).toBe(200);
    const cm = capturedRow?.client_meta as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(cm, "__proto__")).toBe(false);
    expect(cm.ok).toBe("kept");
  });

  it("ignores client_meta when it is not an object", async () => {
    const res = await postTrace({
      ...validTraceBase,
      client_meta: "not-an-object",
    });
    expect(res.status).toBe(200);
    expect(capturedRow?.client_meta).toEqual({});
  });
});
