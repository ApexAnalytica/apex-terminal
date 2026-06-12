import type { Metadata } from "next";
import { Section, TerminalHeader } from "@/components/ui/Section";
import CTAButton from "@/components/ui/CTAButton";
import OmegaRadar from "@/components/visuals/OmegaRadar";
import { SITE } from "@/lib/site";
import {
  ENGINE_META,
  PILLAR_META,
  PILLAR_LETTERS,
  SYSTEM_METRICS,
  type PillarLetter,
} from "@/lib/claims";

export const metadata: Metadata = {
  title: "Ω-Fragility Framework · Apex Analytica",
  description:
    "ΩF is a 0–10 fragility score for any node in a critical system — five pillars, one canonical weighting, comparable across every domain Manifold runs.",
};

const PILLAR_COPY: Record<PillarLetter, { short: string; long: string }> = {
  I: {
    short: "How impossible to substitute, technically or commercially.",
    long: "Captures the true cost of substitution: technical compatibility, certification windows, contractual lock-in, and supplier concentration. A node with I=10 cannot be replaced on any meaningful timeline.",
  },
  R: {
    short: "Time to restore equivalent capacity after catastrophic failure.",
    long: "Models the recovery clock: lead times, capital requirements, regulatory approvals, and skill availability. A node with R=10 has effectively no near-term recovery path — failure is permanent on operational horizons.",
  },
  J: {
    short: "Sanctions, conflict, export controls, and regulatory exposure.",
    long: "Encodes geopolitical and regulatory exposure: sanctions risk, conflict zones, export controls, dual-use restrictions. A node with J=10 sits at the intersection of multiple hostile regimes or under a single decisive lever.",
  },
  C: {
    short: "Downstream impact depth: GDP, sectors, nonlinear propagation.",
    long: "Quantifies the systemic blast radius: how many downstream nodes lose function, how deep the cascade runs, what nonlinear amplifiers (panic, hoarding, deleveraging) kick in. A node with C=10 is load-bearing for the system itself.",
  },
  T: {
    short: "Distributional depth beyond VaR — fat-tail severity.",
    long: "Goes past Value-at-Risk to characterize the depth of the tail: how bad is the bad case, conditional on being bad. Heavy-tailed processes routinely produce realizations multiple sigmas beyond historical VaR.",
  },
};

const PILLARS = PILLAR_LETTERS.map((letter) => ({
  letter,
  name: PILLAR_META[letter].name,
  color: PILLAR_META[letter].color,
  weight: PILLAR_META[letter].weight,
  short: PILLAR_COPY[letter].short,
  long: PILLAR_COPY[letter].long,
  backed: ENGINE_META.filter((e) => e.feeds.includes(letter))
    .map((e) => e.name)
    .join(" + "),
}));

const colorMap: Record<string, { text: string; border: string; bg: string; soft: string }> = {
  cyan:   { text: "text-accent-cyan",   border: "border-accent-cyan/30",   bg: "bg-accent-cyan",   soft: "bg-accent-cyan/5" },
  green:  { text: "text-accent-green",  border: "border-accent-green/30",  bg: "bg-accent-green",  soft: "bg-accent-green/5" },
  red:    { text: "text-accent-red",    border: "border-accent-red/30",    bg: "bg-accent-red",    soft: "bg-accent-red/5" },
  purple: { text: "text-accent-purple", border: "border-accent-purple/30", bg: "bg-accent-purple", soft: "bg-accent-purple/5" },
  amber:  { text: "text-accent-amber",  border: "border-accent-amber/30",  bg: "bg-accent-amber",  soft: "bg-accent-amber/5" },
};

export default function FrameworkPage() {
  return (
    <>
      {/* Header with radar viz */}
      <section className="relative border-b border-border overflow-hidden">
        <div className="absolute inset-0 grid-bg opacity-40 mask-fade-edges" aria-hidden />
        <div className="relative mx-auto max-w-7xl px-4 md:px-6 pt-16 pb-12 md:pt-20 md:pb-14">
          <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr] lg:items-center">
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <span className="font-[family-name:var(--font-michroma)] text-[10px] tracking-[0.3em] text-accent-amber/90">
                  // FRAMEWORK
                </span>
              </div>
              <h1 className="font-[family-name:var(--font-michroma)] text-3xl md:text-5xl tracking-[0.04em] leading-[1.15] text-foreground">
                A canonical scoring framework for{" "}
                <span className="text-accent-amber text-glow-amber">systemic fragility.</span>
              </h1>
              <p className="text-sm md:text-base font-mono text-text-muted leading-relaxed max-w-2xl">
                Ω-Fragility (ΩF) is a 0–10 score for any node in a critical
                system, built from five canonical pillars under one fixed
                weighting.
              </p>

              <div className="inline-flex flex-wrap items-center gap-3 bg-surface-elevated border border-border rounded px-4 py-3">
                <span className="font-[family-name:var(--font-michroma)] text-[10px] tracking-[0.25em] text-text-muted">FORMULA</span>
                <span className="font-mono text-[13px] text-foreground">
                  ΩF = w<sub>I</sub>·I + w<sub>R</sub>·R + w<sub>J</sub>·J + w<sub>C</sub>·C + w<sub>T</sub>·T
                </span>
                <span className="font-mono text-[11px] text-text-muted/70">where Σw = 1.0</span>
              </div>
            </div>

            <div className="relative">
              <div className="relative bg-surface-elevated/60 border border-border rounded-lg p-4 backdrop-blur">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-accent-cyan" />
                    <span className="font-[family-name:var(--font-michroma)] text-[8px] tracking-[0.3em] text-text-muted">
                      ΩF PROFILE · SAMPLE NODE
                    </span>
                  </div>
                </div>
                <div className="aspect-square w-full max-w-md mx-auto">
                  <OmegaRadar />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* From data to pillars — the inputs */}
      <Section className="py-10 md:py-14 border-t border-border">
        <TerminalHeader
          label="// FROM DATA TO PILLARS"
          right="4 ENGINES → 5 PILLARS"
          color="amber"
        />
        <p className="mb-4 text-[12.5px] font-mono text-text-muted leading-relaxed max-w-3xl">
          The pillars aren&rsquo;t hand-entered. Manifold&rsquo;s four reasoning
          engines turn raw graph data into the five scores the composite
          consumes — each engine feeds specific pillars.
        </p>
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {ENGINE_META.map((e) => (
            <div
              key={e.name}
              className="bg-surface-elevated border border-border rounded-lg p-4 flex flex-col gap-4"
            >
              <div>
                <div className="font-[family-name:var(--font-michroma)] text-base tracking-[0.08em] text-foreground">
                  {e.name}
                </div>
                <div className="font-mono text-[10px] tracking-[0.12em] text-text-muted mt-1">
                  {e.role}
                </div>
              </div>
              <div className="mt-auto flex items-center gap-2">
                <span className="font-mono text-[10px] text-text-muted/70">feeds</span>
                <div className="flex items-center gap-1.5">
                  {e.feeds.map((letter) => {
                    const c = colorMap[PILLAR_META[letter].color];
                    return (
                      <span
                        key={letter}
                        className={`inline-flex h-5 w-5 items-center justify-center rounded border ${c.border} ${c.soft} font-[family-name:var(--font-michroma)] text-[11px] ${c.text}`}
                      >
                        {letter}
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] font-mono text-text-muted/80 leading-relaxed">
          Full engine breakdown on the{" "}
          <a
            href="/product"
            className="text-accent-amber/90 hover:text-accent-amber underline underline-offset-2"
          >
            product page →
          </a>
        </p>
      </Section>

      {/* Five pillars — mosaic */}
      <Section className="py-10 md:py-14 border-t border-border">
        <TerminalHeader
          label="// THE FIVE PILLARS"
          right="I · R · J · C · T"
          color="cyan"
        />
        <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {PILLARS.map((p) => {
            const c = colorMap[p.color];
            return (
              <div
                key={p.letter}
                className={`relative ${c.soft} border ${c.border} rounded-lg p-5 transition-colors hover:bg-surface-elevated flex flex-col gap-3`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex flex-col gap-1.5">
                    <span className={`font-[family-name:var(--font-michroma)] text-5xl ${c.text} leading-none`}>
                      {p.letter}
                    </span>
                    <span className="font-mono text-[10px] tracking-[0.15em] text-text-muted">
                      w = {p.weight.toFixed(2)}
                    </span>
                  </div>
                  <div className="text-right">
                    <div className={`font-[family-name:var(--font-michroma)] text-[8px] tracking-[0.3em] ${c.text}`}>
                      PILLAR · {p.letter}
                    </div>
                    <div className="font-[family-name:var(--font-michroma)] text-[11px] tracking-[0.12em] text-foreground mt-1">
                      {p.name.toUpperCase()}
                    </div>
                  </div>
                </div>

                <p className="text-[12.5px] font-mono text-foreground/90 leading-relaxed">
                  {p.short}
                </p>
                <p className="text-[11.5px] font-mono text-text-muted leading-relaxed">
                  {p.long}
                </p>

                <div className={`mt-auto inline-flex items-center gap-2 self-start px-2.5 py-1 rounded border ${c.border} bg-surface`}>
                  <span className={`h-1 w-1 rounded-full ${c.bg}`} />
                  <span className={`font-[family-name:var(--font-michroma)] text-[8.5px] tracking-[0.25em] ${c.text}`}>
                    BACKED · {p.backed}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      {/* One canonical weighting */}
      <Section className="py-10 md:py-14 border-t border-border">
        <TerminalHeader
          label="// ONE CANONICAL WEIGHTING"
          right="Σw = 1.0"
          color="cyan"
        />
        <div className="bg-surface-elevated border border-border rounded-lg p-5 md:p-6 space-y-3">
          <p className="text-[12.5px] font-mono text-foreground/90 leading-relaxed max-w-3xl">
            The five pillar weights are fixed and identical across every
            domain. Manifold applies the same composite everywhere, so a ΩF of
            7.0 on a semiconductor supply chain is directly comparable to a 7.0
            on pancreatic biology.
          </p>
          <p className="text-[11.5px] font-mono text-text-muted leading-relaxed max-w-3xl">
            What changes per domain is the vocabulary, not the math: on a
            biomedical graph &ldquo;Irreplaceability&rdquo; reads as mechanism
            rarity and &ldquo;Jurisdictional Hazard&rdquo; as regulatory
            exposure. The numbers stay on one scale.
          </p>
        </div>
      </Section>

      {/* What the score drives — system-level readouts */}
      <Section className="py-10 md:py-14 border-t border-border">
        <TerminalHeader
          label="// WHAT THE SCORE DRIVES"
          right="ΩSF · CONTAGION · BUFFER"
          color="purple"
        />
        <p className="mb-4 text-[12.5px] font-mono text-text-muted leading-relaxed max-w-3xl">
          Per-node ΩF is the input, not the output. Manifold aggregates the
          node scores into system-level readouts — the live signals on the Ω
          monitor that tell you how close the whole system is to failure.
        </p>
        <div className="grid gap-3 md:grid-cols-3">
          {SYSTEM_METRICS.map((m) => (
            <MetricCard
              key={m.symbol}
              symbol={m.symbol}
              name={m.name}
              color={m.color}
              formula={m.formula}
              blurb={m.blurb}
            />
          ))}
        </div>
      </Section>

      {/* CTA */}
      <Section className="py-14 md:py-20 border-t border-border">
        <div className="relative overflow-hidden bg-surface border border-accent-amber/20 rounded-lg p-6 md:p-10">
          <div className="absolute inset-0 grid-bg opacity-30" aria-hidden />
          <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2 max-w-xl">
              <div className="font-mono text-[10px] tracking-[0.2em] text-accent-amber/80">// SEE IT IN PRACTICE</div>
              <h3 className="font-[family-name:var(--font-michroma)] text-2xl md:text-3xl tracking-[0.06em] text-foreground leading-[1.25]">
                Watch ΩF scoring on a live graph.
              </h3>
              <p className="text-[12.5px] font-mono text-text-muted leading-relaxed">
                Trial accounts include the full pillar breakdown, the canonical
                weighting, and system-level aggregation.
              </p>
            </div>
            <div className="flex flex-col gap-3 shrink-0">
              <CTAButton href={SITE.trialUrl} external>OPEN TERMINAL</CTAButton>
              <CTAButton href="/access" variant="secondary">REQUEST ACCESS</CTAButton>
            </div>
          </div>
        </div>
      </Section>
    </>
  );
}

function MetricCard({
  symbol,
  name,
  color,
  formula,
  blurb,
}: {
  symbol: string;
  name: string;
  color: "cyan" | "amber" | "red" | "green";
  formula: string;
  blurb: string;
}) {
  const map = {
    cyan:  { text: "text-accent-cyan",  border: "border-accent-cyan/30" },
    amber: { text: "text-accent-amber", border: "border-accent-amber/30" },
    red:   { text: "text-accent-red",   border: "border-accent-red/30" },
    green: { text: "text-accent-green", border: "border-accent-green/30" },
  } as const;
  const c = map[color];
  return (
    <div className={`bg-surface-elevated border ${c.border} rounded-lg p-5 flex flex-col gap-3`}>
      <div className={`font-[family-name:var(--font-michroma)] text-2xl tracking-[0.05em] ${c.text} leading-none`}>
        {symbol}
      </div>
      <div className="font-[family-name:var(--font-michroma)] text-[9.5px] tracking-[0.25em] text-foreground">
        {name.toUpperCase()}
      </div>
      <div className="bg-surface border border-border rounded px-3 py-2 font-mono text-[11.5px] text-foreground/90">
        {formula}
      </div>
      <p className="text-[11.5px] font-mono text-text-muted leading-relaxed">
        {blurb}
      </p>
    </div>
  );
}
