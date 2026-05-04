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
  resolution: 80,
  // Tall enough to read as terrain rather than a pancake on a wide layout.
  // The combined effect of nodeWeight power-boost + heightGamma already
  // makes peaks pop, so the linear scale stays modest.
  heightScale: 90,
  padding: 80,
  // Tighter Gaussian than v1 — a quarter-extent bandwidth (0.12) smeared every
  // node's contribution and merged peaks into one broad lump. ~6% gives local,
  // legible mountains while still being smooth between adjacent nodes.
  sigmaFraction: 0.06,
  // Power applied to normalised height. > 1 flattens valleys and sharpens
  // peaks. Combined with the WEIGHT_EXPONENT below, makes the multi-domain
  // mesh read as discrete ridges instead of one soft mound.
  heightGamma: 1.35,
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
