"use client";

// Extracted from ModulePanel.tsx so the Tarski tab's UI ships as its own
// chunk and doesn't weigh down the default Spirtes-tab paint. Pure
// extraction — TarskiPanel + its two private helpers (AxiomIcon,
// ProofTraceList). See PR history for the original inline definitions.

import { useCallback, useMemo, useState } from "react";
import { useApexStore } from "@/stores/useApexStore";
import { getDomainColor } from "@/lib/graph-data";
import { AXIOM_LIBRARY, scoreAxiomRelevance, type ScoredAxiom } from "@/lib/tarski-data";
import { resolveDomainProfile } from "@/lib/domain-profiles";

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


export default TarskiPanel;
