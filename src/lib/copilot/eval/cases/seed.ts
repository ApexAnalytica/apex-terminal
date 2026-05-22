// ─── Eval seed cases ────────────────────────────────────────────
//
// Initial hand-curated test set. Bias toward cases that exercise
// distinct behaviors, not redundant variations. Add tagged cases
// over time as we observe failure patterns in production traces.
//
// Adding a case: append to SEED_CASES, ensure graph_fixture is
// satisfied, and run `npm run eval` against your candidate models.
// Cases that pass on Gemini but fail on a local 8B distillation
// are exactly what we want — that's the diagnostic signal.

import type { CausalGraph, CausalNode, CausalEdge } from "@/lib/types";
import type { GraphFixtureName, TestCase } from "../types";

// ─── Fixtures ───────────────────────────────────────────────────

function omega(composite: number) {
  return {
    composite,
    irreplaceability: composite,
    cascadeLoad: composite,
    tailDepth: composite,
    restorationLatency: composite,
    jurisdictionalHazard: composite,
  };
}

function node(overrides: Partial<CausalNode> & { id: string }): CausalNode {
  return {
    label: overrides.id,
    shortLabel: overrides.id.slice(0, 6),
    category: "infrastructure",
    omegaFragility: omega(5),
    globalConcentration: "Unknown",
    replacementTime: "Unknown",
    domain: "Test",
    discoverySource: "merged",
    isConfounded: false,
    isRestricted: false,
    ...overrides,
  };
}

function edge(o: Partial<CausalEdge> & { id: string; source: string; target: string }): CausalEdge {
  return {
    weight: 0.5,
    lag: 0,
    type: "directed",
    confidence: 0.8,
    isInconsistent: false,
    physicalMechanism: "test",
    ...o,
  };
}

function makeMetadata(nodes: CausalNode[], edges: CausalEdge[]) {
  return {
    density: nodes.length > 1 ? edges.length / (nodes.length * (nodes.length - 1)) : 0,
    constraintType: "test",
    verificationStatus: "UNVERIFIED" as const,
    totalNodes: nodes.length,
    totalEdges: edges.length,
    inconsistentEdges: edges.filter((e) => e.isInconsistent).length,
    restrictedNodes: nodes.filter((n) => n.isRestricted).length,
  };
}

/**
 * Build the named graph fixture. Keep these small (5-10 nodes).
 * The eval is grading model behavior, not stress-testing graph
 * size — a tiny graph is faster to send and easier to read in
 * failure output.
 */
export function buildFixture(name: GraphFixtureName): CausalGraph {
  switch (name) {
    case "geopolitical_main": {
      const nodes = [
        node({ id: "GRID_USA", label: "USA Power Grid", category: "energy", domain: "Energy", omegaFragility: omega(8.5) }),
        node({ id: "OIL_TX", label: "Texas Oil Pipeline", category: "energy", domain: "Energy", omegaFragility: omega(7.2) }),
        node({ id: "FAB_TW", label: "TSMC Fab", category: "manufacturing", domain: "Semiconductors", omegaFragility: omega(9.5) }),
        node({ id: "ASML_NL", label: "ASML EUV Tools", category: "manufacturing", domain: "Semiconductors", omegaFragility: omega(9.8) }),
        node({ id: "BANK_NY", label: "NY Clearing Bank", category: "finance", domain: "Finance", omegaFragility: omega(8.0) }),
      ];
      const edges = [
        edge({ id: "e1", source: "GRID_USA", target: "FAB_TW" }),
        edge({ id: "e2", source: "OIL_TX", target: "FAB_TW" }),
        edge({ id: "e3", source: "ASML_NL", target: "FAB_TW", weight: 0.95 }),
      ];
      return { nodes, edges, metadata: makeMetadata(nodes, edges) };
    }
    case "small_energy": {
      const nodes = [
        node({ id: "GRID_USA", label: "USA Power Grid", category: "energy", domain: "Energy", omegaFragility: omega(8.5) }),
        node({ id: "OIL_TX", label: "Texas Oil Pipeline", category: "energy", domain: "Energy", omegaFragility: omega(7.2) }),
      ];
      return { nodes, edges: [], metadata: makeMetadata(nodes, []) };
    }
    case "empty":
      return { nodes: [], edges: [], metadata: makeMetadata([], []) };
  }
}

// ─── Seed test cases ────────────────────────────────────────────

export const SEED_CASES: TestCase[] = [
  {
    id: "isolate_energy",
    description:
      "User asks for energy focus — model should isolate the subgraph (either via isolate_nodes or set_domains).",
    user_message: "show me only the energy stuff",
    graph_fixture: "geopolitical_main",
    accepted_tool_calls: [
      { name: "isolate_nodes", params_match: { query: /energ/i } },
      { name: "set_domains", params_match: { domains: { array_includes: "energy-systems" } } },
    ],
    tags: ["tool-selection", "filtering"],
  },
  {
    id: "explain_node_specific",
    description:
      "User names a specific node and asks why it matters — should call explain_node, not just answer in prose.",
    user_message: "tell me about TSMC Fab — why does it matter?",
    graph_fixture: "geopolitical_main",
    accepted_tool_calls: [
      { name: "explain_node", params_match: { node: { includes: "FAB_TW" } } },
      { name: "explain_node", params_match: { node: /tsmc/i } },
      { name: "select_node", params_match: { node: { includes: "FAB_TW" } } },
    ],
    required_in_response: [/TSMC|FAB_TW|fragility|Ω/i],
    tags: ["tool-selection", "node-detail"],
  },
  {
    id: "compare_two_nodes",
    description:
      "User asks 'compare X to Y' — should fire compare_nodes with both ids.",
    user_message: "how does TSMC Fab compare to ASML EUV Tools?",
    graph_fixture: "geopolitical_main",
    accepted_tool_calls: [
      { name: "compare_nodes" }, // params hard to predict — just check the tool fires
    ],
    tags: ["tool-selection", "comparison"],
  },
  {
    id: "plain_qa_no_tools",
    description:
      "User asks a definitional question — should NOT emit a tool call, just explain.",
    user_message: "what is omega-fragility?",
    graph_fixture: "geopolitical_main",
    forbid_tool_calls: true,
    required_in_response: [/(omega|Ω).{0,40}fragility/i],
    tags: ["refusal", "no-tool"],
  },
  {
    id: "switch_module_pearl",
    description:
      "User explicitly asks to switch to PEARL — should call set_module:pearl.",
    user_message: "switch to the PEARL module please",
    graph_fixture: "geopolitical_main",
    accepted_tool_calls: [{ name: "set_module", params_match: { module: "pearl" } }],
    tags: ["tool-selection", "navigation"],
  },
  {
    id: "reset_isolation_after",
    description:
      "User asks to see the full graph again — should reset isolation.",
    user_message: "show me everything again, clear the filter",
    graph_fixture: "geopolitical_main",
    accepted_tool_calls: [
      { name: "reset_isolation" },
      { name: "set_domains" }, // also acceptable — reset by re-selecting all domains
    ],
    tags: ["tool-selection", "reset"],
  },
  {
    id: "interdiction_intent",
    description:
      "User asks where to defend — should fire solve_interdiction. This is the canonical case the system prompt explicitly trains for.",
    user_message:
      "we need to defend against a supply chain shock — where should we cut?",
    graph_fixture: "geopolitical_main",
    accepted_tool_calls: [
      { name: "solve_interdiction" },
      // Acceptable to inject a shock first before solving.
      { name: "add_shock" },
    ],
    tags: ["tool-selection", "interdiction"],
  },

  // ─── Module navigation (each engine) ────────────────────────────

  {
    id: "switch_module_tarski",
    description: "User asks to switch to TARSKI — set_module:tarski.",
    user_message: "switch to the TARSKI module",
    graph_fixture: "geopolitical_main",
    accepted_tool_calls: [{ name: "set_module", params_match: { module: "tarski" } }],
    tags: ["tool-selection", "navigation"],
  },
  {
    id: "switch_module_pareto",
    description: "User asks to switch to PARETO — set_module:pareto.",
    user_message: "open the pareto module",
    graph_fixture: "geopolitical_main",
    accepted_tool_calls: [{ name: "set_module", params_match: { module: "pareto" } }],
    tags: ["tool-selection", "navigation"],
  },
  {
    id: "switch_module_spirtes",
    description: "User asks to switch to SPIRTES — set_module:spirtes.",
    user_message: "go to the SPIRTES discovery module",
    graph_fixture: "geopolitical_main",
    accepted_tool_calls: [{ name: "set_module", params_match: { module: "spirtes" } }],
    tags: ["tool-selection", "navigation"],
  },

  // ─── View toggles ───────────────────────────────────────────────

  {
    id: "set_view_3d",
    description: "User asks for 3D view — set_view:3d.",
    user_message: "give me the 3D view please",
    graph_fixture: "geopolitical_main",
    accepted_tool_calls: [{ name: "set_view", params_match: { mode: "3d" } }],
    tags: ["tool-selection", "view"],
  },
  {
    id: "set_view_2d",
    description: "User asks for 2D view — set_view:2d.",
    user_message: "switch to 2D",
    graph_fixture: "geopolitical_main",
    accepted_tool_calls: [{ name: "set_view", params_match: { mode: "2d" } }],
    tags: ["tool-selection", "view"],
  },
  {
    id: "set_node_size_metric_eigenvector",
    description:
      "User asks to size orbs by eigenvector centrality — set_node_size_metric:eigenvector.",
    user_message: "size the nodes by eigenvector centrality",
    graph_fixture: "geopolitical_main",
    accepted_tool_calls: [
      { name: "set_node_size_metric", params_match: { metric: "eigenvector" } },
    ],
    tags: ["tool-selection", "view"],
  },

  // ─── Filtering / verification ───────────────────────────────────

  {
    id: "set_truth_filter_verified",
    description:
      "User asks for verified-only view — set_truth_filter:verified.",
    user_message: "only show me verified edges",
    graph_fixture: "geopolitical_main",
    accepted_tool_calls: [
      { name: "set_truth_filter", params_match: { mode: "verified" } },
    ],
    tags: ["tool-selection", "filtering"],
  },

  // ─── Replay ─────────────────────────────────────────────────────

  {
    id: "start_replay",
    description: "User asks to play the cascade — start_replay.",
    user_message: "play the cascade replay",
    graph_fixture: "geopolitical_main",
    accepted_tool_calls: [{ name: "start_replay" }],
    tags: ["tool-selection", "replay"],
  },

  // ─── Direct selection / isolation ───────────────────────────────

  {
    id: "select_node_by_label",
    description:
      "User names a node by label and asks to select it — select_node OR explain_node both acceptable.",
    user_message: "select TSMC Fab",
    graph_fixture: "geopolitical_main",
    accepted_tool_calls: [
      { name: "select_node", params_match: { node: { includes: "TSMC" } } },
      { name: "select_node", params_match: { node: { includes: "FAB" } } },
      // Some models reasonably interpret "select X" as "tell me about X".
      { name: "explain_node", params_match: { node: { includes: "TSMC" } } },
    ],
    tags: ["tool-selection", "selection"],
  },
  {
    id: "isolate_by_explicit_ids",
    description:
      "User names two nodes by close-to-id phrasing — should isolate to that pair, mapping the user's text to the real graph ids (GRID_USA, FAB_TW).",
    user_message:
      "show only USA Grid and TSMC Fab, hide everything else",
    graph_fixture: "geopolitical_main",
    accepted_tool_calls: [
      {
        name: "isolate_nodes",
        params_match: { ids: { array_includes: "GRID_USA" } },
      },
    ],
    tags: ["tool-selection", "filtering"],
  },

  // ─── Definitional Q&A (no tools) ───────────────────────────────

  {
    id: "plain_qa_tarski",
    description:
      "User asks what Tarski validation checks. Question reads both ways — pure prose OR run_tarski + explanation are both legitimate. We don't constrain tool selection here; we just require the response to explain the concept.",
    user_message: "what does the Tarski engine actually check?",
    graph_fixture: "geopolitical_main",
    // No accepted_tool_calls + no forbid_tool_calls = any tool behavior passes.
    required_in_response: [/(constraint|axiom|consistency|verif)/i],
    tags: ["explanation", "ambiguous-intent"],
  },
  {
    id: "plain_qa_pearl_methodology",
    description:
      "User asks how do-calculus / Pearl interventions work. Same ambiguous-intent shape as plain_qa_tarski — we accept any tool behavior, just require the response to mention the relevant concepts.",
    user_message: "how does the Pearl module reason about interventions?",
    graph_fixture: "geopolitical_main",
    // No tool constraint — accept either pure prose OR tools + explanation.
    required_in_response: [/(do.calculus|intervention|counterfactual|do\(|backdoor|sever)/i],
    tags: ["explanation", "ambiguous-intent"],
  },

  // ─── Out-of-scope handling ─────────────────────────────────────

  {
    id: "off_topic_redirect",
    description:
      "User asks something completely off-topic. Model should NOT emit tools (no tool fits) and ideally redirect or say it's outside scope rather than hallucinate weather data.",
    user_message: "what's the weather in Manhattan today?",
    graph_fixture: "geopolitical_main",
    forbid_tool_calls: true,
    // Either an explicit redirect, or absence of a confident weather answer.
    forbidden_in_response: [/\d+\s*°|sunny|cloudy|rain(\s|y|ing)|temperature/i],
    tags: ["refusal", "no-tool", "off-topic"],
  },
];
