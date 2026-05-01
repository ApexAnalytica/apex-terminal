"use client";

import { useEffect } from "react";
import { useApexStore } from "@/stores/useApexStore";
import { FEED_PROVIDERS } from "@/lib/feeds/registry";

/**
 * Polls every registered live-data provider on its declared cadence and
 * dispatches the matched per-node updates through `applyFeedBatch`. One
 * effect, one set of timers, one store action — the per-feed `use*Feed`
 * hooks are obsolete.
 *
 * Gate: waits until a graph has been loaded (`graphData.nodes.length > 0`)
 * so polling doesn't fire during the empty-domain-selector phase. Each
 * provider self-gates further inside `matchPayload` via node-matching, so
 * sessions whose graphs contain no nodes the provider recognises receive
 * empty `updates` and the dispatch becomes a no-op (plus stale-signal
 * cleanup if any signals of those kinds were carried over from a prior
 * graph state).
 *
 * Re-poll trigger: the effect re-runs only when `hasGraph` flips, NOT on
 * every node mutation — the tick reads the latest graph via
 * `useApexStore.getState()` at fetch time so it stays current without
 * thrashing the timers.
 */
export function useFeedRegistry() {
  const applyFeedBatch = useApexStore((s) => s.applyFeedBatch);
  const hasGraph = useApexStore((s) => s.graphData.nodes.length > 0);

  useEffect(() => {
    if (!hasGraph) return;
    const cleanups: Array<() => void> = [];

    for (const provider of FEED_PROVIDERS) {
      const controller = new AbortController();

      const tick = async () => {
        try {
          const res = await fetch(provider.endpoint, { signal: controller.signal });
          if (!res.ok) return;
          const payload = await res.json();
          if (controller.signal.aborted) return;
          // Read CURRENT nodes at tick time so the matcher sees the latest
          // graph without forcing the effect to re-run on every mutation.
          const currentNodes = useApexStore.getState().graphData.nodes;
          const batch = provider.matchPayload(payload, currentNodes);
          // Even an empty `updates` array is dispatched, so the store can
          // run its stale-signal cleanup pass for `signalKinds`.
          applyFeedBatch(batch);
        } catch {
          // Silent — feeds are non-critical; next tick will retry.
        }
      };

      tick();
      const interval = setInterval(tick, provider.pollIntervalMs);
      cleanups.push(() => {
        clearInterval(interval);
        controller.abort();
      });
    }

    return () => {
      for (const fn of cleanups) fn();
    };
  }, [hasGraph, applyFeedBatch]);
}
