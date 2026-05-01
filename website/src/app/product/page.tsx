import Link from "next/link";
import { Section, SectionLabel, SectionHeading, SectionLede } from "@/components/ui/Section";
import CTAButton from "@/components/ui/CTAButton";
import EngineFlow from "@/components/visuals/EngineFlow";
import EngineGraph from "@/components/visuals/EngineGraph";
import { SITE } from "@/lib/site";

const ENGINES = [
  {
    name: "SPIRTES",
    role: "STRUCTURE DISCOVERY",
    color: "cyan",
    summary:
      "Recovers the causal topology of a critical system from observational data — which nodes act on which, and through what edges.",
    detail: [
      "Constraint-based and score-based search over conditional independencies",
      "Linear PCMCI variant for time-indexed feeds",
      "Side-by-side panel comparison across discovery algorithms",
    ],
    pillar: "Underwrites the C pillar (Cascade Load) by giving simulation a real graph.",
  },
  {
    name: "TARSKI",
    role: "FORMAL VERIFICATION",
    color: "amber",
    summary:
      "Verifies geopolitical and structural claims about the graph — sanctions exposure, jurisdictional dependencies, control relationships.",
    detail: [
      "Formal logic over node and edge attributes",
      "Audit trail for every claim with traceable evidence",
      "Surfaces silent failure modes before they become incidents",
    ],
    pillar: "Underwrites the J pillar (Jurisdictional Hazard).",
  },
  {
    name: "PEARL",
    role: "COUNTERFACTUAL ENGINE",
    color: "purple",
    summary:
      "Asks what-if questions on the causal graph — substitute a node, sever an edge, model an embargo — and computes the counterfactual world.",
    detail: [
      "Substitution counterfactuals for irreplaceability scoring",
      "Counterfactual recovery time estimation",
      "Intervention design for stress-tests",
    ],
    pillar: "Underwrites I (Irreplaceability) and R (Restoration Latency).",
  },
  {
    name: "PARETO",
    role: "CASCADE & TAIL SIMULATION",
    color: "orange",
    summary:
      "Simulates cascade dynamics across the graph and characterizes tail risk beyond traditional VaR.",
    detail: [
      "Monte Carlo cascade simulation with configurable shock distributions",
      "Tail-depth statistics — fat-tail severity beyond VaR",
      "ΩSF and ΩSX system-level fragility outputs",
    ],
    pillar: "Underwrites the T pillar (Tail Depth) and aggregates C results.",
  },
] as const;

const colorMap: Record<string, { text: string; border: string; bg: string }> = {
  cyan:   { text: "text-accent-cyan",   border: "border-accent-cyan/30",   bg: "bg-accent-cyan" },
  amber:  { text: "text-accent-amber",  border: "border-accent-amber/30",  bg: "bg-accent-amber" },
  purple: { text: "text-accent-purple", border: "border-accent-purple/30", bg: "bg-accent-purple" },
  orange: { text: "text-accent-orange", border: "border-accent-orange/30", bg: "bg-accent-orange" },
};

export default function ProductPage() {
  return (
    <>
      {/* Page header with annotated graph */}
      <section className="relative border-b border-border overflow-hidden">
        <div className="absolute inset-0 grid-bg opacity-40 mask-fade-edges" aria-hidden />
        <div className="relative mx-auto max-w-7xl px-4 md:px-6 pt-20 pb-16 md:pt-24 md:pb-20">
          <div className="grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:items-center">
            <div className="space-y-6">
              <SectionLabel>PRODUCT</SectionLabel>
              <h1 className="font-[family-name:var(--font-michroma)] text-3xl md:text-5xl tracking-[0.04em] leading-[1.15] text-foreground">
                Four engines.
                <br />
                <span className="text-accent-cyan text-glow-cyan">One causal graph.</span>
              </h1>
              <p className="text-sm md:text-base font-mono text-text-muted leading-relaxed max-w-2xl">
                Manifold is a causal-intelligence terminal built on four
                specialized engines. Each handles a distinct part of causal
                reasoning; together they transform raw signal into actionable
                structure for the world&apos;s most consequential networks.
              </p>
            </div>

            <div className="relative bg-surface-elevated/60 border border-border rounded-lg p-4 backdrop-blur">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent-cyan" />
                  <span className="font-[family-name:var(--font-michroma)] text-[8px] tracking-[0.3em] text-text-muted">
                    ENGINE COVERAGE · CAUSAL GRAPH
                  </span>
                </div>
                <span className="font-mono text-[9px] tracking-wider text-text-muted/70">
                  RUN_ID 0x4C19
                </span>
              </div>
              <div className="aspect-[2/1] w-full">
                <EngineGraph />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Engine pipeline visual */}
      <Section className="py-20 md:py-24">
        <div className="space-y-3 mb-10">
          <SectionLabel color="cyan">ARCHITECTURE</SectionLabel>
          <SectionHeading>One scored graph. Four engines in parallel.</SectionHeading>
          <SectionLede>
            Pillar scores (I, R, J, C, T) and per-node ΩF are computed at
            import from metadata and topology. The four engines then run as
            independent analytical lenses on that scored graph — not a
            sequence — and feed into the system-level Ω state, cascade
            replays, and Monte-Carlo forecasts.
          </SectionLede>
        </div>

        <div className="bg-surface-elevated border border-border rounded-lg p-4 md:p-8">
          <div className="aspect-[1100/360] w-full">
            <EngineFlow />
          </div>
        </div>
      </Section>

      {/* Engines deep-dive */}
      <Section className="py-20 md:py-24 border-t border-border">
        <div className="space-y-3 mb-12">
          <SectionLabel color="purple">THE ENGINES</SectionLabel>
          <SectionHeading>Each engine, in detail.</SectionHeading>
        </div>

        <div className="space-y-px bg-border border border-border rounded-lg overflow-hidden">
          {ENGINES.map((e) => {
            const c = colorMap[e.color];
            return (
              <div key={e.name} className="bg-surface-elevated p-6 md:p-10 hover:bg-surface transition-colors">
                <div className="grid gap-8 md:grid-cols-[280px_1fr]">
                  <div>
                    <div className={`font-[family-name:var(--font-michroma)] text-[9px] tracking-[0.3em] ${c.text} mb-2`}>
                      {e.role}
                    </div>
                    <div className="font-[family-name:var(--font-michroma)] text-3xl md:text-4xl tracking-[0.15em] text-foreground mb-4">
                      {e.name}
                    </div>
                    <span className={`block h-1 w-12 ${c.bg} opacity-70`} />
                  </div>
                  <div className="space-y-5">
                    <p className="text-[14px] font-mono text-foreground/90 leading-relaxed">
                      {e.summary}
                    </p>
                    <ul className="space-y-2">
                      {e.detail.map((d) => (
                        <li key={d} className="flex items-start gap-3 text-[12px] font-mono text-text-muted leading-relaxed">
                          <span className={`mt-2 h-px w-3 ${c.bg} opacity-70 shrink-0`} />
                          <span>{d}</span>
                        </li>
                      ))}
                    </ul>
                    <div className={`mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded border ${c.border} bg-surface`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${c.bg}`} />
                      <span className={`font-[family-name:var(--font-michroma)] text-[9px] tracking-[0.25em] ${c.text}`}>
                        {e.pillar}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      {/* Configurable engines (per-domain) */}
      <Section className="py-20 md:py-24 border-t border-border">
        <div className="grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:items-start">
          <div className="space-y-4">
            <SectionLabel color="green">CONFIGURABILITY</SectionLabel>
            <SectionHeading>Manifold is a configurable template.</SectionHeading>
            <SectionLede>
              Criticality looks different in finance than it does in fertilizer
              supply chains. Engines are pluggable per domain — swap the
              criticality core, retain the rest of the system.
            </SectionLede>
            <div className="pt-2">
              <Link
                href="/framework"
                className="font-[family-name:var(--font-michroma)] text-[10px] tracking-[0.3em] text-accent-cyan/80 hover:text-accent-cyan inline-flex items-center gap-2"
              >
                <span>SEE THE Ω-FRAGILITY FRAMEWORK</span>
                <span className="text-[10px]">›</span>
              </Link>
            </div>
          </div>

          <div className="bg-surface-elevated border border-border rounded-lg p-6 md:p-8 space-y-4">
            <div className="font-[family-name:var(--font-michroma)] text-[9px] tracking-[0.3em] text-accent-cyan/80">
              ENGINES PER DOMAIN
            </div>
            {[
              { domain: "MANUFACTURING",   color: "bg-accent-cyan",     stack: "SPIRTES · PEARL · PARETO" },
              { domain: "INFRASTRUCTURE",  color: "bg-accent-purple",   stack: "SPIRTES · TARSKI · PARETO" },
              { domain: "ECONOMIC",        color: "bg-accent-amber",    stack: "SPIRTES · PARETO" },
              { domain: "FINANCE",         color: "bg-accent-orange",   stack: "PEARL · PARETO" },
              { domain: "ENERGY",          color: "bg-accent-green",    stack: "ALL FOUR" },
              { domain: "GEOPOLITICAL",    color: "bg-accent-red",      stack: "TARSKI · PEARL" },
              { domain: "SCIENCE",         color: "bg-accent-magenta",  stack: "SPIRTES · PEARL" },
            ].map((row) => (
              <div key={row.domain} className="flex items-center justify-between border-b border-border last:border-0 pb-3 last:pb-0">
                <div className="flex items-center gap-3">
                  <span className={`h-2 w-2 rounded-full ${row.color}`} />
                  <span className="font-[family-name:var(--font-michroma)] text-[10px] tracking-[0.25em] text-foreground">
                    {row.domain}
                  </span>
                </div>
                <span className="font-mono text-[10px] tracking-wider text-text-muted">
                  {row.stack}
                </span>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* CTA */}
      <Section className="py-20 md:py-28 border-t border-border">
        <div className="relative overflow-hidden bg-surface border border-accent-cyan/20 rounded-lg p-8 md:p-14">
          <div className="absolute inset-0 grid-bg opacity-30" aria-hidden />
          <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-8">
            <div className="space-y-3 max-w-xl">
              <SectionLabel>TRY THE TERMINAL</SectionLabel>
              <h3 className="font-[family-name:var(--font-michroma)] text-2xl md:text-3xl tracking-[0.06em] text-foreground leading-[1.25]">
                See the engines on real data.
              </h3>
              <p className="text-[13px] font-mono text-text-muted leading-relaxed">
                Trial accounts come pre-loaded with curated datasets across
                manufacturing, energy, and finance.
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
