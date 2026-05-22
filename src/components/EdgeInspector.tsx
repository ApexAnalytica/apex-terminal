"use client";

import { motion } from "framer-motion";
import type { CausalEdge } from "@/lib/types";
import { isAutoBridge, extractAutoBridgeScore } from "@/lib/cross-domain-bridging";

/**
 * Per-edge χ★ context — when present, the edge is in the χ★ set
 * (Tarjan strict bridges ∪ top-k Bridge-Edge Strength). Surfaces
 * BES + bridge / top-k membership inline so users can answer "why
 * is this edge highlighted with the violet halo?" without leaving
 * the inspector. Computed once at the canvas level — see
 * CausalDAG3D's chiStarInfo useMemo.
 */
export interface ChiStarEdgeInfo {
  isBridge: boolean;
  bes: number;
  /** 0-indexed BES rank (0 = highest BES). null if not ranked. */
  rank: number | null;
  /** Total edges in the BES ranking — context for the rank value. */
  totalEdges: number;
}

/**
 * Shared edge inspector popup — used by 2D, 3D, and Map views.
 * Shows causal link details when an edge is clicked.
 */
export default function EdgeInspector({
  edge,
  sourceLabel,
  targetLabel,
  onClose,
  chiStarInfo,
}: {
  edge: CausalEdge;
  sourceLabel: string;
  targetLabel: string;
  onClose: () => void;
  chiStarInfo?: ChiStarEdgeInfo | null;
}) {
  const typeColor =
    edge.type === "temporal"
      ? "#ffab00"
      : edge.type === "confounded"
        ? "#ff6d00"
        : "#00e5ff";

  const typeLabel =
    edge.type === "temporal"
      ? "TEMPORAL"
      : edge.type === "confounded"
        ? "CONFOUNDED"
        : "DIRECTED";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.15 }}
      className="absolute bottom-16 left-1/2 -translate-x-1/2 z-50 w-[420px] rounded border border-border bg-background/95 backdrop-blur-sm shadow-2xl"
      style={{ boxShadow: `0 0 20px ${typeColor}15` }}
    >
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="text-[9px] font-[family-name:var(--font-michroma)] tracking-[0.15em] text-text-muted">
          CAUSAL LINK INSPECTOR
        </div>
        <button
          onClick={onClose}
          className="text-[10px] font-mono text-text-muted hover:text-foreground transition-colors"
        >
          ESC
        </button>
      </div>
      <div className="px-4 py-3 space-y-3">
        {/* Source → Target */}
        <div className="flex items-center gap-2 text-[10px] font-mono">
          <span className="text-accent-cyan">{sourceLabel}</span>
          <span className="text-text-muted">{"\u2192"}</span>
          <span className="text-accent-cyan">{targetLabel}</span>
        </div>

        {/* Physical Mechanism */}
        {edge.physicalMechanism && (
          <div>
            <div className="text-[8px] font-[family-name:var(--font-michroma)] tracking-wider text-text-muted mb-1">
              PHYSICAL MECHANISM
            </div>
            <div className="text-[10px] font-mono text-foreground/90 leading-relaxed">
              {edge.physicalMechanism}
            </div>
          </div>
        )}

        {/* Stats row */}
        <div className="flex gap-4">
          <div>
            <div className="text-[8px] font-[family-name:var(--font-michroma)] tracking-wider text-text-muted">TYPE</div>
            <div
              className="text-[10px] font-mono mt-0.5"
              style={{ color: typeColor }}
            >
              {typeLabel}
            </div>
          </div>
          <div>
            <div className="text-[8px] font-[family-name:var(--font-michroma)] tracking-wider text-text-muted">WEIGHT</div>
            <div className="text-[10px] font-mono text-foreground mt-0.5">
              {edge.weight.toFixed(2)}
            </div>
          </div>
          <div>
            <div className="text-[8px] font-[family-name:var(--font-michroma)] tracking-wider text-text-muted">CONFIDENCE</div>
            <div className="text-[10px] font-mono text-foreground mt-0.5">
              {(edge.confidence * 100).toFixed(0)}%
            </div>
          </div>
          <div>
            <div className="text-[8px] font-[family-name:var(--font-michroma)] tracking-wider text-text-muted">LAG</div>
            <div className="text-[10px] font-mono text-foreground mt-0.5">
              {edge.lag === 0 ? "sync" : `t+${edge.lag}`}
            </div>
          </div>
          {edge.isInconsistent && (
            <div>
              <div className="text-[8px] font-[family-name:var(--font-michroma)] tracking-wider text-text-muted">STATUS</div>
              <div className="text-[10px] font-mono text-accent-red mt-0.5">
                INCONSISTENT
              </div>
            </div>
          )}
        </div>

        {/* Confidence bar */}
        <div>
          <div className="h-1 rounded-full bg-surface overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${edge.confidence * 100}%`,
                backgroundColor: typeColor,
                opacity: 0.7,
              }}
            />
          </div>
        </div>

        {/* AUTO-BRIDGE — rendered when this edge was minted by the
            cross-domain auto-bridging pass (id prefix "auto-bridge").
            The amber color matches the RELEVANT NOW callout for the
            same edges in the right panel. */}
        {isAutoBridge(edge) && (
          <div className="pt-2 border-t border-border/50">
            <div className="flex items-center justify-between mb-1">
              <div className="text-[8px] font-[family-name:var(--font-michroma)] tracking-wider text-text-muted">
                AUTO-BRIDGE
              </div>
              <div className="text-[8px] font-[family-name:var(--font-michroma)] tracking-wider tabular-nums text-accent-amber">
                HEURISTIC · UNVERIFIED
              </div>
            </div>
            <div className="text-[10px] font-mono text-foreground/90 leading-relaxed">
              Heuristically proposed cross-domain link — added so SPIRTES&#39;s
              centrality / community / cascade metrics see a connected graph.
              Confidence 0.5 (below R-04&#39;s 0.7 cutoff by design) so this
              edge surfaces as FLAGGED until verified or curator-promoted.
            </div>
            {(() => {
              const score = extractAutoBridgeScore(edge.physicalMechanism);
              if (score === null) return null;
              return (
                <div className="mt-1.5 flex gap-4 text-[10px] font-mono tabular-nums">
                  <div>
                    <span className="text-text-muted">SCORE </span>
                    <span className="text-accent-amber">
                      {score.toFixed(2)}
                    </span>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* χ★ membership — only rendered when this edge is in χ★.
            The violet color (#7B68EE) matches the canvas halo + the
            chi-star color in the criticality registry. */}
        {chiStarInfo && (
          <div className="pt-2 border-t border-border/50">
            <div className="flex items-center justify-between mb-1">
              <div className="text-[8px] font-[family-name:var(--font-michroma)] tracking-wider text-text-muted">
                χ★ BRIDGE SET
              </div>
              <div
                className="text-[8px] font-[family-name:var(--font-michroma)] tracking-wider tabular-nums"
                style={{ color: "#7B68EE" }}
              >
                {chiStarInfo.isBridge ? "STRICT BRIDGE" : "TOP-BES"}
              </div>
            </div>
            <div className="text-[10px] font-mono text-foreground/90 leading-relaxed">
              {chiStarInfo.isBridge
                ? "Removing this edge disconnects the (undirected) graph — every cascade path between the two resulting components must traverse it."
                : "High Bridge-Edge Strength — participates in many shortest paths even though removing it doesn't formally disconnect the graph."}
            </div>
            <div className="mt-1.5 flex gap-4 text-[10px] font-mono tabular-nums">
              <div>
                <span className="text-text-muted">BES </span>
                <span style={{ color: "#7B68EE" }}>
                  {chiStarInfo.bes.toFixed(3)}
                </span>
              </div>
              {chiStarInfo.rank !== null && chiStarInfo.totalEdges > 0 && (
                <div>
                  <span className="text-text-muted">RANK </span>
                  <span className="text-foreground">
                    {chiStarInfo.rank + 1} / {chiStarInfo.totalEdges}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
