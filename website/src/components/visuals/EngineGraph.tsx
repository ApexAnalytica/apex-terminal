"use client";

/**
 * Annotated causal graph showing how each engine acts on different parts
 * of a critical-system topology. Used on the Product page.
 */

const NODES = [
  { id: "src1", x: 90,  y: 80,  r: 7, color: "var(--accent-amber)",  label: "FEED" },
  { id: "src2", x: 90,  y: 220, r: 7, color: "var(--accent-amber)",  label: "FEED" },
  { id: "n1",   x: 280, y: 60,  r: 8, color: "var(--accent-cyan)",   label: "MFG" },
  { id: "n2",   x: 280, y: 160, r: 11, color: "var(--accent-purple)", label: "INFRA" },
  { id: "n3",   x: 280, y: 260, r: 8, color: "var(--accent-green)",  label: "ENERGY" },
  { id: "h1",   x: 470, y: 100, r: 9, color: "var(--accent-red)",    label: "GEO" },
  { id: "h2",   x: 470, y: 230, r: 8, color: "var(--accent-orange)", label: "FX" },
  { id: "out",  x: 660, y: 165, r: 13, color: "var(--accent-cyan)",  label: "ΩF" },
];

const EDGES: Array<[string, string]> = [
  ["src1", "n1"], ["src1", "n2"],
  ["src2", "n2"], ["src2", "n3"],
  ["n1", "h1"], ["n2", "h1"], ["n2", "h2"], ["n3", "h2"],
  ["h1", "out"], ["h2", "out"], ["n2", "out"],
];

const W = 760;
const H = 360;

export default function EngineGraph() {
  const byId = Object.fromEntries(NODES.map((n) => [n.id, n]));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" role="img" aria-label="Engine-annotated causal graph">
      <defs>
        <radialGradient id="omegaOut" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="rgba(0,229,255,0.5)" />
          <stop offset="100%" stopColor="rgba(0,229,255,0)" />
        </radialGradient>
      </defs>

      {/* The four engines, listed as equal peers that all run on the
          whole shared graph below — deliberately NOT split into per-
          engine regions. The old banded layout gave each engine its
          own horizontal slice of the graph, which read as a pipeline
          and contradicted "running in parallel on a shared graph".
          Single neutral color so the names don't appear to "own" the
          same-colored domain nodes. */}
      <text
        x={W / 2}
        y={26}
        textAnchor="middle"
        fontFamily="var(--font-michroma)"
        fontSize="8.5"
        letterSpacing="2"
        fill="var(--accent-cyan)"
        fillOpacity={0.85}
      >
        SPIRTES · TARSKI · PEARL · PARETO
      </text>
      {/* Full-width scope rule: all four engines cover the entire
          graph span (first feed → Ω output), not partitioned slices. */}
      <line x1={90} x2={660} y1={38} y2={38} stroke="var(--accent-cyan)" strokeOpacity={0.15} strokeWidth={1} />
      <line x1={90} x2={90} y1={36} y2={40} stroke="var(--accent-cyan)" strokeOpacity={0.15} strokeWidth={1} />
      <line x1={660} x2={660} y1={36} y2={40} stroke="var(--accent-cyan)" strokeOpacity={0.15} strokeWidth={1} />

      {/* Edges */}
      {EDGES.map(([a, b], i) => {
        const A = byId[a], B = byId[b];
        return (
          <g key={`${a}-${b}`}>
            <line x1={A.x} y1={A.y} x2={B.x} y2={B.y} stroke="rgba(0,229,255,0.18)" strokeWidth={1} />
            <line
              x1={A.x} y1={A.y} x2={B.x} y2={B.y}
              stroke="rgba(0,229,255,0.7)"
              strokeWidth={1}
              strokeDasharray="2 6"
              className="edge-animated"
              style={{ animationDelay: `${(i % 4) * 0.25}s` }}
            />
          </g>
        );
      })}

      {/* Output halo */}
      <circle cx={byId.out.x} cy={byId.out.y} r={28} fill="url(#omegaOut)" />

      {/* Nodes */}
      {NODES.map((n) => (
        <g key={n.id}>
          <circle cx={n.x} cy={n.y} r={n.r} fill={n.color} />
          <circle cx={n.x} cy={n.y} r={n.r} fill="none" stroke={n.color} strokeOpacity={0.4} strokeWidth={1}>
            <animate attributeName="r" values={`${n.r};${n.r + 6};${n.r}`} dur="3s" repeatCount="indefinite" />
            <animate attributeName="stroke-opacity" values="0.5;0;0.5" dur="3s" repeatCount="indefinite" />
          </circle>
          <text
            x={n.x}
            y={n.y + n.r + 14}
            textAnchor="middle"
            fontFamily="var(--font-michroma)"
            fontSize="8"
            letterSpacing="2"
            fill="var(--text-muted)"
          >
            {n.label}
          </text>
        </g>
      ))}

      {/* Legend bottom */}
      <text x={W / 2} y={H - 8} textAnchor="middle" fontFamily="var(--font-jetbrains-mono)" fontSize="9" fill="var(--text-muted)">
        SAMPLE TOPOLOGY · 8 NODES · 11 EDGES
      </text>
    </svg>
  );
}
