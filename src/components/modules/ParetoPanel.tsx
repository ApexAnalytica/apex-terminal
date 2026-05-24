"use client";

// Extracted from ModulePanel.tsx so the Pareto tab — the heaviest of the
// non-default tabs — ships as its own chunk and doesn't pull
// `lppls-fit`, `ph-fit`, `pareto-relevance-bootstrap`, or its 400-LOC
// CriticalityCard into the initial bundle. Pure extraction: ParetoPanel
// + its co-located helpers (SnapshotIndicator, CritSparklineChart,
// CritSparkline, shortenEventLabel, CriticalityCard).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApexStore } from "@/stores/useApexStore";
import { getEngineProvider } from "@/lib/engines";
import { getDomainColor } from "@/lib/graph-color";
import { resolveDomainProfile, type EstimatorId } from "@/lib/domain-profiles";
import { getEstimatorMeta } from "@/lib/criticality-registry";
import { moransI } from "@/lib/estimators/moran";
import { extractT1DSeries, T1D_NODE_IDS } from "@/lib/t1d-estimator-inputs";
import {
  bocpdRegimeGate,
  csdRegimeGate,
  lpplsRegimeGate,
  phRegimeGate,
  spatialConsistency,
  trajectorySufficiency,
  topologySufficiency,
  type ModelRelevanceInput,
  type RelevanceBreakdown,
} from "@/lib/pareto-relevance";
import { bootstrapRelevanceBatch } from "@/lib/pareto-relevance-bootstrap";
import {
  buildScopedAdjacency,
  inducedEdgeCount,
} from "@/lib/pareto-scoped-subgraph";
import {
  loadRelevanceReference,
  lookupRelevanceReference,
  type ReferenceLookupResult,
  type RelevanceReference,
} from "@/lib/pareto-relevance-reference";
import { fitLppls, lpplsSeries } from "@/lib/estimators/lppls-fit";
import { fitBettiTemplate } from "@/lib/estimators/ph-fit";
import SnapshotDiagnostics from "../SnapshotDiagnostics";

// Discriminated-union shape that drives CriticalityCard's empty-state
// rendering (no data yet vs. estimator port pending). Lived inline in
// ModulePanel.tsx between CritSparkline and shortenEventLabel —
// extracted here so the moved CriticalityCard + ParetoPanel keep
// referencing the same definition.
type CriticalityEmptyState =
  | { kind: "awaiting-data"; inputs: string }
  | { kind: "pending-port"; reference: string };

function SnapshotIndicator() {
  const snapshotHistory = useApexStore((s) => s.snapshotHistory);
  const currentSnapshot = useApexStore((s) => s.currentSnapshot);

  if (snapshotHistory.length === 0) return null;

  const latestTime = currentSnapshot
    ? new Date(currentSnapshot.timestamp).toLocaleTimeString()
    : "—";

  return (
    <div className="flex items-center justify-between text-[8px] font-mono text-text-muted p-1.5 border border-border/50 rounded bg-surface-elevated">
      <span>SNAPSHOTS: {snapshotHistory.length}</span>
      <span>LATEST: {latestTime}</span>
      {currentSnapshot?.tarskiValidation.status === "VIOLATIONS_FOUND" && (
        <span className="text-accent-red">
          {currentSnapshot.tarskiValidation.violations.length} VIOLATIONS
        </span>
      )}
      {currentSnapshot?.tarskiValidation.status === "PASSED" && (
        <span className="text-accent-green">VALIDATED</span>
      )}
    </div>
  );
}


function ParetoPanel({
  expandedChart,
  setExpandedChart,
}: {
  expandedChart: string | null;
  setExpandedChart: (id: string | null) => void;
}) {
  const shocks = useApexStore((s) => s.shocks);
  const removeShock = useApexStore((s) => s.removeShock);
  const graphData = useApexStore((s) => s.graphData);
  const selectedNode = useApexStore((s) => s.selectedNode);
  const setSelectedNode = useApexStore((s) => s.setSelectedNode);
  const selectedNodes = useApexStore((s) => s.selectedNodes);
  const temporalData = useApexStore((s) => s.temporalData);
  const replayActive = useApexStore((s) => s.replayActive);
  const currentEpoch = useApexStore((s) => s.currentEpoch);
  const baselineEpochs = useApexStore((s) => s.baselineEpochs);
  const interventionEpochs = useApexStore((s) => s.interventionEpochs);
  const activeTimeline = useApexStore((s) => s.activeTimeline);
  const selectedDomains = useApexStore((s) => s.selectedDomains);
  const activeProfile = useMemo(() => resolveDomainProfile(selectedDomains), [selectedDomains]);
  // Pre-built per-profile relevance reference (F → historical event-rate
  // table). Loaded lazily once per profile id; null when the profile
  // declares no reference or the JSON 404s. The UI guards on this and
  // degrades silently when null.
  const [relevanceReference, setRelevanceReference] =
    useState<RelevanceReference | null>(null);
  useEffect(() => {
    const refId = activeProfile.relevanceReferenceId;
    if (!refId) {
      setRelevanceReference(null);
      return;
    }
    let cancelled = false;
    void loadRelevanceReference(refId).then((r) => {
      if (!cancelled) setRelevanceReference(r);
    });
    return () => {
      cancelled = true;
    };
  }, [activeProfile.relevanceReferenceId]);

  const engine = useMemo(() => getEngineProvider(), []);
  const omegaState = useMemo(() => engine.scanTailRisk(shocks), [engine, shocks]);

  // During replay, derive buffer from current epoch snapshot for dynamic T=
  const replayEpochs = activeTimeline === "baseline" ? baselineEpochs : interventionEpochs;
  const currentSnapshot = replayActive && replayEpochs.length > 0
    ? replayEpochs[currentEpoch] ?? null
    : null;
  // ── Derive three criticality countdowns ──
  // CSD: Critical Slowing Down — based on spectral radius and cascade load
  const csdEpochs = useMemo(() => {
    const lambdaMax = graphData.edges.reduce((max, e) => {
      const srcNode = graphData.nodes.find((n) => n.id === e.source);
      return Math.max(max, (srcNode?.omegaFragility.cascadeLoad ?? 0) * e.weight / 10);
    }, 0);
    const shockPressure = shocks.reduce((s, sh) => s + sh.severity, 0);
    const baseEpochs = Math.max(3, Math.round(200 * (1 - lambdaMax) * (1 - shockPressure * 0.4)));
    return currentSnapshot
      ? Math.max(0, baseEpochs - Math.round(currentSnapshot.epoch * (1 + shockPressure)))
      : baseEpochs;
  }, [graphData, shocks, currentSnapshot]);

  // PH: Persistent Homology — based on topological holes (high-fragility clusters)
  const phEpochs = useMemo(() => {
    const highFragNodes = graphData.nodes.filter((n) => n.omegaFragility.composite > 7).length;
    const topoDensity = highFragNodes / Math.max(1, graphData.nodes.length);
    const shockPressure = shocks.reduce((s, sh) => s + sh.severity, 0);
    const baseEpochs = Math.max(5, Math.round(300 * (1 - topoDensity * 0.8) * (1 - shockPressure * 0.3)));
    return currentSnapshot
      ? Math.max(0, baseEpochs - Math.round(currentSnapshot.epoch * (0.8 + topoDensity)))
      : baseEpochs;
  }, [graphData, shocks, currentSnapshot]);

  // LPPLS: Log-Periodic Power Law Singularity — based on fragility acceleration
  const lpplsEpochs = useMemo(() => {
    const avgOmega = graphData.nodes.reduce((s, n) => s + n.omegaFragility.composite, 0) / Math.max(1, graphData.nodes.length);
    const shockPressure = shocks.reduce((s, sh) => s + sh.severity, 0);
    const acceleration = (avgOmega / 10) * (1 + shockPressure);
    const baseEpochs = Math.max(3, Math.round(250 * (1 - acceleration * 0.6)));
    return currentSnapshot
      ? Math.max(0, baseEpochs - Math.round(currentSnapshot.epoch * acceleration))
      : baseEpochs;
  }, [graphData, shocks, currentSnapshot]);

  const topNodes = useMemo(() => {
    return [...graphData.nodes]
      .sort((a, b) => b.omegaFragility.composite - a.omegaFragility.composite)
      .slice(0, 8);
  }, [graphData.nodes]);

  // ── Scope: which nodes the criticality models compute on ──
  // Mirrors RiskPropagationFlow: user's selection if any, else top-N by Ω.
  const scopedNodeIds = useMemo<string[]>(() => {
    if (selectedNodes && selectedNodes.length > 0) return selectedNodes;
    return topNodes.map((n) => n.id);
  }, [selectedNodes, topNodes]);

  // Mean omegaComposite trajectory across the scoped nodes, normalized 0–1.
  // Single source of truth shared with the bottom ΩF TIME SERIES cards.
  //
  // Histories are filtered to length ≥ 5 before the min-clip — a single node
  // with one entry would otherwise collapse the trajectory to T=1 and starve
  // every live estimator (CSD's AR(1) fit needs n≥5). 5 matches the smallest
  // n at which any criticality model can produce a non-degenerate result.
  const scopedOmegaSeries = useMemo<number[]>(() => {
    if (!temporalData || scopedNodeIds.length === 0) return [];
    const MIN_USEFUL_HISTORY = 5;
    const histories = scopedNodeIds
      .map((id) => temporalData.nodes.get(id)?.history ?? [])
      .filter((h) => h.length >= MIN_USEFUL_HISTORY);
    if (histories.length === 0) return [];
    const T = Math.min(...histories.map((h) => h.length));
    const series: number[] = [];
    for (let t = 0; t < T; t++) {
      let s = 0;
      for (const h of histories) s += h[t].omegaComposite;
      series.push(s / histories.length / 10); // /10 → normalize to 0–1
    }
    return series;
  }, [temporalData, scopedNodeIds]);

  const scopeLabel = selectedNodes && selectedNodes.length > 0
    ? `${selectedNodes.length} selected node${selectedNodes.length === 1 ? "" : "s"}`
    : `top ${scopedNodeIds.length} risk nodes`;

  // Criticality card helper
  const getCritColor = (epochs: number) =>
    epochs < 20 ? "#ff1744" : epochs < 80 ? "#ffab00" : "#00e676";

  // Which criticality model is selected in the tab-strip picker (one at a time).
  // Keyed by EstimatorId so it composes with the profile-driven estimator list.
  const [selectedCrit, setSelectedCrit] = useState<EstimatorId>(
    () => activeProfile.criticalityEstimators[0] ?? "csd"
  );
  // If the profile changes (e.g. user switches from T1D back to geopolitical)
  // reset the selection to the new profile's first estimator.
  useEffect(() => {
    if (!activeProfile.criticalityEstimators.includes(selectedCrit)) {
      setSelectedCrit(activeProfile.criticalityEstimators[0] ?? "csd");
    }
  }, [activeProfile, selectedCrit]);
  // Collapsible TOP Ω-CRITICAL NODES list — default collapsed to keep panel tight
  const [topNodesOpen, setTopNodesOpen] = useState(false);

  // ── CSD: lag-1 autocorrelation (α) of the scoped Ω trajectory ──
  // Theory: as a system approaches a tipping point, perturbations decay more
  // slowly → α → 1 (Scheffer 2009). Fit AR(1):  x_{t+1} = α·x_t + (1-α)·μ + ε.
  // Model = AR(1) one-step-ahead forecast. Confidence = R²(observed, model).
  const csdData = useMemo(() => {
    const observed = scopedOmegaSeries;
    const n = observed.length;

    // λmax from current graph structure (kept for assessment text)
    let lambdaMax = 0;
    const rowSums = new Map<string, number>();
    for (const node of graphData.nodes) rowSums.set(node.id, 0);
    for (const e of graphData.edges) {
      if (!e.isSevered) {
        const srcNode = graphData.nodes.find((n) => n.id === e.source);
        const weight = (e.weight * (srcNode?.omegaFragility.cascadeLoad ?? 1)) / 10;
        rowSums.set(e.source, (rowSums.get(e.source) ?? 0) + weight);
      }
    }
    lambdaMax = Math.max(...Array.from(rowSums.values()), 0);

    if (n < 5) {
      // Not enough observations to fit anything; return empty fit.
      return {
        timeSeries: observed,
        modelSeries: undefined,
        observedSeries: observed.length > 0 ? observed : undefined,
        confidence: 0,
        sampleSize: n,
        alpha: NaN,
        rSquared: 0,
        lambdaMax,
      };
    }

    // Estimate AR(1): α = cov(x_t, x_{t-1}) / var(x_{t-1}); μ = mean.
    const mean = observed.reduce((s, v) => s + v, 0) / n;
    let num = 0;
    let den = 0;
    for (let t = 1; t < n; t++) {
      num += (observed[t] - mean) * (observed[t - 1] - mean);
      den += (observed[t - 1] - mean) ** 2;
    }
    const alpha = den > 0 ? Math.max(0, Math.min(1.05, num / den)) : 0;

    // One-step-ahead AR(1) forecast aligned to observed indices 1..n-1.
    // Index 0 is the seed observation (no model prediction).
    const modelSeries: number[] = [observed[0]];
    for (let t = 1; t < n; t++) {
      modelSeries.push(alpha * observed[t - 1] + (1 - alpha) * mean);
    }

    // R² over the predicted span (skip seed).
    let ssRes = 0;
    let ssTot = 0;
    for (let t = 1; t < n; t++) {
      ssRes += (observed[t] - modelSeries[t]) ** 2;
      ssTot += (observed[t] - mean) ** 2;
    }
    const rSquared = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0;

    // Sample-size penalty: caps confidence linearly until n=30.
    const samplePenalty = Math.min(1, n / 30);
    const confidence = Math.max(0, Math.min(0.99, rSquared * samplePenalty));

    return {
      timeSeries: observed,
      modelSeries,
      observedSeries: observed,
      confidence,
      sampleSize: n,
      alpha,
      rSquared,
      lambdaMax,
    };
  }, [scopedOmegaSeries, graphData]);

  // ── PH time series: real topological filtration across fragility thresholds ──
  const phData = useMemo(() => {
    const composites = graphData.nodes.map((n) => n.omegaFragility.composite).sort((a, b) => a - b);
    const N = graphData.nodes.length;
    if (N === 0) {
      return {
        timeSeries: Array(60).fill(0),
        modelSeries: undefined,
        confidence: 0,
        componentCountAtMid: 0,
        clusterFrac: 0,
        fitRSquared: 0,
        riseExp: 0.6,
        center: 0.7,
        rate: 2,
        evaluations: 0,
      };
    }

    // Build real filtration: at each threshold ε, count connected components & cycles
    // Sweep ε from 0 to 10 — nodes appear when their Ω ≤ ε, edges when both endpoints present
    const points: number[] = [];
    const componentsPerStep: number[] = [];
    const thresholds = Array.from({ length: 60 }, (_, i) => (i / 59) * 10);

    for (const eps of thresholds) {
      const activeNodes = new Set(graphData.nodes.filter((n) => n.omegaFragility.composite <= eps).map((n) => n.id));
      const activeEdges = graphData.edges.filter((e) => !e.isSevered && activeNodes.has(e.source) && activeNodes.has(e.target));

      // Approximate β0 (connected components) via union-find
      const parent = new Map<string, string>();
      const find = (x: string): string => {
        if (!parent.has(x)) parent.set(x, x);
        if (parent.get(x) !== x) parent.set(x, find(parent.get(x)!));
        return parent.get(x)!;
      };
      const union = (a: string, b: string) => { parent.set(find(a), find(b)); };
      for (const nid of activeNodes) find(nid);
      for (const e of activeEdges) union(e.source, e.target);
      const components = new Set(Array.from(activeNodes).map(find)).size;
      componentsPerStep.push(components);

      // Approximate β1 (cycles) via Euler characteristic: β1 ≈ edges - nodes + components
      const beta1 = Math.max(0, activeEdges.length - activeNodes.size + components);
      // Normalize: higher β1 relative to graph size = more topological holes
      const normalized = activeNodes.size > 0 ? beta1 / Math.max(1, activeNodes.size) : 0;
      points.push(Math.min(1, normalized));
    }

    // Parametric β₁ collapse template, fit to the empirical filtration curve
    // by grid search over (riseExp, center, rate). Cluster-fraction coupling
    // stays structural (derived from graph), not a free parameter.
    const clusterCount = graphData.nodes.filter((n) => n.omegaFragility.composite > 7).length;
    const clusterFrac = clusterCount / Math.max(1, N);
    const phFit = fitBettiTemplate(points, { clusterFrac });
    const phModelPoints = phFit.modelSeries;

    // Legacy confidence (kept as a fallback when the relevance system isn't
    // live for this estimator). Tracks topological signal strength rather
    // than fit quality — the relevance composite supersedes this in the UI.
    const maxBetti = Math.max(...points);
    const variance = points.reduce((s, v) => s + (v - maxBetti / 2) ** 2, 0) / points.length;
    const topologicalSignal = Math.min(0.35, (clusterCount / Math.max(1, N)) * 1.5);
    const filtrationCoverage = Math.min(0.35, (composites[composites.length - 1] - composites[0]) / 10 * 0.35);
    const varianceSignal = Math.min(0.3, Math.sqrt(variance) * 1.5);
    const confidence = Math.min(0.99, topologicalSignal + filtrationCoverage + varianceSignal);

    const midIdx = Math.min(componentsPerStep.length - 1, Math.floor(componentsPerStep.length / 2));
    const componentCountAtMid = componentsPerStep[midIdx] ?? 0;

    return {
      timeSeries: points,
      modelSeries: phModelPoints,
      confidence,
      componentCountAtMid,
      clusterFrac,
      fitRSquared: phFit.rSquared,
      riseExp: phFit.riseExp,
      center: phFit.center,
      rate: phFit.rate,
      evaluations: phFit.evaluations,
    };
  }, [graphData]);

  // ── LPPLS: Sornette super-exponential fit to the same scoped Ω trajectory ──
  // Parameters (tc, ω, m) are optimised by coarse-to-fine grid search over the
  // observed window when n ≥ 5. The previously-used derived values are seeded
  // into the grid so the fit can never regress below the template.
  const lpplsData = useMemo(() => {
    const observed = scopedOmegaSeries;
    const n = observed.length;
    const N = graphData.nodes.length;
    const avgOmega = N > 0 ? graphData.nodes.reduce((s, nd) => s + nd.omegaFragility.composite, 0) / N : 0;
    const shockPressure = shocks.reduce((s, sh) => s + sh.severity, 0);
    // Seed phase from the previous panel-derived heuristic — the grid is
    // free to override but starts somewhere reasonable rather than at 0.
    const seedPhase = avgOmega * 0.3;

    // Template values that used to be used verbatim; now a seed into the grid.
    const seed = {
      tc: 1 + csdEpochs / Math.max(1, csdEpochs + 50),
      omega: 6.36 + shockPressure * 2.1,
      m: 0.33 + shockPressure * 0.1,
      phase: seedPhase,
    };

    if (n < 5) {
      // Not enough points to fit — show the seed curve over a 60-point preview.
      const modelPoints = lpplsSeries(60, seed.tc, seed.omega, seed.m, seedPhase);
      return {
        timeSeries: observed,
        modelSeries: modelPoints,
        observedSeries: undefined,
        confidence: 0,
        sampleSize: n,
        rSquared: 0,
        residualFit: 0,
        omega: seed.omega,
        m: seed.m,
        tc: seed.tc,
        phase: seedPhase,
        fitted: false as const,
        evaluations: 0,
      };
    }

    // Fit all four free parameters (tc, ω, m, φ). The seed phase carries the
    // panel's prior heuristic into the grid as a known-good starting point.
    const fit = fitLppls(observed, { seed });
    const samplePenalty = Math.min(1, n / 30);
    const confidence = Math.max(0, Math.min(0.99, fit.rSquared * samplePenalty));

    return {
      timeSeries: observed.length > 0 ? observed : fit.modelSeries,
      modelSeries: fit.modelSeries,
      observedSeries: observed,
      confidence,
      sampleSize: n,
      rSquared: fit.rSquared,
      residualFit: fit.rSquared,
      omega: fit.omega,
      m: fit.m,
      tc: fit.tc,
      phase: fit.phase,
      fitted: true as const,
      evaluations: fit.evaluations,
    };
  }, [scopedOmegaSeries, graphData.nodes, shocks, csdEpochs]);

  // ── BOCPD: Bayesian online change-point detection on the same Ω trajectory ──
  // Runs the run-length posterior over `scopedOmegaSeries` and exposes the
  // per-step new-run probability as the criticality readout. Same Adams &
  // MacKay (2007) implementation the discovery / calibration paths use —
  // imported lazily so this module's bundle stays sane.
  const bocpdData = useMemo(() => {
    const observed = scopedOmegaSeries;
    const n = observed.length;
    if (n < 6) {
      return {
        timeSeries: observed,
        modelSeries: undefined as number[] | undefined,
        observedSeries: observed.length > 0 ? observed : undefined,
        newRunProb: [] as number[],
        confidence: 0,
        sampleSize: n,
        peakRecent: 0,
        cv: 0,
      };
    }
    // Lazy import keeps bocpd out of the initial chunk if BOCPD is gated
    // off via the active profile's estimator list.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { bocpd } = require("@/lib/estimators/bocpd") as typeof import("@/lib/estimators/bocpd");
    const result = bocpd(observed, { hazard: 1 / 50 });
    const modelSeries = Array.from(result.predictiveMean);
    const newRunProb = Array.from(result.newRunProb);
    // Recent-window peak (matches bocpdRegimeGate semantics).
    const windowStart = Math.max(0, n - 10);
    let peakRecent = 0;
    for (let t = windowStart; t < n; t++) {
      if (newRunProb[t] > peakRecent) peakRecent = newRunProb[t];
    }
    // Coefficient of variation (variability over full posterior).
    let mean = 0;
    for (const v of newRunProb) mean += v;
    mean /= n;
    let varSum = 0;
    for (const v of newRunProb) varSum += (v - mean) ** 2;
    const std = Math.sqrt(varSum / n);
    const cv = mean > 0 ? std / mean : 0;
    return {
      timeSeries: observed,
      modelSeries,
      observedSeries: observed,
      newRunProb,
      confidence: Math.max(0, Math.min(0.99, peakRecent)),
      sampleSize: n,
      peakRecent,
      cv,
    };
  }, [scopedOmegaSeries]);

  // ── Relevance breakdown per model (F · E · G · S, smoothed via EMA) ──
  // Each ready estimator contributes an input. The composite replaces the
  // legacy per-model "confidence" badge and is broken out in the card UI so
  // every percentage is auditable.
  const prevCompositesRef = useRef<Map<string, number>>(new Map());
  const lastScopeLabelRef = useRef<string>("");
  const relevanceMap = useMemo<Map<string, RelevanceBreakdown>>(() => {
    // Reset EMA state when the scope changes — smoothing across different
    // node sets would mix unrelated signals.
    if (lastScopeLabelRef.current !== scopeLabel) {
      prevCompositesRef.current = new Map();
      lastScopeLabelRef.current = scopeLabel;
    }

    const inputs: ModelRelevanceInput[] = [];

    // ── Scope-aware sub-score inputs ───────────────────────────────
    // F and E already honor `scopedNodeIds` via `scopedOmegaSeries`
    // (the trajectory the live estimators fit against). G, S, and M
    // historically used the FULL graph, which made the relevance
    // composite only partially reactive to lasso selection — exactly
    // the gap the 2026-05-03 "per-selection model relevance"
    // directive was calling out ("it can change based off of what the
    // user selects using the Lasso tool, and it recalculates model
    // relevance accordingly"). Lifting them to scope here closes that
    // loop so all five sub-scores agree on what "the system under
    // analysis" actually is.
    //
    // `scopedNodeIds` already collapses the two cases:
    //   - Lasso active → user's selection
    //   - No lasso     → top-N risk nodes
    // So the relevance card is ALWAYS scoped, just to different
    // defaults depending on whether the user has lassoed anything.
    // S — edges that live entirely inside the scope (both endpoints
    // selected). Honors `isSevered` for post-cut analysis: a severed
    // edge no longer contributes to topology sufficiency. Extracted
    // into `inducedEdgeCount` so the math is unit-testable.
    const edgeCount = inducedEdgeCount(graphData.edges, scopedNodeIds);
    // G — node count for topology sufficiency, scoped to the user's
    // selection (or top-N fallback).
    const nodeCount = scopedNodeIds.length;

    // Always push live estimators into the relevance batch — even when the
    // trajectory is too thin to fit. The sub-score helpers handle insufficient
    // data internally (F → 0 with "need ≥5", E → 0 with "Insufficient data"),
    // so the breakdown UI renders consistently across all three tabs and the
    // user sees *why* a model can't score rather than a silent fallback.
    const csdObserved = csdData.observedSeries ?? csdData.timeSeries ?? [];
    inputs.push({
      key: "csd",
      observed: csdObserved,
      modelSeries: csdData.modelSeries ?? [],
      freeParams: 2, // α and μ
      gate: csdRegimeGate({
        observed: csdObserved,
        lambdaMax: csdData.lambdaMax,
      }),
      sufficiency: trajectorySufficiency(csdData.sampleSize, edgeCount),
    });

    if (phData.modelSeries) {
      inputs.push({
        key: "ph",
        observed: phData.timeSeries,
        modelSeries: phData.modelSeries,
        freeParams: 3, // riseExp, center, rate — fit by grid search in phData
        gate: phRegimeGate({
          betti1Curve: phData.timeSeries,
          componentCountAtMid: phData.componentCountAtMid ?? 0,
          nodeCount,
        }),
        sufficiency: topologySufficiency(nodeCount),
      });
    }

    // BOCPD — only included when the active profile actually requests it.
    // Same scoped Ω trajectory as CSD/LPPLS; F sub-score scores BOCPD's
    // posterior-predictive mean against the observed series.
    if (activeProfile.criticalityEstimators.includes("bocpd")) {
      const bocpdObserved = bocpdData.observedSeries ?? bocpdData.timeSeries ?? [];
      inputs.push({
        key: "bocpd",
        observed: bocpdObserved,
        modelSeries: bocpdData.modelSeries ?? [],
        // BOCPD effective parameter count: 4 NIG hyperparameters + 1 hazard.
        freeParams: 5,
        gate: bocpdRegimeGate({ newRunProb: bocpdData.newRunProb }),
        sufficiency: trajectorySufficiency(bocpdData.sampleSize, edgeCount),
      });
    }

    const lpplsObserved = lpplsData.observedSeries ?? lpplsData.timeSeries ?? [];
    const lpplsModel = lpplsData.modelSeries.slice(0, Math.max(lpplsObserved.length, 1));
    inputs.push({
      key: "lppls",
      observed: lpplsObserved,
      modelSeries: lpplsModel,
      freeParams: 3, // ω, m, tc
      gate: lpplsRegimeGate({
        observed: lpplsObserved,
        modelSeries: lpplsModel,
      }),
      sufficiency: trajectorySufficiency(lpplsData.sampleSize, edgeCount),
    });

    // M — spatial consistency. Computed once across all models from the
    // SCOPED adjacency (binary, symmetric, row-normalised) and per-node
    // ΩF composite values. Same Moran kernel the standalone Moran card
    // already uses, so the breakdown row matches the card by construction.
    //
    // Previously this was hardcoded to T1D_NODE_IDS — fine for T1D, but
    // for any other domain (geopolitical / AI-safety / multi-domain) it
    // was computing Moran on the WRONG subgraph. Now uses `scopedNodeIds`
    // so:
    //   - T1D profile with no selection → top-N T1D risk nodes (the
    //     ones the rest of the card already analyses)
    //   - Geopolitical profile           → top-N geopolitical risk nodes
    //   - Lasso active                   → the user's actual selection
    //
    // Moran needs n ≥ 3 to compute a meaningful I + permutation test.
    // Below that threshold spatialConsistency falls back to the neutral
    // M = 1.0 ("no evaluable graph"), which preserves the historical
    // behaviour at degenerate selections.
    const scopedValues: number[] = scopedNodeIds.map((nid) => {
      const gn = graphData.nodes.find((nd) => nd.id === nid);
      return gn?.omegaFragility.composite ?? 0;
    });
    const scopedAdjacency = buildScopedAdjacency(
      graphData.edges,
      scopedNodeIds,
    );
    const consistency = spatialConsistency(
      { values: scopedValues, adjacency: scopedAdjacency },
      moransI,
    );

    const result = bootstrapRelevanceBatch(inputs, {
      previous: prevCompositesRef.current,
      bootstrap: { samples: 200, level: 0.9 },
      consistency,
    });
    // Persist composites for the next render's EMA seed.
    for (const [key, breakdown] of result) {
      prevCompositesRef.current.set(key, breakdown.composite);
    }
    return result;
  }, [csdData, phData, lpplsData, bocpdData, graphData.edges, graphData.nodes, scopeLabel, activeProfile, scopedNodeIds]);

  const paretoSectionExpanded = expandedChart === "pareto";

  return (
    <>
      {/* Criticality model selector — one at a time */}
      <div className="flex items-baseline justify-between gap-2">
        <div className="font-[family-name:var(--font-michroma)] text-[10px] tracking-wider text-text-muted">
          CRITICALITY HORIZON
        </div>
        <div className="font-mono text-[8px] text-text-muted/70 truncate">
          scope: {scopeLabel} · n={scopedOmegaSeries.length}
        </div>
      </div>
      {(() => {
        // Build a descriptor per active-profile estimator. "Ready" engines
        // (CSD/PH/LPPLS) get their live graph-derived methodology text;
        // data-hungry estimators fall back to the registry's placeholder
        // content + an explicit empty-state panel.
        type ModelDescriptor = {
          key: EstimatorId;
          abbrev: string;
          fullName: string;
          epochs: number;
          maxEpochs: number;
          color: string;
          confidence: number;
          /** Full F·E·G·S breakdown when the model is in the relevance batch. */
          relevance?: RelevanceBreakdown;
          timeSeries: number[];
          modelSeries: number[] | undefined;
          shortDesc: string;
          methodology: string[];
          formula: string;
          assessment: string;
          emptyState?: CriticalityEmptyState;
        };

        const models: ModelDescriptor[] = activeProfile.criticalityEstimators.map((id) => {
          const meta = getEstimatorMeta(id);
          if (id === "csd") {
            const rel = relevanceMap.get("csd");
            return {
              key: "csd",
              abbrev: "CSD",
              fullName: "CRITICAL SLOWING DOWN",
              epochs: csdEpochs,
              maxEpochs: 200,
              color: getCritColor(csdEpochs),
              confidence: rel ? rel.composite : csdData.confidence,
              relevance: rel,
              timeSeries: csdData.timeSeries,
              modelSeries: csdData.observedSeries ? csdData.modelSeries : undefined,
              shortDesc: meta.shortDesc,
              methodology: [
                `Fits an AR(1) autoregression x_{t+1} = \u03B1\u00B7x_t + (1\u2212\u03B1)\u00B7\u03BC to the mean \u03A9-composite trajectory across the ${scopeLabel} (the same series shown in the bottom \u03A9F TIME SERIES cards). As a system approaches a tipping point, perturbations decay more slowly \u2192 \u03B1 \u2192 1 (Scheffer et al. 2009).`,
                `Sample size n = ${csdData.sampleSize}. ${csdData.sampleSize >= 5 ? `Estimated lag-1 autocorrelation \u03B1 = ${csdData.alpha.toFixed(3)}; AR(1) one-step-ahead R\u00B2 = ${(csdData.rSquared * 100).toFixed(1)}%. Confidence = R\u00B2 \u00D7 min(1, n/30) penalises under-sampled fits.` : `Need \u22655 observations to estimate \u03B1 \u2014 run the temporal replay to populate the trajectory.`}`,
                `Spectral context: \u03BBmax = ${csdData.lambdaMax.toFixed(3)} from the live weighted adjacency (${graphData.edges.length} edges). Solid line: observed \u03A9 trajectory. Dashed line: AR(1) one-step-ahead forecast.`,
              ],
              formula: `\u03B1 = ${Number.isFinite(csdData.alpha) ? csdData.alpha.toFixed(3) : "\u2014"} | R\u00B2 = ${(csdData.rSquared * 100).toFixed(1)}% | n = ${csdData.sampleSize} | \u03BBmax = ${csdData.lambdaMax.toFixed(3)}`,
              assessment: csdData.sampleSize < 5
                ? `INSUFFICIENT DATA \u2014 only ${csdData.sampleSize} observation(s) in the scoped \u03A9 trajectory. Trigger a temporal replay or widen the selection to populate the AR(1) fit window.`
                : `${csdData.alpha >= 0.95 ? "CRITICAL" : csdData.alpha >= 0.8 ? "Near-critical" : "Subcritical"} \u2014 AR(1) \u03B1 = ${csdData.alpha.toFixed(3)} on n=${csdData.sampleSize}. ${csdData.alpha >= 0.95 ? "Perturbations barely decay; recovery time diverges." : csdData.alpha >= 0.8 ? "Autocorrelation rising \u2014 early-warning signature active." : "Adequate recovery rate; no slowing-down signature."} Spectral \u03BBmax = ${csdData.lambdaMax.toFixed(3)} corroborates from graph structure.`,
            };
          }
          if (id === "ph") {
            const rel = relevanceMap.get("ph");
            return {
              key: "ph",
              abbrev: "PH",
              fullName: "PERSISTENT HOMOLOGY",
              epochs: phEpochs,
              maxEpochs: 300,
              color: getCritColor(phEpochs),
              confidence: rel ? rel.composite : phData.confidence,
              relevance: rel,
              timeSeries: phData.timeSeries,
              modelSeries: phData.modelSeries,
              shortDesc: meta.shortDesc,
              methodology: [
                `Sweeps a filtration threshold \u03B5 from 0\u219210 across all ${graphData.nodes.length} nodes. At each \u03B5, nodes with \u03A9 \u2264 \u03B5 and their connecting edges form a simplicial complex. Solid line: computed filtration. Dashed line: fitted \u03B2\u2081 collapse template.`,
                `Computes \u03B2\u2080 (connected components via union-find) and \u03B2\u2081 (1-cycles via Euler characteristic: \u03B2\u2081 \u2248 E \u2212 V + \u03B2\u2080) at each filtration step \u2014 showing how topological holes appear and collapse.`,
                `Template \u03B2\u2081(t) = amp \u00B7 t^riseExp \u00B7 (1 + clusterFrac \u00B7 0.5) \u00B7 exp(\u2212rate \u00B7 max(0, t \u2212 center)\u00B2) fit by grid search to the empirical \u03B2\u2081 curve over 60 filtration steps (${phData.evaluations} evaluations). Fit R\u00B2 = ${(phData.fitRSquared * 100).toFixed(1)}% at riseExp=${phData.riseExp.toFixed(2)}, center=${phData.center.toFixed(2)}, rate=${phData.rate.toFixed(2)}. Cluster-coupling (${(phData.clusterFrac * 100).toFixed(0)}% of nodes above \u03A9 > 7.0) stays structural.`,
              ],
              formula: `\u03B2\u2081 = |E| \u2212 |V| + \u03B2\u2080 | template fit: riseExp=${phData.riseExp.toFixed(2)}, center=${phData.center.toFixed(2)}, rate=${phData.rate.toFixed(2)} | R\u00B2 = ${(phData.fitRSquared * 100).toFixed(1)}%`,
              assessment: `Real filtration over ${graphData.nodes.length} nodes and ${graphData.edges.filter((e) => !e.isSevered).length} active edges. \u03A9 range: [${Math.min(...graphData.nodes.map((n) => n.omegaFragility.composite)).toFixed(1)}, ${Math.max(...graphData.nodes.map((n) => n.omegaFragility.composite)).toFixed(1)}]. Template fit R\u00B2 = ${(phData.fitRSquared * 100).toFixed(1)}% on \u03B2\u2081 curve (${phData.evaluations} grid evaluations); ${phData.fitRSquared > 0.6 ? "template tracks empirical holes well \u2014 topology has a clear rise-and-collapse structure." : phData.fitRSquared > 0.3 ? "partial template match \u2014 real filtration has structure the template doesn't capture." : "weak template match \u2014 empirical \u03B2\u2081 doesn't follow the rise-collapse shape."}`,
            };
          }
          if (id === "lppls") {
            const rel = relevanceMap.get("lppls");
            return {
              key: "lppls",
              abbrev: "LPPLS",
              fullName: "LOG-PERIODIC POWER LAW SINGULARITY",
              epochs: lpplsEpochs,
              maxEpochs: 250,
              color: getCritColor(lpplsEpochs),
              confidence: rel ? rel.composite : lpplsData.confidence,
              relevance: rel,
              timeSeries: lpplsData.timeSeries,
              modelSeries: lpplsData.modelSeries,
              shortDesc: meta.shortDesc,
              methodology: [
                `Fits the LPPLS model y(t) = A + B(tc\u2212t)^m \u00B7 [1 + C\u00B7cos(\u03C9\u00B7ln(tc\u2212t) + \u03C6)] (Sornette 2003) to the same scoped mean-\u03A9 trajectory as CSD \u2014 ${scopeLabel}, n=${lpplsData.sampleSize}.`,
                `${lpplsData.sampleSize >= 5 ? `(tc, \u03C9, m, \u03C6) fit by coarse-to-fine grid search minimising SSE (${lpplsData.evaluations} evaluations). R\u00B2 = ${(lpplsData.rSquared * 100).toFixed(1)}% between observed and fitted LPPLS. ${lpplsData.rSquared > 0.6 ? "Strong LPPLS signature." : lpplsData.rSquared > 0.3 ? "Moderate LPPLS pattern." : "Weak fit \u2014 trajectory may not follow LPPLS dynamics."}` : `Need \u22655 observations to fit \u2014 dashed line is the seed curve only (tc from CSD countdown, \u03C9/m from shock pressure, \u03C6 seeded from graph fragility).`}`,
                `Free parameters: tc (critical time), \u03C9 (angular frequency), m (power-law exponent), \u03C6 (phase \u2208 [\u2212\u03C0, \u03C0]). A=1, B=\u22121, C=0.2 held fixed. \u03C6 is now data-fit instead of hardcoded \u2014 the grid finds the actual best alignment of the log-periodic oscillation against the observed trajectory. Increasing-frequency oscillations signal an approaching regime transition.`,
              ],
              formula: `\u03C9 = ${lpplsData.omega.toFixed(2)} | m = ${lpplsData.m.toFixed(3)} | tc = ${lpplsData.tc.toFixed(3)} | \u03C6 = ${lpplsData.phase.toFixed(2)} rad${lpplsData.fitted ? " (fit)" : " (seed)"} | ${lpplsData.sampleSize >= 5 ? `R\u00B2 = ${(lpplsData.rSquared * 100).toFixed(1)}% (n=${lpplsData.sampleSize})` : `R\u00B2 = \u2014 (n=${lpplsData.sampleSize}, need \u22655)`}`,
              assessment: lpplsData.sampleSize < 5
                ? `INSUFFICIENT DATA \u2014 only ${lpplsData.sampleSize} observation(s). Run a temporal replay or widen the selection to fit the LPPLS curve.`
                : `LPPLS fit R\u00B2 = ${(lpplsData.rSquared * 100).toFixed(1)}% on n=${lpplsData.sampleSize} (${lpplsData.evaluations} grid evaluations). ${lpplsData.rSquared > 0.6 ? "Trajectory exhibits super-exponential growth with log-periodic structure \u2014 bubble-like dynamics detected." : lpplsData.rSquared > 0.3 ? "Partial LPPLS pattern; system may be entering the pre-critical regime." : "Weak LPPLS signature \u2014 trajectory does not yet match super-exponential growth."} Fit tc = ${lpplsData.tc.toFixed(3)} (fraction of window), \u03C9 = ${lpplsData.omega.toFixed(2)} rad, m = ${lpplsData.m.toFixed(3)}, \u03C6 = ${lpplsData.phase.toFixed(2)} rad.`,
            };
          }
          // ── BOCPD (live as a fourth criticality estimator on the
          // scoped Ω trajectory — same series CSD/LPPLS use) ──────────
          if (id === "bocpd") {
            const rel = relevanceMap.get("bocpd");
            const bocpdEpochs = Math.max(
              0,
              Math.round((1 - bocpdData.peakRecent) * 200),
            );
            return {
              key: "bocpd",
              abbrev: meta.abbrev,
              fullName: meta.fullName,
              epochs: bocpdEpochs,
              maxEpochs: 200,
              color: getCritColor(bocpdEpochs),
              confidence: rel ? rel.composite : bocpdData.confidence,
              relevance: rel,
              timeSeries: bocpdData.timeSeries,
              modelSeries: bocpdData.modelSeries,
              shortDesc: meta.shortDesc,
              methodology: [
                `Adams & MacKay (2007) Bayesian Online Change-Point Detection on the same scoped mean-Ω trajectory as CSD / LPPLS (${scopeLabel}, n=${bocpdData.sampleSize}). Normal-Inverse-Gamma conjugate prior on (mean, variance) of Gaussian observations; tracks the run-length posterior P(r_t = k) at each step.`,
                `Solid line: observed Ω trajectory. Dashed line: BOCPD's posterior-predictive mean E[x_{t+1} | x_{1:t}]. The criticality readout is `+
                  `peakRecent — the maximum P(new run) over the trailing 10 steps — currently ${bocpdData.peakRecent.toFixed(3)}. CV of newRunProb across the full trace: ${bocpdData.cv.toFixed(3)}.`,
                `Same kernel runs on D1NAMO CGM in the SPIRTES module's bocpd-hypo-calibration tab (8,300+ samples across 9 T1D subjects, AUROC 0.679 against hypoglycemic events). Here the same estimator scores Ω regime-shift activity on whatever trajectory the active scope produces.`,
              ],
              formula: `peakRecent = ${bocpdData.peakRecent.toFixed(3)} | CV = ${bocpdData.cv.toFixed(3)} | hazard = 1/50 | n = ${bocpdData.sampleSize}`,
              assessment: bocpdData.sampleSize < 6
                ? `INSUFFICIENT DATA — only ${bocpdData.sampleSize} observation(s) in the scoped Ω trajectory. BOCPD needs ≥6 to fit a meaningful posterior. Trigger a temporal replay or widen the selection.`
                : `${bocpdData.peakRecent >= 0.5 ? "REGIME-CHANGE ACTIVE" : bocpdData.peakRecent >= 0.2 ? "Elevated regime-change probability" : "Stable regime"} — recent-window peak P(new run) = ${bocpdData.peakRecent.toFixed(3)} over the trailing 10 of n=${bocpdData.sampleSize} steps. Posterior variability CV = ${bocpdData.cv.toFixed(3)}; ${bocpdData.cv >= 0.5 ? "trace shows clear rises and falls — BOCPD has structure to detect." : "trace is flat — BOCPD is contributing little beyond its prior."}`,
            };
          }
          // ── TRANSFER ENTROPY ────────────────────────────────────────
          if (id === "transfer-entropy") {
            const t1dSeries = extractT1DSeries(temporalData);
            const lengths = T1D_NODE_IDS.map((nid) => ({
              nid,
              n: t1dSeries.get(nid)?.values.length ?? 0,
              src: t1dSeries.get(nid)?.source,
            }));
            const sorted = [...lengths].sort((a, b) => b.n - a.n);
            const [best1, best2] = sorted;
            const inputs = `Transfer Entropy requires ≥50 observations on both X and Y series.\n` +
              `Best X series: ${best1?.nid ?? "none"} → ${best1?.n ?? 0}pt` +
              (best1?.src ? ` (${best1.src})` : "") + `\n` +
              `Best Y series: ${best2?.nid ?? "none"} → ${best2?.n ?? 0}pt` +
              (best2?.src ? ` (${best2.src})` : "") + `\n` +
              `All series: ${lengths.map((l) => `${l.nid}:${l.n}`).join(", ")}`;
            return {
              key: "transfer-entropy",
              abbrev: meta.abbrev,
              fullName: meta.fullName,
              epochs: 0,
              maxEpochs: 1,
              color: meta.color,
              confidence: 0,
              timeSeries: [],
              modelSeries: undefined,
              shortDesc: meta.shortDesc,
              methodology: meta.methodology,
              formula: `INSUFFICIENT DATA — need ≥50 pts on both series; have ${best1?.n ?? 0}(x) / ${best2?.n ?? 0}(y)`,
              assessment: `INSUFFICIENT DATA — Transfer Entropy (Schreiber 2000) requires ≥50 observations on both the source (X) and target (Y) series for the binning estimator to be well-conditioned. Longest T1D series currently: ${best1?.n ?? 0} point(s). Card remains visible; will activate when paired T1D series reach ≥50 points each.`,
              emptyState: { kind: "awaiting-data" as const, inputs },
            };
          }
          // ── MORAN'S I ────────────────────────────────────────────────
          if (id === "moran") {
            // Build weight matrix from graph edges.  Use binary adjacency
            // (0/1) derived from the live edge list, then row-normalise.
            const t1dNodeIds = T1D_NODE_IDS;
            const n = t1dNodeIds.length;
            try {
              // Collect current omegaFragility.composite per T1D node from graphData.
              const values: number[] = t1dNodeIds.map((nid) => {
                const gn = graphData.nodes.find((nd) => nd.id === nid);
                return gn?.omegaFragility.composite ?? 0;
              });

              // Build adjacency from graphData.edges restricted to T1D×T1D pairs.
              const idxOf = (nid: string) => t1dNodeIds.indexOf(nid);
              const W: number[][] = Array.from({ length: n }, () =>
                new Array(n).fill(0),
              );
              let edgeCount = 0;
              for (const e of graphData.edges) {
                if (e.isSevered) continue;
                const si = idxOf(e.source);
                const ti = idxOf(e.target);
                if (si >= 0 && ti >= 0) {
                  W[si][ti] = 1;
                  W[ti][si] = 1;
                  edgeCount++;
                }
              }

              // Compute S0 to check if graph has any structure.
              let S0 = 0;
              for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) S0 += W[i][j];

              if (S0 === 0) {
                // No edges connect T1D nodes — matrix is all zeros, Moran's I
                // undefined.  Fall through to insufficient-graph-structure.
                throw new Error("no_edges");
              }

              // Row-normalise.
              const Wn: number[][] = W.map((row) => {
                const rowSum = row.reduce((a, b) => a + b, 0);
                return rowSum > 0 ? row.map((v) => v / rowSum) : row;
              });

              const result = moransI(values, Wn, { nPermutations: 199, seed: 42 });
              const I = result.I;
              const E = result.expected;
              const n7 = n; // for z-score approximation
              // Analytical z-score under randomisation: approximate
              // Var(I) ≈ 1/(n-1) (rough first-order); use permutation p instead.
              const pPerm = result.pPerm;
              // Convert permutation p to rough z: z ≈ Φ⁻¹(1 - pPerm/2)
              // Simple threshold-based labeling instead of full quantile.
              const assessment =
                pPerm < 0.05 && I > E
                  ? "Positive spatial autocorrelation — high-fragility T1D nodes cluster together in the graph (p < 0.05 permutation)."
                  : pPerm < 0.05 && I < E
                  ? "Negative spatial autocorrelation (dispersed) — high-fragility and low-fragility T1D nodes alternate in the graph (p < 0.05 permutation)."
                  : `Random pattern — no significant spatial autocorrelation among T1D nodes (permutation p = ${pPerm.toFixed(2)}).`;

              return {
                key: "moran",
                abbrev: meta.abbrev,
                fullName: meta.fullName,
                epochs: Math.round(Math.abs(I) * 100),
                maxEpochs: 100,
                color: meta.color,
                confidence: pPerm < 0.05 ? 1 - pPerm : 0.3,
                timeSeries: [],
                modelSeries: undefined,
                shortDesc: meta.shortDesc,
                methodology: [
                  `Global Moran's I measures spatial autocorrelation of Ω-fragility scores across the ${n7} T1D nodes using the live adjacency graph (${edgeCount} intra-T1D edge(s) found).`,
                  `Weight matrix W is row-normalised binary adjacency restricted to T1D×T1D edges. S₀ = Σ_ij W_ij = ${S0.toFixed(1)}. Values used: omegaFragility.composite per node.`,
                  `Statistical significance assessed via ${result.nPermutations} random permutations of node labels. Under the null (random arrangement), I ~ E[I] = ${E.toFixed(4)}.`,
                ],
                formula: `Moran's I = N / S₀ · (z^T W z) / (z^T z) = ${I.toFixed(4)} | E[I] = ${E.toFixed(4)} | p_perm = ${pPerm.toFixed(3)} | n = ${n7}, S₀ = ${S0.toFixed(1)}`,
                assessment,
              };
            } catch {
              return {
                key: "moran",
                abbrev: meta.abbrev,
                fullName: meta.fullName,
                epochs: 0,
                maxEpochs: 1,
                color: meta.color,
                confidence: 0,
                timeSeries: [],
                modelSeries: undefined,
                shortDesc: meta.shortDesc,
                methodology: meta.methodology,
                formula: "Moran's I = N / S₀ · (z^T W z) / (z^T z)",
                assessment: "INSUFFICIENT GRAPH STRUCTURE — no edges connect T1D nodes in the current graph. Moran's I requires at least one adjacency link between T1D nodes.",
                emptyState: {
                  kind: "awaiting-data" as const,
                  inputs: "Moran's I requires at least one edge between T1D nodes in the causal graph. Load the T1D domain and ensure edges are present.",
                },
              };
            }
          }
          // Estimator has a static-registry entry with no live runtime yet:
          // render the card in an empty state that still teaches what the
          // method does and which inputs it needs.
          const emptyState: CriticalityEmptyState =
            meta.defaultAvailability === "pending-port"
              ? { kind: "pending-port", reference: meta.pythonReference ?? "research/estimators/" }
              : { kind: "awaiting-data", inputs: meta.requiredInputs ?? "Not yet specified." };
          return {
            key: id,
            abbrev: meta.abbrev,
            fullName: meta.fullName,
            epochs: 0,
            maxEpochs: 1,
            color: meta.color,
            confidence: 0,
            timeSeries: [],
            modelSeries: undefined,
            shortDesc: meta.shortDesc,
            methodology: meta.methodology,
            formula: meta.formula,
            assessment: meta.placeholderAssessment,
            emptyState,
          };
        });

        const selected = models.find((m) => m.key === selectedCrit) ?? models[0];
        return (
          <>
            <div className="flex gap-1">
              {models.map((m) => {
                const active = m.key === selectedCrit;
                return (
                  <button
                    key={m.key}
                    onClick={() => setSelectedCrit(m.key)}
                    className="flex-1 min-w-0 p-1.5 rounded border text-left transition-all"
                    style={{
                      borderColor: active ? m.color : `${m.color}25`,
                      backgroundColor: active ? `${m.color}12` : `${m.color}04`,
                    }}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span
                        className="text-[9px] font-[family-name:var(--font-michroma)] tracking-wider truncate"
                        style={{ color: m.color }}
                      >
                        {m.abbrev}
                      </span>
                      <span
                        className="text-[10px] font-[family-name:var(--font-michroma)] tabular-nums font-bold leading-none shrink-0"
                        style={{ color: m.color }}
                      >
                        {m.emptyState ? "T\u2013\u2013" : `T-${m.epochs}`}
                      </span>
                    </div>
                    <div className="h-0.5 mt-1 w-full bg-border rounded overflow-hidden">
                      <div
                        className="h-full transition-all duration-500"
                        style={{
                          width: m.emptyState ? "0%" : `${Math.min(100, (m.epochs / m.maxEpochs) * 100)}%`,
                          backgroundColor: m.color,
                          opacity: 0.8,
                        }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
            <CriticalityCard
              key={selected.key}
              abbrev={selected.abbrev}
              fullName={selected.fullName}
              epochs={selected.epochs}
              maxEpochs={selected.maxEpochs}
              color={selected.color}
              expanded={true}
              onToggle={() => {}}
              timeSeries={selected.timeSeries}
              modelSeries={selected.modelSeries}
              chartExpanded={paretoSectionExpanded}
              confidence={selected.confidence}
              relevance={selected.relevance}
              referenceLookup={
                relevanceReference && selected.relevance
                  ? lookupRelevanceReference(
                      relevanceReference,
                      selected.relevance.F.score,
                    )
                  : null
              }
              shortDesc={selected.shortDesc}
              methodology={selected.methodology}
              formula={selected.formula}
              assessment={selected.assessment}
              emptyState={selected.emptyState}
            />
          </>
        );
      })()}

      {/* Snapshot Diagnostics — Tail (CVaR-W₁) + Topology (χ★).
          Whole-system readouts on the live filtered graph, separate
          from the time-series criticality strip above. */}
      <div className="mt-3 pt-3 border-t border-border/50">
        <SnapshotDiagnostics />
      </div>

      {/* Ω-Fragility Ranking — collapsible, default closed */}
      <div className="mt-3">
        <button
          onClick={() => setTopNodesOpen((v) => !v)}
          className="w-full flex items-center justify-between mb-2 hover:brightness-125 transition-all"
        >
          <span className="font-[family-name:var(--font-michroma)] text-[9px] tracking-wider text-text-muted">
            TOP {"\u03A9"}-CRITICAL NODES{" "}
            <span className="text-text-muted/60">({topNodes.length})</span>
          </span>
          <span
            className="text-[10px] text-text-muted transition-transform duration-200"
            style={{ transform: topNodesOpen ? "rotate(180deg)" : "rotate(0deg)" }}
          >
            {"\u25BC"}
          </span>
        </button>
        {topNodesOpen && (
        <div className="space-y-1.5">
          {topNodes.map((node, i) => {
            const score = node.omegaFragility.composite;
            const domainColor = getDomainColor(node.domain);
            const scoreColor = score > 9 ? "#ff1744" : score >= 7 ? "#ffab00" : "#00e676";
            const isActive = selectedNode === node.id;
            return (
              <div
                key={node.id}
                className="text-[9px] font-mono p-1.5 border rounded flex items-center gap-2 cursor-pointer transition-colors"
                style={{
                  borderColor: isActive ? "var(--accent-cyan)" : `${scoreColor}30`,
                  backgroundColor: isActive ? "rgba(0,229,255,0.08)" : `${scoreColor}05`,
                }}
                onClick={() => setSelectedNode(isActive ? null : node.id)}
              >
                <span className="text-text-muted w-3">{i + 1}.</span>
                <span className="font-bold" style={{ color: scoreColor }}>
                  {score.toFixed(1)}
                </span>
                <span className="text-text-muted flex-1 truncate">{node.label}</span>
                <span
                  className="text-[7px] px-1 rounded"
                  style={{ color: domainColor, backgroundColor: `${domainColor}15` }}
                >
                  {node.domain}
                </span>
              </div>
            );
          })}
        </div>
        )}
      </div>

      {shocks.length > 0 && (
        <div className="space-y-1 mt-3">
          <div className="font-[family-name:var(--font-michroma)] text-[9px] tracking-wider text-text-muted mb-1">
            ACTIVE SCENARIOS
          </div>
          {shocks.map((s) => (
            <div
              key={s.id}
              className="text-[9px] font-mono p-1.5 border border-accent-red/20 rounded bg-accent-red/5 text-accent-red flex items-center justify-between"
            >
              <span>{s.name} — SEV: {(s.severity * 100).toFixed(0)}%</span>
              <button
                onClick={() => removeShock(s.id)}
                className="text-[8px] opacity-60 hover:opacity-100 transition-opacity ml-2"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Scenario injection (preset shock buttons) intentionally
          removed from PARETO. PEARL's `ScenarioInput` is now the
          canonical scenario entry — either NL ("simulate a Hormuz
          closure") routed through the copilot's `solve_interdiction`
          tool, or `add_shock` invoked directly from chat. PARETO is
          purely the sensing layer: it shows how criticality estimators
          read against whatever shock state is in the store, no matter
          how it got there. The ACTIVE SCENARIOS readout above stays
          so an analyst working on PARETO can see + dismiss active
          shocks without context-switching to PEARL. */}
    </>
  );
}


function CritSparklineChart({
  data,
  modelData,
  color,
  width,
  height,
  hoverIndex,
  scaledFont,
}: {
  data: number[];
  modelData?: number[];
  color: string;
  width: number;
  height: number;
  hoverIndex: number | null;
  scaledFont?: number;
}) {
  const fs = scaledFont ?? 6;
  const padX = Math.round(width * 0.08);
  const padTop = Math.round(height * 0.1);
  const padBottom = Math.round(height * 0.12);
  const chartW = width - padX * 2;
  const chartH = height - padTop - padBottom;

  const toPoints = (arr: number[]) =>
    arr.map((v, i) => {
      const x = padX + (i / (arr.length - 1)) * chartW;
      const y = padTop + (1 - v) * chartH;
      return `${x},${y}`;
    });

  const pts = toPoints(data);
  const line = pts.join(" ");
  const area = `${padX},${padTop + chartH} ${line} ${padX + chartW},${padTop + chartH}`;

  const modelPts = modelData ? toPoints(modelData) : null;
  const modelLine = modelPts ? modelPts.join(" ") : null;

  const yTicks = [0, 0.25, 0.5, 0.75, 1.0];

  return (
    <>
      {/* Background */}
      <rect x={padX} y={padTop} width={chartW} height={chartH} fill="rgba(0,0,0,0.2)" rx={2} />

      {/* Grid lines + Y-axis labels */}
      {yTicks.map((frac) => {
        const y = padTop + (1 - frac) * chartH;
        return (
          <g key={frac}>
            <line x1={padX} y1={y} x2={padX + chartW} y2={y} stroke="rgba(90,94,114,0.2)" strokeWidth={0.5} />
            <text x={padX - 3} y={y + fs * 0.5} fontSize={fs} fill="rgba(90,94,114,0.6)" fontFamily="monospace" textAnchor="end">
              {frac.toFixed(2)}
            </text>
          </g>
        );
      })}

      {/* Vertical grid lines */}
      {[0.25, 0.5, 0.75].map((frac) => (
        <line key={`v${frac}`} x1={padX + frac * chartW} y1={padTop} x2={padX + frac * chartW} y2={padTop + chartH} stroke="rgba(90,94,114,0.1)" strokeWidth={0.5} />
      ))}

      {/* Critical threshold */}
      <line x1={padX} y1={padTop} x2={padX + chartW} y2={padTop} stroke="#ff174440" strokeWidth={1} strokeDasharray="3,3" />
      <text x={padX + chartW + 2} y={padTop + fs * 0.6} fontSize={fs * 0.9} fill="#ff174480" fontFamily="monospace">crit</text>

      {/* Area fill */}
      <polygon points={area} fill={color} opacity={0.06} />

      {/* Model line (dashed) */}
      {modelLine && (
        <polyline points={modelLine} fill="none" stroke={color} strokeWidth={1} opacity={0.4} strokeDasharray="4,3" />
      )}

      {/* Observed line (solid) */}
      <polyline points={line} fill="none" stroke={color} strokeWidth={1.8} opacity={0.85} />

      {/* Current value dot */}
      {data.length > 0 && (
        <circle cx={padX + chartW} cy={padTop + (1 - data[data.length - 1]) * chartH} r={3} fill={color} opacity={0.9} />
      )}

      {/* Current value label */}
      {data.length > 0 && (
        <text
          x={padX + chartW - 1}
          y={Math.max(padTop + fs + 2, padTop + (1 - data[data.length - 1]) * chartH - 4)}
          fontSize={fs + 1}
          fill={color}
          fontFamily="monospace"
          textAnchor="end"
        >
          {data[data.length - 1].toFixed(3)}
        </text>
      )}

      {/* X-axis labels */}
      <text x={padX} y={height - 3} fontSize={fs + 0.5} fill="rgba(90,94,114,0.6)" fontFamily="monospace">t=0</text>
      <text x={padX + chartW} y={height - 3} fontSize={fs + 0.5} fill="rgba(90,94,114,0.6)" fontFamily="monospace" textAnchor="end">now</text>

      {/* Legend */}
      {modelData && (
        <g>
          <line x1={padX} y1={fs} x2={padX + 12} y2={fs} stroke={color} strokeWidth={1.8} opacity={0.85} />
          <text x={padX + 15} y={fs + 2} fontSize={fs} fill="rgba(90,94,114,0.7)" fontFamily="monospace">observed</text>
          <line x1={padX + 58} y1={fs} x2={padX + 70} y2={fs} stroke={color} strokeWidth={1} opacity={0.4} strokeDasharray="4,3" />
          <text x={padX + 73} y={fs + 2} fontSize={fs} fill="rgba(90,94,114,0.7)" fontFamily="monospace">model</text>
        </g>
      )}

      {/* Hover crosshair + tooltip */}
      {hoverIndex !== null && hoverIndex >= 0 && hoverIndex < data.length && (
        (() => {
          const hx = padX + (hoverIndex / (data.length - 1)) * chartW;
          const hy = padTop + (1 - data[hoverIndex]) * chartH;
          const modelVal = modelData?.[hoverIndex];
          const modelY = modelVal != null ? padTop + (1 - modelVal) * chartH : null;
          const tooltipW = 72;
          const tooltipH = modelVal != null ? 38 : 24;
          const tooltipX = hx + tooltipW + 8 > padX + chartW ? hx - tooltipW - 8 : hx + 8;
          const tooltipY = Math.max(padTop, Math.min(padTop + chartH - tooltipH, hy - tooltipH / 2));
          return (
            <g>
              {/* Vertical crosshair */}
              <line x1={hx} y1={padTop} x2={hx} y2={padTop + chartH} stroke={color} strokeWidth={0.7} opacity={0.5} strokeDasharray="2,2" />
              {/* Observed dot */}
              <circle cx={hx} cy={hy} r={3.5} fill={color} opacity={0.9} />
              {/* Model dot */}
              {modelY !== null && <circle cx={hx} cy={modelY} r={2.5} fill={color} opacity={0.4} />}
              {/* Tooltip background */}
              <rect x={tooltipX} y={tooltipY} width={tooltipW} height={tooltipH} rx={3} fill="rgba(10,11,16,0.92)" stroke={`${color}40`} strokeWidth={0.5} />
              {/* Tooltip text */}
              <text x={tooltipX + 4} y={tooltipY + fs + 4} fontSize={fs + 0.5} fill={color} fontFamily="monospace" fontWeight="bold">
                t={hoverIndex}/{data.length - 1}
              </text>
              <text x={tooltipX + 4} y={tooltipY + fs * 2 + 8} fontSize={fs} fill="rgba(200,205,220,0.9)" fontFamily="monospace">
                obs: {data[hoverIndex].toFixed(4)}
              </text>
              {modelVal != null && (
                <text x={tooltipX + 4} y={tooltipY + fs * 3 + 12} fontSize={fs} fill="rgba(200,205,220,0.6)" fontFamily="monospace">
                  mdl: {modelVal.toFixed(4)}
                </text>
              )}
            </g>
          );
        })()
      )}
    </>
  );
}

function CritSparkline({
  data,
  modelData,
  color,
  height = 120,
  abbrev,
  fullName,
  formula,
  isExpanded,
}: {
  data: number[];
  modelData?: number[];
  color: string;
  height?: number;
  abbrev?: string;
  fullName?: string;
  formula?: string;
  isExpanded?: boolean;
}) {
  const svgW = isExpanded ? 580 : 300;
  const svgH = height;
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const padX = Math.round(svgW * 0.08);
      const chartW = svgW - padX * 2;
      const svgX = ((e.clientX - rect.left) / rect.width) * svgW;
      const frac = (svgX - padX) / chartW;
      if (frac < 0 || frac > 1) { setHoverIndex(null); return; }
      const idx = Math.round(frac * (data.length - 1));
      setHoverIndex(Math.max(0, Math.min(data.length - 1, idx)));
    },
    [data.length, svgW],
  );

  return (
    <div>
      <svg
        width="100%"
        viewBox={`0 0 ${svgW} ${svgH}`}
        preserveAspectRatio="xMidYMid meet"
        className="rounded cursor-crosshair"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverIndex(null)}
      >
        <CritSparklineChart
          data={data}
          modelData={modelData}
          color={color}
          width={svgW}
          height={svgH}
          hoverIndex={hoverIndex}
          scaledFont={isExpanded ? 8 : 6}
        />
      </svg>

      {/* Hover data readout — shown below chart */}
      {hoverIndex !== null && (
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[8px] font-mono text-text-muted px-1">
          <span>t={hoverIndex}/{data.length - 1}</span>
          <span>obs: <span style={{ color }}>{data[hoverIndex]?.toFixed(4)}</span></span>
          {modelData && <span>mdl: <span style={{ color, opacity: 0.6 }}>{modelData[hoverIndex]?.toFixed(4)}</span></span>}
          {modelData && (
            <span>Δ: <span className="text-foreground">{Math.abs(data[hoverIndex] - (modelData[hoverIndex] ?? 0)).toFixed(4)}</span></span>
          )}
        </div>
      )}
    </div>
  );
}

function shortenEventLabel(full: string): string {
  const lower = full.toLowerCase();
  if (lower.includes("node-critical") || lower.includes("max-Ω") || lower.includes("max-omega"))
    return "node-critical rate";
  if (lower.includes("buffer") && lower.includes("critical")) return "buffer-critical rate";
  if (lower.includes("recession")) return "recession-onset rate";
  if (lower.includes("oas") || lower.includes("hy ") || lower.includes("credit"))
    return "credit-stress rate";
  if (lower.includes("hypo")) return "hypo-event rate";
  if (lower.includes("vix") || lower.includes("drawdown")) return "drawdown rate";
  return "event rate";
}

function CriticalityCard({
  abbrev,
  fullName,
  epochs,
  maxEpochs,
  color,
  expanded,
  onToggle,
  timeSeries,
  modelSeries,
  chartExpanded,
  confidence,
  relevance,
  referenceLookup,
  shortDesc,
  methodology,
  formula,
  assessment,
  emptyState,
}: {
  abbrev: string;
  fullName: string;
  epochs: number;
  maxEpochs: number;
  color: string;
  expanded: boolean;
  onToggle: () => void;
  timeSeries: number[];
  modelSeries?: number[];
  chartExpanded?: boolean;
  confidence: number;
  relevance?: RelevanceBreakdown;
  /**
   * Per-selection F → historical event-rate lookup. Computed by the parent
   * from the active profile's pre-built reference (e.g. FRED HY OAS). Null
   * when no reference is configured for this profile or the JSON hasn't
   * loaded yet — the card degrades silently in either case.
   */
  referenceLookup?: ReferenceLookupResult | null;
  shortDesc: string;
  methodology: string[];
  formula: string;
  assessment: string;
  emptyState?: CriticalityEmptyState;
}) {
  const confPct = Math.round(confidence * 100);
  const confColor = confPct >= 70 ? "#00e676" : confPct >= 40 ? "#ffab00" : "#ff5252";
  const isEmpty = !!emptyState;
  const headlineLabel = relevance ? "rel" : "conf";
  const sectionLabel = relevance ? "MODEL RELEVANCE" : "MODEL CONFIDENCE";
  // Bootstrap CI half-width on the composite (from `bootstrapRelevanceBatch`).
  // Rendered as `± N%` next to the headline percentage when present, with the
  // full range visible on hover. Hidden when the half-width rounds to 0%
  // (degenerate CI for insufficient-data cases).
  const ciLowPct = relevance?.compositeCi
    ? Math.round(relevance.compositeCi.low * 100)
    : undefined;
  const ciHighPct = relevance?.compositeCi
    ? Math.round(relevance.compositeCi.high * 100)
    : undefined;
  const ciHalfPct =
    ciLowPct !== undefined && ciHighPct !== undefined
      ? Math.round((ciHighPct - ciLowPct) / 2)
      : undefined;
  const ciTitle =
    relevance?.compositeCi
      ? `${Math.round(
          relevance.compositeCi.level * 100,
        )}% bootstrap CI: ${ciLowPct}%–${ciHighPct}% (${
          relevance.compositeCi.level === 0.9 ? "5th–95th" : "quantile"
        } percentiles, n=200 resamples)`
      : undefined;
  // Subsection collapse state — breakdown open by default (it's the headline
  // justification), methodology closed (long prose, mostly read-once).
  const [breakdownOpen, setBreakdownOpen] = useState(true);
  const [methodologyOpen, setMethodologyOpen] = useState(false);
  return (
    <div
      className="border rounded overflow-hidden transition-all duration-300"
      style={{
        borderColor: `${color}30`,
        backgroundColor: `${color}05`,
      }}
    >
      {/* Header — always visible, clickable to expand */}
      <button
        onClick={onToggle}
        className="w-full p-2.5 text-left space-y-1.5 hover:brightness-110 transition-all"
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] font-[family-name:var(--font-michroma)] tracking-wider" style={{ color }}>
              {abbrev}
            </div>
            <div className="text-[8px] font-mono text-text-muted">{fullName}</div>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-right">
              <span
                className="font-[family-name:var(--font-michroma)] text-[22px] font-bold tabular-nums leading-none"
                style={{ color }}
              >
                {isEmpty ? "T\u2013\u2013" : `T-${epochs}`}
              </span>
              <div className="flex items-center justify-end gap-1.5 mt-0.5">
                <div className="text-[8px] font-mono text-text-muted">EPOCHS</div>
                {isEmpty ? (
                  <div
                    className="text-[7px] font-mono px-1 py-0.5 rounded"
                    style={{
                      color: "#90a4ae",
                      backgroundColor: "rgba(144,164,174,0.1)",
                      border: "1px solid rgba(144,164,174,0.3)",
                    }}
                  >
                    {emptyState!.kind === "awaiting-data" ? "awaiting data" : "pending port"}
                  </div>
                ) : (
                  <div
                    className="text-[7px] font-mono px-1 py-0.5 rounded"
                    style={{
                      color: confColor,
                      backgroundColor: `${confColor}15`,
                      border: `1px solid ${confColor}30`,
                    }}
                    title={ciTitle}
                  >
                    {confPct}%
                    {ciHalfPct !== undefined && ciHalfPct > 0 ? (
                      <span className="opacity-70"> ± {ciHalfPct}%</span>
                    ) : null}{" "}
                    {headlineLabel}
                  </div>
                )}
              </div>
            </div>
            <span
              className="text-[10px] transition-transform duration-200"
              style={{ color, transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }}
            >
              {"\u25BC"}
            </span>
          </div>
        </div>
        <div className="h-1 w-full bg-border rounded overflow-hidden">
          <div className="h-full rounded transition-all duration-500" style={{
            width: isEmpty ? "0%" : `${Math.min(100, (epochs / maxEpochs) * 100)}%`,
            backgroundColor: color,
            opacity: 0.7,
          }} />
        </div>
        {/* Calibrated interpretation of F against a real historical
            event-rate table. Renders only when the active profile has a
            reference loaded AND the bin containing this F has ≥1 sample.
            Reads, e.g., "F=0.55 → 5% recession-onset rate (n=155, base 10%)" */}
        {referenceLookup &&
          Number.isFinite(referenceLookup.eventRate) &&
          referenceLookup.n > 0 && (
            <div
              className="text-[8px] font-mono text-text-muted/80 leading-relaxed"
              title={`Calibrated against ${referenceLookup.referenceId}: ${referenceLookup.eventLabel}. Reference base rate ${(referenceLookup.baseRate * 100).toFixed(1)}% across ${referenceLookup.n} windows in this bin.`}
            >
              <span className="text-foreground/70">
                F={(relevance?.F.score ?? 0).toFixed(2)}
              </span>
              <span className="opacity-70">{" → "}</span>
              <span style={{ color }}>
                {(referenceLookup.eventRate * 100).toFixed(0)}%
              </span>
              <span className="opacity-70">
                {" " + shortenEventLabel(referenceLookup.eventLabel)}
                {` (n=${referenceLookup.n}, base ${(
                  referenceLookup.baseRate * 100
                ).toFixed(0)}%)`}
              </span>
            </div>
          )}
        <div className="text-[9px] font-mono text-text-muted leading-relaxed">
          {shortDesc}
        </div>
      </button>

      {/* Expandable detail section */}
      {expanded && (
        <div className="px-2.5 pb-2.5 space-y-2.5 border-t" style={{ borderColor: `${color}20` }}>
          {isEmpty ? (
            <div className="mt-2 p-2.5 rounded border border-dashed" style={{
              borderColor: "rgba(144,164,174,0.4)",
              backgroundColor: "rgba(144,164,174,0.05)",
            }}>
              <div className="text-[8px] font-[family-name:var(--font-michroma)] tracking-wider mb-1.5" style={{ color: "#90a4ae" }}>
                {emptyState!.kind === "awaiting-data" ? "AWAITING DATA" : "PENDING TS PORT"}
              </div>
              {emptyState!.kind === "awaiting-data" ? (
                <>
                  <div className="text-[9px] font-mono text-text-muted leading-relaxed mb-1.5">
                    TS implementation is in place; the estimator runs as soon as an input series is wired into the store.
                  </div>
                  <div className="text-[8px] font-[family-name:var(--font-michroma)] tracking-wider text-text-muted mb-0.5">
                    REQUIRED INPUTS
                  </div>
                  <div className="text-[9px] font-mono text-text-muted leading-relaxed">
                    {emptyState!.inputs}
                  </div>
                </>
              ) : (
                <>
                  <div className="text-[9px] font-mono text-text-muted leading-relaxed mb-1.5">
                    Python reference is canonical. TS port deferred until a linear-algebra dependency decision lands.
                  </div>
                  <div className="text-[8px] font-[family-name:var(--font-michroma)] tracking-wider text-text-muted mb-0.5">
                    REFERENCE
                  </div>
                  <div className="text-[9px] font-mono text-text-muted leading-relaxed">
                    {emptyState!.reference}
                  </div>
                </>
              )}
            </div>
          ) : (
            <>
              {/* Time Series Chart */}
              <div className="mt-2">
                <div className="text-[8px] font-[family-name:var(--font-michroma)] tracking-wider text-text-muted mb-1">
                  TEMPORAL SIGNAL
                </div>
                <div className="border rounded p-1 transition-all duration-300" style={{
                  borderColor: `${color}15`,
                  backgroundColor: "rgba(0,0,0,0.15)",
                }}>
                  <CritSparkline
                    data={timeSeries}
                    modelData={modelSeries}
                    color={color}
                    height={chartExpanded ? 240 : 140}
                    abbrev={abbrev}
                    fullName={fullName}
                    formula={formula}
                    isExpanded={!!chartExpanded}
                  />
                </div>
              </div>

              {/* Relevance / confidence gauge — header carries the formula
                  so the headline % visibly ties to the four sub-scores below. */}
              <div>
                <div className="flex items-baseline gap-2 mb-1 flex-wrap">
                  <span className="text-[8px] font-[family-name:var(--font-michroma)] tracking-wider text-text-muted">
                    {sectionLabel}
                  </span>
                  {relevance && (
                    <span className="text-[8px] font-mono text-text-muted/60">
                      = S · G · M · (0.6·F + 0.4·E)
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-border rounded overflow-hidden">
                    <div className="h-full rounded transition-all duration-700" style={{
                      width: `${confPct}%`,
                      backgroundColor: confColor,
                      opacity: 0.85,
                    }} />
                  </div>
                  <div className="text-[10px] font-[family-name:var(--font-michroma)] tabular-nums" style={{ color: confColor }}>
                    {confPct}%
                  </div>
                </div>
                <div className="text-[8px] font-mono text-text-muted mt-0.5 leading-relaxed">
                  {relevance
                    ? (confPct >= 70 ? "Strong signal — model fits the data and the regime matches its assumptions." :
                       confPct >= 40 ? "Moderate signal — partial fit, partial regime match, or thin data." :
                       "Weak signal — model is a poor match for the current regime or data is too thin.")
                    : (confPct >= 70 ? "Strong signal — grounded in observed epoch data and graph topology." :
                       confPct >= 40 ? "Moderate signal — partial data coverage; model-augmented projection." :
                       "Weak signal — insufficient simulation data; run cascade for higher confidence.")}
                </div>
              </div>

              {/* F · E · G · S breakdown — collapsible, open by default.
                  Always rendered when a relevance computation exists; rows
                  showing 0% with an "insufficient" detail tell the user
                  *why* a model can't score (data gap, not a bug). */}
              {relevance && (
                <div>
                  <button
                    onClick={() => setBreakdownOpen((v) => !v)}
                    className="w-full flex items-center justify-between mb-1 hover:brightness-125 transition-all"
                  >
                    <span className="text-[8px] font-[family-name:var(--font-michroma)] tracking-wider text-text-muted">
                      RELEVANCE BREAKDOWN
                    </span>
                    <span
                      className="text-[10px] text-text-muted transition-transform duration-200"
                      style={{ transform: breakdownOpen ? "rotate(180deg)" : "rotate(0deg)" }}
                    >
                      {"▼"}
                    </span>
                  </button>
                  {breakdownOpen && (
                    <>
                      <div className="space-y-1">
                        {([
                          { code: "F", label: "FIT", role: "×0.6", sub: relevance.F },
                          { code: "E", label: "EVIDENCE", role: "×0.4", sub: relevance.E },
                          { code: "G", label: "REGIME", role: "gate", sub: relevance.G },
                          { code: "S", label: "SUFFICIENCY", role: "gate", sub: relevance.S },
                          { code: "M", label: "CONSISTENCY", role: "gate", sub: relevance.M },
                        ] as const).map(({ code, label, role, sub }) => {
                          const pct = Math.round(sub.score * 100);
                          const barColor = pct >= 70 ? "#00e676" : pct >= 40 ? "#ffab00" : "#ff5252";
                          return (
                            <div key={code} className="flex items-center gap-2">
                              <div className="w-3 text-[9px] font-[family-name:var(--font-michroma)] text-text-muted">
                                {code}
                              </div>
                              <div className="w-14 text-[7px] font-mono text-text-muted/80 tracking-wider">
                                {label}
                              </div>
                              <div className="w-8 text-[7px] font-mono text-text-muted/50 tracking-wider">
                                {role}
                              </div>
                              <div className="flex-1 h-1 bg-border rounded overflow-hidden">
                                <div className="h-full rounded transition-all duration-500" style={{
                                  width: `${pct}%`,
                                  backgroundColor: barColor,
                                  opacity: 0.8,
                                }} />
                              </div>
                              <div className="w-8 text-right text-[9px] font-mono tabular-nums" style={{ color: barColor }}>
                                {pct}%
                              </div>
                              <div className="flex-[2] min-w-0 text-[8px] font-mono text-text-muted/80 truncate" title={sub.detail}>
                                {sub.detail}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div className="text-[8px] font-mono text-text-muted/80 mt-1 leading-relaxed">
                        {confPct}% = {relevance.S.score.toFixed(2)} · {relevance.G.score.toFixed(2)} · {relevance.M.score.toFixed(2)} · ({(0.6 * relevance.F.score).toFixed(2)} + {(0.4 * relevance.E.score).toFixed(2)}) = {relevance.rawComposite.toFixed(2)}
                        {relevance.compositeCi && ciLowPct !== undefined && ciHighPct !== undefined && (
                          <> · {Math.round(relevance.compositeCi.level * 100)}% CI [{ciLowPct}%–{ciHighPct}%]</>
                        )}
                        {Math.abs(relevance.composite - relevance.rawComposite) > 0.005 && (
                          <> → smoothed {relevance.composite.toFixed(2)}</>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </>
          )}

          {/* Methodology explanation — collapsible, closed by default. */}
          <div>
            <button
              onClick={() => setMethodologyOpen((v) => !v)}
              className="w-full flex items-center justify-between mb-1 hover:brightness-125 transition-all"
            >
              <span className="text-[8px] font-[family-name:var(--font-michroma)] tracking-wider text-text-muted">
                METHODOLOGY
              </span>
              <span
                className="text-[10px] text-text-muted transition-transform duration-200"
                style={{ transform: methodologyOpen ? "rotate(180deg)" : "rotate(0deg)" }}
              >
                {"▼"}
              </span>
            </button>
            {methodologyOpen && (
              <div className="space-y-1.5">
                {methodology.map((line, i) => (
                  <div key={i} className="text-[9px] font-mono text-text-muted leading-relaxed">
                    {line}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Formula */}
          <div className="p-2 rounded border" style={{
            borderColor: `${color}20`,
            backgroundColor: `${color}08`,
          }}>
            <div className="text-[10px] font-mono" style={{ color }}>
              {formula}
            </div>
          </div>

          {/* Current assessment */}
          <div>
            <div className="text-[8px] font-[family-name:var(--font-michroma)] tracking-wider text-text-muted mb-1">
              CURRENT ASSESSMENT
            </div>
            <div className="text-[9px] font-mono text-text-muted leading-relaxed">
              {assessment}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ParetoPanel;

export { SnapshotIndicator };
