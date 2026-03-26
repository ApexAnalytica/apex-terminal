"use client";

import { useMemo, useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useApexStore } from "@/stores/useApexStore";
import { useFilteredGraph } from "@/hooks/useFilteredGraph";
import { getDomainColor, buildRiskCards } from "@/lib/graph-data";
import { useTemporalGraph } from "@/hooks/useTemporalGraph";
import type { NodeTemporalState } from "@/lib/temporal-data";

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
  const setSelectedNode = useApexStore((s) => s.setSelectedNode);
  const isLive = useApexStore((s) => s.isLive);
  const temporalData = useApexStore((s) => s.temporalData);
  const initTemporalData = useApexStore((s) => s.initTemporalData);
  const timelinePosition = useApexStore((s) => s.timelinePosition);
  const { graph: temporalGraph } = useTemporalGraph();
  const [collapsed, setCollapsed] = useState(false);

  // Ensure temporal data is initialized (may not be if TimeDial hasn't mounted yet)
  useEffect(() => {
    initTemporalData();
  }, [initTemporalData]);
  const [hoveredDay, setHoveredDay] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Use temporal graph when scrubbing, otherwise use live graph
  const activeGraph = isLive ? graphData : temporalGraph;

  // Get the nodes to display time series for
  // If a node is selected, show that node prominently
  // Otherwise show top risk nodes
  const displayNodes = useMemo(() => {
    const riskCards = buildRiskCards(activeGraph, shocks);
    if (selectedNode) {
      // Put selected node first, then top risk nodes (excluding selected)
      const selected = riskCards.find((c) => c.nodeId === selectedNode);
      const others = riskCards.filter((c) => c.nodeId !== selectedNode).slice(0, 4);
      return selected ? [selected, ...others] : riskCards.slice(0, 5);
    }
    return riskCards.slice(0, 5);
  }, [activeGraph, shocks, selectedNode]);

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
      {/* Toggle bar */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="flex items-center justify-between w-full px-4 py-1 hover:bg-surface transition-colors"
      >
        <span className="text-[8px] font-[family-name:var(--font-michroma)] tracking-wider text-text-muted">
          {selectedNode ? "ΩF TIME SERIES — SELECTED NODE" : "ΩF TIME SERIES — TOP RISK NODES"}
        </span>
        <span className="text-[9px] font-mono text-text-muted">
          {collapsed ? "\u25B6" : "\u25BC"}
        </span>
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
            <div ref={containerRef} className="flex items-stretch gap-2 px-4 pb-2 overflow-x-auto">
              {displayNodes.map((card, i) => {
                const history = nodeHistories.get(card.nodeId) ?? [];
                const domainColor = getDomainColor(card.domain);
                const isActive = selectedNode === card.nodeId;
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
                    {/* Header: name + current omega */}
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="text-[10px] font-mono text-foreground truncate flex-1">
                        {card.label}
                      </div>
                      <div
                        className="text-[11px] font-mono font-bold flex-shrink-0"
                        style={{ color: getBarColor(hoveredOmega ?? currentOmega) }}
                      >
                        Ω {(hoveredOmega ?? currentOmega).toFixed(1)}
                      </div>
                    </div>

                    {/* Domain badge */}
                    <div className="flex items-center gap-1.5 mb-1.5">
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
                      {hoveredDay !== null && history[hoveredDay] && (
                        <div className="text-[7px] font-mono text-text-muted">
                          {new Date(history[hoveredDay].timestamp).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })}
                        </div>
                      )}
                    </div>

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
                        <div className="h-9 flex items-center justify-center text-[7px] font-mono text-text-muted/40">
                          NO TEMPORAL DATA
                        </div>
                      )}
                    </div>

                    {/* Min/Max range */}
                    {history.length > 1 && (
                      <div className="flex justify-between mt-0.5 text-[7px] font-mono text-text-muted/50">
                        <span>60d ago</span>
                        <span>now</span>
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
