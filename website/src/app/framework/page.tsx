import { Section, TerminalHeader } from "@/components/ui/Section";
import CTAButton from "@/components/ui/CTAButton";
import OmegaRadar from "@/components/visuals/OmegaRadar";
import WeightStack from "@/components/visuals/WeightStack";
import { SITE } from "@/lib/site";

const PILLARS = [
  {
    letter: "I",
    name: "Irreplaceability",
    color: "cyan",
    short: "How impossible to substitute, technically or commercially.",
    long: "Captures the true cost of substitution: technical compatibility, certification windows, contractual lock-in, and supplier concentration. A node with I=10 cannot be replaced on any meaningful timeline.",
    backed: "PEARL",
  },
  {
    letter: "R",
    name: "Restoration Latency",
    color: "green",
    short: "Time to restore equivalent capacity after catastrophic failure.",
    long: "Models the recovery clock: lead times, capital requirements, regulatory approvals, and skill availability. A node with R=10 has effectively no near-term recovery path — failure is permanent on operational horizons.",
    backed: "PEARL",
  },
  {
    letter: "J",
    name: "Jurisdictional Hazard",
    color: "red",
    short: "Sanctions, conflict, export controls, and regulatory exposure.",
    long: "Encodes geopolitical and regulatory exposure: sanctions risk, conflict zones, export controls, dual-use restrictions. A node with J=10 sits at the intersection of multiple hostile regimes or under a single decisive lever.",
    backed: "TARSKI",
  },
  {
    letter: "C",
    name: "Cascade Load",
    color: "purple",
    short: "Downstream impact depth: GDP, sectors, nonlinear propagation.",
    long: "Quantifies the systemic blast radius: how many downstream nodes lose function, how deep the cascade runs, what nonlinear amplifiers (panic, hoarding, deleveraging) kick in. A node with C=10 is load-bearing for the system itself.",
    backed: "SPIRTES + PARETO",
  },
  {
    letter: "T",
    name: "Tail Depth",
    color: "amber",
    short: "Distributional depth beyond VaR — fat-tail severity.",
    long: "Goes past Value-at-Risk to characterize the depth of the tail: how bad is the bad case, conditional on being bad. Heavy-tailed processes routinely produce realizations multiple sigmas beyond historical VaR.",
    backed: "PARETO",
  },
] as const;

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
                <span className="font-mono text-[10px] text-text-muted/60">manifold.omega_f</span>
              </div>
              <h1 className="font-[family-name:var(--font-michroma)] text-3xl md:text-5xl tracking-[0.04em] leading-[1.15] text-foreground">
                A canonical scoring framework for{" "}
                <span className="text-accent-amber text-glow-amber">systemic fragility.</span>
              </h1>
              <p className="text-sm md:text-base font-mono text-text-muted leading-relaxed max-w-2xl">
                Ω-Fragility (ΩF) is a 0–10 score for any node in a critical
                system, built from five canonical pillars under configurable
                weights.
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
                  <span className="font-mono text-[9px] tracking-wider text-text-muted/70">
                    NODE_ID 0x7A3E
                  </span>
                </div>
                <div className="aspect-square w-full max-w-md mx-auto">
                  <OmegaRadar />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Five pillars — mosaic */}
      <Section className="py-10 md:py-14 border-t border-border">
        <TerminalHeader
          label="// THE FIVE PILLARS"
          path="manifold.omega_f.pillars"
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
                <div className="flex items-baseline justify-between">
                  <span className={`font-[family-name:var(--font-michroma)] text-5xl ${c.text} leading-none`}>
                    {p.letter}
                  </span>
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

      {/* Composing ΩF */}
      <Section className="py-10 md:py-14 border-t border-border">
        <TerminalHeader
          label="// COMPOSING ΩF"
          path="manifold.omega_f.weights"
          right="ONE CANONICAL WEIGHTING"
          color="cyan"
        />
        <div className="bg-surface-elevated border border-border rounded-lg p-4 md:p-6">
          <WeightStack />
        </div>
        <p className="mt-3 text-[11.5px] font-mono text-text-muted leading-relaxed max-w-2xl">
          These weights are canonical — Manifold applies the same composite
          to every domain, so a ΩF of 7.0 on a semiconductor supply chain is
          directly comparable to a 7.0 on pancreatic biology. What changes
          per domain is the vocabulary, not the math: on a biomedical graph
          &ldquo;Irreplaceability&rdquo; reads as mechanism rarity and
          &ldquo;Jurisdictional Hazard&rdquo; as regulatory exposure.
        </p>
      </Section>

      {/* System-level metrics — 2x2 mosaic */}
      <Section className="py-10 md:py-14 border-t border-border">
        <TerminalHeader
          label="// SYSTEM-LEVEL METRICS"
          path="manifold.omega_system"
          right="ΩSF · ΩSX · CONTAGION · BUFFER"
          color="purple"
        />
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            symbol="ΩSF"
            name="System Fragility"
            color="cyan"
            formula="Σᵢ αᵢ·ΩFᵢ"
            blurb="Throughput-weighted system fragility. Each node contributes proportional to its share of system flow."
          />
          <MetricCard
            symbol="ΩSX"
            name="System Exposure"
            color="amber"
            formula="Σᵢ eᵢ·ΩFᵢ"
            blurb="Exposure-weighted system fragility. Weighted by sanctions, geographic concentration, capital risk."
          />
          <MetricCard
            symbol="Ω-Contagion"
            name="Cascade Reach"
            color="red"
            formula="|{j : Lⱼ(failᵢ) > τ}|"
            blurb="Number of downstream nodes whose loss exceeds threshold τ when node i fails."
          />
          <MetricCard
            symbol="Ω-Buffer"
            name="Time to Failure"
            color="green"
            formula="τ_buffer(i)"
            blurb="Time between a node's failure and the onset of systemic failure. The operational window for response."
          />
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
                Trial accounts include the full pillar breakdown, configurable
                weights, and system-level aggregation.
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
