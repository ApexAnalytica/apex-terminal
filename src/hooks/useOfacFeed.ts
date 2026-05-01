"use client";

import { useEffect } from "react";
import { useApexStore } from "@/stores/useApexStore";
import type { OfacSdnFeed } from "@/lib/feeds/ofac-sdn";

const POLL_INTERVAL_MS = 30 * 60 * 1000; // 30 min — OFAC refreshes a few times per week
const ENDPOINT = "/api/feeds/ofac/sdn";

/**
 * Polls /api/feeds/ofac/sdn on an interval and applies the result to nodes
 * whose jurisdiction matches a sanctioned country. Profile-agnostic: the
 * feed fires whenever a graph is loaded, and the store action self-gates by
 * scanning node label/domain/concentration/constraint strings for
 * sanctioned-country keywords — sessions whose graphs contain no such
 * matches simply receive nothing, no waste in the UI.
 *
 * Server proxy caches upstream for 24h; this client cadence is just so a
 * freshly-loaded tab doesn't sit on stale data.
 */
export function useOfacFeed() {
  const applyOfacLiveData = useApexStore((s) => s.applyOfacLiveData);
  const hasGraph = useApexStore((s) => s.graphData.nodes.length > 0);

  useEffect(() => {
    if (!hasGraph) return;
    const controller = new AbortController();
    let cancelled = false;

    const tick = async () => {
      try {
        const res = await fetch(ENDPOINT, { signal: controller.signal });
        if (!res.ok) return;
        const feed = (await res.json()) as OfacSdnFeed;
        if (cancelled || !feed?.jurisdictions || !feed.fetchedAt) return;
        applyOfacLiveData(feed.jurisdictions, feed.fetchedAt, feed.source ?? "OFAC SDN");
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
  }, [hasGraph, applyOfacLiveData]);
}
