import { describe, it, expect } from "vitest";
import { executeTag } from "@/lib/copilot/tool-registry";
import "@/lib/copilot/tools";
import type { ApexState } from "@/stores/useApexStore";

// ─── Spy store for the temporal/timeline tools ──────────────────

interface TemporalSpy {
  position: number | null;
  range: { start: number; end: number } | null;
  granularity: string | null;
  live: boolean | null;
  activeTimeline: string | null;
  epochSteps: number[];
  currentEpoch: number;
}

function makeCtx(initialRange?: { start: number; end: number }) {
  const spy: TemporalSpy = {
    position: null,
    range: null,
    granularity: null,
    live: null,
    activeTimeline: null,
    epochSteps: [],
    currentEpoch: 3,
  };
  const fakeStore = {
    timelineRange: initialRange,
    currentEpoch: spy.currentEpoch,
    setTimelinePosition: (ts: number) => {
      spy.position = ts;
    },
    setTimelineRange: (r: { start: number; end: number }) => {
      spy.range = r;
    },
    setTimelineGranularity: (g: string) => {
      spy.granularity = g;
    },
    setIsLive: (b: boolean) => {
      spy.live = b;
    },
    setActiveTimeline: (id: string) => {
      spy.activeTimeline = id;
    },
    stepEpoch: (delta: number) => {
      spy.epochSteps.push(delta);
      spy.currentEpoch += delta;
      fakeStore.currentEpoch = spy.currentEpoch;
    },
  } as unknown as ApexState & { currentEpoch: number };

  return { ctx: { getStore: () => fakeStore }, spy };
}

const ISO = (s: string) => Date.parse(s);

describe("set_time", () => {
  it("moves the scrubber to an in-range ISO date", async () => {
    const { ctx, spy } = makeCtx({ start: ISO("2024-01-01"), end: ISO("2024-12-31") });
    const result = await executeTag({ name: "set_time", payload: "date=2024-07-01", raw: "" }, ctx);
    expect(spy.position).toBe(ISO("2024-07-01"));
    expect(result).toContain("2024-07-01");
  });

  it("clamps an out-of-range date to the window end", async () => {
    const { ctx, spy } = makeCtx({ start: ISO("2024-01-01"), end: ISO("2024-12-31") });
    const result = await executeTag({ name: "set_time", payload: "date=2030-06-01", raw: "" }, ctx);
    expect(spy.position).toBe(ISO("2024-12-31"));
    expect(result).toContain("2024-12-31");
  });

  it("rejects an unparseable date without calling the setter", async () => {
    const { ctx, spy } = makeCtx();
    const result = await executeTag({ name: "set_time", payload: "date=not-a-date", raw: "" }, ctx);
    expect(spy.position).toBeNull();
    expect(result).toMatch(/Could not parse date/);
  });
});

describe("set_time_range", () => {
  it("sets the visible window from ISO start/end", async () => {
    const { ctx, spy } = makeCtx();
    const result = await executeTag(
      { name: "set_time_range", payload: "start=2024-02-01,end=2024-05-01", raw: "" },
      ctx,
    );
    expect(spy.range).toEqual({ start: ISO("2024-02-01"), end: ISO("2024-05-01") });
    expect(result).toContain("2024-02-01");
    expect(result).toContain("2024-05-01");
  });

  it("rejects a backwards range", async () => {
    const { ctx, spy } = makeCtx();
    const result = await executeTag(
      { name: "set_time_range", payload: "start=2024-05-01,end=2024-02-01", raw: "" },
      ctx,
    );
    expect(spy.range).toBeNull();
    expect(result).toMatch(/must be before/);
  });
});

describe("set_time_granularity", () => {
  it("sets a valid granularity", async () => {
    const { ctx, spy } = makeCtx();
    const result = await executeTag(
      { name: "set_time_granularity", payload: "granularity=month", raw: "" },
      ctx,
    );
    expect(spy.granularity).toBe("month");
    expect(result).toContain("month");
  });

  it("rejects an out-of-enum granularity at coercion", async () => {
    const { ctx, spy } = makeCtx();
    const result = await executeTag(
      { name: "set_time_granularity", payload: "granularity=fortnight", raw: "" },
      ctx,
    );
    expect(spy.granularity).toBeNull();
    expect(result).toMatch(/not in \[/);
  });
});

describe("set_live", () => {
  it("turns live on (on=true)", async () => {
    const { ctx, spy } = makeCtx();
    const result = await executeTag({ name: "set_live", payload: "on=true", raw: "" }, ctx);
    expect(spy.live).toBe(true);
    expect(result).toMatch(/following real-time/i);
  });

  it("turns live off (on=false)", async () => {
    const { ctx, spy } = makeCtx();
    const result = await executeTag({ name: "set_live", payload: "on=false", raw: "" }, ctx);
    expect(spy.live).toBe(false);
    expect(result).toMatch(/frozen/i);
  });

  it("accepts a bare legacy payload", async () => {
    const { ctx, spy } = makeCtx();
    await executeTag({ name: "set_live", payload: "true", raw: "" }, ctx);
    expect(spy.live).toBe(true);
  });
});

describe("set_active_timeline", () => {
  it("switches to the intervention timeline", async () => {
    const { ctx, spy } = makeCtx();
    const result = await executeTag(
      { name: "set_active_timeline", payload: "intervention", raw: "" },
      ctx,
    );
    expect(spy.activeTimeline).toBe("intervention");
    expect(result).toContain("intervention");
  });
});

describe("step_epoch", () => {
  it("steps forward and reports the new epoch", async () => {
    const { ctx, spy } = makeCtx();
    const result = await executeTag({ name: "step_epoch", payload: "delta=2", raw: "" }, ctx);
    expect(spy.epochSteps).toEqual([2]);
    expect(result).toContain("epoch 5"); // started at 3, +2
  });

  it("steps backward with a negative delta", async () => {
    const { ctx, spy } = makeCtx();
    await executeTag({ name: "step_epoch", payload: "delta=-1", raw: "" }, ctx);
    expect(spy.epochSteps).toEqual([-1]);
  });
});
