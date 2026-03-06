// ─── Snapshot Differ ──────────────────────────────────────────
// Computes a structured diff between two SystemStateSnapshots.

import type { SystemStateSnapshot } from "./types";

export interface NodeDiff {
  id: string;
  omegaDelta: number;
  fragilityDelta: number;
  activationChanged: boolean;
}

export interface EdgeDiff {
  id: string;
  weightDelta: number;
  severanceChanged: boolean;
}

export interface SnapshotDiff {
  prevTimestamp: string;
  currTimestamp: string;
  nodes: {
    changed: NodeDiff[];
    added: string[];
    removed: string[];
  };
  edges: {
    changed: EdgeDiff[];
    added: string[];
    removed: string[];
  };
  metrics: {
    omegaBufferDelta: number | null;
    stabilityChanged: boolean;
    violationCountDelta: number;
  };
}

export function diffSnapshots(
  prev: SystemStateSnapshot,
  curr: SystemStateSnapshot
): SnapshotDiff {
  const prevNodeMap = new Map(prev.graph.nodes.map((n) => [n.id, n]));
  const currNodeMap = new Map(curr.graph.nodes.map((n) => [n.id, n]));
  const prevEdgeMap = new Map(prev.graph.edges.map((e) => [e.id, e]));
  const currEdgeMap = new Map(curr.graph.edges.map((e) => [e.id, e]));

  // Node diffs
  const changedNodes: NodeDiff[] = [];
  const addedNodes: string[] = [];
  const removedNodes: string[] = [];

  for (const [id, currNode] of currNodeMap) {
    const prevNode = prevNodeMap.get(id);
    if (!prevNode) {
      addedNodes.push(id);
    } else {
      const omegaDelta = currNode.omega - prevNode.omega;
      const fragilityDelta = currNode.fragility - prevNode.fragility;
      const activationChanged = currNode.isActivated !== prevNode.isActivated;
      if (
        Math.abs(omegaDelta) > 0.01 ||
        Math.abs(fragilityDelta) > 0.01 ||
        activationChanged
      ) {
        changedNodes.push({ id, omegaDelta, fragilityDelta, activationChanged });
      }
    }
  }
  for (const id of prevNodeMap.keys()) {
    if (!currNodeMap.has(id)) removedNodes.push(id);
  }

  // Edge diffs
  const changedEdges: EdgeDiff[] = [];
  const addedEdges: string[] = [];
  const removedEdges: string[] = [];

  for (const [id, currEdge] of currEdgeMap) {
    const prevEdge = prevEdgeMap.get(id);
    if (!prevEdge) {
      addedEdges.push(id);
    } else {
      const weightDelta = currEdge.weight - prevEdge.weight;
      const severanceChanged = currEdge.isSevered !== prevEdge.isSevered;
      if (Math.abs(weightDelta) > 0.001 || severanceChanged) {
        changedEdges.push({ id, weightDelta, severanceChanged });
      }
    }
  }
  for (const id of prevEdgeMap.keys()) {
    if (!currEdgeMap.has(id)) removedEdges.push(id);
  }

  // Metric diffs
  const prevBuffer = prev.engineOutputs.pareto?.omegaBuffer ?? null;
  const currBuffer = curr.engineOutputs.pareto?.omegaBuffer ?? null;
  const omegaBufferDelta =
    prevBuffer != null && currBuffer != null ? currBuffer - prevBuffer : null;

  const prevStable = prev.engineOutputs.spirtes?.isStable ?? true;
  const currStable = curr.engineOutputs.spirtes?.isStable ?? true;

  return {
    prevTimestamp: prev.timestamp,
    currTimestamp: curr.timestamp,
    nodes: { changed: changedNodes, added: addedNodes, removed: removedNodes },
    edges: { changed: changedEdges, added: addedEdges, removed: removedEdges },
    metrics: {
      omegaBufferDelta,
      stabilityChanged: prevStable !== currStable,
      violationCountDelta:
        curr.tarskiValidation.violations.length -
        prev.tarskiValidation.violations.length,
    },
  };
}
