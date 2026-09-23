import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  // @ts-expect-error d3-force-3d types omit forceCollide; runtime export exists
  forceCollide,
} from "d3-force-3d";
import type { CausalNode, CausalEdge } from "./types";

export interface Position2D {
  id: string;
  x: number;
  y: number;
}

interface LayoutNode2D {
  id: string;
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
}

interface LayoutLink2D {
  source: string | LayoutNode2D;
  target: string | LayoutNode2D;
  weight: number;
}

// Tuned for CausalNode2D's circular footprint: ~14–34px diameter circles
// plus an absolute-positioned label below. Collision is sized for the
// circles with mild label overlap allowed — keeps the Obsidian-style
// density without the circles themselves touching.
const NODE_COLLISION_R = 48;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySim = any;

function buildSim(
  nodes: CausalNode[],
  edges: CausalEdge[],
): { sim: AnySim; simNodes: LayoutNode2D[] } {
  // Seed on a circle so the initial step doesn't explode from collinear positions.
  const R = Math.max(120, nodes.length * 14);
  const simNodes: LayoutNode2D[] = nodes.map((n, i) => {
    const a = (i / Math.max(1, nodes.length)) * Math.PI * 2;
    return {
      id: n.id,
      x: Math.cos(a) * R + (Math.random() - 0.5) * 30,
      y: Math.sin(a) * R + (Math.random() - 0.5) * 30,
    };
  });

  const simLinks: LayoutLink2D[] = edges.map((e) => ({
    source: e.source,
    target: e.target,
    weight: e.weight,
  }));

  const connected = new Set<string>();
  for (const e of edges) {
    connected.add(e.source);
    connected.add(e.target);
  }

  // d3-force-3d types are incomplete — pass nDim=2 at runtime.
  const sim = (forceSimulation as AnySim)(simNodes, 2)
    .force(
      "link",
      (forceLink as AnySim)(simLinks)
        .id((d: AnySim) => d.id)
        // Strong correlation → shorter spring. Range tuned for circle nodes.
        .distance((d: AnySim) => 65 + (1 - d.weight) * 100)
        .strength((d: AnySim) => 0.45 + d.weight * 0.35),
    )
    .force(
      "charge",
      (forceManyBody as AnySim)().strength((d: AnySim) =>
        connected.has(d.id) ? -550 : -150,
      ),
    )
    .force("center", forceCenter(0, 0))
    .force("collide", (forceCollide as AnySim)(NODE_COLLISION_R).strength(0.9))
    .velocityDecay(0.45);

  return { sim, simNodes };
}

/**
 * One-shot offline 2D force-directed layout. Cache the result keyed on the
 * graph signature so filter / isolation / replay changes don't reshuffle.
 */
export function compute2DForceLayout(
  nodes: CausalNode[],
  edges: CausalEdge[],
): Map<string, Position2D> {
  const out = new Map<string, Position2D>();
  if (nodes.length === 0) return out;
  const { sim, simNodes } = buildSim(nodes, edges);
  sim.stop();
  const iters = nodes.length < 30 ? 220 : 320;
  for (let i = 0; i < iters; i++) sim.tick();
  for (const n of simNodes) {
    out.set(n.id, { id: n.id, x: n.x, y: n.y });
  }
  return out;
}

export interface LiveSimulation {
  tick: () => void;
  alpha: () => number;
  reheat: (target?: number) => void;
  cool: () => void;
  pin: (id: string, x: number, y: number) => void;
  unpin: (id: string) => void;
  positions: () => Map<string, Position2D>;
}

/**
 * Build a live simulation seeded from `initialPositions`. The caller drives
 * ticks via a rAF loop — read positions back via `positions()` after each tick.
 * Used for drag-perturb: pin the dragged node, reheat alpha, tick, unpin on
 * release, let alpha decay to settle.
 */
export function create2DLiveSimulation(
  nodes: CausalNode[],
  edges: CausalEdge[],
  initialPositions: Map<string, Position2D>,
): LiveSimulation {
  const { sim, simNodes } = buildSim(nodes, edges);
  const idIndex = new Map<string, LayoutNode2D>();
  for (const n of simNodes) {
    const seed = initialPositions.get(n.id);
    if (seed) {
      n.x = seed.x;
      n.y = seed.y;
      n.vx = 0;
      n.vy = 0;
    }
    idIndex.set(n.id, n);
  }
  sim.alpha(0).stop();

  return {
    tick: () => sim.tick(),
    alpha: () => sim.alpha() as number,
    reheat: (target = 0.5) => {
      sim.alpha(target).alphaTarget(0).restart();
    },
    cool: () => {
      sim.alphaTarget(0);
    },
    pin: (id, x, y) => {
      const n = idIndex.get(id);
      if (!n) return;
      n.fx = x;
      n.fy = y;
      n.x = x;
      n.y = y;
    },
    unpin: (id) => {
      const n = idIndex.get(id);
      if (!n) return;
      n.fx = null;
      n.fy = null;
    },
    positions: () => {
      const out = new Map<string, Position2D>();
      for (const n of simNodes) {
        out.set(n.id, { id: n.id, x: n.x, y: n.y });
      }
      return out;
    },
  };
}

/**
 * Stable signature over the node and edge id sets. Layout is recomputed only
 * when this changes — filter/isolation/replay don't trigger a re-layout.
 *
 * Memoised on a cheap content fingerprint (length + first/last id of each
 * input array). On live workspaces, `graphData.nodes` is rebuilt via `.map`
 * on every feed tick to overlay liveData, so each canvas component's
 * `useMemo(() => graphSignature(...), [nodes, edges])` re-fires per tick.
 * The full O((N+E) log (N+E)) sort+join + ~10KB string allocation can
 * stack to a few ms across the 4 canvas-class callers (2D, Map, Relief,
 * NodeInspector) — and the output is invariant when topology is stable.
 * The internal cache returns the prior signature in O(1) on a quick-key
 * hit, so feed ticks become free across all consumers.
 *
 * Cache shape mirrors the round 17 fingerprint cache in chi-star.ts:
 * bounded Map with FIFO eviction, delete-and-re-set on hit for an
 * LRU-ish refresh.
 */
const SIG_MAX_ENTRIES = 16;
const sigCache = new Map<string, string>();

function quickSigKey(nodes: CausalNode[], edges: CausalEdge[]): string {
  const nN = nodes.length;
  const nE = edges.length;
  const nFirst = nN > 0 ? nodes[0].id : "";
  const nLast = nN > 0 ? nodes[nN - 1].id : "";
  const eFirst = nE > 0 ? edges[0].id : "";
  const eLast = nE > 0 ? edges[nE - 1].id : "";
  return `${nN}:${nFirst}:${nLast}|${nE}:${eFirst}:${eLast}`;
}

export function graphSignature(
  nodes: CausalNode[],
  edges: CausalEdge[],
): string {
  const qk = quickSigKey(nodes, edges);
  const cached = sigCache.get(qk);
  if (cached !== undefined) {
    // Refresh insertion order so this entry survives the next eviction.
    sigCache.delete(qk);
    sigCache.set(qk, cached);
    return cached;
  }
  const ns = nodes.map((n) => n.id).sort().join("|");
  const es = edges.map((e) => e.id).sort().join("|");
  const sig = `${ns}#${es}`;
  if (sigCache.size >= SIG_MAX_ENTRIES) {
    const firstKey = sigCache.keys().next().value;
    if (firstKey !== undefined) sigCache.delete(firstKey);
  }
  sigCache.set(qk, sig);
  return sig;
}
