// ─── Shared cohort-data helpers ───────────────────────────────────────
//
// Until this module existed, every contemporaneous-discovery algorithm
// (`notears`, `notears-mlp`, `fci`, `pcmci-linear`, `lag-correlation`)
// re-implemented `buildSubjectGrid` — same logic, copy-pasted with a few
// stylistic drifts (extracted intermediate variables, comment additions).
// Identical functionally. This module is the single source of truth.
//
// What stays per-algorithm: each one's own data-matrix assembly (which
// standardises columns, builds row-major vs column-major matrices,
// applies different minimum-sample thresholds). Those genuinely differ.
//
// What's shared: turning a `Subject`'s irregularly-sampled measurements
// into a regular `Float64Array` grid per variable. This is the
// resampling step that's identical regardless of which downstream
// algorithm consumes the grid.

import type { Subject, Variable } from "../cohort-types";

/**
 * Resample a subject's measurements onto a regular grid of cadence
 * `gridSeconds` seconds.
 *
 * Returns one Float64Array per variable (length = nGrid). The
 * resampling rule depends on the variable's `kind`:
 *
 *   - "event" / "binary": COUNT — number of events falling within each
 *     grid bucket. Used for sanctions, regulatory triggers, etc.
 *   - everything else (continuous): SAMPLE-AND-HOLD — value of the
 *     most recent measurement at or before the bucket centre. Buckets
 *     before the first measurement get NaN (downstream code's job to
 *     skip them).
 *
 * Returns null when the subject has no measurements OR its time span
 * yields fewer than `minGridPoints` buckets — too short to fit a
 * meaningful structure on.
 */
export function buildSubjectGrid(
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
  const nGrid = Math.floor((tMax - tMin) / gridSeconds);
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
