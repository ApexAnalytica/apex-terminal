"use client";

import { useCallback, useEffect, useMemo } from "react";
import { useApexStore } from "@/stores/useApexStore";
import { nlmeFit } from "@/lib/estimators/nlme";
import { coxFit } from "@/lib/estimators/cox";
import {
  getNaturalHistoryCpeptideCohort,
  getInsulinIndependenceTte,
  VX880_LITERATURE_ANCHORS,
  VX880_TRIAL_PRIOR_META,
} from "@/lib/vx880-trial-data";
import { solveInterdiction } from "@/lib/interdiction-engine";
import type { CausalShock } from "@/lib/types";

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

// ─── Trial-design presets ────────────────────────────────────────────
//
// Each preset is one "trial-design question" — a short label, a one-line
// rationale, and the set of co-firing shocks to inject at trial-mechanism
// nodes before running the interdiction solver. Adding a preset is a
// single object; the UI auto-renders the chip strip below.
//
// All shocks use `targetNodes` to scope injection — the category broadcast
// would saturate every science-category node and collapse the solver's
// marginal-reduction signal (see PR #108).
type VX880Preset = {
  id: string;
  label: string;
  rationale: string;
  shocks: CausalShock[];
};

const VX880_PRESETS: VX880Preset[] = [
  {
    id: "graft_protect",
    label: "PROTECT GRAFT β-MASS",
    rationale:
      "Combined graft-attack: IBMIR + autoimmune recurrence + alloimmune rejection. Solver finds the 3 best edge cuts to absorb the assault.",
    shocks: [
      {
        id: "vx880_preset_ibmir",
        name: "IBMIR peri-infusion strike",
        severity: 0.85,
        category: "health",
        description:
          "Instant blood-mediated inflammatory reaction destroys a fraction of infused islets within hours.",
        targetNodes: ["vx880_ibmir"],
      },
      {
        id: "vx880_preset_autoimmune",
        name: "Autoimmune recurrence",
        severity: 0.7,
        category: "health",
        description:
          "Memory T-cell reactivation against islet antigens; documented in 20-40% of recipients over 5yr.",
        targetNodes: ["vx880_autoimmune_recur"],
      },
      {
        id: "vx880_preset_alloimmune",
        name: "Alloimmune rejection",
        severity: 0.7,
        category: "health",
        description:
          "Donor-cell-line HLA mismatch drives graft loss, accelerated by inadequate immunosuppression.",
        targetNodes: ["vx880_alloimmune_reject"],
      },
    ],
  },
  {
    id: "ibmir_only",
    label: "PREVENT IBMIR ONLY",
    rationale:
      "Single peri-infusion shock at the IBMIR node — isolates which upstream cuts buy the most graft survival in the first 72h.",
    shocks: [
      {
        id: "vx880_preset_ibmir_solo",
        name: "IBMIR peri-infusion strike (solo)",
        severity: 0.9,
        category: "health",
        description:
          "Instant blood-mediated inflammatory reaction in isolation — no chronic immune component.",
        targetNodes: ["vx880_ibmir"],
      },
    ],
  },
  {
    id: "immunosuppression_optimize",
    label: "OPTIMIZE IMMUNOSUPPRESSION",
    rationale:
      "Pairs alloimmune rejection pressure with IS-toxicity load — surfaces cuts that decouple graft survival from chronic IS exposure.",
    shocks: [
      {
        id: "vx880_preset_allo_chronic",
        name: "Chronic alloimmune attrition",
        severity: 0.65,
        category: "health",
        description:
          "Sub-clinical donor-HLA recognition under standard tac+MMF—slow graft attrition over 5yr.",
        targetNodes: ["vx880_alloimmune_reject"],
      },
      {
        id: "vx880_preset_is_toxicity",
        name: "Immunosuppression toxicity load",
        severity: 0.6,
        category: "health",
        description:
          "Tac/MMF nephrotoxicity + opportunistic infection burden — the cost of preventing rejection.",
        targetNodes: ["vx880_is_toxicity"],
      },
    ],
  },
  {
    id: "hla_mismatch",
    label: "REDUCE HLA MISMATCH",
    rationale:
      "Upstream HLA-risk shock cascades into both autoimmune recurrence and allo rejection — tests whether donor-matching policy beats downstream cuts.",
    shocks: [
      {
        id: "vx880_preset_hla",
        name: "HLA mismatch burden",
        severity: 0.75,
        category: "health",
        description:
          "High DR/DQ mismatch between donor cell line and recipient — elevates both autoimmune and allo arms.",
        targetNodes: ["vx880_hla_risk"],
      },
      {
        id: "vx880_preset_aab",
        name: "Autoantibody load",
        severity: 0.55,
        category: "health",
        description:
          "Pre-existing GAD/IA-2/ZnT8 titers prime memory T-cell expansion against the graft.",
        targetNodes: ["vx880_autoantibody_load"],
      },
    ],
  },
];

// ─── Counterfactual node-ablation toggles ────────────────────────────
//
// Lets the user knock out individual mechanism nodes independently of the
// preset. Toggling re-routes through the existing ablation pipeline so the
// MC fan + counterfactual HR react in place. Order matches the demo flow:
// peri-infusion → chronic immune → IS overhead.
const VX880_MECHANISM_NODES: { id: string; label: string; hint: string }[] = [
  { id: "vx880_ibmir", label: "IBMIR", hint: "peri-infusion (hours)" },
  {
    id: "vx880_autoimmune_recur",
    label: "AUTOIMMUNE RECUR.",
    hint: "memory T-cell (years)",
  },
  {
    id: "vx880_alloimmune_reject",
    label: "ALLO REJECTION",
    hint: "HLA-driven (chronic)",
  },
  {
    id: "vx880_is_toxicity",
    label: "IS TOXICITY",
    hint: "tac/MMF burden",
  },
];

export default function VX880TrialPanel() {
  const graphData = useApexStore((s) => s.graphData);
  const severedEdges = useApexStore((s) => s.severedEdges);
  const setTrialPrior = useApexStore((s) => s.setTrialPrior);
  const setLastInterdictionResult = useApexStore(
    (s) => s.setLastInterdictionResult,
  );
  const lastInterdictionResult = useApexStore((s) => s.lastInterdictionResult);
  const ablatedNodeIds = useApexStore((s) => s.ablatedNodeIds);
  const toggleAblatedNode = useApexStore((s) => s.toggleAblatedNode);

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

  // Publish the fitted prior to the store so the MC engine can consume
  // it. Republished on every analysis change; cleared when the VX-880
  // subgraph is no longer loaded so other domains don't accidentally
  // inherit a stale survival fan.
  useEffect(() => {
    if (!analysis) {
      setTrialPrior(null);
      return;
    }
    setTrialPrior({
      label: VX880_TRIAL_PRIOR_META.label,
      beta: analysis.cox.beta[0],
      se: analysis.cox.se[0],
      outcomeNodeId: VX880_TRIAL_PRIOR_META.outcomeNodeId,
      baselineHazardPerEpoch: VX880_TRIAL_PRIOR_META.baselineHazardPerEpoch,
      popK: analysis.popK,
      tauK: analysis.tauK,
      source: VX880_TRIAL_PRIOR_META.source,
    });
    return () => {
      // Clear when this panel unmounts or the analysis goes away.
      setTrialPrior(null);
    };
  }, [analysis, setTrialPrior]);

  // ── Counterfactual HR under the current interdiction ──
  // Maps the solver's reductionPct (fraction of cascade damage
  // prevented) into a fraction of the treatment effect that survives:
  //   effectiveβ = β × (reductionPct / 100)
  // reductionPct = 100% (perfect protection) → full HR restored.
  // reductionPct = 0%  (no protection)      → HR collapses toward 1.
  const counterfactualHR = useMemo(() => {
    if (!analysis) return null;
    if (!lastInterdictionResult) return null;
    const { reductionPct, bestDamage, baselineDamage } = lastInterdictionResult;
    if (baselineDamage <= 0 || !Number.isFinite(reductionPct)) return null;
    const frac = Math.max(0, Math.min(1, reductionPct / 100));
    const effectiveBeta = analysis.cox.beta[0] * frac;
    const hr = Math.exp(effectiveBeta);
    return {
      hr,
      frac,
      reductionPct,
      bestDamage,
      baselineDamage,
    };
  }, [analysis, lastInterdictionResult]);

  // ── Trial-design preset runner ──
  // Each preset (defined in VX880_PRESETS above) seeds its own targeted
  // shock set on the VX-880 subgraph, runs the edge-cut interdiction
  // solver against it, and publishes the result to the store so the MC
  // fan chart and the counterfactual HR block both update in place.
  // Targeted shocks (`targetNodes`) are required — see PR #108: a category
  // broadcast across science-category nodes saturates the cascade and
  // collapses the solver's marginal-reduction step to "no candidate cuts".
  const runPreset = useCallback(
    (preset: VX880Preset) => {
      if (!hasVx880) return;
      const result = solveInterdiction(
        graphData,
        preset.shocks,
        severedEdges,
        3,
        "edge",
      );
      setLastInterdictionResult(result);
    },
    [hasVx880, graphData, severedEdges, setLastInterdictionResult],
  );

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
          <div className="text-[14px] font-mono text-accent-amber pt-0.5 flex items-baseline gap-2">
            <span>{analysis.hazardRatio.toFixed(2)}</span>
            <span className="text-[8px] text-text-muted">
              (95% CI {analysis.hazardRatioLo.toFixed(2)}–
              {analysis.hazardRatioHi.toFixed(2)})
            </span>
            {counterfactualHR && (
              <span className="text-[10px] font-mono text-accent-cyan ml-auto">
                {"\u2192"} HR{"\u02E2"}{" "}
                <span className="text-[13px]">
                  {counterfactualHR.hr.toFixed(2)}
                </span>
                <span className="text-[7px] text-text-muted ml-1">
                  (after interdiction)
                </span>
              </span>
            )}
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
          {counterfactualHR && (
            <div className="text-[7px] font-mono text-accent-cyan/80 pt-1 mt-1 border-t border-accent-cyan/20 leading-relaxed">
              Counterfactual: the current interdiction prevents{" "}
              <strong>{counterfactualHR.reductionPct.toFixed(0)}%</strong> of
              cascade damage on the VX-880 subgraph. Treating that as the
              fraction of β surviving the attack collapses HR from{" "}
              {analysis.hazardRatio.toFixed(2)} to{" "}
              <strong>{counterfactualHR.hr.toFixed(2)}</strong> — the
              treatment effect the graft can still deliver after the
              solver{"\u2019"}s cuts absorb the upstream assault.
            </div>
          )}
        </div>
      </div>

      {/* ── Preset demo path ─────────────────────────────────────── */}
      <div className="pt-1 border-t border-border/30 space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[8px] font-[family-name:var(--font-michroma)] tracking-wider text-foreground">
            TRIAL-DESIGN PRESETS
          </span>
          <span className="text-[7px] font-mono text-text-muted">
            click to run 3-cut interdiction
          </span>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {VX880_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => runPreset(preset)}
              title={preset.rationale}
              className="text-left text-[8px] font-[family-name:var(--font-michroma)] tracking-wider text-accent-cyan border border-accent-cyan/40 bg-accent-cyan/5 hover:bg-accent-cyan/15 hover:border-accent-cyan/70 rounded px-2 py-1 transition-colors leading-tight"
            >
              {"\u25B6"} {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Counterfactual mechanism ablation toggles */}
      <div className="pt-1 border-t border-border/30 space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[8px] font-[family-name:var(--font-michroma)] tracking-wider text-foreground">
            ABLATE MECHANISM (do-operator)
          </span>
          <span className="text-[7px] font-mono text-text-muted">
            MC fan + HR react in place
          </span>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {VX880_MECHANISM_NODES.map((node) => {
            const isAblated = ablatedNodeIds.includes(node.id);
            const exists = graphData.nodes.some((n) => n.id === node.id);
            if (!exists) return null;
            return (
              <button
                key={node.id}
                type="button"
                onClick={() => toggleAblatedNode(node.id)}
                className={`text-left text-[8px] font-mono rounded px-2 py-1 border transition-colors leading-tight ${
                  isAblated
                    ? "text-accent-green border-accent-green/60 bg-accent-green/10"
                    : "text-text-muted border-border bg-surface-elevated hover:border-foreground/40 hover:text-foreground"
                }`}
              >
                <span className="inline-block w-3 mr-1">
                  {isAblated ? "■" : "□"}
                </span>
                {node.label}
                <span className="block text-[7px] text-text-muted/80 ml-4 leading-tight">
                  {node.hint}
                </span>
              </button>
            );
          })}
        </div>
        <div className="text-[7px] font-mono text-text-muted leading-relaxed">
          Ablating a node removes it (and its incident edges) from the
          forward simulation — equivalent to a do-operator on that node.
          Toggle individually to isolate which mechanism dominates the
          counterfactual HR drop.
        </div>
      </div>

      {/* ── Bridge to the MC forecast below ─────────────────────── */}
      <div className="text-[7px] font-mono text-text-muted leading-relaxed">
        Or pick any node on the DAG / run interdiction from the copilot
        and the Monte Carlo forecast will simulate the Ω-buffer trajectory
        alongside a literature-calibrated P(insulin-independence) survival
        fan built from the Cox fit above (β = {analysis.cox.beta[0].toFixed(2)},
        SE = {analysis.cox.se[0].toFixed(2)}).
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
