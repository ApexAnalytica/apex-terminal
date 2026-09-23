// ─── KD-tree (Chebyshev / max-norm) ───────────────────────────────────
//
// Bounded-box-pruning KD-tree specialised for the Chebyshev (max-norm)
// distance metric used by CMI-knn. Supports two operations:
//
//   1. k-NN query (`kNearest`) — distance to k-th nearest, plus the
//      indices/distances of all k. Used to find the joint-space
//      neighbourhood radius ε_i for each CMI-knn sample.
//   2. Range count (`countWithinRadius`) — number of points strictly
//      inside a max-norm ball of given radius. Used to count
//      marginal-space neighbours within ε_i.
//
// Build is O(N log N); each query is O(N^(1−1/d)) worst-case but
// O(k · log N) average for low-dimensional point sets (d ≤ ~10).
// Replaces the naive O(N²) sort that v0.6 used in `cmiKnn`.
//
// Chebyshev distance to a bounding box [lo, hi] is the per-dim max of
//   max(0, lo_d − q_d, q_d − hi_d)
// which is what `boxDistChebyshev` computes.

export interface KdNode {
  /** Original index of the splitter point in the input array. */
  index: number;
  /** Splitter point coordinates. */
  point: number[];
  /** Dimension this node splits on (cycles depth % d). */
  splitDim: number;
  left: KdNode | null;
  right: KdNode | null;
  /** Per-dim min / max over this subtree. */
  lo: number[];
  hi: number[];
}

function chebyshevDist(a: number[], b: number[]): number {
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    const dd = Math.abs(a[i] - b[i]);
    if (dd > d) d = dd;
  }
  return d;
}

/** Chebyshev distance from a query point to a bounding box [lo, hi]. */
function boxDistChebyshev(query: number[], lo: number[], hi: number[]): number {
  let d = 0;
  for (let i = 0; i < query.length; i++) {
    const q = query[i];
    let dd = 0;
    if (q < lo[i]) dd = lo[i] - q;
    else if (q > hi[i]) dd = q - hi[i];
    if (dd > d) d = dd;
  }
  return d;
}

/**
 * Build a balanced KD-tree over `points` (each row a point of dimension
 * `points[0].length`). Returns null if `points` is empty.
 */
export function buildKdTree(points: number[][]): KdNode | null {
  if (points.length === 0) return null;
  const dim = points[0].length;
  // Special case: zero-dim points (Z is empty for unconditional MI).
  // A degenerate "tree" of one node carrying everyone is fine because
  // CMI-knn never queries the zero-dim KD-tree (it shortcuts to N-1).
  if (dim === 0) return null;
  const indices: number[] = new Array(points.length);
  for (let i = 0; i < points.length; i++) indices[i] = i;
  return buildRecursive(points, indices, 0, dim);
}

function buildRecursive(
  points: number[][],
  indices: number[],
  depth: number,
  dim: number,
): KdNode {
  const splitDim = depth % dim;
  indices.sort((a, b) => points[a][splitDim] - points[b][splitDim]);
  const mid = Math.floor(indices.length / 2);
  const splitterIdx = indices[mid];
  const leftIdx = indices.slice(0, mid);
  const rightIdx = indices.slice(mid + 1);
  const left = leftIdx.length > 0 ? buildRecursive(points, leftIdx, depth + 1, dim) : null;
  const right = rightIdx.length > 0 ? buildRecursive(points, rightIdx, depth + 1, dim) : null;

  const point = points[splitterIdx];
  const lo = point.slice();
  const hi = point.slice();
  if (left) {
    for (let i = 0; i < dim; i++) {
      if (left.lo[i] < lo[i]) lo[i] = left.lo[i];
      if (left.hi[i] > hi[i]) hi[i] = left.hi[i];
    }
  }
  if (right) {
    for (let i = 0; i < dim; i++) {
      if (right.lo[i] < lo[i]) lo[i] = right.lo[i];
      if (right.hi[i] > hi[i]) hi[i] = right.hi[i];
    }
  }
  return { index: splitterIdx, point, splitDim, left, right, lo, hi };
}

/** Result of a k-NN query — sorted by ascending distance. */
export interface KdNeighbour {
  index: number;
  dist: number;
}

/**
 * Find the k nearest neighbours to `query` under Chebyshev distance.
 * `excludeIndex` is skipped (use when the query point is itself in the
 * tree). Returns sorted ascending by distance.
 */
export function kNearest(
  root: KdNode | null,
  query: number[],
  k: number,
  excludeIndex: number,
): KdNeighbour[] {
  if (!root || k <= 0) return [];
  // Max-heap (root = farthest) of size ≤ k.
  const heap: KdNeighbour[] = [];

  function pushHeap(neighbour: KdNeighbour): void {
    if (heap.length < k) {
      heap.push(neighbour);
      siftUp(heap, heap.length - 1);
    } else if (neighbour.dist < heap[0].dist) {
      heap[0] = neighbour;
      siftDown(heap, 0, heap.length);
    }
  }

  function recurse(node: KdNode | null): void {
    if (!node) return;
    if (heap.length === k) {
      const bd = boxDistChebyshev(query, node.lo, node.hi);
      if (bd >= heap[0].dist) return;
    }
    if (node.index !== excludeIndex) {
      const d = chebyshevDist(query, node.point);
      pushHeap({ index: node.index, dist: d });
    }
    // Visit the closer subtree first so the heap fills with tight bounds.
    const q = query[node.splitDim];
    const s = node.point[node.splitDim];
    if (q < s) {
      recurse(node.left);
      recurse(node.right);
    } else {
      recurse(node.right);
      recurse(node.left);
    }
  }

  recurse(root);
  return heap.sort((a, b) => a.dist - b.dist);
}

/**
 * Count points strictly within Chebyshev distance `radius` of `query`.
 * `excludeIndex` is skipped (use when the query point is in the tree).
 */
export function countWithinRadius(
  root: KdNode | null,
  query: number[],
  radius: number,
  excludeIndex: number,
): number {
  if (!root || !Number.isFinite(radius) || radius <= 0) return 0;
  let count = 0;
  function recurse(node: KdNode | null): void {
    if (!node) return;
    if (boxDistChebyshev(query, node.lo, node.hi) >= radius) return;
    if (node.index !== excludeIndex) {
      const d = chebyshevDist(query, node.point);
      if (d < radius) count += 1;
    }
    recurse(node.left);
    recurse(node.right);
  }
  recurse(root);
  return count;
}

// ─── Binary-heap helpers (max-heap by .dist) ──────────────────────────

function siftUp(heap: KdNeighbour[], i: number): void {
  while (i > 0) {
    const parent = (i - 1) >> 1;
    if (heap[parent].dist >= heap[i].dist) break;
    [heap[parent], heap[i]] = [heap[i], heap[parent]];
    i = parent;
  }
}

function siftDown(heap: KdNeighbour[], i: number, n: number): void {
  while (true) {
    const l = 2 * i + 1;
    const r = 2 * i + 2;
    let largest = i;
    if (l < n && heap[l].dist > heap[largest].dist) largest = l;
    if (r < n && heap[r].dist > heap[largest].dist) largest = r;
    if (largest === i) break;
    [heap[i], heap[largest]] = [heap[largest], heap[i]];
    i = largest;
  }
}
