"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useApexStore } from "@/stores/useApexStore";
import { getCategoryColor, getDomainColor, getCategoryLabel } from "@/lib/graph-data";
import { useTemporalGraph } from "@/hooks/useTemporalGraph";
import type { NodeTemporalState } from "@/lib/temporal-data";
import { getNodeDataDescription } from "@/lib/real-timeseries";
import { resolveDomainProfile, type PillarKey } from "@/lib/domain-profiles";

function getBarColor(value: number): string {
  if (value > 9) return "#ff1744";
  if (value >= 7) return "#ffab00";
  if (value >= 5) return "#ff6d00";
  return "#00e676";
}

const PILLAR_SHORT: Record<PillarKey, string> = {
  irreplaceability: "I",
  restorationLatency: "R",
  jurisdictionalHazard: "J",
  cascadeLoad: "C",
  tailDepth: "T",
};

const RADAR_SIZE = 220;
const RADAR_CX = RADAR_SIZE / 2;
const RADAR_CY = RADAR_SIZE / 2;
const RADAR_R = RADAR_SIZE * 0.34;
const RADAR_LABEL_R = RADAR_R * 1.42;

function PillarRadar({
  axes,
  composite,
  selectedKey,
  onSelect,
}: {
  axes: { key: PillarKey; value: number }[];
  composite: number;
  selectedKey: PillarKey | null;
  onSelect: (key: PillarKey) => void;
}) {
  if (axes.length === 0) return null;
  const angles = axes.map((_, i) => ((i * 360) / axes.length) * (Math.PI / 180));
  const vertex = (angle: number, dist: number) => ({
    x: RADAR_CX + dist * Math.sin(angle),
    y: RADAR_CY - dist * Math.cos(angle),
  });
  const valuePts = axes.map((a, i) => vertex(angles[i], RADAR_R * Math.max(0, Math.min(1, a.value / 10))));
  const valuePath = valuePts.map((p) => `${p.x},${p.y}`).join(" ");
  const rings = [0.2, 0.4, 0.6, 0.8, 1.0].map((scale) =>
    angles.map((a) => vertex(a, RADAR_R * scale)).map((p) => `${p.x},${p.y}`).join(" "),
  );
  const accent = "#00e5ff";
  const compositeColor = getBarColor(composite);
  return (
    <svg
      width={RADAR_SIZE}
      height={RADAR_SIZE}
      viewBox={`0 0 ${RADAR_SIZE} ${RADAR_SIZE}`}
      className="mx-auto block"
    >
      {rings.map((points, i) => (
        <polygon
          key={i}
          points={points}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={1}
        />
      ))}
      {angles.map((a, i) => {
        const end = vertex(a, RADAR_R);
        return (
          <line
            key={i}
            x1={RADAR_CX}
            y1={RADAR_CY}
            x2={end.x}
            y2={end.y}
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={1}
          />
        );
      })}
      <polygon
        points={valuePath}
        fill="rgba(0,229,255,0.15)"
        stroke={accent}
        strokeWidth={1.5}
        style={{ filter: "drop-shadow(0 0 6px rgba(0,229,255,0.35))" }}
      />
      {axes.map((a, i) => (
        <circle
          key={a.key}
          cx={valuePts[i].x}
          cy={valuePts[i].y}
          r={3}
          fill={getBarColor(a.value)}
        />
      ))}
      <text
        x={RADAR_CX}
        y={RADAR_CY - 4}
        textAnchor="middle"
        style={{ fontSize: 8, fill: "var(--text-muted)" }}
        className="font-mono tracking-widest"
      >
        ΩF
      </text>
      <text
        x={RADAR_CX}
        y={RADAR_CY + 12}
        textAnchor="middle"
        style={{ fontSize: 18, fill: compositeColor, fontWeight: 700 }}
        className="font-mono"
      >
        {composite.toFixed(2)}
      </text>
      {axes.map((a, i) => {
        const lp = vertex(angles[i], RADAR_LABEL_R);
        const isSelected = selectedKey === a.key;
        return (
          <g
            key={a.key}
            onClick={() => onSelect(a.key)}
            style={{ cursor: "pointer" }}
          >
            {/* Transparent hit target — generous tap area around the letter+value pair */}
            <rect
              x={lp.x - 14}
              y={lp.y - 12}
              width={28}
              height={26}
              fill="transparent"
            />
            {isSelected && (
              <circle
                cx={lp.x}
                cy={lp.y + 1}
                r={13}
                fill={`${accent}14`}
                stroke={accent}
                strokeWidth={1}
                style={{ filter: "drop-shadow(0 0 6px rgba(0,229,255,0.5))" }}
              />
            )}
            <text
              x={lp.x}
              y={lp.y - 1}
              textAnchor="middle"
              style={{
                fontSize: isSelected ? 13 : 11,
                fill: accent,
                fontWeight: 700,
              }}
              className="font-mono"
            >
              {PILLAR_SHORT[a.key]}
            </text>
            <text
              x={lp.x}
              y={lp.y + 10}
              textAnchor="middle"
              style={{ fontSize: 8, fill: getBarColor(a.value) }}
              className="font-mono"
            >
              {a.value.toFixed(1)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// Descriptions + methodology now live on the DomainProfile so T1D / geopolitical
// / future verticals each carry their own vocabulary without branching here.

export default function NodeInspector() {
  // expandedPillar lifted to the zustand store so the onboarding tour
  // can gate its "click a pillar vertex" step on real interaction.
  // The store resets it to null whenever selectedNode changes, so we
  // don't carry an explanation card from a previous node forward.
  const expandedPillar = useApexStore((s) => s.expandedPillar);
  const setExpandedPillar = useApexStore((s) => s.setExpandedPillar);
  const [showMethodology, setShowMethodology] = useState(false);
  const [showDataExplainer, setShowDataExplainer] = useState(false);
  const selectedNode = useApexStore((s) => s.selectedNode);
  const setSelectedNode = useApexStore((s) => s.setSelectedNode);
  const graphData = useApexStore((s) => s.graphData);
  const temporalData = useApexStore((s) => s.temporalData);
  const isLive = useApexStore((s) => s.isLive);
  const selectedDomains = useApexStore((s) => s.selectedDomains);
  const profile = resolveDomainProfile(selectedDomains);
  const pillarDetails = profile.pillarDetails;
  const methodology = profile.compositeMethodology;
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

  // Get temporal history for this node (for data context)
  const nodeHistory = useMemo<NodeTemporalState[]>(() => {
    if (!selectedNode || !temporalData) return [];
    const data = temporalData.nodes.get(selectedNode);
    return data?.history ?? [];
  }, [selectedNode, temporalData]);

  const axes: { key: PillarKey; label: string; value: number }[] = node
    ? [
        { key: "irreplaceability", label: pillarDetails.irreplaceability.label, value: node.omegaFragility.irreplaceability },
        { key: "restorationLatency", label: pillarDetails.restorationLatency.label, value: node.omegaFragility.restorationLatency },
        { key: "jurisdictionalHazard", label: pillarDetails.jurisdictionalHazard.label, value: node.omegaFragility.jurisdictionalHazard },
        { key: "cascadeLoad", label: pillarDetails.cascadeLoad.label, value: node.omegaFragility.cascadeLoad },
        { key: "tailDepth", label: pillarDetails.tailDepth.label, value: node.omegaFragility.tailDepth },
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

            {/* Data Explainer — collapsible panel explaining what data this node represents */}
            <div className="rounded border border-border/50 overflow-hidden">
              <button
                onClick={() => setShowDataExplainer(!showDataExplainer)}
                className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 hover:bg-white/[0.03] transition-colors"
              >
                <span className="text-[7px] font-[family-name:var(--font-michroma)] tracking-wider text-text-muted">
                  ABOUT THIS NODE
                </span>
                <span className="text-[8px] text-text-muted/60">{showDataExplainer ? "▲" : "▼"}</span>
              </button>
              {showDataExplainer && (
                <div className="px-2.5 pb-2 space-y-2.5 text-[9px] font-mono border-t border-border/30">
                  {/* What is this node */}
                  <div className="pt-2">
                    <div className="text-[7px] text-text-muted/60 mb-0.5 tracking-wider">WHAT IS THIS</div>
                    <div className="text-foreground/90 leading-relaxed">
                      <span className="font-semibold">{node.label}</span> is a {getCategoryLabel(node.category).toLowerCase()} node
                      in the <span style={{ color: getDomainColor(node.domain) }}>{node.domain}</span> domain.
                      {node.physicalConstraint && ` ${node.physicalConstraint}`}
                    </div>
                  </div>

                  {/* What data is being tracked */}
                  <div>
                    <div className="text-[7px] text-text-muted/60 mb-0.5 tracking-wider">DATA BEING TRACKED</div>
                    {(() => {
                      const dataDesc = selectedNode ? getNodeDataDescription(selectedNode) : null;
                      if (dataDesc) {
                        const sourceLabels: Record<string, string> = {
                          saudi_aramco: "EIA (U.S. Energy Information Administration)",
                          qatarenergy: "Vortexa / EIA Qatar Analysis",
                          qafco_operations: "QAFCO ESG & Annual Reports",
                          maaden_operations: "Ma'aden Annual Reports",
                          pimco_sovereign: "PIMCO EM Sovereign Data",
                          blackrock_sovereign: "BlackRock EM Sovereign Data",
                          bunge_food_security: "Bunge MENA Food Security Index",
                          almarai_food_security: "Almarai MENA Food Security Index",
                          undersea_cables: "Submarine Cable Risk Assessment",
                          orange_marine: "Orange Marine Latency Monitoring",
                          telecom_egypt: "Telecom Egypt Market Data",
                          pwt_sovereign: "Penn World Table (PWT 10.01)",
                        };
                        return (
                          <>
                            <div className="text-foreground/90 leading-relaxed">
                              {dataDesc.description}
                            </div>
                            <div className="flex items-center gap-1.5 mt-1.5">
                              <span className="text-[7px] px-1 py-0.5 rounded bg-accent-cyan/10 border border-accent-cyan/20 text-accent-cyan">
                                {dataDesc.label}
                              </span>
                              <span className="text-[7px] text-text-muted/60">
                                ({dataDesc.unit})
                              </span>
                            </div>
                            <div className="text-[7px] text-text-muted/50 mt-1">
                              Source: {sourceLabels[dataDesc.source] || dataDesc.source}
                            </div>
                          </>
                        );
                      }
                      return (
                        <div className="text-foreground/90 leading-relaxed">
                          The time series tracks this node&apos;s <span className="text-accent-cyan">ΩF (Omega Fragility) composite score</span> over
                          {nodeHistory.length > 0 ? ` ${nodeHistory.length} data points` : " time"}.
                          The ΩF score aggregates 5 risk pillars into a single 0–10 systemic fragility index.
                        </div>
                      );
                    })()}
                    {nodeHistory.length > 0 && (() => {
                      const omegas = nodeHistory.map(h => h.omegaComposite);
                      const min = Math.min(...omegas);
                      const max = Math.max(...omegas);
                      const avg = omegas.reduce((a, b) => a + b, 0) / omegas.length;
                      const current = omegas[omegas.length - 1];
                      return (
                        <div className="flex gap-3 mt-1.5 text-[8px]">
                          <div>
                            <span className="text-text-muted">MIN </span>
                            <span className="text-foreground font-semibold">{min.toFixed(1)}</span>
                          </div>
                          <div>
                            <span className="text-text-muted">AVG </span>
                            <span className="text-foreground font-semibold">{avg.toFixed(1)}</span>
                          </div>
                          <div>
                            <span className="text-text-muted">MAX </span>
                            <span className="text-foreground font-semibold">{max.toFixed(1)}</span>
                          </div>
                          <div>
                            <span className="text-text-muted">NOW </span>
                            <span style={{ color: getBarColor(current) }} className="font-semibold">{current.toFixed(1)}</span>
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Geographic and supply chain context */}
                  {node.globalConcentration && (
                    <div>
                      <div className="text-[7px] text-text-muted/60 mb-0.5 tracking-wider">GEOGRAPHIC CONCENTRATION</div>
                      <div className="text-foreground/90">{node.globalConcentration}</div>
                    </div>
                  )}
                  {node.replacementTime && (
                    <div>
                      <div className="text-[7px] text-text-muted/60 mb-0.5 tracking-wider">REPLACEMENT TIME</div>
                      <div className="text-foreground/90">{node.replacementTime}</div>
                    </div>
                  )}

                  {/* Causal connections summary */}
                  {connectedEdges.length > 0 && (
                    <div>
                      <div className="text-[7px] text-text-muted/60 mb-0.5 tracking-wider">CAUSAL CONNECTIONS</div>
                      <div className="text-foreground/90">
                        {connectedEdges.filter(e => e.target === node.id).length} upstream causes →
                        this node → {connectedEdges.filter(e => e.source === node.id).length} downstream effects.
                        {node.isConfounded && " Hidden common cause suspected (confounded)."}
                      </div>
                    </div>
                  )}

                  <div>
                    <div className="text-[7px] text-text-muted/60 mb-0.5 tracking-wider">DISCOVERY METHOD</div>
                    <div className="text-text-muted">
                      {node.discoverySource === "merged" ? "Identified by multiple causal discovery algorithms (DCD + PCMCI+ + FCI)" : `Discovered via ${node.discoverySource?.toUpperCase() || "unknown"} algorithm`}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* \u03A9F Pentagon \u2014 radar plot of all five pillars with composite at the
                center. Replaces the gauge-bar stack; the pillar legend below
                keeps click-to-expand affordance for description / formula. */}
            <div>
              <PillarRadar
                axes={axes}
                composite={node.omegaFragility.composite}
                selectedKey={expandedPillar}
                onSelect={(k) => setExpandedPillar(expandedPillar === k ? null : k)}
              />
              <div className="flex justify-center mt-1">
                <button
                  onClick={() => setShowMethodology((v) => !v)}
                  className="text-[7px] font-mono text-accent-cyan/70 hover:text-accent-cyan transition-colors tracking-wider"
                >
                  {showMethodology ? "▾ HIDE METHODOLOGY" : `▸ HOW IS ${profile.pillarLabels.composite} COMPUTED?`}
                </button>
              </div>
              <AnimatePresence>
                {showMethodology && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-1.5 p-2 rounded border border-accent-cyan/20 bg-accent-cyan/5 text-[8px] font-mono text-foreground/80 leading-relaxed">
                      {methodology}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Pillar description — only visible when a vertex is clicked.
                Replaces the always-on legend rows; no real estate consumed in
                the default state. */}
            <AnimatePresence>
              {expandedPillar && pillarDetails[expandedPillar] && (
                <motion.div
                  key={expandedPillar}
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="overflow-hidden"
                >
                  <div className="p-2.5 rounded border border-accent-cyan/30 bg-surface-elevated space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[11px] font-mono font-bold text-accent-cyan flex-shrink-0 w-3 text-center">
                          {PILLAR_SHORT[expandedPillar]}
                        </span>
                        <span className="text-[10px] text-foreground font-mono truncate">
                          {pillarDetails[expandedPillar].label}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span
                          className="text-[11px] font-mono font-bold"
                          style={{ color: getBarColor(node.omegaFragility[expandedPillar]) }}
                        >
                          {node.omegaFragility[expandedPillar].toFixed(1)}
                        </span>
                        <button
                          onClick={() => setExpandedPillar(null)}
                          className="text-[10px] text-text-muted hover:text-foreground transition-colors"
                          aria-label="Close pillar description"
                        >
                          &times;
                        </button>
                      </div>
                    </div>
                    <div className="text-[10px] font-mono text-foreground/90 leading-relaxed">
                      {pillarDetails[expandedPillar].short}
                    </div>
                    <div className="text-[9px] font-mono text-text-muted leading-relaxed">
                      {pillarDetails[expandedPillar].detail}
                    </div>
                    <div className="text-[9px] font-mono text-accent-cyan/70 leading-relaxed border-t border-border pt-1.5">
                      {pillarDetails[expandedPillar].formula}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

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
                <div className="space-y-1 max-h-32 overflow-y-auto overflow-x-hidden">
                  {connectedEdges.map((edge) => {
                    const isSource = edge.source === node.id;
                    const otherNode = graphData.nodes.find(
                      (n) => n.id === (isSource ? edge.target : edge.source)
                    );
                    return (
                      <div
                        key={edge.id}
                        className="edge-card text-[8px] font-mono p-1.5 rounded border border-border bg-surface-elevated min-w-0"
                      >
                        <div className="flex items-start gap-1">
                          <span className="text-text-muted">
                            {isSource ? "\u2192" : "\u2190"}
                          </span>
                          <span className="text-foreground truncate flex-1">
                            {otherNode?.shortLabel ?? "?"}
                          </span>
                        </div>
                        <span className="edge-meta-hidden text-text-muted text-[7px] min-w-0 break-words block mt-0.5">
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
