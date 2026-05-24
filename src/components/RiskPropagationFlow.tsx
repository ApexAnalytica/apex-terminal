"use client";

import { useMemo, useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useApexStore } from "@/stores/useApexStore";
import { useFilteredGraph } from "@/hooks/useFilteredGraph";
import { getDomainColor } from "@/lib/graph-color";
import { buildRiskCards } from "@/lib/graph-data";
import { useTemporalGraph } from "@/hooks/useTemporalGraph";
import type { NodeTemporalState } from "@/lib/temporal-data";
import { getNodeDataDescription } from "@/lib/real-timeseries";
import {
  feedDotClass,
  feedModeFromSource,
  feedSparklineColor,
  formatLiveSignal,
  summarizeLiveFeeds,
  timeAgoLabel,
} from "@/lib/feeds/display";

function getBarColor(value: number): string {
  if (value > 9) return "#ff1744";
  if (value >= 7) return "#ffab00";
  if (value >= 5) return "#ff6d00";
  return "#00e676";
}

/**
 * Tiny sparkline SVG for a node's omega history.
 *
 * x-axis: real time, mapped from `xStart`/`xEnd` (passed from the
 * caller — the global timelineRange) so every tile shares the same
 * x-axis as the TimeDial scrubber and the bottom overlay. Without
 * this the previous index-based x stretched a 2-point series to
 * cover the whole tile while a 24-point series got compressed —
 * tiles looked completely heterogeneous.
 *
 * Sparse-data behaviour: when only 1 point is in range we draw a
 * horizontal hold-forward line at that value, so every tile has a
 * line edge-to-edge. When 0 points are in range the component
 * returns null and the parent renders the "LIVE — building" hint.
 */
function OmegaSparkline({
  history,
  width,
  height,
  color,
  highlightIdx,
  xStart,
  xEnd,
}: {
  history: NodeTemporalState[];
  width: number;
  height: number;
  color: string;
  highlightIdx: number | null;
  xStart: number;
  xEnd: number;
}) {
  if (history.length === 0) return null;

  const pad = 2;
  const xRange = xEnd - xStart || 1;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const toX = (ts: number) => pad + ((ts - xStart) / xRange) * innerW;

  const omegas = history.map((h) => h.omegaComposite);
  const min = Math.min(...omegas);
  const max = Math.max(...omegas);
  const range = max - min || 1;
  const toY = (v: number) => height - pad - ((v - min) / range) * innerH;

  // Build the polyline points. For a single observation we draw a
  // horizontal hold-forward line; for ≥2 we connect each point in
  // chronological order and then hold the last value forward to xEnd
  // so the line always reaches the right edge of the tile.
  const polyPts: string[] = [];
  if (history.length === 1) {
    const onlyY = toY(history[0].omegaComposite);
    polyPts.push(`${toX(history[0].timestamp)},${onlyY}`);
    polyPts.push(`${pad + innerW},${onlyY}`);
  } else {
    for (const h of history) {
      polyPts.push(`${toX(h.timestamp)},${toY(h.omegaComposite)}`);
    }
    const last = history[history.length - 1];
    polyPts.push(`${pad + innerW},${toY(last.omegaComposite)}`);
  }
  const points = polyPts.join(" ");
  const firstX = toX(history[0].timestamp);
  const lastX = pad + innerW;
  const fillPoints = `${firstX},${height - pad} ${points} ${lastX},${height - pad}`;

  // Highlight dot — clamp to a real point in case the parent's
  // highlightIdx is stale relative to a freshly-filtered history.
  const idx = Math.max(
    0,
    Math.min(history.length - 1, highlightIdx ?? history.length - 1),
  );
  const dotX = toX(history[idx].timestamp);
  const dotY = toY(history[idx].omegaComposite);

  return (
    <svg width={width} height={height} className="flex-shrink-0">
      {/* Grid lines */}
      {[0.25, 0.5, 0.75].map((frac) => (
        <line
          key={frac}
          x1={pad}
          y1={pad + (1 - frac) * innerH}
          x2={width - pad}
          y2={pad + (1 - frac) * innerH}
          stroke="rgba(255,255,255,0.04)"
          strokeWidth={0.5}
        />
      ))}
      {/* Fill */}
      <polygon points={fillPoints} fill={`${color}10`} />
      {/* Line */}
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.2}
        strokeLinejoin="round"
      />
      {/* Current value dot */}
      <circle cx={dotX} cy={dotY} r={3} fill={color} opacity={0.4} />
      <circle cx={dotX} cy={dotY} r={1.5} fill={color} />
    </svg>
  );
}

export default function RiskPropagationFlow() {
  const graphData = useFilteredGraph();
  const shocks = useApexStore((s) => s.shocks);
  const selectedNode = useApexStore((s) => s.selectedNode);
  const selectedNodes = useApexStore((s) => s.selectedNodes);
  const setSelectedNode = useApexStore((s) => s.setSelectedNode);
  const isLive = useApexStore((s) => s.isLive);
  const temporalData = useApexStore((s) => s.temporalData);
  const initTemporalData = useApexStore((s) => s.initTemporalData);
  const timelinePosition = useApexStore((s) => s.timelinePosition);
  const timelineRange = useApexStore((s) => s.timelineRange);
  const { graph: temporalGraph } = useTemporalGraph();
  const pinnedNodes = useApexStore((s) => s.pinnedTimeSeriesNodes);
  const togglePinned = useApexStore((s) => s.togglePinnedTimeSeries);
  const [collapsed, setCollapsed] = useState(false);

  // Ensure temporal data is initialized (may not be if TimeDial hasn't mounted yet)
  useEffect(() => {
    initTemporalData();
  }, [initTemporalData]);
  const [hoveredDay, setHoveredDay] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Use temporal graph when scrubbing, otherwise use live graph
  const activeGraph = isLive ? graphData : temporalGraph;

  // Combine single-select and multi-select into a unified set of selected IDs
  const allSelectedIds = useMemo(() => {
    const ids = new Set(selectedNodes);
    if (selectedNode) ids.add(selectedNode);
    return ids;
  }, [selectedNode, selectedNodes]);

  // Compute base risk cards once per {activeGraph, shocks} — not on timeline scrub.
  // temporalGraph (and therefore activeGraph) only changes when the snapshot itself
  // changes, but the riskMap allocation used to re-run on every timelinePosition tick
  // because the outer memo included allSelectedIds in its deps and was therefore
  // re-evaluated whenever selection changed, pulling in the activeGraph recompute path.
  // Splitting into two memos breaks that coupling.
  const { riskCards, riskMap } = useMemo(() => {
    const cards = buildRiskCards(activeGraph, shocks);
    const map = new Map(cards.map((c) => [c.nodeId, c]));
    return { riskCards: cards, riskMap: map };
  }, [activeGraph, shocks]);

  // Get the nodes to display time series for. Priority order:
  //   1. Selected nodes (single + multi) — explicit user choice
  //   2. Nodes with `liveData` attached — surface live-fed nodes so the
  //      Live Coverage Program is visible without clicking
  //   3. Top-Ω risk nodes — the original default
  // Depends on riskCards/riskMap identity (stable across scrub) +
  // allSelectedIds + activeGraph (for liveData scan).
  const displayNodes = useMemo(() => {
    const cards: typeof riskCards = [];
    const seen = new Set<string>();

    // Helper: synthesize a card for a node not in the riskCards list
    const buildCardFor = (nodeId: string): (typeof riskCards)[number] | null => {
      const existing = riskMap.get(nodeId);
      if (existing) return existing;
      const node = activeGraph.nodes.find((n) => n.id === nodeId);
      if (!node) return null;
      const totalSeverity = shocks.reduce((sum, s) => sum + s.severity, 0);
      const shockMult = Math.min(1, totalSeverity);
      return {
        nodeId: node.id,
        label: node.label,
        category: node.category,
        omegaScore: parseFloat((node.omegaFragility.composite * (1 + shockMult * 0.05)).toFixed(1)),
        domain: node.domain,
        globalConcentration: node.globalConcentration,
      };
    };

    // 1. Selected nodes
    for (const id of allSelectedIds) {
      if (seen.has(id)) continue;
      const c = buildCardFor(id);
      if (c) {
        cards.push(c);
        seen.add(id);
      }
    }

    // 2. Live-fed nodes — any node whose `liveData[]` is non-empty
    if (allSelectedIds.size === 0) {
      for (const n of activeGraph.nodes) {
        if (seen.has(n.id)) continue;
        if (!n.liveData || n.liveData.length === 0) continue;
        const c = buildCardFor(n.id);
        if (c) {
          cards.push(c);
          seen.add(n.id);
        }
      }
    }

    // 3. Top-Ω fillers
    for (const c of riskCards) {
      if (seen.has(c.nodeId)) continue;
      cards.push(c);
      seen.add(c.nodeId);
    }

    const maxSlots = Math.max(5, allSelectedIds.size);
    return cards.slice(0, maxSlots);
  }, [riskCards, riskMap, allSelectedIds, activeGraph, shocks]);

  // Get temporal history for each display node
  const nodeHistories = useMemo(() => {
    if (!temporalData) return new Map<string, NodeTemporalState[]>();
    const map = new Map<string, NodeTemporalState[]>();
    for (const card of displayNodes) {
      const data = temporalData.nodes.get(card.nodeId);
      if (data) map.set(card.nodeId, data.history);
    }
    return map;
  }, [temporalData, displayNodes]);

  // Per-card lookup of the underlying CausalNode (for liveData[]).
  const nodeById = useMemo(
    () => new Map(activeGraph.nodes.map((n) => [n.id, n])),
    [activeGraph],
  );

  // Global feed summary for the header — counts distinct feed `kind`s by mode.
  const feedSummary = useMemo(() => {
    const counts = summarizeLiveFeeds(activeGraph.nodes);
    const total = counts.live + counts.mock + counts["mock-fallback"];
    return total > 0 ? counts : null;
  }, [activeGraph]);

  // Find which history index corresponds to current timeline position
  const currentHistoryIdx = useMemo(() => {
    if (isLive || !temporalData) return null;
    // Find nearest index for the current timeline position
    for (const [, history] of nodeHistories) {
      if (history.length === 0) continue;
      for (let i = 0; i < history.length; i++) {
        if (history[i].timestamp >= timelinePosition) return Math.max(0, i);
      }
      return history.length - 1;
    }
    return null;
  }, [isLive, temporalData, timelinePosition, nodeHistories]);

  // Tooltip data for hover
  const handleChartHover = useCallback(
    (nodeId: string, e: React.MouseEvent<HTMLDivElement>) => {
      const history = nodeHistories.get(nodeId);
      if (!history || history.length < 2) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const idx = Math.round((x / rect.width) * (history.length - 1));
      setHoveredDay(Math.max(0, Math.min(history.length - 1, idx)));
    },
    [nodeHistories],
  );

  return (
    <div className="border-t border-border bg-surface-elevated" data-tour="risk-flow">
      {/* Toggle bar — aligned with TimeDial layout */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="flex items-center gap-3 w-full px-4 py-1 hover:bg-surface transition-colors"
      >
        <div className="min-w-[72px] flex-shrink-0 flex items-center justify-center">
          <span className="text-[9px] font-mono text-text-muted">
            {collapsed ? "\u25B6" : "\u25BC"}
          </span>
        </div>
        <span className="text-[8px] font-[family-name:var(--font-michroma)] tracking-wider text-text-muted">
          {allSelectedIds.size > 1
            ? `ΩF TIME SERIES — ${allSelectedIds.size} SELECTED NODES`
            : allSelectedIds.size === 1
              ? "ΩF TIME SERIES — SELECTED NODE"
              : "ΩF TIME SERIES — TOP RISK NODES"}
        </span>
        {feedSummary && (
          <span className="ml-auto flex items-center gap-2 text-[8px] font-mono text-text-muted">
            <span className="tracking-[0.15em]">FEEDS</span>
            {(["live", "mock-fallback", "mock"] as const).map((mode) =>
              feedSummary[mode] > 0 ? (
                <span key={mode} className="flex items-center gap-1">
                  <span className={`inline-block h-1.5 w-1.5 rounded-full ${feedDotClass(mode)}`} />
                  <span className="tabular-nums">{feedSummary[mode]}</span>
                  <span className="text-text-muted/60">{mode === "mock-fallback" ? "fallback" : mode}</span>
                </span>
              ) : null,
            )}
          </span>
        )}
      </button>

      {/* Collapsible content */}
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="flex items-stretch gap-3 px-4 pb-2">
              {/* Left label — matches TimeDial label column for alignment */}
              <div className="min-w-[72px] flex-shrink-0 flex flex-col items-center justify-center gap-0.5">
                <span className="text-[8px] font-[family-name:var(--font-michroma)] tracking-[0.15em] text-text-muted uppercase">
                  ΩF Series
                </span>
                <span className="text-[9px] font-mono text-foreground">
                  {displayNodes.length}
                </span>
              </div>
              {/* Cards — aligns with TimeDial track */}
              <div ref={containerRef} className="flex-1 flex items-stretch gap-2 overflow-x-auto min-w-0">
              {displayNodes.map((card, i) => {
                const omegaHistory = nodeHistories.get(card.nodeId) ?? [];
                // Prefer live-data when ANY liveData entry is attached (even
                // if history hasn't accumulated yet — first tick has only the
                // current value, history.length === 0). On second tick the
                // sparkline gets 2 points and renders a curve.
                const node = nodeById.get(card.nodeId);
                const liveSignal = node?.liveData?.[0];
                const usingLiveHistory = !!liveSignal;
                const allHistory = usingLiveHistory
                  ? [
                      ...(liveSignal!.history ?? []).map((h) => ({
                        timestamp: new Date(h.observedAt).getTime(),
                        omegaComposite: h.value,
                        omegaProfile: {} as unknown as import("@/lib/temporal-data").NodeTemporalState["omegaProfile"],
                      })),
                      {
                        timestamp: new Date(liveSignal!.observedAt).getTime(),
                        omegaComposite: liveSignal!.value,
                        omegaProfile: {} as unknown as import("@/lib/temporal-data").NodeTemporalState["omegaProfile"],
                      },
                    ]
                  : omegaHistory;
                // Filter to the visible time-dial window so the 1H/1D/1W/1M
                // scale buttons actually change the curve. If the filter
                // would yield zero points (e.g. monthly data with a 1H window),
                // fall back to the unfiltered series so the card never goes
                // empty due to scale mismatch alone.
                const filtered = allHistory.filter(
                  (h) => h.timestamp >= timelineRange.start && h.timestamp <= timelineRange.end,
                );
                const history = filtered.length > 0 ? filtered : allHistory;
                const domainColor = getDomainColor(card.domain);
                const isActive = allSelectedIds.has(card.nodeId);
                const currentOmega = card.omegaScore;
                const hoveredOmega =
                  hoveredDay !== null && history[hoveredDay]
                    ? history[hoveredDay].omegaComposite
                    : null;

                return (
                  <motion.div
                    key={card.nodeId}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05, duration: 0.2 }}
                    className="flex-shrink-0 rounded border px-3 py-2 cursor-pointer transition-colors"
                    style={{
                      width: isActive ? "280px" : "200px",
                      borderColor: isActive
                        ? "var(--accent-cyan)"
                        : `color-mix(in srgb, ${domainColor} 30%, var(--border))`,
                      backgroundColor: isActive
                        ? "rgba(0,229,255,0.06)"
                        : "var(--surface)",
                    }}
                    onClick={() => setSelectedNode(isActive ? null : card.nodeId)}
                  >
                    {/* Header: name + pin + current omega */}
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="text-[10px] font-mono text-foreground truncate flex-1">
                        {card.label}
                      </div>
                      {/* DATA NEEDED badge — surfaces nodes the data session
                          has explicitly marked Category-C (no defensible
                          free source). Distinguishes intentionally-blank
                          slots from "no provider matched yet" cases. */}
                      {node?.dataStatus === "blank-needs-data" && (
                        <span
                          className="text-[6px] font-[family-name:var(--font-michroma)] tracking-wider px-1 py-px rounded flex-shrink-0 bg-accent-amber/15 text-accent-amber border border-accent-amber/40"
                          title="Node intentionally blank — real data source still needed (Category C in the live-coverage program)"
                        >
                          DATA NEEDED
                        </span>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          togglePinned(card.nodeId);
                        }}
                        className="flex-shrink-0 w-4 h-4 flex items-center justify-center rounded hover:bg-accent-cyan/10 transition-colors"
                        title={pinnedNodes.includes(card.nodeId) ? "Unpin from comparison" : "Pin to comparison chart"}
                      >
                        <span
                          className="text-[9px]"
                          style={{
                            color: pinnedNodes.includes(card.nodeId)
                              ? "var(--accent-cyan)"
                              : "var(--text-muted)",
                          }}
                        >
                          {pinnedNodes.includes(card.nodeId) ? "\u25C9" : "\u25CB"}
                        </span>
                      </button>
                      <div
                        className="text-[11px] font-mono font-bold flex-shrink-0"
                        style={{ color: getBarColor(hoveredOmega ?? currentOmega) }}
                      >
                        Ω {(hoveredOmega ?? currentOmega).toFixed(1)}
                      </div>
                    </div>

                    {/* Domain badge + real metric label */}
                    <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                      <div
                        className="text-[7px] px-1 py-0.5 rounded"
                        style={{
                          color: domainColor,
                          backgroundColor: `${domainColor}10`,
                          border: `1px solid ${domainColor}30`,
                        }}
                      >
                        {card.domain}
                      </div>
                      {(() => {
                        const desc = getNodeDataDescription(card.nodeId);
                        if (desc) {
                          return (
                            <div className="text-[6px] font-mono text-accent-cyan/60 truncate max-w-[120px]" title={`${desc.label} (${desc.unit})`}>
                              {desc.label}
                            </div>
                          );
                        }
                        return null;
                      })()}
                      {hoveredDay !== null && history[hoveredDay] && (
                        <div className="text-[7px] font-mono text-text-muted">
                          {new Date(history[hoveredDay].timestamp).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </div>
                      )}
                    </div>

                    {/* Live-data rows — one per `liveData[]` entry. Card without
                        any live signal renders nothing here. */}
                    {(() => {
                      const node = nodeById.get(card.nodeId);
                      const live = node?.liveData;
                      if (!live || live.length === 0) return null;
                      return (
                        <div className="flex flex-col gap-0.5 mb-1">
                          {live.map((point) => {
                            const formatted = formatLiveSignal(point);
                            const mode = feedModeFromSource(point.source, point.observedAt);
                            return (
                              <div
                                key={point.kind}
                                className="flex items-center gap-1.5 text-[7px] font-mono text-text-muted"
                                title={point.source}
                              >
                                <span className="relative flex h-1.5 w-1.5 shrink-0">
                                  {mode === "live" && (
                                    <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${feedDotClass(mode)} opacity-60`} />
                                  )}
                                  <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${feedDotClass(mode)}`} />
                                </span>
                                <span className="text-foreground/70 shrink-0">{formatted.shortLabel}</span>
                                <span className="text-foreground tabular-nums truncate">{formatted.primaryValue}</span>
                                {formatted.qualifier && (
                                  <span className="text-text-muted/80 shrink-0 tabular-nums">· {formatted.qualifier}</span>
                                )}
                                <span className="ml-auto text-text-muted/70 shrink-0 tabular-nums">
                                  {timeAgoLabel(point.observedAt)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}

                    {/* Time series chart */}
                    <div
                      className="relative"
                      onMouseMove={(e) => handleChartHover(card.nodeId, e)}
                      onMouseLeave={() => setHoveredDay(null)}
                    >
                      {history.length >= 1 ? (
                        <OmegaSparkline
                          history={history}
                          width={isActive ? 254 : 174}
                          height={isActive ? 48 : 36}
                          color={
                            usingLiveHistory
                              ? feedSparklineColor(
                                  feedModeFromSource(liveSignal!.source, liveSignal!.observedAt),
                                )
                              : getBarColor(currentOmega)
                          }
                          highlightIdx={hoveredDay ?? currentHistoryIdx}
                          xStart={timelineRange.start}
                          xEnd={timelineRange.end}
                        />
                      ) : (
                        <div className="h-9 flex items-center justify-center gap-1.5">
                          <span className="text-[7px] font-mono text-text-muted/40 tracking-wider">
                            {usingLiveHistory ? "LIVE — building" : "NO DATA"}
                          </span>
                          <span className="text-[6px] font-mono text-text-muted/25">
                            {usingLiveHistory ? `· ${liveSignal!.source.split(/[\s—(]/)[0]} polling` : "— static Ω only"}
                          </span>
                        </div>
                      )}
                      {usingLiveHistory && history.length >= 1 && (
                        <span
                          className="absolute top-0 right-0 text-[6px] font-mono tracking-wider px-1 rounded-sm"
                          style={{
                            color: feedSparklineColor(feedModeFromSource(liveSignal!.source, liveSignal!.observedAt)),
                            backgroundColor: "rgba(0,0,0,0.4)",
                          }}
                          title={liveSignal!.source}
                        >
                          LIVE
                        </span>
                      )}
                    </div>

                    {/* Date range labels — show timeline window edges so every
                        tile reads with the same axis labels regardless of how
                        many points it actually has in range. */}
                    {history.length >= 1 && (
                      <div className="flex justify-between mt-0.5 text-[7px] font-mono text-text-muted/50">
                        <span>
                          {new Date(timelineRange.start).toLocaleDateString("en-US", { month: "short", year: "2-digit" })}
                        </span>
                        <span>
                          {new Date(timelineRange.end).toLocaleDateString("en-US", { month: "short", year: "2-digit" })}
                        </span>
                      </div>
                    )}
                  </motion.div>
                );
              })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
