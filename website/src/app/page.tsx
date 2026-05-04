import Image from "next/image";
import Link from "next/link";
import HeroGraph from "@/components/HeroGraph";
import EngineFlow from "@/components/visuals/EngineFlow";
import HeroBackground from "@/components/visuals/HeroBackground";
import { Section, TerminalHeader } from "@/components/ui/Section";
import CTAButton from "@/components/ui/CTAButton";
import { SITE } from "@/lib/site";

/* ───────── data ───────── */

const PILLARS = [
  { letter: "I", name: "IRREPLACEABILITY",      value: 9.1, color: "text-accent-cyan",   border: "border-accent-cyan/30",   bg: "bg-accent-cyan",   raw: "var(--accent-cyan)",   desc: "How hard the node is to substitute — technically, contractually, or commercially." },
  { letter: "R", name: "RESTORATION LATENCY",   value: 8.4, color: "text-accent-green",  border: "border-accent-green/30",  bg: "bg-accent-green",  raw: "var(--accent-green)",  desc: "How long it takes to bring equivalent capacity back online after a failure." },
  { letter: "J", name: "JURISDICTIONAL HAZARD", value: 7.8, color: "text-accent-red",    border: "border-accent-red/30",    bg: "bg-accent-red",    raw: "var(--accent-red)",    desc: "Geopolitical and regulatory exposure — sanctions, conflict zones, export controls." },
  { letter: "C", name: "CASCADE LOAD",          value: 7.2, color: "text-accent-purple", border: "border-accent-purple/30", bg: "bg-accent-purple", raw: "var(--accent-purple)", desc: "How much of the downstream system depends on the node. The blast radius if it breaks." },
  { letter: "T", name: "TAIL DEPTH",            value: 4.6, color: "text-accent-amber",  border: "border-accent-amber/30",  bg: "bg-accent-amber",  raw: "var(--accent-amber)",  desc: "How bad the bad case really is, beyond what VaR or historical data would suggest." },
];

const CAPABILITIES = [
  { step: "01", title: "MAP",         body: "Discover the causal topology of a critical system from observational data.",          color: "cyan"  as const },
  { step: "02", title: "SCORE",       body: "Quantify Ω-Fragility for every node across five canonical pillars.",                  color: "amber" as const },
  { step: "03", title: "STRESS-TEST", body: "Counterfactual failures, cascade simulation, tail-risk statistics.",                  color: "red"   as const },
];

const DOMAINS = [
  { label: "MANUFACTURING",  slug: "manufacturing",  text: "text-accent-cyan",    border: "border-accent-cyan/25",    dot: "bg-accent-cyan",    sub: "Foundries · fabs · advanced materials" },
  { label: "INFRASTRUCTURE", slug: "infrastructure", text: "text-accent-purple",  border: "border-accent-purple/25",  dot: "bg-accent-purple",  sub: "Power · water · ports · telecom · rail" },
  { label: "ECONOMIC",       slug: "economic",       text: "text-accent-amber",   border: "border-accent-amber/25",   dot: "bg-accent-amber",   sub: "Trade flows · sectoral GDP · exposure" },
  { label: "FINANCE",        slug: "finance",        text: "text-accent-orange",  border: "border-accent-orange/25",  dot: "bg-accent-orange",  sub: "Banks · settlement · sovereign credit" },
  { label: "ENERGY",         slug: "energy",         text: "text-accent-green",   border: "border-accent-green/25",   dot: "bg-accent-green",   sub: "Grid · oil · gas · transition tech" },
  { label: "GEOPOLITICAL",   slug: "geopolitical",   text: "text-accent-red",     border: "border-accent-red/25",     dot: "bg-accent-red",     sub: "Sanctions · conflict · export controls" },
  { label: "SCIENCE",        slug: "science",        text: "text-accent-magenta", border: "border-accent-magenta/25", dot: "bg-accent-magenta", sub: "Research infra · instrumentation · talent" },
];

/* ───────── page ───────── */

export default function Home() {
  return (
    <>
      {/* ───────── HERO ───────── */}
      <section className="relative overflow-hidden border-b border-border">
        <div className="absolute inset-0 grid-bg opacity-60 mask-fade-edges" aria-hidden />
        <div className="absolute inset-0 opacity-50 pointer-events-none" aria-hidden>
          <HeroBackground />
        </div>
        {/* Big mantis watermark — bleeds off the right edge, low opacity, behind content */}
        <div
          className="absolute -right-32 top-1/2 -translate-y-1/2 pointer-events-none select-none hidden md:block"
          style={{ opacity: 0.07 }}
          aria-hidden
        >
          <Image
            src="/mantis.png"
            alt=""
            width={780}
            height={952}
            priority
            className="object-contain"
          />
        </div>
        <div className="absolute inset-0 scanlines pointer-events-none" aria-hidden />

        <div className="relative mx-auto max-w-7xl px-4 md:px-6 pt-16 pb-20 md:pt-24 md:pb-28">
          <div className="grid gap-12 lg:grid-cols-[1.1fr_1fr] lg:items-center">
            <div className="space-y-7">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded border border-accent-cyan/30 bg-accent-cyan/5">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-accent-green opacity-60 pulse-ring" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent-green" />
                </span>
                <span className="font-[family-name:var(--font-michroma)] text-[10px] tracking-[0.3em] text-accent-cyan/90">
                  SYSTEM ONLINE · MANIFOLD v1.0
                </span>
              </div>

              <h1 className="font-[family-name:var(--font-michroma)] text-3xl md:text-5xl tracking-[0.04em] leading-[1.15] text-foreground">
                Causal intelligence
                <br />
                for{" "}
                <span className="text-accent-cyan text-glow-cyan">critical systems</span>
                <span className="cursor-blink text-accent-cyan">_</span>
              </h1>

              <p className="text-sm md:text-base font-mono text-text-muted leading-relaxed max-w-xl">
                Manifold maps, scores, and stress-tests fragility across the
                world&apos;s most consequential networks — supply chains,
                infrastructure, capital flows, and geopolitical structure.
              </p>

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <CTAButton href={SITE.trialUrl} external>REQUEST ACCESS</CTAButton>
                <CTAButton href="/product" variant="secondary">EXPLORE THE PRODUCT</CTAButton>
              </div>

              <div className="pt-6 grid grid-cols-3 gap-4 max-w-md">
                <Stat label="ENGINES" value="04" />
                <Stat label="ΩF PILLARS" value="05" />
                <Stat label="DOMAINS" value="07" />
              </div>
            </div>

            <div className="relative">
              <div className="relative bg-surface/40 border border-border rounded-lg p-4 backdrop-blur">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-accent-red/70" />
                    <span className="h-1.5 w-1.5 rounded-full bg-accent-amber/70" />
                    <span className="h-1.5 w-1.5 rounded-full bg-accent-green/70" />
                  </div>
                  <span className="font-[family-name:var(--font-michroma)] text-[10px] tracking-[0.3em] text-text-muted">
                    CAUSAL TOPOLOGY · LIVE
                  </span>
                </div>
                <div className="aspect-[4/3] w-full">
                  <HeroGraph />
                </div>
                <div className="mt-3 flex items-center justify-between text-[10px] font-mono text-text-muted/70 tracking-wider">
                  <span>NODES 8 · EDGES 11</span>
                  <span>ΩSF 7.42 · ΩSX 6.18</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ───────── // DOMAINS ───────── */}
      <Section id="domains" className="py-10 md:py-14 border-t border-border">
        <TerminalHeader label="// DOMAINS" path="manifold.domains" right="07 CONFIGURED · CLICK TO EXPLORE" />

        <p className="mb-5 text-[13px] md:text-sm font-mono text-text-muted leading-relaxed max-w-2xl">
          Find your domain. Each one explains the problem Manifold solves
          for it — in plain terms, before any of the math.
        </p>

        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7">
          {DOMAINS.map((d) => (
            <Link
              key={d.label}
              href={`/domains/${d.slug}`}
              className={`group relative bg-surface border ${d.border} rounded-lg p-4 hover:bg-surface-elevated transition-colors block`}
            >
              <div className="flex items-center justify-between mb-3">
                <span className={`relative flex h-1.5 w-1.5`}>
                  <span className={`absolute inline-flex h-full w-full rounded-full ${d.dot} opacity-50 pulse-ring`} />
                  <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${d.dot}`} />
                </span>
                <span className={`font-mono text-[10px] text-text-muted/60 tracking-wider group-hover:${d.text} transition-colors`}>›</span>
              </div>
              <div className={`font-[family-name:var(--font-michroma)] text-[10px] tracking-[0.2em] ${d.text} mb-2`}>
                {d.label}
              </div>
              <p className="text-[10px] font-mono text-text-muted leading-snug">
                {d.sub}
              </p>
            </Link>
          ))}
        </div>
      </Section>

      {/* ───────── // CAPABILITIES ───────── */}
      <Section className="pt-14 pb-10 md:pt-16 md:pb-12 border-t border-border">
        <TerminalHeader label="// CAPABILITIES" path="manifold.what" right="3 STAGES" />
        <div className="grid gap-3 md:grid-cols-3">
          <CapabilityTile {...CAPABILITIES[0]} visual={<MiniMap />} />
          <CapabilityTile {...CAPABILITIES[1]} visual={<MiniRadar />} />
          <CapabilityTile {...CAPABILITIES[2]} visual={<MiniCascade />} />
        </div>
      </Section>

      {/* ───────── // ENGINES ───────── */}
      <Section className="py-10 md:py-14 border-t border-border">
        <TerminalHeader label="// ENGINES" path="manifold.engines" right="04 CORES" />

        {/* Pipeline strip */}
        <div className="relative bg-surface/60 border border-border rounded-lg overflow-hidden">
          <div className="absolute inset-0 grid-bg opacity-25 pointer-events-none" aria-hidden />
          <div className="relative w-full aspect-[1100/360] max-h-[360px]">
            <EngineFlow />
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <Link
            href="/product"
            className="font-[family-name:var(--font-michroma)] text-[10px] tracking-[0.3em] text-accent-cyan/70 hover:text-accent-cyan inline-flex items-center gap-2"
          >
            <span>HOW THE ENGINES INTERLOCK</span>
            <span>›</span>
          </Link>
        </div>
      </Section>

      {/* ───────── // SAMPLE READOUT ───────── */}
      <Section className="py-10 md:py-14 border-t border-border">
        <TerminalHeader label="// READOUT" path="manifold.node[0x7A3E]" right="LIVE · MANUFACTURING" />

        <div className="mb-6 max-w-2xl">
          <h3 className="font-[family-name:var(--font-michroma)] text-2xl md:text-3xl tracking-[0.04em] text-foreground leading-snug">
            Click any node. This is what you see.
          </h3>
        </div>

        <NodeReadout />
      </Section>

      {/* ───────── // FORMULA ───────── */}
      <Section className="py-10 md:py-14 border-t border-border">
        <TerminalHeader label="// FORMULA" path="manifold.omega_f" right="HOW THE SCORE WORKS" />

        <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr]">
          <FormulaTile />
          <SystemRollupTile
            symbol="ΩSF"
            label="System Fragility"
            value="7.42"
            sub="throughput-weighted"
            color="text-accent-cyan"
            border="border-accent-cyan/30"
            desc="How fragile the system is overall, weighted by what flows through each node. Catches fragility hidden in high-volume chokepoints."
          />
          <SystemRollupTile
            symbol="ΩSX"
            label="System Exposure"
            value="6.18"
            sub="exposure-weighted"
            color="text-accent-amber"
            border="border-accent-amber/30"
            desc="How fragile the system is when you weight by what's actually at risk — sanctions, capital, geographic concentration."
          />
        </div>

        <div className="mt-4 flex justify-end">
          <Link
            href="/framework"
            className="font-[family-name:var(--font-michroma)] text-[10px] tracking-[0.3em] text-accent-amber/70 hover:text-accent-amber inline-flex items-center gap-2"
          >
            <span>READ THE FULL FRAMEWORK</span>
            <span>›</span>
          </Link>
        </div>
      </Section>


      {/* ───────── ACCESS ───────── */}
      <Section className="py-14 md:py-20 border-t border-border">
        <div className="relative overflow-hidden bg-surface border border-accent-cyan/20 rounded-lg p-6 md:p-10">
          <div className="absolute inset-0 grid-bg opacity-30" aria-hidden />
          <div className="relative grid gap-6 md:grid-cols-[1fr_auto] md:items-center">
            <div className="space-y-2">
              <div className="font-mono text-[10px] tracking-[0.2em] text-accent-cyan/80">// ACCESS</div>
              <h3 className="font-[family-name:var(--font-michroma)] text-2xl md:text-3xl tracking-[0.06em] text-foreground leading-[1.25]">
                Request access to <span className="text-accent-cyan">Manifold</span>.
              </h3>
              <p className="text-xs font-mono text-text-muted leading-relaxed max-w-xl">
                Trial accounts run for 48 hours with a curated dataset.
                Authorized accounts are issued by invite.
              </p>
            </div>
            <div className="flex flex-col gap-3 shrink-0">
              <CTAButton href={SITE.trialUrl} external>START 48-HR TRIAL</CTAButton>
              <CTAButton href="/contact" variant="secondary">REQUEST INVITE</CTAButton>
            </div>
          </div>
        </div>
      </Section>
    </>
  );
}

/* ───────── Tiles ───────── */

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-l border-border pl-3">
      <div className="font-[family-name:var(--font-michroma)] text-2xl text-accent-cyan/90 leading-none">
        {value}
      </div>
      <div className="mt-1 font-[family-name:var(--font-michroma)] text-[10px] tracking-[0.3em] text-text-muted">
        {label}
      </div>
    </div>
  );
}

function CapabilityTile({
  step,
  title,
  body,
  color,
  visual,
}: {
  step: string;
  title: string;
  body: string;
  color: "cyan" | "amber" | "red";
  visual?: React.ReactNode;
}) {
  const map = {
    cyan:  { text: "text-accent-cyan",  border: "border-accent-cyan/30",  dot: "bg-accent-cyan"  },
    amber: { text: "text-accent-amber", border: "border-accent-amber/30", dot: "bg-accent-amber" },
    red:   { text: "text-accent-red",   border: "border-accent-red/30",   dot: "bg-accent-red"   },
  } as const;
  const c = map[color];
  return (
    <div className={`relative bg-surface border ${c.border} rounded-lg p-4 hover:bg-surface-elevated transition-colors flex flex-col`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`h-1 w-1 rounded-full ${c.dot}`} />
          <span className={`font-[family-name:var(--font-michroma)] text-[10px] tracking-[0.3em] ${c.text}`}>
            {step}
          </span>
        </div>
        <span className="font-mono text-[10px] text-text-muted/60 tracking-wider">STAGE</span>
      </div>

      {visual && (
        <div className="relative bg-surface-elevated/60 border border-border/70 rounded mb-3 p-2 overflow-hidden">
          <div className="absolute inset-0 grid-bg opacity-30 pointer-events-none" aria-hidden />
          <div className="relative h-16 w-full">{visual}</div>
        </div>
      )}

      <div className={`font-[family-name:var(--font-michroma)] text-base tracking-[0.18em] ${c.text} mb-1`}>
        {title}
      </div>
      <p className="text-xs font-mono text-text-muted leading-snug">
        {body}
      </p>
    </div>
  );
}

function FormulaTile() {
  return (
    <div className="relative bg-surface border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="font-[family-name:var(--font-michroma)] text-[10px] tracking-[0.25em] text-text-muted">
          ΩF · COMPOSITE FORMULA
        </span>
        <span className="font-mono text-[10px] text-text-muted/60">Σw = 1.0</span>
      </div>
      <div className="font-mono text-sm text-foreground tracking-wide mb-3">
        ΩF = w<sub>I</sub>·I + w<sub>R</sub>·R + w<sub>J</sub>·J + w<sub>C</sub>·C + w<sub>T</sub>·T
      </div>
      <p className="text-xs font-mono text-text-muted leading-snug">
        Each pillar is scored 0–10. Composite ΩF is a weighted average — the
        weights are configurable per domain. A reinsurer evaluating sovereign
        credit weights J and T heavily; a supply-chain operator leans on I and R.
      </p>
    </div>
  );
}

function SystemRollupTile({
  symbol,
  label,
  value,
  sub,
  color,
  border,
  desc,
}: {
  symbol: string;
  label: string;
  value: string;
  sub: string;
  color: string;
  border: string;
  desc?: string;
}) {
  return (
    <div className={`relative bg-surface border ${border} rounded-lg p-4 flex flex-col`}>
      <div className="flex items-baseline justify-between mb-1">
        <div className={`font-[family-name:var(--font-michroma)] text-2xl tracking-[0.05em] ${color}`}>
          {symbol}
        </div>
        <div className="font-mono text-lg text-foreground/95">{value}</div>
      </div>
      <div className="font-[family-name:var(--font-michroma)] text-[10px] tracking-[0.2em] text-foreground mb-1">
        {label.toUpperCase()}
      </div>
      <div className="font-mono text-[10px] text-text-muted mb-2">{sub}</div>
      {desc && (
        <p className="text-xs font-mono text-text-muted leading-snug">
          {desc}
        </p>
      )}
    </div>
  );
}

/* ───────── Mini visuals ───────── */

function MiniMap() {
  const nodes = [
    { x: 20,  y: 40, c: "var(--accent-cyan)" },
    { x: 70,  y: 18, c: "var(--accent-cyan)" },
    { x: 70,  y: 62, c: "var(--accent-cyan)" },
    { x: 130, y: 30, c: "var(--accent-purple)" },
    { x: 140, y: 70, c: "var(--accent-purple)" },
    { x: 200, y: 50, c: "var(--accent-amber)" },
  ];
  const edges: Array<[number, number]> = [
    [0, 1], [0, 2], [1, 3], [2, 4], [3, 5], [4, 5], [1, 4],
  ];
  return (
    <svg viewBox="0 0 220 90" className="w-full h-full" role="img" aria-label="Causal graph snapshot">
      <defs>
        <marker id="mm-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
          <path d="M0,0 L10,5 L0,10 z" fill="rgba(0,229,255,0.55)" />
        </marker>
      </defs>
      {edges.map(([a, b], i) => (
        <line
          key={i}
          x1={nodes[a].x} y1={nodes[a].y}
          x2={nodes[b].x} y2={nodes[b].y}
          stroke="rgba(0,229,255,0.35)"
          strokeWidth={1}
          markerEnd="url(#mm-arrow)"
        />
      ))}
      {nodes.map((n, i) => (
        <g key={i}>
          <circle cx={n.x} cy={n.y} r={6} fill="var(--surface-elevated)" stroke={n.c} strokeWidth={1.2} />
          <circle cx={n.x} cy={n.y} r={2} fill={n.c} />
        </g>
      ))}
    </svg>
  );
}

function MiniRadar() {
  const cx = 110, cy = 45, r = 32;
  const vertex = (i: number, scale = 1) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
    return { x: cx + Math.cos(a) * r * scale, y: cy + Math.sin(a) * r * scale };
  };
  const pillars = [
    { k: "I", v: 0.9, c: "var(--accent-cyan)" },
    { k: "R", v: 0.8, c: "var(--accent-green)" },
    { k: "J", v: 0.4, c: "var(--accent-red)" },
    { k: "C", v: 0.7, c: "var(--accent-purple)" },
    { k: "T", v: 0.6, c: "var(--accent-amber)" },
  ];
  const profile = pillars.map((p, i) => {
    const v = vertex(i, p.v);
    return `${v.x},${v.y}`;
  }).join(" ");
  const outer = pillars.map((_, i) => {
    const v = vertex(i, 1);
    return `${v.x},${v.y}`;
  }).join(" ");
  return (
    <svg viewBox="0 0 220 90" className="w-full h-full" role="img" aria-label="ΩF pillar mini radar">
      <polygon points={outer} fill="none" stroke="var(--border-bright)" strokeOpacity={0.4} strokeWidth={0.6} />
      {pillars.map((_, i) => {
        const v = vertex(i, 1);
        return (
          <line key={i} x1={cx} y1={cy} x2={v.x} y2={v.y} stroke="var(--border-bright)" strokeOpacity={0.25} strokeWidth={0.5} />
        );
      })}
      <polygon points={profile} fill="rgba(255,176,32,0.25)" stroke="var(--accent-amber)" strokeWidth={1.2} strokeOpacity={0.9} />
      {pillars.map((p, i) => {
        const v = vertex(i, p.v);
        return <circle key={p.k} cx={v.x} cy={v.y} r={2.5} fill={p.c} />;
      })}
      {pillars.map((p, i) => {
        const v = vertex(i, 1.22);
        return (
          <text
            key={`l-${p.k}`}
            x={v.x} y={v.y + 2}
            textAnchor="middle"
            fontFamily="var(--font-michroma)"
            fontSize="6"
            fill={p.c}
          >
            {p.k}
          </text>
        );
      })}
    </svg>
  );
}

function MiniCascade() {
  return (
    <svg viewBox="0 0 220 90" className="w-full h-full" role="img" aria-label="Cascade simulation snapshot">
      <defs>
        <marker id="mc-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
          <path d="M0,0 L10,5 L0,10 z" fill="rgba(255,90,90,0.55)" />
        </marker>
      </defs>
      <circle cx={28} cy={45} r={9} fill="var(--surface-elevated)" stroke="var(--accent-red)" strokeWidth={1.4} />
      <circle cx={28} cy={45} r={3.5} fill="var(--accent-red)">
        <animate attributeName="opacity" values="1;0.3;1" dur="1.6s" repeatCount="indefinite" />
      </circle>
      <circle cx={28} cy={45} r={12} fill="none" stroke="var(--accent-red)" strokeOpacity={0.6}>
        <animate attributeName="r" values="9;22;9" dur="2.2s" repeatCount="indefinite" />
        <animate attributeName="stroke-opacity" values="0.6;0;0.6" dur="2.2s" repeatCount="indefinite" />
      </circle>

      {[
        { x: 95, y: 22, c: "var(--accent-amber)" },
        { x: 95, y: 45, c: "var(--accent-amber)" },
        { x: 95, y: 68, c: "var(--accent-amber)" },
      ].map((n, i) => (
        <g key={i}>
          <line x1={37} y1={45} x2={n.x - 6} y2={n.y} stroke="rgba(255,90,90,0.5)" strokeWidth={1} markerEnd="url(#mc-arrow)" />
          <circle cx={n.x} cy={n.y} r={6} fill="var(--surface-elevated)" stroke={n.c} strokeWidth={1.1} />
          <circle cx={n.x} cy={n.y} r={2} fill={n.c} opacity={0.85} />
        </g>
      ))}

      {[
        { from: { x: 95, y: 22 }, to: { x: 165, y: 14 }, c: "var(--accent-red)" },
        { from: { x: 95, y: 22 }, to: { x: 165, y: 36 }, c: "var(--accent-red)" },
        { from: { x: 95, y: 45 }, to: { x: 165, y: 50 }, c: "var(--accent-red)" },
        { from: { x: 95, y: 68 }, to: { x: 165, y: 64 }, c: "var(--accent-red)" },
        { from: { x: 95, y: 68 }, to: { x: 165, y: 80 }, c: "var(--accent-red)" },
      ].map((e, i) => (
        <g key={i}>
          <line
            x1={e.from.x + 5} y1={e.from.y}
            x2={e.to.x - 5} y2={e.to.y}
            stroke="rgba(255,90,90,0.35)" strokeWidth={0.7}
          />
          <circle cx={e.to.x} cy={e.to.y} r={3} fill="var(--surface-elevated)" stroke={e.c} strokeWidth={0.9} strokeOpacity={0.7} />
          <circle cx={e.to.x} cy={e.to.y} r={1.2} fill={e.c} opacity={0.6} />
        </g>
      ))}

      {[2, 5, 10, 18, 14, 8, 4, 2].map((h, i) => (
        <rect
          key={i}
          x={195 + i * 2.4}
          y={80 - h}
          width={1.6}
          height={h}
          fill={i > 4 ? "var(--accent-red)" : "var(--accent-amber)"}
          opacity={0.7}
        />
      ))}
    </svg>
  );
}

/* ───────── Sample node readout ───────── */

function NodeReadout() {
  const composite = 7.42;
  const downstream = [
    { name: "AAPL · IPHONE BOM",     impact: 0.82, color: "var(--accent-red)",   pillText: "text-accent-red",   border: "border-accent-red/30" },
    { name: "NVDA · DC ACCEL",       impact: 0.74, color: "var(--accent-red)",   pillText: "text-accent-red",   border: "border-accent-red/30" },
    { name: "AMD · EPYC SUPPLY",     impact: 0.61, color: "var(--accent-amber)", pillText: "text-accent-amber", border: "border-accent-amber/30" },
    { name: "QCOM · MODEM",          impact: 0.48, color: "var(--accent-amber)", pillText: "text-accent-amber", border: "border-accent-amber/30" },
    { name: "TSLA · FSD INFER",      impact: 0.31, color: "var(--accent-green)", pillText: "text-accent-green", border: "border-accent-green/30" },
  ];

  return (
    <div className="relative bg-surface-elevated/50 border border-border rounded-lg overflow-hidden backdrop-blur">
      <div className="absolute inset-0 grid-bg opacity-25 pointer-events-none" aria-hidden />

      {/* Header */}
      <div className="relative flex items-center justify-between border-b border-border px-5 py-3 bg-surface/60">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-accent-red/70" />
            <span className="h-1.5 w-1.5 rounded-full bg-accent-amber/70" />
            <span className="h-1.5 w-1.5 rounded-full bg-accent-green/70" />
          </div>
          <span className="font-[family-name:var(--font-michroma)] text-[10px] tracking-[0.3em] text-text-muted">
            NODE_READOUT
          </span>
        </div>
        <div className="flex items-center gap-3 text-[10px] font-mono text-text-muted/80 tracking-wider">
          <span>EPOCH 2026.05.01</span>
          <span className="hidden md:inline">·</span>
          <span className="hidden md:inline">DOMAIN MANUFACTURING</span>
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-accent-green opacity-60 pulse-ring" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent-green" />
          </span>
        </div>
      </div>

      <div className="relative p-5 md:p-6 space-y-5">
        {/* Identity row + composite + sub-stats */}
        <div className="grid gap-3 md:grid-cols-[1.2fr_1fr_1fr_1fr]">
          {/* Identity */}
          <div className="bg-surface border border-border rounded p-4">
            <div className="font-[family-name:var(--font-michroma)] text-[10px] tracking-[0.3em] text-accent-cyan/80 mb-1">
              NODE · 0x7A3E
            </div>
            <div className="font-[family-name:var(--font-michroma)] text-base md:text-lg tracking-[0.06em] text-foreground">
              FAB · TSMC ARIZONA-1
            </div>
            <div className="mt-1 font-mono text-[10px] text-text-muted leading-snug">
              5nm · semiconductor · single-source
            </div>
          </div>

          {/* Composite ΩF */}
          <div className="bg-surface border border-accent-cyan/30 rounded p-4 flex flex-col justify-between">
            <div className="font-[family-name:var(--font-michroma)] text-[10px] tracking-[0.25em] text-text-muted">
              ΩF COMPOSITE
            </div>
            <div className="flex items-baseline gap-1">
              <span className="font-[family-name:var(--font-michroma)] text-4xl text-accent-cyan text-glow-cyan leading-none">
                {composite.toFixed(2)}
              </span>
              <span className="font-mono text-xs text-text-muted">/ 10</span>
            </div>
          </div>

          {/* RANK */}
          <SubStatTile color="text-accent-red"   border="border-accent-red/30"   label="RANK"    value="#3 / 412"  sub="among 412 manufacturing nodes" />

          {/* CASCADE */}
          <SubStatTile color="text-accent-amber" border="border-accent-amber/30" label="CASCADE" value="37 NODES" sub="downstream that fail with it" />
        </div>

        {/* Pillar tiles row */}
        <div>
          <div className="flex items-baseline justify-between mb-3">
            <span className="font-[family-name:var(--font-michroma)] text-[10px] tracking-[0.25em] text-accent-cyan/80">
              // PILLAR BREAKDOWN
            </span>
            <span className="font-mono text-[10px] text-text-muted/70">0 — 10</span>
          </div>
          <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 md:grid-cols-5">
            {PILLARS.map((p) => (
              <div
                key={p.letter}
                className={`bg-surface border ${p.border} rounded p-3`}
              >
                <div className="flex items-baseline justify-between mb-2">
                  <span className={`font-[family-name:var(--font-michroma)] text-2xl ${p.color} leading-none`}>{p.letter}</span>
                  <span className="font-mono text-xs text-foreground/95">{p.value.toFixed(1)}</span>
                </div>
                <div className="h-1 w-full bg-surface-elevated border border-border rounded-full overflow-hidden">
                  <div className="h-full" style={{ width: `${p.value * 10}%`, background: p.raw, opacity: 0.85 }} />
                </div>
                <div className="mt-2 font-mono text-[10px] tracking-wider text-text-muted/80 leading-snug">
                  {p.name}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Trajectory + Downstream tiles */}
        <div className="grid gap-3 lg:grid-cols-[1fr_1.2fr]">
          {/* Trajectory */}
          <div className="bg-surface border border-border rounded p-3">
            <div className="flex items-baseline justify-between mb-3">
              <span className="font-[family-name:var(--font-michroma)] text-[10px] tracking-[0.25em] text-accent-cyan/80">
                // ΩF TRAJECTORY
              </span>
              <span className="font-mono text-[10px] text-accent-cyan/80">+0.36 vs t-12</span>
            </div>
            <Sparkline />
          </div>

          {/* Downstream tiles */}
          <div className="bg-surface border border-border rounded p-3">
            <div className="flex items-baseline justify-between mb-3">
              <span className="font-[family-name:var(--font-michroma)] text-[10px] tracking-[0.25em] text-accent-cyan/80">
                // DOWNSTREAM IMPACT
              </span>
              <span className="font-mono text-[10px] text-text-muted/70">TOP 5</span>
            </div>
            <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 md:grid-cols-5">
              {downstream.map((d) => (
                <div
                  key={d.name}
                  className={`bg-surface-elevated border ${d.border} rounded p-2.5`}
                >
                  <div className={`font-[family-name:var(--font-michroma)] text-[10px] tracking-[0.15em] ${d.pillText} mb-1.5 leading-snug min-h-[20px]`}>
                    {d.name}
                  </div>
                  <div className="font-mono text-sm text-foreground/95 mb-1">
                    {d.impact.toFixed(2)}
                  </div>
                  <div className="h-1 w-full bg-surface border border-border rounded-full overflow-hidden">
                    <div className="h-full" style={{ width: `${d.impact * 100}%`, background: d.color, opacity: 0.85 }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="relative flex items-center justify-between border-t border-border px-5 py-2.5 bg-surface/60 text-[10px] font-mono text-text-muted/80 tracking-wider">
        <span>SCORE · ENRICHMENT · ANALYZED BY · SPIRTES · TARSKI · PEARL · PARETO</span>
        <span>VERIFIED · 2026.05.01 14:08:11Z</span>
      </div>
    </div>
  );
}

function SubStatTile({
  color,
  border,
  label,
  value,
  sub,
}: {
  color: string;
  border: string;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className={`bg-surface border ${border} rounded p-4 flex flex-col justify-between`}>
      <div className={`font-[family-name:var(--font-michroma)] text-[10px] tracking-[0.25em] ${color}`}>{label}</div>
      <div className="font-mono text-base text-foreground/95 mt-1">{value}</div>
      {sub && <div className="font-mono text-[10px] text-text-muted mt-0.5">{sub}</div>}
    </div>
  );
}

function Sparkline() {
  const points = [
    6.41, 6.50, 6.55, 6.48, 6.62, 6.71, 6.66, 6.78,
    6.85, 6.91, 6.84, 6.97, 7.02, 6.95, 7.06, 7.18,
    7.12, 7.24, 7.10, 7.31, 7.28, 7.36, 7.33, 7.42,
  ];
  const W = 600, H = 100, PAD = 6;
  const min = 6.3, max = 7.5;
  const xs = points.map((_, i) => PAD + (W - PAD * 2) * i / (points.length - 1));
  const ys = points.map((v) => H - PAD - (H - PAD * 2) * (v - min) / (max - min));
  const path = xs.map((x, i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(" ");
  const fill = `${path} L${xs[xs.length - 1].toFixed(1)},${H} L${xs[0].toFixed(1)},${H} Z`;

  return (
    <div className="relative bg-surface-elevated border border-border rounded p-2 overflow-hidden">
      <div className="absolute inset-0 grid-bg opacity-30 pointer-events-none" aria-hidden />
      <svg viewBox={`0 0 ${W} ${H}`} className="relative w-full h-20" role="img" aria-label="ΩF trajectory">
        <defs>
          <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(0,229,255,0.30)" />
            <stop offset="100%" stopColor="rgba(0,229,255,0.00)" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((t) => (
          <line key={t} x1={0} x2={W} y1={H * t} y2={H * t} stroke="var(--border)" strokeWidth={0.5} strokeOpacity={0.4} strokeDasharray="2 6" />
        ))}
        <path d={fill} fill="url(#spark-fill)" />
        <path d={path} fill="none" stroke="var(--accent-cyan)" strokeWidth={1.6} strokeOpacity={0.95} />
        <circle cx={xs[xs.length - 1]} cy={ys[ys.length - 1]} r={6} fill="none" stroke="var(--accent-cyan)" strokeOpacity={0.6}>
          <animate attributeName="r" values="3;9;3" dur="2.4s" repeatCount="indefinite" />
          <animate attributeName="stroke-opacity" values="0.7;0;0.7" dur="2.4s" repeatCount="indefinite" />
        </circle>
        <circle cx={xs[xs.length - 1]} cy={ys[ys.length - 1]} r={3} fill="var(--accent-cyan)" />
      </svg>
    </div>
  );
}
