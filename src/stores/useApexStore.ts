import { create } from "zustand";
import {
  CausalShock,
  ModuleId,
  ViewMode,
  TruthFilter,
  CopilotMessage,
  CausalGraph,
} from "@/lib/types";
import { MAIN_GRAPH } from "@/lib/graph-data";

interface ApexState {
  // Module navigation
  activeModule: ModuleId;
  setActiveModule: (id: ModuleId) => void;

  // Causal graph
  graphData: CausalGraph;
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

  // Intervention mode
  interventionMode: boolean;
  interventionTarget: string | null;
  setInterventionMode: (on: boolean) => void;
  setInterventionTarget: (nodeId: string | null) => void;

  // Copilot
  copilotMessages: CopilotMessage[];
  addCopilotMessage: (msg: CopilotMessage) => void;
}

export const useApexStore = create<ApexState>((set) => ({
  // Module
  activeModule: "spirtes",
  setActiveModule: (id) => set({ activeModule: id }),

  // Graph
  graphData: MAIN_GRAPH,
  setGraphData: (g) => set({ graphData: g }),

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

  // Intervention
  interventionMode: false,
  interventionTarget: null,
  setInterventionMode: (on) =>
    set({ interventionMode: on, interventionTarget: on ? null : null }),
  setInterventionTarget: (nodeId) => set({ interventionTarget: nodeId }),

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
}));
