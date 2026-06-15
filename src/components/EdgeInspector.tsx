"use client";

import { motion } from "framer-motion";
import type { CausalEdge, EdgeAttributeSource } from "@/lib/types";
import {
  EDGE_SOURCE_COLOR,
  EDGE_SOURCE_DESCRIPTION,
  EDGE_SOURCE_LABEL,
  hasProvenanceDetail,
} from "@/lib/edge-provenance";
import { resolveEdgeSource } from "@/lib/edge-provenance-registry";
import {
  extractAutoBridgeScore,
  bridgeStatus,
} from "@/lib/cross-domain-bridging";
import { useApexStore } from "@/stores/useApexStore";

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
  const promoteAutoBridge = useApexStore((s) => s.promoteAutoBridge);
  const status = bridgeStatus(edge);
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

  // Resolve provenance once. Inline source wins; else a registry ref is
  // expanded against the edge-provenance catalog; else missing fields fall
  // back to author so the analyst always sees *some* signal — silence would
  // be a worse UX than a muted AUTHOR badge.
  const weightSource = resolveEdgeSource(
    edge.weightSource,
    edge.weightSourceRef,
  );
  const confidenceSource = resolveEdgeSource(
    edge.confidenceSource,
    edge.confidenceSourceRef,
  );

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
            <div className="text-[10px] font-mono text-foreground mt-0.5 flex items-center gap-1.5">
              <span>{edge.weight.toFixed(2)}</span>
              <ProvenanceBadge source={weightSource} />
            </div>
          </div>
          <div>
            <div className="text-[8px] font-[family-name:var(--font-michroma)] tracking-wider text-text-muted">CONFIDENCE</div>
            <div className="text-[10px] font-mono text-foreground mt-0.5 flex items-center gap-1.5">
              <span>{(edge.confidence * 100).toFixed(0)}%</span>
              <ProvenanceBadge source={confidenceSource} />
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

        {/* Provenance block — shown when EITHER source carries detail
            beyond the inline badge (a citation, estimator, R², or note).
            For the common backfill case where both attributes are bare
            authored values, only the inline AUTHOR badges next to the
            stats render — we don't want to scream "audit me" at the
            analyst on every edge in v1. The visual stays the same
            two-tone separator pattern as the χ★ block below. */}
        {(hasProvenanceDetail(weightSource) ||
          hasProvenanceDetail(confidenceSource)) && (
          <div className="pt-2 border-t border-border/50 space-y-2">
            <div className="text-[8px] font-[family-name:var(--font-michroma)] tracking-wider text-text-muted">
              PROVENANCE
            </div>
            {hasProvenanceDetail(weightSource) && (
              <ProvenanceDetail label="WEIGHT" source={weightSource} />
            )}
            {hasProvenanceDetail(confidenceSource) && (
              <ProvenanceDetail label="CONFIDENCE" source={confidenceSource} />
            )}
          </div>
        )}

        {/* AUTO-BRIDGE — rendered when this edge was minted by the
            cross-domain auto-bridging pass (id prefix "auto-bridge").
            The amber color matches the RELEVANT NOW callout for the
            same edges in the right panel. Promoted bridges flip to a
            green-toned "PROMOTED BRIDGE · CONFIRMED" banner with the
            audit trail (original heuristic score) still visible. */}
        {status !== "none" && (
          <div className="pt-2 border-t border-border/50">
            <div className="flex items-center justify-between mb-1">
              <div className="text-[8px] font-[family-name:var(--font-michroma)] tracking-wider text-text-muted">
                {status === "auto" ? "AUTO-BRIDGE" : "PROMOTED BRIDGE"}
              </div>
              <div
                className={`text-[8px] font-[family-name:var(--font-michroma)] tracking-wider tabular-nums ${status === "auto" ? "text-accent-amber" : "text-accent-green"}`}
              >
                {status === "auto" ? "HEURISTIC · UNVERIFIED" : "CONFIRMED"}
              </div>
            </div>
            <div className="text-[10px] font-mono text-foreground/90 leading-relaxed">
              {status === "auto"
                ? "Heuristically proposed cross-domain link — added so SPIRTES's centrality / community / cascade metrics see a connected graph. Confidence 0.5 (below R-04's 0.7 cutoff by design) so this edge surfaces as FLAGGED until verified or promoted."
                : "Originally proposed by the auto-bridging pass, then promoted by the user — confidence lifted to 0.8 so R-04 no longer flags it. Heuristic score retained below as an audit trail."}
            </div>
            {(() => {
              const score = extractAutoBridgeScore(edge.physicalMechanism);
              if (score === null) return null;
              return (
                <div className="mt-1.5 flex gap-4 text-[10px] font-mono tabular-nums">
                  <div>
                    <span className="text-text-muted">SCORE </span>
                    <span
                      className={status === "auto" ? "text-accent-amber" : "text-accent-green"}
                    >
                      {score.toFixed(2)}
                    </span>
                  </div>
                </div>
              );
            })()}
            {status === "auto" && (
              <button
                onClick={() => promoteAutoBridge(edge.id)}
                className="mt-2 w-full px-2 py-1 rounded border border-accent-amber/40 bg-accent-amber/10 hover:bg-accent-amber/20 text-[9px] font-[family-name:var(--font-michroma)] tracking-wider text-accent-amber transition-colors"
              >
                PROMOTE — lift confidence 0.5 → 0.8
              </button>
            )}
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

/**
 * Small colored pill rendered inline next to WEIGHT / CONFIDENCE in the
 * stats row. AUTHOR is intentionally muted gray so it reads as "default,
 * needs audit" rather than competing with the data colors used by the
 * other kinds. Hover tooltip carries the full kind description so the
 * analyst can answer "what does AUTHOR mean here?" without an extra
 * click.
 */
function ProvenanceBadge({ source }: { source: EdgeAttributeSource }) {
  const color = EDGE_SOURCE_COLOR[source.kind];
  const label = EDGE_SOURCE_LABEL[source.kind];
  return (
    <span
      className="text-[7px] font-[family-name:var(--font-michroma)] tracking-wider px-1 py-px rounded border leading-none"
      style={{
        color,
        borderColor: `${color}55`,
        backgroundColor: `${color}10`,
      }}
      title={EDGE_SOURCE_DESCRIPTION[source.kind]}
    >
      {label}
    </span>
  );
}

/**
 * Expanded provenance row for the bottom PROVENANCE block. Only
 * rendered when the source carries detail beyond the kind itself
 * (citation / estimator / R² / note) — otherwise the inline badge
 * alone covers it.
 */
function ProvenanceDetail({
  label,
  source,
}: {
  label: string;
  source: EdgeAttributeSource;
}) {
  const color = EDGE_SOURCE_COLOR[source.kind];
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div className="text-[8px] font-[family-name:var(--font-michroma)] tracking-wider text-text-muted">
          {label}
        </div>
        <ProvenanceBadge source={source} />
      </div>
      <div className="text-[10px] font-mono text-foreground/90 leading-relaxed space-y-0.5">
        {source.citation && (
          <div>
            <span className="text-text-muted">cite </span>
            <span style={{ color }}>{source.citation}</span>
          </div>
        )}
        {source.estimator && (
          <div>
            <span className="text-text-muted">estimator </span>
            <span style={{ color }}>{source.estimator}</span>
          </div>
        )}
        {typeof source.rSquared === "number" && (
          <div>
            <span className="text-text-muted">R² </span>
            <span style={{ color }}>{source.rSquared.toFixed(3)}</span>
          </div>
        )}
        {source.note && (
          <div className="text-foreground/70 italic">{source.note}</div>
        )}
      </div>
    </div>
  );
}
