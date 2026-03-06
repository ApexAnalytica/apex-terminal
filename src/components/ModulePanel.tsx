"use client";

import { useMemo } from "react";
import { useApexStore } from "@/stores/useApexStore";
import { getPresetShocks } from "@/lib/omega-engine";
import { getEngineProvider } from "@/lib/engines";
import { getDomainColor } from "@/lib/graph-data";
import { AXIOM_LIBRARY, PROOF_TRACES } from "@/lib/tarski-data";
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
          {activeModule === "pearl" && "Counterfactual Engine \u2014 do-Calculus"}
          {activeModule === "pareto" && "Criticality Warning \u2014 \u03A9-Fragility Assessment"}
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
            <InterventionControls />
            <AblationPanel />
            <InterdictionPanel />
          </div>
        )}

        {activeModule === "pareto" && (
          <div className="p-4 space-y-3">
            <SnapshotIndicator />
            <ParetoPanel />
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

  return (
    <>
      <div className="font-[family-name:var(--font-michroma)] text-[10px] tracking-wider text-accent-green">
        TRUTH FILTER
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => { setTruthFilter("raw"); setSelectedNode(null); }}
          className="text-[9px] font-mono px-3 py-1.5 rounded border transition-colors"
          style={{
            borderColor: truthFilter === "raw" ? "var(--accent-green)" : "var(--border)",
            color: truthFilter === "raw" ? "var(--accent-green)" : "var(--text-muted)",
            backgroundColor: truthFilter === "raw" ? "rgba(0,230,118,0.08)" : "transparent",
          }}
        >
          RAW
        </button>
        <button
          onClick={() => {
            setTruthFilter("verified");
            const firstRestricted = graphData.nodes.find((n) => n.isRestricted);
            if (firstRestricted) {
              setSelectedNode(firstRestricted.id);
            } else {
              const firstInconsistentEdge = graphData.edges.find((e) => e.isInconsistent);
              if (firstInconsistentEdge) setSelectedNode(firstInconsistentEdge.source);
            }
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
      <div className="text-[9px] font-mono text-text-muted space-y-1 mt-2">
        <div>Inconsistent Edges: <span className="text-accent-red">{graphData.metadata.inconsistentEdges}</span></div>
        <div>Restricted Nodes: <span className="text-accent-amber">{graphData.metadata.restrictedNodes}</span></div>
        <div>Status: <span className="text-accent-green">{graphData.metadata.verificationStatus}</span></div>
      </div>
      {truthFilter === "verified" && (
        <div className="text-[9px] font-mono text-accent-red mt-2 p-2 border border-accent-red/30 rounded bg-accent-red/5">
          TARSKI FILTER ACTIVE — DETECTED: {graphData.metadata.inconsistentEdges} INCONSISTENT EDGES, {graphData.metadata.restrictedNodes} NODES RESTRICTED
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
  const effectiveBuffer = currentSnapshot ? currentSnapshot.omegaBuffer : omegaState.buffer;

  const doomsday = useMemo(
    () => engine.computeDoomsday(shocks, effectiveBuffer),
    [engine, shocks, effectiveBuffer]
  );

  const topNodes = useMemo(() => {
    return [...graphData.nodes]
      .sort((a, b) => b.omegaFragility.composite - a.omegaFragility.composite)
      .slice(0, 8);
  }, [graphData.nodes]);

  const regimeColors: Record<string, string> = {
    CRASH: "#ff1744",
    PHASE_TRANSITION: "#ffab00",
    MELT_UP: "#ffab00",
    STAGNATION: "#90a4ae",
    STABLE: "#00e676",
  };
  const regimeColor = regimeColors[doomsday.regimeType] || "#90a4ae";
  const countdownColor = doomsday.timeToFailureDays < 30 ? "#ff1744" : "var(--text-muted)";

  return (
    <>
      {/* Doomsday Clock */}
      <div className="font-[family-name:var(--font-michroma)] text-[10px] tracking-wider text-accent-red">
        DOOMSDAY CLOCK
      </div>
      <div className="p-2 border border-accent-red/20 rounded bg-accent-red/5 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-baseline gap-2">
            <span
              className="font-[family-name:var(--font-michroma)] text-[32px] font-bold tabular-nums leading-none"
              style={{ color: countdownColor }}
            >
              T-{doomsday.timeToFailureDays}
            </span>
            {replayActive && currentSnapshot && (
              <span className="text-[10px] font-mono tabular-nums" style={{ color: "var(--accent-cyan)" }}>
                t={currentSnapshot.epoch}
              </span>
            )}
          </div>
          <span
            className="text-[9px] font-mono px-2 py-0.5 rounded"
            style={{ color: regimeColor, backgroundColor: `${regimeColor}15`, border: `1px solid ${regimeColor}40` }}
          >
            {doomsday.regimeType.replace("_", " ")}
          </span>
        </div>
        {doomsday.dragonKingDetected && (
          <div className="flex items-center gap-1.5 text-[9px] font-mono text-accent-red">
            <span className="inline-block h-2 w-2 rounded-full bg-accent-red animate-pulse" />
            DRAGON KING DETECTED — P={doomsday.dragonKingProbability.toFixed(2)}
          </div>
        )}
        {/* Fragility Index bar */}
        <div>
          <div className="flex justify-between text-[8px] font-mono text-text-muted mb-0.5">
            <span>FRAGILITY INDEX</span>
            <span>{doomsday.fragilityIndex.toFixed(0)}/100</span>
          </div>
          <div className="h-1.5 w-full bg-border rounded overflow-hidden">
            <div
              className="h-full rounded transition-all duration-300"
              style={{
                width: `${doomsday.fragilityIndex}%`,
                background: `linear-gradient(90deg, #00e676, #ffab00, #ff1744)`,
              }}
            />
          </div>
        </div>
        <div className="text-[8px] font-mono text-text-muted space-y-0.5">
          <div>SINGULARITY: <span style={{ color: doomsday.singularityScore > 0 ? "#ff1744" : "var(--text-muted)" }}>{doomsday.singularityScore.toFixed(2)}</span></div>
          <div>LPPLS {"\u03C9"}={doomsday.lpplsOscFreq.toFixed(2)} | tc={doomsday.lpplsTc.toFixed(1)}d</div>
        </div>
      </div>

      {/* Ω-Fragility Assessment */}
      <div className="font-[family-name:var(--font-michroma)] text-[10px] tracking-wider text-accent-red mt-3">
        {"\u03A9"}-FRAGILITY ASSESSMENT
      </div>
      <div className="text-[9px] font-mono text-text-muted space-y-1">
        <div>Buffer: <span style={{ color: omegaState.status === "NOMINAL" ? "var(--accent-green)" : "var(--accent-red)" }}>{omegaState.buffer.toFixed(1)}%</span></div>
        <div>Status: <span className="text-accent-red">{omegaState.status}</span></div>
        <div>Active Shocks: {shocks.length}</div>
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
            ACTIVE SHOCKS
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

      {/* Shock Injector */}
      <div className="mt-3">
        <div className="font-[family-name:var(--font-michroma)] text-[9px] tracking-wider text-text-muted mb-1.5">
          INJECT SHOCK
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

  const filteredAxioms = useMemo(() => {
    if (axiomLevelFilter === "all") return AXIOM_LIBRARY;
    return AXIOM_LIBRARY.filter((a) => a.level === axiomLevelFilter);
  }, [axiomLevelFilter]);

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
        {filteredAxioms.map((axiom) => (
          <div
            key={axiom.id}
            className="text-[9px] font-mono p-1.5 border border-border/50 rounded bg-surface-elevated"
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
              <span className="text-foreground">{axiom.name}</span>
            </div>
            <div className="text-accent-green mt-0.5">{axiom.formalNotation}</div>
          </div>
        ))}
      </div>
      {/* Proof Traces (shown in VERIFIED mode) */}
      {truthFilter === "verified" && (
        <div className="space-y-1 mt-2">
          <div className="font-[family-name:var(--font-michroma)] text-[9px] tracking-wider text-text-muted">
            PROOF TRACES
          </div>
          {PROOF_TRACES.map((trace) => (
            <div
              key={trace.edgeId}
              className="text-[8px] font-mono p-1.5 border rounded"
              style={{
                borderColor: trace.verdict === "REJECTED" ? "rgba(255,23,68,0.3)" : "rgba(255,171,0,0.3)",
                backgroundColor: trace.verdict === "REJECTED" ? "rgba(255,23,68,0.05)" : "rgba(255,171,0,0.05)",
              }}
            >
              <div className="flex items-center justify-between">
                <span className="text-text-muted">Edge: <span className="text-foreground">{trace.edgeId}</span></span>
                <span style={{ color: trace.verdict === "REJECTED" ? "#ff1744" : "#ffab00" }}>
                  {trace.verdict}
                </span>
              </div>
              <div className="text-text-muted mt-0.5">
                Violated: {trace.violatedAxioms.join(", ")} | {trace.solverUsed} | {trace.checkTimeMs}ms
              </div>
            </div>
          ))}
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
