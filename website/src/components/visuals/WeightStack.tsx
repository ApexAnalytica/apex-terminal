"use client";

/**
 * Stacked weight bar showing how the 5 pillar weights compose ΩF.
 * Animated subtly via CSS — no JS required.
 */

const PILLARS = [
  { key: "I", weight: 0.25, color: "bg-accent-cyan",   border: "border-accent-cyan/40",   text: "text-accent-cyan" },
  { key: "R", weight: 0.20, color: "bg-accent-green",  border: "border-accent-green/40",  text: "text-accent-green" },
  { key: "J", weight: 0.15, color: "bg-accent-red",    border: "border-accent-red/40",    text: "text-accent-red" },
  { key: "C", weight: 0.25, color: "bg-accent-purple", border: "border-accent-purple/40", text: "text-accent-purple" },
  { key: "T", weight: 0.15, color: "bg-accent-amber",  border: "border-accent-amber/40",  text: "text-accent-amber" },
];

export default function WeightStack() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="font-[family-name:var(--font-michroma)] text-[10px] tracking-[0.3em] text-accent-cyan/80">
          PILLAR WEIGHTS · EXAMPLE
        </div>
        <div className="font-mono text-[10px] tracking-wider text-text-muted">
          Σw = 1.00
        </div>
      </div>

      {/* Stacked bar */}
      <div className="flex w-full overflow-hidden rounded border border-border bg-surface" style={{ height: 48 }}>
        {PILLARS.map((p, i) => (
          <div
            key={p.key}
            className={`relative flex items-center justify-center ${p.color} transition-all`}
            style={{
              width: `${p.weight * 100}%`,
              borderRight: i < PILLARS.length - 1 ? "1px solid var(--background)" : "none",
              opacity: 0.85,
            }}
          >
            <span className="font-[family-name:var(--font-michroma)] text-[11px] tracking-[0.15em] text-background mix-blend-screen">
              {p.key}
            </span>
          </div>
        ))}
      </div>

      {/* Legend row */}
      <div className="grid grid-cols-5 gap-3">
        {PILLARS.map((p) => (
          <div key={p.key} className={`flex flex-col items-start gap-1 border-l ${p.border} pl-3`}>
            <div className={`font-[family-name:var(--font-michroma)] text-sm tracking-[0.1em] ${p.text}`}>
              {p.key}
            </div>
            <div className="font-mono text-[10px] text-text-muted tracking-wider">
              w = {p.weight.toFixed(2)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
