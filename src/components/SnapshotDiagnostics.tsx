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
import { useApexStore } from "@/stores/useApexStore";
import { cvarW1, tailDepthScore } from "@/lib/estimators/cvar-w1";
import { omegaBridgeDensity } from "@/lib/estimators/omega-bridge-density";
import { resolveDomainProfile } from "@/lib/domain-profiles";
import { computeFR } from "@/lib/discovery/fr-estimator";
import {
  computeOmegaForgettingPressure,
  peakPressure,
} from "@/lib/discovery/omega-forgetting-pressure";
import { forgettingPressureBand } from "@/lib/omega-forgetting-pressure-display";
import {
  AI_SAFETY_DEMO_EXPOSURE,
  buildAISafetyDemoTrace,
} from "@/lib/discovery/ai-safety-demo-trace";
import { loadTrainingTraceFromJSON } from "@/lib/discovery/training-trace-json-adapter";
import { loadTrainingTraceFromCSV } from "@/lib/discovery/training-trace-csv-adapter";
import { TrainingTraceValidationError } from "@/lib/discovery/training-trace-validator";
import CapabilityBadge from "./CapabilityBadge";

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
  const selectedDomains = useApexStore((s) => s.selectedDomains);
  const loadedTrainingTrace = useApexStore((s) => s.loadedTrainingTrace);
  const setLoadedTrainingTrace = useApexStore((s) => s.setLoadedTrainingTrace);
  const isAISafety = useMemo(
    () => resolveDomainProfile(selectedDomains).id === "ai-safety",
    [selectedDomains],
  );
  const [expanded, setExpanded] = useState<
    "tail" | "topology" | "forgetting" | null
  >(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Ω-Forgetting Pressure — AI-domain-only diagnostic. Prefers the
  // user-uploaded trace (Phase 3 PR 5 ingesters) when present; falls
  // back to the synthetic demo trace when nothing is loaded. The
  // SYNTHETIC badge follows `result.sourceKind`, so the surface
  // automatically flips to LIVE the moment a customer-uploaded trace
  // is set in the store.
  const forgetting = useMemo(() => {
    if (!isAISafety) return null;
    const trace = loadedTrainingTrace ?? buildAISafetyDemoTrace();
    const fr = computeFR(trace);
    const result = computeOmegaForgettingPressure(fr, {
      // Apply the canonical AI Safety exposure only on the demo trace.
      // For customer-uploaded traces we have no information about
      // their production exposure mix — fall through to uniform.
      exposure: loadedTrainingTrace ? undefined : AI_SAFETY_DEMO_EXPOSURE,
    });
    const peak = peakPressure(result);
    return {
      result,
      band: forgettingPressureBand(result.pressure),
      peak,
      taskCount: fr.tasks.length,
      epochCount: trace.epochs.length,
      isUserTrace: loadedTrainingTrace !== null,
    };
  }, [isAISafety, loadedTrainingTrace]);

  // ── File-picker handler — JSON or CSV based on extension. ──────
  const onTraceFile = (file: File | null) => {
    if (!file) return;
    setLoadError(null);
    const reader = new FileReader();
    reader.onerror = () =>
      setLoadError("Could not read file (FileReader error).");
    reader.onload = () => {
      const text = String(reader.result ?? "");
      try {
        if (file.name.toLowerCase().endsWith(".json")) {
          const trace = loadTrainingTraceFromJSON(text);
          setLoadedTrainingTrace(trace);
        } else if (file.name.toLowerCase().endsWith(".csv")) {
          // For CSV we need explicit task refs. Pre-PR-6 the customer
          // must use the JSON path if they want richer metadata.
          // Default heuristic: scan the header for `acc_<id>` columns.
          const header = text.split(/\r?\n/)[0] ?? "";
          const taskIds = header
            .split(",")
            .map((c) => c.trim())
            .filter((c) => c.startsWith("acc_"))
            .map((c) => c.slice("acc_".length));
          if (taskIds.length === 0) {
            throw new TrainingTraceValidationError(
              "CSV header must contain at least one acc_<task_id> column",
            );
          }
          const trace = loadTrainingTraceFromCSV(text, {
            id: file.name.replace(/\.[^.]+$/, ""),
            label: file.name,
            tasks: taskIds.map((id) => ({
              id,
              label: id,
              scope: "attack-class" as const,
            })),
          });
          setLoadedTrainingTrace(trace);
        } else {
          setLoadError(
            `Unsupported extension on "${file.name}". Use .json or .csv.`,
          );
        }
      } catch (err) {
        const msg =
          err instanceof TrainingTraceValidationError
            ? err.message
            : err instanceof SyntaxError
              ? `Invalid JSON: ${err.message}`
              : err instanceof Error
                ? err.message
                : "Failed to parse training trace.";
        setLoadError(msg);
      }
    };
    reader.readAsText(file);
  };

  // Tail Depth — empirical α-CVaR over the per-node ΩF composite
  // distribution of the live filtered graph. α = 0.9 standard.
  //
  // The expanded view now renders a histogram of `samples` with the
  // α-VaR threshold marked and the tail bins shaded, so the analyst
  // can see the *shape* of the distribution that CVaR-W₁ summarises
  // — not just a scalar. Carries `samples` through here for the
  // expansion render.
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
      samples,
      varEmpirical: r.varEmpirical,
      empirical: r.empirical,
      robust: r.robust,
      pillarScore,
      band: tailBand(pillarScore),
    };
  }, [graph]);

  // Topology — χ★ on the live filtered graph (severed edges
  // excluded so user-driven cuts are reflected immediately).
  //
  // Carries `besRanking` (top-K) and `bridgeIds` through so the
  // expansion can render a ranked list ("which specific edges are
  // load-bearing"), not just the count. Same data feeds the canvas
  // violet diamond markers from PR #329 — surfacing it as a list
  // here means the analyst can name the bridges without having to
  // hover-pick them on the 3D canvas.
  const topo = useMemo(() => {
    const liveEdges = graph.edges.filter((e) => !e.isSevered);
    if (liveEdges.length === 0) return { ok: false as const, edgeCount: 0 };
    const obd = omegaBridgeDensity({ ...graph, edges: liveEdges });
    const top = obd.chiStar.besRanking[0];
    const bridgeIds = new Set(obd.chiStar.bridges);
    return {
      ok: true as const,
      edgeCount: liveEdges.length,
      chiStarSize: obd.chiStarSize,
      bridgeCount: obd.chiStar.bridges.length,
      density: obd.density,
      bridgeFraction: obd.bridgeFraction,
      topBes: top,
      besRanking: obd.chiStar.besRanking,
      bridgeIds,
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

      {/* ── Ω-Forgetting Pressure (AI Safety only) ───────────────── */}
      {forgetting && (
        <button
          onClick={() =>
            setExpanded(expanded === "forgetting" ? null : "forgetting")
          }
          className="w-full text-left p-2 rounded border transition-all"
          style={{
            borderColor:
              expanded === "forgetting"
                ? forgetting.band.color
                : "var(--border)",
            backgroundColor: "var(--surface)",
          }}
        >
          <div className="flex items-center justify-between gap-1">
            <span className="text-[8px] font-[family-name:var(--font-michroma)] tracking-wider text-text-muted">
              FORGETTING · Ω-FP
            </span>
            <div className="flex items-center gap-1.5">
              {forgetting.result.sourceKind === "synthetic" ? (
                <CapabilityBadge capability="live-synthetic" />
              ) : (
                <CapabilityBadge capability="live" labelOverride="LIVE" />
              )}
              {Number.isFinite(forgetting.result.pressure) && (
                <span
                  className="text-[8px] font-[family-name:var(--font-michroma)] tabular-nums font-bold"
                  style={{ color: forgetting.band.color }}
                >
                  {forgetting.band.label}
                </span>
              )}
            </div>
          </div>
          <div className="mt-1.5 flex items-baseline gap-2">
            {Number.isFinite(forgetting.result.pressure) ? (
              <>
                <span
                  className="text-[20px] font-[family-name:var(--font-michroma)] tabular-nums leading-none"
                  style={{ color: forgetting.band.color }}
                >
                  {forgetting.result.pressure.toFixed(3)}
                </span>
                <span className="text-[9px] font-mono text-text-muted/70">
                  Σ exposure · FR · {forgetting.taskCount} tasks ·{" "}
                  {forgetting.epochCount} epochs
                </span>
              </>
            ) : (
              <span className="text-[10px] font-mono text-text-muted">
                NO TRAINING TRACE
              </span>
            )}
          </div>
        </button>
      )}

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
          {/* ΩF distribution histogram with the α-tail shaded. Lets
              the analyst see the SHAPE that CVaR is summarising — a
              long-tailed distribution vs a tight cluster around the
              same VaR threshold tell very different stories about
              tail risk, even when their CVaR_α reads the same. */}
          <CvarHistogram
            samples={tail.samples}
            varThreshold={tail.varEmpirical}
            tailColor={tail.band.color}
          />
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
            {topo.bridgeFraction.toFixed(3)}
          </div>
          {/* Top-5 ranked bridges with their BES values. Surfaces the
              actual edges driving the χ★ summary so the analyst can
              name them ("FAB_TW → GRID_USA is the load-bearing
              connection") instead of just seeing a count. Matches the
              same data the canvas violet diamond markers (PR #329)
              render — surfacing it here means an analyst can read the
              ranked list without hover-picking on 3D. */}
          {topo.besRanking.length > 0 && (
            <div className="space-y-0.5 pt-1">
              <div className="text-[8px] font-[family-name:var(--font-michroma)] tracking-wider text-text-muted">
                TOP {Math.min(5, topo.besRanking.length)} BY BES
              </div>
              {topo.besRanking.slice(0, 5).map((entry) => {
                const isBridge = topo.bridgeIds.has(entry.edgeId);
                return (
                  <div
                    key={entry.edgeId}
                    className="font-mono text-[9px] text-foreground tabular-nums flex items-center gap-2"
                  >
                    <span
                      className="text-[7px] px-1 rounded shrink-0"
                      style={{
                        color: "#7B68EE",
                        backgroundColor: isBridge
                          ? "rgba(123,104,238,0.18)"
                          : "rgba(123,104,238,0.08)",
                        border: `1px solid rgba(123,104,238,${isBridge ? 0.5 : 0.25})`,
                      }}
                    >
                      {isBridge ? "BRIDGE" : "TOP-BES"}
                    </span>
                    <span className="text-text-muted truncate flex-1 min-w-0">
                      {entry.edgeId}
                    </span>
                    <span className="text-foreground shrink-0">
                      {entry.bes.toFixed(3)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          <div className="text-[8px] font-mono text-text-muted/70 leading-relaxed">
            χ★ edges render as violet diamond markers on the 3D / 2D /
            Map canvas. Click any of them to drill into the
            EdgeInspector. Source: Ghauri 2025 (D.Eng., Ch. 5–8 — IDS
            substrate + topology-aware replay).
          </div>
        </div>
      )}

      {expanded === "forgetting" &&
        forgetting &&
        Number.isFinite(forgetting.result.pressure) && (
          <div className="p-3 rounded border border-border bg-surface space-y-2">
            <div className="text-[9px] font-mono text-text-muted leading-relaxed">
              <span className="text-foreground">
                {forgetting.band.tooltip}
              </span>
            </div>
            <div className="text-[9px] font-mono text-text-muted leading-relaxed">
              Ω-FP = Σ<sub>k</sub> exposure<sub>k</sub> · normalizedFR
              <sub>k</sub> on the canonical AI Safety IDS demo trace
              (DDoS / MITM / Heartbleed curriculum,{" "}
              {forgetting.epochCount} epochs). Peak Ω-FP ={" "}
              {Number.isFinite(forgetting.peak.value)
                ? forgetting.peak.value.toFixed(3)
                : "—"}
              {forgetting.peak.epochIndex >= 0 && (
                <> at epoch {forgetting.peak.epochIndex}</>
              )}
              .
            </div>
            <div className="space-y-0.5">
              <div className="text-[8px] font-[family-name:var(--font-michroma)] tracking-wider text-text-muted">
                TOP CONTRIBUTORS
              </div>
              {forgetting.result.contributions.slice(0, 3).map((c) => (
                <div
                  key={c.taskId}
                  className="font-mono text-[9px] text-foreground tabular-nums flex items-center gap-2"
                >
                  <span className="text-text-muted">{c.taskId}</span>
                  <span className="text-text-muted/70">
                    exp {c.exposure.toFixed(2)} · FR{" "}
                    {c.normalizedFR.toFixed(3)} →{" "}
                  </span>
                  <span className="text-foreground">
                    {c.contribution.toFixed(3)}
                  </span>
                </div>
              ))}
            </div>
            <div className="text-[8px] font-mono text-text-muted/70 leading-relaxed">
              {forgetting.isUserTrace ? (
                <>
                  LIVE trace · ingested from{" "}
                  <span className="text-foreground">
                    {forgetting.result.traceId}
                  </span>{" "}
                  via the {forgetting.result.sourceKind} adapter path.
                  Uniform exposure applied — pass a per-task exposure
                  vector via the API to weight tasks differently.
                </>
              ) : (
                <>
                  SYNTHETIC trace — no customer business decision runs
                  off this reading. Load a live PyTorch / TF training-
                  log CSV or JSON to flip the badge to LIVE. Source:
                  Ghauri 2025 (D.Eng., Ch. 8 — catastrophic forgetting
                  in continual-learning IDS).
                </>
              )}
            </div>
            {/* Load / clear controls — Phase 3 PR 5 ingester surface. */}
            <div className="pt-2 border-t border-border/40 space-y-1.5">
              <div className="flex items-center gap-2">
                <label className="inline-flex items-center gap-1.5 cursor-pointer text-[8px] font-[family-name:var(--font-michroma)] tracking-wider text-text-muted hover:text-foreground transition-colors">
                  <span className="px-1.5 py-0.5 rounded border border-border bg-surface">
                    LOAD TRACE…
                  </span>
                  <input
                    type="file"
                    accept=".json,.csv,application/json,text/csv"
                    className="hidden"
                    onChange={(e) => {
                      onTraceFile(e.target.files?.[0] ?? null);
                      // Reset so the same file can be re-selected.
                      e.target.value = "";
                    }}
                  />
                </label>
                <span className="text-[8px] font-mono text-text-muted/70">
                  .json (TrainingTrace schema) · .csv (epoch + acc_&lt;id&gt;
                  columns)
                </span>
                {forgetting.isUserTrace && (
                  <button
                    onClick={() => {
                      setLoadedTrainingTrace(null);
                      setLoadError(null);
                    }}
                    className="ml-auto text-[8px] font-[family-name:var(--font-michroma)] tracking-wider text-text-muted hover:text-foreground transition-colors px-1.5 py-0.5 rounded border border-border"
                  >
                    CLEAR
                  </button>
                )}
              </div>
              {loadError && (
                <div className="text-[8px] font-mono text-[#ff7043] leading-relaxed">
                  {loadError}
                </div>
              )}
            </div>
          </div>
        )}
    </div>
  );
}

/**
 * Small SVG histogram of the ΩF composite distribution. Bins above
 * the α-VaR threshold are shaded with the band color (the same tier
 * color used in the headline tile) so the "tail that CVaR averages"
 * reads as a visually distinct region. Below-threshold bins use a
 * muted slate so they're visible but don't compete.
 *
 * The histogram is the answer to "what does CVaR-W₁ collapse?". A
 * tight cluster around 7.5 with a single 9.9 outlier and a spread
 * cluster from 4 to 9 can both yield CVaR_α ≈ 9.0; only the
 * histogram tells the analyst which world they're in.
 *
 * Implementation notes:
 *  - Bin count adapts to sample size (clamped to [10, 24]) so small
 *    samples don't degenerate into a saw-tooth and large ones don't
 *    smear into a near-continuous gradient.
 *  - Drawn as inline SVG <rect>s — no chart library, no dependency.
 *  - The threshold line is dashed so it's distinguishable from bin
 *    boundaries even when it lands close to one.
 */
function CvarHistogram({
  samples,
  varThreshold,
  tailColor,
}: {
  samples: ReadonlyArray<number>;
  varThreshold: number;
  tailColor: string;
}) {
  const W = 280;
  const H = 60;
  const PAD_X = 4;
  const PAD_Y = 4;
  const chartW = W - PAD_X * 2;
  const chartH = H - PAD_Y * 2;

  const { bins, max, lo, hi, thresholdX } = useMemo(() => {
    if (samples.length === 0) {
      return { bins: [] as number[], max: 0, lo: 0, hi: 1, thresholdX: 0 };
    }
    let lo = Infinity;
    let hi = -Infinity;
    for (const v of samples) {
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi - lo < 1e-9) {
      // Degenerate: all samples equal. Render one tall bin.
      return {
        bins: [samples.length],
        max: samples.length,
        lo,
        hi: lo + 1,
        thresholdX: 0,
      };
    }
    // Adaptive bin count: Sturges-ish for small n, capped for large.
    const binCount = Math.max(10, Math.min(24, Math.ceil(Math.log2(samples.length) + 4)));
    const bins = new Array<number>(binCount).fill(0);
    for (const v of samples) {
      const u = (v - lo) / (hi - lo);
      const idx = Math.min(binCount - 1, Math.max(0, Math.floor(u * binCount)));
      bins[idx]++;
    }
    let max = 0;
    for (const c of bins) if (c > max) max = c;
    const tx =
      PAD_X +
      ((Math.max(lo, Math.min(hi, varThreshold)) - lo) / (hi - lo)) * chartW;
    return { bins, max, lo, hi, thresholdX: tx };
  }, [samples, varThreshold, chartW]);

  if (bins.length === 0 || max === 0) return null;

  const binW = chartW / bins.length;

  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between">
        <div className="text-[7px] font-[family-name:var(--font-michroma)] tracking-wider text-text-muted">
          ΩF DISTRIBUTION · n={samples.length}
        </div>
        <div className="text-[7px] font-mono text-text-muted/70 tabular-nums">
          {lo.toFixed(1)} – {hi.toFixed(1)}
        </div>
      </div>
      <svg
        width="100%"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="block"
        role="img"
        aria-label={`ΩF composite distribution with α-tail shaded above ${varThreshold.toFixed(2)}`}
      >
        {/* Tail-region background tint to anchor the eye on the
            distribution region above the VaR threshold. Drawn before
            the bars so the bars sit on top. */}
        {thresholdX < PAD_X + chartW && (
          <rect
            x={thresholdX}
            y={PAD_Y}
            width={PAD_X + chartW - thresholdX}
            height={chartH}
            fill={tailColor}
            opacity={0.07}
          />
        )}
        {bins.map((c, i) => {
          if (c === 0) return null;
          const x = PAD_X + i * binW;
          const h = (c / max) * chartH;
          const y = PAD_Y + chartH - h;
          // Bin center value to decide tail vs body coloring. The
          // boundary case (exactly at threshold) goes into the tail
          // bucket — matches CVaR's "≥ VaR" semantics.
          const binCenter = lo + ((i + 0.5) / bins.length) * (hi - lo);
          const isTail = binCenter >= varThreshold;
          return (
            <rect
              key={i}
              x={x + 0.5}
              y={y}
              width={Math.max(0.5, binW - 1)}
              height={h}
              fill={isTail ? tailColor : "#5a5e72"}
              opacity={isTail ? 0.85 : 0.55}
            />
          );
        })}
        {/* α-VaR threshold marker — dashed vertical so it's
            distinguishable from a bin boundary. */}
        <line
          x1={thresholdX}
          x2={thresholdX}
          y1={PAD_Y}
          y2={PAD_Y + chartH}
          stroke={tailColor}
          strokeWidth={1}
          strokeDasharray="2 2"
          opacity={0.9}
        />
      </svg>
      <div className="text-[7px] font-mono text-text-muted/70 leading-tight">
        Bins ≥ α-VaR={varThreshold.toFixed(2)} are shaded — that's
        the worst-tail mass CVaR_α averages.
      </div>
    </div>
  );
}
