"use client";

// Snapshot Diagnostics panel — surfaces the dissertation's two
// non-temporal estimators side-by-side, both reading the live
// filtered graph that the canvas + the system-metrics strip already
// share.
//
// Why a separate panel from the Pareto criticality strip: the four
// strip estimators (CSD / PH / LPPLS / BOCPD) all fit the same shape
// — observed-vs-model fit on a Ω-trajectory with an "epochs to
// critical" reading. CVaR-W₁ and χ★ are SNAPSHOT estimators; they
// read the per-node ΩF distribution / graph topology in one shot,
// with no time axis and no model fit. Forcing them into the same
// strip required synthesising fake "epochs" readings (the T-77
// reading users were seeing on the χ★ tab was just `(1 - density)
// × 100` — not a meaningful time-to-critical, just a topology
// summary stretched into the wrong UI mold).
//
// Whole-system primary readout for both, matching what the math
// estimators actually compute. Per-node drill-downs live in the
// node / edge inspectors.

import { useMemo, useState } from "react";
import { useFilteredGraph } from "@/hooks/useFilteredGraph";
import { cvarW1, tailDepthScore } from "@/lib/estimators/cvar-w1";
import { omegaBridgeDensity } from "@/lib/estimators/omega-bridge-density";

type Band = {
  label: string;
  color: string;
  description: string;
};

function tailBand(pillarScore: number): Band {
  if (pillarScore >= 8)
    return {
      label: "CRITICAL TAIL",
      color: "#ff1744",
      description:
        "Worst-α tail in the high-fragility band. Significant probability mass on outcomes that would dominate ΩF.",
    };
  if (pillarScore >= 5)
    return {
      label: "ELEVATED TAIL",
      color: "var(--accent-amber)",
      description:
        "Worst-α tail sits above the median ΩF. Worth monitoring; the tail is not yet critical but it's not contained either.",
    };
  return {
    label: "CONTAINED TAIL",
    color: "var(--accent-green)",
    description:
      "Worst-α tail stays in the lower-fragility regime. Tail risk is bounded for the current configuration.",
  };
}

function topologyBand(density: number): Band {
  if (density > 0.6)
    return {
      label: "FRAGILE",
      color: "#ff1744",
      description:
        "Near-tree topology. Most edges sit in χ★, so removing any of them fragments cascade pathways. Investigate redundancy.",
    };
  if (density > 0.3)
    return {
      label: "ELEVATED",
      color: "var(--accent-amber)",
      description:
        "Elevated chokepoint concentration. More edges than typical fall in χ★; the graph has bridge-like structure to monitor.",
    };
  if (density < 0.05)
    return {
      label: "REDUNDANT",
      color: "var(--accent-green)",
      description:
        "Cycle-rich, highly redundant. Few chokepoints; alternate paths absorb most disruptions.",
    };
  return {
    label: "NOMINAL",
    color: "var(--accent-green)",
    description:
      "Well-connected with some critical chokepoints. Typical regime for real causal graphs.",
  };
}

export default function SnapshotDiagnostics() {
  const graph = useFilteredGraph();
  const [expanded, setExpanded] = useState<"tail" | "topology" | null>(null);

  // Tail Depth — empirical α-CVaR over the per-node ΩF composite
  // distribution of the live filtered graph. α = 0.9 standard.
  const tail = useMemo(() => {
    const samples = graph.nodes
      .map((n) => n.omegaFragility?.composite)
      .filter(
        (v): v is number => typeof v === "number" && !Number.isNaN(v),
      );
    if (samples.length < 5) return { ok: false as const, n: samples.length };
    const alpha = 0.9;
    const r = cvarW1(samples, { alpha, radius: 0 });
    const pillarScore = tailDepthScore(r.empirical, 0, 10);
    return {
      ok: true as const,
      alpha,
      n: samples.length,
      varEmpirical: r.varEmpirical,
      empirical: r.empirical,
      robust: r.robust,
      pillarScore,
      band: tailBand(pillarScore),
    };
  }, [graph]);

  // Topology — χ★ on the live filtered graph (severed edges
  // excluded so user-driven cuts are reflected immediately).
  const topo = useMemo(() => {
    const liveEdges = graph.edges.filter((e) => !e.isSevered);
    if (liveEdges.length === 0) return { ok: false as const, edgeCount: 0 };
    const obd = omegaBridgeDensity({ ...graph, edges: liveEdges });
    const top = obd.chiStar.besRanking[0];
    return {
      ok: true as const,
      edgeCount: liveEdges.length,
      chiStarSize: obd.chiStarSize,
      bridgeCount: obd.chiStar.bridges.length,
      density: obd.density,
      bridgeFraction: obd.bridgeFraction,
      topBes: top,
      band: topologyBand(obd.density),
    };
  }, [graph]);

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <div className="font-[family-name:var(--font-michroma)] text-[10px] tracking-wider text-text-muted">
          SNAPSHOT DIAGNOSTICS
        </div>
        <div className="font-mono text-[8px] text-text-muted/70">
          Ghauri 2025 · whole-system
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {/* ── Tail Depth (CVaR-W₁) ─────────────────────────── */}
        <button
          onClick={() => setExpanded(expanded === "tail" ? null : "tail")}
          className="text-left p-2 rounded border transition-all"
          style={{
            borderColor:
              expanded === "tail"
                ? tail.ok
                  ? tail.band.color
                  : "var(--border)"
                : "var(--border)",
            backgroundColor: "var(--surface)",
          }}
        >
          <div className="flex items-center justify-between gap-1">
            <span className="text-[8px] font-[family-name:var(--font-michroma)] tracking-wider text-text-muted">
              TAIL · CVaR-W₁
            </span>
            {tail.ok && (
              <span
                className="text-[8px] font-[family-name:var(--font-michroma)] tabular-nums font-bold"
                style={{ color: tail.band.color }}
              >
                {tail.band.label}
              </span>
            )}
          </div>
          <div className="mt-1.5 flex items-baseline gap-2">
            {tail.ok ? (
              <>
                <span
                  className="text-[20px] font-[family-name:var(--font-michroma)] tabular-nums leading-none"
                  style={{ color: tail.band.color }}
                >
                  {tail.pillarScore.toFixed(1)}
                </span>
                <span className="text-[9px] font-mono text-text-muted/70">
                  / 10 · α={tail.alpha} · n={tail.n}
                </span>
              </>
            ) : (
              <span className="text-[10px] font-mono text-text-muted">
                INSUFFICIENT DATA · n={tail.n} (need ≥ 5)
              </span>
            )}
          </div>
        </button>

        {/* ── Topology (χ★) ────────────────────────────────── */}
        <button
          onClick={() => setExpanded(expanded === "topology" ? null : "topology")}
          className="text-left p-2 rounded border transition-all"
          style={{
            borderColor:
              expanded === "topology"
                ? topo.ok
                  ? topo.band.color
                  : "var(--border)"
                : "var(--border)",
            backgroundColor: "var(--surface)",
          }}
        >
          <div className="flex items-center justify-between gap-1">
            <span className="text-[8px] font-[family-name:var(--font-michroma)] tracking-wider text-text-muted">
              TOPOLOGY · χ★
            </span>
            {topo.ok && (
              <span
                className="text-[8px] font-[family-name:var(--font-michroma)] tabular-nums font-bold"
                style={{ color: topo.band.color }}
              >
                {topo.band.label}
              </span>
            )}
          </div>
          <div className="mt-1.5 flex items-baseline gap-2">
            {topo.ok ? (
              <>
                <span
                  className="text-[20px] font-[family-name:var(--font-michroma)] tabular-nums leading-none"
                  style={{ color: topo.band.color }}
                >
                  {topo.density.toFixed(3)}
                </span>
                <span className="text-[9px] font-mono text-text-muted/70">
                  |χ★| = {topo.chiStarSize} / {topo.edgeCount}
                </span>
              </>
            ) : (
              <span className="text-[10px] font-mono text-text-muted">
                NO LIVE EDGES
              </span>
            )}
          </div>
        </button>
      </div>

      {/* Expanded detail ─────────────────────────────────────── */}
      {expanded === "tail" && tail.ok && (
        <div className="p-3 rounded border border-border bg-surface space-y-2">
          <div className="text-[9px] font-mono text-text-muted leading-relaxed">
            <span className="text-foreground">{tail.band.description}</span>
          </div>
          <div className="text-[9px] font-mono text-text-muted leading-relaxed">
            Empirical α-CVaR on n={tail.n} ΩF composite values across
            the live filtered graph. α = {tail.alpha}, so CVaR_α is the
            expected ΩF in the worst {((1 - tail.alpha) * 100).toFixed(0)}% tail.
          </div>
          <div className="font-mono text-[9px] text-foreground tabular-nums">
            α-VaR = {tail.varEmpirical.toFixed(3)} · empirical CVaR ={" "}
            {tail.empirical.toFixed(3)} · robust CVaR ={" "}
            {tail.robust.toFixed(3)} · pillar = {tail.pillarScore.toFixed(2)}/10
          </div>
          <div className="text-[8px] font-mono text-text-muted/70 leading-relaxed">
            W₁ ambiguity radius ε = 0 — no calibrated radius wired
            upstream yet, so robust collapses to empirical for now.
            Source: Ghauri 2025 (D.Eng., Ch. 4 §3 — Ω-Robustness).
          </div>
        </div>
      )}

      {expanded === "topology" && topo.ok && (
        <div className="p-3 rounded border border-border bg-surface space-y-2">
          <div className="text-[9px] font-mono text-text-muted leading-relaxed">
            <span className="text-foreground">{topo.band.description}</span>
          </div>
          <div className="text-[9px] font-mono text-text-muted leading-relaxed">
            χ★ = strict bridges (Tarjan) ∪ top-k Bridge-Edge Strength
            (Brandes) on {graph.nodes.length} nodes / {topo.edgeCount}{" "}
            non-severed edges. Found {topo.bridgeCount} strict bridges
            and {topo.chiStarSize - topo.bridgeCount} top-BES additions.
          </div>
          <div className="font-mono text-[9px] text-foreground tabular-nums">
            density = {topo.density.toFixed(3)} · bridge-fraction ={" "}
            {topo.bridgeFraction.toFixed(3)} · top BES ={" "}
            {topo.topBes ? topo.topBes.bes.toFixed(3) : "—"}
            {topo.topBes && (
              <>
                {" "}on <span className="text-text-muted">{topo.topBes.edgeId}</span>
              </>
            )}
          </div>
          <div className="text-[8px] font-mono text-text-muted/70 leading-relaxed">
            χ★ edges render with a violet halo on the 3D / 2D canvas.
            Source: Ghauri 2025 (D.Eng., Ch. 5–8 — IDS substrate +
            topology-aware replay).
          </div>
        </div>
      )}
    </div>
  );
}
