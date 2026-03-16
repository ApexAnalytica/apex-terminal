"use client";

import { useMemo } from "react";
import { useApexStore } from "@/stores/useApexStore";
import { getPresetShocks } from "@/lib/omega-engine";
import { getEngineProvider } from "@/lib/engines";
import { getDomainColor } from "@/lib/graph-data";
import { AXIOM_LIBRARY } from "@/lib/tarski-data";
import TrinityPanel from "./TrinityPanel";
import InterventionControls from "./InterventionControls";
import AblationPanel from "./AblationPanel";
import InterdictionPanel from "./InterdictionPanel";
import NodeInspector from "./NodeInspector";

export default function ModulePanel() {
  const activeModule = useApexStore((s) => s.activeModule);

  return (
    <aside className="flex flex-col w-80 border-l border-border bg-surface h-full overflow-hidden" data-tour="module-panel">
      {/* Module Header */}
      <div className="px-4 py-3 border-b border-border bg-surface-elevated">
        <div className="font-[family-name:var(--font-michroma)] text-[10px] tracking-[0.25em] text-text-muted uppercase">
          {activeModule} Engine
        </div>
        <div className="text-[9px] text-text-muted font-mono mt-0.5">
          {activeModule === "spirtes" && "Structure Discovery \u2014 DCD / NOTEARS / PCMCI+ / FCI"}
          {activeModule === "tarski" && "Truth Verification \u2014 Physical Constraint Filter"}
          {activeModule === "pearl" && "Structural Intervention \u2014 do-Calculus & Counterfactuals"}
          {activeModule === "pareto" && "Scenario Stress Test \u2014 Shock Injection & Defense Optimization"}
        </div>
      </div>

      {/* Node Inspector (persistent across modules) */}
      <NodeInspector />

      {/* Module Content */}
      <div className="flex-1 overflow-y-auto">
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
            <InterventionControls />
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
            <ParetoPanel />
            <InterdictionPanel />
          </div>
        )}
      </div>
    </aside>
  );
}

function TarskiPanel() {
  const graphData = useApexStore((s) => s.graphData);
  const truthFilter = useApexStore((s) => s.truthFilter);
  const setTruthFilter = useApexStore((s) => s.setTruthFilter);
  const setSelectedNode = useApexStore((s) => s.setSelectedNode);
  const tarskiReport = useApexStore((s) => s.tarskiReport);

  return (
    <>
      <div className="font-[family-name:var(--font-michroma)] text-[10px] tracking-wider text-accent-green">
        TRUTH FILTER
      </div>
      <div className="text-[8px] font-mono text-text-muted mb-2">
        Validates causal edges against physical, regulatory, and heuristic axioms.
        VERIFIED mode flags structurally fragile links and restricted nodes.
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => { setTruthFilter("raw"); setSelectedNode(null); }}
          className="text-[9px] font-mono px-3 py-1.5 rounded border transition-colors"
          style={{
            borderColor: truthFilter === "raw" ? "var(--accent-cyan)" : "var(--border)",
            color: truthFilter === "raw" ? "var(--accent-cyan)" : "var(--text-muted)",
            backgroundColor: truthFilter === "raw" ? "rgba(0,229,255,0.08)" : "transparent",
          }}
        >
          RAW
        </button>
        <button
          onClick={() => {
            setTruthFilter("verified");
            // After validation runs, select first restricted node
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
          }}
          className="text-[9px] font-mono px-3 py-1.5 rounded border transition-colors"
          style={{
            borderColor: truthFilter === "verified" ? "var(--accent-green)" : "var(--border)",
            color: truthFilter === "verified" ? "var(--accent-green)" : "var(--text-muted)",
            backgroundColor: truthFilter === "verified" ? "rgba(0,230,118,0.08)" : "transparent",
          }}
        >
          VERIFIED
        </button>
      </div>

      {/* Status display */}
      <div className="text-[9px] font-mono text-text-muted space-y-1 mt-2">
        <div className="flex items-center justify-between">
          <span>Status:</span>
          <span style={{
            color: graphData.metadata.verificationStatus === "UNVERIFIED"
              ? "var(--text-muted)"
              : graphData.metadata.verificationStatus === "VERIFIED"
                ? "var(--accent-green)"
                : "#ff1744"
          }}>
            {graphData.metadata.verificationStatus}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span>Inconsistent Edges:</span>
          <span style={{ color: graphData.metadata.inconsistentEdges > 0 ? "#ff1744" : "var(--text-muted)" }}>
            {graphData.metadata.inconsistentEdges}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span>Restricted Nodes:</span>
          <span style={{ color: graphData.metadata.restrictedNodes > 0 ? "#ffab00" : "var(--text-muted)" }}>
            {graphData.metadata.restrictedNodes}
          </span>
        </div>
      </div>

      {truthFilter === "verified" && tarskiReport && (
        <div className="text-[9px] font-mono mt-2 p-2 border rounded"
          style={{
            borderColor: tarskiReport.totalViolations > 0 ? "rgba(255,23,68,0.3)" : "rgba(0,230,118,0.3)",
            backgroundColor: tarskiReport.totalViolations > 0 ? "rgba(255,23,68,0.05)" : "rgba(0,230,118,0.05)",
            color: tarskiReport.totalViolations > 0 ? "#ff1744" : "#00e676",
          }}
        >
          TARSKI FILTER ACTIVE — {tarskiReport.totalViolations} VIOLATIONS DETECTED
          <div className="text-[8px] text-text-muted mt-1">
            {tarskiReport.proofTraces.length} proof traces generated across {
              new Set(tarskiReport.proofTraces.flatMap(t => t.violatedAxioms)).size
            } axioms
          </div>
        </div>
      )}

      {/* Restricted node list (when verified) */}
      {truthFilter === "verified" && tarskiReport && tarskiReport.restrictedNodeIds.size > 0 && (
        <div className="mt-2 space-y-1">
          <div className="font-[family-name:var(--font-michroma)] text-[9px] tracking-wider text-accent-amber">
            RESTRICTED NODES ({tarskiReport.restrictedNodeIds.size})
          </div>
          <div className="max-h-28 overflow-y-auto space-y-0.5">
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

      <AxiomLibrary />
    </>
  );
}

function ParetoPanel() {
  const shocks = useApexStore((s) => s.shocks);
  const addShock = useApexStore((s) => s.addShock);
  const removeShock = useApexStore((s) => s.removeShock);
  const graphData = useApexStore((s) => s.graphData);
  const selectedNode = useApexStore((s) => s.selectedNode);
  const setSelectedNode = useApexStore((s) => s.setSelectedNode);
  const replayActive = useApexStore((s) => s.replayActive);
  const currentEpoch = useApexStore((s) => s.currentEpoch);
  const baselineEpochs = useApexStore((s) => s.baselineEpochs);
  const interventionEpochs = useApexStore((s) => s.interventionEpochs);
  const activeTimeline = useApexStore((s) => s.activeTimeline);
  const engine = useMemo(() => getEngineProvider(), []);
  const presetShocks = useMemo(() => getPresetShocks(), []);
  const omegaState = useMemo(() => engine.scanTailRisk(shocks), [engine, shocks]);

  // During replay, derive buffer from current epoch snapshot for dynamic T=
  const replayEpochs = activeTimeline === "baseline" ? baselineEpochs : interventionEpochs;
  const currentSnapshot = replayActive && replayEpochs.length > 0
    ? replayEpochs[currentEpoch] ?? null
    : null;
  // ── Derive three criticality countdowns ──
  // CSD: Cascade Structural Damage — based on spectral radius and cascade load
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

  // Criticality card helper
  const getCritColor = (epochs: number) =>
    epochs < 20 ? "#ff1744" : epochs < 80 ? "#ffab00" : "#00e676";

  return (
    <>
      {/* Three Criticality Modules */}
      <div className="font-[family-name:var(--font-michroma)] text-[10px] tracking-wider text-text-muted">
        CRITICALITY HORIZONS
      </div>
      <div className="space-y-2">
        {/* CSD — Cascade Structural Damage */}
        <div className="p-2.5 border rounded space-y-1.5" style={{
          borderColor: `${getCritColor(csdEpochs)}30`,
          backgroundColor: `${getCritColor(csdEpochs)}05`,
        }}>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[9px] font-[family-name:var(--font-michroma)] tracking-wider" style={{ color: getCritColor(csdEpochs) }}>
                CSD
              </div>
              <div className="text-[7px] font-mono text-text-muted">CASCADE STRUCTURAL DAMAGE</div>
            </div>
            <div className="text-right">
              <span
                className="font-[family-name:var(--font-michroma)] text-[22px] font-bold tabular-nums leading-none"
                style={{ color: getCritColor(csdEpochs) }}
              >
                T-{csdEpochs}
              </span>
              <div className="text-[7px] font-mono text-text-muted">EPOCHS</div>
            </div>
          </div>
          <div className="h-1 w-full bg-border rounded overflow-hidden">
            <div className="h-full rounded transition-all duration-500" style={{
              width: `${Math.min(100, (csdEpochs / 200) * 100)}%`,
              backgroundColor: getCritColor(csdEpochs),
              opacity: 0.7,
            }} />
          </div>
          <div className="text-[7px] font-mono text-text-muted">
            Spectral radius propagation — epochs until cascade failure exceeds recovery capacity
          </div>
        </div>

        {/* PH — Persistent Homology */}
        <div className="p-2.5 border rounded space-y-1.5" style={{
          borderColor: `${getCritColor(phEpochs)}30`,
          backgroundColor: `${getCritColor(phEpochs)}05`,
        }}>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[9px] font-[family-name:var(--font-michroma)] tracking-wider" style={{ color: getCritColor(phEpochs) }}>
                PH
              </div>
              <div className="text-[7px] font-mono text-text-muted">PERSISTENT HOMOLOGY</div>
            </div>
            <div className="text-right">
              <span
                className="font-[family-name:var(--font-michroma)] text-[22px] font-bold tabular-nums leading-none"
                style={{ color: getCritColor(phEpochs) }}
              >
                T-{phEpochs}
              </span>
              <div className="text-[7px] font-mono text-text-muted">EPOCHS</div>
            </div>
          </div>
          <div className="h-1 w-full bg-border rounded overflow-hidden">
            <div className="h-full rounded transition-all duration-500" style={{
              width: `${Math.min(100, (phEpochs / 300) * 100)}%`,
              backgroundColor: getCritColor(phEpochs),
              opacity: 0.7,
            }} />
          </div>
          <div className="text-[7px] font-mono text-text-muted">
            Topological fragility holes — epochs until high-{"\u03A9"} cluster boundaries collapse
          </div>
        </div>

        {/* LPPLS — Log-Periodic Power Law Singularity */}
        <div className="p-2.5 border rounded space-y-1.5" style={{
          borderColor: `${getCritColor(lpplsEpochs)}30`,
          backgroundColor: `${getCritColor(lpplsEpochs)}05`,
        }}>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[9px] font-[family-name:var(--font-michroma)] tracking-wider" style={{ color: getCritColor(lpplsEpochs) }}>
                LPPLS
              </div>
              <div className="text-[7px] font-mono text-text-muted">LOG-PERIODIC POWER LAW SINGULARITY</div>
            </div>
            <div className="text-right">
              <span
                className="font-[family-name:var(--font-michroma)] text-[22px] font-bold tabular-nums leading-none"
                style={{ color: getCritColor(lpplsEpochs) }}
              >
                T-{lpplsEpochs}
              </span>
              <div className="text-[7px] font-mono text-text-muted">EPOCHS</div>
            </div>
          </div>
          <div className="h-1 w-full bg-border rounded overflow-hidden">
            <div className="h-full rounded transition-all duration-500" style={{
              width: `${Math.min(100, (lpplsEpochs / 250) * 100)}%`,
              backgroundColor: getCritColor(lpplsEpochs),
              opacity: 0.7,
            }} />
          </div>
          <div className="text-[7px] font-mono text-text-muted">
            Super-exponential fragility growth — epochs until singularity (tc) is reached
          </div>
        </div>
      </div>

      {/* Ω-Fragility Assessment */}
      <div className="font-[family-name:var(--font-michroma)] text-[10px] tracking-wider text-text-muted mt-3">
        {"\u03A9"}-FRAGILITY ASSESSMENT
      </div>
      <div className="text-[9px] font-mono text-text-muted space-y-1">
        <div>Buffer: <span style={{ color: omegaState.status === "NOMINAL" ? "var(--accent-green)" : "var(--accent-red)" }}>{omegaState.buffer.toFixed(1)}%</span></div>
        <div>Status: <span style={{ color: omegaState.status === "NOMINAL" ? "var(--accent-green)" : "var(--accent-red)" }}>{omegaState.status}</span></div>
        <div>Active Scenarios: {shocks.length}</div>
      </div>

      {/* Ω-Fragility Ranking */}
      <div className="mt-3">
        <div className="font-[family-name:var(--font-michroma)] text-[9px] tracking-wider text-text-muted mb-2">
          TOP {"\u03A9"}-CRITICAL NODES
        </div>
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

function AxiomLibrary() {
  const axiomLevelFilter = useApexStore((s) => s.axiomLevelFilter);
  const setAxiomLevelFilter = useApexStore((s) => s.setAxiomLevelFilter);
  const truthFilter = useApexStore((s) => s.truthFilter);
  const tarskiReport = useApexStore((s) => s.tarskiReport);
  const setSelectedNode = useApexStore((s) => s.setSelectedNode);
  const graphData = useApexStore((s) => s.graphData);

  const filteredAxioms = useMemo(() => {
    if (axiomLevelFilter === "all") return AXIOM_LIBRARY;
    return AXIOM_LIBRARY.filter((a) => a.level === axiomLevelFilter);
  }, [axiomLevelFilter]);

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

  const levelLabels: { value: "all" | 0 | 1 | 2; label: string }[] = [
    { value: "all", label: "ALL" },
    { value: 0, label: "L0" },
    { value: 1, label: "L1" },
    { value: 2, label: "L2" },
  ];

  const levelColors = ["#00e676", "#ffab00", "#90a4ae"];

  return (
    <div className="space-y-2 mt-3 pt-3 border-t border-border">
      <div className="font-[family-name:var(--font-michroma)] text-[10px] tracking-wider text-accent-green">
        AXIOM LIBRARY
      </div>
      {/* Level filter tabs */}
      <div className="flex gap-1">
        {levelLabels.map((lvl) => (
          <button
            key={String(lvl.value)}
            onClick={() => setAxiomLevelFilter(lvl.value)}
            className="text-[8px] font-mono px-2 py-1 rounded border transition-colors"
            style={{
              borderColor: axiomLevelFilter === lvl.value ? "var(--accent-green)" : "var(--border)",
              color: axiomLevelFilter === lvl.value ? "var(--accent-green)" : "var(--text-muted)",
              backgroundColor: axiomLevelFilter === lvl.value ? "rgba(0,230,118,0.08)" : "transparent",
            }}
          >
            {lvl.label}
          </button>
        ))}
      </div>
      {/* Axiom list */}
      <div className="space-y-1 max-h-48 overflow-y-auto">
        {filteredAxioms.map((axiom) => {
          const violationCount = axiomViolationCounts[axiom.id] || 0;
          const hasViolations = truthFilter === "verified" && violationCount > 0;
          return (
            <div
              key={axiom.id}
              className="text-[9px] font-mono p-1.5 border rounded bg-surface-elevated"
              style={{
                borderColor: hasViolations ? "rgba(255,23,68,0.3)" : "var(--border)",
                backgroundColor: hasViolations ? "rgba(255,23,68,0.05)" : undefined,
              }}
            >
              <div className="flex items-center gap-1.5">
                <span
                  className="text-[7px] px-1 rounded"
                  style={{
                    color: levelColors[axiom.level],
                    backgroundColor: `${levelColors[axiom.level]}15`,
                  }}
                >
                  L{axiom.level}
                </span>
                <span className="text-text-muted">{axiom.id}</span>
                <span className="text-foreground flex-1">{axiom.name}</span>
                {hasViolations && (
                  <span className="text-[7px] px-1.5 py-0.5 rounded bg-accent-red/10 text-accent-red">
                    {violationCount}
                  </span>
                )}
              </div>
              <div className="text-accent-green mt-0.5">{axiom.formalNotation}</div>
              {hasViolations && (
                <div className="text-accent-red mt-0.5 text-[8px]">
                  {axiom.description}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {/* Proof Traces (shown in VERIFIED mode) */}
      {truthFilter === "verified" && tarskiReport && tarskiReport.proofTraces.length > 0 && (
        <div className="space-y-1 mt-2">
          <div className="font-[family-name:var(--font-michroma)] text-[9px] tracking-wider text-text-muted">
            PROOF TRACES ({tarskiReport.proofTraces.length})
          </div>
          <div className="max-h-40 overflow-y-auto space-y-1">
            {tarskiReport.proofTraces.map((trace) => {
              // Find the edge label for human-readable display
              const edge = graphData.edges.find((e) => e.id === trace.edgeId);
              const shortId = trace.edgeId.length > 30
                ? trace.edgeId.slice(0, 28) + "..."
                : trace.edgeId;
              return (
                <div
                  key={trace.edgeId}
                  className="text-[8px] font-mono p-1.5 border rounded cursor-pointer hover:brightness-125 transition-all"
                  style={{
                    borderColor: trace.verdict === "REJECTED" ? "rgba(255,23,68,0.3)" : "rgba(255,171,0,0.3)",
                    backgroundColor: trace.verdict === "REJECTED" ? "rgba(255,23,68,0.05)" : "rgba(255,171,0,0.05)",
                  }}
                  onClick={() => {
                    if (edge) setSelectedNode(edge.source);
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-text-muted truncate flex-1" title={trace.edgeId}>
                      {shortId}
                    </span>
                    <span style={{ color: trace.verdict === "REJECTED" ? "#ff1744" : "#ffab00" }}>
                      {trace.verdict}
                    </span>
                  </div>
                  <div className="text-text-muted mt-0.5">
                    Violated: {trace.violatedAxioms.join(", ")} | {trace.solverUsed} | {trace.checkTimeMs}ms
                  </div>
                  {edge && (
                    <div className="text-text-muted mt-0.5 truncate" title={edge.physicalMechanism}>
                      {edge.physicalMechanism.slice(0, 60)}...
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
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
  const engine = useMemo(() => getEngineProvider(), []);
  const cascade = useMemo(() => engine.discoverStructure(graphData), [engine, graphData]);

  return (
    <div className="px-4 py-2 border-b border-border space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="text-[8px] font-mono text-text-muted">
          dS/dt = −{cascade.dampingCoeff.toFixed(2)}·S + {cascade.forgettingRate.toFixed(2)}
        </div>
        <span
          className="text-[8px] font-mono px-1.5 py-0.5 rounded border"
          style={{
            color: cascade.isStable ? "#00e676" : "#ff1744",
            borderColor: cascade.isStable ? "rgba(0,230,118,0.3)" : "rgba(255,23,68,0.3)",
            backgroundColor: cascade.isStable ? "rgba(0,230,118,0.05)" : "rgba(255,23,68,0.05)",
          }}
        >
          {"\u03BB"}max={cascade.lambdaMax.toFixed(2)} {cascade.isStable ? "STABLE" : "UNSTABLE"}
        </span>
      </div>
      <div className="flex gap-1">
        {cascade.topCentralityNodes.map((n) => (
          <span
            key={n.nodeId}
            className="text-[7px] font-mono px-1.5 py-0.5 rounded bg-accent-cyan/5 border border-accent-cyan/20 text-accent-cyan"
          >
            {n.label} ({n.centrality.toFixed(2)})
          </span>
        ))}
      </div>
    </div>
  );
}
