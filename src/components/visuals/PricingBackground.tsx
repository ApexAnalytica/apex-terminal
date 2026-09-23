/**
 * PricingBackground — animated full-bleed causal graph for the
 * /pricing page, matching the visual language of the public
 * marketing site.
 *
 * Renders a diffuse network of nodes + edges with traveling dash
 * pulses along each edge, masked with a soft radial fade so it
 * dissolves into the page edges. Topology is generated
 * deterministically from a fixed seed so SSR matches CSR and the
 * visual is stable across re-renders.
 *
 * Self-contained: includes its own keyframes via a <style> tag so
 * we don't have to touch the platform's globals.css. Mount this
 * inside a fixed-positioned wrapper on the page that wants the
 * effect.
 */

import React from "react";

type Node = { x: number; y: number; r: number; pulseDelay: number; accent: boolean };
type Edge = { a: number; b: number; flowDelay: number; flowDuration: number };

// Deterministic PRNG so SSR == CSR == every render.
function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function buildGraph(width: number, height: number, seed = 42): {
  nodes: Node[];
  edges: Edge[];
} {
  const rng = mulberry32(seed);
  const nodes: Node[] = [];
  const cols = 9;
  const rows = 5;
  const cellW = width / cols;
  const cellH = height / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const jitterX = (rng() - 0.5) * cellW * 0.55;
      const jitterY = (rng() - 0.5) * cellH * 0.55;
      const x = (c + 0.5) * cellW + jitterX;
      const y = (r + 0.5) * cellH + jitterY;
      const radius = 1.4 + rng() * 1.6;
      const accent = rng() < 0.18;
      const pulseDelay = rng() * 4;
      nodes.push({ x, y, r: radius, pulseDelay, accent });
    }
  }

  const edges: Edge[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    const candidates = nodes
      .map((other, j) => ({
        j,
        d: Math.hypot(other.x - n.x, other.y - n.y),
      }))
      .filter((c) => c.j !== i)
      .sort((a, b) => a.d - b.d)
      .slice(0, 3 + Math.floor(rng() * 2));

    for (const c of candidates) {
      if (rng() < 0.45 && c.j > i) {
        edges.push({
          a: i,
          b: c.j,
          flowDelay: rng() * 4,
          flowDuration: 2.6 + rng() * 4,
        });
      }
    }
  }

  return { nodes, edges };
}

const VIEW_W = 1440;
const VIEW_H = 720;
const { nodes: NODES, edges: EDGES } = buildGraph(VIEW_W, VIEW_H);

export default function PricingBackground() {
  return (
    <>
      <style>{`
        @keyframes pricing-bg-edge-flow {
          0%   { stroke-dashoffset: 200; }
          100% { stroke-dashoffset: 0; }
        }
        @keyframes pricing-bg-node-pulse {
          0%   { transform: scale(1);   opacity: 0.5; }
          50%  { transform: scale(2.6); opacity: 0;   }
          100% { transform: scale(1);   opacity: 0;   }
        }
      `}</style>
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 w-full h-full pointer-events-none"
        aria-hidden
      >
        <defs>
          <radialGradient id="pricing-bg-fade" cx="50%" cy="50%" r="60%">
            <stop offset="0%" stopColor="#000" stopOpacity="0" />
            <stop offset="60%" stopColor="#000" stopOpacity="0" />
            <stop offset="100%" stopColor="#000" stopOpacity="1" />
          </radialGradient>
          <mask id="pricing-bg-mask">
            <rect width={VIEW_W} height={VIEW_H} fill="white" />
            <rect width={VIEW_W} height={VIEW_H} fill="url(#pricing-bg-fade)" />
          </mask>
        </defs>

        <g mask="url(#pricing-bg-mask)">
          {EDGES.map((e, i) => {
            const a = NODES[e.a];
            const b = NODES[e.b];
            const isAccent = a.accent || b.accent;
            const stroke = isAccent ? "var(--accent-amber)" : "var(--accent-cyan)";
            return (
              <g key={`edge-${i}`}>
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={stroke}
                  strokeOpacity={0.12}
                  strokeWidth={0.8}
                />
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
                    animation: `pricing-bg-edge-flow ${e.flowDuration}s linear ${e.flowDelay}s infinite`,
                  }}
                />
              </g>
            );
          })}

          {NODES.map((n, i) => {
            const fill = n.accent ? "var(--accent-amber)" : "var(--accent-cyan)";
            return (
              <g key={`node-${i}`}>
                <circle cx={n.x} cy={n.y} r={n.r} fill={fill} fillOpacity={0.6} />
                <circle
                  cx={n.x}
                  cy={n.y}
                  r={n.r}
                  fill="none"
                  stroke={fill}
                  strokeWidth={0.8}
                  strokeOpacity={0.5}
                  style={{
                    animation: `pricing-bg-node-pulse 4s cubic-bezier(0.215, 0.61, 0.355, 1) ${n.pulseDelay}s infinite`,
                    transformOrigin: `${n.x}px ${n.y}px`,
                  }}
                />
              </g>
            );
          })}
        </g>
      </svg>
    </>
  );
}
