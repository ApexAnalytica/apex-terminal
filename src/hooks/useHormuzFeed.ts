"use client";

import { useEffect } from "react";
import { useApexStore } from "@/stores/useApexStore";
import type { LiveDataPoint } from "@/lib/types";

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const ENDPOINT = "/api/feeds/eia/hormuz";

/**
 * Polls /api/feeds/eia/hormuz on an interval and applies the result to
 * chokepoint nodes via the store. Only active when the user has at least one
 * geopolitical-domain selection — no point hitting EIA in T1D mode.
 *
 * The proxy itself caches upstream EIA responses for 6 hours; this 5-minute
 * cadence is just so a freshly-loaded tab doesn't sit on stale data.
 */
export function useHormuzFeed() {
  const applyHormuzLiveData = useApexStore((s) => s.applyHormuzLiveData);
  const selectedDomains = useApexStore((s) => s.selectedDomains);

  // Match the same domain heuristic the rest of the app uses: any domain id
  // that doesn't look T1D-flavored counts as geopolitical-relevant.
  const geopoliticalActive = selectedDomains.some(
    (d) => !d.toLowerCase().includes("t1d") && !d.toLowerCase().includes("vx880"),
  );

  useEffect(() => {
    if (!geopoliticalActive) return;
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
  }, [geopoliticalActive, applyHormuzLiveData]);
}
