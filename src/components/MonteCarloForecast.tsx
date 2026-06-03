"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useApexStore } from "@/stores/useApexStore";
import {
  runMonteCarloForecast,
  type MCForecastResult,
  type MCPath,
  type EpochStats,
} from "@/lib/monte-carlo-engine";

// ─── Fan + Spaghetti Chart ─────────────────────────────────────
function ForecastChart({
  baselineStats,
  interventionStats,
  baselinePaths,
  interventionPaths,
  pathAccessor,
  horizonEpochs,
  metric,
  expanded,
}: {
  baselineStats: EpochStats[];
  interventionStats: EpochStats[];
  baselinePaths: MCPath[];
  interventionPaths: MCPath[];
  pathAccessor: (p: MCPath) => number[];
  horizonEpochs: number;
  metric: string;
  expanded: boolean;
}) {
  const W = 560;
  const H = expanded ? 280 : 140;
  const PAD = { top: 18, right: 12, bottom: 24, left: 38 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const svgRef = useRef<SVGSVGElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [hoverEpoch, setHoverEpoch] = useState<number | null>(null);

  const xScale = useCallback(
    (epoch: number) => PAD.left + (epoch / horizonEpochs) * plotW,
    [plotW, horizonEpochs, PAD.left]
  );
  const yMin = 0;
  const yMax = 100;
  const yScale = useCallback(
    (v: number) => PAD.top + plotH - ((v - yMin) / (yMax - yMin)) * plotH,
    [plotH, PAD.top]
  );

  const linePath = useCallback(
    (stats: EpochStats[], accessor: (s: EpochStats) => number) =>
      stats.map((s, i) => `${i === 0 ? "M" : "L"} ${xScale(s.epoch).toFixed(1)} ${yScale(accessor(s)).toFixed(1)}`).join(" "),
    [xScale, yScale]
  );

  const bandPath = useCallback(
    (stats: EpochStats[], lo: (s: EpochStats) => number, hi: (s: EpochStats) => number) => {
      const upper = stats.map((s) => `${xScale(s.epoch).toFixed(1)},${yScale(hi(s)).toFixed(1)}`);
      const lower = [...stats].reverse().map((s) => `${xScale(s.epoch).toFixed(1)},${yScale(lo(s)).toFixed(1)}`);
      return `M ${upper.join(" L ")} L ${lower.join(" L ")} Z`;
    },
    [xScale, yScale]
  );

  const pathLine = useCallback(
    (series: number[]) =>
      series.map((v, i) => `${i === 0 ? "M" : "L"} ${xScale(i).toFixed(1)} ${yScale(v).toFixed(1)}`).join(" "),
    [xScale, yScale]
  );

  const gridYValues = [0, 25, 50, 75, 100];
  const xTickEpochs = [0, Math.round(horizonEpochs / 4), Math.round(horizonEpochs / 2), Math.round((3 * horizonEpochs) / 4), horizonEpochs];

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const relX = e.clientX - rect.left;
      const xInView = (relX / rect.width) * W;
      if (xInView < PAD.left || xInView > W - PAD.right) {
        setHoverEpoch(null);
        return;
      }
      const epochF = ((xInView - PAD.left) / plotW) * horizonEpochs;
      const epoch = Math.max(0, Math.min(horizonEpochs, Math.round(epochF)));
      setHoverEpoch(epoch);
    },
    [plotW, horizonEpochs]
  );

  const hoverData = useMemo(() => {
    if (hoverEpoch === null) return null;
    const b = baselineStats[hoverEpoch];
    const i = interventionStats[hoverEpoch];
    if (!b || !i) return null;
    return { epoch: hoverEpoch, baseline: b, intervention: i };
  }, [hoverEpoch, baselineStats, interventionStats]);

  const hoverXFrac = hoverEpoch !== null ? xScale(hoverEpoch) / W : 0;

  return (
    <div ref={wrapperRef} className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full block"
        style={{ maxHeight: expanded ? 340 : 180 }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverEpoch(null)}
        preserveAspectRatio="none"
      >
        {/* Grid */}
        {gridYValues.map((v) => (
          <g key={v}>
            <line
              x1={PAD.left} y1={yScale(v)} x2={W - PAD.right} y2={yScale(v)}
              stroke="var(--border)" strokeWidth={0.5} strokeDasharray="2,3"
            />
            <text x={PAD.left - 4} y={yScale(v) + 3} textAnchor="end"
              fill="var(--text-muted)" fontSize={expanded ? 9 : 7} fontFamily="monospace">
              {v}
            </text>
          </g>
        ))}

        {/* X-axis labels */}
        {xTickEpochs.map((e) => (
          <text key={e} x={xScale(e)} y={H - 8} textAnchor="middle"
            fill="var(--text-muted)" fontSize={expanded ? 9 : 7} fontFamily="monospace">
            t{e}
          </text>
        ))}

        {/* Spaghetti — individual MC paths */}
        <g>
          {baselinePaths.map((p, idx) => (
            <path
              key={`b${idx}`}
              d={pathLine(pathAccessor(p))}
              fill="none"
              stroke="rgba(200,200,220,1)"
              strokeWidth={0.4}
              strokeLinejoin="round"
              opacity={0.05}
            />
          ))}
          {interventionPaths.map((p, idx) => (
            <path
              key={`i${idx}`}
              d={pathLine(pathAccessor(p))}
              fill="none"
              stroke="rgba(0,229,255,1)"
              strokeWidth={0.4}
              strokeLinejoin="round"
              opacity={0.06}
            />
          ))}
        </g>

        {/* Fan bands (p10-p90 outer, p25-p75 inner) */}
        <path d={bandPath(baselineStats, (s) => s.p10, (s) => s.p90)} fill="rgba(100,100,130,0.14)" stroke="none" />
        <path d={bandPath(baselineStats, (s) => s.p25, (s) => s.p75)} fill="rgba(100,100,130,0.22)" stroke="none" />
        <path d={bandPath(interventionStats, (s) => s.p10, (s) => s.p90)} fill="rgba(0,229,255,0.08)" stroke="none" />
        <path d={bandPath(interventionStats, (s) => s.p25, (s) => s.p75)} fill="rgba(0,229,255,0.16)" stroke="none" />

        {/* Medians */}
        <path d={linePath(baselineStats, (s) => s.p50)} fill="none" stroke="rgba(200,200,220,0.75)" strokeWidth={1.2} strokeDasharray="3,2" />
        <path d={linePath(interventionStats, (s) => s.p50)} fill="none" stroke="var(--accent-cyan)" strokeWidth={1.6} />

        {/* Hover crosshair + markers */}
        {hoverData && (
          <g>
            <line
              x1={xScale(hoverData.epoch)} y1={PAD.top}
              x2={xScale(hoverData.epoch)} y2={H - PAD.bottom}
              stroke="rgba(255,255,255,0.3)" strokeWidth={0.8} strokeDasharray="3,3"
            />
            <circle
              cx={xScale(hoverData.epoch)} cy={yScale(hoverData.baseline.p50)}
              r={3} fill="rgba(220,220,235,0.95)"
            />
            <circle
              cx={xScale(hoverData.epoch)} cy={yScale(hoverData.intervention.p50)}
              r={3.5} fill="var(--accent-cyan)"
            />
          </g>
        )}

        {/* Legend */}
        <g>
          <line x1={PAD.left + 2} y1={PAD.top - 10} x2={PAD.left + 18} y2={PAD.top - 10}
            stroke="rgba(200,200,220,0.75)" strokeWidth={1.2} strokeDasharray="3,2" />
          <text x={PAD.left + 22} y={PAD.top - 7} fill="var(--text-muted)" fontSize={expanded ? 8 : 6.5} fontFamily="monospace">
            BASELINE p50 (fan: p10{"\u2013"}p90)
          </text>
          <line x1={PAD.left + 180} y1={PAD.top - 10} x2={PAD.left + 196} y2={PAD.top - 10}
            stroke="var(--accent-cyan)" strokeWidth={1.6} />
          <text x={PAD.left + 200} y={PAD.top - 7} fill="var(--accent-cyan)" fontSize={expanded ? 8 : 6.5} fontFamily="monospace">
            do(X) INTERVENTION
          </text>
        </g>

        {/* Axis label */}
        <text x={W / 2} y={H - 1} textAnchor="middle"
          fill="var(--text-muted)" fontSize={expanded ? 7 : 5.5} fontFamily="monospace">
          {metric}
        </text>
      </svg>

      {/* Hover tooltip — HTML overlay */}
      {hoverData && wrapperRef.current && (() => {
        const containerW = wrapperRef.current.getBoundingClientRect().width;
        const xPx = hoverXFrac * containerW;
        const flipLeft = xPx > containerW * 0.6;
        const delta = hoverData.intervention.p50 - hoverData.baseline.p50;
        return (
          <div
            className="absolute z-20 pointer-events-none"
            style={{
              left: flipLeft ? undefined : `${xPx + 10}px`,
              right: flipLeft ? `${containerW - xPx + 10}px` : undefined,
              top: 4,
            }}
          >
            <div className="bg-surface-elevated border border-border rounded px-2 py-1.5 shadow-lg min-w-[150px]">
              <div className="text-[7px] font-mono text-text-muted mb-1">
                EPOCH t{hoverData.epoch}
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2 text-[8px] font-mono">
                  <span className="w-2 h-0.5 flex-shrink-0" style={{ background: "rgba(200,200,220,0.75)" }} />
                  <span className="text-text-muted">BASE</span>
                  <span className="ml-auto font-bold text-foreground">
                    {hoverData.baseline.p50.toFixed(1)}
                  </span>
                  <span className="text-text-muted/60 text-[7px]">
                    [{hoverData.baseline.p10.toFixed(0)}{"\u2013"}{hoverData.baseline.p90.toFixed(0)}]
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[8px] font-mono">
                  <span className="w-2 h-0.5 bg-accent-cyan flex-shrink-0" />
                  <span className="text-accent-cyan">do(X)</span>
                  <span className="ml-auto font-bold text-accent-cyan">
                    {hoverData.intervention.p50.toFixed(1)}
                  </span>
                  <span className="text-text-muted/60 text-[7px]">
                    [{hoverData.intervention.p10.toFixed(0)}{"\u2013"}{hoverData.intervention.p90.toFixed(0)}]
                  </span>
                </div>
                <div className="border-t border-border/40 pt-0.5 mt-0.5 flex items-center text-[8px] font-mono">
                  <span className="text-text-muted">{"\u0394"} p50</span>
                  <span
                    className="ml-auto font-bold"
                    style={{ color: delta > 1 ? "#00e676" : delta < -1 ? "#ff1744" : "var(--text-muted)" }}
                  >
                    {delta > 0 ? "+" : ""}{delta.toFixed(1)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
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
export default function MonteCarloForecast({
  expanded = false,
  embedded = false,
}: {
  expanded?: boolean;
  // `embedded` drops this component's own title + the always-on
  // "Stochastic simulation…" blurb. The redesigned PEARL workspace
  // supplies the FORECAST SectionHeader (with a `?`) instead, so
  // printing them here would re-introduce the prose the redesign
  // exists to remove. The "Waiting for cuts" empty state stays — it
  // earns its words. Classic PEARL passes nothing → header preserved.
  embedded?: boolean;
} = {}) {
  const {
    interventionTarget,
    graphData,
    severedEdges,
    lastInterdictionResult,
  } = useApexStore();
  const trialPrior = useApexStore((s) => s.trialPrior);

  const [numPaths, setNumPaths] = useState(200);
  const [horizon, setHorizon] = useState(60);
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<MCForecastResult | null>(null);
  // Metric toggle — "omega" shows the default Ω-buffer resilience fan,
  // "survival" shows the literature-calibrated P(event by t) fan built
  // from the active trial prior. When no prior is published (e.g. the
  // VX-880 panel isn't mounted) the toggle is disabled and forced to omega.
  const [metric, setMetric] = useState<"omega" | "survival">("omega");

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

  // When interdiction recommends only edge cuts (no node), the MC engine still
  // needs a target node to seed the do(X) shock. Use the downstream endpoint of
  // the top-ranked edge cut — severing that edge isolates the node from its
  // upstream cause, which is the do(X) semantic we want.
  const interdictionEdgeTarget = useMemo(() => {
    if (!lastInterdictionResult) return null;
    const edgeCut = lastInterdictionResult.interventions.find((iv) => iv.target.type === "edge");
    if (!edgeCut) return null;
    const edge = graphData.edges.find((e) => e.id === edgeCut.target.id);
    return edge?.target ?? null;
  }, [lastInterdictionResult, graphData.edges]);

  // Effective target: user-selected do(X) wins; otherwise use the copilot's
  // top node intervention, otherwise fall back to an edge-cut downstream node.
  // Final fallback: when a trial survival prior is active (e.g. VX-880), pin
  // the target to the prior's outcome node so the survival fan still renders
  // even before any interdiction runs — without this, opening the VX-880
  // module shows an empty MC panel until the solver produces cuts.
  const effectiveTarget =
    interventionTarget ??
    interdictionNodeTarget ??
    interdictionEdgeTarget ??
    trialPrior?.outcomeNodeId ??
    null;

  const targetNode = effectiveTarget
    ? graphData.nodes.find((n) => n.id === effectiveTarget)
    : null;

  // Auto-run whenever the target, cut set, or config changes. All setState
  // calls are deferred into a timeout so the effect body doesn't trigger a
  // synchronous cascading render (React 19 lint rule).
  useEffect(() => {
    if (!effectiveTarget) return;
    const mergedSevered = Array.from(new Set([...severedEdges, ...interdictionEdgeCuts]));
    let cancelled = false;
    const timer = setTimeout(() => {
      if (cancelled) return;
      setIsRunning(true);
      const r = runMonteCarloForecast(
        graphData,
        effectiveTarget,
        mergedSevered,
        {
          numPaths,
          horizonEpochs: horizon,
          survivalPrior: trialPrior ?? undefined,
        }
      );
      if (cancelled) return;
      setResult(r);
      setIsRunning(false);
    }, 16);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [effectiveTarget, graphData, severedEdges, interdictionEdgeCuts, numPaths, horizon, trialPrior]);

  // Effective metric — derived, not stored. When the prior is absent we
  // can't render a survival fan regardless of the toggle's internal state,
  // so collapse it to "omega" at the read site. This avoids a setState-in-
  // effect when the user navigates away from a VX-880-style panel.
  const effectiveMetric: "omega" | "survival" = trialPrior ? metric : "omega";

  // Resolve active stats based on the selected metric — falls back to the
  // Ω-buffer fan when the survival arrays aren't present.
  const activeStats = useMemo(() => {
    if (!result) return null;
    if (
      effectiveMetric === "survival" &&
      result.baselineSurvivalStats &&
      result.interventionSurvivalStats
    ) {
      return {
        baseline: result.baselineSurvivalStats,
        intervention: result.interventionSurvivalStats,
        accessor: (p: MCPath) => p.survivalSeries ?? [],
      };
    }
    return {
      baseline: result.baselineStats,
      intervention: result.interventionStats,
      accessor: (p: MCPath) => p.omegaBufferSeries,
    };
  }, [result, effectiveMetric]);

  // Get median endpoint stats for summary
  const summary = useMemo(() => {
    if (!activeStats) return null;
    const baseLast = activeStats.baseline[activeStats.baseline.length - 1];
    const intLast = activeStats.intervention[activeStats.intervention.length - 1];
    return {
      baselineMedian: baseLast.p50,
      interventionMedian: intLast.p50,
      delta: intLast.p50 - baseLast.p50,
      baselineP10: baseLast.p10,
      interventionP10: intLast.p10,
    };
  }, [activeStats]);

  const hasInterdiction = Boolean(lastInterdictionResult);
  const interdictionNodeCount = lastInterdictionResult?.interventions.filter((iv) => iv.target.type === "node").length ?? 0;
  const postureLabel = interventionTarget
    ? "MANUAL do(X)"
    : interdictionNodeTarget
      ? "INTERDICTION NODE CUT"
      : interdictionEdgeTarget
        ? "INTERDICTION EDGE CUT"
        : "";

  return (
    <div className="space-y-2">
      {!embedded && (
      <>
      <div className="font-[family-name:var(--font-michroma)] text-[9px] tracking-wider text-accent-cyan">
        MONTE CARLO FORECAST
      </div>
      <div className="text-[8px] font-mono text-text-muted">
        Stochastic simulation of {"\u03A9"}-buffer trajectories
        {trialPrior ? ` + literature-calibrated P(${trialPrior.label}) survival fan` : ""}
        . Auto-runs whenever interdiction cuts or configuration change
        {" \u2014 "}no manual trigger.
      </div>
      </>
      )}

      {hasInterdiction && effectiveTarget && targetNode && (
        <div className="p-2 rounded border border-accent-amber/30 bg-accent-amber/5 space-y-0.5">
          <div className="flex items-center justify-between">
            <span className="text-[8px] font-[family-name:var(--font-michroma)] tracking-wider text-accent-amber">
              INTERDICTION {"\u2192"} FORECAST
            </span>
            <span className="text-[7px] font-mono text-text-muted">
              {interdictionNodeCount} node{interdictionNodeCount !== 1 ? "s" : ""}, {interdictionEdgeCuts.length} edge{interdictionEdgeCuts.length !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="text-[7px] font-mono text-text-muted leading-relaxed">
            Posture: do(<span className="text-accent-amber">{targetNode.shortLabel ?? targetNode.id}</span>)
            {interdictionEdgeCuts.length > 0 && ` + ${interdictionEdgeCuts.length} severed edge${interdictionEdgeCuts.length !== 1 ? "s" : ""}`}.
          </div>
        </div>
      )}

      {!effectiveTarget && !trialPrior && (
        <div className="p-2 rounded border border-border/60 bg-surface-elevated text-[8px] font-mono text-text-muted leading-relaxed">
          Waiting for cuts. Three ways to get here:
          {" "}<strong>scenario {"→"} interdiction</strong> at the top of PEARL,
          {" "}<strong>ablation</strong> (your manual cuts), or a manual{" "}
          <strong>do(X)</strong> target picked on the DAG. As soon as cuts
          exist, this forecast auto-runs.
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

      {isRunning && (
        <div className="text-[8px] font-mono text-accent-cyan/80 px-1">
          SIMULATING{"\u2026"} {numPaths} paths {"\u00B7"} horizon {horizon}
        </div>
      )}

      {/* Results */}
      {result && summary && activeStats && (
        <div className="space-y-2">
          {/* Metric toggle — only exposed when a survival prior is live */}
          {trialPrior && (
            <div className="flex items-center gap-2 text-[8px] font-mono">
              <span className="text-text-muted tracking-wider">VIEW</span>
              <div className="inline-flex border border-border rounded overflow-hidden">
                <button
                  type="button"
                  onClick={() => setMetric("omega")}
                  className={`px-2 py-0.5 transition-colors ${
                    metric === "omega"
                      ? "bg-accent-cyan/15 text-accent-cyan"
                      : "text-text-muted hover:bg-surface-elevated"
                  }`}
                >
                  {"\u03A9"}-BUFFER
                </button>
                <button
                  type="button"
                  onClick={() => setMetric("survival")}
                  className={`px-2 py-0.5 transition-colors border-l border-border ${
                    metric === "survival"
                      ? "bg-accent-cyan/15 text-accent-cyan"
                      : "text-text-muted hover:bg-surface-elevated"
                  }`}
                >
                  P(INDEP) {"\u00B7"} S(t)
                </button>
              </div>
              <span className="text-[7px] text-text-muted ml-auto truncate">
                {effectiveMetric === "survival"
                  ? `${trialPrior.label} \u00B7 ${trialPrior.source}`
                  : "system-wide resilience"}
              </span>
            </div>
          )}

          {/* Summary stats */}
          <div className="grid grid-cols-3 gap-1.5">
            <div className="p-1.5 rounded border border-border bg-surface-elevated text-center">
              <div className="text-[7px] font-mono text-text-muted">
                {effectiveMetric === "survival" ? "P(EVENT) BASE" : `${"\u03A9"}-BUFFER (BASE)`}
              </div>
              <div className="text-[11px] font-mono text-foreground">
                {effectiveMetric === "survival"
                  ? `${summary.baselineMedian.toFixed(1)}%`
                  : summary.baselineMedian.toFixed(1)}
              </div>
            </div>
            <div className="p-1.5 rounded border border-accent-cyan/30 bg-accent-cyan/5 text-center">
              <div className="text-[7px] font-mono text-accent-cyan">
                {effectiveMetric === "survival" ? "P(EVENT) do(X)" : `${"\u03A9"}-BUFFER (do(X))`}
              </div>
              <div className="text-[11px] font-mono text-accent-cyan">
                {effectiveMetric === "survival"
                  ? `${summary.interventionMedian.toFixed(1)}%`
                  : summary.interventionMedian.toFixed(1)}
              </div>
            </div>
            <div className="p-1.5 rounded border border-border bg-surface-elevated text-center">
              <div className="text-[7px] font-mono text-text-muted">{"\u0394"} IMPACT</div>
              <div className="text-[11px] font-mono" style={{
                color: summary.delta > 1 ? "#00e676" : summary.delta < -1 ? "#ff1744" : "var(--text-muted)",
              }}>
                {summary.delta > 0 ? "+" : ""}{summary.delta.toFixed(1)}
                {effectiveMetric === "survival" ? " pp" : ""}
              </div>
            </div>
          </div>

          {/* Tail risk comparison */}
          <div className="flex justify-between text-[7px] font-mono text-text-muted px-1">
            <span>
              P10 tail: baseline {summary.baselineP10.toFixed(1)}
              {effectiveMetric === "survival" ? "%" : ""} {"\u2192"} do(X){" "}
              {summary.interventionP10.toFixed(1)}
              {effectiveMetric === "survival" ? "%" : ""}
            </span>
            <span>{numPaths} paths</span>
          </div>

          {/* Fan-Chart Output Panel */}
          <div className="border border-accent-cyan/30 rounded bg-surface-elevated">
            <div className="flex items-center justify-between px-2 py-1 border-b border-accent-cyan/20 bg-accent-cyan/5">
              <span className="text-[9px] font-[family-name:var(--font-michroma)] tracking-wider text-accent-cyan">
                FAN CHART {expanded && <span className="text-text-muted ml-1">{"\u00B7"} EXPANDED</span>}
              </span>
              <span className="text-[7px] font-mono text-text-muted">
                {postureLabel} {"\u00B7"} {numPaths} paths {"\u00B7"} hover for epoch detail
              </span>
            </div>
            <div className="p-1">
              <ForecastChart
                baselineStats={activeStats.baseline}
                interventionStats={activeStats.intervention}
                baselinePaths={result.baselinePaths}
                interventionPaths={result.interventionPaths}
                pathAccessor={activeStats.accessor}
                horizonEpochs={result.horizonEpochs}
                metric={
                  effectiveMetric === "survival"
                    ? `P(INSULIN INDEPENDENCE) \u00B7 ${horizon} EPOCHS \u00B7 ${trialPrior?.source ?? ""}`
                    : `\u03A9-BUFFER TRAJECTORY \u2014 ${horizon} EPOCHS`
                }
                expanded={expanded}
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
              {effectiveMetric === "survival" && trialPrior
                ? (summary.delta < -2
                    ? `do(${targetNode?.shortLabel}) suppresses ${trialPrior.label}: P(event by t${horizon}) drops ${Math.abs(summary.delta).toFixed(1)} pp below baseline. The structural intervention is routing the attack away from the outcome node — the \u03B2* prior (${trialPrior.beta.toFixed(2)} \u00B1 ${trialPrior.se.toFixed(2)}) survives more of the cascade.`
                    : summary.delta > 2
                      ? `do(${targetNode?.shortLabel}) accelerates ${trialPrior.label}: P(event by t${horizon}) rises ${summary.delta.toFixed(1)} pp above baseline — the intervention protects the outcome node from cascade attenuation, letting the full treatment effect express.`
                      : `The intervention leaves the survival fan roughly unchanged (\u0394 = ${summary.delta.toFixed(1)} pp). The cascade attack on "${trialPrior.outcomeNodeId}" was already low under baseline, so attenuation of the \u03B2* treatment effect is minimal in either arm.`)
                : summary.delta > 2
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
