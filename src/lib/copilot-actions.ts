// ─── Copilot Action Router ──────────────────────────────────────
// Parses <<<ACTION:type:param>>> blocks from LLM responses and
// executes them against the Apex store.

import { useApexStore } from "@/stores/useApexStore";
import { getPresetShocks } from "./omega-engine";
import { DOMAIN_CARDS, buildGraphFromDomains } from "@/components/DomainSelector";

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
