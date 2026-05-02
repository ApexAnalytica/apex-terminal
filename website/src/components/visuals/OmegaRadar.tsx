"use client";

/**
 * Pentagon radar chart for ΩF pillar scoring.
 * Pure SVG so it renders identically on first paint and matches the
 * platform's terminal aesthetic.
 *
 * Default sample: a "fragile critical node" — high I/R/C, moderate T,
 * lower J. Override `values` to show a different profile.
 */

type PillarKey = "I" | "R" | "J" | "C" | "T";

const PILLARS: Array<{ key: PillarKey; name: string; color: string }> = [
  { key: "I", name: "IRREPLACEABILITY",      color: "var(--accent-cyan)"   },
  { key: "R", name: "RESTORATION LATENCY",   color: "var(--accent-green)"  },
  { key: "J", name: "JURISDICTIONAL HAZARD", color: "var(--accent-red)"    },
  { key: "C", name: "CASCADE LOAD",          color: "var(--accent-purple)" },
  { key: "T", name: "TAIL DEPTH",            color: "var(--accent-amber)"  },
];

const CX = 220;
const CY = 220;
const R = 160;

// Vertex angle for pillar i (5 pillars, start at top, clockwise)
function vertex(i: number, scale = 1) {
  const angle = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
  return {
    x: CX + Math.cos(angle) * R * scale,
    y: CY + Math.sin(angle) * R * scale,
  };
}

export default function OmegaRadar({
  values = { I: 9, R: 8, J: 4, C: 7, T: 6 },
  composite = 7.42,
}: {
  values?: Record<PillarKey, number>;
  composite?: number;
}) {
  const scaleRings = [0.2, 0.4, 0.6, 0.8, 1.0];

  // Sample polygon (the actual scored profile)
  const samplePoints = PILLARS.map((p, i) => {
    const v = vertex(i, values[p.key] / 10);
    return `${v.x},${v.y}`;
  }).join(" ");

  return (
    <div className="relative">
      <svg viewBox="0 0 440 440" className="w-full h-full" role="img" aria-label="ΩF pillar radar chart">
        <defs>
          <radialGradient id="omegaFill" cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor="rgba(0,229,255,0.35)" />
            <stop offset="100%" stopColor="rgba(0,229,255,0.05)" />
          </radialGradient>
          <filter id="cyanGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Concentric pentagons (scale rings) */}
        {scaleRings.map((s, idx) => {
          const pts = PILLARS.map((_, i) => {
            const v = vertex(i, s);
            return `${v.x},${v.y}`;
          }).join(" ");
          return (
            <polygon
              key={s}
              points={pts}
              fill="none"
              stroke="var(--border-bright)"
              strokeWidth={idx === scaleRings.length - 1 ? 1 : 0.5}
              strokeOpacity={idx === scaleRings.length - 1 ? 0.6 : 0.25}
            />
          );
        })}

        {/* Spokes from center to each vertex */}
        {PILLARS.map((p, i) => {
          const v = vertex(i, 1);
          return (
            <line
              key={p.key}
              x1={CX} y1={CY} x2={v.x} y2={v.y}
              stroke="var(--border-bright)"
              strokeOpacity={0.3}
              strokeWidth={0.5}
            />
          );
        })}

        {/* Scale labels along top spoke (2,4,6,8,10) */}
        {scaleRings.map((s, idx) => {
          const v = vertex(0, s);
          return (
            <text
              key={`scale-${s}`}
              x={v.x + 6}
              y={v.y + 2}
              fontFamily="var(--font-geist-mono)"
              fontSize="8"
              fill="var(--text-muted)"
              opacity={0.6}
            >
              {(s * 10).toFixed(0)}
            </text>
          );
        })}

        {/* Sample profile polygon */}
        <polygon
          points={samplePoints}
          fill="url(#omegaFill)"
          stroke="var(--accent-cyan)"
          strokeWidth={1.5}
          strokeOpacity={0.9}
          filter="url(#cyanGlow)"
        />

        {/* Sample profile vertices */}
        {PILLARS.map((p, i) => {
          const v = vertex(i, values[p.key] / 10);
          return (
            <g key={`pt-${p.key}`}>
              <circle cx={v.x} cy={v.y} r={5} fill={p.color} opacity={0.4}>
                <animate attributeName="r" values="5;8;5" dur="3s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.4;0.1;0.4" dur="3s" repeatCount="indefinite" />
              </circle>
              <circle cx={v.x} cy={v.y} r={3.5} fill={p.color} />
            </g>
          );
        })}

        {/* Pillar labels at outer ring */}
        {PILLARS.map((p, i) => {
          const v = vertex(i, 1.18);
          return (
            <g key={`lbl-${p.key}`} textAnchor="middle">
              <text
                x={v.x}
                y={v.y - 3}
                fontFamily="var(--font-michroma)"
                fontSize="14"
                fontWeight="400"
                letterSpacing="2"
                fill={p.color}
              >
                {p.key}
              </text>
              <text
                x={v.x}
                y={v.y + 11}
                fontFamily="var(--font-michroma)"
                fontSize="6"
                letterSpacing="1.5"
                fill="var(--text-muted)"
              >
                {p.name}
              </text>
              <text
                x={v.x}
                y={v.y + 22}
                fontFamily="var(--font-geist-mono)"
                fontSize="9"
                fill={p.color}
                opacity={0.85}
              >
                {values[p.key].toFixed(1)}
              </text>
            </g>
          );
        })}

        {/* Center composite */}
        <circle cx={CX} cy={CY} r={28} fill="var(--surface-elevated)" stroke="var(--accent-cyan)" strokeOpacity={0.4} />
        <text
          x={CX}
          y={CY - 4}
          textAnchor="middle"
          fontFamily="var(--font-michroma)"
          fontSize="6"
          letterSpacing="1.5"
          fill="var(--text-muted)"
        >
          ΩF
        </text>
        <text
          x={CX}
          y={CY + 11}
          textAnchor="middle"
          fontFamily="var(--font-geist-mono)"
          fontSize="14"
          fill="var(--accent-cyan)"
        >
          {composite.toFixed(2)}
        </text>
      </svg>
    </div>
  );
}
