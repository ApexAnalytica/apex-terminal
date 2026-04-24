"use client";

import { useMemo } from "react";
import { useApexStore } from "@/stores/useApexStore";
import { nlmeFit } from "@/lib/estimators/nlme";
import { coxFit } from "@/lib/estimators/cox";
import {
  getNaturalHistoryCpeptideCohort,
  getInsulinIndependenceTte,
  VX880_LITERATURE_ANCHORS,
} from "@/lib/vx880-trial-data";

// ─── C-peptide trajectory chart ─────────────────────────────────────
//
// Overlays the 12 natural-history subject trajectories on the NLME
// population median curve with a between-subject envelope (μ ± τ).
// All time axes in years from diagnosis.

function CpeptideChart({
  cohort,
  popA,
  popK,
  tauA,
  tauK,
}: {
  cohort: { t: number[]; y: number[] }[];
  popA: number;
  popK: number;
  tauA: number;
  tauK: number;
}) {
  const W = 280;
  const H = 120;
  const PAD = { top: 10, right: 10, bottom: 18, left: 28 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const tMax = 3.0;
  const yMax = 0.3;

  const xScale = (t: number) => PAD.left + (t / tMax) * plotW;
  const yScale = (y: number) => PAD.top + plotH - (y / yMax) * plotH;

  // Population median + envelope
  const samples = useMemo(() => {
    const ts: number[] = [];
    for (let i = 0; i <= 60; i++) ts.push((i / 60) * tMax);
    const median = ts.map((t) => popA * Math.exp(-popK * t));
    // Approximate envelope: (A·e^{-k·t}) with A → A·exp(±τ_A), k → k·exp(∓τ_k)
    // gives a rough p16-p84 band (one between-subject SD on each side).
    const hi = ts.map((t) =>
      popA * Math.exp(tauA) * Math.exp(-popK * Math.exp(-tauK) * t),
    );
    const lo = ts.map((t) =>
      popA * Math.exp(-tauA) * Math.exp(-popK * Math.exp(tauK) * t),
    );
    return { ts, median, hi, lo };
  }, [popA, popK, tauA, tauK]);

  const pathForSubject = (t: number[], y: number[]) =>
    t
      .map(
        (ti, i) =>
          `${i === 0 ? "M" : "L"} ${xScale(ti).toFixed(1)} ${yScale(y[i]).toFixed(1)}`,
      )
      .join(" ");

  const linePath = (ts: number[], ys: number[]) =>
    ts
      .map(
        (t, i) =>
          `${i === 0 ? "M" : "L"} ${xScale(t).toFixed(1)} ${yScale(ys[i]).toFixed(1)}`,
      )
      .join(" ");

  const bandPath = (ts: number[], lo: number[], hi: number[]) => {
    const upper = ts.map(
      (t, i) => `${xScale(t).toFixed(1)},${yScale(hi[i]).toFixed(1)}`,
    );
    const lower = [...ts]
      .map((t, i) => ({ t, y: lo[i] }))
      .reverse()
      .map((p) => `${xScale(p.t).toFixed(1)},${yScale(p.y).toFixed(1)}`);
    return `M ${upper.join(" L ")} L ${lower.join(" L ")} Z`;
  };

  const gridY = [0, 0.1, 0.2, 0.3];
  const gridX = [0, 1, 2, 3];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full block"
      preserveAspectRatio="none"
      style={{ maxHeight: 160 }}
    >
      {/* Grid */}
      {gridY.map((v) => (
        <g key={v}>
          <line
            x1={PAD.left}
            y1={yScale(v)}
            x2={W - PAD.right}
            y2={yScale(v)}
            stroke="var(--border)"
            strokeWidth={0.4}
            strokeDasharray="2,3"
          />
          <text
            x={PAD.left - 3}
            y={yScale(v) + 3}
            textAnchor="end"
            fill="var(--text-muted)"
            fontSize={7}
            fontFamily="monospace"
          >
            {v.toFixed(2)}
          </text>
        </g>
      ))}
      {gridX.map((t) => (
        <text
          key={t}
          x={xScale(t)}
          y={H - 6}
          textAnchor="middle"
          fill="var(--text-muted)"
          fontSize={7}
          fontFamily="monospace"
        >
          {t}y
        </text>
      ))}

      {/* Between-subject envelope */}
      <path
        d={bandPath(samples.ts, samples.lo, samples.hi)}
        fill="rgba(64, 196, 255, 0.12)"
        stroke="none"
      />

      {/* Individual subject trajectories */}
      {cohort.map((s, i) => (
        <path
          key={i}
          d={pathForSubject(s.t, s.y)}
          fill="none"
          stroke="rgba(200,200,220,0.45)"
          strokeWidth={0.7}
          strokeLinejoin="round"
        />
      ))}

      {/* Observed data points */}
      {cohort.flatMap((s, i) =>
        s.t.map((ti, j) => (
          <circle
            key={`${i}-${j}`}
            cx={xScale(ti)}
            cy={yScale(s.y[j])}
            r={1.1}
            fill="rgba(200,200,220,0.65)"
          />
        )),
      )}

      {/* Population median (NLME fit) */}
      <path
        d={linePath(samples.ts, samples.median)}
        fill="none"
        stroke="#40c4ff"
        strokeWidth={1.6}
      />

      {/* Axis labels */}
      <text
        x={W / 2}
        y={H - 1}
        textAnchor="middle"
        fill="var(--text-muted)"
        fontSize={5.5}
        fontFamily="monospace"
      >
        YEARS FROM T1D DIAGNOSIS
      </text>
      <text
        x={6}
        y={12}
        fill="var(--text-muted)"
        fontSize={6}
        fontFamily="monospace"
      >
        C-pep (nmol/L)
      </text>
    </svg>
  );
}

// ─── Main panel ──────────────────────────────────────────────────────

export default function VX880TrialPanel() {
  const graphData = useApexStore((s) => s.graphData);

  // Only render when the VX-880 flagship subgraph is loaded.
  const hasVx880 = useMemo(
    () => graphData.nodes.some((n) => n.id.startsWith("vx880_")),
    [graphData.nodes],
  );

  // Compute fits — memoized on module load. Both datasets are static
  // literature-calibrated cohorts, so the fit is deterministic.
  const analysis = useMemo(() => {
    if (!hasVx880) return null;
    const cohort = getNaturalHistoryCpeptideCohort();
    const nlme = nlmeFit(cohort);
    const tte = getInsulinIndependenceTte();
    const cox = coxFit(tte.X, tte.times, tte.events, { l2: 0.01 });

    const popA = Math.exp(nlme.mu[0]);
    const popK = Math.exp(nlme.mu[1]);
    const halfLife = Math.log(2) / popK;

    const treatedEvents = tte.subjects.filter(
      (s) => s.treatment === 1 && s.event === 1,
    ).length;
    const treatedN = tte.subjects.filter((s) => s.treatment === 1).length;
    const controlEvents = tte.subjects.filter(
      (s) => s.treatment === 0 && s.event === 1,
    ).length;
    const controlN = tte.subjects.filter((s) => s.treatment === 0).length;

    return {
      cohort,
      nlme,
      cox,
      popA,
      popK,
      halfLife,
      tauA: nlme.tau[0],
      tauK: nlme.tau[1],
      hazardRatio: Math.exp(cox.beta[0]),
      hazardRatioLo: Math.exp(cox.beta[0] - 1.96 * cox.se[0]),
      hazardRatioHi: Math.exp(cox.beta[0] + 1.96 * cox.se[0]),
      treatedEvents,
      treatedN,
      controlEvents,
      controlN,
    };
  }, [hasVx880]);

  if (!hasVx880 || !analysis) return null;

  return (
    <div className="space-y-2 border border-[#40c4ff]/30 rounded bg-[#40c4ff]/5 p-3">
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-[family-name:var(--font-michroma)] tracking-wider text-[#40c4ff]">
          VX-880 TRIAL COHORT ANALYSIS
        </span>
        <span className="text-[7px] font-mono text-text-muted">
          Reichman NEJM 2023 · DCCT/EDIC
        </span>
      </div>

      <div className="text-[8px] font-mono text-text-muted leading-relaxed">
        Parametric readout on the trial-aligned endpoints of the VX-880
        subgraph. NLME fit of natural-history C-peptide decay (n=12) grounds
        the β-cell attrition rate the therapy has to overcome; Cox fit on
        insulin-independence time-to-event (n=24) quantifies the treatment
        HR against that reference.
      </div>

      {/* ── NLME: C-peptide decay ───────────────────────────────── */}
      <div className="border border-border/50 rounded bg-surface-elevated p-2 space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[8px] font-[family-name:var(--font-michroma)] tracking-wider text-foreground">
            NLME · STIMULATED C-PEPTIDE DECAY
          </span>
          <span className="text-[7px] font-mono text-text-muted">
            n={analysis.cohort.length} · 8 visits · 3 yr
          </span>
        </div>

        <CpeptideChart
          cohort={analysis.cohort}
          popA={analysis.popA}
          popK={analysis.popK}
          tauA={analysis.tauA}
          tauK={analysis.tauK}
        />

        <div className="grid grid-cols-3 gap-1.5 pt-1">
          <Stat
            label="BASELINE A"
            value={`${analysis.popA.toFixed(3)} nmol/L`}
          />
          <Stat
            label="DECAY k"
            value={`${analysis.popK.toFixed(3)} /yr`}
          />
          <Stat
            label="HALF-LIFE"
            value={`${analysis.halfLife.toFixed(2)} yr`}
          />
        </div>

        <div className="text-[7px] font-mono text-text-muted leading-relaxed pt-0.5">
          Between-subject SD: τ_A={analysis.tauA.toFixed(2)},
          τ_k={analysis.tauK.toFixed(2)}. Residual σ=
          {analysis.nlme.sigma.toFixed(3)}.{" "}
          <span className="text-text-muted/70">
            Target: {VX880_LITERATURE_ANCHORS.cpeptideHalfLifeYears}.
          </span>
        </div>
      </div>

      {/* ── Cox: insulin-independence TTE ───────────────────────── */}
      <div className="border border-border/50 rounded bg-surface-elevated p-2 space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[8px] font-[family-name:var(--font-michroma)] tracking-wider text-foreground">
            COX · TIME TO INSULIN INDEPENDENCE
          </span>
          <span className="text-[7px] font-mono text-text-muted">
            n={analysis.treatedN + analysis.controlN} · 12 mo
          </span>
        </div>

        {/* Event summary */}
        <div className="grid grid-cols-2 gap-1.5">
          <div className="p-1.5 rounded border border-[#40c4ff]/30 bg-[#40c4ff]/5">
            <div className="text-[7px] font-mono text-[#40c4ff]">VX-880</div>
            <div className="text-[10px] font-mono text-foreground">
              {analysis.treatedEvents}/{analysis.treatedN}{" "}
              <span className="text-text-muted text-[7px]">
                ({Math.round(
                  (100 * analysis.treatedEvents) / analysis.treatedN,
                )}
                %)
              </span>
            </div>
          </div>
          <div className="p-1.5 rounded border border-border bg-surface">
            <div className="text-[7px] font-mono text-text-muted">CONTROL</div>
            <div className="text-[10px] font-mono text-foreground">
              {analysis.controlEvents}/{analysis.controlN}{" "}
              <span className="text-text-muted text-[7px]">
                ({Math.round(
                  (100 * analysis.controlEvents) / analysis.controlN,
                )}
                %)
              </span>
            </div>
          </div>
        </div>

        {/* Hazard ratio */}
        <div className="p-1.5 rounded border border-accent-amber/30 bg-accent-amber/5">
          <div className="flex items-center justify-between">
            <span className="text-[7px] font-mono text-accent-amber tracking-wider">
              HAZARD RATIO (Breslow, ridge 0.01)
            </span>
            <span className="text-[7px] font-mono text-text-muted">
              β={analysis.cox.beta[0].toFixed(2)} ± {analysis.cox.se[0].toFixed(2)}
            </span>
          </div>
          <div className="text-[14px] font-mono text-accent-amber pt-0.5">
            {analysis.hazardRatio.toFixed(2)}
            <span className="text-[8px] text-text-muted ml-1.5">
              (95% CI {analysis.hazardRatioLo.toFixed(2)}–
              {analysis.hazardRatioHi.toFixed(2)})
            </span>
          </div>
          <div className="text-[7px] font-mono text-text-muted pt-0.5 leading-relaxed">
            Treatment increases the instantaneous hazard of achieving insulin
            independence by <strong>{analysis.hazardRatio.toFixed(1)}×</strong>{" "}
            vs natural history. c-index={analysis.cox.concordance.toFixed(2)}.
            Expected:{" "}
            <span className="text-text-muted/70">
              {VX880_LITERATURE_ANCHORS.vx880InsulinIndepRate}
            </span>
            .
          </div>
        </div>
      </div>

      {/* ── Bridge to the MC forecast below ─────────────────────── */}
      <div className="text-[7px] font-mono text-text-muted leading-relaxed pt-1 border-t border-border/30">
        Next: pick a node on the DAG or run interdiction from the copilot
        and the Monte Carlo forecast below will simulate the Ω-buffer
        trajectory under that structural intervention. The VX-880 subgraph
        encodes the mechanistic routes — IBMIR, autoimmune recurrence,
        alloimmune rejection — through which any intervention propagates
        to these same endpoints.
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-1.5 rounded border border-border bg-surface text-center">
      <div className="text-[7px] font-mono text-text-muted">{label}</div>
      <div className="text-[9px] font-mono text-foreground">{value}</div>
    </div>
  );
}
