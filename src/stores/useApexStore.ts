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
  upsertLiveSignal,
} from "@/lib/types";
import type { FeedDispatchBatch } from "@/lib/feeds/providers/types";
import type { InterdictionResult } from "@/lib/interdiction-engine";
import type { TrialPrior } from "@/lib/trial-prior";
import type { SystemStateSnapshot } from "@/lib/snapshots/types";
import { validateSnapshot } from "@/lib/snapshots/tarski-validator";
import {
  runTarskiValidation,
  applyTarskiFlags,
  clearTarskiFlags,
  type TarskiValidationReport,
} from "@/lib/tarski-data";

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
import { EMPTY_GRAPH } from "@/lib/graph-data";
import { simulateCascade } from "@/lib/cascade-simulator";
import type { LLMProvider } from "@/lib/llm-providers";
import type { TimeGranularity, TemporalDataset, TemporalEvent } from "@/lib/temporal-data";
import { generateTemporalData } from "@/lib/temporal-data";

/** Cap on how many feed-emitted events we retain in temporalData.events.
 *  Events are de-duped by id, so monthly/weekly upstream cadences mean this
 *  cap is rarely hit in practice. */
const FEED_EVENT_CAP = 200;

/** Append a TemporalEvent to the existing temporalData. Returns null if no
 *  graph (and thus no temporal store) is loaded yet, so callers can spread
 *  the result conditionally without overwriting state with null. */
function appendFeedEvent(
  current: TemporalDataset | null,
  event: TemporalEvent,
): TemporalDataset | null {
  if (!current) return null;
  // De-dupe by id so retries / cache hits don't spam the timeline.
  if (current.events.some((e) => e.id === event.id)) return null;
  const events = [...current.events, event];
  // Retain only the most recent FEED_EVENT_CAP non-template events.
  // Static template events are kept as-is; live ones get a unique id prefix.
  const trimmed = events.length > FEED_EVENT_CAP * 2
    ? events.slice(-FEED_EVENT_CAP * 2)
    : events;
  // Range may need to extend if a live event lands outside the existing
  // window (e.g. a fresh "now" event after only historical events).
  const eventMs = event.date.getTime();
  const rangeEnd = eventMs > current.rangeEnd.getTime() ? event.date : current.rangeEnd;
  const rangeStart = eventMs < current.rangeStart.getTime() ? event.date : current.rangeStart;
  return { ...current, events: trimmed, rangeStart, rangeEnd };
}
import { loadRealTemporalData } from "@/lib/real-timeseries";

// Drop pinned time-series ids that no longer exist in the graph. Returns the
// same array when nothing changes so Zustand subscribers don't re-render.
function prunePinsToGraph(graph: CausalGraph, pins: string[]): string[] {
  if (pins.length === 0) return pins;
  const validIds = new Set(graph.nodes.map((n) => n.id));
  const filtered = pins.filter((id) => validIds.has(id));
  return filtered.length === pins.length ? pins : filtered;
}

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
  tarskiReport: TarskiValidationReport | null;
  enabledAxioms: Set<string>;
  setEnabledAxioms: (axioms: Set<string>) => void;
  runTarskiWithAxioms: () => void;
  /**
   * Apply a generic feed-provider dispatch batch:
   *  - Upserts the new `liveData` point on each `nodeId` in `updates`.
   *  - Drops any existing signals of `signalKinds` from nodes NOT in `updates`
   *    (so e.g. an OFAC tick that no longer matches Iran lifts the stale flag).
   *  - Appends a `TemporalEvent` if `event` is provided (deduped by id).
   *  - Re-runs Tarski validation when `truthFilter === "verified"`.
   */
  applyFeedBatch: (batch: FeedDispatchBatch) => void;

  // Selected node (focus)
  selectedNode: string | null;
  setSelectedNode: (nodeId: string | null) => void;

  // Selected edge (for edge inspector popup)
  selectedEdgeId: string | null;
  setSelectedEdgeId: (edgeId: string | null) => void;

  // Multi-selection (lasso/area select)
  selectedNodes: string[];
  setSelectedNodes: (nodeIds: string[]) => void;

  // Isolate selection — hide non-selected nodes
  isolateSelection: boolean;
  setIsolateSelection: (on: boolean) => void;

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

  // Interdiction (chat-based)
  lastInterdictionResult: InterdictionResult | null;
  setLastInterdictionResult: (result: InterdictionResult | null) => void;

  // Trial-grounded prior (published by domain-specific analysis panels,
  // e.g. VX880TrialPanel → MonteCarloForecast). Lets a fitted survival
  // model act as a shared prior across the Pearl stack without coupling
  // the MC engine to any specific dataset.
  trialPrior: TrialPrior | null;
  setTrialPrior: (prior: TrialPrior | null) => void;

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
  ollamaUrl: string;
  ollamaModel: string;
  isLlmStreaming: boolean;
  setLlmProvider: (provider: LLMProvider) => void;
  setClaudeApiKey: (key: string) => void;
  setGeminiApiKey: (key: string) => void;
  setClaudeModel: (model: string) => void;
  setGeminiModel: (model: string) => void;
  setOllamaUrl: (url: string) => void;
  setOllamaModel: (model: string) => void;
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

  // Domain selector
  selectedDomains: string[];
  isMultiDomainMode: boolean;
  domainSelectorOpen: boolean;
  setSelectedDomains: (domains: string[]) => void;
  setIsMultiDomainMode: (multi: boolean) => void;
  setDomainSelectorOpen: (open: boolean) => void;

  // Persona
  activePersona:
    | "scientist"
    | "financial"
    | "macro"
    | "geopolitical"
    | "cross"
    | "analyst"; // "analyst" retained only to tolerate legacy persisted values
  setActivePersona: (
    persona:
      | "scientist"
      | "financial"
      | "macro"
      | "geopolitical"
      | "cross"
      | "analyst",
  ) => void;

  // Data source selection (which datasets to load)
  selectedDataSources: string[];
  setSelectedDataSources: (sources: string[]) => void;

  // Data layer filters (what to show in the 3D universe)
  visibleCategories: Set<string>; // node categories to show (empty = all)
  visibleDiscoverySources: Set<string>; // discovery sources to show (empty = all)
  setVisibleCategories: (categories: Set<string>) => void;
  setVisibleDiscoverySources: (sources: Set<string>) => void;

  // Import modal
  importModalOpen: boolean;
  setImportModalOpen: (open: boolean) => void;
  mergeGraphData: (nodes: CausalNode[], edges: CausalEdge[], datasetColor?: string) => void;

  // Imported dataset tracking
  importedDatasets: ImportedDataset[];
  addImportedDataset: (dataset: ImportedDataset) => void;
  removeImportedDataset: (id: string) => void;

  // Tour
  tourActive: boolean;
  tourStep: number;
  setTourActive: (active: boolean) => void;
  setTourStep: (step: number) => void;

  // Snapshots
  currentSnapshot: SystemStateSnapshot | null;
  snapshotHistory: SystemStateSnapshot[];
  isComputeLoading: boolean;
  setSnapshot: (snapshot: SystemStateSnapshot) => void;
  setIsComputeLoading: (loading: boolean) => void;

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

  // Timeline / Time Dial
  timelinePosition: number; // ms timestamp of currently selected point
  timelineRange: { start: number; end: number }; // viewable range as ms timestamps
  isLive: boolean; // whether following real-time
  timelineGranularity: TimeGranularity;
  temporalData: TemporalDataset | null;
  timelineSelection: { start: number; end: number } | null; // user-selected date range window
  timelineFullRange: { start: number; end: number } | null; // saved full range before zoom
  // True while the user is actively dragging the dial scrubber. Lets the
  // TimeSeriesOverlay show its hover tooltip pinned to the dial position
  // even though the cursor is on the dial track, not the chart.
  timelineDragging: boolean;
  setTimelineDragging: (dragging: boolean) => void;
  setTimelinePosition: (ts: number) => void;
  // rAF-batched variant — coalesces rapid scrub calls to ≤ display refresh rate
  // (~60fps), preventing posMap/omegaKey recalculation on every pointer-move pixel.
  // TimeDial (or any scrub handler) should prefer this over setTimelinePosition
  // for continuous drag events (item #5).
  setTimelinePositionThrottled: (ts: number) => void;
  setTimelineRange: (range: { start: number; end: number }) => void;
  setIsLive: (live: boolean) => void;
  setTimelineGranularity: (g: TimeGranularity) => void;
  setTimelineSelection: (sel: { start: number; end: number } | null) => void;
  zoomToSelection: () => void;
  zoomOut: () => void;
  initTemporalData: () => void;
  goLive: () => void;

  // Pinned time series overlay
  pinnedTimeSeriesNodes: string[];
  togglePinnedTimeSeries: (nodeId: string) => void;
  clearPinnedTimeSeries: () => void;
}

export const useApexStore = create<ApexState>((set, get) => ({
  // Module
  activeModule: "spirtes",
  setActiveModule: (id) => set({ activeModule: id }),

  // Graph — start empty; populated when user selects domains in DomainSelector
  graphData: EMPTY_GRAPH,
  initialGraph: EMPTY_GRAPH,
  setGraphData: (g) => {
    // Whenever the graph node id set changes we must re-resolve temporalData
    // and drop pinned-series ids that no longer exist; otherwise the
    // TimeSeriesOverlay shows stale "NO DATA" badges for ghost pins.
    set((s) => ({
      graphData: g,
      initialGraph: g,
      temporalData: null,
      pinnedTimeSeriesNodes: prunePinsToGraph(g, s.pinnedTimeSeriesNodes),
    }));
    get().initTemporalData();
  },

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
  tarskiReport: null,
  enabledAxioms: new Set<string>(),
  setEnabledAxioms: (axioms) => set({ enabledAxioms: axioms }),
  runTarskiWithAxioms: () =>
    set((s) => {
      // Clear previous flags first
      const cleanGraph = clearTarskiFlags(s.graphData);
      const report = runTarskiValidation(cleanGraph, s.enabledAxioms.size > 0 ? s.enabledAxioms : undefined);
      const flaggedGraph = applyTarskiFlags(cleanGraph, report);
      return { truthFilter: "verified" as TruthFilter, graphData: flaggedGraph, tarskiReport: report };
    }),
  applyFeedBatch: (batch) =>
    set((s) => {
      const { signalKinds, updates, event, providerId } = batch;
      // Stamp the providerId onto each emitted point so cleanup later
      // knows who wrote each signal (prevents cross-provider clobber when
      // multiple providers share a `kind`, e.g. "indicator").
      const updateMap = new Map(
        updates.map((u) => [u.nodeId, { ...u.point, providerId }] as const),
      );
      const kindSet = new Set(signalKinds);
      let touched = false;

      const nextNodes = s.graphData.nodes.map((n) => {
        const incoming = updateMap.get(n.id);
        if (incoming) {
          const existing = n.liveData?.find((p) => p.kind === incoming.kind);
          if (
            existing &&
            existing.observedAt === incoming.observedAt &&
            existing.value === incoming.value &&
            existing.source === incoming.source
          ) {
            return n; // identical reading — preserve reference for memo stability
          }
          touched = true;
          return { ...n, liveData: upsertLiveSignal(n.liveData, incoming) };
        }
        // No incoming update for this node — drop ONLY signals THIS provider
        // owns whose kind is in `signalKinds`. Signals written by other
        // providers (e.g. a different provider's "indicator") survive
        // untouched. This is the cross-provider cleanup safety net.
        if (
          n.liveData?.some(
            (p) => kindSet.has(p.kind) && p.providerId === providerId,
          )
        ) {
          touched = true;
          return {
            ...n,
            liveData: n.liveData.filter(
              (p) => !(kindSet.has(p.kind) && p.providerId === providerId),
            ),
          };
        }
        return n;
      });

      if (!touched) return s;
      const nextGraph = { ...s.graphData, nodes: nextNodes };

      const nextTemporal = event
        ? appendFeedEvent(s.temporalData, {
            id: event.id,
            date: new Date(event.observedAt),
            label: event.label,
            description: event.description,
            affectedNodeIds: event.affectedNodeIds,
            severity: event.severity,
          })
        : null;

      const base: Partial<ApexState> = nextTemporal ? { temporalData: nextTemporal } : {};
      if (s.truthFilter === "verified") {
        const cleanGraph = clearTarskiFlags(nextGraph);
        const report = runTarskiValidation(
          cleanGraph,
          s.enabledAxioms.size > 0 ? s.enabledAxioms : undefined,
        );
        const flaggedGraph = applyTarskiFlags(cleanGraph, report);
        return { ...base, graphData: flaggedGraph, tarskiReport: report };
      }
      return { ...base, graphData: nextGraph };
    }),
  setTruthFilter: (f) =>
    set((s) => {
      if (f === "verified") {
        // Dynamically run Tarski validation against the live graph
        const report = runTarskiValidation(s.graphData, s.enabledAxioms.size > 0 ? s.enabledAxioms : undefined);
        const flaggedGraph = applyTarskiFlags(s.graphData, report);
        return { truthFilter: f, graphData: flaggedGraph, tarskiReport: report };
      } else {
        // Clear all flags when switching back to RAW
        const cleanGraph = clearTarskiFlags(s.graphData);
        return { truthFilter: f, graphData: cleanGraph, tarskiReport: null };
      }
    }),

  // Selected node
  selectedNode: null,
  setSelectedNode: (nodeId) => set({ selectedNode: nodeId }),

  // Selected edge
  selectedEdgeId: null,
  setSelectedEdgeId: (edgeId) => set({ selectedEdgeId: edgeId }),

  // Multi-selection
  selectedNodes: [],
  setSelectedNodes: (nodeIds) => set({ selectedNodes: nodeIds }),

  // Isolate selection
  isolateSelection: false,
  setIsolateSelection: (on) => set({ isolateSelection: on }),

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
  // Interdiction (chat-based)
  lastInterdictionResult: null,
  setLastInterdictionResult: (result) => set({ lastInterdictionResult: result }),

  trialPrior: null,
  setTrialPrior: (prior) => set({ trialPrior: prior }),

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
  geminiModel: "gemini-2.5-flash",
  ollamaUrl: "http://localhost:11434",
  ollamaModel: "deepseek-r1:8b",
  isLlmStreaming: false,
  setLlmProvider: (provider) => set({ llmProvider: provider }),
  setClaudeApiKey: (key) => set({ claudeApiKey: key }),
  setGeminiApiKey: (key) => set({ geminiApiKey: key }),
  setClaudeModel: (model) => set({ claudeModel: model }),
  setGeminiModel: (model) => set({ geminiModel: model }),
  setOllamaUrl: (url) => set({ ollamaUrl: url }),
  setOllamaModel: (model) => set({ ollamaModel: model }),
  setIsLlmStreaming: (streaming) => set({ isLlmStreaming: streaming }),

  // Sandbox
  sandboxOrgName: null,
  setSandboxOrgName: (name) => set({ sandboxOrgName: name }),
  sandboxGraphs: [],
  activeSandboxGraphId: null,
  addSandboxGraph: (name, graph) => {
    set((s) => {
      const id = `graph-${Date.now()}`;
      return {
        sandboxGraphs: [...s.sandboxGraphs, { id, name, graph }],
        activeSandboxGraphId: id,
        graphData: graph,
        initialGraph: graph,
        temporalData: null,
        pinnedTimeSeriesNodes: prunePinsToGraph(graph, s.pinnedTimeSeriesNodes),
      };
    });
    get().initTemporalData();
  },
  switchSandboxGraph: (id) => {
    let didSwitch = false;
    set((s) => {
      const target = s.sandboxGraphs.find((g) => g.id === id);
      if (!target) return s;
      didSwitch = true;
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
        temporalData: null,
        pinnedTimeSeriesNodes: prunePinsToGraph(target.graph, s.pinnedTimeSeriesNodes),
      };
    });
    if (didSwitch) get().initTemporalData();
  },
  deleteSandboxGraph: (id) => {
    const wasActive = get().activeSandboxGraphId === id;
    set((s) => {
      const remaining = s.sandboxGraphs.filter((g) => g.id !== id);
      if (wasActive) {
        const next = remaining[0];
        const nextGraph = next?.graph ?? EMPTY_GRAPH;
        return {
          sandboxGraphs: remaining,
          activeSandboxGraphId: next?.id ?? null,
          graphData: nextGraph,
          initialGraph: nextGraph,
          temporalData: null,
          pinnedTimeSeriesNodes: prunePinsToGraph(nextGraph, s.pinnedTimeSeriesNodes),
        };
      }
      return { sandboxGraphs: remaining };
    });
    if (wasActive) get().initTemporalData();
  },
  renameSandboxGraph: (id, name) =>
    set((s) => ({
      sandboxGraphs: s.sandboxGraphs.map((g) =>
        g.id === id ? { ...g, name } : g
      ),
    })),

  // Domain selector
  selectedDomains: [],
  isMultiDomainMode: false,
  domainSelectorOpen: true,
  setSelectedDomains: (domains) => set({ selectedDomains: domains }),
  setIsMultiDomainMode: (multi) => set({ isMultiDomainMode: multi }),
  setDomainSelectorOpen: (open) => set({ domainSelectorOpen: open }),

  // Persona (default: financial — more specific than the prior "analyst")
  activePersona: "financial",
  setActivePersona: (persona) => set({ activePersona: persona }),

  // Data sources
  selectedDataSources: ["middle-east-playbooks"],
  setSelectedDataSources: (sources) => set({ selectedDataSources: sources }),

  // Data layer filters
  visibleCategories: new Set<string>(),
  visibleDiscoverySources: new Set<string>(),
  setVisibleCategories: (categories) => set({ visibleCategories: categories }),
  setVisibleDiscoverySources: (sources) => set({ visibleDiscoverySources: sources }),

  // Import
  importModalOpen: false,
  setImportModalOpen: (open) => set({ importModalOpen: open }),
  mergeGraphData: (nodes, edges, datasetColor) => {
    set((s) => {
      const coloredNodes = datasetColor
        ? nodes.map((n) => ({ ...n, datasetColor }))
        : nodes;
      const { graph } = mergeGraphs(s.graphData, { nodes: coloredNodes, edges });
      return {
        graphData: graph,
        initialGraph: graph,
        temporalData: null,
        pinnedTimeSeriesNodes: prunePinsToGraph(graph, s.pinnedTimeSeriesNodes),
      };
    });
    get().initTemporalData();
  },

  // Imported dataset tracking
  importedDatasets: [],
  addImportedDataset: (dataset) =>
    set((s) => ({ importedDatasets: [...s.importedDatasets, dataset] })),
  removeImportedDataset: (id) => {
    let graphChanged = false;
    set((s) => {
      const dataset = s.importedDatasets.find((d) => d.id === id);
      if (!dataset) return s;
      graphChanged = true;

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
        temporalData: null,
        pinnedTimeSeriesNodes: prunePinsToGraph(graph, s.pinnedTimeSeriesNodes),
      };
    });
    if (graphChanged) get().initTemporalData();
  },

  // Tour
  tourActive: false,
  tourStep: 0,
  setTourActive: (active) => set({ tourActive: active, tourStep: 0 }),
  setTourStep: (step) => set({ tourStep: step }),

  // Snapshots
  currentSnapshot: null,
  snapshotHistory: [],
  isComputeLoading: false,
  setSnapshot: (snapshot) =>
    set((s) => {
      const validated = validateSnapshot(snapshot);
      const snapshotWithValidation = {
        ...snapshot,
        tarskiValidation: validated,
      };
      if (validated.status === "VIOLATIONS_FOUND") {
        // Log but still store — violations are informational in v2
        console.warn(
          "[Tarski] Snapshot has violations:",
          validated.violations
        );
      }
      const history = [...s.snapshotHistory, snapshotWithValidation];
      return {
        currentSnapshot: snapshotWithValidation,
        snapshotHistory: history.slice(-50), // cap at 50
      };
    }),
  setIsComputeLoading: (loading) => set({ isComputeLoading: loading }),

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
  setCurrentEpoch: (epoch) =>
    set((s) => {
      const epochs =
        s.activeTimeline === "baseline"
          ? s.baselineEpochs
          : s.interventionEpochs;
      const maxEpoch = Math.max(0, epochs.length - 1);
      return { currentEpoch: Math.max(0, Math.min(maxEpoch, epoch)) };
    }),

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

  // Timeline / Time Dial
  timelinePosition: Date.now(),
  timelineRange: {
    start: Date.now() - 60 * 24 * 60 * 60 * 1000, // 60 days ago
    end: Date.now(),
  },
  isLive: true,
  timelineGranularity: "day",
  timelineSelection: null,
  timelineFullRange: null,
  temporalData: null,
  timelineDragging: false,

  setTimelineDragging: (dragging) => set({ timelineDragging: dragging }),

  setTimelinePosition: (ts) =>
    set({ timelinePosition: ts, isLive: false }),

  // rAF-batched scrub: coalesces rapid pointer-move events into at most one
  // store write per animation frame (~60fps).  Eliminates O(N) omegaKey/posMap
  // recalculation on every scrub pixel.  Use this for continuous drag; the
  // semantics of setTimelinePosition are unchanged (item #5).
  setTimelinePositionThrottled: (() => {
    let rafHandle: number | null = null;
    let pending: number | null = null;
    return (ts: number) => {
      pending = ts;
      if (rafHandle !== null) return; // already scheduled
      rafHandle = requestAnimationFrame(() => {
        rafHandle = null;
        if (pending !== null) {
          set({ timelinePosition: pending, isLive: false });
          pending = null;
        }
      });
    };
  })(),

  setTimelineRange: (range) =>
    set({ timelineRange: range }),

  setIsLive: (live) =>
    set((s) => ({
      isLive: live,
      ...(live ? { timelinePosition: s.timelineRange.end } : {}),
    })),

  setTimelineGranularity: (g) =>
    set((s) => {
      // Granularity buttons (1H/1D/1W/1M) double as scale selectors: they
      // also constrain timelineRange to a window of the corresponding size,
      // anchored at the end of the existing range. Card sparklines and the
      // comparison overlay filter their history by timelineRange, so the
      // visible curve length follows the chosen scale.
      //
      // CAPTURE FULL RANGE ON FIRST CALL: without this, the floor
      // (max(_, end - windowMs)) would clamp to the *current* timelineRange
      // start — which after the first granularity click is already shrunk.
      // Result: subsequent clicks could shrink further but never expand back.
      // By saving timelineFullRange on first entry, we always have the
      // original extent to expand into.
      const windowMs: Record<TimeGranularity, number> = {
        hour: 60 * 60 * 1000,
        day: 24 * 60 * 60 * 1000,
        week: 7 * 24 * 60 * 60 * 1000,
        month: 30 * 24 * 60 * 60 * 1000,
      };
      const end = s.timelineRange.end;
      const fullRange = s.timelineFullRange ?? { ...s.timelineRange };
      const newStart = Math.max(fullRange.start, end - windowMs[g]);
      return {
        timelineGranularity: g,
        timelineRange: { start: newStart, end },
        timelineFullRange: fullRange,
      };
    }),

  setTimelineSelection: (sel) =>
    set({ timelineSelection: sel }),

  zoomToSelection: () => {
    const s = get();
    if (!s.timelineSelection) return;
    // Save current range so we can zoom back out
    set({
      timelineFullRange: s.timelineFullRange ?? { ...s.timelineRange },
      timelineRange: { start: s.timelineSelection.start, end: s.timelineSelection.end },
      timelineSelection: null,
      isLive: false,
    });
  },

  zoomOut: () => {
    const s = get();
    if (!s.timelineFullRange) return;
    set({
      timelineRange: { ...s.timelineFullRange },
      timelineFullRange: null,
      timelineSelection: null,
    });
  },

  initTemporalData: () => {
    const state = get();
    if (state.temporalData) return;
    // Set synthetic data immediately as fallback while real data loads
    const syntheticData = generateTemporalData(state.graphData.nodes, state.graphData.edges, 60);
    set({
      temporalData: syntheticData,
      timelineRange: {
        start: syntheticData.rangeStart.getTime(),
        end: syntheticData.rangeEnd.getTime(),
      },
      timelinePosition: syntheticData.rangeEnd.getTime(),
    });
    // Load real analyst-collected data asynchronously, then replace synthetic.
    // Retry until graphData is populated (it may be empty on first mount).
    const doLoad = () => {
      const current = get();
      const { nodes, edges } = current.graphData;
      if (nodes.length === 0) {
        setTimeout(doLoad, 500);
        return;
      }
      loadRealTemporalData(nodes, edges)
        .then((realData) => {
          if (realData.nodes.size > 0) {
            set({
              temporalData: realData,
              timelineRange: {
                start: realData.rangeStart.getTime(),
                end: realData.rangeEnd.getTime(),
              },
              timelinePosition: realData.rangeEnd.getTime(),
            });
          }
        })
        .catch((err) => {
          console.warn("[APEX] Failed to load real temporal data, using synthetic fallback:", err);
        });
    };
    setTimeout(doLoad, 100);
  },

  goLive: () =>
    set((s) => ({
      isLive: true,
      timelinePosition: s.timelineRange.end,
    })),

  // Pinned time series overlay
  pinnedTimeSeriesNodes: [],
  togglePinnedTimeSeries: (nodeId) =>
    set((s) => ({
      pinnedTimeSeriesNodes: s.pinnedTimeSeriesNodes.includes(nodeId)
        ? s.pinnedTimeSeriesNodes.filter((id) => id !== nodeId)
        : [...s.pinnedTimeSeriesNodes, nodeId],
    })),
  clearPinnedTimeSeries: () => set({ pinnedTimeSeriesNodes: [] }),
}));
