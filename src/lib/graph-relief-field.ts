import type { CausalNode } from "./types";

/**
 * Build a 2D scalar criticality field from a node layout. Each node contributes
 * a Gaussian "bump" at its position with weight = ΩF composite (0–10). The
 * resulting heightfield reads as terrain — peaks where critical nodes cluster,
 * valleys where the network is quiet.
 *
 * Returns interleaved buffers ready for THREE.BufferGeometry — `positions` is
 * `(x, y_height, z)` with Y up so the mesh sits flat in the world. `colors`
 * is per-vertex RGB, ramped by normalized elevation.
 */

export interface ReliefFieldParams {
  /** Grid resolution in cells per side. 80 = 6,400 vertices ≈ 30ms on 100 nodes. */
  resolution?: number;
  /** Visual height scale applied to normalized elevation. */
  heightScale?: number;
  /** Outer padding in layout units around the node bounds. */
  padding?: number;
  /** Gaussian bandwidth as a fraction of the smaller bounds dimension. */
  sigmaFraction?: number;
}

export interface ReliefField {
  positions: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
  width: number;
  height: number;
  resolution: number;
  /** Maximum raw field value before normalization — useful for legends. */
  peak: number;
}

const DEFAULTS: Required<ReliefFieldParams> = {
  resolution: 80,
  heightScale: 30,
  padding: 80,
  sigmaFraction: 0.12,
};

const EMPTY_FIELD: ReliefField = {
  positions: new Float32Array(0),
  colors: new Float32Array(0),
  indices: new Uint32Array(0),
  width: 0,
  height: 0,
  resolution: 0,
  peak: 0,
};

export function computeReliefField(
  nodes: Pick<CausalNode, "id" | "omegaFragility">[],
  layout: Map<string, { x: number; y: number }>,
  params: ReliefFieldParams = {},
): ReliefField {
  const { resolution, heightScale, padding, sigmaFraction } = {
    ...DEFAULTS,
    ...params,
  };

  // Pre-extract usable node samples (skip any without a layout entry).
  const samples: { x: number; y: number; w: number }[] = [];
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const n of nodes) {
    const p = layout.get(n.id);
    if (!p) continue;
    samples.push({ x: p.x, y: p.y, w: n.omegaFragility.composite });
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  if (samples.length === 0 || !Number.isFinite(minX)) return EMPTY_FIELD;

  minX -= padding; maxX += padding;
  minY -= padding; maxY += padding;
  const width = maxX - minX;
  const height = maxY - minY;

  // Bandwidth scales with the smaller extent so dense and sparse layouts both
  // produce readable contour spread.
  const sigma = Math.max(60, Math.min(width, height) * sigmaFraction);
  const sigma2 = sigma * sigma;

  const N = resolution;
  const vertCount = N * N;
  const positions = new Float32Array(vertCount * 3);
  const colors = new Float32Array(vertCount * 3);
  const heights = new Float32Array(vertCount);

  // Pass 1 — evaluate the field on the grid.
  let peak = 0;
  for (let j = 0; j < N; j++) {
    const y = minY + (j / (N - 1)) * height;
    for (let i = 0; i < N; i++) {
      const x = minX + (i / (N - 1)) * width;
      let h = 0;
      for (const s of samples) {
        const dx = x - s.x;
        const dy = y - s.y;
        h += s.w * Math.exp(-(dx * dx + dy * dy) / sigma2);
      }
      const idx = j * N + i;
      heights[idx] = h;
      if (h > peak) peak = h;
    }
  }

  // Pass 2 — write vertex (x, y_height, z) and per-vertex color, recentered
  // around the origin so OrbitControls naturally pivots over the center.
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const inv = peak > 0 ? 1 / peak : 0;
  for (let j = 0; j < N; j++) {
    const yWorld = minY + (j / (N - 1)) * height;
    for (let i = 0; i < N; i++) {
      const xWorld = minX + (i / (N - 1)) * width;
      const idx = j * N + i;
      const norm = heights[idx] * inv;
      const z = norm * heightScale;

      positions[idx * 3 + 0] = xWorld - cx;
      positions[idx * 3 + 1] = z;
      positions[idx * 3 + 2] = yWorld - cy;

      const [r, g, b] = elevationColor(norm);
      colors[idx * 3 + 0] = r;
      colors[idx * 3 + 1] = g;
      colors[idx * 3 + 2] = b;
    }
  }

  // Triangle indices — two triangles per cell.
  const cells = (N - 1) * (N - 1);
  const indices = new Uint32Array(cells * 6);
  let k = 0;
  for (let j = 0; j < N - 1; j++) {
    for (let i = 0; i < N - 1; i++) {
      const a = j * N + i;
      const b = j * N + i + 1;
      const c = (j + 1) * N + i;
      const d = (j + 1) * N + i + 1;
      indices[k++] = a; indices[k++] = c; indices[k++] = b;
      indices[k++] = b; indices[k++] = c; indices[k++] = d;
    }
  }

  return { positions, colors, indices, width, height, resolution: N, peak };
}

/**
 * Color ramp by normalized elevation: deep midnight blue → cyan → amber → red.
 * Tuned to the Manifold palette (#00e5ff / #ffab00 / #ff1744).
 */
function elevationColor(t: number): [number, number, number] {
  const n = Math.max(0, Math.min(1, t));
  if (n < 0.25) {
    const k = n / 0.25;
    return [
      lerp(0.04, 0.0, k),
      lerp(0.05, 0.9, k),
      lerp(0.18, 1.0, k),
    ];
  }
  if (n < 0.55) {
    const k = (n - 0.25) / 0.30;
    return [
      lerp(0.0, 1.0, k),
      lerp(0.9, 0.67, k),
      lerp(1.0, 0.0, k),
    ];
  }
  const k = Math.min(1, (n - 0.55) / 0.45);
  return [
    1.0,
    lerp(0.67, 0.09, k),
    lerp(0.0, 0.27, k),
  ];
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
