// ─── Built-in copilot tools ─────────────────────────────────────
//
// Every tool the copilot can call is registered here via defineTool.
// Adding a new tool: define its name, params, and handler. The
// system prompt and the action runner pick it up automatically.

import { defineTool } from "./tool-registry";
import { getPresetShocks } from "../omega-engine";
import { DOMAIN_CARDS } from "@/lib/domains";
// `buildGraphFromDomains` lives in a module that statically imports the
// four large graph-data files (~5K LOC total). Top-of-file import would
// drag those into every consumer of `copilot/tools.ts` — including
// SystemCopilot's initial-paint bundle. Lazy-imported inside the
// `applyDomainFilter` helper instead so the heavy data only loads when
// the user actually invokes a `set_domains` / `select_domains` tool
// call, which is rare enough that the small async delay on first use
// is well worth the launch-time win.
// import { buildGraphFromDomains } from "@/lib/build-domain-graph";
import {
  solveInterdictionAsync,
  type InterdictionCandidate,
} from "../interdiction-engine";
import type { ApexState } from "@/stores/useApexStore";
import type { CausalNode, CausalGraph } from "../types";
// `AXIOM_LIBRARY` is an 891-LOC dataset of Tarski axiom definitions —
// huge module. Top-of-file import dragged it into SystemCopilot's
// initial-paint bundle even though only one handler (the axiom-
// filtered `remove_restricted_nodes` tool) actually reads it. Lazy-
// imported inline below.
// import { AXIOM_LIBRARY } from "../tarski-data";

// ─── Selection ──────────────────────────────────────────────────

defineTool({
  name: "select_node",
  description: "Select and highlight a single node by id or label.",
  params: {
    node: {
      type: "string",
      required: true,
      description: "Node id, shortLabel, or label",
    },
  },
  legacyParam: "node",
  handler: ({ node }, ctx) => {
    const store = ctx.getStore();
    const target = node.toLowerCase();
    const found = store.graphData.nodes.find(
      (n) =>
        n.id === node ||
        n.shortLabel.toLowerCase() === target ||
        n.label.toLowerCase() === target,
    );
    if (!found) return `Node not found: ${node}`;
    store.setSelectedNode(found.id);
    return `Selected node: ${found.label}`;
  },
});

// ─── Isolation ──────────────────────────────────────────────────

defineTool({
  name: "isolate_nodes",
  description:
    "Filter the visible graph to a subset of nodes. Two modes: `query=<text>` does a literal substring match against id/shortLabel/label/category/domain (no semantic inference). `ids=A|B|C` isolates an explicit list. Non-matching nodes dim out across 2D / 3D / map views.",
  guidance:
    "Pick the right mode:\n" +
    "  - `ids=A|B|C` (PREFERRED for any semantic intent): when the user names a REGION, THEME, GEOGRAPHY, OR ANY CONCEPT that requires you to REASON about which nodes apply. You can see the full node list in === NODES === above — enumerate the relevant ids and emit them. Example: 'show me Europe-related' → enumerate the undersea cables that traverse Europe, the European banks, etc, then emit `ids=ic_flag_europe_asia|ic_seamewe5|fc_cross_border_banking|...`.\n" +
    "  - `query=<text>` (ONLY for clear literal-substring intent): when you'd expect the literal text to appear in node names/labels. Example: 'show me energy nodes' where many node labels contain 'energy'. If you're not sure the literal text is in the searched fields (id/shortLabel/label/category/domain), use `ids=` instead — `query=` does NOT do semantic matching, only substring.\n" +
    "Do NOT pre-narrate which specific nodes will be matched. The SYS line below your response shows the actual result. Describe the intent ('isolating Europe-related nodes') and let the result line confirm. If you list specific nodes in prose and the tool matches a different set, the user sees a mismatch.\n" +
    "Emit reset_isolation when the conversation broadens again.",
  params: {
    query: {
      type: "string",
      description: "Free-text match against id/shortLabel/label/category/domain (case-insensitive substring)",
    },
    ids: {
      type: "string[]",
      description: "Explicit node ids — separated with `|` (ids=USA_GRID|EU_GRID)",
    },
  },
  handler: ({ query, ids }, ctx) => {
    const store = ctx.getStore();
    const nodes = store.graphData.nodes;

    let matched: typeof nodes = [];
    let basis: string;

    if (ids && ids.length > 0) {
      const idSet = new Set(ids);
      matched = nodes.filter((n) => idSet.has(n.id));
      basis = `ids=${ids.join(",")}`;
    } else if (query && query.trim() !== "") {
      const q = query.toLowerCase();
      matched = nodes.filter(
        (n) =>
          n.id.toLowerCase().includes(q) ||
          n.shortLabel.toLowerCase().includes(q) ||
          n.label.toLowerCase().includes(q) ||
          n.category.toLowerCase().includes(q) ||
          n.domain.toLowerCase().includes(q),
      );
      basis = `query="${query}"`;
    } else {
      return "isolate_nodes: provide either query=<text> or ids=A|B|C";
    }

    if (matched.length === 0) {
      return `No nodes matched ${basis}. Isolation not applied.`;
    }

    store.setSelectedNodes(matched.map((n) => n.id));
    store.setIsolateSelection(true);

    const preview = matched
      .slice(0, 5)
      .map((n) => n.shortLabel || n.id)
      .join(", ");
    const more = matched.length > 5 ? ` (+${matched.length - 5} more)` : "";
    return `Isolated ${matched.length} node${matched.length === 1 ? "" : "s"} matching ${basis}: ${preview}${more}`;
  },
});

defineTool({
  name: "reset_isolation",
  description: "Clear node isolation — show the full graph again.",
  params: {},
  handler: (_params, ctx) => {
    const store = ctx.getStore();
    store.setIsolateSelection(false);
    store.setSelectedNodes([]);
    return "Cleared isolation; showing full graph.";
  },
});

// ─── Shocks ─────────────────────────────────────────────────────

defineTool({
  name: "add_shock",
  description: "Inject a stress scenario by id (TAIWAN_BLOCKADE, GRID_CASCADE, etc).",
  params: {
    id: { type: "string", required: true, description: "Preset shock id" },
  },
  legacyParam: "id",
  handler: ({ id }, ctx) => {
    const store = ctx.getStore();
    const presets = getPresetShocks();
    const shock = presets.find((s) => s.id === id);
    if (!shock) return `Unknown shock: ${id}`;
    if (store.shocks.find((s) => s.id === shock.id)) {
      return `Shock already active: ${shock.name}`;
    }
    store.addShock(shock);
    return `Injected shock: ${shock.name}`;
  },
});

defineTool({
  name: "remove_shock",
  description: "Remove an active shock by id.",
  params: {
    id: { type: "string", required: true, description: "Active shock id" },
  },
  legacyParam: "id",
  handler: ({ id }, ctx) => {
    const store = ctx.getStore();
    const existing = store.shocks.find((s) => s.id === id);
    if (!existing) return `Shock not active: ${id}`;
    store.removeShock(id);
    return `Removed shock: ${existing.name}`;
  },
});

// ─── Module + view ──────────────────────────────────────────────

defineTool({
  name: "set_module",
  description: "Switch the active analysis module.",
  params: {
    module: {
      type: "enum",
      values: ["spirtes", "tarski", "pearl", "pareto"] as const,
      required: true,
    },
  },
  legacyParam: "module",
  handler: ({ module }, ctx) => {
    ctx.getStore().setActiveModule(module);
    return `Switched to ${module.toUpperCase()} module`;
  },
});

defineTool({
  name: "set_view",
  description: "Switch the visualization mode.",
  params: {
    mode: { type: "enum", values: ["2d", "3d"] as const, required: true },
  },
  legacyParam: "mode",
  handler: ({ mode }, ctx) => {
    ctx.getStore().setViewMode(mode);
    return `Switched to ${mode.toUpperCase()} view`;
  },
});

// ─── Edges ──────────────────────────────────────────────────────

defineTool({
  name: "sever_edge",
  description: "Pearl link-break on a single edge.",
  params: {
    edge: { type: "string", required: true, description: "Edge id" },
  },
  legacyParam: "edge",
  handler: ({ edge }, ctx) => {
    const store = ctx.getStore();
    const found = store.graphData.edges.find((e) => e.id === edge);
    if (!found) return `Edge not found: ${edge}`;
    store.severEdge(found.id);
    return `Severed edge: ${found.source} → ${found.target}`;
  },
});

defineTool({
  name: "reset_severed",
  description: "Reset all severed edges.",
  params: {},
  handler: (_params, ctx) => {
    ctx.getStore().resetSeveredEdges();
    return "Reset all severed edges";
  },
});

// ─── Replay ─────────────────────────────────────────────────────

defineTool({
  name: "start_replay",
  description: "Start the cascade replay animation.",
  params: {},
  handler: (_params, ctx) => {
    ctx.getStore().startReplay();
    return "Started cascade replay";
  },
});

defineTool({
  name: "stop_replay",
  description: "Stop the cascade replay animation.",
  params: {},
  handler: (_params, ctx) => {
    ctx.getStore().stopReplay();
    return "Stopped cascade replay";
  },
});

// ─── Truth filter ───────────────────────────────────────────────

defineTool({
  name: "set_truth_filter",
  description: "Toggle Tarski truth filter between RAW and VERIFIED.",
  params: {
    mode: { type: "enum", values: ["raw", "verified"] as const, required: true },
  },
  legacyParam: "mode",
  handler: ({ mode }, ctx) => {
    ctx.getStore().setTruthFilter(mode);
    return `Truth filter set to: ${mode.toUpperCase()}`;
  },
});

// ─── Domains ────────────────────────────────────────────────────

async function applyDomainFilter(domainIds: string[], store: ApexState): Promise<string> {
  // Validate against known domains.
  const validIds = domainIds.filter((id) => DOMAIN_CARDS.find((d) => d.id === id && d.hasData));
  if (validIds.length === 0) {
    return `No valid domains found. Available: ${DOMAIN_CARDS.filter((d) => d.hasData).map((d) => d.id).join(", ")}`;
  }
  // Lazy-load the graph-builder + its ~5K LOC of bundled graph-data
  // here so the static import chain stays light. See the import-
  // comment at the top of this file.
  const { buildGraphFromDomains } = await import("@/lib/build-domain-graph");
  const graph = buildGraphFromDomains(validIds);
  store.setGraphData(graph);
  store.setSelectedDomains(validIds);
  store.setIsMultiDomainMode(validIds.length > 1);
  const labels = validIds.map((id) => DOMAIN_CARDS.find((d) => d.id === id)?.label ?? id);
  return `Filtered network to: ${labels.join(", ")} (${graph.metadata.totalNodes} nodes, ${graph.metadata.totalEdges} edges)`;
}

defineTool({
  name: "set_domains",
  description: "Filter the network to specific domains (rebuilds the graph).",
  guidance:
    "When the user describes a role, strategy, or context ('I am a CDS trader'), pick the relevant domains and filter. Then explain why.",
  params: {
    domains: {
      type: "string[]",
      required: true,
      description: "Domain ids — separated with `|` (domains=energy|semiconductors)",
    },
  },
  legacyParam: "domains",
  handler: ({ domains }, ctx) => applyDomainFilter(domains, ctx.getStore()),
});

defineTool({
  name: "select_domains",
  description: "Alias for set_domains.",
  params: {
    domains: { type: "string[]", required: true, description: "Domain ids — separated with `|`" },
  },
  legacyParam: "domains",
  handler: ({ domains }, ctx) => applyDomainFilter(domains, ctx.getStore()),
});

// ─── Interdiction ───────────────────────────────────────────────

defineTool({
  name: "solve_interdiction",
  description:
    "Run the greedy minimax interdiction solver. Auto-switches to PEARL and renders cuts in the panel.",
  guidance:
    "Trigger this whenever the user asks about optimal cuts, defensive cuts, where to intervene, how to defend, what to sever, or any 'find/solve/recommend cuts'. If no shocks are active, inject one first via add_shock. After the solver returns, explain the cuts and offer apply_interdiction:targets=all or specific indices.",
  params: {
    budget: { type: "number", min: 1, max: 10, default: 3, description: "Max number of cuts" },
    mode: { type: "enum", values: ["edge", "node", "both"] as const, default: "edge" },
  },
  // Async handler so the registry's `await tool.handler(...)` lets the
  // chunked minimax solver yield to the event loop between candidates.
  // Without this the copilot's "solve interdiction" tool would re-freeze
  // the UI for the full 5–15s sync solve, even after PR #356 made the
  // React-component CASCADE DEFENSE non-blocking.
  handler: async ({ budget, mode }, ctx) => {
    const store = ctx.getStore();
    const result = await solveInterdictionAsync(
      store.graphData,
      store.shocks,
      store.severedEdges,
      budget,
      mode,
    );

    const lines = [
      `Interdiction solved (budget=${budget}, mode=${mode}):`,
      `  Baseline damage: ${result.baselineDamage.toFixed(1)}/100`,
      `  Optimal damage: ${result.bestDamage.toFixed(1)}/100`,
      `  Reduction: ${result.reductionPct.toFixed(1)}%`,
    ];

    if (result.interventions.length > 0) {
      lines.push(`  Recommended cuts:`);
      result.interventions.forEach((iv, i) => {
        lines.push(
          `    ${i + 1}. [${iv.target.type}] ${iv.target.label} (${iv.target.id}) — saves ${iv.marginalReduction.toFixed(1)}pts`,
        );
      });
      lines.push(`  → Switched to PEARL module. Review cuts in the intervention panel.`);
      store.setLastInterdictionResult(result);
    } else {
      // Fall back to structural vulnerability when cascade damage is
      // too low to discriminate — same logic as the pre-registry version.
      const fallbackCandidates: InterdictionCandidate[] = [];

      if (mode !== "node") {
        const criticalEdges = store.graphData.edges
          .filter((e) => e.weight >= 0.7 && !e.isSevered)
          .sort((a, b) => b.weight - a.weight)
          .slice(0, budget);
        for (const e of criticalEdges) {
          const src = store.graphData.nodes.find((n) => n.id === e.source);
          const tgt = store.graphData.nodes.find((n) => n.id === e.target);
          fallbackCandidates.push({
            target: {
              type: "edge",
              id: e.id,
              label: `${src?.shortLabel ?? e.source} → ${tgt?.shortLabel ?? e.target}`,
            },
            damage: result.baselineDamage,
            marginalReduction: e.weight * 10,
          });
        }
      }

      if (mode !== "edge") {
        const highOmegaNodes = [...store.graphData.nodes]
          .sort((a, b) => b.omegaFragility.composite - a.omegaFragility.composite)
          .slice(0, budget);
        for (const n of highOmegaNodes) {
          fallbackCandidates.push({
            target: { type: "node", id: n.id, label: n.shortLabel },
            damage: result.baselineDamage,
            marginalReduction: n.omegaFragility.composite,
          });
        }
      }

      fallbackCandidates.sort((a, b) => b.marginalReduction - a.marginalReduction);
      const trimmed = fallbackCandidates.slice(0, budget);

      const reason =
        "Cascade damage too low to rank cuts — showing highest structural vulnerability (edge weight / ΩF) instead.";

      store.setLastInterdictionResult({
        ...result,
        interventions: trimmed,
        fallbackReason: reason,
      });

      lines.push(`  No high-damage cascade detected — recommending structural vulnerability cuts:`);
      trimmed.forEach((iv, i) => {
        const suffix =
          iv.target.type === "edge"
            ? `(w-score ${iv.marginalReduction.toFixed(1)}, id:${iv.target.id})`
            : `(ΩF ${iv.marginalReduction.toFixed(1)}, id:${iv.target.id})`;
        lines.push(`    ${i + 1}. [${iv.target.type}] ${iv.target.label} ${suffix}`);
      });
      lines.push(`  → Switched to PEARL module. Cuts rendered in the intervention panel.`);
    }

    store.setActiveModule("pearl");
    return lines.join("\n");
  },
});

defineTool({
  name: "apply_interdiction",
  description:
    "Apply interventions from the most recent solve_interdiction. Pass targets=all or targets=1|3 (1-based indices).",
  params: {
    targets: {
      type: "string",
      required: true,
      description: "'all' or pipe-separated 1-based indices",
    },
  },
  legacyParam: "targets",
  handler: ({ targets }, ctx) => {
    const store = ctx.getStore();
    const last = store.lastInterdictionResult;
    if (!last || last.interventions.length === 0) {
      return "No interdiction results to apply. Run solve_interdiction first.";
    }

    // Guard against re-applying a cut that's already in place (matters
    // for node cuts: toggleAblatedNode is a toggle, so running it
    // twice would un-ablate). Edge severing is already idempotent at
    // the store level but we mirror the check here for symmetry.
    const ablatedSet = new Set(store.ablatedNodeIds);
    const severedSet = new Set(store.severedEdges);

    if (targets === "all") {
      const applied: string[] = [];
      for (const iv of last.interventions) {
        if (iv.target.type === "edge") {
          if (!severedSet.has(iv.target.id)) store.severEdge(iv.target.id);
          applied.push(iv.target.label);
        } else {
          if (!ablatedSet.has(iv.target.id)) store.toggleAblatedNode(iv.target.id);
          applied.push(iv.target.label);
        }
      }
      // Closing the scenario → cuts → impact loop: after the cuts
      // land, kick off cascade replay so the analyst sees propagation
      // and the MC fan updates against the new state without having
      // to chase Start Replay manually. Matches the UI's APPLY ALL &
      // SIMULATE affordance so chat-driven and click-driven paths
      // behave identically.
      store.startAblationReplay();
      return `Applied all ${applied.length} interdictions: ${applied.join(", ")}. Cascade replay running against the new cut set.`;
    }

    // Accept either pipe-separated (new format) or comma-separated
    // (back-compat with legacy `apply_interdiction:1,2`).
    const sep = targets.includes("|") ? "|" : ",";
    const indices = targets.split(sep).map((s) => parseInt(s.trim(), 10) - 1);
    const applied: string[] = [];
    for (const idx of indices) {
      const iv = last.interventions[idx];
      if (!iv) continue;
      if (iv.target.type === "edge") {
        if (!severedSet.has(iv.target.id)) store.severEdge(iv.target.id);
        applied.push(iv.target.label);
      } else {
        if (!ablatedSet.has(iv.target.id)) store.toggleAblatedNode(iv.target.id);
        applied.push(iv.target.label);
      }
    }
    if (applied.length === 0) return `No valid intervention indices: ${targets}`;
    store.startAblationReplay();
    return `Applied interdictions: ${applied.join(", ")}. Cascade replay running against the new cut set.`;
  },
});

// ─── Node analysis ──────────────────────────────────────────────

/**
 * Resolve a node ref (id, shortLabel, or label) on the active
 * graph. Returns null if no match. Shared between explain_node
 * and compare_nodes so they treat references the same way the
 * other tools do.
 */
function resolveNode(graph: CausalGraph, ref: string): CausalNode | null {
  const target = ref.toLowerCase();
  return (
    graph.nodes.find(
      (n) =>
        n.id === ref ||
        n.shortLabel.toLowerCase() === target ||
        n.label.toLowerCase() === target,
    ) ?? null
  );
}

/** Compact analysis text for an LLM context window. */
function nodeAnalysisText(node: CausalNode, graph: CausalGraph): string {
  const omega = node.omegaFragility;
  const tier =
    omega.composite > 9
      ? "OMEGA-CRITICAL"
      : omega.composite >= 7
        ? "HIGH RISK"
        : omega.composite >= 5
          ? "ELEVATED"
          : "MODERATE";
  const inEdges = graph.edges.filter((e) => e.target === node.id);
  const outEdges = graph.edges.filter((e) => e.source === node.id);
  const upstreamLabels = inEdges
    .slice(0, 8)
    .map((e) => graph.nodes.find((n) => n.id === e.source)?.shortLabel ?? e.source)
    .join(", ");
  const downstreamLabels = outEdges
    .slice(0, 8)
    .map((e) => graph.nodes.find((n) => n.id === e.target)?.shortLabel ?? e.target)
    .join(", ");

  const flags: string[] = [];
  if (node.isConfounded) flags.push("CONFOUNDED");
  if (node.isRestricted) flags.push("TARSKI-RESTRICTED");

  return [
    `${node.label} [${node.id}] — ${node.domain} / ${node.category} — ${tier}`,
    `  Ω composite ${omega.composite.toFixed(1)}/10 ` +
      `(irr ${omega.irreplaceability.toFixed(1)}, rest ${omega.restorationLatency.toFixed(1)}, ` +
      `jur ${omega.jurisdictionalHazard.toFixed(1)}, casc ${omega.cascadeLoad.toFixed(1)}, ` +
      `tail ${omega.tailDepth.toFixed(1)})`,
    `  Concentration: ${node.globalConcentration} | Replacement: ${node.replacementTime}`,
    node.physicalConstraint ? `  Physical: ${node.physicalConstraint}` : null,
    flags.length > 0 ? `  Flags: ${flags.join(", ")}` : null,
    `  Upstream (${inEdges.length}): ${upstreamLabels || "none"}`,
    `  Downstream (${outEdges.length}): ${downstreamLabels || "none"}`,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

defineTool({
  name: "explain_node",
  description:
    "Return a compact Ω-fragility breakdown + upstream/downstream summary for a single node. Useful when the user asks 'what is X?' or 'why does X matter?'.",
  params: {
    node: { type: "string", required: true, description: "Node id, shortLabel, or label" },
  },
  legacyParam: "node",
  handler: ({ node }, ctx) => {
    const graph = ctx.getStore().graphData;
    const found = resolveNode(graph, node);
    if (!found) return `Node not found: ${node}`;
    return nodeAnalysisText(found, graph);
  },
});

defineTool({
  name: "compare_nodes",
  description:
    "Side-by-side Ω-fragility comparison of two or more nodes. Useful when the user asks 'how does X compare to Y?' or 'which is more critical?'.",
  guidance:
    "Pass at least 2 nodes (ids=A|B or ids=A|B|C). The handler emits each node's compact analysis followed by a delta on Ω composite — that's enough for the LLM to reason about which is more fragile and on which dimension.",
  params: {
    ids: {
      type: "string[]",
      required: true,
      description: "Two or more node ids — separated with `|` (ids=USA_GRID|EU_GRID)",
    },
  },
  legacyParam: "ids",
  handler: ({ ids }, ctx) => {
    if (ids.length < 2) {
      return `compare_nodes needs at least two ids; got ${ids.length}.`;
    }
    const graph = ctx.getStore().graphData;
    const resolved = ids.map((ref) => ({ ref, node: resolveNode(graph, ref) }));
    const missing = resolved.filter((r) => r.node === null).map((r) => r.ref);
    if (missing.length > 0) return `Nodes not found: ${missing.join(", ")}`;

    const blocks = resolved
      .map((r) => nodeAnalysisText(r.node as CausalNode, graph))
      .join("\n\n");

    // Highlight the delta on Ω composite — the most-asked dimension.
    const sortedByOmega = resolved
      .map((r) => r.node as CausalNode)
      .sort((a, b) => b.omegaFragility.composite - a.omegaFragility.composite);
    const winner = sortedByOmega[0];
    const loser = sortedByOmega[sortedByOmega.length - 1];
    const delta = winner.omegaFragility.composite - loser.omegaFragility.composite;

    return (
      blocks +
      `\n\nDelta: ${winner.shortLabel} is ${delta.toFixed(1)} Ω points more fragile than ${loser.shortLabel}.`
    );
  },
});

// ─── Tarski validation ─────────────────────────────────────────

defineTool({
  name: "run_tarski",
  description:
    "Re-run Tarski axiom validation against the current graph. Returns inconsistent-edge / restricted-node counts so the LLM can talk about the result.",
  params: {},
  handler: (_params, ctx) => {
    const store = ctx.getStore();
    store.runTarskiWithAxioms();
    // After the synchronous re-run the report is back on the store.
    const report = ctx.getStore().tarskiReport;
    if (!report) return "Tarski validation ran but produced no report.";
    return (
      `Tarski validation complete: ${report.inconsistentEdgeIds.size} inconsistent edge(s), ` +
      `${report.restrictedNodeIds.size} restricted node(s), ${report.proofTraces.length} proof trace(s).`
    );
  },
});

defineTool({
  name: "enable_axioms",
  description:
    "Choose which Tarski axioms are ACTIVE, then re-run validation so the graph re-renders the resulting inconsistent edges / restricted nodes. Pass axiom ids (A-01|R-01|H-02) or name fragments. This REPLACES the active set (not additive).",
  guidance:
    "Use when the user wants to focus the Tarski lens on a specific axiom set: 'check only temporal priority and the chokepoint axioms', 'turn on the T1D axioms', 'arbitrarily pick three axioms and show how they render'. The full catalog (ids + names) is in === TARSKI AXIOMS === in the live context — pick ids from there. Don't pre-state the resulting counts; the SYS result line confirms what was enabled and how it rendered.",
  params: {
    axioms: {
      type: "string[]",
      required: true,
      description: "Axiom ids or name fragments separated by | (e.g. A-01|R-01|H-02)",
    },
  },
  legacyParam: "axioms",
  handler: async ({ axioms }, ctx) => {
    const store = ctx.getStore();
    const { AXIOM_LIBRARY } = await import("../tarski-data");
    const resolved = new Set<string>();
    const unmatched: string[] = [];
    for (const a of axioms) {
      const q = a.trim().toLowerCase();
      if (!q) continue;
      const hit = AXIOM_LIBRARY.find(
        (ax) => ax.id.toLowerCase() === q || ax.name.toLowerCase().includes(q),
      );
      if (hit) resolved.add(hit.id);
      else unmatched.push(a);
    }
    if (resolved.size === 0) {
      return `No axioms matched ${axioms.join(", ")}. Use ids like A-01, R-01, H-02 (see === TARSKI AXIOMS ===).`;
    }
    store.setEnabledAxioms(resolved);
    store.runTarskiWithAxioms();
    const names = [...resolved]
      .map((id) => {
        const ax = AXIOM_LIBRARY.find((a) => a.id === id);
        return ax ? `${ax.id} ${ax.name}` : id;
      })
      .join(", ");
    const note = unmatched.length > 0 ? ` (no match: ${unmatched.join(", ")})` : "";
    const report = ctx.getStore().tarskiReport;
    const rendered = report
      ? ` → ${report.inconsistentEdgeIds.size} inconsistent edge(s), ${report.restrictedNodeIds.size} restricted node(s)`
      : "";
    return `Enabled ${resolved.size} axiom(s): ${names}${note}${rendered}`;
  },
});

defineTool({
  name: "set_axiom_level",
  description:
    "Filter active Tarski axioms by level, then re-run validation. all = every level; 0 = core; 1 = regional; 2 = higher-order.",
  params: {
    level: { type: "enum", values: ["all", "0", "1", "2"] as const, required: true },
  },
  legacyParam: "level",
  handler: ({ level }, ctx) => {
    const store = ctx.getStore();
    const f: "all" | 0 | 1 | 2 = level === "all" ? "all" : (Number(level) as 0 | 1 | 2);
    store.setAxiomLevelFilter(f);
    store.runTarskiWithAxioms();
    return `Axiom level filter set to: ${level}`;
  },
});

// ─── Visualization controls ─────────────────────────────────────

defineTool({
  name: "set_node_size_metric",
  description:
    "Change what the 3D orb sizes encode. omega = Ω-fragility composite (default). eigenvector / betweenness = network-centrality metrics from layout.",
  params: {
    metric: {
      type: "enum",
      values: ["omega", "eigenvector", "betweenness"] as const,
      required: true,
    },
  },
  legacyParam: "metric",
  handler: ({ metric }, ctx) => {
    ctx.getStore().setNodeSizeMetric(metric);
    return `Node size metric set to: ${metric}`;
  },
});

// ─── Ablation reset (symmetric with reset_severed) ──────────────

defineTool({
  name: "reset_ablation",
  description: "Clear all ablated nodes and edges. Symmetric with reset_severed.",
  params: {},
  handler: (_params, ctx) => {
    ctx.getStore().resetAblation();
    return "Reset all ablations";
  },
});

// ─── Bulk-remove restricted nodes ────────────────────────────────
//
// Closes a tool-surface gap: "remove all the redlined nodes that
// violated Tarski axioms" had no single-tool answer. The LLM
// would describe the action without emitting it, leaving the user
// staring at unchanged restricted nodes. This tool turns that
// intent into one action: ablate every node currently in
// `tarskiReport.restrictedNodeIds`, optionally narrowed to those
// flagged by a specific axiom.

defineTool({
  name: "remove_restricted_nodes",
  description:
    "Ablate every Tarski-flagged restricted node (the redlined ones). Removes them from downstream analysis — symmetric with reset_ablation. Optional axiom param narrows the removal to nodes flagged by a specific axiom (by id or name substring, case-insensitive).",
  guidance:
    "Use whenever the user says any of: 'remove restricted/redlined/flagged nodes', 'clean up the graph based on Tarski', 'drop the axiom violations', 'show only the verified subgraph by removing the bad nodes', or names a specific axiom to filter on (e.g. 'remove nodes that failed the temporal-priority axiom'). This actually mutates the graph (via ablation); set_truth_filter:verified only hides them visually — pick this tool when the user wants real removal.",
  params: {
    axiom: {
      type: "string",
      description: "Optional. Axiom id (e.g. A-01) OR a substring of the axiom name. Case-insensitive. Omit to remove ALL restricted nodes.",
    },
  },
  handler: async ({ axiom }, ctx) => {
    const store = ctx.getStore();
    const report = store.tarskiReport;
    if (!report) {
      return "No Tarski report available. Run Tarski validation first, then retry.";
    }
    if (report.restrictedNodeIds.size === 0) {
      return "No restricted nodes to remove — graph is already Tarski-clean.";
    }

    // Resolve the optional axiom filter into a Set<string> of
    // matching axiom ids. The user can pass either the id directly
    // ("A-01") or a substring of the axiom name ("temporal
    // priority", "multi-int fusion", etc).
    let axiomIds: Set<string> | null = null;
    if (axiom && axiom.trim() !== "") {
      const q = axiom.trim().toLowerCase();
      // Lazy-load the 891-LOC axiom library. See the import-comment
      // at the top of this file.
      const { AXIOM_LIBRARY } = await import("../tarski-data");
      const matches = AXIOM_LIBRARY.filter(
        (a) =>
          a.id.toLowerCase() === q ||
          a.id.toLowerCase().includes(q) ||
          a.name.toLowerCase().includes(q),
      );
      if (matches.length === 0) {
        return `No Tarski axiom matched "${axiom}". Examples: A-01 (Temporal Priority), A-04 (Hormuz Chokepoint), R-01 (Jurisdictional Concentration).`;
      }
      axiomIds = new Set(matches.map((a) => a.id));
    }

    // Resolve the candidate node set. With no filter: every
    // restricted node. With a filter: only nodes whose proof
    // traces include at least one matching axiom id. Proof
    // traces are per-edge, so we promote edge → both endpoints
    // to get the node set.
    let candidateIds: Set<string>;
    if (axiomIds === null) {
      candidateIds = new Set(report.restrictedNodeIds);
    } else {
      candidateIds = new Set<string>();
      for (const trace of report.proofTraces) {
        if (!trace.violatedAxioms.some((id) => axiomIds!.has(id))) continue;
        const edge = store.graphData.edges.find((e) => e.id === trace.edgeId);
        if (!edge) continue;
        // Only ablate endpoints that are themselves flagged as
        // restricted — staying within the Tarski-flagged set.
        if (report.restrictedNodeIds.has(edge.source)) candidateIds.add(edge.source);
        if (report.restrictedNodeIds.has(edge.target)) candidateIds.add(edge.target);
      }
      if (candidateIds.size === 0) {
        return `No restricted nodes match axiom "${axiom}".`;
      }
    }

    // Skip nodes that are already ablated (toggle would un-ablate
    // them — wrong direction). Then toggle each remaining one.
    const alreadyAblated = new Set(store.ablatedNodeIds);
    const toAblate = [...candidateIds].filter((id) => !alreadyAblated.has(id));

    if (toAblate.length === 0) {
      return `All ${candidateIds.size} matching restricted node(s) are already ablated.`;
    }

    // Turn ablation mode on so the rendering layer hides the
    // ablated subgraph. Then ablate one node at a time — the
    // store handler auto-ablates each node's connected edges.
    store.setAblationMode(true);
    for (const id of toAblate) {
      store.toggleAblatedNode(id);
    }

    // Build a human-readable summary referencing labels where
    // possible. The LLM uses this to explain what it did.
    const preview = toAblate
      .slice(0, 5)
      .map((id) => store.graphData.nodes.find((n) => n.id === id)?.shortLabel ?? id);
    const more = toAblate.length > 5 ? ` (+${toAblate.length - 5} more)` : "";
    const scope = axiom ? ` matching axiom "${axiom}"` : "";
    return (
      `Removed ${toAblate.length} restricted node${toAblate.length === 1 ? "" : "s"}${scope}: ` +
      `${preview.join(", ")}${more}. ` +
      `Use reset_ablation to restore them.`
    );
  },
});

// ─── TTS voice picker ────────────────────────────────────────────
//
// Lets the user say "switch to Matthew" or "use a British male
// voice" and have the copilot actually update the TTS voice.
// Before this tool, the voice was hardcoded to "first available
// British female" — fine as a default, but no way to override.
//
// We do a case-insensitive substring match on the available
// SpeechSynthesisVoice names. Store field is just a string; the
// next speakText() call uses it via the existing override path.

defineTool({
  name: "set_voice",
  description:
    "Change the TTS voice the AI speaks in. Accepts a voice name OR a substring (case-insensitive). Examples: 'Matthew', 'Samantha', 'Daniel', 'British', 'female'. Pass an empty string to clear the override and fall back to the British-female default.",
  guidance:
    "Fire whenever the user says 'switch to X voice', 'use the X voice', 'change your voice to X', or names a different speaker. The match is fuzzy — 'matthew' matches 'Microsoft Matthew - English (United States)', 'british male' matches 'Daniel (en-GB)'. If the user's intended voice isn't installed on the machine the call returns a clear error listing what IS available.",
  params: {
    name: {
      type: "string",
      required: true,
      description:
        "Substring of the desired voice name. Empty string resets to the default (British female).",
    },
  },
  legacyParam: "name",
  handler: ({ name }, ctx) => {
    const store = ctx.getStore();
    const trimmed = (name ?? "").trim();

    // Empty string = clear override → fall back to British female.
    if (trimmed === "") {
      store.setPreferredVoiceName(null);
      return "Cleared voice override — using British female default on next response.";
    }

    // Browser-only: getVoices is on window.speechSynthesis.
    if (typeof window === "undefined" || !window.speechSynthesis) {
      // Still set the override — speakText falls back gracefully.
      store.setPreferredVoiceName(trimmed);
      return `Voice override set to "${trimmed}" (speech synthesis not available in this environment to verify).`;
    }

    const voices = window.speechSynthesis.getVoices();
    if (voices.length === 0) {
      // Voices load asynchronously in some browsers — set the
      // override anyway, speakText will resolve it later.
      store.setPreferredVoiceName(trimmed);
      return `Voice override set to "${trimmed}" — will activate on the next response (voice list still loading).`;
    }

    const q = trimmed.toLowerCase();
    const match = voices.find((v) => v.name.toLowerCase().includes(q));

    if (!match) {
      // Don't persist a bad override — leave the previous default
      // intact. Show the user a sample of available voices so they
      // can pick again.
      const sample = voices
        .filter((v) => v.lang.startsWith("en"))
        .slice(0, 8)
        .map((v) => `${v.name} (${v.lang})`)
        .join(", ");
      return (
        `No voice on this machine matches "${trimmed}". ` +
        `Available English voices: ${sample}${voices.length > 8 ? ", …" : ""}.`
      );
    }

    store.setPreferredVoiceName(trimmed);
    return `Voice switched to ${match.name} (${match.lang}). Takes effect on the next response.`;
  },
});
