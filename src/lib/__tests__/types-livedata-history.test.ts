import { describe, it, expect } from "vitest";
import {
  LIVE_HISTORY_MAX,
  upsertLiveSignal,
  type LiveDataPoint,
} from "@/lib/types";

const point = (value: number, observedAt: string, kind = "indicator"): LiveDataPoint => ({
  kind,
  value,
  capacity: 10,
  unit: "%",
  observedAt,
  source: `test · ${kind} (period ${observedAt.slice(0, 10)})`,
});

describe("upsertLiveSignal", () => {
  it("first insert carries no history", () => {
    const out = upsertLiveSignal(undefined, point(5.25, "2025-01-01T00:00:00.000Z"));
    expect(out).toHaveLength(1);
    expect(out[0].history).toBeUndefined();
  });

  it("second insert rolls the previous current value into history", () => {
    const a = upsertLiveSignal(undefined, point(5.25, "2025-01-01T00:00:00.000Z"));
    const b = upsertLiveSignal(a, point(5.5, "2025-02-01T00:00:00.000Z"));
    expect(b).toHaveLength(1);
    expect(b[0].value).toBe(5.5);
    expect(b[0].history).toEqual([{ value: 5.25, observedAt: "2025-01-01T00:00:00.000Z" }]);
  });

  it("subsequent inserts accumulate sequentially in chronological order", () => {
    let acc: LiveDataPoint[] | undefined;
    acc = upsertLiveSignal(acc, point(1.0, "2025-01-01T00:00:00.000Z"));
    acc = upsertLiveSignal(acc, point(2.0, "2025-02-01T00:00:00.000Z"));
    acc = upsertLiveSignal(acc, point(3.0, "2025-03-01T00:00:00.000Z"));
    acc = upsertLiveSignal(acc, point(4.0, "2025-04-01T00:00:00.000Z"));
    expect(acc[0].value).toBe(4.0);
    expect(acc[0].history?.map((h) => h.value)).toEqual([1.0, 2.0, 3.0]);
  });

  it("does not double-record an identical observedAt", () => {
    const a = upsertLiveSignal(undefined, point(5.25, "2025-01-01T00:00:00.000Z"));
    const b = upsertLiveSignal(a, point(5.25, "2025-01-01T00:00:00.000Z"));
    // Same timestamp + same value as previous current → history stays empty
    expect(b[0].history?.length ?? 0).toBe(0);
  });

  it("caps history at LIVE_HISTORY_MAX entries (oldest dropped)", () => {
    let acc: LiveDataPoint[] | undefined;
    for (let i = 0; i < LIVE_HISTORY_MAX + 10; i++) {
      const ts = new Date(Date.UTC(2025, 0, i + 1)).toISOString();
      acc = upsertLiveSignal(acc, point(i, ts));
    }
    expect(acc![0].history?.length).toBe(LIVE_HISTORY_MAX);
    // Newest history entry should be the second-most-recent (current is on the point itself)
    const lastHistVal = acc![0].history![acc![0].history!.length - 1].value;
    expect(lastHistVal).toBe(LIVE_HISTORY_MAX + 8);
  });

  it("preserves history for other kinds when upserting one kind", () => {
    let acc: LiveDataPoint[] | undefined;
    acc = upsertLiveSignal(acc, point(1.0, "2025-01-01T00:00:00.000Z", "throughput"));
    acc = upsertLiveSignal(acc, point(2.0, "2025-02-01T00:00:00.000Z", "throughput"));
    acc = upsertLiveSignal(acc, point(99, "2025-01-01T00:00:00.000Z", "sanctions"));
    const throughput = acc!.find((p) => p.kind === "throughput");
    const sanctions = acc!.find((p) => p.kind === "sanctions");
    expect(throughput?.history?.length).toBe(1);
    expect(throughput?.value).toBe(2.0);
    expect(sanctions?.history).toBeUndefined();
  });

  it("merges in incoming history entries when the provider hydrated some", () => {
    const a = upsertLiveSignal(undefined, point(5.0, "2025-01-01T00:00:00.000Z"));
    const incoming: LiveDataPoint = {
      ...point(5.5, "2025-03-01T00:00:00.000Z"),
      history: [
        { value: 5.1, observedAt: "2025-01-15T00:00:00.000Z" },
        { value: 5.2, observedAt: "2025-02-01T00:00:00.000Z" },
      ],
    };
    const b = upsertLiveSignal(a, incoming);
    // History should include the previous current (5.0 at 2025-01-01) plus
    // the incoming hydrated history, sorted ascending and deduped.
    expect(b[0].history?.map((h) => h.value)).toEqual([5.0, 5.1, 5.2]);
  });
});
