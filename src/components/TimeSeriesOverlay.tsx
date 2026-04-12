"use client";

import { useMemo, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useApexStore } from "@/stores/useApexStore";
import { getDomainColor } from "@/lib/graph-data";
import type { NodeTemporalState } from "@/lib/temporal-data";

const CHART_HEIGHT = 120;
const PAD = { top: 12, bottom: 20, left: 32, right: 12 };

function getLineColor(value: number): string {
  if (value > 9) return "#ff1744";
  if (value >= 7) return "#ffab00";
  if (value >= 5) return "#ff6d00";
  return "#00e676";
}

export default function TimeSeriesOverlay() {
  const pinnedNodes = useApexStore((s) => s.pinnedTimeSeriesNodes);
  const togglePinned = useApexStore((s) => s.togglePinnedTimeSeries);
  const clearPinned = useApexStore((s) => s.clearPinnedTimeSeries);
  const temporalData = useApexStore((s) => s.temporalData);
  const graphData = useApexStore((s) => s.graphData);
  const timelineRange = useApexStore((s) => s.timelineRange);
  const timelinePosition = useApexStore((s) => s.timelinePosition);
  const isLive = useApexStore((s) => s.isLive);

  const [hoverX, setHoverX] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Gather histories for pinned nodes
  const curves = useMemo(() => {
    if (!temporalData || pinnedNodes.length === 0) return [];
    return pinnedNodes
      .map((nodeId) => {
        const nodeData = temporalData.nodes.get(nodeId);
        const node = graphData.nodes.find((n) => n.id === nodeId);
        if (!nodeData || !node || nodeData.history.length < 2) return null;
        return {
          nodeId,
          label: node.label,
          domain: node.domain,
          color: getDomainColor(node.domain),
          history: nodeData.history,
          currentOmega: node.omegaFragility.composite,
        };
      })
      .filter(Boolean) as {
      nodeId: string;
      label: string;
      domain: string;
      color: string;
      history: NodeTemporalState[];
      currentOmega: number;
    }[];
  }, [pinnedNodes, temporalData, graphData]);

  // Compute dynamic y-axis range from actual data with padding
  const { yMin, yMax, gridLines } = useMemo(() => {
    if (curves.length === 0) return { yMin: 0, yMax: 10, gridLines: [2.5, 5.0, 7.5] };

    let lo = Infinity;
    let hi = -Infinity;
    for (const curve of curves) {
      for (const h of curve.history) {
        if (h.omegaComposite < lo) lo = h.omegaComposite;
        if (h.omegaComposite > hi) hi = h.omegaComposite;
      }
    }

    // Add 10% padding on each side, clamped to [0, 10]
    const span = hi - lo || 1;
    const pad = span * 0.1;
    const yMinRaw = Math.max(0, Math.floor((lo - pad) * 2) / 2); // snap to 0.5
    const yMaxRaw = Math.min(10, Math.ceil((hi + pad) * 2) / 2);

    // Generate ~3-5 evenly spaced grid lines
    const range = yMaxRaw - yMinRaw;
    // Pick a nice step: 0.5, 1, 2, or 2.5
    let step = 1;
    if (range <= 2) step = 0.5;
    else if (range <= 5) step = 1;
    else if (range <= 8) step = 2;
    else step = 2.5;

    const lines: number[] = [];
    let v = Math.ceil(yMinRaw / step) * step;
    while (v < yMaxRaw) {
      if (v > yMinRaw) lines.push(Math.round(v * 10) / 10);
      v += step;
    }

    return { yMin: yMinRaw, yMax: yMaxRaw, gridLines: lines };
  }, [curves]);

  // Convert data coordinates to SVG coordinates
  const toSvg = useCallback(
    (timestamp: number, omega: number, width: number) => {
      const xRange = timelineRange.end - timelineRange.start || 1;
      const x =
        PAD.left +
        ((timestamp - timelineRange.start) / xRange) *
          (width - PAD.left - PAD.right);
      const y =
        PAD.top +
        (1 - (omega - yMin) / (yMax - yMin || 1)) *
          (CHART_HEIGHT - PAD.top - PAD.bottom);
      return { x, y };
    },
    [timelineRange, yMin, yMax],
  );

  // Get hovered values
  const hoverValues = useMemo(() => {
    if (hoverX === null || !containerRef.current) return null;
    const width = containerRef.current.getBoundingClientRect().width - 72; // minus label column
    const xRange = timelineRange.end - timelineRange.start || 1;
    const ts =
      timelineRange.start +
      ((hoverX - PAD.left) / (width - PAD.left - PAD.right)) * xRange;
    const values: { nodeId: string; label: string; color: string; omega: number }[] = [];
    for (const curve of curves) {
      // Find closest timestamp in history
      let closest = curve.history[0];
      for (const h of curve.history) {
        if (
          Math.abs(h.timestamp - ts) < Math.abs(closest.timestamp - ts)
        ) {
          closest = h;
        }
      }
      values.push({
        nodeId: curve.nodeId,
        label: curve.label,
        color: curve.color,
        omega: closest.omegaComposite,
      });
    }
    return { ts, values };
  }, [hoverX, curves, timelineRange]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      if (x >= PAD.left && x <= rect.width - PAD.right) {
        setHoverX(x);
      } else {
        setHoverX(null);
      }
    },
    [],
  );

  if (pinnedNodes.length === 0) return null;

  return (
    <div ref={containerRef} className="border-t border-border bg-surface-elevated">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-1">
        <div className="min-w-[72px] flex-shrink-0 flex items-center justify-center">
          <span className="text-[9px] font-mono text-accent-cyan">
            {"\u2261"}
          </span>
        </div>
        <span className="text-[8px] font-[family-name:var(--font-michroma)] tracking-wider text-text-muted flex-1">
          {"\u03A9"}F COMPARISON — {curves.length} CURVE{curves.length !== 1 ? "S" : ""}
        </span>
        <button
          onClick={clearPinned}
          className="text-[8px] font-mono text-text-muted hover:text-accent-red transition-colors px-1.5 py-0.5 rounded border border-border hover:border-accent-red/30"
        >
          CLEAR ALL
        </button>
      </div>

      {/* Chart area */}
      <AnimatePresence initial={false}>
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="overflow-hidden"
        >
          <div className="flex items-stretch px-4 pb-2">
            {/* Y-axis label column — aligned with TimeDial, auto-scaled */}
            <div className="min-w-[72px] flex-shrink-0 flex flex-col justify-between py-1">
              <span className="text-[7px] font-mono text-text-muted/60">{yMax % 1 === 0 ? yMax : yMax.toFixed(1)}</span>
              {gridLines.map((v) => (
                <span key={v} className="text-[7px] font-mono text-text-muted/60">
                  {v % 1 === 0 ? v : v.toFixed(1)}
                </span>
              ))}
              <span className="text-[7px] font-mono text-text-muted/60">{yMin % 1 === 0 ? yMin : yMin.toFixed(1)}</span>
            </div>

            {/* SVG Chart */}
            <div className="flex-1 min-w-0">
              <svg
                ref={svgRef}
                width="100%"
                height={CHART_HEIGHT}
                className="block"
                onMouseMove={handleMouseMove}
                onMouseLeave={() => setHoverX(null)}
                preserveAspectRatio="none"
                viewBox={`0 0 ${containerRef.current?.getBoundingClientRect().width ? containerRef.current.getBoundingClientRect().width - 72 : 800} ${CHART_HEIGHT}`}
              >
                {/* Grid lines */}
                {gridLines.map((v) => {
                  const yFrac = 1 - (v - yMin) / (yMax - yMin || 1);
                  const y = PAD.top + yFrac * (CHART_HEIGHT - PAD.top - PAD.bottom);
                  return (
                    <line
                      key={v}
                      x1={PAD.left}
                      y1={y}
                      x2="100%"
                      y2={y}
                      stroke="rgba(255,255,255,0.06)"
                      strokeWidth={0.5}
                      strokeDasharray="4 4"
                    />
                  );
                })}

                {/* Curves */}
                {curves.map((curve) => {
                  const w = containerRef.current
                    ? containerRef.current.getBoundingClientRect().width - 72
                    : 800;
                  const points = curve.history
                    .map((h) => {
                      const { x, y } = toSvg(h.timestamp, h.omegaComposite, w);
                      return `${x},${y}`;
                    })
                    .join(" ");

                  // Fill polygon
                  const first = toSvg(
                    curve.history[0].timestamp,
                    0,
                    w,
                  );
                  const last = toSvg(
                    curve.history[curve.history.length - 1].timestamp,
                    0,
                    w,
                  );
                  const fillPoints = `${first.x},${first.y} ${points} ${last.x},${last.y}`;

                  return (
                    <g key={curve.nodeId}>
                      <polygon
                        points={fillPoints}
                        fill={`${curve.color}08`}
                      />
                      <polyline
                        points={points}
                        fill="none"
                        stroke={curve.color}
                        strokeWidth={1.5}
                        strokeLinejoin="round"
                        opacity={0.85}
                      />
                    </g>
                  );
                })}

                {/* Timeline position indicator */}
                {!isLive && (() => {
                  const w = containerRef.current
                    ? containerRef.current.getBoundingClientRect().width - 72
                    : 800;
                  const { x } = toSvg(timelinePosition, 0, w);
                  return (
                    <line
                      x1={x}
                      y1={PAD.top}
                      x2={x}
                      y2={CHART_HEIGHT - PAD.bottom}
                      stroke="var(--accent-cyan)"
                      strokeWidth={1}
                      opacity={0.4}
                      strokeDasharray="2 2"
                    />
                  );
                })()}

                {/* Hover crosshair */}
                {hoverX !== null && (
                  <line
                    x1={hoverX}
                    y1={PAD.top}
                    x2={hoverX}
                    y2={CHART_HEIGHT - PAD.bottom}
                    stroke="rgba(255,255,255,0.2)"
                    strokeWidth={1}
                    strokeDasharray="2 2"
                  />
                )}
              </svg>

              {/* Hover tooltip */}
              {hoverValues && hoverX !== null && (
                <div
                  className="absolute z-20 pointer-events-none"
                  style={{
                    left: `${hoverX + 84}px`, // offset for label column + padding
                    top: "-4px",
                  }}
                >
                  <div className="bg-surface-elevated border border-border rounded px-2 py-1.5 shadow-lg">
                    <div className="text-[7px] font-mono text-text-muted mb-1">
                      {new Date(hoverValues.ts).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </div>
                    {hoverValues.values.map((v) => (
                      <div key={v.nodeId} className="flex items-center gap-2 text-[8px] font-mono">
                        <span
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: v.color }}
                        />
                        <span className="text-foreground truncate max-w-[120px]">
                          {v.label}
                        </span>
                        <span
                          className="font-bold ml-auto"
                          style={{ color: getLineColor(v.omega) }}
                        >
                          {v.omega.toFixed(1)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-2 px-4 pb-2 flex-wrap">
            <div className="min-w-[72px] flex-shrink-0" />
            {curves.map((curve) => (
              <button
                key={curve.nodeId}
                onClick={() => togglePinned(curve.nodeId)}
                className="flex items-center gap-1.5 px-2 py-0.5 rounded border border-border hover:border-accent-red/40 transition-colors group"
                title={`Remove ${curve.label}`}
              >
                <span
                  className="w-2 h-0.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: curve.color }}
                />
                <span className="text-[8px] font-mono text-foreground group-hover:text-accent-red transition-colors truncate max-w-[100px]">
                  {curve.label}
                </span>
                <span className="text-[7px] text-text-muted group-hover:text-accent-red transition-colors">
                  {"\u2715"}
                </span>
              </button>
            ))}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
