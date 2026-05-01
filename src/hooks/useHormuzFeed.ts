"use client";

import { useEffect } from "react";
import { useApexStore } from "@/stores/useApexStore";
import type { LiveDataPoint } from "@/lib/types";

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const ENDPOINT = "/api/feeds/eia/hormuz";

/**
 * Polls /api/feeds/eia/hormuz on an interval and applies the result to
 * chokepoint nodes via the store. Profile-agnostic: the feed fires whenever
 * a graph is loaded, and the store action self-gates by matching node
 * labels against "strait of hormuz" / "chokepoint" — sessions whose graphs
 * contain no chokepoint nodes simply receive nothing, no waste in the UI.
 *
 * The proxy itself caches upstream EIA responses for 6 hours; this 5-minute
 * cadence is just so a freshly-loaded tab doesn't sit on stale data.
 */
export function useHormuzFeed() {
  const applyHormuzLiveData = useApexStore((s) => s.applyHormuzLiveData);
  const hasGraph = useApexStore((s) => s.graphData.nodes.length > 0);

  useEffect(() => {
    if (!hasGraph) return;
    const controller = new AbortController();
    let cancelled = false;

    const tick = async () => {
      try {
        const res = await fetch(ENDPOINT, { signal: controller.signal });
        if (!res.ok) return;
        const point = (await res.json()) as LiveDataPoint;
        if (cancelled) return;
        if (typeof point.value !== "number" || typeof point.capacity !== "number") return;
        applyHormuzLiveData(point);
      } catch {
        // Silent — feed is non-critical; next tick will retry.
      }
    };

    tick();
    const id = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(id);
    };
  }, [hasGraph, applyHormuzLiveData]);
}
