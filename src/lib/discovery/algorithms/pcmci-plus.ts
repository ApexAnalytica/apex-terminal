// ─── PCMCI+ (linear-Gaussian, lagged + contemporaneous) ──────────────
//
// HONEST FRAMING — READ FIRST
// ----------------------------
// Extends `pcmci-linear.ts` with PCMCI+ (Runge 2020): contemporaneous
// edges between time-series variables at the same time step, with a
// principled orientation step.
//
// What this DOES:
//
//   1. Phase 1 — Reuses the existing lagged PCMCI to find X[t-k] → Y[t]
//      with k > 0 (no duplication; the lagged backbone is identical).
//
//   2. Phase 2 — Contemporaneous skeleton. For each unordered pair
//      (i, j), test partial correlation of X_i[t] ↔ X_j[t] conditional
//      on the UNION of lagged parents of both variables (derived from
//      Phase 1's edge list). Survivors after BH-FDR become candidate
//      contemporaneous edges.
//
//   3. Phase 3 — Lagged-parent-imbalance orientation. A contemporaneous
//      edge i — j is oriented i → j when i has a lagged parent that is
//      NOT also a lagged parent of j (asymmetric exogenous information
//      flow into i pins the direction). When both sides have unique
//      lagged parents or neither does, the edge remains undirected and
//      is emitted with `endpointMarks: { sourceMark: "circle",
//      targetMark: "circle" }` — same convention FCI uses for uncertain
//      orientation.
//
// What this does NOT do (vs the full PCMCI+ in Runge 2020):
//
//   - No contemporaneous PC-stable with separating-set tracking. The
//     skeleton phase tests one conditioning set per pair (the union of
//     lagged parents), not a hierarchy of subsets. This is conservative
//     — we may keep edges that full PCMCI+ would prune via a stricter
//     contemporaneous-only conditioning set.
//   - No v-structure detection from separating sets (since we don't
//     track them).
//   - No Meek-rule propagation. Orientation is per-edge, decided once
//     from lagged-parent imbalance.
//   - No nonparametric CI tests (CMI-knn, GP-DC). Linear/Gaussian only.
//
// Practical implication of the orientation rule in v0.1:
//
//   The lagged-parent-imbalance rule fires strict directed orientation
//   only when ONE endpoint has at least one lagged parent the other
//   doesn't. In real time series with contemporaneous coupling X[t] →
//   Y[t], a lagged ancestor W[t-k] of X also predicts Y[t] through the
//   chain W[t-k] → X[t] → Y[t]. Without a contemporaneous PC-stable
//   phase to condition on X[t], the lagged phase typically marks W
//   as a parent of BOTH X and Y. Result: most contemporaneous edges
//   in realistic data emit as undirected (circle/circle). The rule
//   produces strict directed output only when one side has truly no
//   lagged ancestry path to the other — uncommon but informative
//   when it happens.
//
// Why we ship this anyway: the lagged-parent imbalance rule captures
// the strongest signal that pins contemporaneous orientation in real
// time series — when a variable is driven by external lagged forces
// the other isn't, it's almost certainly the upstream side of the
// contemporaneous edge. The conservative skeleton phase plus this
// orientation rule produces honest results: a directed-where-we-can,
// undirected-where-we-can't CPDAG-ish output.

import type { Cohort } from "../cohort-types";
import type { DiscoveryAlgorithm } from "../algorithm-interface";
import type { DiscoveredEdge, DiscoveryResult } from "../run-types";
import { combineFisherZ, partialCorrelation } from "./_partial-correlation";
import { buildSubjectGrid } from "./_cohort-data";
import { pcmciLinearAlgorithm } from "./pcmci-linear";

export interface PcmciPlusParams {
  /** Maximum lag in seconds. Default 1800 (30 min). */
  maxLagSeconds: number;
  /** Grid cadence in seconds. Default 300 (5 min). */
  gridSeconds: number;
  /** Significance threshold for PC-stable phase pruning (lagged). */
  pcAlpha: number;
  /** Final FDR-adjusted p-value threshold for MCI phase (lagged). */
  mciAlpha: number;
  /** FDR-adjusted p-value threshold for contemporaneous edges. */
  contempAlpha: number;
  /** Cap on the conditioning-set size during PC-stable phase 1. */
  maxCondsDim: number;
  /** Cap on the conditioning-set size in the MCI phase. */
  maxCondsDimMci: number;
  /** Minimum subjects per candidate. */
  minSubjects: number;
  /** Minimum grid points per subject. */
  minGridPoints: number;
}

const DEFAULT_PARAMS: PcmciPlusParams = {
  maxLagSeconds: 1800,
  gridSeconds: 300,
  pcAlpha: 0.05,
  mciAlpha: 0.05,
  contempAlpha: 0.05,
  maxCondsDim: 3,
  maxCondsDimMci: 5,
  minSubjects: 3,
  minGridPoints: 30,
};

interface LaggedVar {
  vIndex: number;
  lagSteps: number;
}

// ─── Helpers vendored from pcmci-linear ───────────────────────────────
//
// These are the same building blocks PCMCI uses; vendored here rather
// than re-exported so the lagged module stays self-contained and a
// future change to its private helpers doesn't break us.

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

function combinedContempCITest(
  subjectGrids: Float64Array[][],
  yIdx: number,
  xIdx: number,
  conds: LaggedVar[],
  maxLag: number,
): { z: number; p: number; meanR: number; nSubjectsUsed: number } | null {
  const perSubject: { z: number; n: number; r: number }[] = [];
  for (const grid of subjectGrids) {
    if (grid[yIdx].length <= maxLag) continue;
    const { y, Z } = alignSeries(grid, yIdx, maxLag, conds);
    // Contemporaneous source: lag = 0 alignment.
    const x = alignSource(grid, xIdx, 0, maxLag);
    const result = partialCorrelation(x, y, Z, { min_n: 20 });
    if (result === null) continue;
    perSubject.push({ z: result.z, n: result.n, r: result.r });
  }
  if (perSubject.length === 0) return null;
  const { z, p } = combineFisherZ(perSubject, conds.length);
  const meanR = perSubject.reduce((s, e) => s + e.r, 0) / perSubject.length;
  return { z, p, meanR, nSubjectsUsed: perSubject.length };
}

// ─── PCMCI+ ───────────────────────────────────────────────────────────

export const pcmciPlusAlgorithm: DiscoveryAlgorithm<PcmciPlusParams> = {
  id: "pcmci-plus",
  version: "0.1.0",
  description:
    "PCMCI+ (Runge 2020) restricted to linear-Gaussian CI. Reuses the " +
    "existing lagged PCMCI for X[t-k] → Y[t] edges, then adds a " +
    "contemporaneous skeleton phase (partial correlation conditioned on " +
    "the union of lagged parents of both endpoints) and orients via " +
    "lagged-parent imbalance. Unoriented contemporaneous edges emit " +
    "with circle/circle endpoint marks. Honest about what subset of " +
    "full PCMCI+ this is (no contemporaneous PC-stable, no v-structure " +
    "detection from separating sets, no Meek propagation).",
  defaultParams: DEFAULT_PARAMS,

  run(cohort: Cohort, params?: Partial<PcmciPlusParams>): DiscoveryResult {
    const p = { ...this.defaultParams, ...params };
    const variables = cohort.variables;
    const varIds = variables.map((v) => v.id);

    // ── Phase 1: lagged PCMCI (reuse existing impl) ──────────────────
    const laggedResult = pcmciLinearAlgorithm.run(cohort, {
      maxLagSeconds: p.maxLagSeconds,
      gridSeconds: p.gridSeconds,
      pcAlpha: p.pcAlpha,
      mciAlpha: p.mciAlpha,
      maxCondsDim: p.maxCondsDim,
      maxCondsDimMci: p.maxCondsDimMci,
      minSubjects: p.minSubjects,
      minGridPoints: p.minGridPoints,
    });

    // Bail if the lagged phase couldn't proceed (e.g. too few subjects
    // had grid points). Diagnostics are forwarded so the failure mode
    // is identical to plain PCMCI.
    if (laggedResult.edges.length === 0 && laggedResult.diagnostics?.reason) {
      return laggedResult;
    }

    // Build parents-by-Y from the lagged edges so the contemporaneous
    // CI tests can condition on them.
    const idToIdx = new Map(varIds.map((id, i) => [id, i] as const));
    const parentsByY = new Map<number, LaggedVar[]>();
    for (let i = 0; i < varIds.length; i++) parentsByY.set(i, []);
    for (const e of laggedResult.edges) {
      const yIdx = idToIdx.get(e.target);
      const xIdx = idToIdx.get(e.source);
      if (yIdx === undefined || xIdx === undefined) continue;
      const k = Math.round((e.lag ?? 0) / p.gridSeconds);
      if (k <= 0) continue;
      parentsByY.get(yIdx)!.push({ vIndex: xIdx, lagSteps: k });
    }

    // ── Phase 2: contemporaneous skeleton ────────────────────────────
    // Build subject grids ONCE for the contemporaneous phase. The
    // lagged phase built and discarded its own; rebuilding here keeps
    // the two phases decoupled (the lagged module owns its internals).
    const subjectGrids: Float64Array[][] = [];
    for (const subj of cohort.subjects) {
      const grid = buildSubjectGrid(
        subj,
        variables,
        p.gridSeconds,
        p.minGridPoints,
      );
      if (grid) subjectGrids.push(grid);
    }
    if (subjectGrids.length < p.minSubjects) {
      // The lagged phase passed the threshold but the contemporaneous
      // phase didn't — shouldn't happen unless the cohort changed
      // between calls. Emit lagged edges anyway, surface as diagnostic.
      return {
        variables: varIds,
        edges: laggedResult.edges,
        diagnostics: {
          ...laggedResult.diagnostics,
          contemporaneousPhase: "skipped — insufficient subjects",
        },
      };
    }

    const maxLagSteps = Math.max(
      1,
      Math.floor(p.maxLagSeconds / p.gridSeconds),
    );

    interface ContempCand {
      i: number;
      j: number;
      meanR: number;
      p: number;
      condCount: number;
    }
    const contempCandidates: ContempCand[] = [];
    for (let i = 0; i < varIds.length; i++) {
      for (let j = i + 1; j < varIds.length; j++) {
        // Conditioning set: union of lagged parents of both endpoints
        // (excluding any self-loop on i or j at lag 0, which doesn't exist
        // since lagged parents have k ≥ 1 anyway).
        const condKeys = new Set<string>();
        const conds: LaggedVar[] = [];
        const add = (lv: LaggedVar) => {
          const key = `${lv.vIndex}@${lv.lagSteps}`;
          if (condKeys.has(key)) return;
          condKeys.add(key);
          conds.push(lv);
        };
        for (const lv of parentsByY.get(i) ?? []) add(lv);
        for (const lv of parentsByY.get(j) ?? []) add(lv);

        const result = combinedContempCITest(
          subjectGrids,
          i,
          j,
          conds,
          maxLagSteps,
        );
        if (result === null) continue;
        contempCandidates.push({
          i,
          j,
          meanR: result.meanR,
          p: result.p,
          condCount: conds.length,
        });
      }
    }

    // BH-FDR over contemporaneous candidates only (independent of lagged
    // tests; mixing the two would dilute power on whichever side is
    // smaller).
    const adjusted = bhAdjust(contempCandidates.map((c) => c.p));
    const survivors = contempCandidates
      .map((c, idx) => ({ ...c, pAdj: adjusted[idx] }))
      .filter((c) => c.pAdj <= p.contempAlpha);

    // ── Phase 3: lagged-parent-imbalance orientation ─────────────────
    const parentSetByY = new Map<number, Set<string>>();
    for (const [yIdx, ps] of parentsByY.entries()) {
      parentSetByY.set(
        yIdx,
        new Set(ps.map((lv) => `${lv.vIndex}@${lv.lagSteps}`)),
      );
    }
    function uniqueLaggedParents(a: number, b: number): boolean {
      const aSet = parentSetByY.get(a) ?? new Set();
      const bSet = parentSetByY.get(b) ?? new Set();
      for (const k of aSet) if (!bSet.has(k)) return true;
      return false;
    }

    const contempEdges: DiscoveredEdge[] = [];
    for (const c of survivors) {
      const iUnique = uniqueLaggedParents(c.i, c.j);
      const jUnique = uniqueLaggedParents(c.j, c.i);
      // Strict orientation: orient ONLY when exactly one side has unique
      // lagged parents. Otherwise emit as undirected (circle/circle).
      if (iUnique && !jUnique) {
        contempEdges.push({
          source: varIds[c.i],
          target: varIds[c.j],
          // lag intentionally omitted → contemporaneous
          strength: c.meanR,
          pValue: c.p,
          evidence: `Contemporaneous |r|=${Math.abs(c.meanR).toFixed(
            3,
          )} after conditioning on ${c.condCount} lagged parents; oriented ${
            varIds[c.i]
          } → ${varIds[c.j]} by lagged-parent imbalance (source has unique lagged exogenous drivers).`,
        });
      } else if (jUnique && !iUnique) {
        contempEdges.push({
          source: varIds[c.j],
          target: varIds[c.i],
          strength: c.meanR,
          pValue: c.p,
          evidence: `Contemporaneous |r|=${Math.abs(c.meanR).toFixed(
            3,
          )} after conditioning on ${c.condCount} lagged parents; oriented ${
            varIds[c.j]
          } → ${varIds[c.i]} by lagged-parent imbalance (source has unique lagged exogenous drivers).`,
        });
      } else {
        // Undirected — circle on both ends per FCI convention.
        contempEdges.push({
          source: varIds[c.i],
          target: varIds[c.j],
          strength: c.meanR,
          pValue: c.p,
          evidence: `Contemporaneous |r|=${Math.abs(c.meanR).toFixed(
            3,
          )} after conditioning on ${c.condCount} lagged parents; orientation ambiguous (neither endpoint has unique lagged parents).`,
          endpointMarks: { sourceMark: "circle", targetMark: "circle" },
        });
      }
    }

    return {
      variables: varIds,
      edges: [...laggedResult.edges, ...contempEdges],
      diagnostics: {
        ...laggedResult.diagnostics,
        contemporaneousPhase: {
          candidatesTested: contempCandidates.length,
          survivorsAfterFdr: survivors.length,
          orientedDirected: contempEdges.filter((e) => !e.endpointMarks)
            .length,
          orientedUndirected: contempEdges.filter((e) => e.endpointMarks)
            .length,
        },
      },
    };
  },
};
