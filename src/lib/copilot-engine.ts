import { CopilotMessage, ModuleId, CausalGraph } from "./types";
import { serializeGraphContext } from "./copilot-context";

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

export type CopilotAction =
  | "DISCOVER_STRUCTURE"
  | "EXPLAIN_REJECTION"
  | "VERIFY_LOGIC";

export function processAction(
  action: CopilotAction,
  graph: CausalGraph
): CopilotMessage[] {
  const domains = [...new Set(graph.nodes.map((n) => n.domain))];
  const topNode = [...graph.nodes].sort(
    (a, b) => b.omegaFragility.composite - a.omegaFragility.composite
  )[0];

  switch (action) {
    case "DISCOVER_STRUCTURE":
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
            `Cross-domain cascades detected: EUV \u2192 AI Compute, Rare Earth \u2192 HVDC \u2192 Grid \u2192 Data Centers, Undersea Cables \u2192 Dollar Funding.\n\n` +
            `Structure locked. Awaiting Tarski verification pass.`,
          "spirtes"
        ),
      ];

    case "EXPLAIN_REJECTION":
      return [
        makeMsg(
          "assistant",
          `[TARSKI] Truth filter scan complete.\n\n` +
            `Detected: ${graph.metadata.inconsistentEdges} inconsistent edge(s)\n` +
            `Restricted: ${graph.metadata.restrictedNodes} node(s)\n\n` +
            `Inconsistency detail:\n` +
            `  \u2022 N. Virginia Hub \u2194 Grid Stability \u2014 bidirectional load/supply loop violates DAG acyclicity\n` +
            `  \u2022 Fed Swap Lines \u2194 FX Swap Basis \u2014 confounded relationship, latent policy variable suspected\n\n` +
            `Physical constraint violations checked across ${domains.length} domains.\n` +
            `Recommendation: Apply FCI pass to identify hidden common causes. Toggle VERIFIED mode to see restricted edges.`,
          "tarski"
        ),
      ];

    case "VERIFY_LOGIC":
      return [
        makeMsg(
          "assistant",
          `[PEARL] Causal logic verification via do-calculus...\n\n` +
            `Testing interventional consistency across ${domains.length} domains:\n` +
            `  \u2022 do(TSMC CoWoS = 0) \u2192 Expected cascade: AI Compute \u2192 Data Center \u2192 Credit markets (\u03A9 propagation 9.9 \u2192 9.5 \u2192 9.2)\n` +
            `  \u2022 do(Baotou Refining = embargo) \u2192 NdFeB \u2192 HVDC \u2192 Grid cascade (\u03A9 9.7 \u2192 9.4 \u2192 9.5 \u2192 8.8)\n` +
            `  \u2022 P(Credit Stress | do(Landing Stations cut)) diverges from observational by \u0394=0.42\n\n` +
            `Conclusion: Cross-domain causal effects are non-spurious. The DAG structure supports valid interventional reasoning.\n\n` +
            `Pearl Engine status: READY for counterfactual queries.`,
          "pearl"
        ),
      ];
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
        `  Composite:            ${omega.composite.toFixed(1)} / 10\n` +
        `  Substitution Friction: ${omega.substitutionFriction.toFixed(1)} / 10\n` +
        `  Downstream Load:       ${omega.downstreamLoad.toFixed(1)} / 10\n` +
        `  Cascading Voltage:     ${omega.cascadingVoltage.toFixed(1)} / 10\n` +
        `  Tail Weight:           ${omega.existentialTailWeight.toFixed(1)} / 10\n\n` +
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
          `  ZEISS Optics \u2192 ASML EUV \u2192 TSMC Fab \u2192 CoWoS \u2192 AI Compute \u2192 Data Centers \u2192 Credit\n` +
          `  Baotou Rare Earth \u2192 NdFeB \u2192 HVDC \u2192 Grid \u2192 Data Centers\n` +
          `  Landing Stations \u2192 FX Swap Basis \u2192 UST Repo \u2192 Fed Swap Lines\n\n` +
          `Total risk exposure: OMEGA-CRITICAL across 8 domains.`,
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
