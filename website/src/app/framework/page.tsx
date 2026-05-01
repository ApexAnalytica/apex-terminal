import Link from "next/link";
import { Section, SectionLabel, SectionHeading, SectionLede } from "@/components/ui/Section";
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
    backed: "PEARL — substitution counterfactual",
  },
  {
    letter: "R",
    name: "Restoration Latency",
    color: "green",
    short: "Time to restore equivalent capacity after catastrophic failure.",
    long: "Models the recovery clock: lead times, capital requirements, regulatory approvals, and skill availability. A node with R=10 has effectively no near-term recovery path — failure is permanent on operational horizons.",
    backed: "PEARL — counterfactual recovery time",
  },
  {
    letter: "J",
    name: "Jurisdictional Hazard",
    color: "red",
    short: "Sanctions, conflict, export controls, and regulatory exposure.",
    long: "Encodes geopolitical and regulatory exposure: sanctions risk, conflict zones, export controls, dual-use restrictions. A node with J=10 sits at the intersection of multiple hostile regimes or under a single decisive lever.",
    backed: "TARSKI — formal verification of geopolitical claims",
  },
  {
    letter: "C",
    name: "Cascade Load",
    color: "purple",
    short: "Downstream impact depth: GDP, sectors, nonlinear propagation.",
    long: "Quantifies the systemic blast radius: how many downstream nodes lose function, how deep the cascade runs, what nonlinear amplifiers (panic, hoarding, deleveraging) kick in. A node with C=10 is load-bearing for the system itself.",
    backed: "SPIRTES + PARETO — topology + cascade simulation",
  },
  {
    letter: "T",
    name: "Tail Depth",
    color: "amber",
    short: "Distributional depth beyond VaR — fat-tail severity.",
    long: "Goes past Value-at-Risk to characterize the depth of the tail: how bad is the bad case, conditional on being bad. Heavy-tailed processes routinely produce realizations multiple sigmas beyond historical VaR.",
    backed: "PARETO — tail statistics from cascade simulation",
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
        <div className="relative mx-auto max-w-7xl px-4 md:px-6 pt-20 pb-16 md:pt-24 md:pb-20">
          <div className="grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:items-center">
            {/* Copy */}
            <div className="space-y-6">
              <SectionLabel color="amber">FRAMEWORK · Ω-FRAGILITY</SectionLabel>
              <h1 className="font-[family-name:var(--font-michroma)] text-3xl md:text-5xl tracking-[0.04em] leading-[1.15] text-foreground">
                A canonical scoring framework
                <br />
                for{" "}
                <span className="text-accent-amber text-glow-amber">systemic fragility.</span>
              </h1>
              <p className="text-sm md:text-base font-mono text-text-muted leading-relaxed max-w-2xl">
                Ω-Fragility (ΩF) is a 0–10 score for any node in a critical
                system, defined across five canonical pillars. Composite ΩF is
                a weighted average of the five — weights are configurable per
                use case but must sum to 1.0.
              </p>

              {/* Formula bar */}
              <div className="inline-flex flex-wrap items-center gap-3 bg-surface-elevated border border-border rounded px-4 py-3">
                <span className="font-[family-name:var(--font-michroma)] text-[10px] tracking-[0.25em] text-text-muted">FORMULA</span>
                <span className="font-mono text-[13px] text-foreground">
                  ΩF = w<sub>I</sub>·I + w<sub>R</sub>·R + w<sub>J</sub>·J + w<sub>C</sub>·C + w<sub>T</sub>·T
                </span>
                <span className="font-mono text-[11px] text-text-muted/70">where Σw = 1.0</span>
              </div>
            </div>

            {/* Radar visual */}
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

      {/* Weight composition visualization */}
      <Section className="py-16 md:py-20 border-t border-border">
        <div className="space-y-3 mb-8">
          <SectionLabel color="cyan">COMPOSING ΩF</SectionLabel>
          <SectionHeading>Weights tune the framework to your domain.</SectionHeading>
          <SectionLede>
            A reinsurer evaluating sovereign credit cares about J and T.
            A supply-chain operator cares about I and R. The same five
            pillars, reweighted to your risk model.
          </SectionLede>
        </div>

        <div className="bg-surface-elevated border border-border rounded-lg p-6 md:p-10">
          <WeightStack />
        </div>
      </Section>

      {/* The five pillars in detail */}
      <Section className="py-20 md:py-24 border-t border-border">
        <div className="space-y-3 mb-12">
          <SectionLabel color="cyan">THE FIVE PILLARS</SectionLabel>
          <SectionHeading>Each pillar measures one axis of fragility.</SectionHeading>
        </div>

        <div className="space-y-4">
          {PILLARS.map((p) => {
            const c = colorMap[p.color];
            return (
              <div
                key={p.letter}
                className={`relative ${c.soft} border ${c.border} rounded-lg p-6 md:p-8 hover:bg-surface-elevated transition-colors`}
              >
                <div className="grid gap-6 md:grid-cols-[180px_1fr]">
                  <div className="flex md:flex-col gap-4 md:gap-2 items-baseline md:items-start">
                    <div className={`font-[family-name:var(--font-michroma)] text-5xl md:text-6xl ${c.text} leading-none`}>
                      {p.letter}
                    </div>
                    <div className="space-y-1">
                      <div className={`font-[family-name:var(--font-michroma)] text-[9px] tracking-[0.3em] ${c.text}`}>
                        PILLAR · {p.letter}
                      </div>
                      <div className="font-[family-name:var(--font-michroma)] text-[12px] tracking-[0.15em] text-foreground">
                        {p.name.toUpperCase()}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <p className="text-[13px] md:text-sm font-mono text-foreground/90 leading-relaxed">
                      {p.short}
                    </p>
                    <p className="text-[12px] font-mono text-text-muted leading-relaxed">
                      {p.long}
                    </p>
                    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded border ${c.border} bg-surface`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${c.bg}`} />
                      <span className={`font-[family-name:var(--font-michroma)] text-[9px] tracking-[0.25em] ${c.text}`}>
                        BACKED BY · {p.backed}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      {/* System-level metrics */}
      <Section className="py-20 md:py-24 border-t border-border">
        <div className="space-y-3 mb-12">
          <SectionLabel color="purple">SYSTEM-LEVEL METRICS</SectionLabel>
          <SectionHeading>Aggregating fragility across the graph.</SectionHeading>
          <SectionLede>
            Node-level ΩF rolls up to system-level metrics under two
            weightings — throughput and exposure. Together they capture
            different views of how fragile the system as a whole is.
          </SectionLede>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <MetricCard
            symbol="ΩSF"
            name="System Fragility"
            color="cyan"
            formula="ΩSF = Σᵢ αᵢ · ΩFᵢ"
            blurb="Throughput-weighted system fragility. Each node contributes proportional to its share of system flow."
          />
          <MetricCard
            symbol="ΩSX"
            name="System Exposure"
            color="amber"
            formula="ΩSX = Σᵢ eᵢ · ΩFᵢ"
            blurb="Exposure-weighted system fragility. Each node contributes proportional to its measured exposure (sanctions, geographic concentration, capital risk)."
          />
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <MetricCard
            symbol="Ω-Contagion Radius"
            name="Cascade Reach"
            color="red"
            formula="|{ j : Lⱼ(failure_i) > τ }|"
            blurb="Number of downstream nodes whose loss exceeds threshold τ when node i fails. Measures how far a single failure propagates."
          />
          <MetricCard
            symbol="Ω-Buffer Horizon"
            name="Time to Systemic Failure"
            color="green"
            formula="τ_buffer (i)"
            blurb="Time between a node's failure and the onset of systemic failure. Quantifies the operational window for response."
          />
        </div>
      </Section>

      {/* CTA */}
      <Section className="py-20 md:py-28 border-t border-border">
        <div className="relative overflow-hidden bg-surface border border-accent-amber/20 rounded-lg p-8 md:p-14">
          <div className="absolute inset-0 grid-bg opacity-30" aria-hidden />
          <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-8">
            <div className="space-y-3 max-w-xl">
              <SectionLabel color="amber">SEE IT IN PRACTICE</SectionLabel>
              <h3 className="font-[family-name:var(--font-michroma)] text-2xl md:text-3xl tracking-[0.06em] text-foreground leading-[1.25]">
                Watch ΩF scoring on a live graph.
              </h3>
              <p className="text-[13px] font-mono text-text-muted leading-relaxed">
                Trial accounts include the full pillar breakdown, configurable
                weights, and system-level aggregation.
              </p>
            </div>
            <div className="flex flex-col gap-3 shrink-0">
              <CTAButton href={SITE.trialUrl} external>OPEN TERMINAL</CTAButton>
              <Link
                href="/product"
                className="text-center font-[family-name:var(--font-michroma)] text-[11px] tracking-[0.25em] text-text-muted hover:text-foreground"
              >
                ← BACK TO PRODUCT
              </Link>
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
    <div className={`bg-surface-elevated border ${c.border} rounded-lg p-6 md:p-8`}>
      <div className={`font-[family-name:var(--font-michroma)] text-3xl tracking-[0.05em] ${c.text} mb-1`}>
        {symbol}
      </div>
      <div className="font-[family-name:var(--font-michroma)] text-[10px] tracking-[0.25em] text-foreground mb-4">
        {name.toUpperCase()}
      </div>
      <div className="bg-surface border border-border rounded px-3 py-2 mb-4 font-mono text-[12px] text-foreground/90">
        {formula}
      </div>
      <p className="text-[12px] font-mono text-text-muted leading-relaxed">
        {blurb}
      </p>
    </div>
  );
}
