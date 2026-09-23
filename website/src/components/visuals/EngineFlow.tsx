"use client";

/**
 * EngineFlow — branched topology showing how the 4 engines operate in
 * parallel on the scored graph, NOT a sequential pipeline.
 *
 * Data + topology → enriched graph (pillar scores I,R,J,C,T → ΩF per node)
 *                        ↓
 *           ┌──────┬─────┴──────┬──────┐
 *        SPIRTES TARSKI       PEARL  PARETO   (parallel views)
 *           │      │            │      │
 *           └──────┴─────┬──────┴──────┘
 *                        ↓
 *        Ω state · cascade replay · MC forecast
 */

const W = 1100;
const H = 360;

const ENGINES = [
  { name: "SPIRTES", role: "STRUCTURE",      sub: "PC · FCI · NOTEARS",     color: "var(--accent-cyan)"   },
  { name: "TARSKI",  role: "VERIFICATION",   sub: "axiom library · check",  color: "var(--accent-amber)"  },
  { name: "PEARL",   role: "COUNTERFACTUAL", sub: "do(X) · sever · spawn",  color: "var(--accent-purple)" },
  { name: "PARETO",  role: "CASCADE & TAIL", sub: "MC cascade · tail stats", color: "var(--accent-orange)" },
];

// Layout constants
const PILL_X = 460;
const PILL_W = 220;
const PILL_H = 56;
const PILL_GAP = 16;
const ENGINE_TOTAL_H = ENGINES.length * PILL_H + (ENGINES.length - 1) * PILL_GAP;
const ENGINE_TOP = (H - ENGINE_TOTAL_H) / 2;

// Helper to draw a pill (rounded rect)
function pill(x: number, y: number, w: number, h: number, color: string, key: string) {
  return (
    <rect
      key={key}
      x={x} y={y} width={w} height={h} rx={6}
      fill="var(--surface-elevated)"
      stroke={color}
      strokeOpacity={0.6}
      strokeWidth={1.2}
    />
  );
}

export default function EngineFlow() {
  // Data + Graph (left side)
  const dataX = 40, dataY = H / 2 - 24, dataW = 150, dataH = 48;
  const graphX = 220, graphY = H / 2 - 50, graphW = 200, graphH = 100;
  // Output (right side)
  const outX = 760, outY = H / 2 - 50, outW = 300, outH = 100;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" role="img" aria-label="Engine architecture: 4 parallel engines on scored graph">
      <defs>
        <linearGradient id="branch-grad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor="rgba(0,229,255,0.6)" />
          <stop offset="100%" stopColor="rgba(255,176,32,0.4)" />
        </linearGradient>
      </defs>

      {/* ─── Left column: DATA → GRAPH ─── */}
      {/* DATA pill */}
      <rect x={dataX} y={dataY} width={dataW} height={dataH} rx={6}
        fill="var(--surface-elevated)" stroke="var(--text-muted)" strokeOpacity={0.5} strokeWidth={1.2} />
      <text x={dataX + dataW / 2} y={dataY + 22}
        textAnchor="middle" fontFamily="var(--font-michroma)" fontSize="10"
        letterSpacing="2.5" fill="var(--foreground)">DATA</text>
      <text x={dataX + dataW / 2} y={dataY + 38}
        textAnchor="middle" fontFamily="var(--font-jetbrains-mono)" fontSize="9"
        fill="var(--text-muted)">feeds + topology</text>

      {/* Arrow data → graph */}
      <line x1={dataX + dataW} y1={H / 2} x2={graphX} y2={H / 2}
        stroke="var(--accent-cyan)" strokeOpacity={0.6} strokeWidth={1.2} />

      {/* GRAPH pill (taller — encloses scoring) */}
      <rect x={graphX} y={graphY} width={graphW} height={graphH} rx={6}
        fill="var(--surface-elevated)" stroke="var(--accent-cyan)" strokeOpacity={0.65} strokeWidth={1.4} />
      <text x={graphX + graphW / 2} y={graphY + 22}
        textAnchor="middle" fontFamily="var(--font-michroma)" fontSize="10"
        letterSpacing="2.5" fill="var(--accent-cyan)">SCORED GRAPH</text>
      {/* Pillar letters as a row */}
      {["I","R","J","C","T"].map((p, i) => (
        <text key={p}
          x={graphX + 30 + i * 35} y={graphY + 50}
          textAnchor="middle" fontFamily="var(--font-michroma)" fontSize="14"
          fill="var(--accent-cyan)" opacity={0.9}>{p}</text>
      ))}
      <text x={graphX + graphW / 2} y={graphY + 70}
        textAnchor="middle" fontFamily="var(--font-jetbrains-mono)" fontSize="9"
        fill="var(--text-muted)">5 pillars · per-node ΩF</text>
      <text x={graphX + graphW / 2} y={graphY + 88}
        textAnchor="middle" fontFamily="var(--font-jetbrains-mono)" fontSize="8"
        fill="var(--text-muted)" opacity={0.7}>computed at import</text>

      {/* ─── Center: 4 engine pills (parallel) ─── */}
      {ENGINES.map((e, i) => {
        const y = ENGINE_TOP + i * (PILL_H + PILL_GAP);
        const cy = y + PILL_H / 2;
        // Branch in: from graph right edge to engine left edge (curved)
        const inSrcX = graphX + graphW;
        const inSrcY = H / 2;
        const inDstX = PILL_X;
        const inDstY = cy;
        // Branch out: from engine right edge to output left edge (curved)
        const outSrcX = PILL_X + PILL_W;
        const outSrcY = cy;
        const outDstX = outX;
        const outDstY = H / 2;
        return (
          <g key={e.name}>
            {/* In-branch (graph → engine) */}
            <path
              d={`M ${inSrcX} ${inSrcY} C ${(inSrcX + inDstX) / 2} ${inSrcY}, ${(inSrcX + inDstX) / 2} ${inDstY}, ${inDstX} ${inDstY}`}
              fill="none"
              stroke={e.color}
              strokeOpacity={0.45}
              strokeWidth={1}
            />
            {/* Animated dash on in-branch */}
            <path
              d={`M ${inSrcX} ${inSrcY} C ${(inSrcX + inDstX) / 2} ${inSrcY}, ${(inSrcX + inDstX) / 2} ${inDstY}, ${inDstX} ${inDstY}`}
              fill="none"
              stroke={e.color}
              strokeOpacity={0.7}
              strokeWidth={0.8}
              strokeDasharray="3 8"
              className="edge-animated"
            />

            {/* Out-branch (engine → outputs) */}
            <path
              d={`M ${outSrcX} ${outSrcY} C ${(outSrcX + outDstX) / 2} ${outSrcY}, ${(outSrcX + outDstX) / 2} ${outDstY}, ${outDstX} ${outDstY}`}
              fill="none"
              stroke={e.color}
              strokeOpacity={0.35}
              strokeWidth={1}
            />

            {/* Engine pill */}
            {pill(PILL_X, y, PILL_W, PILL_H, e.color, `pill-${e.name}`)}
            {/* Pulse ring around the pill (subtle) */}
            <rect
              x={PILL_X - 2} y={y - 2} width={PILL_W + 4} height={PILL_H + 4} rx={8}
              fill="none" stroke={e.color} strokeOpacity={0.25} strokeWidth={1}
            >
              <animate attributeName="stroke-opacity" values="0.35;0;0.35" dur="3s" begin={`${i * 0.4}s`} repeatCount="indefinite" />
            </rect>

            {/* Engine label inside pill */}
            <text
              x={PILL_X + 18} y={y + 22}
              fontFamily="var(--font-michroma)" fontSize="13"
              letterSpacing="2" fill={e.color}
            >{e.name}</text>
            <text
              x={PILL_X + 18} y={y + 40}
              fontFamily="var(--font-jetbrains-mono)" fontSize="9"
              fill="var(--text-muted)" opacity={0.85}
            >{e.role}</text>
            <text
              x={PILL_X + PILL_W - 12} y={y + 40}
              textAnchor="end"
              fontFamily="var(--font-jetbrains-mono)" fontSize="8"
              fill="var(--text-muted)" opacity={0.6}
            >{e.sub}</text>
          </g>
        );
      })}

      {/* ─── Right: Outputs pill ─── */}
      <rect x={outX} y={outY} width={outW} height={outH} rx={6}
        fill="var(--surface-elevated)" stroke="var(--accent-cyan)" strokeOpacity={0.65} strokeWidth={1.4} />
      <text x={outX + outW / 2} y={outY + 22}
        textAnchor="middle" fontFamily="var(--font-michroma)" fontSize="10"
        letterSpacing="2.5" fill="var(--accent-cyan)">Ω OUTPUTS</text>
      <text x={outX + outW / 2} y={outY + 44}
        textAnchor="middle" fontFamily="var(--font-jetbrains-mono)" fontSize="11"
        fill="var(--foreground)">Ω buffer · status · alert</text>
      <text x={outX + outW / 2} y={outY + 62}
        textAnchor="middle" fontFamily="var(--font-jetbrains-mono)" fontSize="11"
        fill="var(--foreground)">cascade replay · MC forecast</text>
      <text x={outX + outW / 2} y={outY + 82}
        textAnchor="middle" fontFamily="var(--font-jetbrains-mono)" fontSize="9"
        fill="var(--text-muted)" opacity={0.7}>ΩSF · cascade reach · Ω-buffer</text>

      {/* Header strip: "PARALLEL" indicator */}
      <text
        x={PILL_X + PILL_W / 2}
        y={20}
        textAnchor="middle"
        fontFamily="var(--font-michroma)"
        fontSize="9"
        letterSpacing="3"
        fill="var(--accent-cyan)"
        opacity={0.7}
      >
        4 ENGINES · PARALLEL · ON-DEMAND
      </text>
      {/* Bracket above engines */}
      <line x1={PILL_X - 10} x2={PILL_X + PILL_W + 10} y1={28} y2={28} stroke="var(--accent-cyan)" strokeOpacity={0.4} strokeWidth={0.5} />
      <line x1={PILL_X - 10} x2={PILL_X - 10} y1={28} y2={36} stroke="var(--accent-cyan)" strokeOpacity={0.4} strokeWidth={0.5} />
      <line x1={PILL_X + PILL_W + 10} x2={PILL_X + PILL_W + 10} y1={28} y2={36} stroke="var(--accent-cyan)" strokeOpacity={0.4} strokeWidth={0.5} />
    </svg>
  );
}
