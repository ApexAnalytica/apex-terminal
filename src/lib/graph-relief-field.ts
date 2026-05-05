import type { CausalNode } from "./types";

/**
 * Per-domain color map for the multilayer Relief view. Inlined here (rather
 * than importing `getDomainColor` from `graph-data.ts`) so this module never
 * pulls the 2,920-line graph-data module into the Relief chunk — that module
 * is dynamically imported elsewhere (see `page.tsx`) and a static import
 * here would defeat the chunk split. Keep these in sync with
 * `graph-data.ts:getDomainColor` if either changes.
 */
const DOMAIN_COLOR_MAP: Record<string, string> = {
  "Saudi Aramco Energy": "#00e676",
  "QatarEnergy LNG": "#00e5ff",
  "QAFCO Fertilizer": "#76ff03",
  "Ma'aden Phosphate": "#ffab00",
  "Financial Contagion": "#ff6d00",
  "Sovereign Risk": "#ffab00",
  "Supply Chain Food Security": "#00e5ff",
  "Undersea Cable Infrastructure": "#7c4dff",
  "Macro Impact: Labor, Growth & Housing": "#40c4ff",
  "Macro Impact: Inflation & Policy": "#ff80ab",
  "Drone Swarms": "#ff4081",
  "SATCOM": "#448aff",
  "ISR Fusion": "#ea80fc",
  "Chip Embargo": "#ff9100",
  "Secure Compute": "#69f0ae",
  "Kill Chain": "#ff1744",
  "T1D Autoimmune": "#ff80ab",
  "T1D β-cell Biology": "#40c4ff",
  "T1D Metabolic": "#69f0ae",
  "T1D Intervention": "#ffab00",
  "T1D Complications": "#ff6d00",
  "T1D VX-880": "#40c4ff",
};
const DEFAULT_DOMAIN_COLOR = "#5a5e72";

function reliefDomainColor(domain: string): string {
  return DOMAIN_COLOR_MAP[domain] ?? DEFAULT_DOMAIN_COLOR;
}

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
  /**
   * Power applied to normalized elevation before mapping to vertex Y.
   * `> 1` flattens valleys and raises peaks (visually more "peaky"); `1` is
   * linear; `< 1` lifts mid-elevations. Default 1.4 → distinct peaks instead
   * of the soft-mound look the linear mapping produced on multi-domain graphs.
   */
  heightGamma?: number;
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
  /**
   * World-space center the mesh was recentered around. Subtract these from a
   * raw layout (x, y) to convert to mesh-local coordinates — needed by the
   * component to place HTML labels above the right node peaks.
   */
  cx: number;
  cy: number;
}

const DEFAULTS: Required<ReliefFieldParams> = {
  // Bumped from 80 to 128 — at 80 cells, triangles were visible at the
  // silhouette and contour-band stripes looked stepped. 128² = 16,384
  // verts ≈ 100ms compute on a 200-node graph. The shader-side iso-contour
  // pass means we don't need to crank resolution any further; smoothness
  // now comes from the pixel-rate fragment shader, not the mesh density.
  resolution: 128,
  heightScale: 140,
  padding: 80,
  sigmaFraction: 0.05,
  heightGamma: 1.6,
};

/** Power-law boost applied to each node's composite ΩF before kernel
 *  density estimation. Linear weighting let mid-criticality nodes (3–5)
 *  contribute too much to the total field and made high-criticality
 *  nodes (8–10) blend in. A modest 1.5 exponent makes peaks pop without
 *  collapsing the lower ranges entirely. */
const WEIGHT_EXPONENT = 1.5;
function nodeWeight(composite: number): number {
  if (!Number.isFinite(composite) || composite <= 0) return 0;
  return Math.pow(composite, WEIGHT_EXPONENT);
}

const EMPTY_FIELD: ReliefField = {
  positions: new Float32Array(0),
  colors: new Float32Array(0),
  indices: new Uint32Array(0),
  width: 0,
  height: 0,
  resolution: 0,
  peak: 0,
  cx: 0,
  cy: 0,
};

export function computeReliefField(
  nodes: Pick<CausalNode, "id" | "omegaFragility">[],
  layout: Map<string, { x: number; y: number }>,
  params: ReliefFieldParams = {},
): ReliefField {
  const { resolution, heightScale, padding, sigmaFraction, heightGamma } = {
    ...DEFAULTS,
    ...params,
  };

  // Pre-extract usable node samples (skip any without a layout entry).
  const samples: { x: number; y: number; w: number }[] = [];
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const n of nodes) {
    const p = layout.get(n.id);
    if (!p) continue;
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    const composite = n.omegaFragility?.composite ?? 0;
    samples.push({ x: p.x, y: p.y, w: nodeWeight(composite) });
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
      const rawNorm = heights[idx] * inv;
      const norm = Number.isFinite(rawNorm)
        ? Math.max(0, Math.min(1, rawNorm))
        : 0;
      // Gamma > 1 raises the contrast between peaks and valleys —
      // peaks stay near 1, mid-elevations drop more aggressively, valleys
      // flatten. Reads as ridges and basins instead of a soft mound.
      const shaped = Math.pow(norm, heightGamma);
      const z = shaped * heightScale;

      positions[idx * 3 + 0] = xWorld - cx;
      positions[idx * 3 + 1] = z;
      positions[idx * 3 + 2] = yWorld - cy;

      // Color ramp still keys off the linear `norm` so the legend stays
      // readable — only the geometry is gamma'd.
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

  return { positions, colors, indices, width, height, resolution: N, peak, cx, cy };
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

// ─── Multilayer (per-domain) ───────────────────────────────────────

export interface ReliefLayer {
  domain: string;
  /** Hex string from getDomainColor — passthrough so the legend can render. */
  colorHex: string;
  /** Linear RGB tuple (0–1) used to tint vertex colors in the mesh. */
  colorRGB: [number, number, number];
  field: ReliefField;
  /** Node count contributing to this layer — drives legend ordering. */
  nodeCount: number;
}

/**
 * Group nodes by `node.domain` and build one ReliefField per domain over a
 * shared world-space grid. Shared bounds are critical: per-domain bounds would
 * scatter the meshes into separate continents, defeating the "where do
 * domains overlap" reading. With shared bounds, peaks across layers line up
 * by node — a dense red+green region tells you that domain reads as
 * critical across both vocabularies.
 *
 * Each layer's vertex colors are pre-tinted by domain color (multiplied by
 * the elevation gamma) so the consumer can render with additive blending and
 * get color-mixing where peaks overlap.
 */
export function computeReliefLayers(
  nodes: Pick<CausalNode, "id" | "domain" | "omegaFragility">[],
  layout: Map<string, { x: number; y: number }>,
  params: ReliefFieldParams = {},
): ReliefLayer[] {
  const { resolution, heightScale, padding, sigmaFraction, heightGamma } = {
    ...DEFAULTS,
    ...params,
  };

  // Pre-extract usable samples and group by domain. Compute global bounds
  // across ALL samples so every layer evaluates over the same grid.
  type Sample = { x: number; y: number; w: number };
  const byDomain = new Map<string, Sample[]>();
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const n of nodes) {
    const p = layout.get(n.id);
    if (!p) continue;
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    const composite = n.omegaFragility?.composite ?? 0;
    const domain = typeof n.domain === "string" && n.domain.length > 0
      ? n.domain
      : "Unknown";
    const sample: Sample = { x: p.x, y: p.y, w: nodeWeight(composite) };
    const arr = byDomain.get(domain);
    if (arr) arr.push(sample);
    else byDomain.set(domain, [sample]);
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  if (byDomain.size === 0 || !Number.isFinite(minX)) return [];

  minX -= padding; maxX += padding;
  minY -= padding; maxY += padding;
  const width = maxX - minX;
  const height = maxY - minY;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const sigma = Math.max(60, Math.min(width, height) * sigmaFraction);
  const sigma2 = sigma * sigma;
  const N = resolution;
  const vertCount = N * N;

  // Triangle indices are identical across layers — share the buffer.
  const cells = (N - 1) * (N - 1);
  const indices = new Uint32Array(cells * 6);
  {
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
  }

  // Cache the X/Y grid coordinates — same for every layer.
  const gx = new Float32Array(N);
  const gy = new Float32Array(N);
  for (let i = 0; i < N; i++) gx[i] = minX + (i / (N - 1)) * width;
  for (let j = 0; j < N; j++) gy[j] = minY + (j / (N - 1)) * height;

  // ─── Pass 1: evaluate every layer's height field; track GLOBAL peak ───
  // v1 normalized each layer by its own peak, which erased cross-domain
  // intensity differences — a sparse-but-high domain rendered the same height
  // as a dense-but-mild one, defeating the additive-blend "where do critical
  // domains overlap" reading. Sharing a global peak across layers preserves
  // both the within-layer shape AND the relative cross-domain magnitude.
  type LayerScratch = {
    domain: string;
    samples: Sample[];
    heights: Float32Array;
    peak: number;
  };
  const scratch: LayerScratch[] = [];
  let globalPeak = 0;
  for (const [domain, samples] of byDomain) {
    const heights = new Float32Array(vertCount);
    let peak = 0;
    for (let j = 0; j < N; j++) {
      const y = gy[j];
      for (let i = 0; i < N; i++) {
        const x = gx[i];
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
    if (peak > globalPeak) globalPeak = peak;
    scratch.push({ domain, samples, heights, peak });
  }
  const inv = globalPeak > 0 ? 1 / globalPeak : 0;

  // ─── Pass 2: emit positions + per-vertex colors per layer ──────────────
  const layers: ReliefLayer[] = [];
  for (const { domain, samples, heights, peak } of scratch) {
    const positions = new Float32Array(vertCount * 3);
    const colors = new Float32Array(vertCount * 3);
    const colorHex = reliefDomainColor(domain);
    const colorRGB = hexToLinearRGB(colorHex);

    for (let j = 0; j < N; j++) {
      const yWorld = gy[j];
      for (let i = 0; i < N; i++) {
        const xWorld = gx[i];
        const idx = j * N + i;
        const rawNorm = heights[idx] * inv;
        const norm = Number.isFinite(rawNorm)
          ? Math.max(0, Math.min(1, rawNorm))
          : 0;
        // Apply the same height-gamma as the single-domain path so the two
        // modes have the same "peakiness" character. The color tint uses a
        // slightly stronger gamma so valleys go to additive black faster.
        const shaped = Math.pow(norm, heightGamma);
        const z = shaped * heightScale;

        positions[idx * 3 + 0] = xWorld - cx;
        positions[idx * 3 + 1] = z;
        positions[idx * 3 + 2] = yWorld - cy;

        const tint = Math.pow(norm, 1.5);
        colors[idx * 3 + 0] = colorRGB[0] * tint;
        colors[idx * 3 + 1] = colorRGB[1] * tint;
        colors[idx * 3 + 2] = colorRGB[2] * tint;
      }
    }

    layers.push({
      domain,
      colorHex,
      colorRGB,
      field: {
        positions,
        colors,
        indices,
        width,
        height,
        resolution: N,
        peak,
        cx,
        cy,
      },
      nodeCount: samples.length,
    });
  }

  // Render order: lowest peak first, highest last. With additive blending the
  // order is mathematically irrelevant, but a stable, peak-driven order keeps
  // the legend meaningful.
  layers.sort((a, b) => b.field.peak - a.field.peak);
  return layers;
}

// ─── Node anchors for HTML labels ──────────────────────────────────

export interface NodeAnchor {
  id: string;
  label: string;
  /** Mesh-local X (= layout x − cx). */
  x: number;
  /** Mesh-local Z (= layout y − cy). */
  z: number;
  /** Vertex Y the label should float above. */
  y: number;
  /** ΩF composite — drives top-K ordering and label coloring. */
  composite: number;
  /** Owning domain — drives label color. */
  domain: string;
}

/**
 * Compute world-space anchors for the top-K most-fragile nodes so the
 * component can drop HTML labels above their peaks. Without these labels
 * the relief mesh is just an abstract surface — labels are how a viewer
 * recognises *which* nodes the mountain ridges are made of.
 *
 * Height is approximated by sampling the same Gaussian field at each node's
 * (x, y) position. Cheap (O(K × N) where K is the cap) and exact enough for
 * label placement.
 */
export function computeNodeAnchors(
  nodes: Pick<CausalNode, "id" | "label" | "domain" | "omegaFragility">[],
  layout: Map<string, { x: number; y: number }>,
  field: ReliefField,
  params: ReliefFieldParams = {},
  topK = 8,
): NodeAnchor[] {
  if (field.positions.length === 0 || field.peak <= 0) return [];

  const { padding, sigmaFraction, heightScale, heightGamma } = {
    ...DEFAULTS,
    ...params,
  };
  const sigma = Math.max(60, Math.min(field.width, field.height) * sigmaFraction);
  const sigma2 = sigma * sigma;

  // Gather every usable node-with-position once so we can reuse them as
  // both label candidates and Gaussian sources.
  type Source = { id: string; label: string; domain: string; composite: number; x: number; y: number };
  const sources: Source[] = [];
  for (const n of nodes) {
    const p = layout.get(n.id);
    if (!p) continue;
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    const composite = Number.isFinite(n.omegaFragility?.composite)
      ? n.omegaFragility.composite
      : 0;
    sources.push({
      id: n.id,
      label: n.label,
      domain: typeof n.domain === "string" ? n.domain : "Unknown",
      composite,
      x: p.x,
      y: p.y,
    });
  }
  if (sources.length === 0) return [];

  // Top-K by composite. With K small (default 8), an n*log(n) sort is fine.
  const sorted = [...sources].sort((a, b) => b.composite - a.composite);
  const picks = sorted.slice(0, Math.min(topK, sorted.length));

  // Sample the field at each pick's coordinates. Suppress padding parameter
  // since `field.cx/cy` already encode the recentered origin.
  void padding;

  const anchors: NodeAnchor[] = [];
  for (const pick of picks) {
    let h = 0;
    for (const s of sources) {
      const dx = pick.x - s.x;
      const dy = pick.y - s.y;
      h += s.composite * Math.exp(-(dx * dx + dy * dy) / sigma2);
    }
    const norm = Math.max(0, Math.min(1, h / field.peak));
    const shaped = Math.pow(norm, heightGamma);
    anchors.push({
      id: pick.id,
      label: pick.label,
      domain: pick.domain,
      composite: pick.composite,
      x: pick.x - field.cx,
      z: pick.y - field.cy,
      y: shaped * heightScale,
    });
  }
  return anchors;
}

function hexToLinearRGB(hex: string): [number, number, number] {
  const m = hex.replace("#", "");
  const r = parseInt(m.slice(0, 2), 16) / 255;
  const g = parseInt(m.slice(2, 4), 16) / 255;
  const b = parseInt(m.slice(4, 6), 16) / 255;
  return [r, g, b];
}

// ─── Fused relief — single mesh colored by dominant domain ────────

export interface FusedReliefLegendEntry {
  domain: string;
  colorHex: string;
  /** Number of nodes in this domain — drives legend ordering. */
  nodeCount: number;
}

export interface FusedReliefField extends ReliefField {
  legend: FusedReliefLegendEntry[];
  /**
   * Per-vertex normalised height in [0, 1] — same length as
   * `positions.length / 3`. Fed to the topo shader as a per-vertex
   * attribute so the fragment shader can compute pixel-perfect heatmap
   * colour + iso-contour lines, regardless of how coarse the geometry is.
   */
  norms: Float32Array;
}

/**
 * Build ONE heightfield mesh for the whole graph (sum of every domain's
 * Gaussians) and color each vertex by the *dominant* domain at that grid
 * cell × elevation tint × iso-contour banding.
 *
 * Why this beats the additive multilayer:
 *  - Real silhouette. Each peak is a single 3D ridge, not 7 transparent
 *    sheets stacked on top of each other smearing into a haze.
 *  - Domain identity is still readable — the dominant-domain choice paints
 *    each peak with one color, so the user can see "this ridge is mostly
 *    Energy" vs "this one is mostly Macro Inflation".
 *  - Iso-contours add the topographic-map character (the rings around
 *    peaks) the user explicitly asked for.
 *  - Only one geometry to raycast, so click-to-select picking works.
 */
export function computeFusedReliefField(
  nodes: Pick<CausalNode, "id" | "domain" | "omegaFragility">[],
  layout: Map<string, { x: number; y: number }>,
  params: ReliefFieldParams = {},
): FusedReliefField {
  const { resolution, heightScale, padding, sigmaFraction, heightGamma } = {
    ...DEFAULTS,
    ...params,
  };

  // Group samples by domain — same as multilayer — but we'll fuse the
  // fields into a single mesh.
  type Sample = { x: number; y: number; w: number };
  const byDomain = new Map<string, Sample[]>();
  const domainNodeCount = new Map<string, number>();
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const n of nodes) {
    const p = layout.get(n.id);
    if (!p) continue;
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    const composite = n.omegaFragility?.composite ?? 0;
    const domain = typeof n.domain === "string" && n.domain.length > 0
      ? n.domain
      : "Unknown";
    const sample: Sample = { x: p.x, y: p.y, w: nodeWeight(composite) };
    const arr = byDomain.get(domain);
    if (arr) arr.push(sample);
    else byDomain.set(domain, [sample]);
    domainNodeCount.set(domain, (domainNodeCount.get(domain) ?? 0) + 1);
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  if (byDomain.size === 0 || !Number.isFinite(minX)) {
    return { ...EMPTY_FIELD, legend: [], norms: new Float32Array(0) };
  }

  minX -= padding; maxX += padding;
  minY -= padding; maxY += padding;
  const width = maxX - minX;
  const height = maxY - minY;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const sigma = Math.max(60, Math.min(width, height) * sigmaFraction);
  const sigma2 = sigma * sigma;
  const N = resolution;
  const vertCount = N * N;
  const positions = new Float32Array(vertCount * 3);
  const colors = new Float32Array(vertCount * 3);

  // Pre-cache the domain order and per-domain RGB so the inner loop reuses
  // tiny indexed tuples instead of Map lookups.
  const domains = Array.from(byDomain.keys());
  const domainSamples = domains.map((d) => byDomain.get(d)!);
  const domainRGB = domains.map((d) => hexToLinearRGB(reliefDomainColor(d)));

  // Pass 1 — for every grid cell, evaluate per-domain heights, sum to the
  // total height, and remember which domain dominated.
  const totalHeights = new Float32Array(vertCount);
  const dominantDomain = new Uint8Array(vertCount);
  let peak = 0;
  for (let j = 0; j < N; j++) {
    const y = minY + (j / (N - 1)) * height;
    for (let i = 0; i < N; i++) {
      const x = minX + (i / (N - 1)) * width;
      let total = 0;
      let bestH = -1;
      let bestDom = 0;
      for (let d = 0; d < domains.length; d++) {
        const samples = domainSamples[d];
        let h = 0;
        for (const s of samples) {
          const dx = x - s.x;
          const dy = y - s.y;
          h += s.w * Math.exp(-(dx * dx + dy * dy) / sigma2);
        }
        total += h;
        if (h > bestH) {
          bestH = h;
          bestDom = d;
        }
      }
      const idx = j * N + i;
      totalHeights[idx] = total;
      dominantDomain[idx] = bestDom;
      if (total > peak) peak = total;
    }
  }

  // Pass 2 — emit positions + per-vertex norms. Vertex colours stay populated
  // (used by the meshStandardMaterial fallback) but the *primary* topo
  // shader path consumes `norms` and computes heatmap colour + iso-contour
  // lines per fragment, which is why the surface looks crisp instead of
  // pixelated regardless of how coarse the geometry is.
  void domainRGB; void dominantDomain; // retained for legend; not used in colour pass.
  const norms = new Float32Array(vertCount);
  const inv = peak > 0 ? 1 / peak : 0;
  for (let j = 0; j < N; j++) {
    const yWorld = minY + (j / (N - 1)) * height;
    for (let i = 0; i < N; i++) {
      const xWorld = minX + (i / (N - 1)) * width;
      const idx = j * N + i;
      const rawNorm = totalHeights[idx] * inv;
      const norm = Number.isFinite(rawNorm)
        ? Math.max(0, Math.min(1, rawNorm))
        : 0;
      const shaped = Math.pow(norm, heightGamma);
      const z = shaped * heightScale;

      positions[idx * 3 + 0] = xWorld - cx;
      positions[idx * 3 + 1] = z;
      positions[idx * 3 + 2] = yWorld - cy;

      norms[idx] = norm;

      // Vertex colour fallback (when the shaderMaterial isn't used).
      // No iso-contour modulation here — the shader does that per pixel.
      const [rR, gG, bB] = elevationColor(norm);
      colors[idx * 3 + 0] = rR;
      colors[idx * 3 + 1] = gG;
      colors[idx * 3 + 2] = bB;
    }
  }

  // Triangle indices.
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

  // Legend ordered by node count desc — biggest contributors first.
  const legend: FusedReliefLegendEntry[] = domains.map((domain) => ({
    domain,
    colorHex: reliefDomainColor(domain),
    nodeCount: domainNodeCount.get(domain) ?? 0,
  }));
  legend.sort((a, b) => b.nodeCount - a.nodeCount);

  return {
    positions,
    colors,
    indices,
    width,
    height,
    resolution: N,
    peak,
    cx,
    cy,
    legend,
    norms,
  };
}

// ─── Picking — click point → nearest node ────────────────────────────

/**
 * Given a click point in mesh-local coordinates (X, Z — the same space
 * positions live in after recentering by `field.cx/cy`), return the node
 * id whose layout position is closest. Returns null if no candidate is
 * within `maxDistance` (defaults to roughly half the Gaussian sigma so a
 * click on flat ground doesn't pick a far-away node).
 */
export function pickNearestNode(
  clickX: number,
  clickZ: number,
  nodes: Pick<CausalNode, "id" | "omegaFragility">[],
  layout: Map<string, { x: number; y: number }>,
  field: ReliefField,
  params: ReliefFieldParams = {},
  maxDistance?: number,
): string | null {
  if (field.positions.length === 0) return null;

  const { sigmaFraction } = { ...DEFAULTS, ...params };
  const sigma = Math.max(60, Math.min(field.width, field.height) * sigmaFraction);
  const cap = maxDistance ?? sigma * 1.5;
  const cap2 = cap * cap;

  let bestId: string | null = null;
  let bestD2 = Infinity;
  for (const n of nodes) {
    const p = layout.get(n.id);
    if (!p) continue;
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    const localX = p.x - field.cx;
    const localZ = p.y - field.cy;
    const dx = clickX - localX;
    const dz = clickZ - localZ;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestD2 && d2 <= cap2) {
      bestD2 = d2;
      bestId = n.id;
    }
  }
  return bestId;
}
