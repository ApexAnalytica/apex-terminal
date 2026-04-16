// ─── Copilot Action Router ──────────────────────────────────────
// Parses <<<ACTION:type:param>>> blocks from LLM responses and
// executes them against the Apex store.

import { useApexStore } from "@/stores/useApexStore";
import { getPresetShocks } from "./omega-engine";
import { DOMAIN_CARDS, buildGraphFromDomains } from "@/components/DomainSelector";
import { solveInterdiction } from "./interdiction-engine";

export interface ParsedAction {
  type: string;
  param: string;
  raw: string;
}

// ─── Parse actions from LLM response text ───────────────────────

const ACTION_REGEX = /<<<ACTION:(\w+):?(.*?)>>>/g;

export function parseActions(text: string): ParsedAction[] {
  const actions: ParsedAction[] = [];
  let match;
  while ((match = ACTION_REGEX.exec(text)) !== null) {
    actions.push({
      type: match[1],
      param: match[2] ?? "",
      raw: match[0],
    });
  }
  return actions;
}

// ─── Strip action blocks from display text ──────────────────────

export function stripActions(text: string): string {
  return text.replace(ACTION_REGEX, "").replace(/\n{3,}/g, "\n\n").trim();
}

// ─── Execute a parsed action against the store ──────────────────

export function executeAction(action: ParsedAction): string | null {
  const store = useApexStore.getState();
  const presetShocks = getPresetShocks();

  switch (action.type) {
    case "select_node": {
      const node = store.graphData.nodes.find(
        (n) => n.id === action.param || n.shortLabel.toLowerCase() === action.param.toLowerCase()
          || n.label.toLowerCase() === action.param.toLowerCase()
      );
      if (node) {
        store.setSelectedNode(node.id);
        return `Selected node: ${node.label}`;
      }
      return `Node not found: ${action.param}`;
    }

    case "add_shock": {
      const shock = presetShocks.find((s) => s.id === action.param);
      if (shock) {
        // Check if already active
        if (!store.shocks.find((s) => s.id === shock.id)) {
          store.addShock(shock);
          return `Injected shock: ${shock.name}`;
        }
        return `Shock already active: ${shock.name}`;
      }
      return `Unknown shock: ${action.param}`;
    }

    case "remove_shock": {
      const existing = store.shocks.find((s) => s.id === action.param);
      if (existing) {
        store.removeShock(action.param);
        return `Removed shock: ${existing.name}`;
      }
      return `Shock not active: ${action.param}`;
    }

    case "set_module": {
      const valid = ["spirtes", "tarski", "pearl", "pareto"];
      if (valid.includes(action.param)) {
        store.setActiveModule(action.param as "spirtes" | "tarski" | "pearl" | "pareto");
        return `Switched to ${action.param.toUpperCase()} module`;
      }
      return `Invalid module: ${action.param}`;
    }

    case "set_view": {
      if (action.param === "2d" || action.param === "3d") {
        store.setViewMode(action.param);
        return `Switched to ${action.param.toUpperCase()} view`;
      }
      return `Invalid view mode: ${action.param}`;
    }

    case "sever_edge": {
      const edge = store.graphData.edges.find((e) => e.id === action.param);
      if (edge) {
        store.severEdge(edge.id);
        return `Severed edge: ${edge.source} → ${edge.target}`;
      }
      return `Edge not found: ${action.param}`;
    }

    case "reset_severed": {
      store.resetSeveredEdges();
      return "Reset all severed edges";
    }

    case "start_replay": {
      store.startReplay();
      return "Started cascade replay";
    }

    case "stop_replay": {
      store.stopReplay();
      return "Stopped cascade replay";
    }

    case "set_truth_filter": {
      if (action.param === "raw" || action.param === "verified") {
        store.setTruthFilter(action.param);
        return `Truth filter set to: ${action.param.toUpperCase()}`;
      }
      return `Invalid filter: ${action.param}`;
    }

    case "set_domains": {
      const domainIds = action.param.split(",").map((d) => d.trim()).filter(Boolean);
      // Validate domain IDs against known domains
      const validIds = domainIds.filter((id) => DOMAIN_CARDS.find((d) => d.id === id && d.hasData));
      if (validIds.length > 0) {
        // Rebuild graph from the selected domains
        const graph = buildGraphFromDomains(validIds);
        store.setGraphData(graph);
        store.setSelectedDomains(validIds);
        store.setIsMultiDomainMode(validIds.length > 1);
        const labels = validIds.map((id) => DOMAIN_CARDS.find((d) => d.id === id)?.label ?? id);
        return `Filtered network to: ${labels.join(", ")} (${graph.metadata.totalNodes} nodes, ${graph.metadata.totalEdges} edges)`;
      }
      return `No valid domains found. Available: ${DOMAIN_CARDS.filter((d) => d.hasData).map((d) => d.id).join(", ")}`;
    }

    case "select_domains": {
      // Alias for set_domains — LLM may use either
      const domainIds = action.param.split(",").map((d) => d.trim()).filter(Boolean);
      const validIds = domainIds.filter((id) => DOMAIN_CARDS.find((d) => d.id === id && d.hasData));
      if (validIds.length > 0) {
        const graph = buildGraphFromDomains(validIds);
        store.setGraphData(graph);
        store.setSelectedDomains(validIds);
        store.setIsMultiDomainMode(validIds.length > 1);
        const labels = validIds.map((id) => DOMAIN_CARDS.find((d) => d.id === id)?.label ?? id);
        return `Filtered network to: ${labels.join(", ")} (${graph.metadata.totalNodes} nodes, ${graph.metadata.totalEdges} edges)`;
      }
      return `No valid domains found. Available: ${DOMAIN_CARDS.filter((d) => d.hasData).map((d) => d.id).join(", ")}`;
    }

    case "solve_interdiction": {
      // Parse params: budget=3,mode=edge
      const params = Object.fromEntries(
        action.param.split(",").map((p) => {
          const [k, v] = p.split("=");
          return [k?.trim(), v?.trim()];
        })
      );
      const budget = Math.min(10, Math.max(1, parseInt(params.budget ?? "3", 10) || 3));
      const mode = (["edge", "node", "both"].includes(params.mode ?? "") ? params.mode : "edge") as "edge" | "node" | "both";

      const result = solveInterdiction(
        store.graphData,
        store.shocks,
        store.severedEdges,
        budget,
        mode,
      );

      store.setLastInterdictionResult(result);

      // Format results as readable text for the copilot to reference
      const lines = [
        `Interdiction solved (budget=${budget}, mode=${mode}):`,
        `  Baseline damage: ${result.baselineDamage.toFixed(1)}/100`,
        `  Optimal damage: ${result.bestDamage.toFixed(1)}/100`,
        `  Reduction: ${result.reductionPct.toFixed(1)}%`,
        `  Recommended cuts:`,
      ];
      result.interventions.forEach((iv, i) => {
        lines.push(`    ${i + 1}. [${iv.target.type}] ${iv.target.label} (${iv.target.id}) — saves ${iv.marginalReduction.toFixed(1)}pts`);
      });
      return lines.join("\n");
    }

    case "apply_interdiction": {
      // Apply specific intervention by index (1-based) or "all"
      const lastResult = store.lastInterdictionResult;
      if (!lastResult || lastResult.interventions.length === 0) {
        return "No interdiction results to apply. Run solve_interdiction first.";
      }

      if (action.param === "all") {
        const applied: string[] = [];
        for (const iv of lastResult.interventions) {
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

      // Apply specific indices: "1,3" or "1"
      const indices = action.param.split(",").map((s) => parseInt(s.trim(), 10) - 1);
      const applied: string[] = [];
      for (const idx of indices) {
        const iv = lastResult.interventions[idx];
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
        : `No valid intervention indices: ${action.param}`;
    }

    default:
      return `Unknown action: ${action.type}`;
  }
}

// ─── Process all actions from an LLM response ──────────────────

export function processLlmActions(text: string): {
  displayText: string;
  actionResults: string[];
} {
  const actions = parseActions(text);
  const displayText = stripActions(text);
  const actionResults: string[] = [];

  for (const action of actions) {
    const result = executeAction(action);
    if (result) {
      actionResults.push(result);
    }
  }

  return { displayText, actionResults };
}
