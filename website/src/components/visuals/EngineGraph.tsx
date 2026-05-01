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

const ENGINE_BANDS = [
  { engine: "SPIRTES", x: 90,  w: 200, color: "var(--accent-cyan)",   y: 14, role: "STRUCTURE" },
  { engine: "TARSKI",  x: 290, w: 90,  color: "var(--accent-amber)",  y: 14, role: "VERIFY" },
  { engine: "PEARL",   x: 380, w: 180, color: "var(--accent-purple)", y: 14, role: "COUNTERFACT" },
  { engine: "PARETO",  x: 560, w: 140, color: "var(--accent-orange)", y: 14, role: "SIMULATE" },
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

      {/* Engine annotation bands at top */}
      {ENGINE_BANDS.map((band) => (
        <g key={band.engine}>
          <line
            x1={band.x}
            x2={band.x + band.w}
            y1={band.y + 8}
            y2={band.y + 8}
            stroke={band.color}
            strokeOpacity={0.5}
            strokeWidth={1}
          />
          <line x1={band.x} x2={band.x} y1={band.y + 4} y2={band.y + 12} stroke={band.color} strokeOpacity={0.5} strokeWidth={1} />
          <line x1={band.x + band.w} x2={band.x + band.w} y1={band.y + 4} y2={band.y + 12} stroke={band.color} strokeOpacity={0.5} strokeWidth={1} />
          <rect
            x={band.x + band.w / 2 - 38}
            y={band.y - 6}
            width={76}
            height={14}
            fill="var(--background)"
            opacity={0.95}
          />
          <text
            x={band.x + band.w / 2}
            y={band.y + 4}
            textAnchor="middle"
            fontFamily="var(--font-michroma)"
            fontSize="8"
            letterSpacing="2"
            fill={band.color}
          >
            {band.engine}
          </text>
        </g>
      ))}

      {/* Vertical band guides */}
      {ENGINE_BANDS.map((band) => (
        <line
          key={`g-${band.engine}`}
          x1={band.x + band.w}
          x2={band.x + band.w}
          y1={50}
          y2={H - 30}
          stroke={band.color}
          strokeOpacity={0.07}
          strokeWidth={1}
          strokeDasharray="4 4"
        />
      ))}

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
      <text x={W / 2} y={H - 8} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="9" fill="var(--text-muted)">
        SAMPLE TOPOLOGY · 8 NODES · 11 EDGES
      </text>
    </svg>
  );
}
