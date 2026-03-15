"use client";

import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useApexStore } from "@/stores/useApexStore";
import { getCategoryColor, getDomainColor, getCategoryLabel } from "@/lib/graph-data";
import { useTemporalGraph } from "@/hooks/useTemporalGraph";

function getBarColor(value: number): string {
  if (value > 9) return "#ff1744";
  if (value >= 7) return "#ffab00";
  if (value >= 5) return "#ff6d00";
  return "#00e676";
}

export default function NodeInspector() {
  const selectedNode = useApexStore((s) => s.selectedNode);
  const setSelectedNode = useApexStore((s) => s.setSelectedNode);
  const graphData = useApexStore((s) => s.graphData);
  const isLive = useApexStore((s) => s.isLive);
  const { graph: temporalGraph } = useTemporalGraph();
  const activeGraph = isLive ? graphData : temporalGraph;

  const node = useMemo(() => {
    if (!selectedNode) return null;
    return activeGraph.nodes.find((n) => n.id === selectedNode) ?? null;
  }, [selectedNode, activeGraph.nodes]);

  const connectedEdges = useMemo(() => {
    if (!selectedNode) return [];
    return graphData.edges.filter(
      (e) => e.source === selectedNode || e.target === selectedNode
    );
  }, [selectedNode, graphData.edges]);

  const axes = node
    ? [
        { label: "SUBSTITUTION FRICTION", value: node.omegaFragility.substitutionFriction },
        { label: "DOWNSTREAM LOAD", value: node.omegaFragility.downstreamLoad },
        { label: "CASCADING VOLTAGE", value: node.omegaFragility.cascadingVoltage },
        { label: "TAIL WEIGHT", value: node.omegaFragility.existentialTailWeight },
      ]
    : [];

  return (
    <AnimatePresence>
      {node && (
        <motion.div
          key="node-inspector"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="overflow-hidden border-b border-border"
        >
          <div className="p-4 space-y-3">
            {/* Header */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-bold text-foreground truncate">
                  {node.label}
                </div>
                <div className="flex items-center gap-1.5 mt-1">
                  <span
                    className="text-[7px] px-1.5 py-0.5 rounded font-mono"
                    style={{
                      color: getDomainColor(node.domain),
                      backgroundColor: `${getDomainColor(node.domain)}15`,
                      border: `1px solid ${getDomainColor(node.domain)}30`,
                    }}
                  >
                    {node.domain.toUpperCase()}
                  </span>
                  <span
                    className="text-[7px] px-1.5 py-0.5 rounded font-mono"
                    style={{
                      color: getCategoryColor(node.category),
                      backgroundColor: `${getCategoryColor(node.category)}15`,
                    }}
                  >
                    {getCategoryLabel(node.category)}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelectedNode(null)}
                className="text-[9px] text-text-muted hover:text-foreground transition-colors flex-shrink-0"
              >
                &times;
              </button>
            </div>

            {/* Omega Composite */}
            <div className="flex items-baseline gap-2">
              <span
                className="text-[28px] font-bold font-mono"
                style={{ color: getBarColor(node.omegaFragility.composite) }}
              >
                {"\u03A9"} {node.omegaFragility.composite.toFixed(1)}
              </span>
              <span className="text-[10px] text-text-muted font-mono">/ 10.0</span>
            </div>

            {/* 4-axis bars (larger) */}
            <div className="space-y-2">
              {axes.map((axis) => (
                <div key={axis.label}>
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[8px] text-text-muted font-mono">{axis.label}</span>
                    <span
                      className="text-[9px] font-mono font-bold"
                      style={{ color: getBarColor(axis.value) }}
                    >
                      {axis.value.toFixed(1)}
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-border overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${(axis.value / 10) * 100}%`,
                        backgroundColor: getBarColor(axis.value),
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Metadata */}
            <div className="text-[9px] font-mono space-y-1 pt-1 border-t border-border">
              <div>
                <span className="text-text-muted">CONCENTRATION: </span>
                <span className="text-foreground">{node.globalConcentration}</span>
              </div>
              <div>
                <span className="text-text-muted">REPLACEMENT: </span>
                <span className="text-foreground">{node.replacementTime}</span>
              </div>
              {node.physicalConstraint && (
                <div>
                  <span className="text-text-muted">CONSTRAINT: </span>
                  <span className="text-accent-amber">{node.physicalConstraint}</span>
                </div>
              )}
            </div>

            {/* Badges */}
            <div className="flex flex-wrap gap-1">
              <span className="text-[7px] px-1.5 py-0.5 rounded border border-border text-text-muted font-mono">
                SRC: {node.discoverySource}
              </span>
              {node.isConfounded && (
                <span className="text-[7px] px-1.5 py-0.5 rounded border border-accent-red/30 text-accent-red font-mono bg-accent-red/5">
                  CONFOUNDED
                </span>
              )}
              {node.isRestricted && (
                <span className="text-[7px] px-1.5 py-0.5 rounded border border-accent-amber/30 text-accent-amber font-mono bg-accent-amber/5">
                  RESTRICTED
                </span>
              )}
            </div>

            {/* Connected Edges */}
            {connectedEdges.length > 0 && (
              <div className="pt-1 border-t border-border">
                <div className="text-[8px] font-[family-name:var(--font-michroma)] tracking-wider text-text-muted mb-1.5">
                  CONNECTED EDGES ({connectedEdges.length})
                </div>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {connectedEdges.map((edge) => {
                    const isSource = edge.source === node.id;
                    const otherNode = graphData.nodes.find(
                      (n) => n.id === (isSource ? edge.target : edge.source)
                    );
                    return (
                      <div
                        key={edge.id}
                        className="text-[8px] font-mono p-1.5 rounded border border-border bg-surface-elevated flex items-center gap-1"
                      >
                        <span className="text-text-muted">
                          {isSource ? "\u2192" : "\u2190"}
                        </span>
                        <span className="text-foreground truncate flex-1">
                          {otherNode?.shortLabel ?? "?"}
                        </span>
                        <span className="text-text-muted text-[7px] flex-shrink-0">
                          {edge.physicalMechanism}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
