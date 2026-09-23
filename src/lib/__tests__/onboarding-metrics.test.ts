import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  logTourEvent,
  newTourSessionId,
  type TourEvent,
} from "../onboarding/metrics";

const sampleEvent = (overrides: Partial<TourEvent> = {}): TourEvent => ({
  event: "tour_started",
  stepId: null,
  phase: "first-run",
  track: "analyst",
  persona: "macro",
  tourSessionId: "ts_test_session",
  elapsedMs: 0,
  ...overrides,
});

describe("newTourSessionId", () => {
  it("returns a non-empty string", () => {
    const id = newTourSessionId();
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(8);
  });

  it("returns a different value each call (collision-resistant)", () => {
    const ids = new Set(Array.from({ length: 50 }, () => newTourSessionId()));
    expect(ids.size).toBe(50);
  });
});

describe("logTourEvent", () => {
  let originalFetch: typeof globalThis.fetch | undefined;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    if (originalFetch) globalThis.fetch = originalFetch;
    else delete (globalThis as { fetch?: typeof fetch }).fetch;
    vi.restoreAllMocks();
  });

  it("returns false when fetch is unavailable (SSR / test env)", async () => {
    delete (globalThis as { fetch?: typeof fetch }).fetch;
    const ok = await logTourEvent(sampleEvent());
    expect(ok).toBe(false);
  });

  it("posts to /api/tour/event with the JSON-serialised event", async () => {
    const fetchSpy = vi.fn<typeof fetch>(async () =>
      new Response('{"ok":true}', { status: 200 }),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const ev = sampleEvent({ event: "first_run_completed", stepId: "first-run-finish" });
    const ok = await logTourEvent(ev);

    expect(ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("/api/tour/event");
    expect(init?.method).toBe("POST");
    const body = JSON.parse((init?.body as string));
    expect(body).toMatchObject({
      event: "first_run_completed",
      stepId: "first-run-finish",
      phase: "first-run",
      track: "analyst",
      tourSessionId: "ts_test_session",
    });
  });

  it("returns false on non-2xx response", async () => {
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    globalThis.fetch = (async () =>
      new Response('{"error":"bad"}', { status: 400 })) as unknown as typeof fetch;
    const ok = await logTourEvent(sampleEvent());
    expect(ok).toBe(false);
    consoleSpy.mockRestore();
  });

  it("returns false (and never throws) when fetch rejects", async () => {
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    globalThis.fetch = (async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    const ok = await logTourEvent(sampleEvent());
    expect(ok).toBe(false);
    consoleSpy.mockRestore();
  });

  it("uses keepalive so a tab-close on tour_closed still flushes", async () => {
    const fetchSpy = vi.fn<typeof fetch>(async () =>
      new Response("{}", { status: 200 }),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await logTourEvent(sampleEvent({ event: "tour_closed" }));
    const [, init] = fetchSpy.mock.calls[0];
    expect((init as RequestInit & { keepalive?: boolean }).keepalive).toBe(true);
  });
});
