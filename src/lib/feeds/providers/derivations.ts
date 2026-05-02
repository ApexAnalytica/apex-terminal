/**
 * Derivation provider — emits Currency Contagion Channel and Exchange Rate
 * Pressure Index as live values computed from the FRED EM FX primitives
 * already on the graph. First step in eliminating synthetic composites.
 */
import type { CausalNode, LiveDataPoint } from "@/lib/types";
import {
  collectEmFxRatios,
  type DerivationsTrigger,
} from "@/lib/feeds/derivations";
import type { FeedDispatchBatch, FeedProvider } from "./types";

const findByLabel = (
  nodes: ReadonlyArray<CausalNode>,
  pattern: string,
): CausalNode | undefined => nodes.find((n) => n.label.toLowerCase().includes(pattern));

export const derivationsProvider: FeedProvider<DerivationsTrigger> = {
  id: "derivations",
  label: "Derived composites",
  endpoint: "/api/feeds/derivations/trigger",
  // Faster than FRED's 30-min cadence so derived values pick up new
  // primitives within one cycle of when they land.
  pollIntervalMs: 5 * 60 * 1000,
  matchPayload(_payload, nodes): FeedDispatchBatch {
    const ratios = collectEmFxRatios(nodes);
    const updates: Array<{ nodeId: string; point: LiveDataPoint }> = [];
    const affectedNodeIds: string[] = [];

    if (ratios.length === 0) {
      // No primitives have ticked yet; emit empty batch so any stale
      // derivation signals get cleaned up by the store.
      return {
        providerId: this.id,
        signalKinds: ["indicator"],
        updates: [],
        event: undefined,
      };
    }

    const meanRatio = ratios.reduce((s, r) => s + r.ratio, 0) / ratios.length;
    const maxRatio = ratios.reduce((m, r) => Math.max(m, r.ratio), 0);
    const observedAt = ratios
      .map((r) => r.observedAt)
      .sort()
      .reverse()[0];
    const allMock = ratios.every((r) => r.mockTagged);
    const mockSuffix = allMock ? " (mock — primitives are mocked)" : "";

    const breakdown = ratios
      .map((r) => `${r.nodeLabel.replace(" FX Stress", "")}: ${(r.ratio * 100).toFixed(0)}%`)
      .join(", ");

    const contagionNode = findByLabel(nodes, "currency contagion");
    if (contagionNode) {
      updates.push({
        nodeId: contagionNode.id,
        point: {
          kind: "indicator",
          value: +(meanRatio * 100).toFixed(1),
          capacity: 100,
          unit: "%",
          observedAt,
          source: `Derived · mean EM FX stress${mockSuffix} — ${breakdown}`,
        },
      });
      affectedNodeIds.push(contagionNode.id);
    }

    const pressureNode = findByLabel(nodes, "exchange rate pressure");
    if (pressureNode) {
      updates.push({
        nodeId: pressureNode.id,
        point: {
          kind: "indicator",
          value: +(maxRatio * 100).toFixed(1),
          capacity: 100,
          unit: "%",
          observedAt,
          source: `Derived · max EM FX stress${mockSuffix} — ${breakdown}`,
        },
      });
      affectedNodeIds.push(pressureNode.id);
    }

    return {
      providerId: this.id,
      signalKinds: ["indicator"],
      updates,
      event:
        updates.length > 0
          ? {
              id: `derivations-${observedAt}`,
              label: "Derived composites refresh",
              description: `${updates.length} composite${updates.length === 1 ? "" : "s"} derived from ${ratios.length} EM FX primitives — mean ${(meanRatio * 100).toFixed(0)}%, max ${(maxRatio * 100).toFixed(0)}%`,
              observedAt,
              severity: Math.min(1, maxRatio),
              affectedNodeIds,
            }
          : undefined,
    };
  },
};
