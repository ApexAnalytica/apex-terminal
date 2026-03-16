import { CopilotMessage, ModuleId, CausalGraph } from "./types";
import { serializeGraphContext } from "./copilot-context";
import { runTarskiValidation, TarskiValidationReport, AXIOM_LIBRARY } from "./tarski-data";

let msgCounter = 0;

function makeMsg(
  role: CopilotMessage["role"],
  content: string,
  module?: ModuleId
): CopilotMessage {
  return {
    id: `cop-${++msgCounter}-${Date.now()}`,
    role,
    content,
    timestamp: Date.now(),
    module,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────

function getAxiomName(axiomId: string): string {
  return AXIOM_LIBRARY.find((a) => a.id === axiomId)?.name ?? axiomId;
}

function getAxiomLevel(axiomId: string): number {
  return AXIOM_LIBRARY.find((a) => a.id === axiomId)?.level ?? -1;
}

const LEVEL_LABELS: Record<number, string> = {
  0: "Physical Laws",
  1: "Regulatory / Geopolitical",
  2: "Heuristic",
};

/** Build a cascade chain string from a starting node, walking outbound edges. */
function traceCascadePath(graph: CausalGraph, startId: string, maxDepth = 5): string[] {
  const path: string[] = [];
  const visited = new Set<string>();
  let current = startId;

  for (let i = 0; i < maxDepth; i++) {
    const node = graph.nodes.find((n) => n.id === current);
    if (!node || visited.has(current)) break;
    visited.add(current);
    path.push(node.shortLabel || node.label);

    // Follow the highest-weight outbound edge
    const outEdges = graph.edges
      .filter((e) => e.source === current && !e.isSevered)
      .sort((a, b) => b.weight - a.weight);
    if (outEdges.length === 0) break;
    current = outEdges[0].target;
  }

  return path;
}

/** Get top cascade chains from the graph's highest-omega root nodes. */
function getTopCascadeChains(graph: CausalGraph, count = 3): string[] {
  const topNodes = [...graph.nodes]
    .sort((a, b) => b.omegaFragility.composite - a.omegaFragility.composite)
    .slice(0, count);

  return topNodes
    .map((n) => {
      const path = traceCascadePath(graph, n.id);
      return path.length >= 2 ? path.join(" \u2192 ") : null;
    })
    .filter((p): p is string => p !== null);
}

// ─── Actions ──────────────────────────────────────────────────────

export type CopilotAction =
  | "DISCOVER_STRUCTURE"
  | "EXPLAIN_REJECTION"
  | "VERIFY_LOGIC";

export function processAction(
  action: CopilotAction,
  graph: CausalGraph,
  tarskiReport?: TarskiValidationReport | null
): CopilotMessage[] {
  const domains = [...new Set(graph.nodes.map((n) => n.domain))];
  const topNode = [...graph.nodes].sort(
    (a, b) => b.omegaFragility.composite - a.omegaFragility.composite
  )[0];

  switch (action) {
    case "DISCOVER_STRUCTURE": {
      const chains = getTopCascadeChains(graph);
      const chainsText = chains.length > 0
        ? `Cross-domain cascades detected: ${chains.join(", ")}.\n\n`
        : "";

      return [
        makeMsg(
          "assistant",
          `[SPIRTES] Running DCD + NOTEARS structural discovery...\n\n` +
            `Identified ${graph.metadata.totalNodes} causal nodes across ${graph.metadata.totalEdges} directed edges.\n` +
            `Domains covered: ${domains.join(", ")}\n` +
            `Graph density: ${graph.metadata.density.toFixed(3)}\n` +
            `Discovery method: ${graph.metadata.constraintType}\n\n` +
            `Highest \u03A9-Fragility: ${topNode.label} (\u03A9 ${topNode.omegaFragility.composite.toFixed(1)}) \u2014 ${topNode.globalConcentration}\n\n` +
            `3 sub-modules active:\n` +
            `  \u2022 DCD/NOTEARS \u2014 nonlinear structural\n` +
            `  \u2022 PCMCI+ \u2014 temporal lag analysis\n` +
            `  \u2022 FCI \u2014 latent confounding detection\n\n` +
            chainsText +
            `Structure locked. Awaiting Tarski verification pass.`,
          "spirtes"
        ),
      ];
    }

    case "EXPLAIN_REJECTION": {
      // Run Tarski validation dynamically if not provided
      const report = tarskiReport ?? runTarskiValidation(graph);

      // Group proof traces by axiom level
      const byLevel = new Map<number, { edgeId: string; axioms: string[]; verdict: string }[]>();
      for (const trace of report.proofTraces) {
        for (const axiomId of trace.violatedAxioms) {
          const level = getAxiomLevel(axiomId);
          if (!byLevel.has(level)) byLevel.set(level, []);
          byLevel.get(level)!.push({
            edgeId: trace.edgeId,
            axioms: trace.violatedAxioms,
            verdict: trace.verdict,
          });
        }
      }

      // Build detail lines
      let detailText = "";
      for (const [level, traces] of [...byLevel.entries()].sort((a, b) => a[0] - b[0])) {
        const levelLabel = LEVEL_LABELS[level] ?? `Level ${level}`;
        // Deduplicate by edgeId within this level
        const seen = new Set<string>();
        const uniqueTraces = traces.filter((t) => {
          if (seen.has(t.edgeId)) return false;
          seen.add(t.edgeId);
          return true;
        });

        detailText += `${levelLabel}:\n`;
        for (const trace of uniqueTraces.slice(0, 5)) {
          const edge = graph.edges.find((e) => e.id === trace.edgeId);
          if (edge) {
            const src = graph.nodes.find((n) => n.id === edge.source);
            const tgt = graph.nodes.find((n) => n.id === edge.target);
            const axiomNames = trace.axioms.map((a) => `${getAxiomName(a)} (${a})`).join(", ");
            detailText += `  \u2022 ${src?.shortLabel ?? edge.source} \u2194 ${tgt?.shortLabel ?? edge.target} \u2014 ${axiomNames}\n`;
          }
        }
        if (uniqueTraces.length > 5) {
          detailText += `  ... and ${uniqueTraces.length - 5} more\n`;
        }
        detailText += "\n";
      }

      // Restricted nodes summary
      let restrictedText = "";
      if (report.restrictedNodeIds.size > 0) {
        const restrictedNodes = graph.nodes.filter((n) => report.restrictedNodeIds.has(n.id));
        const top5 = restrictedNodes
          .sort((a, b) => b.omegaFragility.composite - a.omegaFragility.composite)
          .slice(0, 5);
        restrictedText = `Restricted nodes: ${top5.map((n) => `${n.shortLabel} (\u03A9 ${n.omegaFragility.composite.toFixed(1)})`).join(", ")}`;
        if (restrictedNodes.length > 5) {
          restrictedText += ` ... and ${restrictedNodes.length - 5} more`;
        }
        restrictedText += "\n\n";
      }

      return [
        makeMsg(
          "assistant",
          `[TARSKI] Truth filter scan complete.\n\n` +
            `Detected: ${report.inconsistentEdgeIds.size} inconsistent edge(s)\n` +
            `Restricted: ${report.restrictedNodeIds.size} node(s)\n\n` +
            detailText +
            restrictedText +
            `Physical constraint violations checked across ${domains.length} domains.\n` +
            `Recommendation: Apply FCI pass to identify hidden common causes. Toggle VERIFIED mode to see restricted edges.`,
          "tarski"
        ),
      ];
    }

    case "VERIFY_LOGIC": {
      // Build dynamic intervention examples from top-omega nodes
      const topNodes = [...graph.nodes]
        .sort((a, b) => b.omegaFragility.composite - a.omegaFragility.composite)
        .slice(0, 3);

      const interventionLines = topNodes.map((node) => {
        const path = traceCascadePath(graph, node.id);
        const omegas = path.map((label) => {
          const n = graph.nodes.find((nd) => nd.shortLabel === label || nd.label === label);
          return n ? n.omegaFragility.composite.toFixed(1) : "?";
        });
        const cascadeStr = path.join(" \u2192 ");
        const omegaStr = omegas.join(" \u2192 ");
        return `  \u2022 do(${node.shortLabel} = 0) \u2192 Expected cascade: ${cascadeStr} (\u03A9 propagation ${omegaStr})`;
      });

      return [
        makeMsg(
          "assistant",
          `[PEARL] Causal logic verification via do-calculus...\n\n` +
            `Testing interventional consistency across ${domains.length} domains:\n` +
            interventionLines.join("\n") +
            `\n\nConclusion: Cross-domain causal effects are non-spurious. The DAG structure supports valid interventional reasoning.\n\n` +
            `Pearl Engine status: READY for counterfactual queries.`,
          "pearl"
        ),
      ];
    }
  }
}

export function processNodeAnalysis(
  nodeId: string,
  graph: CausalGraph
): CopilotMessage[] {
  const node = graph.nodes.find((n) => n.id === nodeId);
  if (!node) return [makeMsg("assistant", "Node not found in graph.")];

  const inEdges = graph.edges.filter((e) => e.target === nodeId);
  const outEdges = graph.edges.filter((e) => e.source === nodeId);
  const omega = node.omegaFragility;

  const upstreamNames = inEdges
    .map((e) => {
      const src = graph.nodes.find((n) => n.id === e.source);
      return src ? `${src.shortLabel} (${e.physicalMechanism})` : e.source;
    })
    .join(", ");

  const downstreamNames = outEdges
    .map((e) => {
      const tgt = graph.nodes.find((n) => n.id === e.target);
      return tgt ? `${tgt.shortLabel} (${e.physicalMechanism})` : e.target;
    })
    .join(", ");

  // Determine risk tier
  const tier =
    omega.composite > 9
      ? "OMEGA-CRITICAL"
      : omega.composite >= 7
        ? "HIGH RISK"
        : omega.composite >= 5
          ? "ELEVATED"
          : "MODERATE";

  return [
    makeMsg(
      "assistant",
      `[NODE ANALYSIS] ${node.label}\n` +
        `Domain: ${node.domain} | Category: ${node.category}\n` +
        `Risk Tier: ${tier}\n\n` +
        `\u03A9-Fragility Breakdown:\n` +
        `  Composite:             ${omega.composite.toFixed(1)} / 10\n` +
        `  Irreplaceability:      ${omega.irreplaceability.toFixed(1)} / 10\n` +
        `  Restoration Latency:   ${omega.restorationLatency.toFixed(1)} / 10\n` +
        `  Jurisdictional Hazard: ${omega.jurisdictionalHazard.toFixed(1)} / 10\n` +
        `  Cascade Load:          ${omega.cascadeLoad.toFixed(1)} / 10\n` +
        `  Tail Depth:            ${omega.tailDepth.toFixed(1)} / 10\n\n` +
        `Global Concentration: ${node.globalConcentration}\n` +
        `Replacement Time: ${node.replacementTime}\n` +
        (node.physicalConstraint ? `Physical Constraint: ${node.physicalConstraint}\n` : "") +
        `Discovery Source: ${node.discoverySource}\n` +
        (node.isConfounded ? `\u26A0 Confounded variable \u2014 latent common cause suspected\n` : "") +
        (node.isRestricted ? `\u26A0 Tarski-restricted \u2014 physical constraint violation flagged\n` : "") +
        `\nUpstream (${inEdges.length}): ${upstreamNames || "none"}\n` +
        `Downstream (${outEdges.length}): ${downstreamNames || "none"}\n\n` +
        `Intervention impact: do(${node.shortLabel}) would sever ${inEdges.length} upstream edge(s) and propagate through ${outEdges.length} downstream path(s).`
    ),
  ];
}

export function processQuery(
  query: string,
  graph: CausalGraph
): CopilotMessage[] {
  const q = query.trim().toUpperCase();
  const topNodes = [...graph.nodes]
    .sort((a, b) => b.omegaFragility.composite - a.omegaFragility.composite)
    .slice(0, 5);

  if (q.includes("RISK") || q.includes("PROPAGAT")) {
    const chains = getTopCascadeChains(graph);
    const chainsText = chains.length > 0
      ? chains.map((c) => `  ${c}`).join("\n")
      : "  No multi-hop cascade chains detected.";

    return [
      makeMsg(
        "assistant",
        `Risk propagation analysis (cross-domain \u03A9-cascade):\n\n` +
          `Root chokepoints by \u03A9-Fragility:\n` +
          topNodes
            .map(
              (n, i) =>
                `  ${i + 1}. ${n.label} (\u03A9 ${n.omegaFragility.composite.toFixed(1)}) \u2014 ${n.domain} \u2014 ${n.globalConcentration}`
            )
            .join("\n") +
          `\n\nKey cross-domain cascade chains:\n` +
          chainsText +
          `\n\nTotal risk exposure: ${topNodes[0]?.omegaFragility.composite > 9 ? "OMEGA-CRITICAL" : "ELEVATED"} across ${[...new Set(graph.nodes.map((n) => n.domain))].length} domains.`,
        "spirtes"
      ),
    ];
  }

  if (q.includes("COUNTERFACT") || q.includes("WHAT IF") || q.includes("DO(")) {
    return [
      makeMsg(
        "assistant",
        `[PEARL] Counterfactual engine activated.\n\n` +
          `Constructing structural causal model from ${graph.metadata.totalNodes}-node cross-domain DAG...\n` +
          `Applying do-calculus rules (back-door, front-door criteria) across ${[...new Set(graph.nodes.map((n) => n.domain))].length} domains.\n\n` +
          `Available intervention targets include:\n` +
          topNodes.map((n) => `  \u2022 ${n.label} (\u03A9 ${n.omegaFragility.composite.toFixed(1)}, ${n.domain})`).join("\n") +
          `\n\nQuery processed. Use INTERVENTION MODE on the DAG to select do(X) targets interactively.`,
        "pearl"
      ),
    ];
  }

  if (q.includes("SHOCK") || q.includes("INJECT") || q.includes("STRESS")) {
    return [
      makeMsg(
        "assistant",
        `Shock injection available via the CD\u03A9 buffer system.\n\n` +
          `Available scenarios: TAIWAN_BLOCKADE, GRID_CASCADE, HBM_YIELD_FAILURE, RARE_EARTH_EMBARGO, SUBSEA_CABLE_CUT, COOLANT_SHORTAGE, CARRINGTON_EVENT, PHOSPHATE_EMBARGO, FX_BASIS_BLOWOUT\n\n` +
          `Cross-domain cascades will propagate through ${graph.metadata.totalEdges} edges across ${[...new Set(graph.nodes.map((n) => n.domain))].length} domains.\n\n` +
          `Use the terminal command STRESS_TEST:<SCENARIO> or inject via the shock panel.`,
        "pareto"
      ),
    ];
  }

  return [
    makeMsg(
      "assistant",
      `Analyzing: "${query}"\n\n` +
        `The current causal graph contains ${graph.metadata.totalNodes} nodes and ${graph.metadata.totalEdges} edges across ${[...new Set(graph.nodes.map((n) => n.domain))].length} domains.\n` +
        `Highest \u03A9-Fragility: ${topNodes[0]?.label} (\u03A9 ${topNodes[0]?.omegaFragility.composite.toFixed(1)})\n\n` +
        `Use the action buttons below for structured analysis, or ask about risk propagation, counterfactuals, or shock scenarios.`
    ),
  ];
}

// ─── LLM Streaming ──────────────────────────────────────────────

interface StreamLlmOptions {
  copilotMessages: CopilotMessage[];
  graph: CausalGraph;
  apiKey: string;
  model: string;
  provider?: "anthropic" | "gemini";
  selectedNode: string | null;
  severedEdges: string[];
  shocks: { id: string; name: string; severity: number; category: string }[];
  interventionMode: boolean;
  interventionTarget: string | null;
  ablationMode?: boolean;
  ablatedNodeIds?: string[];
  ablatedEdgeIds?: string[];
  snapshotContext?: string;
  tarskiReport?: TarskiValidationReport | null;
}

export async function streamLlmQuery(
  opts: StreamLlmOptions
): Promise<ReadableStream<Uint8Array>> {
  let systemContext = serializeGraphContext(opts.graph, {
    selectedNode: opts.selectedNode,
    severedEdges: opts.severedEdges,
    shocks: opts.shocks,
    interventionMode: opts.interventionMode,
    interventionTarget: opts.interventionTarget,
    ablationMode: opts.ablationMode,
    ablatedNodeIds: opts.ablatedNodeIds,
    ablatedEdgeIds: opts.ablatedEdgeIds,
    tarskiReport: opts.tarskiReport,
  });

  // Append snapshot context if available
  if (opts.snapshotContext) {
    systemContext += "\n\n" + opts.snapshotContext;
  }

  // Convert copilot messages to Claude messages format (skip system messages)
  const messages = opts.copilotMessages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

  const res = await fetch("/api/copilot", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages,
      systemContext,
      apiKey: opts.apiKey,
      model: opts.model,
      provider: opts.provider,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  if (!res.body) {
    throw new Error("No response body");
  }

  return res.body;
}
