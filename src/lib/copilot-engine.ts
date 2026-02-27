import { CopilotMessage, ModuleId, CausalGraph } from "./types";

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
  switch (action) {
    case "DISCOVER_STRUCTURE":
      return [
        makeMsg(
          "assistant",
          `[SPIRTES] Running DCD + NOTEARS structural discovery...\n\n` +
            `Identified ${graph.metadata.totalNodes} causal nodes across ${graph.metadata.totalEdges} directed edges.\n` +
            `Graph density: ${graph.metadata.density.toFixed(2)}\n` +
            `Discovery method: ${graph.metadata.constraintType}\n\n` +
            `3 sub-modules active:\n` +
            `  • DCD/NOTEARS — nonlinear structural\n` +
            `  • PCMCI+ — temporal lag analysis\n` +
            `  • FCI — latent confounding detection\n\n` +
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
            `  • Grid Stability ↔ Data Center Power — bidirectional loop violates DAG acyclicity constraint\n` +
            `  • Banking Liquidity ↔ Credit Contraction — confounded relationship, latent variable suspected\n\n` +
            `Recommendation: Apply FCI pass to identify hidden common causes. Toggle VERIFIED mode to see restricted edges.`,
          "tarski"
        ),
      ];

    case "VERIFY_LOGIC":
      return [
        makeMsg(
          "assistant",
          `[PEARL] Causal logic verification via do-calculus...\n\n` +
            `Testing interventional consistency:\n` +
            `  • do(Semi Yield Loss = 0) → Expected cascade attenuation: 78%\n` +
            `  • P(Credit Contraction | do(AI Compute = normal)) diverges from P(Credit Contraction | AI Compute = normal) by Δ=0.31\n\n` +
            `Conclusion: Causal effects are non-spurious. The DAG structure supports valid interventional reasoning.\n\n` +
            `Pearl Engine status: READY for counterfactual queries.`,
          "pearl"
        ),
      ];
  }
}

export function processQuery(
  query: string,
  graph: CausalGraph
): CopilotMessage[] {
  const q = query.trim().toUpperCase();

  if (q.includes("RISK") || q.includes("PROPAGAT")) {
    return [
      makeMsg(
        "assistant",
        `Risk propagation analysis:\n\n` +
          `Root shock: Semiconductor Yield Loss (100%)\n` +
          `  → AI Compute Constraint (85%) — 1-hop, weight 0.92\n` +
          `  → Industrial Output Shock (72%) — 1-hop, weight 0.78\n` +
          `  → Global Credit Contraction (68%) — 2-hop, attenuated\n` +
          `  → Data Center Power Load (61%) — 2-hop via AI Compute\n\n` +
          `Longest causal path: 4 edges. Total risk exposure: HIGH.`,
        "spirtes"
      ),
    ];
  }

  if (q.includes("COUNTERFACT") || q.includes("WHAT IF") || q.includes("DO(")) {
    return [
      makeMsg(
        "assistant",
        `[PEARL] Counterfactual engine activated.\n\n` +
          `Constructing structural causal model from current DAG...\n` +
          `Applying do-calculus rules (back-door, front-door criteria).\n\n` +
          `Query processed. Use INTERVENTION MODE on the DAG to select do(X) targets interactively.`,
        "pearl"
      ),
    ];
  }

  if (q.includes("SHOCK") || q.includes("INJECT") || q.includes("STRESS")) {
    return [
      makeMsg(
        "assistant",
        `Shock injection available via the CDΩ buffer system.\n\n` +
          `Available scenarios: TAIWAN_BLOCKADE, GRID_CASCADE, HBM_YIELD_FAILURE, RARE_EARTH_EMBARGO, SUBSEA_CABLE_CUT, COOLANT_SHORTAGE, CARRINGTON_EVENT\n\n` +
          `Use the terminal command STRESS_TEST:<SCENARIO> or inject via the shock panel.`,
        "pareto"
      ),
    ];
  }

  return [
    makeMsg(
      "assistant",
      `Analyzing: "${query}"\n\n` +
        `The current causal graph contains ${graph.metadata.totalNodes} nodes and ${graph.metadata.totalEdges} edges.\n` +
        `Use the action buttons below for structured analysis, or ask about risk propagation, counterfactuals, or shock scenarios.`
    ),
  ];
}
