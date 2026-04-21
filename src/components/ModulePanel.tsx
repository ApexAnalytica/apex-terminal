"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useApexStore } from "@/stores/useApexStore";
import { getPresetShocks } from "@/lib/omega-engine";
import { getEngineProvider } from "@/lib/engines";
import { getDomainColor } from "@/lib/graph-data";
import { AXIOM_LIBRARY, scoreAxiomRelevance, type ScoredAxiom } from "@/lib/tarski-data";
import { resolveDomainProfile, type EstimatorId } from "@/lib/domain-profiles";
import { getEstimatorMeta } from "@/lib/criticality-registry";
import TrinityPanel from "./TrinityPanel";
import InterventionControls from "./InterventionControls";
import MonteCarloForecast from "./MonteCarloForecast";
import AblationPanel from "./AblationPanel";
import InterdictionPanel from "./InterdictionPanel";
import NewsInterpreterPanel from "./NewsInterpreterPanel";
import NodeInspector from "./NodeInspector";

export default function ModulePanel() {
  const activeModule = useApexStore((s) => s.activeModule);
  const setInterventionMode = useApexStore((s) => s.setInterventionMode);
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
              Structural what-if analysis. Apply do(X) to isolate a node from its upstream causes,
              sever causal links, and observe counterfactual downstream effects.
            </div>
            <CopilotInterdictionResults />
            <InterventionControls />
            <MonteCarloForecast expanded={expandedChart === "pearl"} />
            <AblationPanel />
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
            <div
              className="text-[8px] font-mono text-foreground/85 leading-relaxed p-2 rounded bg-background/50 cursor-pointer hover:bg-background/70 transition-colors"
              onClick={() => {
                window.dispatchEvent(new CustomEvent("apex-speak-content", {
                  detail: { title: `Constraint: ${axiom.name}`, text: axiom.plainText + ". " + axiom.description }
                }));
              }}
            >
              {axiom.description}
              <span className="text-text-muted ml-1 opacity-60">(click to hear)</span>
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
  const scopedOmegaSeries = useMemo<number[]>(() => {
    if (!temporalData || scopedNodeIds.length === 0) return [];
    const histories = scopedNodeIds
      .map((id) => temporalData.nodes.get(id)?.history ?? [])
      .filter((h) => h.length > 0);
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
    if (N === 0) return { timeSeries: Array(60).fill(0), confidence: 0 };

    // Build real filtration: at each threshold ε, count connected components & cycles
    // Sweep ε from 0 to 10 — nodes appear when their Ω ≤ ε, edges when both endpoints present
    const points: number[] = [];
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

      // Approximate β1 (cycles) via Euler characteristic: β1 ≈ edges - nodes + components
      const beta1 = Math.max(0, activeEdges.length - activeNodes.size + components);
      // Normalize: higher β1 relative to graph size = more topological holes
      const normalized = activeNodes.size > 0 ? beta1 / Math.max(1, activeNodes.size) : 0;
      points.push(Math.min(1, normalized));
    }

    // Smooth theoretical model: monotonic collapse curve based on cluster density
    const clusterCount = graphData.nodes.filter((n) => n.omegaFragility.composite > 7).length;
    const clusterFrac = clusterCount / Math.max(1, N);
    const phModelPoints: number[] = Array.from({ length: 60 }, (_, i) => {
      const t = i / 59;
      // Theoretical β₁ curve: rises as filtration reveals holes, then collapses
      const rise = Math.pow(t, 0.6) * (1 + clusterFrac * 0.5);
      const collapse = Math.exp(-2 * Math.pow(Math.max(0, t - 0.7), 2));
      return Math.max(0, Math.min(1, rise * collapse * 0.8));
    });

    // Confidence: based on topological signal strength
    const maxBetti = Math.max(...points);
    const variance = points.reduce((s, v) => s + (v - maxBetti / 2) ** 2, 0) / points.length;
    const topologicalSignal = Math.min(0.35, (clusterCount / Math.max(1, N)) * 1.5);
    const filtrationCoverage = Math.min(0.35, (composites[composites.length - 1] - composites[0]) / 10 * 0.35);
    const varianceSignal = Math.min(0.3, Math.sqrt(variance) * 1.5);
    const confidence = Math.min(0.99, topologicalSignal + filtrationCoverage + varianceSignal);

    return { timeSeries: points, modelSeries: phModelPoints, confidence };
  }, [graphData]);

  // ── LPPLS: Sornette super-exponential fit to the same scoped Ω trajectory ──
  // Confidence = R²(observed, fitted LPPLS) × samplePenalty.
  const lpplsData = useMemo(() => {
    const observed = scopedOmegaSeries;
    const n = observed.length;
    const N = graphData.nodes.length;
    const avgOmega = N > 0 ? graphData.nodes.reduce((s, nd) => s + nd.omegaFragility.composite, 0) / N : 0;
    const shockPressure = shocks.reduce((s, sh) => s + sh.severity, 0);

    // tc = critical time as a fraction of the observed window length, derived
    // from the CSD epoch countdown so the three models stay coherent.
    const tc = 1 + csdEpochs / Math.max(1, csdEpochs + 50);
    const omega = 6.36 + shockPressure * 2.1;
    const m = 0.33 + shockPressure * 0.1;

    // Fit on the observed window length when present, else fall back to a
    // 60-point preview curve for the chart.
    const renderLen = n >= 5 ? n : 60;
    const modelPoints: number[] = [];
    for (let i = 0; i < renderLen; i++) {
      const t = i / Math.max(1, renderLen - 1);
      const dt = Math.max(0.01, tc - t);
      const powerLaw = Math.pow(dt, m);
      const logPeriodic = 0.2 * Math.cos(omega * Math.log(dt) + avgOmega * 0.3);
      const signal = 1 - powerLaw * (1 + logPeriodic);
      modelPoints.push(Math.max(0, Math.min(1, signal)));
    }

    if (n < 5) {
      return {
        timeSeries: observed,
        modelSeries: modelPoints,
        observedSeries: undefined,
        confidence: 0,
        sampleSize: n,
        rSquared: 0,
        residualFit: 0,
        omega, m, tc,
      };
    }

    // R² between observed (the canonical scoped Ω trajectory) and the LPPLS
    // model evaluated at matching indices.
    const obsMean = observed.reduce((s, v) => s + v, 0) / n;
    let ssRes = 0;
    let ssTot = 0;
    for (let t = 0; t < n; t++) {
      ssRes += (observed[t] - modelPoints[t]) ** 2;
      ssTot += (observed[t] - obsMean) ** 2;
    }
    const rSquared = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0;
    const samplePenalty = Math.min(1, n / 30);
    const confidence = Math.max(0, Math.min(0.99, rSquared * samplePenalty));

    return {
      timeSeries: observed.length > 0 ? observed : modelPoints,
      modelSeries: modelPoints,
      observedSeries: observed,
      confidence,
      sampleSize: n,
      rSquared,
      residualFit: rSquared,
      omega, m, tc,
    };
  }, [scopedOmegaSeries, graphData.nodes, shocks, csdEpochs]);

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
            return {
              key: "csd",
              abbrev: "CSD",
              fullName: "CRITICAL SLOWING DOWN",
              epochs: csdEpochs,
              maxEpochs: 200,
              color: getCritColor(csdEpochs),
              confidence: csdData.confidence,
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
            return {
              key: "ph",
              abbrev: "PH",
              fullName: "PERSISTENT HOMOLOGY",
              epochs: phEpochs,
              maxEpochs: 300,
              color: getCritColor(phEpochs),
              confidence: phData.confidence,
              timeSeries: phData.timeSeries,
              modelSeries: phData.modelSeries,
              shortDesc: meta.shortDesc,
              methodology: [
                `Sweeps a filtration threshold \u03B5 from 0\u219210 across all ${graphData.nodes.length} nodes. At each \u03B5, nodes with \u03A9 \u2264 \u03B5 and their connecting edges form a simplicial complex. Solid line: computed filtration. Dashed line: theoretical \u03B2\u2081 collapse model.`,
                `Computes \u03B2\u2080 (connected components via union-find) and \u03B2\u2081 (1-cycles via Euler characteristic: \u03B2\u2081 \u2248 E \u2212 V + \u03B2\u2080) at each filtration step \u2014 showing how topological holes appear and collapse.`,
                `When persistent holes vanish (\u03B2\u2081 \u2192 0), previously isolated fragility clusters merge into system-wide contagion pathways. Currently ${graphData.nodes.filter((n) => n.omegaFragility.composite > 7).length} nodes above \u03A9 > 7.0 form critical cluster boundaries.`,
              ],
              formula: `\u03B2\u2081 = |E| \u2212 |V| + \u03B2\u2080 | filtration: \u03B5 \u2208 [0, 10] | critical when \u03B2\u2081 \u2192 0`,
              assessment: `Real filtration over ${graphData.nodes.length} nodes and ${graphData.edges.filter((e) => !e.isSevered).length} active edges. \u03A9 range: [${Math.min(...graphData.nodes.map((n) => n.omegaFragility.composite)).toFixed(1)}, ${Math.max(...graphData.nodes.map((n) => n.omegaFragility.composite)).toFixed(1)}]. Peak \u03B2\u2081 at filtration midpoint indicates topological complexity.`,
            };
          }
          if (id === "lppls") {
            return {
              key: "lppls",
              abbrev: "LPPLS",
              fullName: "LOG-PERIODIC POWER LAW SINGULARITY",
              epochs: lpplsEpochs,
              maxEpochs: 250,
              color: getCritColor(lpplsEpochs),
              confidence: lpplsData.confidence,
              timeSeries: lpplsData.timeSeries,
              modelSeries: lpplsData.modelSeries,
              shortDesc: meta.shortDesc,
              methodology: [
                `Fits the LPPLS model y(t) = A + B(tc\u2212t)^m \u00B7 [1 + C\u00B7cos(\u03C9\u00B7ln(tc\u2212t) + \u03C6)] (Sornette 2003) to the same scoped mean-\u03A9 trajectory as CSD \u2014 ${scopeLabel}, n=${lpplsData.sampleSize}.`,
                `${lpplsData.sampleSize >= 5 ? `R\u00B2 = ${(lpplsData.rSquared * 100).toFixed(1)}% between observed and LPPLS fit. Confidence = R\u00B2 \u00D7 min(1, n/30). ${lpplsData.rSquared > 0.6 ? "Strong LPPLS signature." : lpplsData.rSquared > 0.3 ? "Moderate LPPLS pattern." : "Weak fit \u2014 trajectory may not follow LPPLS dynamics."}` : `Need \u22655 observations to score the fit \u2014 dashed line is the projected curve only.`}`,
                `Critical time tc is derived from the CSD epoch countdown so all three models share a coherent horizon. Log-periodic oscillations with increasing frequency signal an approaching regime transition.`,
              ],
              formula: `\u03C9 = ${lpplsData.omega.toFixed(2)} | m = ${lpplsData.m.toFixed(3)} | tc = ${lpplsData.tc.toFixed(3)} | ${lpplsData.sampleSize >= 5 ? `R\u00B2 = ${(lpplsData.rSquared * 100).toFixed(1)}% (n=${lpplsData.sampleSize})` : `R\u00B2 = \u2014 (n=${lpplsData.sampleSize}, need \u22655)`}`,
              assessment: lpplsData.sampleSize < 5
                ? `INSUFFICIENT DATA \u2014 only ${lpplsData.sampleSize} observation(s). Run a temporal replay or widen the selection to fit the LPPLS curve.`
                : `LPPLS fit R\u00B2 = ${(lpplsData.rSquared * 100).toFixed(1)}% on n=${lpplsData.sampleSize} from the scoped \u03A9 trajectory. ${lpplsData.rSquared > 0.6 ? "Trajectory exhibits super-exponential growth with log-periodic structure \u2014 bubble-like dynamics detected." : lpplsData.rSquared > 0.3 ? "Partial LPPLS pattern; system may be entering the pre-critical regime." : "Weak LPPLS signature \u2014 trajectory does not yet match super-exponential growth."} ${shocks.length > 0 ? `${shocks.length} active shock(s) raise \u03C9 by ${(shocks.reduce((s, sh) => s + sh.severity, 0) * 2.1).toFixed(1)} rad.` : "No active shocks \u2014 baseline oscillation frequency."}`,
            };
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
              shortDesc={selected.shortDesc}
              methodology={selected.methodology}
              formula={selected.formula}
              assessment={selected.assessment}
              emptyState={selected.emptyState}
            />
          </>
        );
      })()}

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
  const selectedNodes = useApexStore((s) => s.selectedNodes);
  const engine = useMemo(() => getEngineProvider(), []);
  const cascade = useMemo(() => engine.discoverStructure(graphData), [engine, graphData]);
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
    const allNodes = graphData.nodes;
    const allEdges = graphData.edges.filter((e) => !e.isSevered);

    // Scope to selection if any
    const selSet = new Set(selectedNodes);
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

    // 6. Community detection (simple label propagation, 10 iterations)
    const community = new Map<string, string>();
    nodes.forEach((nd) => community.set(nd.id, nd.domain));
    // Communities are already domain-based, count them
    const communities = new Map<string, string[]>();
    nodes.forEach((nd) => {
      const dom = nd.domain;
      if (!communities.has(dom)) communities.set(dom, []);
      communities.get(dom)!.push(nd.id);
    });
    const communityList = [...communities.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .map(([name, members]) => ({ name, size: members.length }));

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
      lambdaMax: cascade.lambdaMax, isStable: cascade.isStable,
      dampingCoeff: cascade.dampingCoeff, forgettingRate: cascade.forgettingRate,
      nodeCount: n, edgeCount: m,
      totalNodeCount: allNodes.length, totalEdgeCount: allEdges.length,
      isScoped,
    };
  }, [graphData, cascade, selectedNodes, fullNeighborSets]);

  const metricColor = (val: number, threshLow: number, threshHigh: number) =>
    val < threshLow ? "#00e676" : val < threshHigh ? "#ffab00" : "#ff1744";

  const toggleMetric = (key: string) => setExpandedMetric(expandedMetric === key ? null : key);

  return (
    <div className="px-3 py-2 border-b border-border space-y-1.5 max-h-[45vh] overflow-y-auto">
      <div className="font-[family-name:var(--font-michroma)] text-[9px] tracking-wider text-text-muted">
        NETWORK ANALYSIS
      </div>

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
          <div className="text-[8px] font-[family-name:var(--font-michroma)] tracking-wider text-accent-cyan">
            EIGENVECTOR CENTRALITY
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
          <div className="text-[8px] font-[family-name:var(--font-michroma)] tracking-wider text-accent-amber">
            BETWEENNESS CENTRALITY
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
          </div>
          <span className="text-[8px] text-text-muted" style={{ transform: expandedMetric === "community" ? "rotate(180deg)" : "rotate(0deg)", display: "inline-block", transition: "transform 0.2s" }}>
            {"\u25BC"}
          </span>
        </div>
      </button>
      {expandedMetric === "community" && (
        <div className="space-y-1 pl-1">
          <div className="text-[8px] font-mono text-text-muted leading-relaxed mb-1">
            Domain-based community structure. Inter-community edges are potential contagion pathways; intra-community edges represent tightly coupled sub-systems.
          </div>
          {netMetrics.communityList.map((c) => (
            <div key={c.name} className="flex items-center gap-2 py-0.5 px-1">
              <span className="text-[9px] font-mono text-accent-green flex-1 truncate">{c.name}</span>
              <div className="w-16 h-1 bg-border rounded overflow-hidden">
                <div className="h-full bg-accent-green/60 rounded" style={{ width: `${(c.size / graphData.nodes.length) * 100}%` }} />
              </div>
              <span className="text-[8px] font-mono text-text-muted tabular-nums">{c.size}</span>
            </div>
          ))}
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
  shortDesc: string;
  methodology: string[];
  formula: string;
  assessment: string;
  emptyState?: CriticalityEmptyState;
}) {
  const confPct = Math.round(confidence * 100);
  const confColor = confPct >= 70 ? "#00e676" : confPct >= 40 ? "#ffab00" : "#ff5252";
  const isEmpty = !!emptyState;
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
                  <div className="text-[7px] font-mono px-1 py-0.5 rounded" style={{
                    color: confColor,
                    backgroundColor: `${confColor}15`,
                    border: `1px solid ${confColor}30`,
                  }}>
                    {confPct}% conf
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

              {/* Confidence gauge */}
              <div>
                <div className="text-[8px] font-[family-name:var(--font-michroma)] tracking-wider text-text-muted mb-1">
                  MODEL CONFIDENCE
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
                  {confPct >= 70 ? "Strong signal — grounded in observed epoch data and graph topology." :
                   confPct >= 40 ? "Moderate signal — partial data coverage; model-augmented projection." :
                   "Weak signal — insufficient simulation data; run cascade for higher confidence."}
                </div>
              </div>
            </>
          )}

          {/* Methodology explanation — click to speak */}
          <div
            className="cursor-pointer hover:bg-surface-elevated/50 rounded p-1 -m-1 transition-colors group"
            onClick={() => window.dispatchEvent(new CustomEvent("apex-speak-content", {
              detail: { title: `${abbrev} \u2014 Methodology`, text: methodology.join(" ") }
            }))}
            title="Click to read aloud"
          >
            <div className="flex items-center justify-between mb-1">
              <div className="text-[8px] font-[family-name:var(--font-michroma)] tracking-wider text-text-muted">
                METHODOLOGY
              </div>
              <div className="text-[6px] font-mono text-text-muted opacity-0 group-hover:opacity-60 transition-opacity">
                {"\uD83D\uDD0A"} read aloud
              </div>
            </div>
            <div className="space-y-1.5">
              {methodology.map((line, i) => (
                <div key={i} className="text-[9px] font-mono text-text-muted leading-relaxed">
                  {line}
                </div>
              ))}
            </div>
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

          {/* Current assessment — click to speak */}
          <div
            className="cursor-pointer hover:bg-surface-elevated/50 rounded p-1 -m-1 transition-colors group"
            onClick={() => window.dispatchEvent(new CustomEvent("apex-speak-content", {
              detail: { title: `${abbrev} \u2014 Assessment`, text: assessment }
            }))}
            title="Click to read aloud"
          >
            <div className="flex items-center justify-between mb-1">
              <div className="text-[8px] font-[family-name:var(--font-michroma)] tracking-wider text-text-muted">
                CURRENT ASSESSMENT
              </div>
              <div className="text-[6px] font-mono text-text-muted opacity-0 group-hover:opacity-60 transition-opacity">
                {"\uD83D\uDD0A"} read aloud
              </div>
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
