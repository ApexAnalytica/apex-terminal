"use client";

import { useDeferredValue, useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useApexStore } from "@/stores/useApexStore";
import { getPresetShocks } from "@/lib/omega-engine";
import { getEngineProvider } from "@/lib/engines";
import { getDomainColor } from "@/lib/graph-data";
import { AXIOM_LIBRARY, scoreAxiomRelevance, type ScoredAxiom } from "@/lib/tarski-data";
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
  loadRelevanceReference,
  lookupRelevanceReference,
  type ReferenceLookupResult,
  type RelevanceReference,
} from "@/lib/pareto-relevance-reference";
import { fitLppls, lpplsSeries } from "@/lib/estimators/lppls-fit";
import { fitBettiTemplate } from "@/lib/estimators/ph-fit";
import { detectCommunities } from "@/lib/community-detection";
import { summarizeDiscoveryUncertainty } from "@/lib/discovery-uncertainty";
import dynamic from "next/dynamic";
import TrinityPanel from "./TrinityPanel";
import DiscoveryRunsPanel from "./DiscoveryRunsPanel";
import NewsInterpreterPanel from "./NewsInterpreterPanel";
import NodeInspector from "./NodeInspector";
import SnapshotDiagnostics from "./SnapshotDiagnostics";

// Tab-gated sub-panels lazy-loaded so the default Spirtes tab doesn't
// pull their JS on first paint:
//   - MonteCarloForecast (714 LOC + simulation helpers)  → Pearl tab
//   - VX880TrialPanel (910 LOC + cohort helpers)         → Pearl tab
//   - InterdictionPanel (191 LOC)                        → Pareto tab
//   - TissueCohortView (504 LOC + d1namo cohort data)    → Spirtes tab
//     but only when isT1DDomain is true, so worth deferring
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

export default function ModulePanel() {
  const activeModule = useApexStore((s) => s.activeModule);
  const setInterventionMode = useApexStore((s) => s.setInterventionMode);
  // Scientist-mode aware: Tissue Cohort view mounts only when a T1D
  // domain is loaded, so it doesn't pollute non-life-sciences flows.
  const selectedDomainsForView = useApexStore((s) => s.selectedDomains);
  const isT1DDomain = useMemo(
    () => resolveDomainProfile(selectedDomainsForView).id === "t1d",
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

      {/* Node Inspector (persistent across modules) */}
      <NodeInspector />

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
              Run interdiction from the copilot to produce candidate cuts, then the Monte Carlo
              forecast auto-simulates the counterfactual {"\u03A9"}-buffer trajectory under those cuts.
            </div>
            <VX880TrialPanel />
            <CopilotInterdictionResults />
            <MonteCarloForecast expanded={expandedChart === "pearl"} />
          </div>
        )}

        {activeModule === "pareto" && (
          <div className="p-4 space-y-3">
            <div className="text-[8px] font-mono text-text-muted p-2 border border-border/50 rounded bg-surface-elevated">
              Inject exogenous disruption scenarios, assess systemic fragility,
              then run interdiction to find optimal defensive interventions.
            </div>
            <SnapshotIndicator />
            <ParetoPanel expandedChart={expandedChart} setExpandedChart={setExpandedChart} />
            <InterdictionPanel />
            <NewsInterpreterPanel />
          </div>
        )}
      </div>
    </aside>
  );
}

// ─── Copilot Interdiction Results (shown in Pearl when solver has results) ───
function CopilotInterdictionResults() {
  const lastResult = useApexStore((s) => s.lastInterdictionResult);
  const severEdge = useApexStore((s) => s.severEdge);
  const toggleAblatedNode = useApexStore((s) => s.toggleAblatedNode);
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());

  if (!lastResult) return null;

  const hasInterventions = lastResult.interventions.length > 0;
  const isFallback = Boolean(lastResult.fallbackReason);
  // When the cuts came from the structural-vulnerability fallback, the
  // marginalReduction field holds a proxy score (edge weight × 10 or ΩF),
  // not a true damage delta — label it accordingly so the UI doesn't
  // claim "saves X pts" when the solver didn't actually measure that.
  const rankLabel = isFallback ? "score" : "saves";
  const rankUnit = isFallback ? "" : "pts";

  return (
    <div className="border border-accent-amber/30 rounded bg-accent-amber/5 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-[family-name:var(--font-michroma)] tracking-wider text-accent-amber">
          {isFallback ? "STRUCTURAL VULNERABILITY CUTS" : "INTERDICTION RESULTS"}
        </span>
        <button
          onClick={() => useApexStore.getState().setLastInterdictionResult(null)}
          className="text-[7px] font-mono text-text-muted hover:text-accent-red transition-colors"
        >
          DISMISS
        </button>
      </div>

      <div className="flex gap-3 text-[8px] font-mono">
        <div>
          <span className="text-text-muted">BASELINE </span>
          <span className="text-accent-red">{lastResult.baselineDamage.toFixed(1)}</span>
        </div>
        <div>
          <span className="text-text-muted">OPTIMAL </span>
          <span className="text-accent-green">{lastResult.bestDamage.toFixed(1)}</span>
        </div>
        <div>
          <span className="text-text-muted">REDUCTION </span>
          <span className="text-accent-amber">{lastResult.reductionPct.toFixed(0)}%</span>
        </div>
      </div>

      {isFallback && lastResult.fallbackReason && (
        <div className="text-[7px] font-mono text-text-muted italic leading-relaxed border-l-2 border-accent-amber/30 pl-2">
          {lastResult.fallbackReason}
        </div>
      )}

      {hasInterventions ? (
        <div className="space-y-1.5">
          {lastResult.interventions.map((iv, i) => {
            const isApplied = appliedIds.has(iv.target.id);
            const actionLabel = iv.target.type === "edge" ? "SEVER" : "ABLATE";
            const appliedLabel = iv.target.type === "edge" ? "SEVERED" : "ABLATED";
            return (
              <div
                key={iv.target.id}
                className="flex items-center gap-2 p-1.5 rounded border border-border bg-surface-elevated"
              >
                <span className="text-[8px] font-mono text-accent-cyan w-4 shrink-0">{i + 1}.</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[8px] font-mono text-foreground truncate">{iv.target.label}</div>
                  <div className="text-[7px] font-mono text-text-muted">
                    {iv.target.type} — {rankLabel} {iv.marginalReduction.toFixed(1)}{rankUnit}
                  </div>
                </div>
                <button
                  onClick={() => {
                    if (isApplied) return;
                    if (iv.target.type === "edge") {
                      severEdge(iv.target.id);
                    } else {
                      toggleAblatedNode(iv.target.id);
                    }
                    setAppliedIds((prev) => new Set([...prev, iv.target.id]));
                  }}
                  disabled={isApplied}
                  className={`px-2 py-0.5 rounded text-[7px] font-[family-name:var(--font-michroma)] tracking-wider transition-colors shrink-0 ${
                    isApplied
                      ? "text-accent-green border border-accent-green/30 bg-accent-green/5"
                      : "text-accent-red border border-accent-red/30 hover:bg-accent-red/10"
                  }`}
                >
                  {isApplied ? appliedLabel : actionLabel}
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-[8px] font-mono text-text-muted">
          No candidate cuts available. Inject a shock and/or widen the domain scope, then re-run the solver.
        </div>
      )}
    </div>
  );
}

// Visual icon components for axiom categories
function AxiomIcon({ axiomId, color }: { axiomId: string; color: string }) {
  const size = 28;
  const icons: Record<string, React.ReactNode> = {
    "A-01": ( // Temporal Priority — clock with arrow
      <svg width={size} height={size} viewBox="0 0 28 28" fill="none">
        <circle cx="14" cy="14" r="10" stroke={color} strokeWidth="1.5" opacity="0.6" />
        <line x1="14" y1="14" x2="14" y2="7" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
        <line x1="14" y1="14" x2="19" y2="14" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
        <path d="M22 8l2-3m0 0l-3 0.5" stroke={color} strokeWidth="1" opacity="0.5" />
      </svg>
    ),
    "A-02": ( // Flow Conservation — balanced scale / flow
      <svg width={size} height={size} viewBox="0 0 28 28" fill="none">
        <path d="M4 14h20" stroke={color} strokeWidth="1.5" opacity="0.4" />
        <path d="M7 10l7 4-7 4" stroke={color} strokeWidth="1.5" strokeLinejoin="round" fill={`${color}15`} />
        <path d="M21 10l-7 4 7 4" stroke={color} strokeWidth="1.5" strokeLinejoin="round" fill={`${color}15`} />
        <circle cx="14" cy="14" r="2" fill={color} opacity="0.6" />
      </svg>
    ),
    "A-03": ( // DAG Integrity — no cycles
      <svg width={size} height={size} viewBox="0 0 28 28" fill="none">
        <circle cx="8" cy="8" r="3" stroke={color} strokeWidth="1.5" opacity="0.6" />
        <circle cx="20" cy="8" r="3" stroke={color} strokeWidth="1.5" opacity="0.6" />
        <circle cx="14" cy="20" r="3" stroke={color} strokeWidth="1.5" opacity="0.6" />
        <path d="M11 8h6M9.5 10.5l3 7M18.5 10.5l-3 7" stroke={color} strokeWidth="1" opacity="0.4" />
        <line x1="10" y1="16" x2="18" y2="10" stroke="#ff1744" strokeWidth="1.5" opacity="0.7" />
        <line x1="18" y1="16" x2="10" y2="10" stroke="#ff1744" strokeWidth="1.5" opacity="0.7" />
      </svg>
    ),
    "A-04": ( // Chokepoint — bottleneck
      <svg width={size} height={size} viewBox="0 0 28 28" fill="none">
        <path d="M4 8h8l-4 6 4 6H4" stroke={color} strokeWidth="1" opacity="0.3" />
        <rect x="12" y="10" width="4" height="8" rx="1" stroke={color} strokeWidth="1.5" fill={`${color}20`} />
        <path d="M16 8h8l-4 6 4 6h-8" stroke={color} strokeWidth="1" opacity="0.3" />
        <path d="M6 14h6M16 14h6" stroke={color} strokeWidth="1.5" opacity="0.5" strokeDasharray="2 2" />
      </svg>
    ),
    "A-05": ( // Single Source — one input
      <svg width={size} height={size} viewBox="0 0 28 28" fill="none">
        <circle cx="6" cy="14" r="3" stroke={color} strokeWidth="1.5" opacity="0.6" />
        <rect x="16" y="10" width="8" height="8" rx="2" stroke={color} strokeWidth="1.5" fill={`${color}10`} />
        <path d="M9 14h7" stroke={color} strokeWidth="1.5" markerEnd="url(#arw)" />
        <text x="20" y="16" fontSize="7" fill="#ff1744" textAnchor="middle" fontFamily="monospace">!</text>
      </svg>
    ),
    "R-01": ( // Jurisdictional — flag/shield
      <svg width={size} height={size} viewBox="0 0 28 28" fill="none">
        <path d="M14 4l8 4v8c0 4-4 8-8 8s-8-4-8-8V8l8-4z" stroke={color} strokeWidth="1.5" fill={`${color}08`} />
        <path d="M14 10v6M14 18v1" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    "R-02": ( // Force Majeure — lightning
      <svg width={size} height={size} viewBox="0 0 28 28" fill="none">
        <path d="M16 4l-6 10h6l-4 10 10-12h-6l4-8z" stroke={color} strokeWidth="1.5" fill={`${color}15`} strokeLinejoin="round" />
      </svg>
    ),
    "R-03": ( // Export Route Monopoly — single path
      <svg width={size} height={size} viewBox="0 0 28 28" fill="none">
        <circle cx="6" cy="14" r="3" stroke={color} strokeWidth="1.5" opacity="0.6" />
        <rect x="12" y="11" width="4" height="6" rx="1" stroke={color} strokeWidth="1.5" fill={`${color}20`} />
        <circle cx="22" cy="14" r="3" stroke={color} strokeWidth="1.5" opacity="0.6" />
        <path d="M9 14h3M16 14h3" stroke={color} strokeWidth="1.5" />
      </svg>
    ),
    "R-04": ( // Cross-Domain — dashed bridge
      <svg width={size} height={size} viewBox="0 0 28 28" fill="none">
        <rect x="2" y="8" width="10" height="12" rx="2" stroke={color} strokeWidth="1" opacity="0.4" />
        <rect x="16" y="8" width="10" height="12" rx="2" stroke={color} strokeWidth="1" opacity="0.4" />
        <path d="M12 14h4" stroke={color} strokeWidth="1.5" strokeDasharray="2 2" opacity="0.7" />
        <text x="7" y="16" fontSize="6" fill={color} textAnchor="middle" fontFamily="monospace" opacity="0.5">A</text>
        <text x="21" y="16" fontSize="6" fill={color} textAnchor="middle" fontFamily="monospace" opacity="0.5">B</text>
      </svg>
    ),
    "H-01": ( // Capacity Saturation — filled gauge
      <svg width={size} height={size} viewBox="0 0 28 28" fill="none">
        <path d="M6 22a8 8 0 1 1 16 0" stroke={color} strokeWidth="1.5" fill="none" />
        <path d="M6 22a8 8 0 0 1 16 0" stroke="#ff1744" strokeWidth="2" opacity="0.3" strokeDasharray="25 50" />
        <line x1="14" y1="22" x2="19" y2="13" stroke="#ff1744" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="14" cy="22" r="1.5" fill={color} />
      </svg>
    ),
    "H-02": ( // Cascade Amplification — expanding ripple
      <svg width={size} height={size} viewBox="0 0 28 28" fill="none">
        <circle cx="14" cy="14" r="3" fill={color} opacity="0.5" />
        <circle cx="14" cy="14" r="6" stroke={color} strokeWidth="1" opacity="0.3" />
        <circle cx="14" cy="14" r="9" stroke={color} strokeWidth="1" opacity="0.2" />
        <circle cx="14" cy="14" r="12" stroke={color} strokeWidth="0.5" opacity="0.1" />
        <path d="M17 11l3-3M11 17l-3 3M17 17l3 3" stroke={color} strokeWidth="1" opacity="0.4" />
      </svg>
    ),
  };
  return <div className="flex-shrink-0">{icons[axiomId] ?? null}</div>;
}

function TarskiPanel() {
  const graphData = useApexStore((s) => s.graphData);
  const selectedDomains = useApexStore((s) => s.selectedDomains);
  const truthFilter = useApexStore((s) => s.truthFilter);
  const setTruthFilter = useApexStore((s) => s.setTruthFilter);
  const setSelectedNode = useApexStore((s) => s.setSelectedNode);
  const tarskiReport = useApexStore((s) => s.tarskiReport);
  const enabledAxioms = useApexStore((s) => s.enabledAxioms);
  const setEnabledAxioms = useApexStore((s) => s.setEnabledAxioms);
  const runTarskiWithAxioms = useApexStore((s) => s.runTarskiWithAxioms);
  const [expandedAxiom, setExpandedAxiom] = useState<string | null>(null);

  // Score axioms by relevance to current graph, filtered by the active profile
  // so e.g. T1D sessions don't surface chokepoint / force-majeure axioms.
  const activeProfileId = resolveDomainProfile(selectedDomains).id;
  const scoredAxioms = useMemo(
    () => scoreAxiomRelevance(graphData, activeProfileId),
    [graphData, activeProfileId]
  );

  // Split into recommended (score >= 0.4) and other
  const { recommended, other } = useMemo(() => {
    const rec: ScoredAxiom[] = [];
    const oth: ScoredAxiom[] = [];
    for (const sa of scoredAxioms) {
      if (sa.relevanceScore >= 0.4) rec.push(sa);
      else oth.push(sa);
    }
    return { recommended: rec, other: oth };
  }, [scoredAxioms]);

  // Auto-suggest: enable high-relevance axioms when user hasn't customized
  const [hasCustomized, setHasCustomized] = useState(false);
  const suggestedIds = useMemo(
    () => new Set(recommended.map((sa) => sa.axiom.id)),
    [recommended]
  );

  // Active set: user's picks if customized, otherwise auto-suggested
  const activeAxiomIds = hasCustomized ? enabledAxioms : suggestedIds;

  const toggleAxiom = useCallback((id: string) => {
    const next = new Set(activeAxiomIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setEnabledAxioms(next);
    setHasCustomized(true);
  }, [activeAxiomIds, setEnabledAxioms]);

  const selectAll = useCallback(() => {
    setEnabledAxioms(new Set(scoredAxioms.map((sa) => sa.axiom.id)));
    setHasCustomized(true);
  }, [scoredAxioms, setEnabledAxioms]);

  const selectSuggested = useCallback(() => {
    setEnabledAxioms(suggestedIds);
    setHasCustomized(false);
  }, [suggestedIds, setEnabledAxioms]);

  // Count violations per axiom
  const axiomViolationCounts = useMemo(() => {
    if (!tarskiReport) return {};
    const counts: Record<string, number> = {};
    tarskiReport.proofTraces.forEach((trace) => {
      trace.violatedAxioms.forEach((a) => {
        counts[a] = (counts[a] || 0) + 1;
      });
    });
    return counts;
  }, [tarskiReport]);

  // Count active domains for context
  const activeDomains = useMemo(
    () => [...new Set(graphData.nodes.map((n) => n.domain))],
    [graphData]
  );

  const levelColors: Record<number, string> = { 0: "#00e676", 1: "#ffab00", 2: "#90a4ae" };
  const levelLabels: Record<number, string> = { 0: "PHYSICAL LAW", 1: "REGULATORY", 2: "HEURISTIC" };
  const levelIcons: Record<number, string> = { 0: "\u26A0", 1: "\u2696", 2: "\u26A1" };

  const renderAxiomCard = (sa: ScoredAxiom) => {
    const { axiom, relevanceScore, reason, matchedDomains } = sa;
    const isActive = activeAxiomIds.has(axiom.id);
    const violationCount = axiomViolationCounts[axiom.id] || 0;
    const hasViolations = truthFilter === "verified" && violationCount > 0;
    const levelColor = levelColors[axiom.level];
    const isExpanded = expandedAxiom === axiom.id;

    return (
      <div
        key={axiom.id}
        className="rounded border transition-all overflow-hidden"
        style={{
          borderColor: hasViolations
            ? "rgba(255,23,68,0.5)"
            : isActive
              ? `${levelColor}50`
              : "var(--border)",
          backgroundColor: hasViolations
            ? "rgba(255,23,68,0.06)"
            : isActive
              ? `${levelColor}0A`
              : "transparent",
        }}
      >
        {/* Compact header — always visible */}
        <div
          className="flex items-center gap-2 px-2 py-2 cursor-pointer hover:bg-white/[0.02] transition-colors"
          onClick={() => setExpandedAxiom(isExpanded ? null : axiom.id)}
        >
          {/* Visual icon */}
          <AxiomIcon axiomId={axiom.id} color={levelColor} />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              {/* Level pill */}
              <span
                className="text-[6px] px-1 py-px rounded-sm font-mono tracking-wider flex-shrink-0"
                style={{ color: levelColor, backgroundColor: `${levelColor}18`, border: `1px solid ${levelColor}30` }}
              >
                {levelLabels[axiom.level]}
              </span>
              {/* Name */}
              <span className="text-[9px] font-mono text-foreground truncate">
                {axiom.name}
              </span>
            </div>
            {/* One-line plain English */}
            <div className="text-[8px] font-mono text-text-muted mt-0.5 leading-snug line-clamp-1">
              {axiom.plainText}
            </div>
          </div>

          {/* Right side: toggle + status */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {hasViolations && (
              <span className="text-[7px] px-1 py-0.5 rounded bg-accent-red/15 text-accent-red font-mono animate-pulse">
                {violationCount} {violationCount === 1 ? "issue" : "issues"}
              </span>
            )}
            {/* Toggle switch */}
            <button
              onClick={(e) => { e.stopPropagation(); toggleAxiom(axiom.id); }}
              className="relative w-7 h-3.5 rounded-full transition-colors"
              style={{
                backgroundColor: isActive ? `${levelColor}40` : "var(--surface)",
                border: `1px solid ${isActive ? levelColor : "var(--border)"}`,
              }}
              title={isActive ? "Disable this constraint" : "Enable this constraint"}
            >
              <div
                className="absolute top-0.5 w-2 h-2 rounded-full transition-all"
                style={{
                  left: isActive ? "13px" : "2px",
                  backgroundColor: isActive ? levelColor : "var(--text-muted)",
                }}
              />
            </button>
          </div>
        </div>

        {/* Expanded detail — shown on click */}
        {isExpanded && (
          <div className="px-2 pb-2 border-t border-border/30 pt-2 space-y-2">
            {/* Full explanation */}
            <div className="text-[8px] font-mono text-foreground/85 leading-relaxed p-2 rounded bg-background/50">
              {axiom.description}
            </div>

            {/* What it checks for */}
            <div className="flex items-start gap-1.5">
              <span className="text-[7px] font-mono text-text-muted flex-shrink-0 mt-px">DETECTS:</span>
              <span className="text-[8px] font-mono text-foreground/70">{axiom.checksFor}</span>
            </div>

            {/* Visual diagram */}
            {axiom.diagramHint && (
              <div
                className="text-[9px] font-mono px-2 py-1.5 rounded border"
                style={{
                  color: levelColor,
                  borderColor: `${levelColor}25`,
                  backgroundColor: `${levelColor}08`,
                  letterSpacing: "0.05em",
                }}
              >
                {axiom.diagramHint}
              </div>
            )}

            {/* Domain relevance */}
            {matchedDomains.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {matchedDomains.map((d) => (
                  <span
                    key={d}
                    className="text-[6px] font-mono px-1.5 py-0.5 rounded-sm"
                    style={{
                      color: getDomainColor(d),
                      backgroundColor: `${getDomainColor(d)}15`,
                      border: `1px solid ${getDomainColor(d)}30`,
                    }}
                  >
                    {d.split(" ").slice(-1)[0].toUpperCase()}
                  </span>
                ))}
                <span className="text-[6px] font-mono text-text-muted self-center ml-0.5 italic">
                  {reason}
                </span>
              </div>
            )}

            {/* Formal notation — for advanced users */}
            <details className="text-[7px] font-mono text-text-muted">
              <summary className="cursor-pointer hover:text-foreground/60 transition-colors">
                Formal notation
              </summary>
              <div className="mt-1 px-1.5 py-1 rounded bg-background/40 text-accent-green/70">
                {axiom.formalNotation}
              </div>
            </details>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {/* Header */}
      <div className="font-[family-name:var(--font-michroma)] text-[10px] tracking-wider text-accent-green">
        CONSTRAINT VERIFICATION
      </div>
      <div className="text-[8px] font-mono text-text-muted mb-2 leading-relaxed">
        Constraints are rules that your causal graph must obey. The system
        recommends constraints based on your active domains.
        Toggle them on/off, then verify.
      </div>

      {/* Active domains context bar */}
      <div className="flex items-center gap-1 mb-3 pb-2 border-b border-border/30">
        <span className="text-[7px] font-mono text-text-muted flex-shrink-0">ACTIVE DOMAINS:</span>
        <div className="flex flex-wrap gap-1">
          {activeDomains.map((d) => (
            <span
              key={d}
              className="text-[6px] font-mono px-1.5 py-0.5 rounded-sm"
              style={{
                color: getDomainColor(d),
                backgroundColor: `${getDomainColor(d)}12`,
                border: `1px solid ${getDomainColor(d)}25`,
              }}
            >
              {d.split(" ").slice(-1)[0]}
            </span>
          ))}
        </div>
      </div>

      {/* Recommended constraints */}
      {recommended.length > 0 && (
        <div className="space-y-1.5 mb-3">
          <div className="flex items-center justify-between">
            <div className="font-[family-name:var(--font-michroma)] text-[8px] tracking-wider text-accent-green/80 flex items-center gap-1">
              <span style={{ fontSize: "10px" }}>&#x2713;</span>
              RECOMMENDED ({recommended.length})
            </div>
            <div className="flex gap-1">
              <button
                onClick={selectSuggested}
                className="text-[7px] font-mono px-1.5 py-0.5 rounded border border-accent-green/30 text-accent-green hover:bg-accent-green/10 transition-colors"
                title="Auto-select recommended constraints"
              >
                AUTO
              </button>
              <button
                onClick={selectAll}
                className="text-[7px] font-mono px-1.5 py-0.5 rounded border border-border text-text-muted hover:text-foreground transition-colors"
                title="Enable all constraints"
              >
                ALL
              </button>
            </div>
          </div>
          <div className="space-y-1">
            {recommended.map(renderAxiomCard)}
          </div>
        </div>
      )}

      {/* Other constraints */}
      {other.length > 0 && (
        <details className="mb-3">
          <summary className="text-[8px] font-[family-name:var(--font-michroma)] tracking-wider text-text-muted cursor-pointer hover:text-foreground/60 transition-colors mb-1.5">
            OTHER CONSTRAINTS ({other.length})
          </summary>
          <div className="space-y-1">
            {other.map(renderAxiomCard)}
          </div>
        </details>
      )}

      {/* Run validation button */}
      <div className="space-y-2">
        <button
          onClick={() => {
            if (truthFilter === "verified") {
              setTruthFilter("raw");
              setSelectedNode(null);
            } else {
              // Sync enabled axioms and run
              if (!hasCustomized) setEnabledAxioms(suggestedIds);
              runTarskiWithAxioms();
              // Select first violation
              setTimeout(() => {
                const state = useApexStore.getState();
                const firstRestricted = state.graphData.nodes.find((n) => n.isRestricted);
                if (firstRestricted) {
                  setSelectedNode(firstRestricted.id);
                } else {
                  const firstInconsistentEdge = state.graphData.edges.find((e) => e.isInconsistent);
                  if (firstInconsistentEdge) setSelectedNode(firstInconsistentEdge.source);
                }
              }, 0);
            }
          }}
          className="w-full text-[9px] font-[family-name:var(--font-michroma)] tracking-wider px-3 py-2.5 rounded border transition-all"
          style={{
            borderColor: truthFilter === "verified" ? "rgba(255,23,68,0.4)" : "rgba(0,230,118,0.4)",
            color: truthFilter === "verified" ? "#ff1744" : "#00e676",
            backgroundColor: truthFilter === "verified" ? "rgba(255,23,68,0.08)" : "rgba(0,230,118,0.08)",
          }}
        >
          {truthFilter === "verified"
            ? "CLEAR VERIFICATION"
            : `VERIFY WITH ${activeAxiomIds.size} CONSTRAINT${activeAxiomIds.size !== 1 ? "S" : ""}`}
        </button>

        {/* Active count indicator */}
        <div className="text-[8px] font-mono text-text-muted text-center">
          {activeAxiomIds.size} of {scoredAxioms.length} constraints active
          {!hasCustomized && activeAxiomIds.size > 0 && (
            <span className="text-accent-green ml-1">(auto)</span>
          )}
        </div>
      </div>

      {/* Results section — shown after validation */}
      {truthFilter === "verified" && tarskiReport && (
        <div className="mt-3 space-y-2">
          {/* Summary card */}
          <div
            className="text-[9px] font-mono p-2.5 border rounded"
            style={{
              borderColor: tarskiReport.totalViolations > 0 ? "rgba(255,23,68,0.3)" : "rgba(0,230,118,0.3)",
              backgroundColor: tarskiReport.totalViolations > 0 ? "rgba(255,23,68,0.05)" : "rgba(0,230,118,0.05)",
            }}
          >
            <div className="flex items-center justify-between">
              <span style={{ color: tarskiReport.totalViolations > 0 ? "#ff1744" : "#00e676" }}>
                {tarskiReport.totalViolations > 0
                  ? `${tarskiReport.totalViolations} VIOLATIONS FOUND`
                  : "ALL CONSTRAINTS SATISFIED"}
              </span>
              <span className="text-text-muted text-[7px]">
                {tarskiReport.proofTraces.length} traces
              </span>
            </div>
            <div className="flex gap-3 mt-1.5 text-[8px]">
              <div className="flex items-center gap-1">
                <span className="text-text-muted">Edges flagged:</span>
                <span style={{ color: tarskiReport.inconsistentEdgeIds.size > 0 ? "#ff1744" : "var(--text-muted)" }}>
                  {tarskiReport.inconsistentEdgeIds.size}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-text-muted">Nodes restricted:</span>
                <span style={{ color: tarskiReport.restrictedNodeIds.size > 0 ? "#ffab00" : "var(--text-muted)" }}>
                  {tarskiReport.restrictedNodeIds.size}
                </span>
              </div>
            </div>
          </div>

          {/* Restricted nodes — clickable */}
          {tarskiReport.restrictedNodeIds.size > 0 && (
            <div className="space-y-1">
              <div className="font-[family-name:var(--font-michroma)] text-[9px] tracking-wider text-accent-amber">
                RESTRICTED NODES ({tarskiReport.restrictedNodeIds.size})
              </div>
              <div className="max-h-24 overflow-y-auto space-y-0.5">
                {graphData.nodes
                  .filter((n) => n.isRestricted)
                  .map((n) => (
                    <div
                      key={n.id}
                      className="text-[8px] font-mono p-1 border border-accent-amber/20 rounded bg-accent-amber/5 text-accent-amber cursor-pointer hover:brightness-125 transition-all truncate"
                      onClick={() => setSelectedNode(n.id)}
                    >
                      {n.label}
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Proof traces */}
          <ProofTraceList />
        </div>
      )}
    </>
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
  const addShock = useApexStore((s) => s.addShock);
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
  const presetShocks = useMemo(() => getPresetShocks(), []);
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
    const edgeCount = graphData.edges.filter((e) => !e.isSevered).length;
    const nodeCount = graphData.nodes.length;

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
    // live T1D adjacency (binary, symmetric, row-normalised) and per-node
    // ΩF composite values. Same Moran kernel the standalone Moran card
    // already uses, so the breakdown row matches the card by construction.
    const t1dValues: number[] = T1D_NODE_IDS.map((nid) => {
      const gn = graphData.nodes.find((nd) => nd.id === nid);
      return gn?.omegaFragility.composite ?? 0;
    });
    const t1dAdjacency: number[][] = (() => {
      const n = T1D_NODE_IDS.length;
      const W: number[][] = Array.from({ length: n }, () =>
        new Array(n).fill(0),
      );
      const idxOf = (nid: string) => T1D_NODE_IDS.indexOf(nid);
      for (const e of graphData.edges) {
        if (e.isSevered) continue;
        const si = idxOf(e.source);
        const ti = idxOf(e.target);
        if (si >= 0 && ti >= 0) {
          W[si][ti] = 1;
          W[ti][si] = 1;
        }
      }
      // Row-normalise.
      return W.map((row) => {
        const rs = row.reduce((a, b) => a + b, 0);
        return rs > 0 ? row.map((v) => v / rs) : row;
      });
    })();
    const consistency = spatialConsistency(
      { values: t1dValues, adjacency: t1dAdjacency },
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
  }, [csdData, phData, lpplsData, bocpdData, graphData.edges, graphData.nodes, scopeLabel, activeProfile]);

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

      {/* Scenario Injector */}
      <div className="mt-3">
        <div className="font-[family-name:var(--font-michroma)] text-[9px] tracking-wider text-accent-red mb-1">
          SCENARIO INJECTION
        </div>
        <div className="text-[8px] font-mono text-text-muted mb-1.5">
          Activate disruption scenarios to stress-test the network. Each scenario shifts all three criticality horizons.
        </div>
        <div className="space-y-1 max-h-36 overflow-y-auto">
          {presetShocks.map((shock) => {
            const isActive = shocks.some((s) => s.id === shock.id);
            return (
              <button
                key={shock.id}
                onClick={() => !isActive && addShock(shock)}
                disabled={isActive}
                className="w-full text-left text-[8px] font-mono p-1.5 border rounded transition-colors disabled:opacity-30"
                style={{
                  borderColor: isActive ? "rgba(255,23,68,0.3)" : "var(--border)",
                  backgroundColor: isActive ? "rgba(255,23,68,0.05)" : "transparent",
                  color: isActive ? "var(--accent-red)" : "var(--text-muted)",
                }}
              >
                {shock.name}
                <span className="opacity-60 ml-1">SEV:{(shock.severity * 100).toFixed(0)}%</span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

function ProofTraceList() {
  const tarskiReport = useApexStore((s) => s.tarskiReport);
  const graphData = useApexStore((s) => s.graphData);
  const setSelectedNode = useApexStore((s) => s.setSelectedNode);

  if (!tarskiReport || tarskiReport.proofTraces.length === 0) return null;

  // Group traces by axiom for clearer display
  const tracesByAxiom = useMemo(() => {
    const groups: Record<string, typeof tarskiReport.proofTraces> = {};
    for (const trace of tarskiReport.proofTraces) {
      for (const axiomId of trace.violatedAxioms) {
        (groups[axiomId] ??= []).push(trace);
      }
    }
    return groups;
  }, [tarskiReport]);

  const axiomNames: Record<string, string> = {};
  AXIOM_LIBRARY.forEach((a) => { axiomNames[a.id] = a.name; });

  return (
    <div className="space-y-1.5">
      <div className="font-[family-name:var(--font-michroma)] text-[9px] tracking-wider text-text-muted">
        VIOLATION DETAILS ({tarskiReport.proofTraces.length})
      </div>
      <div className="max-h-48 overflow-y-auto space-y-1.5">
        {Object.entries(tracesByAxiom).map(([axiomId, traces]) => (
          <div key={axiomId} className="border border-border/50 rounded overflow-hidden">
            <div className="text-[8px] font-mono px-2 py-1 bg-surface-elevated flex items-center justify-between">
              <span className="text-foreground/80">
                {axiomId}: {axiomNames[axiomId] ?? axiomId}
              </span>
              <span className="text-accent-red">{traces.length}</span>
            </div>
            {traces.map((trace) => {
              const edge = graphData.edges.find((e) => e.id === trace.edgeId);
              const srcNode = edge ? graphData.nodes.find((n) => n.id === edge.source) : null;
              const tgtNode = edge ? graphData.nodes.find((n) => n.id === edge.target) : null;
              return (
                <div
                  key={trace.edgeId}
                  className="text-[8px] font-mono px-2 py-1 border-t border-border/30 cursor-pointer hover:bg-surface-elevated/50 transition-colors"
                  onClick={() => {
                    if (edge) setSelectedNode(edge.source);
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-foreground/70 truncate flex-1">
                      {srcNode?.label ?? "?"} → {tgtNode?.label ?? "?"}
                    </span>
                    <span
                      className="text-[7px] ml-1 flex-shrink-0"
                      style={{ color: trace.verdict === "REJECTED" ? "#ff1744" : "#ffab00" }}
                    >
                      {trace.verdict}
                    </span>
                  </div>
                  {edge && (
                    <div className="text-text-muted mt-0.5 truncate opacity-60" title={edge.physicalMechanism}>
                      {edge.physicalMechanism.slice(0, 55)}...
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

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

      {/* RELEVANT NOW — contextual callouts (selected-node or graph-wide) */}
      {relevantNowCallouts.length > 0 && (
        <div className="relative px-2 pt-2 pb-1.5 mt-1 rounded border border-accent-amber/40 bg-accent-amber/[0.04]">
          <div className="absolute -top-1.5 left-2 px-1 bg-bg-base text-[7px] font-[family-name:var(--font-michroma)] tracking-wider text-accent-amber">
            RELEVANT NOW
          </div>
          <div className="space-y-1">
            {relevantNowCallouts.map((c, i) => (
              <div key={`${c.label}-${i}`} className="text-[8px] font-mono leading-tight flex items-baseline gap-1.5">
                <span style={{ color: toneColor(c.tone) }}>▸</span>
                <span className="text-text-muted">{c.label}</span>
                <span className="text-text-primary tabular-nums">{c.value}</span>
                {c.detail && (
                  <span className="text-text-muted truncate">— {c.detail}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

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

// ─── Criticality Card (collapsible with time series) ────────────

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

type CriticalityEmptyState =
  | { kind: "awaiting-data"; inputs: string }
  | { kind: "pending-port"; reference: string };

/**
 * Compact a reference's full event label into a short inline phrase
 * for the card's per-selection lookup line. The full sentence stays in
 * the tooltip; this is just the version that fits under the headline.
 *
 *   "NBER US recession start in next 12 months" → "recession-onset rate"
 *   "OAS spike above rolling-156-week 95th percentile within next 24 weeks"
 *     → "credit-stress rate"
 *
 * Falls back to "event rate" for unknown shapes — never shows raw
 * builder-spec text on the card.
 */
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
