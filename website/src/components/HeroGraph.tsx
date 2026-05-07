"use client";

/**
 * Decorative animated causal-graph backdrop for the homepage hero.
 * Pure SVG — no canvas, no JS layout — so it renders identically on first paint.
 */
export default function HeroGraph() {
  // Nodes positioned in a loose 3-tier topology (sources → middle → sinks)
  const nodes = [
    { id: "n1", x: 80,  y: 110, color: "var(--accent-amber)",     r: 6, label: "OIL" },
    { id: "n2", x: 80,  y: 220, color: "var(--accent-green)",     r: 6, label: "GAS" },
    { id: "n3", x: 80,  y: 330, color: "var(--accent-red)",       r: 6, label: "GEO" },
    { id: "n4", x: 280, y: 80,  color: "var(--accent-cyan)",      r: 8, label: "MFG" },
    { id: "n5", x: 280, y: 200, color: "var(--accent-purple)",    r: 9, label: "INFRA" },
    { id: "n6", x: 280, y: 330, color: "var(--accent-orange)",    r: 7, label: "FX" },
    { id: "n7", x: 480, y: 140, color: "var(--accent-magenta)",   r: 8, label: "SCI" },
    { id: "n8", x: 480, y: 280, color: "var(--accent-cyan)",      r: 10, label: "ΩF" },
  ];

  const edges: Array<[string, string]> = [
    ["n1", "n4"], ["n1", "n5"],
    ["n2", "n5"], ["n2", "n6"],
    ["n3", "n5"], ["n3", "n6"],
    ["n4", "n7"], ["n4", "n8"],
    ["n5", "n7"], ["n5", "n8"],
    ["n6", "n8"],
  ];

  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));

  return (
    <svg
      viewBox="0 0 560 420"
      className="w-full h-full"
      role="img"
      aria-label="Causal graph visualization"
    >
      <defs>
        <radialGradient id="nodeGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(0,229,255,0.5)" />
          <stop offset="100%" stopColor="rgba(0,229,255,0)" />
        </radialGradient>
      </defs>

      {/* Edges */}
      {edges.map(([a, b], i) => {
        const A = byId[a], B = byId[b];
        return (
          <g key={`${a}-${b}`}>
            <line
              x1={A.x} y1={A.y} x2={B.x} y2={B.y}
              stroke="rgba(0,229,255,0.18)"
              strokeWidth={1}
            />
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

      {/* Nodes */}
      {nodes.map((n) => (
        <g key={n.id}>
          <circle cx={n.x} cy={n.y} r={n.r + 12} fill="url(#nodeGlow)" opacity={0.6} />
          <circle cx={n.x} cy={n.y} r={n.r} fill={n.color} />
          <circle cx={n.x} cy={n.y} r={n.r} fill="none" stroke={n.color} strokeOpacity={0.4} strokeWidth={1}>
            <animate attributeName="r" values={`${n.r};${n.r + 8};${n.r}`} dur="3s" repeatCount="indefinite" />
            <animate attributeName="stroke-opacity" values="0.5;0;0.5" dur="3s" repeatCount="indefinite" />
          </circle>
          <text
            x={n.x}
            y={n.y - n.r - 8}
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
    </svg>
  );
}
