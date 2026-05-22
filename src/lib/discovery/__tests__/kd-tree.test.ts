import { describe, it, expect } from "vitest";
import {
  buildKdTree,
  kNearest,
  countWithinRadius,
} from "../algorithms/_kd-tree";

// ─── KD-tree (Chebyshev / max-norm) tests ─────────────────────────────
//
// Verify build, k-NN search, and range-count operations against ground
// truth computed by exhaustive O(N²) scans. KD-tree results must match
// naive byte-for-byte (modulo tie-breaking, which we avoid by using
// points spaced well apart).

function chebyshev(a: number[], b: number[]): number {
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    const dd = Math.abs(a[i] - b[i]);
    if (dd > d) d = dd;
  }
  return d;
}

function naiveKNearest(
  points: number[][],
  query: number[],
  k: number,
  excludeIndex: number,
): { index: number; dist: number }[] {
  const all: { index: number; dist: number }[] = [];
  for (let i = 0; i < points.length; i++) {
    if (i === excludeIndex) continue;
    all.push({ index: i, dist: chebyshev(query, points[i]) });
  }
  all.sort((a, b) => a.dist - b.dist);
  return all.slice(0, k);
}

function naiveCountWithin(
  points: number[][],
  query: number[],
  radius: number,
  excludeIndex: number,
): number {
  let c = 0;
  for (let i = 0; i < points.length; i++) {
    if (i === excludeIndex) continue;
    if (chebyshev(query, points[i]) < radius) c++;
  }
  return c;
}

function lcg(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return ((state >>> 8) / 0xffffff) * 2 - 1;
  };
}

describe("buildKdTree", () => {
  it("returns null on empty input", () => {
    expect(buildKdTree([])).toBeNull();
  });

  it("returns null on zero-dim points (CMI-knn unconditional-MI sentinel)", () => {
    expect(buildKdTree([[], [], []])).toBeNull();
  });

  it("builds a balanced single-point tree", () => {
    const tree = buildKdTree([[1, 2, 3]]);
    expect(tree).not.toBeNull();
    expect(tree!.left).toBeNull();
    expect(tree!.right).toBeNull();
    expect(tree!.point).toEqual([1, 2, 3]);
  });

  it("bounding box covers every point in the subtree", () => {
    const points = [
      [0, 0],
      [5, 1],
      [-2, 3],
      [4, -4],
      [1, 1],
    ];
    const tree = buildKdTree(points);
    expect(tree!.lo[0]).toBe(-2);
    expect(tree!.lo[1]).toBe(-4);
    expect(tree!.hi[0]).toBe(5);
    expect(tree!.hi[1]).toBe(3);
  });
});

describe("kNearest — Chebyshev k-NN", () => {
  it("matches naive on a random 2D point cloud (k=5)", () => {
    const rng = lcg(101);
    const N = 60;
    const points = Array.from({ length: N }, () => [rng() * 10, rng() * 10]);
    const tree = buildKdTree(points);
    for (let i = 0; i < N; i++) {
      const naive = naiveKNearest(points, points[i], 5, i);
      const kd = kNearest(tree, points[i], 5, i);
      expect(kd.map((n) => n.index).sort()).toEqual(naive.map((n) => n.index).sort());
    }
  });

  it("matches naive on a random 5D point cloud (k=3) — typical CMI-knn joint dim", () => {
    const rng = lcg(102);
    const N = 40;
    const points = Array.from({ length: N }, () =>
      Array.from({ length: 5 }, () => rng() * 10),
    );
    const tree = buildKdTree(points);
    for (let i = 0; i < N; i++) {
      const naive = naiveKNearest(points, points[i], 3, i);
      const kd = kNearest(tree, points[i], 3, i);
      // Compare returned k-th distance (tie-tolerant).
      expect(kd[kd.length - 1].dist).toBeCloseTo(naive[naive.length - 1].dist, 10);
    }
  });

  it("excludes the query index (no self-match)", () => {
    const points = [[0], [1], [2], [3]];
    const tree = buildKdTree(points);
    const result = kNearest(tree, [0], 4, 0);
    // Even k=4 over a 4-point tree returns only 3 (self excluded).
    expect(result.length).toBe(3);
    for (const n of result) expect(n.index).not.toBe(0);
  });

  it("returns sorted ascending by distance", () => {
    const rng = lcg(103);
    const points = Array.from({ length: 30 }, () => [rng() * 10, rng() * 10]);
    const tree = buildKdTree(points);
    const result = kNearest(tree, [0, 0], 10, -1);
    for (let i = 1; i < result.length; i++) {
      expect(result[i].dist).toBeGreaterThanOrEqual(result[i - 1].dist);
    }
  });

  it("returns empty for k=0 or null tree", () => {
    expect(kNearest(null, [0], 5, -1)).toEqual([]);
    const tree = buildKdTree([[0]]);
    expect(kNearest(tree, [0], 0, -1)).toEqual([]);
  });
});

describe("countWithinRadius — Chebyshev range count", () => {
  it("matches naive on a random 3D point cloud", () => {
    const rng = lcg(201);
    const N = 60;
    const points = Array.from({ length: N }, () => [rng() * 10, rng() * 10, rng() * 10]);
    const tree = buildKdTree(points);
    for (let i = 0; i < N; i++) {
      for (const radius of [0.5, 1.5, 3.0, 7.0]) {
        const naive = naiveCountWithin(points, points[i], radius, i);
        const kd = countWithinRadius(tree, points[i], radius, i);
        expect(kd).toBe(naive);
      }
    }
  });

  it("counts strictly less than radius (open ball)", () => {
    const points = [[0], [1], [2], [3]];
    const tree = buildKdTree(points);
    // Exclude self (index 0). From points[0]=[0]: distances 1, 2, 3.
    // radius=2 → only 1 strictly < 2.
    expect(countWithinRadius(tree, [0], 2, 0)).toBe(1);
    // radius=2.01 → 2 strictly < (1 and 2).
    expect(countWithinRadius(tree, [0], 2.01, 0)).toBe(2);
  });

  it("returns 0 on null tree or non-positive radius", () => {
    expect(countWithinRadius(null, [0], 1, -1)).toBe(0);
    const tree = buildKdTree([[0], [1]]);
    expect(countWithinRadius(tree, [0], 0, -1)).toBe(0);
    expect(countWithinRadius(tree, [0], -1, -1)).toBe(0);
    expect(countWithinRadius(tree, [0], Infinity, -1)).toBe(0);
  });

  it("excludes the query index", () => {
    const points = [[0], [1], [2]];
    const tree = buildKdTree(points);
    // From points[0] with radius=10, naive sees 2 others; KD excludes 0.
    expect(countWithinRadius(tree, [0], 10, 0)).toBe(2);
  });
});
