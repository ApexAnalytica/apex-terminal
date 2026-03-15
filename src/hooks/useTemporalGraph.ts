import { useMemo } from "react";
import { useApexStore } from "@/stores/useApexStore";
import { getNodeStateAt, getVisibleNodesAt, getEventsInRange } from "@/lib/temporal-data";
import type { CausalGraph, CausalNode, CausalEdge, OmegaFragilityProfile } from "@/lib/types";
import type { TemporalEvent } from "@/lib/temporal-data";

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
 * When scrubbed to a past position, adjusts omega scores and filters nodes.
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

    // Determine which nodes are visible at this time
    const visibleIds = new Set(getVisibleNodesAt(temporalData, ts));

    // Transform nodes with historical omega values
    const transformedNodes: CausalNode[] = graphData.nodes
      .filter((n) => visibleIds.has(n.id))
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

    // Filter edges to only include those between visible nodes
    const transformedEdges: CausalEdge[] = graphData.edges.filter(
      (e) => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target),
    );

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
