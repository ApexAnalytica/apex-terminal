// ─── PCMCI (linear-Gaussian, lagged-only) ────────────────────────────
//
// HONEST FRAMING — READ FIRST
// ----------------------------
// This is the PCMCI algorithm of Runge (2018) — "Detecting and
// quantifying causal associations in large nonlinear time series
// datasets" — restricted to:
//
//   - Linear-Gaussian conditional independence (partial correlation
//     + Fisher-z; tigramite calls this `ParCorr`)
//   - Lagged-only structure (no contemporaneous edges)
//   - One conditioning depth knob (max_conds_dim)
//
// What this DOES that lag-correlation v0 doesn't:
//
//   1. PC-stable phase 1 — for each target Y[t], iteratively prune
//      candidate parents (X[t-k]) whose partial correlation with Y[t]
//      collapses under conditioning on a growing parent set. This
//      kills edges that are "really" common-cause artefacts.
//
//   2. MCI phase 2 — for each surviving (X[t-k] → Y[t]), test
//      conditional independence given parents(Y[t]) AND lagged-
//      parents(X[t-k]). This is the "momentary conditional
//      independence" step that gives the algorithm its name and
//      controls FDR rigorously across the candidate set.
//
//   3. Honest direction. Lag-correlation reports both X→Y and Y→X
//      as separate edges with similar r values; PCMCI only emits
//      X[t-k] → Y[t] for k > 0 (temporal precedence is encoded in
//      the test).
//
// What this does NOT do (vs the full Runge implementation):
//
//   - No contemporaneous edges (PCMCI+ vs PCMCI; see Runge 2020).
//   - No nonparametric CI tests (CMI-knn, GP-DC). Linear/Gaussian only.
//   - No deterministic-relationship handling.
//   - Single max_conds_dim knob; tigramite has separate caps for
//     phase 1 and phase 2.
//
// The output shape is identical to lag-correlation, so swapping
// algorithms in the API or UI is one line.

import type { Cohort, Subject, Variable } from "../cohort-types";
import type { DiscoveryAlgorithm } from "../algorithm-interface";
import type { DiscoveredEdge, DiscoveryResult } from "../run-types";
import { combineFisherZ, partialCorrelation } from "./_partial-correlation";

export interface PcmciLinearParams {
  /** Maximum lag in seconds. Default 1800 (30 min) — sane for T1D dynamics. */
  maxLagSeconds: number;
  /** Grid cadence in seconds. Default 300 (5 min). */
  gridSeconds: number;
  /** Significance threshold for PC-stable phase pruning. */
  pcAlpha: number;
  /** Final FDR-adjusted p-value threshold for MCI phase. */
  mciAlpha: number;
  /** Cap on the conditioning-set size during PC-stable phase 1. */
  maxCondsDim: number;
  /**
   * Cap on the conditioning-set size in the MCI phase. Tigramite splits
   * this into `max_conds_py` and `max_conds_px`; we use a single cap
   * applied to the union (parents-of-Y ∪ parents-of-X-shifted), keeping
   * the strongest by unconditional |r|. Default 5 — large enough to
   * catch real common-cause structure, small enough to keep the partial
   * correlation from collapsing on small-N real-world cohorts.
   */
  maxCondsDimMci: number;
  /** Minimum subjects per candidate; below this candidate is dropped. */
  minSubjects: number;
  /** Minimum grid points per subject — drop subjects shorter than this. */
  minGridPoints: number;
}

const DEFAULT_PARAMS: PcmciLinearParams = {
  maxLagSeconds: 1800,
  gridSeconds: 300,
  pcAlpha: 0.2, // generous in phase 1 — the MCI phase is the strict gate
  mciAlpha: 0.05,
  maxCondsDim: 3,
  maxCondsDimMci: 5,
  minSubjects: 2,
  minGridPoints: 50,
};

// ─── Grid construction (shared with lag-correlation) ─────────────────

function buildSubjectGrid(
  subject: Subject,
  variables: Variable[],
  gridSeconds: number,
  minGridPoints: number,
): Float64Array[] | null {
  if (subject.measurements.length === 0) return null;

  let tMin = Infinity;
  let tMax = -Infinity;
  for (const m of subject.measurements) {
    if (m.t < tMin) tMin = m.t;
    if (m.t > tMax) tMax = m.t;
  }
  const span = tMax - tMin;
  const nGrid = Math.floor(span / gridSeconds);
  if (nGrid < minGridPoints) return null;

  const byVar = new Map<string, { t: number; value: number }[]>();
  for (const v of variables) byVar.set(v.id, []);
  for (const m of subject.measurements) {
    const arr = byVar.get(m.variableId);
    if (!arr) continue;
    if (typeof m.value === "number" && Number.isFinite(m.value)) {
      arr.push({ t: m.t - tMin, value: m.value });
    }
  }

  return variables.map((v) => {
    const out = new Float64Array(nGrid);
    const events = byVar.get(v.id) ?? [];
    if (v.kind === "event" || v.kind === "binary") {
      for (const e of events) {
        const idx = Math.min(nGrid - 1, Math.max(0, Math.floor(e.t / gridSeconds)));
        out[idx] += e.value;
      }
    } else {
      events.sort((a, b) => a.t - b.t);
      let lastVal = NaN;
      let cursor = 0;
      for (let i = 0; i < nGrid; i++) {
        const tCenter = (i + 0.5) * gridSeconds;
        while (cursor < events.length && events[cursor].t <= tCenter) {
          lastVal = events[cursor].value;
          cursor += 1;
        }
        out[i] = lastVal;
      }
    }
    return out;
  });
}

// ─── Lagged-variable lookup ──────────────────────────────────────────
//
// A LaggedVar is (variableIndex, lagSteps). For target Y[t] with t ∈
// [maxLag, T), the lagged value of X[t-k] is grid[X][t-k]. We work in
// integer time indices throughout.

interface LaggedVar {
  vIndex: number;
  lagSteps: number;
}

function lvKey(lv: LaggedVar): string {
  return `${lv.vIndex}@${lv.lagSteps}`;
}

/** Pull aligned series (target Y[t], conditioning Z[t]) on the valid
 *  range [maxLag, T) for one subject's grid. */
function alignSeries(
  grid: Float64Array[],
  targetIdx: number,
  maxLag: number,
  conds: LaggedVar[],
): { y: number[]; Z: number[][] } {
  const T = grid[targetIdx].length;
  const y: number[] = [];
  const Z: number[][] = [];
  for (let t = maxLag; t < T; t++) {
    y.push(grid[targetIdx][t]);
    const row: number[] = [];
    for (const c of conds) row.push(grid[c.vIndex][t - c.lagSteps]);
    Z.push(row);
  }
  return { y, Z };
}

/** Same as alignSeries but for a lagged source X[t-k]. */
function alignSource(
  grid: Float64Array[],
  sourceIdx: number,
  sourceLag: number,
  maxLag: number,
): number[] {
  const T = grid[sourceIdx].length;
  const x: number[] = [];
  for (let t = maxLag; t < T; t++) x.push(grid[sourceIdx][t - sourceLag]);
  return x;
}

// ─── BH FDR (same as lag-correlation; vendored to avoid cross-import) ─

function bhAdjust(ps: number[]): number[] {
  const n = ps.length;
  const order = Array.from({ length: n }, (_, i) => i).sort(
    (a, b) => ps[a] - ps[b],
  );
  const adj = new Array<number>(n);
  let prev = 1;
  for (let i = n - 1; i >= 0; i--) {
    const orig = order[i];
    const rank = i + 1;
    adj[orig] = Math.min(prev, (ps[orig] * n) / rank);
    prev = adj[orig];
  }
  return adj;
}

// ─── Cross-subject CI test ───────────────────────────────────────────
//
// Per subject we compute a partial correlation r and a Fisher z; we
// then combine across subjects via Stouffer (already in the shared
// helper). Returns the combined z, p, mean r, and number of subjects
// that contributed. Subjects whose design matrix is rank-deficient
// (or whose effective n is below min_n) are skipped silently.

function combinedCITest(
  subjectGrids: Float64Array[][],
  yIdx: number,
  xIdx: number,
  xLag: number,
  conds: LaggedVar[],
  maxLag: number,
): { z: number; p: number; meanR: number; nSubjectsUsed: number } | null {
  const perSubject: { z: number; n: number; r: number }[] = [];
  for (const grid of subjectGrids) {
    if (grid[yIdx].length <= maxLag) continue;
    const { y, Z } = alignSeries(grid, yIdx, maxLag, conds);
    const x = alignSource(grid, xIdx, xLag, maxLag);
    const result = partialCorrelation(x, y, Z, { min_n: 20 });
    if (result === null) continue;
    perSubject.push({ z: result.z, n: result.n, r: result.r });
  }
  if (perSubject.length === 0) return null;
  const { z, p } = combineFisherZ(perSubject, conds.length);
  const meanR = perSubject.reduce((s, e) => s + e.r, 0) / perSubject.length;
  return { z, p, meanR, nSubjectsUsed: perSubject.length };
}

// ─── PCMCI core ──────────────────────────────────────────────────────

interface FinalCandidate {
  source: string;
  target: string;
  lagSteps: number;
  meanR: number;
  z: number;
  p: number;
  nSubjects: number;
  conds: LaggedVar[]; // diagnostic — what was conditioned on
}

export const pcmciLinearAlgorithm: DiscoveryAlgorithm<PcmciLinearParams> = {
  id: "pcmci-linear",
  version: "0.1.0",
  description:
    "PCMCI (Runge 2018) restricted to linear-Gaussian CI (partial " +
    "correlation + Fisher-z), lagged-only, one max_conds_dim knob. " +
    "PC-stable phase 1 prunes candidate parents under conditioning; " +
    "MCI phase 2 tests momentary conditional independence given the " +
    "selected parents. Honest about what subset of full PCMCI+ this is.",
  defaultParams: DEFAULT_PARAMS,

  run(cohort: Cohort, params?: Partial<PcmciLinearParams>): DiscoveryResult {
    const p = { ...this.defaultParams, ...params };
    // Per-run cache of unconditional r values per (yIdx, candKey). Used
    // only inside this call for the heuristic ordering of conditioning
    // candidates during PC-stable phase 1.
    const rCache: Map<number, Map<string, number>> = new Map();
    const variables = cohort.variables;
    const varIds = variables.map((v) => v.id);
    const subjectGrids: Float64Array[][] = [];
    for (const subj of cohort.subjects) {
      const grid = buildSubjectGrid(subj, variables, p.gridSeconds, p.minGridPoints);
      if (grid) subjectGrids.push(grid);
    }
    if (subjectGrids.length < p.minSubjects) {
      return {
        variables: varIds,
        edges: [],
        diagnostics: {
          reason: "fewer than minSubjects had enough grid points",
          minSubjects: p.minSubjects,
          gridSubjects: subjectGrids.length,
        },
      };
    }

    const maxLagSteps = Math.max(1, Math.floor(p.maxLagSeconds / p.gridSeconds));

    // Enumerate all candidate (lagged) parents (X[t-k]) for each Y.
    // Self-edges (X==Y, k>0) ARE allowed in PCMCI as a candidate
    // because autocorrelation is real and conditioning on it is
    // important; we drop them from the FINAL output below to stay
    // consistent with lag-correlation's "no autocorrelation in
    // discovered edges" stance.
    const allCandidatesByY: LaggedVar[][] = varIds.map(() => {
      const cands: LaggedVar[] = [];
      for (let v = 0; v < varIds.length; v++) {
        for (let k = 1; k <= maxLagSteps; k++) {
          cands.push({ vIndex: v, lagSteps: k });
        }
      }
      return cands;
    });

    // ── PHASE 1: PC-stable per target Y ──────────────────────────
    // Iteratively prune candidates whose partial correlation with Y
    // falls below pcAlpha when conditioning on a subset of currently-
    // surviving candidates. We grow conditioning size from 0 upward
    // until either (a) maxCondsDim reached, or (b) no candidate has
    // ≥ condDim other candidates to condition on.
    const survivingByY: LaggedVar[][] = allCandidatesByY.map((cs) => [...cs]);

    for (let condDim = 0; condDim <= p.maxCondsDim; condDim++) {
      for (let yIdx = 0; yIdx < varIds.length; yIdx++) {
        const survivors = survivingByY[yIdx];
        if (survivors.length <= condDim) continue;

        // Snapshot of candidates BEFORE this conditioning level — the
        // "stable" version of PC: every candidate is tested against
        // the same starting set so removal order doesn't matter.
        const starting = [...survivors];
        const toRemove = new Set<string>();

        for (const cand of starting) {
          // Build conditioning set asymmetrically: only condition on
          // candidates whose unconditional |r| with Y is GREATER than
          // the current candidate's. This is what tigramite does and
          // it preserves the strongest candidate naturally — the
          // top-ranked candidate gets an empty conditioning set, the
          // second-ranked gets {top-1}, etc. Without this asymmetry,
          // each candidate's neighbours absorb its signal and the
          // PC-stable phase wipes out the truth.
          const candAbsR = Math.abs(
            rCache.get(yIdx)?.get(lvKey(cand)) ?? 0,
          );
          const others = starting.filter((c) => lvKey(c) !== lvKey(cand));
          // Eligible conditioners: strictly stronger unconditional |r|.
          const eligible = others.filter(
            (o) =>
              Math.abs(rCache.get(yIdx)?.get(lvKey(o)) ?? 0) > candAbsR,
          );
          if (eligible.length < condDim) continue;
          eligible.sort((a, b) => {
            const ra = Math.abs(rCache.get(yIdx)?.get(lvKey(a)) ?? 0);
            const rb = Math.abs(rCache.get(yIdx)?.get(lvKey(b)) ?? 0);
            return rb - ra;
          });
          const conds = eligible.slice(0, condDim);

          // Test CI of (cand → Y) given conds.
          const tested = combinedCITest(
            subjectGrids,
            yIdx,
            cand.vIndex,
            cand.lagSteps,
            conds,
            maxLagSteps,
          );
          if (!tested) {
            toRemove.add(lvKey(cand));
            continue;
          }
          // Cache r at condDim=0 for later ordering.
          if (condDim === 0) {
            if (!rCache.has(yIdx)) rCache.set(yIdx, new Map());
            rCache.get(yIdx)!.set(lvKey(cand), tested.meanR);
          }
          if (tested.p > p.pcAlpha) toRemove.add(lvKey(cand));
        }

        survivingByY[yIdx] = survivors.filter(
          (c) => !toRemove.has(lvKey(c)),
        );
      }
    }

    // ── PHASE 2: MCI ─────────────────────────────────────────────
    // For each (X[t-k] → Y[t]) that survived phase 1, test CI given:
    //   parents(Y) = the lagged candidates surviving phase 1 for Y
    //   parents(X[t-k]) lifted by k = the surviving parents of X
    //                                lagged by k more.
    // We collect p-values, then BH-FDR across all of them.
    const candidates: FinalCandidate[] = [];
    for (let yIdx = 0; yIdx < varIds.length; yIdx++) {
      for (const x of survivingByY[yIdx]) {
        // Conditioning = parents(Y) ∪ parents(X[t-x.lag]) shifted by x.lag.
        // Exclude x itself from parents(Y).
        const parentsY = survivingByY[yIdx].filter(
          (p) => lvKey(p) !== lvKey(x),
        );
        const parentsXshifted: LaggedVar[] = (survivingByY[x.vIndex] ?? []).map(
          (q) => ({ vIndex: q.vIndex, lagSteps: q.lagSteps + x.lagSteps }),
        );
        // Bound conditioning set by maxLagSteps so alignSeries can
        // afford the trim.
        const condsRaw = [...parentsY, ...parentsXshifted].filter(
          (c) => c.lagSteps <= maxLagSteps,
        );
        // Deduplicate (vIndex, lagSteps) pairs.
        const seen = new Set<string>();
        const dedup = condsRaw.filter((c) => {
          const k = lvKey(c);
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        });
        // Cap MCI conditioning set: keep the strongest by unconditional
        // |r| with the target Y. Without this cap the conditioning set
        // accumulates linearly with the variable count and the partial
        // correlation collapses on small-N real-world cohorts.
        dedup.sort((a, b) => {
          const ra = Math.abs(rCache.get(yIdx)?.get(lvKey(a)) ?? 0);
          const rb = Math.abs(rCache.get(yIdx)?.get(lvKey(b)) ?? 0);
          return rb - ra;
        });
        const conds = dedup.slice(0, p.maxCondsDimMci);

        const tested = combinedCITest(
          subjectGrids,
          yIdx,
          x.vIndex,
          x.lagSteps,
          conds,
          maxLagSteps,
        );
        if (!tested) continue;
        if (tested.nSubjectsUsed < p.minSubjects) continue;
        candidates.push({
          source: varIds[x.vIndex],
          target: varIds[yIdx],
          lagSteps: x.lagSteps,
          meanR: tested.meanR,
          z: tested.z,
          p: tested.p,
          nSubjects: tested.nSubjectsUsed,
          conds,
        });
      }
    }

    // BH-FDR across the final candidate set.
    const ps = candidates.map((c) => c.p);
    const adjPs = bhAdjust(ps);
    const edges: DiscoveredEdge[] = [];
    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      // Drop self-edges from the discovered output (autocorrelation,
      // not structure). They were *useful* during PCMCI conditioning.
      if (c.source === c.target) continue;
      if (adjPs[i] > p.mciAlpha) continue;
      edges.push({
        source: c.source,
        target: c.target,
        lag: c.lagSteps * p.gridSeconds,
        strength: c.meanR,
        pValue: adjPs[i],
        evidence:
          `MCI partial-r=${c.meanR.toFixed(3)} across ${c.nSubjects} subjects ` +
          `at lag ${c.lagSteps * p.gridSeconds}s, conditioning on ${c.conds.length} ` +
          `lagged covariates; BH-adjusted p=${adjPs[i].toExponential(2)}.`,
      });
    }
    edges.sort((a, b) => {
      const ds = Math.abs(b.strength) - Math.abs(a.strength);
      return ds !== 0 ? ds : (a.pValue ?? 1) - (b.pValue ?? 1);
    });

    return {
      variables: varIds,
      edges,
      diagnostics: {
        nSubjectsUsed: subjectGrids.length,
        nFinalCandidates: candidates.length,
        nEdgesAfterFDR: edges.length,
        averageCondSize: candidates.length === 0
          ? 0
          : candidates.reduce((s, c) => s + c.conds.length, 0) / candidates.length,
        params: p,
      },
    };
  },
};

