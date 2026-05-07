"use client";

/**
 * HeroBackground — animated full-bleed causal graph for the hero.
 *
 * Renders a diffuse network of nodes + edges with traveling dash pulses
 * along each edge. Sits behind the hero content at low opacity. The
 * graph topology is generated deterministically from a fixed seed so
 * SSR matches client and re-renders are stable.
 *
 * Design note: this matches the brand (causal intelligence) rather than
 * a generic circuit trace. Brand color is cyan with amber accents on a
 * subset of nodes.
 */

import React from "react";

type Node = { x: number; y: number; r: number; pulseDelay: number; accent: boolean };
type Edge = { a: number; b: number; flowDelay: number; flowDuration: number };

// Deterministic PRNG so SSR == CSR == every render.
function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6D2B79F5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function buildGraph(width: number, height: number, seed = 42): { nodes: Node[]; edges: Edge[] } {
  const rng = mulberry32(seed);
  const nodes: Node[] = [];
  // Scatter nodes on a perturbed grid to feel structured-but-organic.
  const cols = 9;
  const rows = 5;
  const cellW = width / cols;
  const cellH = height / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const jitterX = (rng() - 0.5) * cellW * 0.7;
      const jitterY = (rng() - 0.5) * cellH * 0.7;
      const x = c * cellW + cellW / 2 + jitterX;
      const y = r * cellH + cellH / 2 + jitterY;
      // Skip ~25% of cells so the graph isn't a perfect mesh
      if (rng() < 0.25) continue;
      nodes.push({
        x,
        y,
        r: 1.6 + rng() * 1.4,
        pulseDelay: rng() * 4,
        accent: rng() < 0.15, // ~15% of nodes get amber accent
      });
    }
  }

  // Connect nodes within MAX_DIST. Cap edges per node so it doesn't
  // get too dense. Edges become long-lived flow lanes.
  const edges: Edge[] = [];
  const MAX_DIST = Math.max(cellW, cellH) * 1.6;
  const PER_NODE_CAP = 3;
  const edgeCount: number[] = new Array(nodes.length).fill(0);

  for (let i = 0; i < nodes.length; i++) {
    // Build candidate list sorted by distance
    const candidates: Array<[number, number]> = [];
    for (let j = i + 1; j < nodes.length; j++) {
      const dx = nodes[i].x - nodes[j].x;
      const dy = nodes[i].y - nodes[j].y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < MAX_DIST) candidates.push([j, d]);
    }
    candidates.sort((a, b) => a[1] - b[1]);
    for (const [j] of candidates) {
      if (edgeCount[i] >= PER_NODE_CAP) break;
      if (edgeCount[j] >= PER_NODE_CAP) continue;
      edgeCount[i]++;
      edgeCount[j]++;
      edges.push({
        a: i,
        b: j,
        flowDelay: rng() * 6,
        flowDuration: 3.5 + rng() * 4, // 3.5–7.5s per traversal
      });
    }
  }

  return { nodes, edges };
}

const VIEW_W = 1600;
const VIEW_H = 900;
const { nodes: NODES, edges: EDGES } = buildGraph(VIEW_W, VIEW_H, 1337);

export default function HeroBackground() {
  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="xMidYMid slice"
      className="absolute inset-0 w-full h-full pointer-events-none"
      aria-hidden
    >
      {/* Soft radial fade at the edges so the graph dissolves into the background */}
      <defs>
        <radialGradient id="hero-bg-fade" cx="50%" cy="50%" r="60%">
          <stop offset="0%" stopColor="#000" stopOpacity="0" />
          <stop offset="60%" stopColor="#000" stopOpacity="0" />
          <stop offset="100%" stopColor="#000" stopOpacity="1" />
        </radialGradient>
        <mask id="hero-bg-mask">
          <rect width={VIEW_W} height={VIEW_H} fill="white" />
          <rect width={VIEW_W} height={VIEW_H} fill="url(#hero-bg-fade)" />
        </mask>
      </defs>

      <g mask="url(#hero-bg-mask)">
        {/* Edges first so nodes paint on top */}
        {EDGES.map((e, i) => {
          const a = NODES[e.a];
          const b = NODES[e.b];
          const isAccent = a.accent || b.accent;
          const stroke = isAccent ? "var(--accent-amber)" : "var(--accent-cyan)";
          return (
            <g key={`edge-${i}`}>
              {/* Static base edge — very faint */}
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={stroke}
                strokeOpacity={0.12}
                strokeWidth={0.8}
              />
              {/* Animated dash flowing along the edge */}
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={stroke}
                strokeOpacity={0.55}
                strokeWidth={0.9}
                strokeDasharray="2 18"
                style={{
                  animation: `hero-edge-flow ${e.flowDuration}s linear ${e.flowDelay}s infinite`,
                }}
              />
            </g>
          );
        })}

        {/* Nodes */}
        {NODES.map((n, i) => {
          const fill = n.accent ? "var(--accent-amber)" : "var(--accent-cyan)";
          return (
            <g key={`node-${i}`}>
              <circle cx={n.x} cy={n.y} r={n.r} fill={fill} fillOpacity={0.6} />
              {/* Pulse ring */}
              <circle
                cx={n.x}
                cy={n.y}
                r={n.r}
                fill="none"
                stroke={fill}
                strokeWidth={0.8}
                strokeOpacity={0.5}
                style={{
                  animation: `hero-node-pulse 4s cubic-bezier(0.215, 0.61, 0.355, 1) ${n.pulseDelay}s infinite`,
                  transformOrigin: `${n.x}px ${n.y}px`,
                }}
              />
            </g>
          );
        })}
      </g>
    </svg>
  );
}
