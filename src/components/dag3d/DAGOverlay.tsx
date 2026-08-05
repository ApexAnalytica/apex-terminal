"use client";

import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import { useApexStore } from "@/stores/useApexStore";
import { getDomainColor } from "@/lib/graph-color";
import {
  getEdgeTypeMeta,
  getAllEdgeTypeMeta,
  getBuiltinEdgeTypeMeta,
  type EdgeTypeMeta,
} from "@/lib/edge-type-registry";
import { useTemporalGraph } from "@/hooks/useTemporalGraph";
import { DOMAIN_CARDS } from "@/lib/domains";
import { DOMAIN_MAP } from "@/hooks/useFilteredGraph";
import type { NodeSizeMetric } from "@/lib/types";
import { topByKey } from "@/lib/perf/top-n";

// Static lookups derived from module-level constants — hoisted out of
// the domainPanelRows memo so every memo invalidation (which fires on
// any activeGraph.nodes / selectedDomainCardIds change) doesn't
// rebuild them from scratch. DOMAIN_CARDS and DOMAIN_MAP are imports;
// these maps are pure functions of them and never change at runtime.
const DOMAIN_CARD_BY_ID = new Map(DOMAIN_CARDS.map((c) => [c.id, c]));
const RAW_DOMAIN_TO_CARD_ID = (() => {
  const m = new Map<string, string>();
  for (const [cardId, rawDomains] of Object.entries(DOMAIN_MAP)) {
    for (const raw of rawDomains) m.set(raw, cardId);
  }
  return m;
})();

/**
 * Documents every visual encoding the network views use, in one
 * discoverable popover. Replaces the cryptic `SIZE: ΩF / EIG / BTW`
 * button trio that previously sat inline (no one could tell what BTW
 * meant) and surfaces the encodings that were never documented at all
 * (distance, edge thickness, edge colour, glow). Same key in both 3D
 * and 2D — the encodings are identical so the legend is too.
 */
function EncodingLegend({
  nodeSizeMetric,
  onMetricChange,
  onClose,
}: {
  nodeSizeMetric: NodeSizeMetric;
  onMetricChange: (m: NodeSizeMetric) => void;
  onClose: () => void;
}) {
  const popoverRef = useRef<HTMLDivElement | null>(null);

  // Click-outside / Escape to dismiss — popover doesn't take focus on its
  // own (no form inputs), so a global listener is the simplest path.
  useEffect(() => {
    function onPointer(e: MouseEvent) {
      if (!popoverRef.current) return;
      if (popoverRef.current.contains(e.target as Node)) return;
      // Don't dismiss if the click was the LEGEND button itself —
      // that toggle is handled by its own onClick which fires after
      // this listener clears `legendOpen`.
      const target = e.target as HTMLElement;
      if (target.closest("button")?.textContent?.trim() === "LEGEND") return;
      onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const sizeOptions: Array<{ id: NodeSizeMetric; label: string; help: string }> = [
    {
      id: "omega",
      label: "Criticality (ΩF)",
      help: "Static fragility composite — 0–10. Default analytical signal.",
    },
    {
      id: "eigenvector",
      label: "Influence (eigenvector centrality)",
      help: "Importance via connections to other important nodes. Surfaces hubs.",
    },
    {
      id: "betweenness",
      label: "Bridge (betweenness centrality)",
      help: "Lies on shortest paths between others. Surfaces chokepoints.",
    },
  ];

  // The four built-in edge-type rows below keep their bespoke swatch shapes
  // (arrow / dot / dashed gradient) + prose, but pull their HUE from the
  // shared registry so the legend stays in lockstep with the canvas. Any
  // DOMAIN-registered (non-built-in) type appends a generic auto-row, so a
  // new type documents itself with no edit here. Empty by default — nothing
  // registers a custom type through the closed union yet.
  const builtinTypeIds = new Set(getBuiltinEdgeTypeMeta().map((m) => m.type));
  const domainEdgeTypes = getAllEdgeTypeMeta().filter(
    (m) => !builtinTypeIds.has(m.type)
  );

  return (
    <div
      ref={popoverRef}
      className="absolute right-0 top-full mt-2 w-[340px] rounded border border-border bg-surface-elevated/95 backdrop-blur-sm shadow-xl pointer-events-auto z-30"
      style={{ fontFamily: "monospace" }}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-[9px] font-[family-name:var(--font-michroma)] tracking-wider text-text-muted">
          VISUAL ENCODINGS
        </span>
        <button
          onClick={onClose}
          className="text-[10px] text-text-muted hover:text-foreground"
          aria-label="Close legend"
        >
          ✕
        </button>
      </div>

      {/* Size — interactive: this is the only knob the user can change
          from the legend. Selecting a row both surfaces the explanation
          and rebinds nodeSizeMetric in the store. */}
      <div className="px-3 py-2 border-b border-border">
        <div className="text-[8px] tracking-wider text-text-muted mb-1.5">
          NODE SIZE
        </div>
        <div className="flex flex-col gap-1">
          {sizeOptions.map((opt) => {
            const active = nodeSizeMetric === opt.id;
            return (
              <button
                key={opt.id}
                onClick={() => onMetricChange(opt.id)}
                className={`text-left rounded px-2 py-1.5 transition-colors ${
                  active
                    ? "bg-accent-cyan/15 border border-accent-cyan/40"
                    : "border border-transparent hover:bg-surface"
                }`}
              >
                <div
                  className={`text-[10px] ${
                    active ? "text-accent-cyan" : "text-foreground"
                  }`}
                >
                  {opt.label}
                </div>
                <div className="text-[9px] text-text-muted leading-snug mt-0.5">
                  {opt.help}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Read-only encodings — fixed by the dataset / view, not toggleable. */}
      <div className="px-3 py-2 flex flex-col gap-1.5">
        <LegendRow
          label="NODE COLOUR"
          help="Domain (matches the DOMAINS legend)."
          swatch={
            <div className="flex gap-0.5">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "#00e676" }} />
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "#00e5ff" }} />
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "#ffab00" }} />
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "#7c4dff" }} />
            </div>
          }
        />
        <LegendRow
          label="NODE GLOW"
          help="ΩF severity. Red ≥ 9, amber 7–9, green < 7."
          swatch={
            <div className="flex gap-0.5">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "#00e676", boxShadow: "0 0 4px #00e676" }} />
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "#ffab00", boxShadow: "0 0 4px #ffab00" }} />
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "#ff1744", boxShadow: "0 0 4px #ff1744" }} />
            </div>
          }
        />
        <LegendRow
          label="DISTANCE"
          help="Soft signal: force-directed layout pulls strongly-weighted pairs closer (link length 65 + 100·(1−weight)). Other forces (charge, collision) compete, so distance is approximate, not literal."
          swatch={
            <div className="relative w-10 h-3">
              <span className="absolute left-0 top-1/2 -translate-y-1/2 h-1.5 w-1.5 rounded-full bg-accent-cyan" />
              <span className="absolute right-0 top-1/2 -translate-y-1/2 h-1.5 w-1.5 rounded-full bg-accent-cyan" />
              <span className="absolute left-1.5 right-1.5 top-1/2 -translate-y-1/2 h-px bg-accent-cyan/40" />
            </div>
          }
        />
        <LegendRow
          label="EDGE THICKNESS"
          help="Correlation / causal magnitude — power-scaled so the typical 0.4–0.8 weight range reads as ~3× spread on screen."
          swatch={
            <div className="flex flex-col gap-0.5 w-10 items-stretch">
              <span className="h-px bg-accent-cyan" />
              <span className="h-1 bg-accent-cyan" />
              <span className="h-1.5 bg-accent-cyan" />
            </div>
          }
        />
        <LegendRow
          label="CAUSAL (cyan →)"
          help="Direct cause: A → B. Arrowed."
          swatch={
            <div className="flex items-center gap-0.5">
              <span className="h-0.5 w-6" style={{ backgroundColor: getEdgeTypeMeta("directed").color }} />
              <span className="text-[8px]" style={{ color: getEdgeTypeMeta("directed").color }}>▶</span>
            </div>
          }
        />
        <LegendRow
          label="TEMPORAL (amber, animated)"
          help="Lag-correlation: A leads B by some delay. Particles flow source → target."
          swatch={
            <div className="flex items-center gap-0.5">
              <span className="h-0.5 w-6" style={{ backgroundColor: getEdgeTypeMeta("temporal").color }} />
              <span className="h-1 w-1 rounded-full" style={{ backgroundColor: getEdgeTypeMeta("temporal").color, boxShadow: `0 0 4px ${getEdgeTypeMeta("temporal").color}` }} />
            </div>
          }
        />
        <LegendRow
          label="CONFOUNDED (orange, dashed)"
          help="A and B share a hidden common cause, no direct link. Dashed to flag the latent variable."
          swatch={
            <div className="flex items-center">
              <span
                className="h-0.5 w-7"
                style={{
                  backgroundImage: `linear-gradient(to right, ${getEdgeTypeMeta("confounded").color} 50%, transparent 50%)`,
                  backgroundSize: "4px 100%",
                }}
              />
            </div>
          }
        />
        <LegendRow
          label="FLOW (teal, animated →)"
          help="Directed transmission of material / capital / signal through the network. Distinct from CAUSAL (a claim of cause) and TEMPORAL (a lag correlation) — flow means stuff is actually moving along this edge."
          swatch={
            <div className="flex items-center gap-0.5">
              <span className="h-0.5 w-6" style={{ backgroundColor: getEdgeTypeMeta("flow").color }} />
              <span className="h-1 w-1 rounded-full" style={{ backgroundColor: getEdgeTypeMeta("flow").color, boxShadow: `0 0 4px ${getEdgeTypeMeta("flow").color}` }} />
              <span className="text-[8px]" style={{ color: getEdgeTypeMeta("flow").color }}>▶</span>
            </div>
          }
        />
        {/* Domain-registered edge types (none by default — the EdgeType union
            is closed in this PR) document themselves here with a generic
            swatch derived from the registry flags. No edit needed when a
            domain registers a type via `registerEdgeType`. */}
        {domainEdgeTypes.map((meta) => (
          <LegendRow
            key={meta.type}
            label={meta.label}
            help={meta.description}
            swatch={<DomainEdgeSwatch meta={meta} />}
          />
        ))}
        <LegendRow
          label="INCONSISTENT (red)"
          help="Tarski filter: edge violates a domain-aware axiom. Only visible when the verified-truth filter is on."
          swatch={
            <div className="flex items-center">
              <span className="h-0.5 w-6" style={{ backgroundColor: "#ff1744" }} />
            </div>
          }
        />
        <LegendRow
          label="χ★ STRICT BRIDGE (solid violet tracks)"
          help="Two thin solid violet lines run alongside the edge — like train tracks. Removing this edge disconnects the (undirected) graph; every cascade path between the resulting components must traverse it. Click the edge for BES + rank. Source: Ghauri 2025 D.Eng."
          swatch={
            <div className="flex items-center">
              {/* Train-track swatch: cyan line in the middle, two thin
                  violet rails above and below. Mirrors the canvas. */}
              <span className="relative h-2.5 w-7">
                <span
                  className="absolute left-0 right-0 h-px"
                  style={{ top: "20%", backgroundColor: "#7B68EE", opacity: 0.85 }}
                />
                <span
                  className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-px"
                  style={{ backgroundColor: "#00e5ff" }}
                />
                <span
                  className="absolute left-0 right-0 h-px"
                  style={{ bottom: "20%", backgroundColor: "#7B68EE", opacity: 0.85 }}
                />
              </span>
            </div>
          }
        />
        <LegendRow
          label="χ★ TOP-BES (dashed violet tracks)"
          help="Two thin dashed violet lines run alongside the edge. High Bridge-Edge Strength — participates in many shortest paths even though removing it doesn't formally disconnect the graph."
          swatch={
            <div className="flex items-center">
              <span className="relative h-2.5 w-7">
                <span
                  className="absolute left-0 right-0 h-px"
                  style={{
                    top: "20%",
                    backgroundImage:
                      "linear-gradient(to right, #7B68EE 60%, transparent 60%)",
                    backgroundSize: "5px 100%",
                    opacity: 0.85,
                  }}
                />
                <span
                  className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-px"
                  style={{ backgroundColor: "#00e5ff" }}
                />
                <span
                  className="absolute left-0 right-0 h-px"
                  style={{
                    bottom: "20%",
                    backgroundImage:
                      "linear-gradient(to right, #7B68EE 60%, transparent 60%)",
                    backgroundSize: "5px 100%",
                    opacity: 0.85,
                  }}
                />
              </span>
            </div>
          }
        />
      </div>
    </div>
  );
}

function LegendRow({
  label,
  help,
  swatch,
}: {
  label: string;
  help: string;
  swatch: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2">
      <div className="flex-shrink-0 mt-0.5 w-12 flex items-center justify-center">
        {swatch}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[8px] tracking-wider text-text-muted">{label}</div>
        <div className="text-[9px] text-foreground leading-snug">{help}</div>
      </div>
    </div>
  );
}

/**
 * Generic legend swatch for a DOMAIN-registered edge type, derived entirely
 * from its registry flags (color + dashed). The four built-ins keep their
 * hand-tuned swatches above; this renders any type a domain adds at runtime
 * via `registerEdgeType` so it's documented without a UI edit. Mirrors the
 * dashed-vs-solid distinction the built-in confounded/causal rows draw.
 */
function DomainEdgeSwatch({ meta }: { meta: EdgeTypeMeta }) {
  if (meta.dashed) {
    return (
      <div className="flex items-center">
        <span
          className="h-0.5 w-7"
          style={{
            backgroundImage: `linear-gradient(to right, ${meta.color} 50%, transparent 50%)`,
            backgroundSize: "4px 100%",
          }}
        />
      </div>
    );
  }
  return (
    <div className="flex items-center gap-0.5">
      <span className="h-0.5 w-6" style={{ backgroundColor: meta.color }} />
      {meta.arrow && (
        <span className="text-[8px]" style={{ color: meta.color }}>
          ▶
        </span>
      )}
    </div>
  );
}

export default function DAGOverlay() {
  // Fine-grained selectors so this component only re-renders when its own
  // slices change, not on any store mutation (item #4).
  const graphData = useApexStore((s) => s.graphData);
  const activeModule = useApexStore((s) => s.activeModule);
  const viewMode = useApexStore((s) => s.viewMode);
  const setViewMode = useApexStore((s) => s.setViewMode);
  const visibleEdgeTypes = useApexStore((s) => s.visibleEdgeTypes);
  const toggleEdgeTypeVisibility = useApexStore((s) => s.toggleEdgeTypeVisibility);
  const showLatentNodes = useApexStore((s) => s.showLatentNodes);
  const setShowLatentNodes = useApexStore((s) => s.setShowLatentNodes);
  const nodeSizeMetric = useApexStore((s) => s.nodeSizeMetric);
  const setNodeSizeMetric = useApexStore((s) => s.setNodeSizeMetric);
  const truthFilter = useApexStore((s) => s.truthFilter);
  const selectedNode = useApexStore((s) => s.selectedNode);
  const setSelectedNode = useApexStore((s) => s.setSelectedNode);
  const selectedNodes = useApexStore((s) => s.selectedNodes);
  const setSelectedNodes = useApexStore((s) => s.setSelectedNodes);
  const isolateSelection = useApexStore((s) => s.isolateSelection);
  const setIsolateSelection = useApexStore((s) => s.setIsolateSelection);
  const addCopilotMessage = useApexStore((s) => s.addCopilotMessage);
  const isLive = useApexStore((s) => s.isLive);
  const timelinePosition = useApexStore((s) => s.timelinePosition);
  const [activeDomain, setActiveDomain] = useState<string | null>(null);
  // Domain panel collapses by default — the full list (often 6–10 rows
  // with counts) was eating real estate on every canvas. The chevron
  // header always stays visible so the affordance is discoverable.
  const [domainPanelOpen, setDomainPanelOpen] = useState(false);
  // The encoding key (size + colour + glow + edge meanings) used to live
  // as a cryptic `SIZE: ΩF / EIG / BTW` button trio next to the view-mode
  // buttons. Users couldn't tell what BTW meant, and there was no
  // documentation at all of what edge thickness / inter-node distance /
  // node colour represent. Replaced with one discoverable LEGEND button
  // → popover that documents every visual encoding in one place. The
  // size-metric toggle is moved INSIDE the popover with full names
  // ("Criticality (ΩF)" instead of "ΩF") and a one-line explanation.
  const [legendOpen, setLegendOpen] = useState(false);
  const { graph: temporalGraph } = useTemporalGraph();
  const activeGraph = isLive ? graphData : temporalGraph;
  const meta = activeGraph.metadata;

  // O(1) id → node lookup, used both inside this component and by the
  // selection / domain-filter handlers below. Replaces O(N²) Array.find
  // calls that ran inside selectedNodes.map() loops.
  const nodeById = useMemo(
    () => new Map(activeGraph.nodes.map((n) => [n.id, n] as const)),
    [activeGraph.nodes],
  );

  const selectedNodeData = useMemo(() => {
    if (!selectedNode) return null;
    return nodeById.get(selectedNode) ?? null;
  }, [selectedNode, nodeById]);

  // Domain legend rows. Was previously a raw `Object.entries` over
  // `n.domain` strings, which the user flagged as apples-to-oranges:
  // "Sovereign Risk" sat alongside "Saudi Aramco Energy" — same panel,
  // different abstraction levels. The data layer carries node-domain
  // strings at multiple granularities (per-company, per-sector,
  // per-theme); the only level that's user-recognisable is the
  // DomainCard catalog the landing-page picker shows.
  //
  // The new pipeline:
  //   1. Reverse DOMAIN_MAP (selector-id → raw-domain[]) into
  //      raw-domain → card.
  //   2. Walk activeGraph.nodes, bucket each by its card (or by raw
  //      name if the node belongs to a cross-domain connector like
  //      "Geopolitical" / "Energy Grid" with no card mapping).
  //   3. If the user picked specific domains at landing, filter buckets
  //      to that subset (cross-domain rows always pass).
  // Result: every row corresponds to something the user actually
  // chose, displayed with the same label they recognised on the way in.
  const selectedDomainCardIds = useApexStore((s) => s.selectedDomains);
  const domainPanelRows = useMemo(() => {
    type Row = {
      key: string;
      label: string;
      color: string;
      count: number;
      rawDomains: string[];
      isCrossDomain: boolean;
    };
    const byKey = new Map<string, Row>();
    for (const n of activeGraph.nodes) {
      const cardId = RAW_DOMAIN_TO_CARD_ID.get(n.domain);
      if (cardId) {
        const card = DOMAIN_CARD_BY_ID.get(cardId);
        if (!card) continue;
        const existing = byKey.get(cardId);
        if (existing) {
          existing.count += 1;
          if (!existing.rawDomains.includes(n.domain)) {
            existing.rawDomains.push(n.domain);
          }
        } else {
          byKey.set(cardId, {
            key: cardId,
            label: card.label,
            color: card.color,
            count: 1,
            rawDomains: [n.domain],
            isCrossDomain: false,
          });
        }
      } else {
        // Cross-domain connectors ("Geopolitical", "Energy Grid") have
        // no card mapping — keep them as their raw-name row so the
        // user still sees them when they auto-attach to a selection.
        const key = `_raw:${n.domain}`;
        const existing = byKey.get(key);
        if (existing) {
          existing.count += 1;
        } else {
          byKey.set(key, {
            key,
            label: n.domain,
            color: getDomainColor(n.domain),
            count: 1,
            rawDomains: [n.domain],
            isCrossDomain: true,
          });
        }
      }
    }
    let rows = Array.from(byKey.values());
    if (selectedDomainCardIds.length > 0) {
      const allowed = new Set(selectedDomainCardIds);
      rows = rows.filter((r) => r.isCrossDomain || allowed.has(r.key));
    }
    rows.sort((a, b) => b.count - a.count);
    return rows;
  }, [activeGraph.nodes, selectedDomainCardIds]);

  // Top-Ω nodes. O(N · 5) partial-select via topByKey; was
  // [...nodes].sort().slice(0, 5) — O(N log N) plus a wasted full-array
  // allocation. The legend only renders 5 entries, so paying for a
  // total sort was strictly wasted work.
  const topOmega = useMemo(
    () =>
      topByKey(activeGraph.nodes, (n) => n.omegaFragility.composite, 5),
    [activeGraph.nodes],
  );

  return (
    <div className="absolute inset-0 pointer-events-none z-10">
      {/* Focus bar (when node selected) */}
      {selectedNodeData && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 pointer-events-auto flex items-center gap-3">
          <button
            onClick={() => setSelectedNode(null)}
            className="text-[9px] font-[family-name:var(--font-michroma)] tracking-wider px-3 py-1.5 rounded border border-accent-cyan/50 text-accent-cyan hover:bg-accent-cyan/10 transition-colors"
          >
            &larr; DESELECT
          </button>
          <span className="text-[9px] font-mono text-accent-cyan">
            FOCUSED: {selectedNodeData.label}
          </span>
        </div>
      )}

      {/* Top Left: Title */}
      <div className="absolute top-3 left-3">
        <div className="font-[family-name:var(--font-michroma)] text-[10px] tracking-[0.2em] text-text-muted">
          GENERATED CAUSAL DAG ({viewMode.toUpperCase()} DRAFT)
        </div>
        <div className="text-[9px] text-text-muted font-mono mt-0.5">
          {activeModule.toUpperCase()} ENGINE ACTIVE
        </div>
      </div>

      {/* Top Right: View-mode cycle buttons. The previous RENDERING /
          METHOD info badges (WEBGL_3D / REACTFLOW_2D / DCD / NOTEARS) were
          internal stack details that didn't help end users — removed so
          the corner stays clean. View labels still say which view is
          active via the highlighted button. */}
      <div className="absolute top-3 right-3 flex items-center gap-2 pointer-events-auto">
        {/* Per-edge-type visibility toggle. Each chip shows / hides
            its edge type across every canvas surface (consumers read
            `visibleEdgeTypes` from the store and filter). Visible all
            four types by default; click a chip to dim → hide that
            type, click again to bring it back. Same rationale as the
            LEGEND popover next to it but interactive — the LEGEND
            documents what each type means, this strip controls which
            of them are on screen. */}
        {(viewMode === "3d" || viewMode === "2d" || viewMode === "map") && (
          <div className="flex items-center gap-0.5 rounded border border-border overflow-hidden">
            {(
              [
                // Short chip labels stay bespoke (CAUSAL/TEMP/CONF/FLOW —
                // tighter than the registry's full labels); only the hue is
                // registry-sourced so the strip tracks the canvas.
                { type: "directed", label: "CAUSAL", color: getEdgeTypeMeta("directed").color },
                { type: "temporal", label: "TEMP", color: getEdgeTypeMeta("temporal").color },
                { type: "confounded", label: "CONF", color: getEdgeTypeMeta("confounded").color },
                { type: "flow", label: "FLOW", color: getEdgeTypeMeta("flow").color },
              ] as const
            ).map(({ type, label, color }) => {
              // Empty Set === everything visible (back-compat).
              const isVisible =
                visibleEdgeTypes.size === 0 || visibleEdgeTypes.has(type);
              return (
                <button
                  key={type}
                  onClick={() => toggleEdgeTypeVisibility(type)}
                  className="px-1.5 py-1 text-[8px] font-[family-name:var(--font-michroma)] tracking-wider transition-colors border-r border-border last:border-r-0"
                  style={{
                    backgroundColor: isVisible
                      ? `${color}15`
                      : "transparent",
                    color: isVisible ? color : "var(--text-muted)",
                    opacity: isVisible ? 1 : 0.45,
                  }}
                  title={
                    isVisible
                      ? `Hide ${label} edges`
                      : `Show ${label} edges`
                  }
                >
                  {label}
                </button>
              );
            })}
          </div>
        )}

        {/* Inferred-latent overlay toggle (Dr. Pita synthetic-node #1).
            Opt-in, default OFF. 2D only for now (3D render is a fast-follow).
            Surfaces hidden common causes the model posits from confounded
            structure — read-only, never enters cascade/ΩF/metrics. */}
        {viewMode === "2d" && (
          <button
            onClick={() => setShowLatentNodes(!showLatentNodes)}
            className="px-1.5 py-1 text-[8px] font-[family-name:var(--font-michroma)] tracking-wider rounded border border-border transition-colors"
            style={{
              backgroundColor: showLatentNodes ? "#e040fb15" : "transparent",
              color: showLatentNodes ? "#e040fb" : "var(--text-muted)",
              opacity: showLatentNodes ? 1 : 0.6,
            }}
            title={
              showLatentNodes
                ? "Hide inferred latent nodes"
                : "Show inferred latent nodes — hidden common causes the model posits from confounded structure (read-only, not real data)"
            }
          >
            ◌ LATENT
          </button>
        )}
        {/* Encoding legend — visible in 3D and 2D where the visual
            primitive is a sized, coloured node with edges. MAP and TOPO
            have their own legends. Click opens a popover documenting
            every encoding the user can see (size, colour, glow,
            distance, edge thickness, edge colour) plus the size-metric
            toggle inline. Reduces "what does this dot mean?" friction. */}
        {(viewMode === "3d" || viewMode === "2d") && (
          <div className="relative">
            <button
              onClick={() => setLegendOpen((prev) => !prev)}
              className={`text-[9px] font-[family-name:var(--font-michroma)] tracking-wider px-2.5 py-1 rounded border transition-colors ${
                legendOpen
                  ? "border-accent-cyan text-accent-cyan bg-accent-cyan/10"
                  : "border-border text-text-muted hover:text-accent-cyan hover:border-accent-cyan/40"
              }`}
              title="What do the visuals mean?"
            >
              LEGEND
            </button>
            {legendOpen && (
              <EncodingLegend
                nodeSizeMetric={nodeSizeMetric}
                onMetricChange={(m) => setNodeSizeMetric(m)}
                onClose={() => setLegendOpen(false)}
              />
            )}
          </div>
        )}
        {/* View mode cycle buttons. Internal id stays "relief" so existing
            store / type machinery keeps working; the user-facing label is
            "TOPO" (more recognisable than "RELIEF" for a topographic map). */}
        {(["3d", "2d", "map", "relief"] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            className={`text-[9px] font-[family-name:var(--font-michroma)] tracking-wider px-2.5 py-1 rounded border transition-colors ${
              viewMode === mode
                ? "border-accent-cyan text-accent-cyan bg-accent-cyan/10"
                : "border-border text-text-muted hover:text-accent-cyan hover:border-accent-cyan/40"
            }`}
          >
            {mode === "3d" ? "3D" : mode === "2d" ? "2D" : mode === "map" ? "MAP" : "TOPO"}
          </button>
        ))}
      </div>

      {/* Temporal scrub indicator */}
      {!isLive && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2">
          <div
            className="text-[9px] font-[family-name:var(--font-michroma)] tracking-wider px-3 py-1 rounded border"
            style={{
              borderColor: "var(--accent-amber)",
              backgroundColor: "rgba(255,171,0,0.08)",
              color: "var(--accent-amber)",
            }}
          >
            HISTORICAL VIEW — {new Date(timelinePosition).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </div>
        </div>
      )}

      {/* Truth filter badge */}
      {truthFilter === "verified" && (
        <div className="absolute top-12 left-3">
          <div className="text-[8px] font-mono px-2 py-0.5 rounded border border-accent-red/40 text-accent-red bg-accent-red/5">
            TARSKI FILTER ACTIVE — {meta.inconsistentEdges} INCONSISTENT | {meta.restrictedNodes} RESTRICTED
          </div>
        </div>
      )}

      {/* Top Right below controls: Top-Ω ranking (interactive) */}
      <div className="absolute top-12 right-3 pointer-events-auto">
        <div className="text-[8px] font-mono px-2 py-1.5 rounded border border-border bg-surface-elevated/80">
          <div className="text-[7px] font-[family-name:var(--font-michroma)] tracking-wider text-text-muted mb-1">
            TOP-{"\u03A9"} NODES <span className="text-text-muted/40">— click to focus</span>
          </div>
          {topOmega.map((node, i) => {
            const isActive = selectedNode === node.id;
            const scoreColor = node.omegaFragility.composite > 9 ? "#ff1744"
              : node.omegaFragility.composite >= 7 ? "#ffab00"
              : "#00e676";
            return (
              <div
                key={node.id}
                className="flex items-center gap-1.5 py-0.5 cursor-pointer rounded px-1 -mx-1 transition-colors hover:bg-white/5"
                style={{
                  backgroundColor: isActive ? "rgba(0,229,255,0.08)" : undefined,
                  borderLeft: isActive ? "2px solid var(--accent-cyan)" : "2px solid transparent",
                }}
                onClick={() => {
                  setSelectedNode(isActive ? null : node.id);
                  if (activeDomain) {
                    setActiveDomain(null);
                    setSelectedNodes([]);
                  }
                }}
              >
                <span className="text-[7px] text-text-muted w-3">{i + 1}.</span>
                <span
                  className="text-[8px] font-bold"
                  style={{ color: scoreColor }}
                >
                  {node.omegaFragility.composite.toFixed(1)}
                </span>
                <span
                  className="text-[8px] truncate max-w-[120px]"
                  style={{ color: isActive ? "var(--accent-cyan)" : "var(--text-muted)" }}
                >
                  {node.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Selection panel — below Top-Ω */}
      {selectedNodes.length > 0 && (
        <div className="absolute right-3 pointer-events-auto" style={{ top: "calc(3rem + 180px)" }}>
          <div className="text-[8px] font-mono px-2 py-1.5 rounded border border-accent-cyan/40 bg-surface-elevated/80 max-w-[200px]">
            <div className="flex items-center justify-between mb-1">
              <div className="text-[7px] font-[family-name:var(--font-michroma)] tracking-wider text-accent-cyan">
                {selectedNodes.length} NODES SELECTED
              </div>
              <button
                onClick={() => { setSelectedNodes([]); setIsolateSelection(false); }}
                className="text-[7px] font-mono text-accent-red hover:text-red-400 transition-colors px-1"
              >
                CLEAR ALL
              </button>
            </div>
            <div className="flex flex-col gap-0.5 max-h-[120px] overflow-y-auto">
              {selectedNodes.map((nodeId) => {
                const node = nodeById.get(nodeId);
                return (
                  <div key={nodeId} className="flex items-center justify-between gap-1 py-0.5">
                    <span className="text-[8px] text-text-muted truncate">{node?.label ?? nodeId}</span>
                    <button
                      onClick={() => {
                        const next = selectedNodes.filter((id) => id !== nodeId);
                        setSelectedNodes(next);
                        if (next.length === 0) setIsolateSelection(false);
                      }}
                      className="text-[7px] text-text-muted/50 hover:text-accent-red transition-colors flex-shrink-0"
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
            {/* Action buttons */}
            <div className="flex gap-1 mt-1.5 pt-1.5 border-t border-border/50">
              <button
                // ISOLATE flips the selection-only filter across every
                // canvas surface — 2D / 3D / Map / TOPO. With ~200 nodes
                // and ~330 edges, the resulting re-render cascade
                // (especially the 3D scene-tree where non-selected nodes
                // unmount in a single frame) was reading as a freeze
                // for ~150-300ms when triggered from a multi-domain
                // selection. `startTransition` marks the resulting work
                // as non-urgent: React keeps the current UI interactive
                // and computes the new tree in the background, so the
                // click feels instant even if the actual switch lands
                // ~150ms later.
                onClick={() => startTransition(() => setIsolateSelection(!isolateSelection))}
                className={`flex-1 text-[7px] font-[family-name:var(--font-michroma)] tracking-wider px-1.5 py-1 rounded border transition-colors ${
                  isolateSelection
                    ? "border-accent-amber/60 text-accent-amber bg-accent-amber/10"
                    : "border-border text-text-muted hover:text-accent-amber hover:border-accent-amber/40"
                }`}
              >
                {isolateSelection ? "SHOW ALL" : "ISOLATE"}
              </button>
              <button
                onClick={() => {
                  const nodeLabels = selectedNodes.map((id) => nodeById.get(id)?.label ?? id);
                  const selSet = new Set(selectedNodes);
                  const subEdges = activeGraph.edges.filter((e) => selSet.has(e.source) && selSet.has(e.target));
                  const edgeDescs = subEdges.map((e) => {
                    const src = nodeById.get(e.source)?.label ?? e.source;
                    const tgt = nodeById.get(e.target)?.label ?? e.target;
                    return `${src} → ${tgt} (${e.type}, w=${e.weight}, mechanism: ${e.physicalMechanism || "N/A"})`;
                  });
                  const prompt = `ANALYZE SELECTION: The user has selected ${selectedNodes.length} nodes in the causal DAG. Provide a macro analysis of this subgraph — what are the key causal pathways, systemic risks, and cascading vulnerabilities? How do these nodes interact and what are the implications?\n\nSelected nodes: ${nodeLabels.join(", ")}\n\nEdges within selection (${subEdges.length}):\n${edgeDescs.join("\n")}`;
                  addCopilotMessage({
                    id: `user-sel-${Date.now()}`,
                    role: "user",
                    content: `ANALYZE SELECTION (${selectedNodes.length} nodes)`,
                    timestamp: Date.now(),
                  });
                  // Dispatch to copilot via a custom event that SystemCopilot listens for
                  window.dispatchEvent(new CustomEvent("apex-analyze-selection", { detail: { prompt } }));
                }}
                className="flex-1 text-[7px] font-[family-name:var(--font-michroma)] tracking-wider px-1.5 py-1 rounded border border-accent-cyan/40 text-accent-cyan hover:bg-accent-cyan/10 transition-colors"
              >
                ANALYZE
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Left: Domain legend (interactive, collapsible) */}
      <div className="absolute bottom-12 left-3 pointer-events-auto">
        <div className="text-[8px] font-mono px-2 py-1.5 rounded border border-border bg-surface-elevated/80">
          <button
            onClick={() => setDomainPanelOpen((p) => !p)}
            className="flex items-center gap-1.5 text-[7px] font-[family-name:var(--font-michroma)] tracking-wider text-text-muted hover:text-accent-cyan transition-colors w-full"
            aria-expanded={domainPanelOpen}
            title={domainPanelOpen ? "Collapse domains" : "Expand domains"}
          >
            <span
              className="inline-block transition-transform"
              style={{ transform: domainPanelOpen ? "rotate(90deg)" : "rotate(0deg)" }}
            >
              ▶
            </span>
            DOMAINS
            <span className="text-text-muted/40">
              {activeDomain
                ? `· ${activeDomain}`
                : domainPanelOpen
                  ? "— click to highlight"
                  : `(${domainPanelRows.length})`}
            </span>
          </button>
          {domainPanelOpen && (
            <div className="flex flex-col gap-0.5 mt-1">
              {domainPanelRows.map((row) => {
                const isActive = activeDomain === row.key;
                return (
                  <div
                    key={row.key}
                    className="flex items-center gap-1.5 cursor-pointer rounded px-1 -mx-1 py-0.5 transition-colors hover:bg-white/5"
                    style={{
                      backgroundColor: isActive ? `${row.color}15` : undefined,
                      borderLeft: isActive ? `2px solid ${row.color}` : "2px solid transparent",
                    }}
                    onClick={() => {
                      if (isActive) {
                        setActiveDomain(null);
                        setSelectedNodes([]);
                      } else {
                        setActiveDomain(row.key);
                        const allowed = new Set(row.rawDomains);
                        const nodeIds = activeGraph.nodes
                          .filter((n) => allowed.has(n.domain))
                          .map((n) => n.id);
                        setSelectedNodes(nodeIds);
                      }
                    }}
                  >
                    <div
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: row.color }}
                    />
                    <span className="text-[8px]" style={{ color: isActive ? row.color : "var(--text-muted)" }}>
                      {row.label}
                    </span>
                    <span className="text-[7px] text-text-muted/50">
                      ({row.count})
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Bottom Left: Control hints (above) + structural metrics (below).
          Previously the hints sat at bottom-3 right-3, which the CLIENT
          DEPLOYMENT CTA on the same edge clipped over. Moved to the
          opposite corner and stacked above the metrics so neither
          overlaps the deploy link.
          The "NODE SIZE = EIGENVECTOR CENTRALITY | DISTANCE = EDGE WEIGHT"
          sub-text was removed — too cryptic to help end users, and most
          of that meaning is conveyed by the visual itself. */}
      {(viewMode === "3d" || viewMode === "map") && (
        <div className="absolute bottom-9 left-3 pointer-events-none">
          <div className="text-[8px] font-mono text-text-muted/50">
            {viewMode === "3d"
              ? "DRAG: ORBIT | SCROLL: ZOOM | RIGHT-CLICK: PAN | SHIFT+DRAG: SELECT | DOUBLE-CLICK: FOCUS | ESC: DESELECT"
              : "DRAG: PAN | SCROLL: ZOOM | CLICK: SELECT | SHIFT+CLICK: MULTI-SELECT | HOVER: INSPECT"}
          </div>
        </div>
      )}
      <div className="absolute bottom-3 left-3">
        <div className="flex gap-4 text-[9px] font-mono text-text-muted">
          <span>NODES: {meta.totalNodes}</span>
          <span>EDGES: {meta.totalEdges}</span>
          <span>DENSITY: {meta.density.toFixed(3)}</span>
          <span>CONSTRAINT: {meta.constraintType.split("+")[0].trim()}</span>
        </div>
      </div>
    </div>
  );
}
