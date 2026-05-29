"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useApexStore } from "@/stores/useApexStore";
import { getEngineProvider } from "@/lib/engines";
import { detectCommunities } from "@/lib/community-detection";
import { summarizeDiscoveryUncertainty } from "@/lib/discovery-uncertainty";
import dynamic from "next/dynamic";
import TrinityPanel from "./TrinityPanel";
import DiscoveryRunsPanel from "./DiscoveryRunsPanel";
import CalculationsPanel from "./CalculationsPanel";

// Tab-gated sub-panels lazy-loaded so the default Spirtes tab doesn't
// pull their JS on first paint. The first wave (added PR #300) covered
// the four that lived in their own files. This file's own inline
// panels (TarskiPanel + ParetoPanel + CopilotInterdictionResults +
// SnapshotIndicator + their helpers — ~2500 LOC combined) have since
// been extracted to `./modules/*` and are dynamically imported here too.
//
// ScenarioInput + AblationPanel are small (<5KB each) and load inline.
// Each has a small loading hint that matches the panel padding so the
// layout doesn't jump when the chunk lands.
const PANEL_LOADER = (
  <div className="p-4 text-[8px] font-mono text-text-muted/60 animate-pulse">
    LOADING…
  </div>
);
const TissueCohortView = dynamic(
  () => import("./scientist/TissueCohortView"),
  { ssr: false, loading: () => PANEL_LOADER },
);
// NewsInterpreterPanel (~350 LOC) only renders on the Pareto tab, which
// isn't the default. Defer the chunk until the tab is opened.
const NewsInterpreterPanel = dynamic(
  () => import("./NewsInterpreterPanel"),
  { ssr: false, loading: () => PANEL_LOADER },
);
// NodeInspector (~630 LOC, pulls chi-star + framer-motion) renders null
// inside its AnimatePresence wrapper when no node is selected. Initial
// paint never has a selection — gate the entire dynamic import on
// `selectedNode != null` so the chunk only loads after the first click.
const NodeInspector = dynamic(
  () => import("./NodeInspector"),
  { ssr: false },
);
const MonteCarloForecast = dynamic(
  () => import("./MonteCarloForecast"),
  { ssr: false, loading: () => PANEL_LOADER },
);
const InterdictionPanel = dynamic(
  () => import("./InterdictionPanel"),
  { ssr: false, loading: () => PANEL_LOADER },
);
const VX880TrialPanel = dynamic(
  () => import("./VX880TrialPanel"),
  { ssr: false, loading: () => PANEL_LOADER },
);
const ScenarioInput = dynamic(() => import("./ScenarioInput"), {
  ssr: false,
});
const AblationPanel = dynamic(() => import("./AblationPanel"), {
  ssr: false,
});
// Newly extracted from this file — see `./modules/*` for the moved
// definitions. Pearl + Tarski + Pareto tabs each get their own chunk.
const TarskiPanel = dynamic(
  () => import("./modules/TarskiPanel"),
  { ssr: false, loading: () => PANEL_LOADER },
);
const ParetoPanel = dynamic(
  () => import("./modules/ParetoPanel"),
  { ssr: false, loading: () => PANEL_LOADER },
);
const CopilotInterdictionResults = dynamic(
  () => import("./modules/CopilotInterdictionResults"),
  { ssr: false, loading: () => PANEL_LOADER },
);
// SnapshotIndicator lives in the same ParetoPanel module so it shares
// the chunk — the `.then(m => ...)` form points the dynamic-import
// loader at the named export.
const SnapshotIndicator = dynamic(
  () => import("./modules/ParetoPanel").then((m) => ({ default: m.SnapshotIndicator })),
  { ssr: false },
);

export default function ModulePanel() {
  const activeModule = useApexStore((s) => s.activeModule);
  const setActiveModule = useApexStore((s) => s.setActiveModule);
  const setInterventionMode = useApexStore((s) => s.setInterventionMode);
  // Used only to gate the dynamic-imported NodeInspector below — the
  // component renders null without a selection, so deferring the chunk
  // costs nothing on first paint.
  const selectedNode = useApexStore((s) => s.selectedNode);
  // Scientist-mode aware: Tissue Cohort view mounts only when a T1D
  // domain is loaded, so it doesn't pollute non-life-sciences flows.
  // Direct prefix check rather than `resolveDomainProfile(...).id === "t1d"`
  // so we don't pull the 480-LOC domain-profiles data into the critical-
  // path bundle — the only thing ModulePanel needs here is "is any t1d-*
  // domain selected?" and `t1d-` is the documented prefix for those.
  const selectedDomainsForView = useApexStore((s) => s.selectedDomains);
  const isT1DDomain = useMemo(
    () => selectedDomainsForView.some((id) => id.startsWith("t1d-")),
    [selectedDomainsForView],
  );
  const [expandedChart, setExpandedChart] = useState<string | null>(null);
  const isWide = expandedChart !== null;

  // Collapse panel when switching modules
  useEffect(() => {
    setExpandedChart(null);
  }, [activeModule]);

  // Pearl module is itself the intervention workspace — keep the store flag in
  // sync so DAG highlighting and copilot context reflect the active view.
  useEffect(() => {
    setInterventionMode(activeModule === "pearl");
  }, [activeModule, setInterventionMode]);

  return (
    <aside
      className="flex flex-col border-l border-border bg-surface h-full overflow-hidden"
      data-tour="module-panel"
      style={{
        width: isWide ? 640 : 320,
        minWidth: isWide ? 640 : 320,
        transition: "width 0.35s cubic-bezier(0.4,0,0.2,1), min-width 0.35s cubic-bezier(0.4,0,0.2,1)",
      }}
    >
      {/* Module Header */}
      <div className="px-4 py-3 border-b border-border bg-surface-elevated">
        <div className="flex items-center justify-between">
          <div className="font-[family-name:var(--font-michroma)] text-[10px] tracking-[0.25em] text-text-muted uppercase">
            {activeModule} Engine
          </div>
          <button
            onClick={() => setExpandedChart(isWide ? null : activeModule)}
            className="text-[7px] font-mono text-text-muted opacity-60 hover:opacity-100 transition-opacity flex items-center gap-1"
          >
            {isWide ? "▶ collapse" : "◀ expand"}
          </button>
        </div>
        <div className="text-[9px] text-text-muted font-mono mt-0.5">
          {activeModule === "spirtes" && "Structure Discovery \u2014 DCD / NOTEARS / PCMCI+ / FCI"}
          {activeModule === "tarski" && "Constraint Verification \u2014 Domain-Aware Axiom Engine"}
          {activeModule === "pearl" && "Structural Intervention \u2014 do-Calculus & Counterfactuals"}
          {activeModule === "pareto" && "Scenario Stress Test \u2014 Shock Injection & Defense Optimization"}
        </div>
      </div>

      {/* Node Inspector (persistent across modules; lazy-loaded — only
          mounts once a node is selected since it renders null otherwise) */}
      {selectedNode && <NodeInspector />}

      {/* Module Content — pb-16 reserves space for the fixed FEEDBACK button
          so the bottom of the last panel never sits under it at full scroll. */}
      <div className="flex-1 overflow-y-auto pb-16">
        {activeModule === "spirtes" && (
          <>
            <CascadeHeader />
            <TrinityPanel />
            <DiscoveryRunsPanel />
            {isT1DDomain && <TissueCohortView />}
          </>
        )}

        {activeModule === "tarski" && (
          <div className="p-4 space-y-3">
            <TarskiPanel />
          </div>
        )}

        {activeModule === "pearl" && (
          <div className="p-4 space-y-3">
            <div className="text-[8px] font-mono text-text-muted p-2 border border-border/50 rounded bg-surface-elevated">
              Intervention surface. Describe a scenario, run the solver to
              find candidate cuts, or pick your own cuts manually. The Monte
              Carlo forecast auto-simulates the counterfactual {"\u03A9"}-buffer
              trajectory under whatever cuts are active.
            </div>
            <ScenarioInput />
            <InterdictionPanel />
            <CopilotInterdictionResults />
            <AblationPanel />
            <VX880TrialPanel />
            <MonteCarloForecast expanded={expandedChart === "pearl"} />
          </div>
        )}

        {activeModule === "pareto" && (
          <div className="p-4 space-y-3">
            <div className="text-[8px] font-mono text-text-muted p-2 border border-border/50 rounded bg-surface-elevated">
              Sensing layer. Read the criticality cards + snapshot
              diagnostics to see how the system is reading. Inject
              scenarios and run defensive cuts from{" "}
              <button
                type="button"
                onClick={() => setActiveModule("pearl")}
                className="underline decoration-dotted text-accent-amber hover:text-accent-amber/80"
              >
                PEARL {"\u2192"}
              </button>
              \u2014 whatever shocks live in the store flow back here as
              shifts in the relevance + snapshot readings.
            </div>
            <SnapshotIndicator />
            <ParetoPanel expandedChart={expandedChart} setExpandedChart={setExpandedChart} />
            <NewsInterpreterPanel />
          </div>
        )}
      </div>
    </aside>
  );
}

// CascadeHeader is the only inline panel still living in this file —
// it renders inside the default Spirtes tab so it loads on first paint
// regardless. Tab-gated panels (TarskiPanel, ParetoPanel,
// CopilotInterdictionResults, SnapshotIndicator) extracted to
// `./modules/*` and dynamically imported above so they ship as
// their own chunks.
function CascadeHeader() {
  const graphData = useApexStore((s) => s.graphData);
  const setSelectedNode = useApexStore((s) => s.setSelectedNode);
  const selectedNode = useApexStore((s) => s.selectedNode);
  const selectedNodes = useApexStore((s) => s.selectedNodes);
  // Defer the heavy `graphData` + `selectedNodes` references so the
  // Brandes'-class `netMetrics` computation below runs as low-priority
  // work after the urgent UI has painted. Otherwise launch-workspace
  // chains the metric recompute (~50-200ms on a typical graph) into
  // the same synchronous frame as the canvas mount, and the user sees
  // it as a freeze. The sliver of staleness is invisible in practice
  // (the row labels & sparkbars all read from the same memoised
  // result, so they update together).
  const deferredGraphData = useDeferredValue(graphData);
  const deferredSelectedNodes = useDeferredValue(selectedNodes);
  const engine = useMemo(() => getEngineProvider(), []);
  const cascade = useMemo(() => engine.discoverStructure(deferredGraphData), [engine, deferredGraphData]);
  const [expandedMetric, setExpandedMetric] = useState<string | null>(null);

  // Pre-build full-graph adjacency, memoized on graphData.edges identity only
  // so selection changes don't rebuild it (item #9).
  const fullNeighborSets = useMemo(() => {
    const m = new Map<string, Set<string>>();
    graphData.nodes.forEach((nd) => m.set(nd.id, new Set()));
    graphData.edges.filter((e) => !e.isSevered).forEach((e) => {
      m.get(e.source)?.add(e.target);
      m.get(e.target)?.add(e.source);
    });
    return m;
  }, [graphData.edges, graphData.nodes]);

  // Compute comprehensive network metrics
  const netMetrics = useMemo(() => {
    const allNodes = deferredGraphData.nodes;
    const allEdges = deferredGraphData.edges.filter((e) => !e.isSevered);

    // Scope to selection if any
    const selSet = new Set(deferredSelectedNodes);
    const isScoped = selSet.size > 0;
    const nodes = isScoped ? allNodes.filter((n) => selSet.has(n.id)) : allNodes;
    const edges = isScoped ? allEdges.filter((e) => selSet.has(e.source) && selSet.has(e.target)) : allEdges;

    const n = nodes.length;
    const m = edges.length;

    // 1. Graph density
    const density = n > 1 ? m / (n * (n - 1)) : 0;

    // 2. Degree distributions
    const inDeg = new Map<string, number>();
    const outDeg = new Map<string, number>();
    nodes.forEach((nd) => { inDeg.set(nd.id, 0); outDeg.set(nd.id, 0); });
    edges.forEach((e) => {
      outDeg.set(e.source, (outDeg.get(e.source) ?? 0) + 1);
      inDeg.set(e.target, (inDeg.get(e.target) ?? 0) + 1);
    });
    const avgDegree = n > 0 ? (2 * m) / n : 0;

    // 3. Eigenvector centrality (power iteration, 50 steps)
    const eigenCent = new Map<string, number>();
    nodes.forEach((nd) => eigenCent.set(nd.id, 1 / n));
    const adjOut = new Map<string, string[]>();
    const adjIn = new Map<string, string[]>();
    nodes.forEach((nd) => { adjOut.set(nd.id, []); adjIn.set(nd.id, []); });
    edges.forEach((e) => {
      adjOut.get(e.source)?.push(e.target);
      adjIn.get(e.target)?.push(e.source);
    });
    for (let iter = 0; iter < 50; iter++) {
      const next = new Map<string, number>();
      let norm = 0;
      nodes.forEach((nd) => {
        const neighbors = [...(adjOut.get(nd.id) ?? []), ...(adjIn.get(nd.id) ?? [])];
        const val = neighbors.reduce((s, nbr) => s + (eigenCent.get(nbr) ?? 0), 0);
        next.set(nd.id, val);
        norm += val * val;
      });
      norm = Math.sqrt(norm) || 1;
      nodes.forEach((nd) => eigenCent.set(nd.id, (next.get(nd.id) ?? 0) / norm));
    }
    const eigenTop = [...eigenCent.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, val]) => ({
        id,
        label: nodes.find((nd) => nd.id === id)?.shortLabel ?? id,
        fullLabel: nodes.find((nd) => nd.id === id)?.label ?? id,
        value: val,
      }));

    // 4. Betweenness centrality (BFS-based approximation)
    const between = new Map<string, number>();
    nodes.forEach((nd) => between.set(nd.id, 0));
    for (const source of nodes) {
      const dist = new Map<string, number>();
      const paths = new Map<string, number>();
      const stack: string[] = [];
      const pred = new Map<string, string[]>();
      dist.set(source.id, 0);
      paths.set(source.id, 1);
      const queue = [source.id];
      while (queue.length > 0) {
        const v = queue.shift()!;
        stack.push(v);
        const dv = dist.get(v)!;
        for (const w of adjOut.get(v) ?? []) {
          if (!dist.has(w)) {
            dist.set(w, dv + 1);
            queue.push(w);
          }
          if (dist.get(w) === dv + 1) {
            paths.set(w, (paths.get(w) ?? 0) + (paths.get(v) ?? 0));
            if (!pred.has(w)) pred.set(w, []);
            pred.get(w)!.push(v);
          }
        }
      }
      const delta = new Map<string, number>();
      while (stack.length > 0) {
        const w = stack.pop()!;
        const dw = delta.get(w) ?? 0;
        for (const v of pred.get(w) ?? []) {
          const share = ((paths.get(v) ?? 1) / (paths.get(w) ?? 1)) * (1 + dw);
          delta.set(v, (delta.get(v) ?? 0) + share);
        }
        if (w !== source.id) {
          between.set(w, (between.get(w) ?? 0) + (delta.get(w) ?? 0));
        }
      }
    }
    // Normalize
    const maxBetween = Math.max(...between.values(), 1);
    const betweenTop = [...between.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, val]) => ({
        id,
        label: nodes.find((nd) => nd.id === id)?.shortLabel ?? id,
        fullLabel: nodes.find((nd) => nd.id === id)?.label ?? id,
        value: val / maxBetween,
      }));

    // 5. Clustering coefficient (local, undirected)
    // Reuse pre-built adjacency (item #9): if no selection, use fullNeighborSets
    // directly; if scoped, rebuild only for the selected subgraph.
    const neighborSets: Map<string, Set<string>> = isScoped
      ? (() => {
          const m = new Map<string, Set<string>>();
          nodes.forEach((nd) => m.set(nd.id, new Set()));
          edges.forEach((e) => {
            m.get(e.source)?.add(e.target);
            m.get(e.target)?.add(e.source);
          });
          return m;
        })()
      : fullNeighborSets;
    let clusterSum = 0;
    let clusterCount = 0;
    nodes.forEach((nd) => {
      const nbrs = neighborSets.get(nd.id)!;
      const k = nbrs.size;
      if (k < 2) return;
      let triangles = 0;
      const nbrArr = [...nbrs];
      for (let i = 0; i < nbrArr.length; i++) {
        for (let j = i + 1; j < nbrArr.length; j++) {
          if (neighborSets.get(nbrArr[i])?.has(nbrArr[j])) triangles++;
        }
      }
      clusterSum += (2 * triangles) / (k * (k - 1));
      clusterCount++;
    });
    const clusteringCoeff = clusterCount > 0 ? clusterSum / clusterCount : 0;

    // 6. Community detection — modularity-greedy Louvain phase 1 on the
    // actual edge topology. Emergent communities can diverge from the
    // domain partition; cross-domain communities are the interesting cases.
    const uncertainty = summarizeDiscoveryUncertainty(nodes, edges);
    const communityResult = detectCommunities(nodes, edges);
    const communityList = communityResult.communities.map((c) => ({
      id: c.id,
      name: c.crossesDomains
        ? `${c.dominantDomain} +${c.domainCount - 1}`
        : c.dominantDomain,
      size: c.size,
      crossesDomains: c.crossesDomains,
      domainCount: c.domainCount,
    }));
    const communityModularity = communityResult.modularityProxy;
    const crossDomainCommunityCount = communityResult.communities.filter(
      (c) => c.crossesDomains,
    ).length;

    // 7. Connected components (BFS)
    const visited = new Set<string>();
    let componentCount = 0;
    for (const nd of nodes) {
      if (visited.has(nd.id)) continue;
      componentCount++;
      const bfsQ = [nd.id];
      while (bfsQ.length > 0) {
        const curr = bfsQ.pop()!;
        if (visited.has(curr)) continue;
        visited.add(curr);
        for (const nbr of neighborSets.get(curr) ?? []) {
          if (!visited.has(nbr)) bfsQ.push(nbr);
        }
      }
    }

    // 8. Diameter estimate (longest shortest path from degree-centrality hub)
    const hub = betweenTop[0]?.id ?? nodes[0]?.id;
    let diameter = 0;
    if (hub) {
      const distFromHub = new Map<string, number>();
      distFromHub.set(hub, 0);
      const bfsQ = [hub];
      while (bfsQ.length > 0) {
        const v = bfsQ.shift()!;
        const dv = distFromHub.get(v)!;
        for (const w of neighborSets.get(v) ?? []) {
          if (!distFromHub.has(w)) {
            distFromHub.set(w, dv + 1);
            bfsQ.push(w);
            diameter = Math.max(diameter, dv + 1);
          }
        }
      }
    }

    return {
      density, avgDegree, clusteringCoeff, componentCount, diameter,
      eigenTop, betweenTop, communityList,
      communityModularity, crossDomainCommunityCount,
      uncertainty,
      lambdaMax: cascade.lambdaMax, isStable: cascade.isStable,
      dampingCoeff: cascade.dampingCoeff, forgettingRate: cascade.forgettingRate,
      nodeCount: n, edgeCount: m,
      totalNodeCount: allNodes.length, totalEdgeCount: allEdges.length,
      isScoped,
    };
  }, [deferredGraphData, cascade, deferredSelectedNodes, fullNeighborSets]);

  const metricColor = (val: number, threshLow: number, threshHigh: number) =>
    val < threshLow ? "#00e676" : val < threshHigh ? "#ffab00" : "#ff1744";

  // ─── RELEVANT NOW — contextual callouts ──────────────────────────
  //
  // The dropdowns below (eigenvector / betweenness / communities /
  // uncertainty / DCD / PCMCI+ / FCI) carry a lot of information but
  // each is collapsed by default and titled in jargon. This zone
  // surfaces the 2–3 most relevant numbers right now — either for the
  // selected node, or for the graph as a whole — so the panel reads
  // top-down: "here's what to look at" → "here are all the metrics".
  const relevantNowCallouts = useMemo(() => {
    type Callout = { label: string; value: string; detail?: string; tone?: "amber" | "red" | "green" };
    const out: Callout[] = [];
    const selectedNodeObj = selectedNode
      ? deferredGraphData.nodes.find((n) => n.id === selectedNode)
      : null;

    if (selectedNodeObj) {
      // Centrality rank — surface when in top-5 by either measure.
      const eigenRank = netMetrics.eigenTop.findIndex(
        (t) => t.id === selectedNodeObj.id,
      );
      const betwRank = netMetrics.betweenTop.findIndex(
        (t) => t.id === selectedNodeObj.id,
      );
      if (eigenRank >= 0 || betwRank >= 0) {
        const parts: string[] = [];
        if (eigenRank >= 0) parts.push(`#${eigenRank + 1} eigenvector`);
        if (betwRank >= 0) parts.push(`#${betwRank + 1} betweenness`);
        out.push({
          label: "Centrality",
          value: parts.join(" · "),
          detail: "top-5 in network",
          tone: "green",
        });
      }

      // Cascade load — elevated above structural median.
      const cVal = selectedNodeObj.omegaFragility.cascadeLoad;
      if (cVal >= 7) {
        out.push({
          label: "Cascade",
          value: `C ${cVal.toFixed(1)}`,
          detail: cVal >= 9 ? "saturated" : "elevated",
          tone: cVal >= 9 ? "red" : "amber",
        });
      }

      // Auto-bridges incident on this node — closes the loop with the
      // cross-domain bridging pass; the user sees that THIS node is
      // currently connected to other domains only via heuristic edges.
      const incidentBridges = deferredGraphData.edges.filter(
        (e) =>
          e.id.startsWith("auto-bridge") &&
          (e.source === selectedNodeObj.id || e.target === selectedNodeObj.id),
      );
      if (incidentBridges.length > 0) {
        out.push({
          label: "Auto-bridges",
          value: `${incidentBridges.length} cross-domain`,
          detail: "FLAGGED · needs verification",
          tone: "amber",
        });
      }
    } else {
      // Graph-wide callouts — surface only when something interesting
      // is going on, so the panel stays empty when the graph is
      // healthy / connected / stable.
      if (!netMetrics.isStable) {
        out.push({
          label: "Stability",
          value: `λmax ${netMetrics.lambdaMax.toFixed(2)}`,
          detail: "UNSTABLE — cascade amplifies",
          tone: "red",
        });
      }
      if (netMetrics.componentCount > 1) {
        out.push({
          label: "Components",
          value: `${netMetrics.componentCount} disconnected`,
          detail: "auto-bridges in play",
          tone: "amber",
        });
      }
      // Auto-bridge lifecycle — count unpromoted (still flagged by R-04)
      // vs promoted (curator-confirmed). Single pass so the bridge state
      // is summarised at the top of the panel without scrolling.
      let unpromotedBridges = 0;
      let promotedBridges = 0;
      for (const e of deferredGraphData.edges) {
        if (!e.id.startsWith("auto-bridge")) continue;
        if (e.physicalMechanism?.startsWith("promoted bridge:")) {
          promotedBridges += 1;
        } else {
          unpromotedBridges += 1;
        }
      }
      if (unpromotedBridges > 0) {
        out.push({
          label: "Bridges",
          value: `${unpromotedBridges} auto`,
          detail: "needs review — click to promote",
          tone: "amber",
        });
      }
      if (promotedBridges > 0) {
        out.push({
          label: "Bridges",
          value: `${promotedBridges} promoted`,
          detail: "curator-confirmed",
          tone: "green",
        });
      }
      if (netMetrics.crossDomainCommunityCount > 0) {
        out.push({
          label: "Cross-domain",
          value: `${netMetrics.crossDomainCommunityCount} communities`,
          detail: "emergent groupings span domains",
          tone: "amber",
        });
      }
      if (netMetrics.uncertainty.lowConfidenceCount > 0) {
        out.push({
          label: "Uncertainty",
          value: `${netMetrics.uncertainty.lowConfidenceCount} low-conf edges`,
          detail: `μ ${netMetrics.uncertainty.meanEdgeConfidence.toFixed(2)}`,
          tone: "amber",
        });
      }
    }

    // Cap at 3 so the panel stays scannable.
    return out.slice(0, 3);
  }, [selectedNode, deferredGraphData, netMetrics]);

  const toneColor = (tone: "amber" | "red" | "green" | undefined) => {
    if (tone === "red") return "#ff1744";
    if (tone === "green") return "#00e676";
    return "#ffab00"; // amber default
  };

  const toggleMetric = (key: string) => setExpandedMetric(expandedMetric === key ? null : key);

  return (
    <div className="px-3 py-2 border-b border-border space-y-1.5 max-h-[45vh] overflow-y-auto">
      <div className="font-[family-name:var(--font-michroma)] text-[9px] tracking-wider text-text-muted">
        NETWORK ANALYSIS
      </div>

      {/* AT A GLANCE — contextual highlights (selected-node or graph-wide)
          Replaces the older "RELEVANT NOW" floating-label box. The
          fieldset-legend trick we had needed the panel parent bg to be
          `bg-bg-base` to mask the border, but the right column actually
          uses `bg-surface`, so the label appeared to cross through the
          border. Flat inline header + explanatory subtitle here. */}
      {relevantNowCallouts.length > 0 && (
        <div className="px-2 py-2 mt-1 rounded border border-border bg-surface-elevated/50">
          <div className="flex items-baseline justify-between mb-0.5">
            <div className="text-[8px] font-[family-name:var(--font-michroma)] tracking-wider text-text-secondary">
              AT A GLANCE
            </div>
            <div className="text-[7px] font-mono text-text-muted/60">
              context signals
            </div>
          </div>
          <div className="space-y-1 mt-1">
            {relevantNowCallouts.map((c, i) => (
              <div
                key={`${c.label}-${i}`}
                className="text-[9px] font-mono leading-tight flex items-baseline gap-1.5"
              >
                <span
                  style={{ color: toneColor(c.tone) }}
                  className="text-[8px] leading-none"
                >
                  ●
                </span>
                <span className="text-text-muted">{c.label}</span>
                <span className="text-foreground tabular-nums">{c.value}</span>
                {c.detail && (
                  <span className="text-text-muted/70 truncate">
                    — {c.detail}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CALCULATIONS — pure-function readouts that run against the
          current graph + selection. Pluggable registry; new entries
          (Greeks, T1D scores, supply-chain variants) plug in by
          appending to CALCULATION_REGISTRY. Renders nothing when no
          calc applies, so empty graphs don't paint dead chrome. */}
      <CalculationsPanel />

      {/* Scoped indicator */}
      {netMetrics.isScoped && (
        <div className="text-[7px] font-mono px-2 py-0.5 rounded border border-accent-amber/30 bg-accent-amber/5 text-accent-amber text-center">
          SCOPED TO {netMetrics.nodeCount} SELECTED NODES
        </div>
      )}

      {/* Quick stats row */}
      <div className="grid grid-cols-4 gap-1">
        {[
          { label: "NODES", value: `${netMetrics.nodeCount}${netMetrics.isScoped ? ` / ${netMetrics.totalNodeCount}` : ""}`, color: netMetrics.isScoped ? "#ffab00" : "#00e5ff" },
          { label: "EDGES", value: `${netMetrics.edgeCount}${netMetrics.isScoped ? ` / ${netMetrics.totalEdgeCount}` : ""}`, color: netMetrics.isScoped ? "#ffab00" : "#00e5ff" },
          { label: "DENSITY", value: netMetrics.density.toFixed(3), color: metricColor(netMetrics.density, 0.05, 0.15) },
          { label: "COMPONENTS", value: `${netMetrics.componentCount}`, color: netMetrics.componentCount === 1 ? "#00e676" : "#ffab00" },
        ].map((s) => (
          <div key={s.label} className="text-center p-1 rounded border border-border/50 bg-surface-elevated">
            <div className="text-[7px] font-mono text-text-muted">{s.label}</div>
            <div className="text-[11px] font-[family-name:var(--font-michroma)] tabular-nums" style={{ color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Spectral stability */}
      <div className="flex items-center justify-between p-1.5 rounded border" style={{
        borderColor: netMetrics.isStable ? "rgba(0,230,118,0.2)" : "rgba(255,23,68,0.2)",
        backgroundColor: netMetrics.isStable ? "rgba(0,230,118,0.03)" : "rgba(255,23,68,0.03)",
      }}>
        <div className="text-[8px] font-mono text-text-muted">
          dS/dt = {"\u2212"}{netMetrics.dampingCoeff.toFixed(2)}{"\u00B7"}S + {netMetrics.forgettingRate.toFixed(2)}
        </div>
        <span className="text-[8px] font-mono px-1.5 py-0.5 rounded border" style={{
          color: netMetrics.isStable ? "#00e676" : "#ff1744",
          borderColor: netMetrics.isStable ? "rgba(0,230,118,0.3)" : "rgba(255,23,68,0.3)",
        }}>
          {"\u03BB"}max={netMetrics.lambdaMax.toFixed(2)} {netMetrics.isStable ? "STABLE" : "UNSTABLE"}
        </span>
      </div>

      {/* Secondary stats */}
      <div className="grid grid-cols-3 gap-1">
        <div className="text-center p-1 rounded border border-border/50 bg-surface-elevated">
          <div className="text-[7px] font-mono text-text-muted">AVG DEGREE</div>
          <div className="text-[10px] font-mono text-accent-cyan tabular-nums">{netMetrics.avgDegree.toFixed(1)}</div>
        </div>
        <div className="text-center p-1 rounded border border-border/50 bg-surface-elevated">
          <div className="text-[7px] font-mono text-text-muted">CLUSTERING</div>
          <div className="text-[10px] font-mono tabular-nums" style={{ color: metricColor(netMetrics.clusteringCoeff, 0.1, 0.3) }}>
            {netMetrics.clusteringCoeff.toFixed(3)}
          </div>
        </div>
        <div className="text-center p-1 rounded border border-border/50 bg-surface-elevated">
          <div className="text-[7px] font-mono text-text-muted">DIAMETER</div>
          <div className="text-[10px] font-mono text-accent-cyan tabular-nums">{netMetrics.diameter}</div>
        </div>
      </div>

      {/* Eigenvector Centrality — expandable */}
      <button onClick={() => toggleMetric("eigen")} className="w-full text-left">
        <div className="flex items-center justify-between p-1.5 rounded border border-accent-cyan/20 bg-accent-cyan/5 hover:bg-accent-cyan/8 transition-colors">
          <div className="text-[8px] font-[family-name:var(--font-michroma)] tracking-wider text-accent-cyan flex items-baseline gap-1.5 min-w-0">
            <span className="flex-shrink-0">EIGENVECTOR</span>
            {netMetrics.eigenTop[0] && (
              <span className="text-text-muted truncate font-mono normal-case tracking-normal">
                top: <span className="text-accent-cyan">{netMetrics.eigenTop[0].label}</span>
              </span>
            )}
          </div>
          <span className="text-[8px] text-text-muted" style={{ transform: expandedMetric === "eigen" ? "rotate(180deg)" : "rotate(0deg)", display: "inline-block", transition: "transform 0.2s" }}>
            {"\u25BC"}
          </span>
        </div>
      </button>
      {expandedMetric === "eigen" && (
        <div className="space-y-1 pl-1">
          <div className="text-[8px] font-mono text-text-muted leading-relaxed mb-1">
            Measures a node{"'"}s influence based on how connected it is to other influential nodes. High eigenvector centrality = structural hub whose disruption cascades through well-connected neighbors.
          </div>
          {netMetrics.eigenTop.map((nd, i) => (
            <button key={nd.id} onClick={() => setSelectedNode(nd.id)} className="w-full flex items-center gap-2 py-0.5 hover:bg-accent-cyan/5 rounded px-1 transition-colors">
              <span className="text-[8px] font-mono text-text-muted w-3">{i + 1}.</span>
              <span className="text-[9px] font-mono text-accent-cyan">{nd.label}</span>
              <div className="flex-1 h-1 bg-border rounded overflow-hidden">
                <div className="h-full bg-accent-cyan/60 rounded" style={{ width: `${(nd.value / (netMetrics.eigenTop[0]?.value || 1)) * 100}%` }} />
              </div>
              <span className="text-[8px] font-mono text-text-muted tabular-nums">{nd.value.toFixed(3)}</span>
            </button>
          ))}
        </div>
      )}

      {/* Betweenness Centrality — expandable */}
      <button onClick={() => toggleMetric("between")} className="w-full text-left">
        <div className="flex items-center justify-between p-1.5 rounded border border-accent-amber/20 bg-accent-amber/5 hover:bg-accent-amber/8 transition-colors">
          <div className="text-[8px] font-[family-name:var(--font-michroma)] tracking-wider text-accent-amber flex items-baseline gap-1.5 min-w-0">
            <span className="flex-shrink-0">BETWEENNESS</span>
            {netMetrics.betweenTop[0] && (
              <span className="text-text-muted truncate font-mono normal-case tracking-normal">
                top: <span className="text-accent-amber">{netMetrics.betweenTop[0].label}</span>
              </span>
            )}
          </div>
          <span className="text-[8px] text-text-muted" style={{ transform: expandedMetric === "between" ? "rotate(180deg)" : "rotate(0deg)", display: "inline-block", transition: "transform 0.2s" }}>
            {"\u25BC"}
          </span>
        </div>
      </button>
      {expandedMetric === "between" && (
        <div className="space-y-1 pl-1">
          <div className="text-[8px] font-mono text-text-muted leading-relaxed mb-1">
            Identifies chokepoints {"\u2014"} nodes that lie on the most shortest paths between other nodes. High betweenness = critical bridge whose removal fragments the network.
          </div>
          {netMetrics.betweenTop.map((nd, i) => (
            <button key={nd.id} onClick={() => setSelectedNode(nd.id)} className="w-full flex items-center gap-2 py-0.5 hover:bg-accent-amber/5 rounded px-1 transition-colors">
              <span className="text-[8px] font-mono text-text-muted w-3">{i + 1}.</span>
              <span className="text-[9px] font-mono text-accent-amber">{nd.label}</span>
              <div className="flex-1 h-1 bg-border rounded overflow-hidden">
                <div className="h-full bg-accent-amber/60 rounded" style={{ width: `${nd.value * 100}%` }} />
              </div>
              <span className="text-[8px] font-mono text-text-muted tabular-nums">{nd.value.toFixed(3)}</span>
            </button>
          ))}
        </div>
      )}

      {/* Communities — expandable */}
      <button onClick={() => toggleMetric("community")} className="w-full text-left">
        <div className="flex items-center justify-between p-1.5 rounded border border-accent-green/20 bg-accent-green/5 hover:bg-accent-green/8 transition-colors">
          <div className="text-[8px] font-[family-name:var(--font-michroma)] tracking-wider text-accent-green">
            COMMUNITIES ({netMetrics.communityList.length})
            {netMetrics.crossDomainCommunityCount > 0 && (
              <span className="ml-1 text-accent-amber">{"·"} {netMetrics.crossDomainCommunityCount} cross-domain</span>
            )}
          </div>
          <span className="text-[8px] text-text-muted" style={{ transform: expandedMetric === "community" ? "rotate(180deg)" : "rotate(0deg)", display: "inline-block", transition: "transform 0.2s" }}>
            {"\u25BC"}
          </span>
        </div>
      </button>
      {expandedMetric === "community" && (
        <div className="space-y-1 pl-1">
          <div className="text-[8px] font-mono text-text-muted leading-relaxed mb-1">
            Topology-detected via modularity optimization (Louvain phase 1). Emergent groupings — distinct from the curator-assigned domain partition shown in the bottom Domain Selector. Cross-domain communities (amber) span multiple domains and surface contagion pathways the domain partition does not.
          </div>
          <div className="flex items-center gap-2 px-1 pb-1 border-b border-border/40">
            <span className="text-[8px] font-mono text-text-muted">modularity (intra-edge fraction)</span>
            <div className="flex-1 h-1 bg-border rounded overflow-hidden">
              <div className="h-full bg-accent-green/60 rounded" style={{ width: `${netMetrics.communityModularity * 100}%` }} />
            </div>
            <span className="text-[8px] font-mono text-text-muted tabular-nums">{netMetrics.communityModularity.toFixed(2)}</span>
          </div>
          {netMetrics.communityList.map((c) => (
            <div key={c.id} className="flex items-center gap-2 py-0.5 px-1">
              <span className={`text-[9px] font-mono flex-1 truncate ${c.crossesDomains ? "text-accent-amber" : "text-accent-green"}`}>
                {c.name}
              </span>
              <div className="w-16 h-1 bg-border rounded overflow-hidden">
                <div
                  className={`h-full rounded ${c.crossesDomains ? "bg-accent-amber/60" : "bg-accent-green/60"}`}
                  style={{ width: `${(c.size / graphData.nodes.length) * 100}%` }}
                />
              </div>
              <span className="text-[8px] font-mono text-text-muted tabular-nums">{c.size}</span>
            </div>
          ))}
        </div>
      )}

      {/* Uncertainty / Discovery Confidence */}
      <button onClick={() => toggleMetric("uncertainty")} className="w-full text-left">
        <div className="flex items-center justify-between p-1.5 rounded border border-accent-blue/20 bg-accent-blue/5 hover:bg-accent-blue/8 transition-colors">
          <div className="text-[8px] font-[family-name:var(--font-michroma)] tracking-wider text-accent-blue">
            UNCERTAINTY
            <span className="ml-1 text-text-muted">μ {netMetrics.uncertainty.meanEdgeConfidence.toFixed(2)}</span>
            {netMetrics.uncertainty.lowConfidenceCount > 0 && (
              <span className="ml-1 text-accent-amber">{"·"} {netMetrics.uncertainty.lowConfidenceCount} low-conf</span>
            )}
          </div>
          <span className="text-[8px] text-text-muted" style={{ transform: expandedMetric === "uncertainty" ? "rotate(180deg)" : "rotate(0deg)", display: "inline-block", transition: "transform 0.2s" }}>
            {"▼"}
          </span>
        </div>
      </button>
      {expandedMetric === "uncertainty" && (
        <div className="space-y-1 pl-1">
          <div className="text-[8px] font-mono text-text-muted leading-relaxed mb-1">
            Per-edge SPIRTES discovery confidence aggregated graph-wide. Edges below the 0.7 cutoff (matching Tarski A-06) are flagged amber. Node-level breakdown shows how much of the active structure is triangulated across DCD / PCMCI+ / FCI vs. surfaced by a single algorithm.
          </div>
          <div className="flex items-center gap-2 px-1 py-0.5">
            <span className="text-[8px] font-mono text-text-muted flex-1">mean confidence</span>
            <div className="w-16 h-1 bg-border rounded overflow-hidden">
              <div className="h-full bg-accent-blue/60 rounded" style={{ width: `${netMetrics.uncertainty.meanEdgeConfidence * 100}%` }} />
            </div>
            <span className="text-[8px] font-mono text-text-muted tabular-nums">{netMetrics.uncertainty.meanEdgeConfidence.toFixed(2)}</span>
          </div>
          <div className="flex items-center gap-2 px-1 py-0.5">
            <span className="text-[8px] font-mono text-text-muted flex-1">median confidence</span>
            <div className="w-16 h-1 bg-border rounded overflow-hidden">
              <div className="h-full bg-accent-blue/60 rounded" style={{ width: `${netMetrics.uncertainty.medianEdgeConfidence * 100}%` }} />
            </div>
            <span className="text-[8px] font-mono text-text-muted tabular-nums">{netMetrics.uncertainty.medianEdgeConfidence.toFixed(2)}</span>
          </div>
          <div className="flex items-center gap-2 px-1 py-0.5">
            <span className={`text-[8px] font-mono flex-1 ${netMetrics.uncertainty.lowConfidenceCount > 0 ? "text-accent-amber" : "text-text-muted"}`}>
              edges below 0.7
            </span>
            <div className="w-16 h-1 bg-border rounded overflow-hidden">
              <div
                className={`h-full rounded ${netMetrics.uncertainty.lowConfidenceCount > 0 ? "bg-accent-amber/60" : "bg-accent-blue/60"}`}
                style={{ width: `${netMetrics.uncertainty.lowConfidenceFraction * 100}%` }}
              />
            </div>
            <span className="text-[8px] font-mono text-text-muted tabular-nums">{netMetrics.uncertainty.lowConfidenceCount}</span>
          </div>
          <div className="flex items-center gap-2 px-1 py-0.5 border-t border-border/40 mt-1 pt-1">
            <span className="text-[8px] font-mono text-text-muted flex-1">merged (multi-algo)</span>
            <div className="w-16 h-1 bg-border rounded overflow-hidden">
              <div className="h-full bg-accent-green/60 rounded" style={{ width: `${netMetrics.uncertainty.mergedFraction * 100}%` }} />
            </div>
            <span className="text-[8px] font-mono text-text-muted tabular-nums">{netMetrics.uncertainty.sourceBreakdown.merged}</span>
          </div>
          <div className="flex items-center gap-2 px-1 py-0.5">
            <span className="text-[8px] font-mono text-text-muted flex-1">DCD only</span>
            <span className="text-[8px] font-mono text-text-muted tabular-nums">{netMetrics.uncertainty.sourceBreakdown.DCD}</span>
          </div>
          <div className="flex items-center gap-2 px-1 py-0.5">
            <span className="text-[8px] font-mono text-text-muted flex-1">PCMCI+ only</span>
            <span className="text-[8px] font-mono text-text-muted tabular-nums">{netMetrics.uncertainty.sourceBreakdown.PCMCI}</span>
          </div>
          <div className="flex items-center gap-2 px-1 py-0.5">
            <span className="text-[8px] font-mono text-text-muted flex-1">FCI only</span>
            <span className="text-[8px] font-mono text-text-muted tabular-nums">{netMetrics.uncertainty.sourceBreakdown.FCI}</span>
          </div>
        </div>
      )}
    </div>
  );
}

