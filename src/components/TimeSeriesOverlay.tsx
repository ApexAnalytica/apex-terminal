"use client";

import { useEffect, useMemo, useState, useCallback, useRef, useLayoutEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useApexStore } from "@/stores/useApexStore";
import { getDomainColor } from "@/lib/graph-color";
import { getNodeDataDescription } from "@/lib/real-timeseries";
import type { NodeTemporalState } from "@/lib/temporal-data";

const CHART_HEIGHT = 120;
// left/right are overridden at runtime to match the TimeDial track's actual
// horizontal span so the chart's plot region and the scrubber line up.
const PAD = { top: 12, bottom: 20, left: 32, right: 12 };

/**
 * A "sparse" series is one with fewer published timepoints than this threshold
 * relative to the visible x-axis span. We show a badge and render hold-forward.
 * Dense synthetic/real series (e.g. monthly oil prices) are unaffected.
 */
const SPARSE_POINT_THRESHOLD = 20;

/**
 * Build a hold-forward step-line path string for the given history,
 * extended to xEnd. For each segment [i, i+1] the value is held at
 * history[i].omegaComposite until history[i+1].timestamp. After the
 * last published point the value is held forward to xEnd.
 *
 * Returns the polyline points string and the fill polygon points string.
 * Only used when history.length >= 1.
 */
function buildHoldForwardPoints(
  history: NodeTemporalState[],
  xStart: number,
  xEnd: number,
  yMin: number,
  yMax: number,
  plotLeft: number,
  plotRight: number,
  totalWidth: number,
): { linePoints: string; fillPoints: string } {
  const plotW = totalWidth - plotLeft - plotRight;
  const xRange = xEnd - xStart || 1;
  const yRange = yMax - yMin || 1;

  const toX = (ts: number) =>
    plotLeft + ((ts - xStart) / xRange) * plotW;
  // Caller passes per-curve [yMin, yMax] for normalized rendering; this
  // helper itself stays unit-agnostic.
  const toY = (omega: number) =>
    PAD.top + (1 - (omega - yMin) / yRange) * (CHART_HEIGHT - PAD.top - PAD.bottom);

  const pts: string[] = [];

  for (let i = 0; i < history.length; i++) {
    const x = toX(history[i].timestamp);
    const y = toY(history[i].omegaComposite);
    if (i === 0) {
      pts.push(`${x},${y}`);
    } else {
      // Step: horizontal segment at previous value, then drop to new value
      const prevY = toY(history[i - 1].omegaComposite);
      pts.push(`${x},${prevY}`);
      pts.push(`${x},${y}`);
    }
  }

  // Hold last value forward to xEnd
  if (history.length > 0) {
    const lastY = toY(history[history.length - 1].omegaComposite);
    const endX = toX(xEnd);
    pts.push(`${endX},${lastY}`);
  }

  const linePoints = pts.join(" ");

  // Fill polygon: baseline is yMin (bottom of chart)
  const baseY = toY(yMin);
  const firstX = history.length > 0 ? toX(history[0].timestamp) : toX(xStart);
  const lastX = toX(xEnd);
  const fillPoints = `${firstX},${baseY} ${linePoints} ${lastX},${baseY}`;

  return { linePoints, fillPoints };
}

function getLineColor(value: number): string {
  if (value > 9) return "#ff1744";
  if (value >= 7) return "#ffab00";
  if (value >= 5) return "#ff6d00";
  return "#00e676";
}

/**
 * Format a raw underlying metric for the tooltip.
 *  - Big numbers (≥ 1000) get thousands separators, no decimals.
 *  - Small magnitudes (< 1) keep 3 sig figs.
 *  - Everything else: 2 decimal places, which works for percentages,
 *    indices, USD/bbl, USD/T, etc.
 */
function formatRawValue(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1000) return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (abs >= 1) return value.toFixed(2);
  if (abs >= 0.01) return value.toFixed(3);
  return value.toExponential(2);
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
  const timelineDragging = useApexStore((s) => s.timelineDragging);
  // Watchlist discovery inputs — the consolidated dock surfaces "suggested"
  // series to pin (selected → live-fed → top-Ω) directly in the left rail,
  // folding in what the old standalone risk-card row used to do.
  const selectedNode = useApexStore((s) => s.selectedNode);
  const selectedNodes = useApexStore((s) => s.selectedNodes);

  const [hoverX, setHoverX] = useState<number | null>(null);
  // X-axis zoom mode.
  //  - "dial": chart x-axis mirrors the TimeDial's 60-day window so the
  //    chart cursor lines up with the scrubber below. Default, matches the
  //    pre-existing behaviour. Curves with multi-year history (e.g. World
  //    Bank annual series — fertilizer consumption, debt-to-GDP) compress
  //    to a hold-forward flat line at the current value because every
  //    historical point falls before xStart.
  //  - "data": chart x-axis expands to span the pinned curves' actual
  //    history. Multi-year WB / annual series render as real curves;
  //    the TimeDial below is unchanged (it stays a 60-day scrubber) so
  //    the chart cursor no longer aligns with the dial in this mode.
  //    This is the explicit trade-off — comparison mode for sparse
  //    series, alignment mode otherwise.
  const [xAxisMode, setXAxisMode] = useState<"dial" | "data">("dial");

  // When the user clicks a dial preset (1H / 1D / 1W / 1M), `timelineRange.start`
  // changes. That click is the strongest possible signal that they want the
  // chart to track the dial again, so we auto-reset out of "data" mode.
  //
  // We watch `.start` specifically (not `.end`) because `.end` advances every
  // live tick — watching `.end` would kick the user out of "data" mode every
  // second, which would defeat the feature. `.start` only changes on dial-
  // preset clicks and full timeline-range edits.
  //
  // Without this reset, the FIT toggle was a one-way trap: once a user clicked
  // into "data" mode, the chart appeared to ignore subsequent dial clicks
  // because the chart x-axis stayed pinned to the full data span while the
  // dial scrubber moved beneath it. Reported as "1D shows curves, 1M flattens
  // to a line, 1D doesn't restore detail" on 2026-05-21.
  useEffect(() => {
    setXAxisMode("dial");
  }, [timelineRange.start]);

  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // The SVG uses preserveAspectRatio="none", so viewBox width is set to the
  // rendered pixel width for a 1:1 mapping. Left/right inset inside the SVG
  // is measured against the TimeDial track below so the chart's plot region
  // aligns with the scrubber. Falls back to PAD defaults pre-measurement.
  const [geom, setGeom] = useState<{ width: number; left: number; right: number }>({
    width: 800,
    left: PAD.left,
    right: PAD.right,
  });

  useLayoutEffect(() => {
    if (pinnedNodes.length === 0) return;
    const update = () => {
      if (!svgRef.current) return;
      const track = document.querySelector<HTMLElement>("[data-timedial-track]");
      const svgRect = svgRef.current.getBoundingClientRect();
      if (svgRect.width === 0) return;
      const width = svgRect.width;
      const left = track
        ? Math.max(0, track.getBoundingClientRect().left - svgRect.left)
        : PAD.left;
      const right = track
        ? Math.max(0, svgRect.right - track.getBoundingClientRect().right)
        : PAD.right;
      setGeom((prev) =>
        Math.abs(prev.width - width) < 0.5 &&
        Math.abs(prev.left - left) < 0.5 &&
        Math.abs(prev.right - right) < 0.5
          ? prev
          : { width, left, right },
      );
    };
    update();
    const ro = new ResizeObserver(update);
    if (svgRef.current) ro.observe(svgRef.current);
    const track = document.querySelector<HTMLElement>("[data-timedial-track]");
    if (track) ro.observe(track);
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [pinnedNodes.length]);

  const plotInset = geom;
  const chartW = geom.width;

  // Gather histories for pinned nodes. Prefer live-data history when a node
  // has any liveData[] attached (consistent with the per-card sparkline
  // behaviour in RiskPropagationFlow); fall back to synthetic omega history
  // otherwise. Nodes with no history at all fall through to noDataNodes.
  const curves = useMemo(() => {
    if (pinnedNodes.length === 0) return [];
    return pinnedNodes
      .map((nodeId) => {
        const node = graphData.nodes.find((n) => n.id === nodeId);
        if (!node) return null;
        const dataDesc = getNodeDataDescription(nodeId);

        // Live-data path: any liveData entry → plot live values.
        // For the live path the value IS the raw underlying metric
        // (FRED CPI %, oil $/bbl, etc.), so we mirror it into rawValue
        // for the tooltip — same treatment as the temporal-data path.
        const liveSignal = node.liveData?.[0];
        if (liveSignal) {
          const liveHistory: NodeTemporalState[] = [
            ...(liveSignal.history ?? []).map((h) => ({
              timestamp: new Date(h.observedAt).getTime(),
              omegaComposite: h.value,
              rawValue: h.value,
              omegaProfile: {} as unknown as NodeTemporalState["omegaProfile"],
            })),
            {
              timestamp: new Date(liveSignal.observedAt).getTime(),
              omegaComposite: liveSignal.value,
              rawValue: liveSignal.value,
              omegaProfile: {} as unknown as NodeTemporalState["omegaProfile"],
            },
          ];
          if (liveHistory.length === 0) return null;
          return {
            nodeId,
            label: node.label,
            domain: node.domain,
            color: getDomainColor(node.domain),
            history: liveHistory,
            currentOmega: liveSignal.value,
            pointCount: liveHistory.length,
            sourceLabel: `LIVE · ${liveSignal.source.split(/[\s—(]/)[0]}`,
            sourceUnit: liveSignal.unit,
          };
        }

        // Synthetic-omega fallback (existing behaviour).
        const nodeData = temporalData?.nodes.get(nodeId);
        if (!nodeData || nodeData.history.length === 0) return null;
        return {
          nodeId,
          label: node.label,
          domain: node.domain,
          color: getDomainColor(node.domain),
          history: nodeData.history,
          currentOmega: node.omegaFragility.composite,
          pointCount: nodeData.history.length,
          sourceLabel: dataDesc?.label ?? null,
          sourceUnit: dataDesc?.unit ?? null,
        };
      })
      .filter(Boolean) as {
      nodeId: string;
      label: string;
      domain: string;
      color: string;
      history: NodeTemporalState[];
      currentOmega: number;
      pointCount: number;
      sourceLabel: string | null;
      sourceUnit: string | null;
    }[];
  }, [pinnedNodes, temporalData, graphData]);

  // (Pinned nodes with no plottable history are surfaced directly in the
  // watchlist rail below via each row's `hasData: false` branch, so the
  // old separate `noDataNodes` list is no longer needed.)

  // Watchlist rows for the left rail — one per pinned node, in pin order.
  // Prefer the rich curve data (color + current value + unit); fall back to
  // a bare label for pinned nodes that carry no plottable history yet so the
  // user can still see and unpin them.
  const pinnedRows = useMemo(() => {
    const curveById = new Map(curves.map((c) => [c.nodeId, c]));
    return pinnedNodes
      .map((id) => {
        const curve = curveById.get(id);
        if (curve) {
          return {
            nodeId: id,
            label: curve.label,
            color: curve.color,
            omega: curve.currentOmega,
            unit: curve.sourceUnit,
            hasData: true,
          };
        }
        const node = graphData.nodes.find((n) => n.id === id);
        if (!node) return null;
        return {
          nodeId: id,
          label: node.label,
          color: getDomainColor(node.domain),
          omega: node.omegaFragility.composite,
          unit: null as string | null,
          hasData: false,
        };
      })
      .filter(Boolean) as {
      nodeId: string;
      label: string;
      color: string;
      omega: number;
      unit: string | null;
      hasData: boolean;
    }[];
  }, [pinnedNodes, curves, graphData]);

  // Suggested series to pin: explicit selection first, then live-fed nodes,
  // then the highest-Ω nodes — minus anything already pinned. Capped so the
  // rail stays scannable. This is the discovery path that used to live in
  // the separate risk-card strip.
  const suggestions = useMemo(() => {
    const seen = new Set(pinnedNodes);
    const out: { nodeId: string; label: string; color: string; omega: number }[] = [];
    const push = (id: string) => {
      if (seen.has(id)) return;
      const n = graphData.nodes.find((x) => x.id === id);
      if (!n) return;
      seen.add(id);
      out.push({
        nodeId: n.id,
        label: n.label,
        color: getDomainColor(n.domain),
        omega: n.omegaFragility.composite,
      });
    };
    for (const id of [selectedNode, ...selectedNodes]) if (id) push(id);
    for (const n of graphData.nodes) if (n.liveData && n.liveData.length > 0) push(n.id);
    [...graphData.nodes]
      .sort((a, b) => b.omegaFragility.composite - a.omegaFragility.composite)
      .forEach((n) => push(n.id));
    return out.slice(0, 6);
  }, [graphData, pinnedNodes, selectedNode, selectedNodes]);

  // Per-curve scale: each pinned curve normalizes to its OWN min/max so
  // curves with mismatched units (Ω 0-10, %, mb/d, USD/ton, programs)
  // can be visually compared by shape, not absolute value. Without this,
  // a single high-magnitude curve dominated the chart and lower-magnitude
  // curves collapsed to flat lines along the bottom.
  const curveScales = useMemo(() => {
    const scales = new Map<string, { min: number; max: number }>();
    for (const curve of curves) {
      let lo = Infinity;
      let hi = -Infinity;
      for (const h of curve.history) {
        if (h.omegaComposite < lo) lo = h.omegaComposite;
        if (h.omegaComposite > hi) hi = h.omegaComposite;
      }
      if (!Number.isFinite(lo)) {
        lo = 0;
        hi = 1;
      }
      if (lo === hi) {
        // Avoid divide-by-zero: a flat curve gets a tiny synthetic range
        // so it renders as a horizontal line at the chart's vertical center.
        hi = lo + 1;
        lo = lo - 1;
      }
      scales.set(curve.nodeId, { min: lo, max: hi });
    }
    return scales;
  }, [curves]);

  // Compute dynamic y-axis range from actual data with padding.
  // (When normalized, the chart axis is 0..1; gridLines reflect that.)
  // Kept for the rare single-curve case where global scale is meaningful.
  const { yMin, yMax, gridLines } = useMemo(() => {
    if (curves.length === 0) return { yMin: 0, yMax: 1, gridLines: [0.25, 0.5, 0.75] };
    // Multi-curve: normalized 0..1 axis with quartile gridlines.
    return { yMin: 0, yMax: 1, gridLines: [0.25, 0.5, 0.75] };
  }, [curves]);

  // Data-driven x-axis bounds: min/max across every pinned curve's history.
  // Used by the "data" zoom mode and by the FIT button's availability check.
  // When no curve has history, this falls back to the dial range so callers
  // can use it as a safe default.
  const dataXBounds = useMemo(() => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const c of curves) {
      for (const h of c.history) {
        if (h.timestamp < lo) lo = h.timestamp;
        if (h.timestamp > hi) hi = h.timestamp;
      }
    }
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo === hi) {
      return { start: timelineRange.start, end: timelineRange.end };
    }
    // 2% padding on each side so endpoints don't sit flush against the
    // chart edges (matters visually for hold-forward markers).
    const pad = (hi - lo) * 0.02;
    return { start: lo - pad, end: hi + pad };
  }, [curves, timelineRange]);

  // FIT is only meaningful when at least one pinned curve has history that
  // extends meaningfully outside the dial window. We require >25% of the
  // span to fall before timelineRange.start to flag this — that's the
  // regime where the curve would render as a flat hold-forward line in
  // "dial" mode and the user would benefit from zooming out.
  const shouldOfferFit = useMemo(() => {
    if (curves.length === 0) return false;
    const dialSpan = timelineRange.end - timelineRange.start || 1;
    const overshootStart = Math.max(0, timelineRange.start - dataXBounds.start);
    return overshootStart > dialSpan * 0.25;
  }, [curves, dataXBounds, timelineRange]);

  // Resolved x-axis. "dial" mirrors timelineRange (chart aligns with the
  // TimeDial scrubber). "data" uses the curves' actual history span — the
  // chart cursor visually decouples from the dial below, in exchange for
  // making multi-year / annual series readable as curves rather than flat
  // hold-forward lines. See the xAxisMode comment above for context.
  const { xStart, xEnd } = useMemo(() => {
    if (xAxisMode === "data") {
      return { xStart: dataXBounds.start, xEnd: dataXBounds.end };
    }
    return { xStart: timelineRange.start, xEnd: timelineRange.end };
  }, [xAxisMode, timelineRange, dataXBounds]);

  // Convert data coordinates to SVG coordinates. Per-curve normalization:
  // when curveId is provided, the value is mapped to its own 0..1 range
  // (set by `curveScales`), then placed on the shared 0..1 axis. This is
  // the path used by all multi-curve renderings.
  const toSvg = useCallback(
    (timestamp: number, omega: number, width: number, curveId?: string) => {
      const xRange = xEnd - xStart || 1;
      const x =
        plotInset.left +
        ((timestamp - xStart) / xRange) *
          (width - plotInset.left - plotInset.right);
      let norm: number;
      if (curveId) {
        const scale = curveScales.get(curveId);
        if (scale) {
          norm = (omega - scale.min) / (scale.max - scale.min || 1);
        } else {
          norm = (omega - yMin) / (yMax - yMin || 1);
        }
      } else {
        norm = (omega - yMin) / (yMax - yMin || 1);
      }
      const y =
        PAD.top + (1 - norm) * (CHART_HEIGHT - PAD.top - PAD.bottom);
      return { x, y };
    },
    [xStart, xEnd, yMin, yMax, curveScales, plotInset],
  );

  // Resolve which x to anchor the tooltip to. Hover wins when the cursor is
  // over the chart; otherwise — if the user is dragging the dial below — pin
  // to the dial position so the same value pop-up appears next to the smaller
  // lines instead of just an unlabeled vertical playhead.
  const tooltipAnchor = useMemo<
    { x: number; source: "hover" | "drag" } | null
  >(() => {
    if (hoverX !== null) return { x: hoverX, source: "hover" };
    if (timelineDragging) {
      const xRange = xEnd - xStart || 1;
      const plotW = chartW - plotInset.left - plotInset.right;
      const x = plotInset.left + ((timelinePosition - xStart) / xRange) * plotW;
      // Clamp inside the plot region; if the dial is outside the visible
      // window (e.g. mid-zoom transition), just don't show a tooltip.
      if (x < plotInset.left || x > chartW - plotInset.right) return null;
      return { x, source: "drag" };
    }
    return null;
  }, [hoverX, timelineDragging, timelinePosition, xStart, xEnd, plotInset, chartW]);

  // Get values at the anchored x — same logic for hover and drag.
  const tooltipValues = useMemo(() => {
    if (!tooltipAnchor) return null;
    const xRange = xEnd - xStart || 1;
    const ts =
      xStart +
      ((tooltipAnchor.x - plotInset.left) / (chartW - plotInset.left - plotInset.right)) *
        xRange;
    const values: {
      nodeId: string;
      label: string;
      color: string;
      omega: number;
      rawValue?: number;
      unit?: string | null;
    }[] = [];
    for (const curve of curves) {
      const isSparse = curve.pointCount < SPARSE_POINT_THRESHOLD;
      let omega: number;
      let rawValue: number | undefined;
      if (isSparse) {
        // Hold-forward: return the last published value at or before ts.
        // If ts is before the first point, return the first point's value.
        let held = curve.history[0];
        for (const h of curve.history) {
          if (h.timestamp <= ts) held = h;
          else break;
        }
        omega = held.omegaComposite;
        rawValue = held.rawValue;
      } else {
        // Dense series: find closest timestamp (original behaviour)
        let closest = curve.history[0];
        for (const h of curve.history) {
          if (Math.abs(h.timestamp - ts) < Math.abs(closest.timestamp - ts)) {
            closest = h;
          }
        }
        omega = closest.omegaComposite;
        rawValue = closest.rawValue;
      }
      values.push({
        nodeId: curve.nodeId,
        label: curve.label,
        color: curve.color,
        omega,
        rawValue,
        unit: curve.sourceUnit,
      });
    }
    return { ts, values };
  }, [tooltipAnchor, curves, xStart, xEnd, plotInset, chartW]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      if (x >= plotInset.left && x <= rect.width - plotInset.right) {
        setHoverX(x);
      } else {
        setHoverX(null);
      }
    },
    [plotInset],
  );

  // Render nothing only when there's genuinely nothing to show — no pinned
  // series and no candidates to suggest (e.g. empty workspace). Page-level
  // gating on `hasGraph` is the primary guard; this is the safety net.
  if (pinnedRows.length === 0 && suggestions.length === 0) return null;

  const hasPinned = pinnedRows.length > 0;
  const liveCount = curves.filter((c) => c.sourceLabel?.startsWith("LIVE")).length;

  return (
    <div
      ref={containerRef}
      className="border-t border-border bg-surface-elevated flex items-stretch"
      data-tour="risk-flow"
    >
      {/* LEFT: watchlist rail — pinned series + suggestions. Doubles as the
          chart legend (each pinned row is a curve) and the discovery surface
          (suggested rows pin with one click). Replaces the old standalone
          risk-card strip and the chart's bottom legend chips. */}
      <div className="w-56 flex-shrink-0 border-r border-border flex flex-col">
        <div className="flex items-center justify-between px-3 py-1 border-b border-border">
          <span className="text-[8px] font-[family-name:var(--font-michroma)] tracking-wider text-accent-cyan">
            WATCHLIST
          </span>
          <div className="flex items-center gap-2">
            {liveCount > 0 && (
              <span className="flex items-center gap-1 text-[7px] font-mono text-accent-green">
                <span className="w-1.5 h-1.5 rounded-full bg-accent-green animate-pulse" />
                {liveCount} LIVE
              </span>
            )}
            {hasPinned && (
              <button
                onClick={clearPinned}
                className="text-[7px] font-mono text-text-muted hover:text-accent-red transition-colors"
                title="Unpin all series"
              >
                CLEAR
              </button>
            )}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-1.5 space-y-0.5 max-h-[180px]">
          {hasPinned && (
            <div className="text-[7px] font-mono text-text-muted/50 px-1 pb-0.5 tracking-wider">
              PINNED · {pinnedRows.length}
            </div>
          )}
          {pinnedRows.map((row) => (
            <button
              key={row.nodeId}
              onClick={() => togglePinned(row.nodeId)}
              className="w-full flex items-center gap-2 px-1.5 py-1 rounded hover:bg-surface transition-colors group text-left"
              title={`${row.label} — click to unpin`}
            >
              <span className="text-[9px] leading-none text-accent-cyan group-hover:text-accent-red transition-colors flex-shrink-0">
                ◉
              </span>
              <span
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: row.color, opacity: row.hasData ? 1 : 0.4 }}
              />
              <span className="text-[9px] font-mono text-foreground truncate flex-1">
                {row.label}
              </span>
              {row.hasData ? (
                <span
                  className="text-[9px] font-mono font-bold tabular-nums flex-shrink-0"
                  style={{ color: getLineColor(row.omega) }}
                >
                  {row.omega.toFixed(1)}
                </span>
              ) : (
                <span className="text-[6px] font-mono text-text-muted/40 flex-shrink-0">
                  NO DATA
                </span>
              )}
            </button>
          ))}
          {suggestions.length > 0 && (
            <div className="text-[7px] font-mono text-text-muted/50 px-1 pt-1.5 pb-0.5 tracking-wider">
              SUGGESTED
            </div>
          )}
          {suggestions.map((s) => (
            <button
              key={s.nodeId}
              onClick={() => togglePinned(s.nodeId)}
              className="w-full flex items-center gap-2 px-1.5 py-1 rounded hover:bg-surface transition-colors group text-left"
              title={`${s.label} — click to pin to chart`}
            >
              <span className="text-[9px] leading-none text-text-muted/50 group-hover:text-accent-cyan transition-colors flex-shrink-0">
                ○
              </span>
              <span
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: s.color }}
              />
              <span className="text-[9px] font-mono text-text-muted group-hover:text-foreground transition-colors truncate flex-1">
                {s.label}
              </span>
              <span
                className="text-[9px] font-mono tabular-nums flex-shrink-0"
                style={{ color: getLineColor(s.omega) }}
              >
                {s.omega.toFixed(1)}
              </span>
            </button>
          ))}
          {!hasPinned && (
            <div className="text-[7px] font-mono text-text-muted/40 px-1 pt-1.5 leading-relaxed">
              Click ○ to add a series, or select a node on the canvas.
            </div>
          )}
        </div>
      </div>

      {/* RIGHT: header + comparison chart */}
      <div className="flex-1 min-w-0 flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-1">
        <div className="hidden">
          <span className="text-[9px] font-mono text-accent-cyan">
            {"\u2261"}
          </span>
        </div>
        <span className="text-[8px] font-[family-name:var(--font-michroma)] tracking-wider text-text-muted flex-1">
          {"\u03A9"}F TIME SERIES
          {xAxisMode === "data" && (
            <span className="ml-2 text-accent-cyan/80">
              {"·"} ZOOMED {new Date(xStart).getFullYear()}{"–"}{new Date(xEnd).getFullYear()}
            </span>
          )}
        </span>
        {/* FIT toggle — surfaces only when at least one pinned curve has
            history that extends meaningfully before the dial window (the
            regime where dial-aligned x-axis renders a flat hold-forward
            line). Click flips between dial-aligned and data-span axis. */}
        {(shouldOfferFit || xAxisMode === "data") && (
          <button
            onClick={() => setXAxisMode((m) => (m === "dial" ? "data" : "dial"))}
            className={`text-[8px] font-mono transition-colors px-1.5 py-0.5 rounded border ${
              xAxisMode === "data"
                ? "text-accent-cyan border-accent-cyan/40 hover:border-accent-cyan"
                : "text-text-muted border-border hover:border-accent-cyan/30 hover:text-accent-cyan"
            }`}
            title={
              xAxisMode === "data"
                ? "Showing each series' full history. Click to snap the x-axis back to the timeline scrubber below."
                : "Some series have history older than the timeline window. Click to zoom out and show their full span."
            }
          >
            {xAxisMode === "data" ? "SYNC TO TIMELINE" : "FIT TO DATA"}
          </button>
        )}
      </div>

      {/* Chart area — show a prompt until at least one series is pinned,
          rather than an empty grid. */}
      {!hasPinned ? (
        <div
          className="flex items-center justify-center px-4"
          style={{ minHeight: CHART_HEIGHT }}
        >
          <span className="text-[9px] font-mono text-text-muted/50 text-center">
            Pin a series from the watchlist to chart it here.
          </span>
        </div>
      ) : (
      <AnimatePresence initial={false}>
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="overflow-hidden"
        >
          <div className="flex items-stretch px-4 pb-2">
            {/* Y-axis label column — normalized 0..100% so curves with mismatched
                units share an axis without one dominating the others. */}
            <div className="min-w-[72px] flex-shrink-0 flex flex-col justify-between py-1">
              <span className="text-[7px] font-mono text-text-muted/60">100%</span>
              {/* Grid labels render top→bottom, so sort descending to read
                  100 / 75 / 50 / 25 / 0 down the axis (previously printed
                  in ascending order, giving the nonsensical 100/25/50/75/0). */}
              {[...gridLines].sort((a, b) => b - a).map((v) => (
                <span key={v} className="text-[7px] font-mono text-text-muted/60">
                  {Math.round(v * 100)}%
                </span>
              ))}
              <span className="text-[7px] font-mono text-text-muted/60">0%</span>
              <span className="text-[6px] font-mono text-text-muted/40 tracking-wider mt-0.5">
                % OF RANGE
              </span>
            </div>

            {/* SVG Chart */}
            <div className="flex-1 min-w-0 relative">
              <svg
                ref={svgRef}
                width="100%"
                height={CHART_HEIGHT}
                className="block"
                onMouseMove={handleMouseMove}
                onMouseLeave={() => setHoverX(null)}
                preserveAspectRatio="none"
                viewBox={`0 0 ${chartW} ${CHART_HEIGHT}`}
              >
                {/* Grid lines */}
                {gridLines.map((v) => {
                  const yFrac = 1 - (v - yMin) / (yMax - yMin || 1);
                  const y = PAD.top + yFrac * (CHART_HEIGHT - PAD.top - PAD.bottom);
                  return (
                    <line
                      key={v}
                      x1={plotInset.left}
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
                  const w = chartW;
                  const isSparse = curve.pointCount < SPARSE_POINT_THRESHOLD;

                  if (isSparse) {
                    // Hold-forward step-line rendering:
                    // Each published value is held until the next published
                    // point, then steps up/down. The last value is extended
                    // to xEnd. This makes a 3-point series cover the full
                    // axis width rather than collapsing to a tiny segment.
                    // Handles the 1-point fallback (flat horizontal line).
                    // Per-curve normalization: pass this curve's own min/max
                    // so it renders against its own range, not the global one.
                    const scale = curveScales.get(curve.nodeId) ?? { min: yMin, max: yMax };
                    const { linePoints, fillPoints } = buildHoldForwardPoints(
                      curve.history,
                      xStart,
                      xEnd,
                      scale.min,
                      scale.max,
                      plotInset.left,
                      plotInset.right,
                      w,
                    );
                    return (
                      <g key={curve.nodeId}>
                        <polygon
                          points={fillPoints}
                          fill={`${curve.color}08`}
                        />
                        <polyline
                          points={linePoints}
                          fill="none"
                          stroke={curve.color}
                          strokeWidth={1.5}
                          strokeLinejoin="round"
                          strokeDasharray="6 3"
                          opacity={0.75}
                        />
                        {/* Published point markers */}
                        {curve.history.map((h) => {
                          const { x, y } = toSvg(h.timestamp, h.omegaComposite, w, curve.nodeId);
                          return (
                            <circle
                              key={h.timestamp}
                              cx={x}
                              cy={y}
                              r={3}
                              fill={curve.color}
                              opacity={0.9}
                            />
                          );
                        })}
                      </g>
                    );
                  }

                  // Dense series — original solid polyline rendering
                  const points = curve.history
                    .map((h) => {
                      const { x, y } = toSvg(h.timestamp, h.omegaComposite, w, curve.nodeId);
                      return `${x},${y}`;
                    })
                    .join(" ");

                  // Fill polygon — baseline at this curve's normalized 0
                  const scale = curveScales.get(curve.nodeId);
                  const baseValue = scale?.min ?? yMin;
                  const first = toSvg(
                    curve.history[0].timestamp,
                    baseValue,
                    w,
                    curve.nodeId,
                  );
                  const last = toSvg(
                    curve.history[curve.history.length - 1].timestamp,
                    baseValue,
                    w,
                    curve.nodeId,
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

                {/* Timeline position indicator — mirrors the TimeDial scrub
                    on the chart. In live mode, follows the right edge (current
                    time) as timelineRange.end advances. */}
                {(() => {
                  const pos = isLive ? xEnd : timelinePosition;
                  const { x } = toSvg(pos, 0, chartW);
                  return (
                    <g>
                      <line
                        x1={x}
                        y1={PAD.top}
                        x2={x}
                        y2={CHART_HEIGHT - PAD.bottom}
                        stroke="var(--accent-cyan)"
                        strokeWidth={1}
                        opacity={isLive ? 0.7 : 0.5}
                        strokeDasharray={isLive ? undefined : "2 2"}
                      />
                      {/* Cap on the indicator to make "now" read as a dial */}
                      <circle
                        cx={x}
                        cy={PAD.top}
                        r={2.5}
                        fill="var(--accent-cyan)"
                        opacity={isLive ? 0.9 : 0.6}
                      />
                    </g>
                  );
                })()}

                {/* Crosshair + per-curve intersection dots. The dashed white
                    line is suppressed during dial-drag because the cyan
                    timelinePosition playhead above already marks that x. */}
                {tooltipAnchor && tooltipValues && (
                  <g>
                    {tooltipAnchor.source === "hover" && (
                      <line
                        x1={tooltipAnchor.x}
                        y1={PAD.top}
                        x2={tooltipAnchor.x}
                        y2={CHART_HEIGHT - PAD.bottom}
                        stroke="rgba(255,255,255,0.3)"
                        strokeWidth={1}
                        strokeDasharray="3 3"
                      />
                    )}
                    {tooltipValues.values.map((v) => {
                      const { y } = toSvg(tooltipValues.ts, v.omega, chartW);
                      return (
                        <g key={v.nodeId}>
                          <circle cx={tooltipAnchor.x} cy={y} r={4} fill={v.color} opacity={0.25} />
                          <circle cx={tooltipAnchor.x} cy={y} r={2} fill={v.color} />
                        </g>
                      );
                    })}
                  </g>
                )}
              </svg>

              {/* X-axis date labels — aligned to the plot region so the
                  start/mid/end markers sit directly above the TimeDial. */}
              <div
                className="flex justify-between mt-0.5"
                style={{ paddingLeft: plotInset.left, paddingRight: plotInset.right }}
              >
                <span className="text-[7px] font-mono text-text-muted/50">
                  {new Date(xStart).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                </span>
                <span className="text-[7px] font-mono text-text-muted/50">
                  {new Date((xStart + xEnd) / 2).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                </span>
                <span className="text-[7px] font-mono text-text-muted/50">
                  {new Date(xEnd).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                </span>
              </div>

              {/* Tooltip — anchors next to the crosshair (hover) or the dial
                  playhead (drag). Inside the chart wrapper, which is
                  position: relative. Flips to the left of the cursor when
                  near the right edge. */}
              {tooltipValues && tooltipAnchor && (() => {
                const anchorX = tooltipAnchor.x;
                const flipLeft = anchorX > chartW * 0.7;
                return (
                <div
                  className="absolute z-20 pointer-events-none"
                  style={{
                    left: flipLeft ? undefined : `${anchorX + 12}px`,
                    right: flipLeft ? `${chartW - anchorX + 12}px` : undefined,
                    top: "-4px",
                  }}
                >
                  <div className="bg-surface-elevated border border-border rounded px-2 py-1.5 shadow-lg">
                    <div className="text-[7px] font-mono text-text-muted mb-1">
                      {new Date(tooltipValues.ts).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </div>
                    {tooltipValues.values.map((v) => {
                      // Prefer raw underlying metric (e.g. 6.76 % food
                      // inflation) over the omega-normalized value when
                      // the temporal data carries it. Without this the
                      // tooltip just repeats the per-card sparkline's
                      // 0-10 omega scale, leaving the user without any
                      // sense of the actual quantity being tracked.
                      const showRaw = v.rawValue !== undefined;
                      const display = showRaw
                        ? `${formatRawValue(v.rawValue!)}${v.unit ? ` ${v.unit}` : ""}`
                        : v.omega.toFixed(1);
                      return (
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
                            {display}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                );
              })()}
            </div>
          </div>

        </motion.div>
      </AnimatePresence>
      )}
      </div>
    </div>
  );
}
