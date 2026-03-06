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
  EpochSnapshot,
  TimelineId,
} from "@/lib/types";

export interface ImportedDataset {
  id: string;
  name: string;
  timestamp: number;
  nodeIds: string[];
  edgeIds: string[];
  color: string;
}

export const DATASET_COLORS = [
  "#00e5ff", // cyan
  "#ff6d00", // orange
  "#7c4dff", // purple
  "#00e676", // green
  "#ff1744", // red
  "#ffab00", // amber
  "#448aff", // blue
  "#76ff03", // lime
];
import { mergeGraphs } from "@/lib/import/merge";
import { MAIN_GRAPH, EMPTY_GRAPH } from "@/lib/graph-data";
import { simulateCascade } from "@/lib/cascade-simulator";
import type { LLMProvider } from "@/lib/llm-providers";

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

  // Ablation mode
  ablationMode: boolean;
  ablatedNodeIds: string[];
  ablatedEdgeIds: string[];
  setAblationMode: (on: boolean) => void;
  toggleAblatedNode: (nodeId: string) => void;
  toggleAblatedEdge: (edgeId: string) => void;
  resetAblation: () => void;
  startAblationReplay: () => void;

  // Tarski axiom filter
  axiomLevelFilter: "all" | 0 | 1 | 2;
  setAxiomLevelFilter: (f: "all" | 0 | 1 | 2) => void;

  // Copilot
  copilotMessages: CopilotMessage[];
  addCopilotMessage: (msg: CopilotMessage) => void;

  // LLM config (session-only)
  llmProvider: LLMProvider;
  claudeApiKey: string;
  geminiApiKey: string;
  claudeModel: string;
  geminiModel: string;
  isLlmStreaming: boolean;
  setLlmProvider: (provider: LLMProvider) => void;
  setClaudeApiKey: (key: string) => void;
  setGeminiApiKey: (key: string) => void;
  setClaudeModel: (model: string) => void;
  setGeminiModel: (model: string) => void;
  setIsLlmStreaming: (streaming: boolean) => void;

  // Sandbox
  sandboxOrgName: string | null;
  setSandboxOrgName: (name: string | null) => void;
  sandboxGraphs: { id: string; name: string; graph: CausalGraph }[];
  activeSandboxGraphId: string | null;
  addSandboxGraph: (name: string, graph: CausalGraph) => void;
  switchSandboxGraph: (id: string) => void;
  deleteSandboxGraph: (id: string) => void;
  renameSandboxGraph: (id: string, name: string) => void;

  // Import modal
  importModalOpen: boolean;
  setImportModalOpen: (open: boolean) => void;
  mergeGraphData: (nodes: CausalNode[], edges: CausalEdge[], datasetColor?: string) => void;

  // Imported dataset tracking
  importedDatasets: ImportedDataset[];
  addImportedDataset: (dataset: ImportedDataset) => void;
  removeImportedDataset: (id: string) => void;

  // Replay / Cascade
  replayActive: boolean;
  replayPlaying: boolean;
  replaySpeed: number; // 0.5, 1, 2, 4
  currentEpoch: number;
  baselineEpochs: EpochSnapshot[];
  interventionEpochs: EpochSnapshot[];
  activeTimeline: TimelineId;
  replayBranchEpoch: number | null;
  startReplay: () => void;
  stopReplay: () => void;
  setReplayPlaying: (playing: boolean) => void;
  setReplaySpeed: (speed: number) => void;
  setCurrentEpoch: (epoch: number) => void;
  stepEpoch: (delta: number) => void;
  setActiveTimeline: (id: TimelineId) => void;
  branchFromCurrentEpoch: () => void;
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
  setScissorsMode: (on) => set((s) => ({
    scissorsMode: on,
    ...(on ? { ablationMode: false } : {}),
  })),
  severEdge: (edgeId) =>
    set((s) => {
      if (s.severedEdges.includes(edgeId)) return s;
      return { severedEdges: [...s.severedEdges, edgeId] };
    }),
  resetSeveredEdges: () =>
    set((s) => ({ severedEdges: [], scissorsMode: false, graphData: s.initialGraph })),

  // Ablation
  ablationMode: false,
  ablatedNodeIds: [],
  ablatedEdgeIds: [],
  setAblationMode: (on) => set((s) => ({
    ablationMode: on,
    ...(on ? { scissorsMode: false } : {}),
    ...(!on ? { ablatedNodeIds: [], ablatedEdgeIds: [] } : {}),
  })),
  toggleAblatedNode: (nodeId) =>
    set((s) => {
      const removing = s.ablatedNodeIds.includes(nodeId);
      if (removing) {
        // Remove node and its connected edges from ablation
        const connectedEdgeIds = s.graphData.edges
          .filter((e) => e.source === nodeId || e.target === nodeId)
          .map((e) => e.id);
        return {
          ablatedNodeIds: s.ablatedNodeIds.filter((id) => id !== nodeId),
          ablatedEdgeIds: s.ablatedEdgeIds.filter((id) => !connectedEdgeIds.includes(id)),
        };
      } else {
        // Add node and auto-ablate connected edges
        const connectedEdgeIds = s.graphData.edges
          .filter((e) => e.source === nodeId || e.target === nodeId)
          .map((e) => e.id);
        return {
          ablatedNodeIds: [...s.ablatedNodeIds, nodeId],
          ablatedEdgeIds: [...new Set([...s.ablatedEdgeIds, ...connectedEdgeIds])],
        };
      }
    }),
  toggleAblatedEdge: (edgeId) =>
    set((s) => {
      if (s.ablatedEdgeIds.includes(edgeId)) {
        return { ablatedEdgeIds: s.ablatedEdgeIds.filter((id) => id !== edgeId) };
      }
      return { ablatedEdgeIds: [...s.ablatedEdgeIds, edgeId] };
    }),
  resetAblation: () =>
    set({ ablatedNodeIds: [], ablatedEdgeIds: [], ablationMode: false }),
  startAblationReplay: () =>
    set((s) => {
      // Build ablated graph by removing ablated nodes and edges
      const ablatedGraph = {
        ...s.graphData,
        nodes: s.graphData.nodes.filter((n) => !s.ablatedNodeIds.includes(n.id)),
        edges: s.graphData.edges.filter((e) => !s.ablatedEdgeIds.includes(e.id)),
        metadata: {
          ...s.graphData.metadata,
          totalNodes: s.graphData.nodes.length - s.ablatedNodeIds.length,
          totalEdges: s.graphData.edges.length - s.ablatedEdgeIds.length,
        },
      };
      const epochs = simulateCascade(ablatedGraph, s.shocks, s.severedEdges);
      return {
        interventionEpochs: epochs,
        activeTimeline: "intervention" as TimelineId,
        replayActive: true,
        replayPlaying: true,
        currentEpoch: 0,
        replayBranchEpoch: null,
      };
    }),

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

  // LLM config
  llmProvider: "gemini" as LLMProvider,
  claudeApiKey: "",
  geminiApiKey: "",
  claudeModel: "claude-sonnet-4-20250514",
  geminiModel: "gemini-2.0-flash",
  isLlmStreaming: false,
  setLlmProvider: (provider) => set({ llmProvider: provider }),
  setClaudeApiKey: (key) => set({ claudeApiKey: key }),
  setGeminiApiKey: (key) => set({ geminiApiKey: key }),
  setClaudeModel: (model) => set({ claudeModel: model }),
  setGeminiModel: (model) => set({ geminiModel: model }),
  setIsLlmStreaming: (streaming) => set({ isLlmStreaming: streaming }),

  // Sandbox
  sandboxOrgName: null,
  setSandboxOrgName: (name) => set({ sandboxOrgName: name }),
  sandboxGraphs: [],
  activeSandboxGraphId: null,
  addSandboxGraph: (name, graph) =>
    set((s) => {
      const id = `graph-${Date.now()}`;
      return {
        sandboxGraphs: [...s.sandboxGraphs, { id, name, graph }],
        activeSandboxGraphId: id,
        graphData: graph,
        initialGraph: graph,
      };
    }),
  switchSandboxGraph: (id) =>
    set((s) => {
      const target = s.sandboxGraphs.find((g) => g.id === id);
      if (!target) return s;
      // Save current graph back to its slot before switching
      const updatedGraphs = s.sandboxGraphs.map((g) =>
        g.id === s.activeSandboxGraphId
          ? { ...g, graph: s.graphData }
          : g
      );
      return {
        sandboxGraphs: updatedGraphs,
        activeSandboxGraphId: id,
        graphData: target.graph,
        initialGraph: target.graph,
      };
    }),
  deleteSandboxGraph: (id) =>
    set((s) => {
      const remaining = s.sandboxGraphs.filter((g) => g.id !== id);
      const wasActive = s.activeSandboxGraphId === id;
      if (wasActive) {
        const next = remaining[0];
        return {
          sandboxGraphs: remaining,
          activeSandboxGraphId: next?.id ?? null,
          graphData: next?.graph ?? EMPTY_GRAPH,
          initialGraph: next?.graph ?? EMPTY_GRAPH,
        };
      }
      return { sandboxGraphs: remaining };
    }),
  renameSandboxGraph: (id, name) =>
    set((s) => ({
      sandboxGraphs: s.sandboxGraphs.map((g) =>
        g.id === id ? { ...g, name } : g
      ),
    })),

  // Import
  importModalOpen: false,
  setImportModalOpen: (open) => set({ importModalOpen: open }),
  mergeGraphData: (nodes, edges, datasetColor) =>
    set((s) => {
      const coloredNodes = datasetColor
        ? nodes.map((n) => ({ ...n, datasetColor }))
        : nodes;
      const { graph } = mergeGraphs(s.graphData, { nodes: coloredNodes, edges });
      return { graphData: graph, initialGraph: graph };
    }),

  // Imported dataset tracking
  importedDatasets: [],
  addImportedDataset: (dataset) =>
    set((s) => ({ importedDatasets: [...s.importedDatasets, dataset] })),
  removeImportedDataset: (id) =>
    set((s) => {
      const dataset = s.importedDatasets.find((d) => d.id === id);
      if (!dataset) return s;

      const remainingDatasets = s.importedDatasets.filter((d) => d.id !== id);

      // Collect node IDs explicitly tracked by this dataset
      const nodeIdsToRemove = new Set(dataset.nodeIds);

      // Also remove any nodes with this dataset's color that aren't
      // claimed by another remaining dataset (catches stub nodes,
      // inferred nodes, or any untracked orphans)
      const claimedByOthers = new Set<string>();
      for (const other of remainingDatasets) {
        for (const nid of other.nodeIds) claimedByOthers.add(nid);
      }
      for (const node of s.graphData.nodes) {
        if (node.datasetColor === dataset.color && !claimedByOthers.has(node.id)) {
          nodeIdsToRemove.add(node.id);
        }
      }

      const edgeIdsToRemove = new Set(dataset.edgeIds);

      const remainingNodes = s.graphData.nodes.filter((n) => !nodeIdsToRemove.has(n.id));
      const remainingNodeIds = new Set(remainingNodes.map((n) => n.id));
      // Remove tracked edges + any edges referencing removed nodes
      const remainingEdges = s.graphData.edges.filter(
        (e) =>
          !edgeIdsToRemove.has(e.id) &&
          remainingNodeIds.has(e.source) &&
          remainingNodeIds.has(e.target)
      );
      const graph: CausalGraph = {
        nodes: remainingNodes,
        edges: remainingEdges,
        metadata: {
          ...s.graphData.metadata,
          totalNodes: remainingNodes.length,
          totalEdges: remainingEdges.length,
          density:
            remainingNodes.length > 1
              ? remainingEdges.length / (remainingNodes.length * (remainingNodes.length - 1))
              : 0,
        },
      };
      return {
        importedDatasets: remainingDatasets,
        graphData: graph,
        initialGraph: graph,
      };
    }),

  // Replay / Cascade
  replayActive: false,
  replayPlaying: false,
  replaySpeed: 1,
  currentEpoch: 0,
  baselineEpochs: [],
  interventionEpochs: [],
  activeTimeline: "baseline",
  replayBranchEpoch: null,

  startReplay: () =>
    set((s) => {
      const epochs = simulateCascade(s.graphData, s.shocks, s.severedEdges);
      return {
        baselineEpochs: epochs,
        interventionEpochs: [],
        replayActive: true,
        replayPlaying: true,
        currentEpoch: 0,
        activeTimeline: "baseline",
        replayBranchEpoch: null,
      };
    }),

  stopReplay: () =>
    set({
      replayActive: false,
      replayPlaying: false,
      currentEpoch: 0,
      baselineEpochs: [],
      interventionEpochs: [],
      activeTimeline: "baseline",
      replayBranchEpoch: null,
      replaySpeed: 1,
    }),

  setReplayPlaying: (playing) => set({ replayPlaying: playing }),
  setReplaySpeed: (speed) => set({ replaySpeed: speed }),
  setCurrentEpoch: (epoch) => set({ currentEpoch: epoch }),

  stepEpoch: (delta) =>
    set((s) => {
      const epochs =
        s.activeTimeline === "baseline"
          ? s.baselineEpochs
          : s.interventionEpochs;
      const maxEpoch = Math.max(0, epochs.length - 1);
      const next = Math.max(0, Math.min(maxEpoch, s.currentEpoch + delta));
      return { currentEpoch: next, replayPlaying: false };
    }),

  setActiveTimeline: (id) => set({ activeTimeline: id, currentEpoch: 0 }),

  branchFromCurrentEpoch: () =>
    set((s) => {
      if (!s.replayActive || s.baselineEpochs.length === 0) return s;
      const branchSnapshot = s.baselineEpochs[s.currentEpoch];
      if (!branchSnapshot) return s;
      const epochs = simulateCascade(
        s.graphData,
        s.shocks,
        s.severedEdges,
        undefined,
        undefined,
        branchSnapshot.nodeStates
      );
      return {
        interventionEpochs: epochs,
        activeTimeline: "intervention" as TimelineId,
        replayBranchEpoch: s.currentEpoch,
        currentEpoch: 0,
        replayPlaying: true,
      };
    }),
}));
