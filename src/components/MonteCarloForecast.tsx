"use client";

import { useMemo, useState, useCallback } from "react";
import { useApexStore } from "@/stores/useApexStore";
import {
  runMonteCarloForecast,
  type MCForecastResult,
  type EpochStats,
} from "@/lib/monte-carlo-engine";

// ─── Mini Sparkline SVG ────────────────────────────────────────
function ForecastChart({
  baselineStats,
  interventionStats,
  horizonEpochs,
  metric,
}: {
  baselineStats: EpochStats[];
  interventionStats: EpochStats[];
  horizonEpochs: number;
  metric: string;
}) {
  const W = 280;
  const H = 120;
  const PAD = { top: 8, right: 8, bottom: 20, left: 32 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  // Scale helpers
  const xScale = (epoch: number) => PAD.left + (epoch / horizonEpochs) * plotW;
  const yMin = 0;
  const yMax = 100;
  const yScale = (v: number) => PAD.top + plotH - ((v - yMin) / (yMax - yMin)) * plotH;

  // Path generators
  const linePath = (stats: EpochStats[], accessor: (s: EpochStats) => number) =>
    stats.map((s, i) => `${i === 0 ? "M" : "L"} ${xScale(s.epoch).toFixed(1)} ${yScale(accessor(s)).toFixed(1)}`).join(" ");

  const bandPath = (stats: EpochStats[], lo: (s: EpochStats) => number, hi: (s: EpochStats) => number) => {
    const upper = stats.map((s) => `${xScale(s.epoch).toFixed(1)},${yScale(hi(s)).toFixed(1)}`);
    const lower = [...stats].reverse().map((s) => `${xScale(s.epoch).toFixed(1)},${yScale(lo(s)).toFixed(1)}`);
    return `M ${upper.join(" L ")} L ${lower.join(" L ")} Z`;
  };

  // Grid lines
  const gridYValues = [0, 25, 50, 75, 100];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 140 }}>
      {/* Grid */}
      {gridYValues.map((v) => (
        <g key={v}>
          <line
            x1={PAD.left} y1={yScale(v)} x2={W - PAD.right} y2={yScale(v)}
            stroke="var(--border)" strokeWidth={0.5} strokeDasharray="2,3"
          />
          <text x={PAD.left - 4} y={yScale(v) + 3} textAnchor="end"
            fill="var(--text-muted)" fontSize={6} fontFamily="monospace">
            {v}
          </text>
        </g>
      ))}

      {/* X axis labels */}
      {[0, Math.round(horizonEpochs / 2), horizonEpochs].map((e) => (
        <text key={e} x={xScale(e)} y={H - 4} textAnchor="middle"
          fill="var(--text-muted)" fontSize={6} fontFamily="monospace">
          t{e}
        </text>
      ))}

      {/* Baseline band (p10-p90) */}
      <path
        d={bandPath(baselineStats, (s) => s.p10, (s) => s.p90)}
        fill="rgba(100,100,130,0.12)" stroke="none"
      />
      {/* Baseline IQR band (p25-p75) */}
      <path
        d={bandPath(baselineStats, (s) => s.p25, (s) => s.p75)}
        fill="rgba(100,100,130,0.18)" stroke="none"
      />
      {/* Baseline median */}
      <path
        d={linePath(baselineStats, (s) => s.p50)}
        fill="none" stroke="rgba(160,160,180,0.6)" strokeWidth={1} strokeDasharray="3,2"
      />

      {/* Intervention band (p10-p90) */}
      <path
        d={bandPath(interventionStats, (s) => s.p10, (s) => s.p90)}
        fill="rgba(0,229,255,0.08)" stroke="none"
      />
      {/* Intervention IQR band (p25-p75) */}
      <path
        d={bandPath(interventionStats, (s) => s.p25, (s) => s.p75)}
        fill="rgba(0,229,255,0.15)" stroke="none"
      />
      {/* Intervention median */}
      <path
        d={linePath(interventionStats, (s) => s.p50)}
        fill="none" stroke="var(--accent-cyan)" strokeWidth={1.2}
      />
      {/* Intervention mean */}
      <path
        d={linePath(interventionStats, (s) => s.mean)}
        fill="none" stroke="var(--accent-amber)" strokeWidth={0.8} strokeDasharray="1,2"
      />

      {/* Legend */}
      <line x1={PAD.left + 4} y1={PAD.top + 2} x2={PAD.left + 16} y2={PAD.top + 2}
        stroke="rgba(160,160,180,0.6)" strokeWidth={1} strokeDasharray="3,2" />
      <text x={PAD.left + 19} y={PAD.top + 5} fill="var(--text-muted)" fontSize={5.5} fontFamily="monospace">
        BASELINE
      </text>
      <line x1={PAD.left + 4} y1={PAD.top + 10} x2={PAD.left + 16} y2={PAD.top + 10}
        stroke="var(--accent-cyan)" strokeWidth={1.2} />
      <text x={PAD.left + 19} y={PAD.top + 13} fill="var(--accent-cyan)" fontSize={5.5} fontFamily="monospace">
        do(X) INTERVENTION
      </text>

      {/* Axis label */}
      <text x={W / 2} y={H - 12} textAnchor="middle"
        fill="var(--text-muted)" fontSize={5} fontFamily="monospace">
        {metric}
      </text>
    </svg>
  );
}

// ─── Downstream Node Sparklines ────────────────────────────────
function NodeSparkline({
  label,
  baselineValues,
  interventionValues,
  horizonEpochs,
}: {
  label: string;
  baselineValues: number[];
  interventionValues: number[];
  horizonEpochs: number;
}) {
  const W = 120;
  const H = 28;
  const xScale = (i: number) => (i / horizonEpochs) * W;
  const yScale = (v: number) => H - ((v / 10) * H);

  const basePath = baselineValues.map((v, i) =>
    `${i === 0 ? "M" : "L"} ${xScale(i).toFixed(1)} ${yScale(v).toFixed(1)}`
  ).join(" ");

  const intPath = interventionValues.map((v, i) =>
    `${i === 0 ? "M" : "L"} ${xScale(i).toFixed(1)} ${yScale(v).toFixed(1)}`
  ).join(" ");

  const lastBase = baselineValues[baselineValues.length - 1];
  const lastInt = interventionValues[interventionValues.length - 1];
  const delta = lastInt - lastBase;

  return (
    <div className="flex items-center gap-2">
      <div className="text-[7px] font-mono text-text-muted w-16 truncate" title={label}>
        {label}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="flex-1" style={{ maxHeight: 24 }}>
        <path d={basePath} fill="none" stroke="rgba(160,160,180,0.4)" strokeWidth={0.8} />
        <path d={intPath} fill="none" stroke="var(--accent-cyan)" strokeWidth={1} />
      </svg>
      <div className="text-[8px] font-mono w-12 text-right" style={{
        color: delta > 0.1 ? "#ff1744" : delta < -0.1 ? "#00e676" : "var(--text-muted)",
      }}>
        {delta > 0 ? "+" : ""}{delta.toFixed(2)} {"\u03A9"}
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────
export default function MonteCarloForecast() {
  const {
    interventionTarget,
    graphData,
    severedEdges,
    lastInterdictionResult,
  } = useApexStore();

  const [numPaths, setNumPaths] = useState(200);
  const [horizon, setHorizon] = useState(60);
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<MCForecastResult | null>(null);
  const [lastRunSource, setLastRunSource] = useState<"manual" | "interdiction" | null>(null);

  // Derive intervention inputs from interdiction results (if any):
  //  • node cuts → candidate do(X) target (top-ranked first)
  //  • edge cuts → merged into the severed-edge set for the forecast
  const interdictionNodeTarget = useMemo(() => {
    if (!lastInterdictionResult) return null;
    const nodeCut = lastInterdictionResult.interventions.find((iv) => iv.target.type === "node");
    return nodeCut?.target.id ?? null;
  }, [lastInterdictionResult]);

  const interdictionEdgeCuts = useMemo(() => {
    if (!lastInterdictionResult) return [] as string[];
    return lastInterdictionResult.interventions
      .filter((iv) => iv.target.type === "edge")
      .map((iv) => iv.target.id);
  }, [lastInterdictionResult]);

  // Effective target: user-selected do(X) wins; otherwise fall back to the
  // copilot's top node intervention from lastInterdictionResult.
  const effectiveTarget = interventionTarget ?? interdictionNodeTarget;

  const targetNode = effectiveTarget
    ? graphData.nodes.find((n) => n.id === effectiveTarget)
    : null;

  const runForecast = useCallback((source: "manual" | "interdiction" = "manual") => {
    if (!effectiveTarget) return;
    setIsRunning(true);
    // Merge user-severed edges with interdiction edge cuts so the forecast
    // reflects the full defensive posture the solver recommended.
    const mergedSevered = Array.from(new Set([...severedEdges, ...interdictionEdgeCuts]));
    // Run in next tick to allow UI to show spinner
    setTimeout(() => {
      const r = runMonteCarloForecast(
        graphData,
        effectiveTarget,
        mergedSevered,
        { numPaths, horizonEpochs: horizon }
      );
      setResult(r);
      setLastRunSource(source);
      setIsRunning(false);
    }, 16);
  }, [effectiveTarget, graphData, severedEdges, interdictionEdgeCuts, numPaths, horizon]);

  // Get median endpoint stats for summary
  const summary = useMemo(() => {
    if (!result) return null;
    const baseLast = result.baselineStats[result.baselineStats.length - 1];
    const intLast = result.interventionStats[result.interventionStats.length - 1];
    return {
      baselineMedian: baseLast.p50,
      interventionMedian: intLast.p50,
      delta: intLast.p50 - baseLast.p50,
      baselineP10: baseLast.p10,
      interventionP10: intLast.p10,
    };
  }, [result]);

  const hasInterdiction = Boolean(lastInterdictionResult);
  const interdictionNodeCount = lastInterdictionResult?.interventions.filter((iv) => iv.target.type === "node").length ?? 0;

  return (
    <div className="mt-3 pt-3 border-t border-border space-y-2">
      <div className="font-[family-name:var(--font-michroma)] text-[9px] tracking-wider text-accent-cyan">
        MONTE CARLO FORECAST
      </div>
      <div className="text-[8px] font-mono text-text-muted">
        Stochastic simulation of {"\u03A9"}-buffer trajectories under structural intervention.
        Runs {numPaths} paths with noise-perturbed edge weights and shock propagation.
      </div>

      {hasInterdiction && (
        <div className="p-2 rounded border border-accent-amber/30 bg-accent-amber/5 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[8px] font-[family-name:var(--font-michroma)] tracking-wider text-accent-amber">
              INTERDICTION {"\u2192"} FORECAST
            </span>
            <span className="text-[7px] font-mono text-text-muted">
              {interdictionNodeCount} node{interdictionNodeCount !== 1 ? "s" : ""}, {interdictionEdgeCuts.length} edge{interdictionEdgeCuts.length !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="text-[7px] font-mono text-text-muted leading-relaxed">
            Using solver cuts as the intervention posture:{" "}
            {interdictionNodeTarget ? (
              <>
                do(<span className="text-accent-amber">{graphData.nodes.find((n) => n.id === interdictionNodeTarget)?.shortLabel ?? interdictionNodeTarget}</span>)
              </>
            ) : (
              <span className="text-accent-amber">edge-only cuts</span>
            )}
            {interdictionEdgeCuts.length > 0 && ` + ${interdictionEdgeCuts.length} severed edge${interdictionEdgeCuts.length !== 1 ? "s" : ""}`}.
          </div>
          <button
            onClick={() => runForecast("interdiction")}
            disabled={!effectiveTarget || isRunning}
            className="w-full text-[8px] font-[family-name:var(--font-michroma)] tracking-wider px-2 py-1 rounded border border-accent-amber/50 text-accent-amber hover:bg-accent-amber/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isRunning && lastRunSource === "interdiction" ? "SIMULATING\u2026" : "FORECAST WITH INTERDICTION CUTS"}
          </button>
        </div>
      )}

      {/* Config */}
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="text-[7px] font-mono text-text-muted block mb-0.5">PATHS</label>
          <select
            value={numPaths}
            onChange={(e) => setNumPaths(Number(e.target.value))}
            className="w-full text-[8px] font-mono bg-surface border border-border rounded px-1.5 py-1 text-foreground"
          >
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={200}>200</option>
            <option value={500}>500</option>
          </select>
        </div>
        <div className="flex-1">
          <label className="text-[7px] font-mono text-text-muted block mb-0.5">HORIZON</label>
          <select
            value={horizon}
            onChange={(e) => setHorizon(Number(e.target.value))}
            className="w-full text-[8px] font-mono bg-surface border border-border rounded px-1.5 py-1 text-foreground"
          >
            <option value={30}>30 epochs</option>
            <option value={60}>60 epochs</option>
            <option value={120}>120 epochs</option>
          </select>
        </div>
      </div>

      {/* Run button */}
      <button
        onClick={() => runForecast("manual")}
        disabled={!effectiveTarget || isRunning}
        className="w-full text-[9px] font-[family-name:var(--font-michroma)] tracking-wider px-3 py-2 rounded border transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        style={{
          borderColor: "var(--accent-cyan)",
          color: "var(--accent-cyan)",
          backgroundColor: "rgba(0,229,255,0.06)",
        }}
      >
        {isRunning && lastRunSource === "manual"
          ? "SIMULATING..."
          : !effectiveTarget
            ? "SELECT INTERVENTION TARGET OR RUN INTERDICTION"
            : `RUN FORECAST \u2014 do(${targetNode?.shortLabel || "X"})`}
      </button>

      {/* Results */}
      {result && summary && (
        <div className="space-y-2">
          {/* Summary stats */}
          <div className="grid grid-cols-3 gap-1.5">
            <div className="p-1.5 rounded border border-border bg-surface-elevated text-center">
              <div className="text-[7px] font-mono text-text-muted">{"\u03A9"}-BUFFER (BASE)</div>
              <div className="text-[11px] font-mono text-foreground">
                {summary.baselineMedian.toFixed(1)}
              </div>
            </div>
            <div className="p-1.5 rounded border border-accent-cyan/30 bg-accent-cyan/5 text-center">
              <div className="text-[7px] font-mono text-accent-cyan">{"\u03A9"}-BUFFER (do(X))</div>
              <div className="text-[11px] font-mono text-accent-cyan">
                {summary.interventionMedian.toFixed(1)}
              </div>
            </div>
            <div className="p-1.5 rounded border border-border bg-surface-elevated text-center">
              <div className="text-[7px] font-mono text-text-muted">{"\u0394"} IMPACT</div>
              <div className="text-[11px] font-mono" style={{
                color: summary.delta > 1 ? "#00e676" : summary.delta < -1 ? "#ff1744" : "var(--text-muted)",
              }}>
                {summary.delta > 0 ? "+" : ""}{summary.delta.toFixed(1)}
              </div>
            </div>
          </div>

          {/* Tail risk comparison */}
          <div className="flex justify-between text-[7px] font-mono text-text-muted px-1">
            <span>P10 tail: baseline {summary.baselineP10.toFixed(1)} → do(X) {summary.interventionP10.toFixed(1)}</span>
            <span>{numPaths} paths</span>
          </div>

          {/* Fan-Chart Output Panel */}
          <div className="border border-accent-cyan/30 rounded bg-surface-elevated">
            <div className="flex items-center justify-between px-2 py-1 border-b border-accent-cyan/20 bg-accent-cyan/5">
              <span className="text-[9px] font-[family-name:var(--font-michroma)] tracking-wider text-accent-cyan">
                FAN CHART
              </span>
              <span className="text-[7px] font-mono text-text-muted">
                {lastRunSource === "interdiction" ? "INTERDICTION POSTURE" : "MANUAL do(X)"} {"\u00B7"} {numPaths} paths {"\u00B7"} p10{"\u2013"}p90 / p25{"\u2013"}p75 / p50
              </span>
            </div>
            <div className="p-1">
              <ForecastChart
                baselineStats={result.baselineStats}
                interventionStats={result.interventionStats}
                horizonEpochs={result.horizonEpochs}
                metric={`\u03A9-BUFFER TRAJECTORY \u2014 ${horizon} EPOCHS`}
              />
            </div>
          </div>

          {/* Downstream node sparklines */}
          {result.trackedNodeIds.length > 0 && (
            <div className="space-y-1">
              <div className="text-[7px] font-[family-name:var(--font-michroma)] tracking-wider text-text-muted">
                DOWNSTREAM NODE TRAJECTORIES
              </div>
              {result.trackedNodeIds.map((nodeId) => {
                const node = graphData.nodes.find((n) => n.id === nodeId);
                // Get median path values for baseline and intervention
                const baseMedian = result.baselinePaths.map((p) => {
                  const series = p.downstreamSeries.get(nodeId);
                  return series || [];
                });
                const intMedian = result.interventionPaths.map((p) => {
                  const series = p.downstreamSeries.get(nodeId);
                  return series || [];
                });

                // Compute median at each epoch
                const medianAt = (paths: number[][], epoch: number) => {
                  const values = paths.map((p) => p[epoch] || 0).sort((a, b) => a - b);
                  return values[Math.floor(values.length / 2)] || 0;
                };

                const epochs = result.horizonEpochs + 1;
                const baseLine = Array.from({ length: epochs }, (_, i) => medianAt(baseMedian, i));
                const intLine = Array.from({ length: epochs }, (_, i) => medianAt(intMedian, i));

                return (
                  <NodeSparkline
                    key={nodeId}
                    label={node?.shortLabel || nodeId}
                    baselineValues={baseLine}
                    interventionValues={intLine}
                    horizonEpochs={result.horizonEpochs}
                  />
                );
              })}
            </div>
          )}

          {/* Interpretation */}
          <div className="p-2 rounded border border-border/50 bg-surface-elevated">
            <div className="text-[7px] font-[family-name:var(--font-michroma)] tracking-wider text-text-muted mb-1">
              INTERPRETATION
            </div>
            <div className="text-[8px] font-mono text-text-muted leading-relaxed">
              {summary.delta > 2
                ? `Structural intervention on ${targetNode?.shortLabel} improves system resilience. The \u03A9-buffer recovers ${summary.delta.toFixed(1)} points above baseline by t${horizon}, with tightened tail risk (P10: ${summary.interventionP10.toFixed(1)} vs ${summary.baselineP10.toFixed(1)}).`
                : summary.delta < -2
                  ? `Warning: do(${targetNode?.shortLabel}) degrades system stability. The \u03A9-buffer drops ${Math.abs(summary.delta).toFixed(1)} points below baseline, indicating the intervention propagates fragility downstream.`
                  : `The intervention has marginal effect on aggregate \u03A9-buffer (\u0394 = ${summary.delta.toFixed(1)}). The structural isolation of ${targetNode?.shortLabel} does not significantly alter system trajectory over the ${horizon}-epoch horizon.`}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
