"use client";

import { useMemo, useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useApexStore } from "@/stores/useApexStore";
import { useFilteredGraph } from "@/hooks/useFilteredGraph";
import { getDomainColor, buildRiskCards } from "@/lib/graph-data";
import { useTemporalGraph } from "@/hooks/useTemporalGraph";
import type { NodeTemporalState } from "@/lib/temporal-data";
import { getNodeDataDescription } from "@/lib/real-timeseries";
import {
  feedDotClass,
  feedModeFromSource,
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

/** Tiny sparkline SVG for a node's omega history */
function OmegaSparkline({
  history,
  width,
  height,
  color,
  highlightIdx,
}: {
  history: NodeTemporalState[];
  width: number;
  height: number;
  color: string;
  highlightIdx: number | null;
}) {
  if (history.length < 2) return null;

  const omegas = history.map((h) => h.omegaComposite);
  const min = Math.min(...omegas);
  const max = Math.max(...omegas);
  const range = max - min || 1;
  const pad = 2;

  const points = omegas
    .map((v, i) => {
      const x = (i / (omegas.length - 1)) * (width - pad * 2) + pad;
      const y = height - pad - ((v - min) / range) * (height - pad * 2);
      return `${x},${y}`;
    })
    .join(" ");

  // Fill area under the line
  const firstX = pad;
  const lastX = (width - pad * 2) * ((omegas.length - 1) / (omegas.length - 1)) + pad;
  const fillPoints = `${firstX},${height - pad} ${points} ${lastX},${height - pad}`;

  return (
    <svg width={width} height={height} className="flex-shrink-0">
      {/* Grid lines */}
      {[0.25, 0.5, 0.75].map((frac) => (
        <line
          key={frac}
          x1={pad}
          y1={pad + (1 - frac) * (height - pad * 2)}
          x2={width - pad}
          y2={pad + (1 - frac) * (height - pad * 2)}
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
      {(() => {
        const idx = highlightIdx ?? omegas.length - 1;
        const x = (idx / (omegas.length - 1)) * (width - pad * 2) + pad;
        const y = height - pad - ((omegas[idx] - min) / range) * (height - pad * 2);
        return (
          <>
            <circle cx={x} cy={y} r={3} fill={color} opacity={0.4} />
            <circle cx={x} cy={y} r={1.5} fill={color} />
          </>
        );
      })()}
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

  // Get the nodes to display time series for.
  // Selected nodes (single + multi) shown first, then fill remaining slots with top risk nodes.
  // Depends on riskCards/riskMap identity (stable across scrub) + allSelectedIds.
  const displayNodes = useMemo(() => {
    if (allSelectedIds.size > 0) {
      // Build cards for all selected nodes, even if they're not top-risk
      const selectedCards: typeof riskCards = [];
      for (const id of allSelectedIds) {
        const existing = riskMap.get(id);
        if (existing) {
          selectedCards.push(existing);
        } else {
          // Node not in top risk — build a card from graph data
          const node = activeGraph.nodes.find((n) => n.id === id);
          if (node) {
            const totalSeverity = shocks.reduce((sum, s) => sum + s.severity, 0);
            const shockMult = Math.min(1, totalSeverity);
            selectedCards.push({
              nodeId: node.id,
              label: node.label,
              category: node.category,
              omegaScore: parseFloat((node.omegaFragility.composite * (1 + shockMult * 0.05)).toFixed(1)),
              domain: node.domain,
              globalConcentration: node.globalConcentration,
            });
          }
        }
      }
      // Fill remaining slots with top risk nodes not already selected
      const remaining = riskCards.filter((c) => !allSelectedIds.has(c.nodeId));
      const maxSlots = Math.max(5, allSelectedIds.size);
      return [...selectedCards, ...remaining].slice(0, maxSlots);
    }
    return riskCards.slice(0, 5);
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
                const history = nodeHistories.get(card.nodeId) ?? [];
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
                      {history.length > 1 ? (
                        <OmegaSparkline
                          history={history}
                          width={isActive ? 254 : 174}
                          height={isActive ? 48 : 36}
                          color={getBarColor(currentOmega)}
                          highlightIdx={hoveredDay ?? currentHistoryIdx}
                        />
                      ) : (
                        <div className="h-9 flex items-center justify-center gap-1.5">
                          <span className="text-[7px] font-mono text-text-muted/40 tracking-wider">NO DATA</span>
                          <span className="text-[6px] font-mono text-text-muted/25">— static Ω only</span>
                        </div>
                      )}
                    </div>

                    {/* Date range labels */}
                    {history.length > 1 && (
                      <div className="flex justify-between mt-0.5 text-[7px] font-mono text-text-muted/50">
                        <span>
                          {new Date(history[0].timestamp).toLocaleDateString("en-US", { month: "short", year: "2-digit" })}
                        </span>
                        <span>
                          {new Date(history[history.length - 1].timestamp).toLocaleDateString("en-US", { month: "short", year: "2-digit" })}
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
