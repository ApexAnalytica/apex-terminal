// ─── FCI (Fast Causal Inference) — minimum viable ───────────────────
//
// HONEST FRAMING — READ FIRST
// ----------------------------
// FCI of Spirtes, Meek & Richardson (1995) discovers causal structure
// in the *presence of latent confounders*. Where PC / PCMCI assume
// causal sufficiency, FCI does not — its output is a Partial Ancestral
// Graph (PAG) whose edges carry *endpoint marks* (circle / arrow / tail)
// that encode what's known about ancestry vs. what stays uncertain due
// to possibly-hidden common causes.
//
// This is a MINIMUM-VIABLE FCI. It implements:
//
//   1. Skeleton phase (PC-stable). Start with the complete undirected
//      graph; for every adjacent pair (X, Y), search for a separating
//      set among the *current* adjacencies of X (snapshotted per
//      conditioning depth, hence "stable"). Edges where any subset of
//      adj(X) \ {Y} of size ≤ maxCondsDim renders X ⊥ Y with p > alpha
//      are removed and their separating set is recorded.
//
//   2. V-structure orientation. For every unshielded triple (X, Z, Y) —
//      i.e. X-Z and Z-Y edges with X and Y NOT adjacent — orient as
//      X *→ Z ←* Y when Z is NOT in sepset(X, Y). The asterisks signal
//      that the marks at the X-side and Y-side stay as circles for now.
//      This is the FCI variant of the standard collider rule.
//
//   3. Zhang's R1 + R2 orientation rules (fixed-point pass). R1
//      propagates an arrowhead through Y when X *→ Y o-* Z and X, Z
//      are not adjacent (Y can't be a collider, so orient Y → Z).
//      R2 propagates an arrowhead at Z through a definite directed
//      sub-path X → Y *→ Z (or X *→ Y → Z) onto an X-Z edge.
//
//   4. PAG output. Each surviving edge carries `endpointMarks` with
//      `circle` (uncertain), `arrow` (arrowhead), or `tail` (ancestor).
//      Initial state is `{ circle, circle }`; the orientation phase
//      sets marks via the v-structure rule and Zhang's R1 / R2.
//
// What this DOES NOT do (vs. the full Spirtes implementation):
//
//   - No FCI orientation rules R3 / R4 (Zhang 2008). Those handle
//     discriminating paths and refine the PAG further. Without them,
//     edges in regions of the graph that need a discriminating-path
//     argument can remain `circle / circle`. Adding them is a
//     bounded follow-up.
//
//   - No nonparametric CI tests. Linear-Gaussian partial correlation
//     only (same baseline as PCMCI in this codebase). For step changes
//     in T1D physiological data this is reasonable; for highly nonlinear
//     macro signals it under-detects.
//
//   - Contemporaneous only. PCMCI handles temporal-lag direction; FCI
//     here makes no use of time order. Mixing the two (a fully temporal
//     PAG via FCI+) is a separate algorithm.
//
//   - No selection-bias corrections. Plain FCI, not RFCI / FCI+.
//
// The output shape is identical to PCMCI / lag-correlation (a list of
// `DiscoveredEdge`), with the addition of `endpointMarks` populated
// per-edge so consumers that understand PAGs can render the marks and
// consumers that don't will see a single direction (the source→target
// convention preserved by alphabetical ordering of the pair).

import type { Cohort, Subject, Variable } from "../cohort-types";
import type { DiscoveryAlgorithm } from "../algorithm-interface";
import type { DiscoveredEdge, DiscoveryResult } from "../run-types";
import { partialCorrelation } from "./_partial-correlation";

export interface FciParams {
  /** Significance threshold for the conditional-independence test. */
  alpha: number;
  /** Cap on the conditioning-set size during the skeleton phase. */
  maxCondsDim: number;
  /** Grid cadence in seconds for cohort-data resampling. */
  gridSeconds: number;
  /** Minimum grid points per subject — drop subjects shorter than this. */
  minGridPoints: number;
  /** Minimum effective sample size for a CI test. */
  minN: number;
}

const DEFAULT_PARAMS: FciParams = {
  alpha: 0.05,
  maxCondsDim: 3,
  gridSeconds: 300,
  minGridPoints: 30,
  minN: 30,
};

// ─── Cohort → contemporaneous data matrix ────────────────────────────

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

/** Concatenate per-subject grids into one contemporaneous matrix per variable. */
function buildContemporaneousMatrix(
  cohort: Cohort,
  params: FciParams,
): { data: number[][]; variableIds: string[] } | null {
  const grids: Float64Array[][] = [];
  for (const subject of cohort.subjects) {
    const grid = buildSubjectGrid(
      subject,
      cohort.variables,
      params.gridSeconds,
      params.minGridPoints,
    );
    if (grid) grids.push(grid);
  }
  if (grids.length === 0) return null;

  const variableIds = cohort.variables.map((v) => v.id);
  const data: number[][] = variableIds.map(() => []);
  for (const grid of grids) {
    const subjectN = grid[0].length;
    for (let i = 0; i < subjectN; i++) {
      for (let v = 0; v < variableIds.length; v++) {
        data[v].push(grid[v][i]);
      }
    }
  }
  return { data, variableIds };
}

// ─── Skeleton phase (PC-stable) ──────────────────────────────────────

/**
 * Output of the skeleton phase. Exported for unit-testing the
 * orientation rules with a constructed fixture.
 */
export interface SkeletonResult {
  /** Adjacency: adj[i] = set of indices currently adjacent to variable i. */
  adj: Set<number>[];
  /** sepset[i][j] = the conditioning set that separated i,j (undefined if still adjacent). */
  sepset: Map<string, number[]>;
  /** The (i, j) pair-key: smaller index first, joined with ":". */
  pairKey: (a: number, b: number) => string;
  /** Marginal CI test results, kept for edge-strength annotation. */
  marginalR: Map<string, { r: number; p: number; n: number }>;
}

function pairKey(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

function* subsetsOfSize<T>(arr: T[], size: number): Generator<T[]> {
  if (size === 0) {
    yield [];
    return;
  }
  if (size > arr.length) return;
  const idx = Array.from({ length: size }, (_, i) => i);
  while (true) {
    yield idx.map((i) => arr[i]);
    let i = size - 1;
    while (i >= 0 && idx[i] === arr.length - size + i) i -= 1;
    if (i < 0) return;
    idx[i] += 1;
    for (let j = i + 1; j < size; j++) idx[j] = idx[i] + (j - i);
  }
}

function runSkeleton(
  data: number[][],
  params: FciParams,
): SkeletonResult {
  const n = data.length;
  const adj: Set<number>[] = [];
  for (let i = 0; i < n; i++) {
    const s = new Set<number>();
    for (let j = 0; j < n; j++) if (j !== i) s.add(j);
    adj.push(s);
  }
  const sepset = new Map<string, number[]>();
  const marginalR = new Map<string, { r: number; p: number; n: number }>();

  // Capture marginals first so we can annotate edges later regardless of pruning.
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const r = partialCorrelation(data[i], data[j], [], { min_n: params.minN });
      if (r) marginalR.set(pairKey(i, j), { r: r.r, p: r.p, n: r.n });
    }
  }

  for (let depth = 0; depth <= params.maxCondsDim; depth++) {
    // PC-stable: snapshot adjacencies at the start of each depth iteration.
    const adjSnapshot: Set<number>[] = adj.map((s) => new Set(s));
    let any = false;
    for (let i = 0; i < n; i++) {
      const neighbors = [...adjSnapshot[i]];
      if (neighbors.length - 1 < depth) continue;
      for (const j of neighbors) {
        if (!adj[i].has(j)) continue; // edge already removed in this iteration
        const candidates = neighbors.filter((k) => k !== j);
        for (const cset of subsetsOfSize(candidates, depth)) {
          const Zcols: number[][] = [];
          for (let row = 0; row < data[0].length; row++) {
            const r: number[] = [];
            for (const k of cset) r.push(data[k][row]);
            Zcols.push(r);
          }
          const result = partialCorrelation(data[i], data[j], Zcols, {
            min_n: params.minN,
          });
          if (!result) continue;
          if (result.p > params.alpha) {
            adj[i].delete(j);
            adj[j].delete(i);
            sepset.set(pairKey(i, j), cset.slice());
            any = true;
            break;
          }
        }
      }
    }
    if (!any && depth > 0) break;
  }

  return { adj, sepset, pairKey, marginalR };
}

// ─── Orientation phase (v-structures + Zhang R1 + R2) ───────────────

type Mark = "circle" | "arrow" | "tail";

interface OrientedEdge {
  /** Lower-index endpoint of the pair. */
  a: number;
  /** Higher-index endpoint of the pair. */
  b: number;
  /** Mark at the a-side. */
  markA: Mark;
  /** Mark at the b-side. */
  markB: Mark;
}

function markAt(edge: OrientedEdge, nodeIdx: number): Mark {
  return edge.a === nodeIdx ? edge.markA : edge.markB;
}

function setMarkAt(edge: OrientedEdge, nodeIdx: number, mark: Mark): void {
  if (edge.a === nodeIdx) edge.markA = mark;
  else edge.markB = mark;
}

/**
 * Run the orientation phase: v-structure rule, then Zhang's R1 + R2 as
 * a fixed-point pass. Exported for unit-testing the rules directly
 * with a constructed `SkeletonResult` fixture.
 */
export function runOrientation(skeleton: SkeletonResult): OrientedEdge[] {
  const edges = new Map<string, OrientedEdge>();
  const n = skeleton.adj.length;
  for (let i = 0; i < n; i++) {
    for (const j of skeleton.adj[i]) {
      if (j <= i) continue;
      edges.set(pairKey(i, j), {
        a: i,
        b: j,
        markA: "circle",
        markB: "circle",
      });
    }
  }

  // V-structure rule: for every unshielded triple (X, Z, Y), if Z not in
  // sepset(X, Y), set the Z-side mark to "arrow" on both X-Z and Y-Z.
  for (let z = 0; z < n; z++) {
    const nbrs = [...skeleton.adj[z]];
    for (let p = 0; p < nbrs.length; p++) {
      for (let q = p + 1; q < nbrs.length; q++) {
        const x = nbrs[p];
        const y = nbrs[q];
        if (skeleton.adj[x].has(y)) continue; // shielded
        const sep = skeleton.sepset.get(pairKey(x, y));
        if (!sep) continue;
        if (sep.includes(z)) continue;
        // Collider X *→ Z ←* Y: arrow at Z on both incident edges.
        const exz = edges.get(pairKey(x, z));
        const eyz = edges.get(pairKey(y, z));
        if (exz) setMarkAt(exz, z, "arrow");
        if (eyz) setMarkAt(eyz, z, "arrow");
      }
    }
  }

  // Zhang's orientation rules R1 + R2 — fixed-point pass.
  //
  //   R1: If X *→ Y o-* Z, and X, Z not adjacent, orient Y o-* Z as
  //       Y → Z (tail at Y, arrow at Z). Propagates an arrowhead at Y
  //       outward, since Y can't be a collider in (X, Y, Z).
  //
  //   R2: If X → Y *→ Z, or X *→ Y → Z, and X *-o Z, orient X *-o Z
  //       as X *→ Z (arrow at Z). Propagates an arrowhead through a
  //       definite directed sub-path.
  //
  // Higher-numbered rules (R3, R4) handle discriminating paths and
  // are deferred — uninformative cases stay as `circle / circle`.
  let changed = true;
  let safetyIterations = 0;
  while (changed && safetyIterations < n * n * 4) {
    changed = false;
    safetyIterations += 1;

    // R1: triple (X, Y, Z) with X-Y, Y-Z edges, X-Z not adjacent.
    for (let y = 0; y < n; y++) {
      const nbrs = [...skeleton.adj[y]];
      for (const x of nbrs) {
        for (const z of nbrs) {
          if (x === z) continue;
          if (skeleton.adj[x].has(z)) continue; // shielded
          const exy = edges.get(pairKey(x, y));
          const eyz = edges.get(pairKey(y, z));
          if (!exy || !eyz) continue;
          if (markAt(exy, y) !== "arrow") continue; // need X *→ Y
          if (markAt(eyz, y) !== "circle") continue; // need Y o-* Z
          setMarkAt(eyz, y, "tail");
          if (markAt(eyz, z) === "circle") setMarkAt(eyz, z, "arrow");
          changed = true;
        }
      }
    }

    // R2: triple (X, Y, Z) with X-Y, Y-Z, X-Z all edges (Y is a
    //     mediator). Either X→Y AND Y*→Z, or X*→Y AND Y→Z. Propagate
    //     the arrowhead at Z through the chain.
    for (let y = 0; y < n; y++) {
      const nbrs = [...skeleton.adj[y]];
      for (const x of nbrs) {
        for (const z of nbrs) {
          if (x === z) continue;
          if (!skeleton.adj[x].has(z)) continue; // need X-Z adjacent
          const exy = edges.get(pairKey(x, y));
          const eyz = edges.get(pairKey(y, z));
          const exz = edges.get(pairKey(x, z));
          if (!exy || !eyz || !exz) continue;
          const directedXY =
            markAt(exy, x) === "tail" && markAt(exy, y) === "arrow";
          const directedYZ =
            markAt(eyz, y) === "tail" && markAt(eyz, z) === "arrow";
          const arrowAtYonXY = markAt(exy, y) === "arrow";
          const arrowAtZonYZ = markAt(eyz, z) === "arrow";
          const triggers =
            (directedXY && arrowAtZonYZ) || (arrowAtYonXY && directedYZ);
          if (!triggers) continue;
          if (markAt(exz, z) !== "circle") continue;
          setMarkAt(exz, z, "arrow");
          changed = true;
        }
      }
    }
  }

  return [...edges.values()];
}

// ─── Edge → DiscoveredEdge ───────────────────────────────────────────

function describeMarks(markA: Mark, markB: Mark): string {
  const a = markA === "arrow" ? "<" : markA === "tail" ? "-" : "o";
  const b = markB === "arrow" ? ">" : markB === "tail" ? "-" : "o";
  return `${a}-${b}`;
}

function classifyMarks(markA: Mark, markB: Mark): string {
  if (markA === "arrow" && markB === "arrow") return "bidirected (latent confounder candidate)";
  if (markA === "tail" && markB === "arrow") return "directed";
  if (markA === "arrow" && markB === "tail") return "directed";
  if (markA === "circle" && markB === "arrow") return "possibly causal";
  if (markA === "arrow" && markB === "circle") return "possibly causal";
  return "uncertain";
}

// ─── Algorithm export ────────────────────────────────────────────────

export const fciAlgorithm: DiscoveryAlgorithm<FciParams> = {
  id: "fci",
  version: "0.2.0",
  description:
    "FCI (Fast Causal Inference) — skeleton phase + v-structure orientation + Zhang's R1 + R2 orientation rules. Returns a PAG with endpoint marks (circle / arrow / tail). Linear-Gaussian CI tests via partial correlation.",
  defaultParams: DEFAULT_PARAMS,
  run(cohort: Cohort, paramOverrides?: Partial<FciParams>): DiscoveryResult {
    const params: FciParams = { ...DEFAULT_PARAMS, ...paramOverrides };

    const matrix = buildContemporaneousMatrix(cohort, params);
    if (!matrix) {
      return {
        variables: cohort.variables.map((v) => v.id),
        edges: [],
        diagnostics: { reason: "no subject grids met minGridPoints" },
      };
    }
    const { data, variableIds } = matrix;

    const skeleton = runSkeleton(data, params);
    const orientedEdges = runOrientation(skeleton);

    const edges: DiscoveredEdge[] = [];
    for (const oe of orientedEdges) {
      const sourceIdx = oe.a;
      const targetIdx = oe.b;
      const sourceMark = oe.markA;
      const targetMark = oe.markB;
      const marg = skeleton.marginalR.get(pairKey(oe.a, oe.b));
      const visual = describeMarks(sourceMark, targetMark);
      const cls = classifyMarks(sourceMark, targetMark);
      edges.push({
        source: variableIds[sourceIdx],
        target: variableIds[targetIdx],
        strength: marg ? Math.abs(marg.r) : 0,
        pValue: marg?.p,
        evidence: `${visual} — ${cls} (skeleton ⌷ v-structures + R1/R2, FCI v0.2)`,
        endpointMarks: { sourceMark, targetMark },
      });
    }

    edges.sort((a, b) => {
      if (a.source !== b.source) return a.source.localeCompare(b.source);
      return a.target.localeCompare(b.target);
    });

    return {
      variables: variableIds,
      edges,
      diagnostics: {
        sampleSize: data[0]?.length ?? 0,
        sepsetCount: skeleton.sepset.size,
        params,
      },
    };
  },
};
