import { useMemo } from "react";
import { useApexStore } from "@/stores/useApexStore";
// Lightweight readers — see `temporal-state-helpers.ts` for why this is
// a separate file from `temporal-data.ts` (avoids pulling the synthetic-
// data generator into hot consumers like this hook).
import {
  getNodeStateAt,
  getEdgeStateAt,
  getEventsInRange,
  type TemporalEvent,
} from "@/lib/temporal-state-helpers";
import type { CausalGraph, CausalNode, CausalEdge } from "@/lib/types";

export interface TemporalGraphSnapshot {
  /** The graph filtered/transformed to the selected time */
  graph: CausalGraph;
  /** Events near the current position (within 3 days) */
  nearbyEvents: TemporalEvent[];
  /** Whether temporal data is available */
  isTemporalActive: boolean;
}

/**
 * Hook that returns a transformed graph based on the current timeline position.
 * When isLive is true, returns the original graph unmodified.
 * When scrubbed to a past position, adjusts omega scores, edge weights, and filters nodes.
 */
export function useTemporalGraph(): TemporalGraphSnapshot {
  const graphData = useApexStore((s) => s.graphData);
  const temporalData = useApexStore((s) => s.temporalData);
  const timelinePosition = useApexStore((s) => s.timelinePosition);
  const isLive = useApexStore((s) => s.isLive);

  return useMemo(() => {
    // No temporal data or live mode — return original graph
    if (!temporalData || isLive) {
      return {
        graph: graphData,
        nearbyEvents: [],
        isTemporalActive: !!temporalData,
      };
    }

    const ts = timelinePosition;

    // Transform nodes with historical omega values
    // IMPORTANT: Never filter nodes out — always keep all base graph nodes visible
    // to prevent layout recomputation and black screen during scrubbing.
    // Only modify omega scores based on temporal state.
    const transformedNodes: CausalNode[] = graphData.nodes
      .map((node) => {
        const nodeData = temporalData.nodes.get(node.id);
        if (!nodeData) return node;

        const state = getNodeStateAt(nodeData, ts);
        if (!state) return node;

        return {
          ...node,
          omegaFragility: state.omegaProfile,
        };
      });

    const visibleNodeIds = new Set(transformedNodes.map((n) => n.id));

    // Transform edges — apply temporal weight/confidence/stress changes
    const transformedEdges: CausalEdge[] = graphData.edges
      .filter((e) => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target))
      .map((edge) => {
        const edgeData = temporalData.edges.get(edge.id);
        if (!edgeData) return edge;

        const state = getEdgeStateAt(edgeData, ts);
        if (!state) return edge;

        // Apply temporal state to edge properties
        return {
          ...edge,
          weight: state.weight,
          confidence: state.confidence,
          // When strained, reclassify as "temporal" type to show animated dashes
          type: state.isStrained && edge.type === "directed"
            ? ("temporal" as const)
            : edge.type,
          // Mark edges under high stress as inconsistent (visual: red dashed)
          isInconsistent: state.stressSignal > 0.8 ? true : edge.isInconsistent,
        };
      });

    const graph: CausalGraph = {
      nodes: transformedNodes,
      edges: transformedEdges,
      metadata: {
        ...graphData.metadata,
        totalNodes: transformedNodes.length,
        totalEdges: transformedEdges.length,
        density:
          transformedNodes.length > 1
            ? transformedEdges.length /
              (transformedNodes.length * (transformedNodes.length - 1))
            : 0,
      },
    };

    // Get events near current position (±3 days)
    const threeDays = 3 * 24 * 60 * 60 * 1000;
    const nearbyEvents = getEventsInRange(
      temporalData,
      ts - threeDays,
      ts + threeDays,
    );

    return { graph, nearbyEvents, isTemporalActive: true };
  }, [graphData, temporalData, timelinePosition, isLive]);
}
