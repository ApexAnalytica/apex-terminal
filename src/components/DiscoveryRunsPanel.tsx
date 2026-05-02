"use client";

import { useEffect, useMemo, useState } from "react";
import type { DiscoveryRun } from "@/lib/discovery";
import type { Capability } from "@/lib/capability";
import CapabilityBadge from "./CapabilityBadge";

// Per-algorithm capability tag. The discovery algorithms are all
// running on the public D1NAMO cohort today; calibration is also live.
// When they switch to real partner-cohort data, these stay "live"; the
// distinction would be encoded as `live-synthetic` on the cohort, not
// the algorithm.
const CAPABILITY_BY_ALGORITHM: Record<string, Capability> = {
  "lag-correlation": "live",
  "pcmci-linear": "live",
  "bocpd-hypo-calibration": "live",
};

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
];

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; runs: DiscoveryRun[] }
  | { kind: "error"; message: string };

export default function DiscoveryRunsPanel() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    let cancelled = false;
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
  }, []);

  return (
    <div className="p-4 space-y-3">
      <div className="text-[8px] font-mono text-text-muted p-2 border border-border/50 rounded bg-surface-elevated">
        Edges learned from a real observational cohort (D1NAMO, Dubosson
        2018), separate from the curated CausalGraph above. Each tab below
        is a different algorithm run on the same cohort — comparing them
        is how we tell signal from artefact.
      </div>

      {state.kind === "loading" && <LoadingTile />}
      {state.kind === "error" && <ErrorTile message={state.message} />}
      {state.kind === "ready" && (
        <>
          {/* Algorithm tabs */}
          <div className="flex gap-1.5">
            {state.runs.map((r, i) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setActiveIdx(i)}
                className={`flex-1 text-[8px] font-[family-name:var(--font-michroma)] tracking-wider rounded px-2 py-1 border transition-colors ${
                  i === activeIdx
                    ? "text-[#40c4ff] border-[#40c4ff]/60 bg-[#40c4ff]/10"
                    : "text-text-muted border-border bg-surface-elevated hover:border-foreground/40 hover:text-foreground"
                }`}
              >
                {r.algorithm.id} v{r.algorithm.version}
                <span className="block text-[7px] font-mono mt-0.5">
                  {r.result.edges.length} edges
                </span>
              </button>
            ))}
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

function RunTile({ run }: { run: DiscoveryRun }) {
  const r = run.result;
  const isCalibration = run.algorithm.id === "bocpd-hypo-calibration";
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
  const auroc = typeof diagnostics.auroc === "number" ? diagnostics.auroc : null;
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
        <Stat label="AUROC" value={auroc !== null ? auroc.toFixed(3) : "—"} />
        <Stat label="BRIER" value={brier !== null ? brier.toFixed(3) : "—"} />
        <Stat label="ECE" value={ece !== null ? ece.toFixed(3) : "—"} />
        <Stat
          label="BASE RATE"
          value={baseRate !== null ? `${(baseRate * 100).toFixed(1)}%` : "—"}
        />
      </div>

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
