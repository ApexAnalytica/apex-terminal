// ─── Built-in copilot tools ─────────────────────────────────────
//
// Every tool the copilot can call is registered here via defineTool.
// Adding a new tool: define its name, params, and handler. The
// system prompt and the action runner pick it up automatically.

import { defineTool } from "./tool-registry";
import { getPresetShocks } from "../omega-engine";
import { DOMAIN_CARDS } from "@/lib/domains";
import { buildGraphFromDomains } from "@/lib/build-domain-graph";
import { solveInterdiction, type InterdictionCandidate } from "../interdiction-engine";
import type { ApexState } from "@/stores/useApexStore";

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
    "Filter the visible graph to a subset of nodes — by free-text query or explicit ids. Non-matching nodes dim out across 2D / 3D / map views.",
  guidance:
    "Use whenever the user names a topic, theme, sector, or set of entities ('focus on energy infrastructure', 'just show me the semiconductor stuff'). Match a query against label/category/domain; pass ids when the user names specific nodes. Emit reset_isolation when the conversation broadens again.",
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

function applyDomainFilter(domainIds: string[], store: ApexState): string {
  // Validate against known domains.
  const validIds = domainIds.filter((id) => DOMAIN_CARDS.find((d) => d.id === id && d.hasData));
  if (validIds.length === 0) {
    return `No valid domains found. Available: ${DOMAIN_CARDS.filter((d) => d.hasData).map((d) => d.id).join(", ")}`;
  }
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
  handler: ({ budget, mode }, ctx) => {
    const store = ctx.getStore();
    const result = solveInterdiction(
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

    if (targets === "all") {
      const applied: string[] = [];
      for (const iv of last.interventions) {
        if (iv.target.type === "edge") {
          store.severEdge(iv.target.id);
          applied.push(iv.target.label);
        } else {
          store.toggleAblatedNode(iv.target.id);
          applied.push(iv.target.label);
        }
      }
      return `Applied all ${applied.length} interdictions: ${applied.join(", ")}`;
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
        store.severEdge(iv.target.id);
        applied.push(iv.target.label);
      } else {
        store.toggleAblatedNode(iv.target.id);
        applied.push(iv.target.label);
      }
    }
    return applied.length > 0
      ? `Applied interdictions: ${applied.join(", ")}`
      : `No valid intervention indices: ${targets}`;
  },
});
