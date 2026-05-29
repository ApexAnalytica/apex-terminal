"use client";

import { useEffect, useMemo, useState } from "react";
import type { DiscoveryRun } from "@/lib/discovery";
import type { Capability } from "@/lib/capability";
import CapabilityBadge from "./CapabilityBadge";
import { useApexStore } from "@/stores/useApexStore";

// Per-algorithm capability tag. The discovery algorithms are all
// running on the public D1NAMO cohort today; calibration is also live.
// When they switch to real partner-cohort data, these stay "live"; the
// distinction would be encoded as `live-synthetic` on the cohort, not
// the algorithm.
export const CAPABILITY_BY_ALGORITHM: Record<string, Capability> = {
  "lag-correlation": "live",
  "pcmci-linear": "live",
  "fci": "live",
  "notears": "live",
  "notears-mlp": "live",
  "bocpd-hypo-calibration": "live",
  "csd-fit-hypo-calibration": "live",
};

// Calibration algorithm ids — runs whose result.diagnostics carry the
// AUROC / Brier / ECE / reliability-bin shape that CalibrationBlock
// renders, rather than discovered edges.
const CALIBRATION_ALGORITHM_IDS = new Set([
  "bocpd-hypo-calibration",
  "csd-fit-hypo-calibration",
]);

// ─── DiscoveryRunsPanel ──────────────────────────────────────────────
//
// Surfaces a `DiscoveryRun` JSON record (the structure-only audit unit
// produced by the discovery pipeline) inside the SPIRTES module. This
// is where edges learned from real cohort data show up to a viewer for
// the first time — distinct from the curated CausalGraph that the rest
// of the app renders.
//
// Today: loads one hard-coded sample run from `/discovery-runs/`. The
// run record contains only abstract structure (variable ids, edges,
// lags, p-values) — there is no raw measurement data on the wire.
//
// Tomorrow: same component swaps to `/api/discovery/runs/<id>` once
// the API layer lands. The data shape is identical.

const SAMPLE_RUN_URLS = [
  "/discovery-runs/d1namo-lag-correlation-v0-1-0.json",
  "/discovery-runs/d1namo-pcmci-linear-v0-1-0.json",
  "/discovery-runs/d1namo-bocpd-hypo-calibration-v0-1-0.json",
  "/discovery-runs/d1namo-csd-fit-hypo-calibration-v0-1-0.json",
  "/discovery-runs/hall-csd-fit-hypo-calibration-v0-1-0.json",
];

// Short cohort labels for tab rendering. Falls back to cohortId when
// unknown — keeps adding new cohorts low-friction.
const COHORT_SHORT_LABELS: Record<string, string> = {
  "d1namo-2018": "D1NAMO",
  "hall-cgm-2018": "HALL",
};

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; runs: DiscoveryRun[] }
  | { kind: "error"; message: string }
  | { kind: "out-of-scope" };

export default function DiscoveryRunsPanel() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [activeIdx, setActiveIdx] = useState(0);

  // All current sample runs are T1D cohorts (D1NAMO + Hall). If the
  // user hasn't selected any T1D domain, loading them would surface
  // diabetes-flavored discovered edges (cgm_glucose_mgdl → insulin_…)
  // inside what should be a geopolitical / macro / financial session
  // — confusing and out of context. Same `t1d-` prefix convention used
  // by ModulePanel for the Tissue Cohort view; avoids pulling
  // domain-profiles into the critical-path bundle.
  const selectedDomains = useApexStore((s) => s.selectedDomains);
  const isT1DDomain = useMemo(
    () => selectedDomains.some((id) => id.startsWith("t1d-")),
    [selectedDomains],
  );

  useEffect(() => {
    if (!isT1DDomain) {
      setState({ kind: "out-of-scope" });
      return;
    }
    let cancelled = false;
    setState({ kind: "loading" });
    Promise.all(
      SAMPLE_RUN_URLS.map((url) =>
        fetch(url).then((r) => {
          if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
          return r.json() as Promise<DiscoveryRun>;
        }),
      ),
    )
      .then((runs) => {
        if (!cancelled) setState({ kind: "ready", runs });
      })
      .catch((err) => {
        if (!cancelled) {
          setState({
            kind: "error",
            message: err instanceof Error ? err.message : String(err),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isT1DDomain]);

  return (
    <div className="p-4 space-y-3">
      <div className="text-[8px] font-mono text-text-muted p-2 border border-border/50 rounded bg-surface-elevated">
        Edges and calibration runs computed on real observational
        cohorts, separate from the curated CausalGraph above. Two public
        substrates today — D1NAMO (Dubosson 2018, 9 T1D subjects) and
        Hall (Hall et al 2018, 19 T2D / pre-diabetic subjects). Tab
        labels carry the cohort prefix; same algorithm across cohorts
        is how cross-substrate generalisation gets tested.
      </div>

      {state.kind === "loading" && <LoadingTile />}
      {state.kind === "error" && <ErrorTile message={state.message} />}
      {state.kind === "out-of-scope" && <OutOfScopeTile />}
      {state.kind === "ready" && (
        <>
          {/* Algorithm × cohort tabs. Cohort prefix only appears when
              there's more than one cohort in the loaded set, so the
              single-cohort case stays clean. */}
          <div className="flex gap-1.5 flex-wrap">
            {state.runs.map((r, i) => {
              const distinctCohorts = new Set(
                state.runs.map((x) => x.cohortId),
              );
              const showCohort = distinctCohorts.size > 1;
              const cohortLabel =
                COHORT_SHORT_LABELS[r.cohortId] ?? r.cohortId;
              const isCal = CALIBRATION_ALGORITHM_IDS.has(r.algorithm.id);
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setActiveIdx(i)}
                  className={`flex-1 min-w-[110px] text-[8px] font-[family-name:var(--font-michroma)] tracking-wider rounded px-2 py-1 border transition-colors ${
                    i === activeIdx
                      ? "text-[#40c4ff] border-[#40c4ff]/60 bg-[#40c4ff]/10"
                      : "text-text-muted border-border bg-surface-elevated hover:border-foreground/40 hover:text-foreground"
                  }`}
                >
                  {showCohort && (
                    <span className="block text-[6.5px] font-mono opacity-70 -mb-0.5">
                      {cohortLabel}
                    </span>
                  )}
                  {r.algorithm.id} v{r.algorithm.version}
                  <span className="block text-[7px] font-mono mt-0.5">
                    {isCal ? "calibration" : `${r.result.edges.length} edges`}
                  </span>
                </button>
              );
            })}
          </div>
          <RunTile run={state.runs[activeIdx]} />
        </>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────

function LoadingTile() {
  return (
    <div className="text-[8px] font-mono text-text-muted p-3 border border-border/40 rounded">
      Loading discovery run…
    </div>
  );
}

function ErrorTile({ message }: { message: string }) {
  return (
    <div className="text-[8px] font-mono text-accent-red p-3 border border-accent-red/40 rounded bg-accent-red/5">
      Failed to load run: {message}
    </div>
  );
}

function OutOfScopeTile() {
  return (
    <div className="text-[8px] font-mono text-text-muted p-3 border border-border/40 rounded">
      No discovery runs available for the current domain selection. The
      bundled cohorts (D1NAMO, Hall) are T1D substrates — select a T1D
      domain to surface them here. Geopolitical / macro / financial
      cohort discovery runs will appear when they ship.
    </div>
  );
}

function RunTile({ run }: { run: DiscoveryRun }) {
  const r = run.result;
  const isCalibration = CALIBRATION_ALGORITHM_IDS.has(run.algorithm.id);
  const sortedEdges = useMemo(
    () =>
      [...r.edges].sort(
        (a, b) => Math.abs(b.strength) - Math.abs(a.strength),
      ),
    [r.edges],
  );

  return (
    <div className="space-y-2 border border-[#40c4ff]/30 rounded bg-[#40c4ff]/5 p-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-[family-name:var(--font-michroma)] tracking-wider text-[#40c4ff]">
            {isCalibration ? "CALIBRATION RUN" : "DISCOVERY RUN"}
          </span>
          {CAPABILITY_BY_ALGORITHM[run.algorithm.id] && (
            <CapabilityBadge
              capability={CAPABILITY_BY_ALGORITHM[run.algorithm.id]}
            />
          )}
        </div>
        <span
          className={`text-[7px] font-mono ${
            run.status === "succeeded"
              ? "text-accent-green"
              : "text-accent-red"
          }`}
        >
          {run.status.toUpperCase()}
        </span>
      </div>

      {/* Provenance grid */}
      <div className="grid grid-cols-2 gap-1.5">
        <Stat label="ALGORITHM" value={`${run.algorithm.id} v${run.algorithm.version}`} />
        <Stat label="COHORT" value={run.cohortId} />
        {isCalibration ? (
          <>
            <Stat
              label="N PAIRS"
              value={String(r.diagnostics?.nPairs ?? 0)}
            />
            <Stat
              label="SUBJECTS"
              value={String(r.diagnostics?.nSubjects ?? 0)}
            />
          </>
        ) : (
          <>
            <Stat label="EDGES" value={String(r.edges.length)} />
            <Stat
              label="VARIABLES"
              value={String(r.variables.length)}
            />
          </>
        )}
      </div>

      {/* Diagnostics — discovery flavour */}
      {!isCalibration && r.diagnostics && (
        <div className="text-[7px] font-mono text-text-muted leading-relaxed border-l-2 border-[#40c4ff]/30 pl-2">
          {typeof r.diagnostics.nSubjectsUsed === "number" && (
            <>
              {r.diagnostics.nSubjectsUsed} subjects ·{" "}
            </>
          )}
          {typeof r.diagnostics.nCandidates === "number" && (
            <>
              {String(r.diagnostics.nCandidates)} candidates scanned ·{" "}
            </>
          )}
          {typeof r.diagnostics.nEdgesAfterFDR === "number" && (
            <>{String(r.diagnostics.nEdgesAfterFDR)} kept after FDR</>
          )}
        </div>
      )}

      {/* Calibration metrics — only when this run is a calibration */}
      {isCalibration && r.diagnostics && (
        <CalibrationBlock diagnostics={r.diagnostics} />
      )}

      {/* Edges — only for discovery runs */}
      {!isCalibration && (
        <div className="space-y-1.5">
          <div className="text-[8px] font-[family-name:var(--font-michroma)] tracking-wider text-foreground pt-1">
            DISCOVERED EDGES
          </div>
          {sortedEdges.length === 0 ? (
            <div className="text-[8px] font-mono text-text-muted">
              No edges passed the FDR threshold.
            </div>
          ) : (
            <ul className="space-y-1">
              {sortedEdges.map((edge, i) => (
                <li
                  key={i}
                  className="text-[8px] font-mono text-foreground p-1.5 rounded border border-border bg-surface-elevated"
                  title={edge.evidence}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate">
                      <span className="text-accent-cyan">{edge.source}</span>
                      <span className="text-text-muted mx-1">{"→"}</span>
                      <span className="text-accent-amber">{edge.target}</span>
                      {typeof edge.lag === "number" && edge.lag > 0 && (
                        <span className="text-text-muted ml-2">
                          (+{edge.lag}s)
                        </span>
                      )}
                    </span>
                    <span className="text-[7px] text-text-muted shrink-0">
                      r={edge.strength.toFixed(3)}
                      {typeof edge.pValue === "number" && (
                        <>
                          {" "}
                          · p={edge.pValue.toExponential(1)}
                        </>
                      )}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Algorithm caveat — honest framing carries through to the UI */}
      {run.algorithm.id === "lag-correlation" && (
        <div className="text-[7px] font-mono text-accent-amber/70 leading-relaxed border border-accent-amber/20 bg-accent-amber/5 rounded px-1.5 py-1">
          <strong>v0 algorithm.</strong> Pearson correlation with BH-FDR —
          no conditioning sets, so common causes inflate edges and
          direction is temporal precedence only. Compare against the
          pcmci-linear tab to see which of these edges survive proper
          conditioning.
        </div>
      )}
      {run.algorithm.id === "pcmci-linear" && (
        <div className="text-[7px] font-mono text-accent-cyan/70 leading-relaxed border border-accent-cyan/20 bg-accent-cyan/5 rounded px-1.5 py-1">
          <strong>PCMCI (linear-Gaussian, lagged-only).</strong> Runge
          (2018) — PC-stable phase prunes candidate parents under
          conditioning; MCI phase tests momentary conditional
          independence. Linear-Gaussian only (no nonparametric CI tests
          yet). On the 9-subject D1NAMO cohort the lag-correlation
          edges fail the conditioning test → likely autocorrelation
          artefacts. A larger cohort or relaxed FDR may surface real
          residual signal.
        </div>
      )}
      {run.algorithm.id === "bocpd-hypo-calibration" && (
        <div className="text-[7px] font-mono text-accent-amber/80 leading-relaxed border border-accent-amber/20 bg-accent-amber/5 rounded px-1.5 py-1">
          <strong>BOCPD vs hypoglycemia, 30-min horizon.</strong> The
          methodology the Joslin proposal commits to, executed on the
          public D1NAMO cohort. AUROC measures discrimination; ECE
          measures calibration loss. A platform whose discrimination is
          high but calibration poor needs post-hoc re-calibration
          (Platt / isotonic) before the raw scores can drive clinical
          interpretation — exactly the question the Phase-1 deliverable
          on Joslin data is meant to answer at scale.
        </div>
      )}
      {run.algorithm.id === "csd-fit-hypo-calibration" && (
        <div className="text-[7px] font-mono text-accent-cyan/80 leading-relaxed border border-accent-cyan/20 bg-accent-cyan/5 rounded px-1.5 py-1 space-y-1">
          <div>
            <strong>F sub-score (CSD/AR(1) fit) vs hypoglycemia, 30-min
            horizon.</strong> Validates the F sub-score and the bootstrap
            CI shipped in the F·E·G·S·M relevance composite, on real
            labelled CGM data. <em>Not</em> a full F·E·G·S·M validation:
            single-subject CGM has no multi-node graph, so M and
            several other sub-scores are degenerate — listed above.
            Two AUROCs reported: high-F-predicts-event (sanity) and
            (1−F)-predicts-event (the regime-shift hypothesis: AR(1) fit
            collapses as the system approaches a tipping point).
          </div>
          <div className="border-t border-accent-cyan/20 pt-1">
            <strong>Cross-substrate finding (run on both cohorts):</strong>{" "}
            On D1NAMO (T1D + insulin) F→hypo AUROC ≈ 0.59 — mildly
            informative. On Hall (T2D / pre-diabetic, no insulin) the
            same calibrator gives AUROC ≈ 0.50 — chance. F's apparent
            predictive power on D1NAMO does not generalise to a
            different population. The signal we saw on D1NAMO was
            T1D-specific, not a universal claim about fit collapse.
            Full F·E·G·S·M validation still requires a multi-subject-
            graph cohort like nPOD.
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-1.5 rounded border border-border bg-surface text-center">
      <div className="text-[7px] font-mono text-text-muted">{label}</div>
      <div className="text-[9px] font-mono text-foreground truncate" title={value}>
        {value}
      </div>
    </div>
  );
}

// ─── Calibration metrics + reliability diagram ───────────────────────

interface ReliabilityBin {
  binLow: number;
  binHigh: number;
  predictedMean: number;
  observedRate: number;
  count: number;
}

function CalibrationBlock({
  diagnostics,
}: {
  diagnostics: Record<string, unknown>;
}) {
  // BOCPD calibrator emits a single AUROC; the CSD-fit calibrator emits two
  // (high-F-predicts-event vs low-F-predicts-event). Prefer aurocFitHigh
  // when present and surface aurocFitLow as a secondary stat below.
  const aurocBocpd =
    typeof diagnostics.auroc === "number" ? diagnostics.auroc : null;
  const aurocFitHigh =
    typeof diagnostics.aurocFitHigh === "number"
      ? diagnostics.aurocFitHigh
      : null;
  const aurocFitLow =
    typeof diagnostics.aurocFitLow === "number"
      ? diagnostics.aurocFitLow
      : null;
  const headlineAuroc = aurocBocpd ?? aurocFitHigh;
  const meanCiHalfWidth =
    typeof diagnostics.meanCiHalfWidth === "number"
      ? diagnostics.meanCiHalfWidth
      : null;
  const validatedSubScores = Array.isArray(diagnostics.validatedSubScores)
    ? (diagnostics.validatedSubScores as string[])
    : null;
  const degenerateSubScores = Array.isArray(diagnostics.degenerateSubScores)
    ? (diagnostics.degenerateSubScores as string[])
    : null;
  const brier =
    typeof diagnostics.brierScore === "number" ? diagnostics.brierScore : null;
  const ece = typeof diagnostics.ece === "number" ? diagnostics.ece : null;
  const baseRate =
    typeof diagnostics.baseRate === "number" ? diagnostics.baseRate : null;
  const bins = Array.isArray(diagnostics.reliabilityBins)
    ? (diagnostics.reliabilityBins as ReliabilityBin[])
    : [];
  const maxCount = bins.reduce((m, b) => Math.max(m, b.count), 0);

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-4 gap-1.5">
        <Stat
          label="AUROC"
          value={headlineAuroc !== null ? headlineAuroc.toFixed(3) : "—"}
        />
        <Stat label="BRIER" value={brier !== null ? brier.toFixed(3) : "—"} />
        <Stat label="ECE" value={ece !== null ? ece.toFixed(3) : "—"} />
        <Stat
          label="BASE RATE"
          value={baseRate !== null ? `${(baseRate * 100).toFixed(1)}%` : "—"}
        />
      </div>
      {/* Secondary stats — only emitted by the csd-fit calibrator. */}
      {(aurocFitLow !== null || meanCiHalfWidth !== null) && (
        <div className="grid grid-cols-2 gap-1.5">
          {aurocFitLow !== null && (
            <Stat
              label="AUROC (1−F → hypo)"
              value={aurocFitLow.toFixed(3)}
            />
          )}
          {meanCiHalfWidth !== null && (
            <Stat
              label="MEAN CI HALF-WIDTH"
              value={meanCiHalfWidth.toFixed(3)}
            />
          )}
        </div>
      )}
      {/* Sub-score validation honesty box — only emitted by csd-fit. */}
      {(validatedSubScores || degenerateSubScores) && (
        <div className="text-[7px] font-mono text-text-muted leading-relaxed border-l-2 border-accent-cyan/30 pl-2 space-y-0.5">
          {validatedSubScores && validatedSubScores.length > 0 && (
            <div>
              <span className="text-accent-green">VALIDATES:</span>{" "}
              {validatedSubScores.join(", ")}
            </div>
          )}
          {degenerateSubScores && degenerateSubScores.length > 0 && (
            <div>
              <span className="text-accent-amber">DEGENERATE ON THIS SUBSTRATE:</span>{" "}
              {degenerateSubScores.join(", ")}
            </div>
          )}
        </div>
      )}

      {/* Reliability diagram */}
      <div className="space-y-1">
        <div className="text-[8px] font-[family-name:var(--font-michroma)] tracking-wider text-foreground pt-1">
          RELIABILITY DIAGRAM
        </div>
        <div className="text-[7px] font-mono text-text-muted">
          Each row: predicted bin (left) → observed event rate (cyan bar)
          vs predicted mean (amber tick). Perfect calibration would put
          the tick exactly on the bar's right edge.
        </div>
        <ul className="space-y-0.5">
          {bins.map((b, i) => (
            <li
              key={i}
              className="text-[7px] font-mono text-foreground flex items-center gap-2"
            >
              <span className="text-text-muted shrink-0 w-12">
                [{b.binLow.toFixed(1)}–{b.binHigh.toFixed(1)})
              </span>
              <span className="text-text-muted shrink-0 w-10">
                n={b.count}
              </span>
              <div className="flex-1 relative h-3 bg-surface-elevated rounded">
                <div
                  className="absolute left-0 top-0 bottom-0 bg-accent-cyan/40 rounded-l"
                  style={{
                    width: `${Math.min(100, b.observedRate * 100)}%`,
                  }}
                />
                <div
                  className="absolute top-0 bottom-0 w-px bg-accent-amber"
                  style={{
                    left: `${Math.min(100, b.predictedMean * 100)}%`,
                  }}
                />
              </div>
              <span className="text-text-muted shrink-0 w-16 text-right">
                obs={b.observedRate.toFixed(2)}
                {maxCount > 0 && b.count === 0 && " (empty)"}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
