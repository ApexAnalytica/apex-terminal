import { CausalGraph, CausalNode, CausalEdge } from "./types";
import type { SystemStateSnapshot } from "./snapshots/types";
import { diffSnapshots } from "./snapshots/diff";

interface ContextOptions {
  selectedNode: string | null;
  severedEdges: string[];
  shocks: { id: string; name: string; severity: number; category: string }[];
  interventionMode: boolean;
  interventionTarget: string | null;
  ablationMode?: boolean;
  ablatedNodeIds?: string[];
  ablatedEdgeIds?: string[];
}

const MAX_ADJACENCY_NODES = 30;

function serializeNode(n: CausalNode): string {
  return (
    `${n.label} [${n.id}] — domain:${n.domain} cat:${n.category} ` +
    `Ω:${n.omegaFragility.composite.toFixed(1)} ` +
    `(sub:${n.omegaFragility.substitutionFriction.toFixed(1)} ` +
    `load:${n.omegaFragility.downstreamLoad.toFixed(1)} ` +
    `casc:${n.omegaFragility.cascadingVoltage.toFixed(1)} ` +
    `tail:${n.omegaFragility.existentialTailWeight.toFixed(1)}) ` +
    `conc:"${n.globalConcentration}" repl:"${n.replacementTime}"` +
    (n.isConfounded ? " [CONFOUNDED]" : "") +
    (n.isRestricted ? " [TARSKI-RESTRICTED]" : "")
  );
}

function serializeEdge(e: CausalEdge, nodes: CausalNode[]): string {
  const src = nodes.find((n) => n.id === e.source);
  const tgt = nodes.find((n) => n.id === e.target);
  return (
    `${src?.shortLabel ?? e.source} → ${tgt?.shortLabel ?? e.target} ` +
    `[${e.id}] w:${e.weight.toFixed(2)} lag:${e.lag} type:${e.type} ` +
    `conf:${e.confidence.toFixed(2)} mech:"${e.physicalMechanism}"` +
    (e.isInconsistent ? " [INCONSISTENT]" : "") +
    (e.isSevered ? " [SEVERED]" : "")
  );
}

export function serializeGraphContext(
  graph: CausalGraph,
  opts: ContextOptions
): string {
  const lines: string[] = [];

  // Graph metadata
  lines.push("=== GRAPH METADATA ===");
  lines.push(
    `Nodes: ${graph.metadata.totalNodes} | Edges: ${graph.metadata.totalEdges} | ` +
      `Density: ${graph.metadata.density.toFixed(3)} | ` +
      `Verification: ${graph.metadata.verificationStatus} | ` +
      `Discovery: ${graph.metadata.constraintType}`
  );
  lines.push(
    `Inconsistent edges: ${graph.metadata.inconsistentEdges} | ` +
      `Restricted nodes: ${graph.metadata.restrictedNodes}`
  );

  // Selected node detail
  if (opts.selectedNode) {
    const node = graph.nodes.find((n) => n.id === opts.selectedNode);
    if (node) {
      lines.push("");
      lines.push("=== SELECTED NODE ===");
      lines.push(serializeNode(node));
      const inEdges = graph.edges.filter((e) => e.target === node.id);
      const outEdges = graph.edges.filter((e) => e.source === node.id);
      if (inEdges.length > 0) {
        lines.push(
          `Upstream (${inEdges.length}): ${inEdges.map((e) => graph.nodes.find((n) => n.id === e.source)?.shortLabel ?? e.source).join(", ")}`
        );
      }
      if (outEdges.length > 0) {
        lines.push(
          `Downstream (${outEdges.length}): ${outEdges.map((e) => graph.nodes.find((n) => n.id === e.target)?.shortLabel ?? e.target).join(", ")}`
        );
      }
    }
  }

  // Adjacency summary (truncated for large graphs)
  lines.push("");
  lines.push("=== NODES (by Ω-Fragility) ===");
  const sorted = [...graph.nodes].sort(
    (a, b) => b.omegaFragility.composite - a.omegaFragility.composite
  );

  // If graph is small enough, show all; otherwise show top-N + selected node's neighborhood
  let nodesToShow: CausalNode[];
  if (sorted.length <= MAX_ADJACENCY_NODES) {
    nodesToShow = sorted;
  } else {
    const topN = sorted.slice(0, 20);
    const neighborIds = new Set<string>();
    if (opts.selectedNode) {
      graph.edges.forEach((e) => {
        if (e.source === opts.selectedNode) neighborIds.add(e.target);
        if (e.target === opts.selectedNode) neighborIds.add(e.source);
      });
    }
    const neighbors = graph.nodes.filter(
      (n) => neighborIds.has(n.id) && !topN.find((t) => t.id === n.id)
    );
    nodesToShow = [...topN, ...neighbors];
    lines.push(
      `(Showing top 20 + selected neighborhood — ${sorted.length - nodesToShow.length} nodes omitted)`
    );
  }

  nodesToShow.forEach((n) => lines.push(serializeNode(n)));

  // Edges
  lines.push("");
  lines.push("=== EDGES ===");
  graph.edges.forEach((e) => lines.push(serializeEdge(e, graph.nodes)));

  // Severed edges
  if (opts.severedEdges.length > 0) {
    lines.push("");
    lines.push("=== SEVERED EDGES (Pearl link break) ===");
    opts.severedEdges.forEach((eid) => {
      const edge = graph.edges.find((e) => e.id === eid);
      if (edge) lines.push(serializeEdge(edge, graph.nodes));
      else lines.push(eid);
    });
  }

  // Active shocks
  if (opts.shocks.length > 0) {
    lines.push("");
    lines.push("=== ACTIVE SHOCKS ===");
    opts.shocks.forEach((s) =>
      lines.push(`${s.name} [${s.id}] severity:${s.severity} cat:${s.category}`)
    );
  }

  // Intervention
  if (opts.interventionMode) {
    lines.push("");
    lines.push("=== INTERVENTION MODE ACTIVE ===");
    if (opts.interventionTarget) {
      const tgt = graph.nodes.find((n) => n.id === opts.interventionTarget);
      lines.push(`Target: ${tgt?.label ?? opts.interventionTarget}`);
    } else {
      lines.push("No target selected yet.");
    }
  }

  // Ablation
  if (opts.ablationMode && ((opts.ablatedNodeIds?.length ?? 0) > 0 || (opts.ablatedEdgeIds?.length ?? 0) > 0)) {
    lines.push("");
    lines.push("=== ABLATION MODE ACTIVE ===");
    if (opts.ablatedNodeIds && opts.ablatedNodeIds.length > 0) {
      const ablatedLabels = opts.ablatedNodeIds.map((id) => {
        const node = graph.nodes.find((n) => n.id === id);
        return node ? `${node.label} [${id}]` : id;
      });
      lines.push(`Ablated nodes (${opts.ablatedNodeIds.length}): ${ablatedLabels.join(", ")}`);
    }
    if (opts.ablatedEdgeIds && opts.ablatedEdgeIds.length > 0) {
      lines.push(`Ablated edges (${opts.ablatedEdgeIds.length}): ${opts.ablatedEdgeIds.join(", ")}`);
    }
    // Post-ablation metrics
    const remainingNodes = graph.nodes.filter((n) => !opts.ablatedNodeIds?.includes(n.id));
    const remainingEdges = graph.edges.filter(
      (e) => !opts.ablatedEdgeIds?.includes(e.id) && !opts.ablatedNodeIds?.includes(e.source) && !opts.ablatedNodeIds?.includes(e.target)
    );
    lines.push(`Post-ablation: ${remainingNodes.length} nodes, ${remainingEdges.length} edges`);
  }

  return lines.join("\n");
}

// ─── Snapshot Context for Gemini ──────────────────────────────
// Formats the latest snapshot(s) as text for Gemini's system prompt.

export function serializeSnapshotContext(
  snapshots: SystemStateSnapshot[],
  maxSnapshots = 5
): string {
  if (snapshots.length === 0) return "";

  const recent = snapshots.slice(-maxSnapshots);
  const lines: string[] = [];

  lines.push("=== SYSTEM STATE SNAPSHOTS ===");
  lines.push(`Showing ${recent.length} of ${snapshots.length} total snapshots\n`);

  // Full detail for the latest snapshot
  const latest = recent[recent.length - 1];
  lines.push(`--- CURRENT (${latest.timestamp}) ---`);
  if (latest.engineOutputs.spirtes) {
    const s = latest.engineOutputs.spirtes;
    lines.push(
      `Spirtes: density=${s.density.toFixed(3)} λmax=${s.lambdaMax.toFixed(2)} ${s.isStable ? "STABLE" : "UNSTABLE"}`
    );
  }
  if (latest.engineOutputs.pareto) {
    const p = latest.engineOutputs.pareto;
    lines.push(
      `Pareto: buffer=${p.omegaBuffer.toFixed(1)}% status=${p.status} crit=${p.criticalityEstimate}`
    );
  }
  if (latest.engineOutputs.pearl) {
    const pe = latest.engineOutputs.pearl;
    lines.push(
      `Pearl: interventions=${pe.interventionCount} severed=[${pe.severedEdges.join(",")}]`
    );
  }
  lines.push(
    `Tarski: ${latest.tarskiValidation.status} (${latest.tarskiValidation.violations.length} violations)`
  );
  const topNodes = [...latest.graph.nodes]
    .sort((a, b) => b.omega - a.omega)
    .slice(0, 5);
  lines.push(
    `Top Ω: ${topNodes.map((n) => `${n.id}:${n.omega.toFixed(1)}`).join(", ")}`
  );
  const activated = latest.graph.nodes.filter((n) => n.isActivated);
  if (activated.length > 0) {
    lines.push(`Activated: ${activated.map((n) => n.id).join(", ")}`);
  }
  lines.push(
    `Meta: epochs=${latest.metadata.epochCount} shocks=${latest.metadata.shockCount} module=${latest.metadata.activeModule}`
  );
  lines.push("");

  // Previous snapshots as diffs (compact)
  for (let i = recent.length - 2; i >= 0; i--) {
    const prev = recent[i];
    const curr = recent[i + 1];
    const diff = diffSnapshots(prev, curr);
    const label = `T-${recent.length - 1 - i}`;

    lines.push(`--- DIFF ${label} → ${label === "T-1" ? "CURRENT" : `T-${recent.length - 2 - i}`} ---`);

    if (diff.nodes.changed.length > 0) {
      const top3 = diff.nodes.changed
        .sort((a, b) => Math.abs(b.omegaDelta) - Math.abs(a.omegaDelta))
        .slice(0, 3);
      lines.push(
        `Nodes changed: ${diff.nodes.changed.length} (top: ${top3.map((n) => `${n.id} ΔΩ=${n.omegaDelta > 0 ? "+" : ""}${n.omegaDelta.toFixed(2)}`).join(", ")})`
      );
    }
    if (diff.nodes.added.length > 0) lines.push(`Nodes added: ${diff.nodes.added.join(", ")}`);
    if (diff.nodes.removed.length > 0) lines.push(`Nodes removed: ${diff.nodes.removed.join(", ")}`);
    if (diff.edges.changed.length > 0) lines.push(`Edges changed: ${diff.edges.changed.length}`);
    if (diff.metrics.omegaBufferDelta != null) {
      lines.push(`Buffer Δ: ${diff.metrics.omegaBufferDelta > 0 ? "+" : ""}${diff.metrics.omegaBufferDelta.toFixed(1)}%`);
    }
    if (diff.metrics.stabilityChanged) lines.push(`Stability: CHANGED`);
    if (diff.metrics.violationCountDelta !== 0) {
      lines.push(`Violations Δ: ${diff.metrics.violationCountDelta > 0 ? "+" : ""}${diff.metrics.violationCountDelta}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
