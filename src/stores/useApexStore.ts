import { create } from "zustand";
import {
  CausalShock,
  CausalNode,
  CausalEdge,
  ModuleId,
  ViewMode,
  TruthFilter,
  CopilotMessage,
  CausalGraph,
} from "@/lib/types";
import { mergeGraphs } from "@/lib/import/merge";
import { MAIN_GRAPH } from "@/lib/graph-data";

interface ApexState {
  // Module navigation
  activeModule: ModuleId;
  setActiveModule: (id: ModuleId) => void;

  // Causal graph
  graphData: CausalGraph;
  initialGraph: CausalGraph;
  setGraphData: (g: CausalGraph) => void;

  // Shocks
  shocks: CausalShock[];
  addShock: (shock: CausalShock) => void;
  removeShock: (id: string) => void;

  // View
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;

  // Truth filter
  truthFilter: TruthFilter;
  setTruthFilter: (f: TruthFilter) => void;

  // Selected node (focus)
  selectedNode: string | null;
  setSelectedNode: (nodeId: string | null) => void;

  // Intervention mode
  interventionMode: boolean;
  interventionTarget: string | null;
  setInterventionMode: (on: boolean) => void;
  setInterventionTarget: (nodeId: string | null) => void;

  // Scissors tool (Pearl)
  scissorsMode: boolean;
  severedEdges: string[];
  setScissorsMode: (on: boolean) => void;
  severEdge: (edgeId: string) => void;
  resetSeveredEdges: () => void;

  // Tarski axiom filter
  axiomLevelFilter: "all" | 0 | 1 | 2;
  setAxiomLevelFilter: (f: "all" | 0 | 1 | 2) => void;

  // Copilot
  copilotMessages: CopilotMessage[];
  addCopilotMessage: (msg: CopilotMessage) => void;

  // Import modal
  importModalOpen: boolean;
  setImportModalOpen: (open: boolean) => void;
  mergeGraphData: (nodes: CausalNode[], edges: CausalEdge[]) => void;
}

export const useApexStore = create<ApexState>((set) => ({
  // Module
  activeModule: "spirtes",
  setActiveModule: (id) => set({ activeModule: id }),

  // Graph
  graphData: MAIN_GRAPH,
  initialGraph: MAIN_GRAPH,
  setGraphData: (g) => set({ graphData: g, initialGraph: g }),

  // Shocks
  shocks: [],
  addShock: (shock) =>
    set((s) => {
      if (s.shocks.some((sh) => sh.id === shock.id)) return s;
      return { shocks: [...s.shocks, shock] };
    }),
  removeShock: (id) =>
    set((s) => ({ shocks: s.shocks.filter((sh) => sh.id !== id) })),

  // View
  viewMode: "3d",
  setViewMode: (mode) => set({ viewMode: mode }),

  // Truth filter
  truthFilter: "raw",
  setTruthFilter: (f) => set({ truthFilter: f }),

  // Selected node
  selectedNode: null,
  setSelectedNode: (nodeId) => set({ selectedNode: nodeId }),

  // Intervention
  interventionMode: false,
  interventionTarget: null,
  setInterventionMode: (on) =>
    set({ interventionMode: on, interventionTarget: on ? null : null }),
  setInterventionTarget: (nodeId) => set({ interventionTarget: nodeId }),

  // Scissors
  scissorsMode: false,
  severedEdges: [],
  setScissorsMode: (on) => set({ scissorsMode: on }),
  severEdge: (edgeId) =>
    set((s) => {
      if (s.severedEdges.includes(edgeId)) return s;
      return { severedEdges: [...s.severedEdges, edgeId] };
    }),
  resetSeveredEdges: () =>
    set((s) => ({ severedEdges: [], scissorsMode: false, graphData: s.initialGraph })),

  // Tarski axiom filter
  axiomLevelFilter: "all",
  setAxiomLevelFilter: (f) => set({ axiomLevelFilter: f }),

  // Copilot
  copilotMessages: [
    {
      id: "init-1",
      role: "system",
      content:
        "APEX SYNTHETIC SCIENTIST v2.0 initialized. Spirtes Engine active — structure discovery ready. Type a query or use the action buttons below.",
      timestamp: Date.now(),
    },
  ],
  addCopilotMessage: (msg) =>
    set((s) => ({ copilotMessages: [...s.copilotMessages, msg] })),

  // Import
  importModalOpen: false,
  setImportModalOpen: (open) => set({ importModalOpen: open }),
  mergeGraphData: (nodes, edges) =>
    set((s) => {
      const { graph } = mergeGraphs(s.graphData, { nodes, edges });
      return { graphData: graph, initialGraph: graph };
    }),
}));
