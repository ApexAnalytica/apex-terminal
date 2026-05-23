import Link from "next/link";
import { Section, TerminalHeader } from "@/components/ui/Section";
import CTAButton from "@/components/ui/CTAButton";
import EngineFlow from "@/components/visuals/EngineFlow";
import EngineGraph from "@/components/visuals/EngineGraph";
import { SITE } from "@/lib/site";
import { DOMAINS, DOMAIN_SLUGS } from "@/lib/domains";

const ENGINES = [
  {
    name: "SPIRTES",
    role: "STRUCTURE DISCOVERY",
    color: "cyan",
    summary:
      "Recovers the causal topology of a critical system from observational data — which nodes act on which, and through what edges.",
    detail: [
      "Constraint-based, score-based, and gradient-based search across observational data",
      "Five discovery algorithms compared side-by-side — PC, FCI (CMI-knn), NOTEARS, PCMCI-linear, lag-correlation",
      "Auto → confirmed edge lifecycle with promote / demote affordance",
    ],
    pillar: "C · CASCADE LOAD",
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
    pillar: "J · JURISDICTIONAL HAZARD",
  },
  {
    name: "PEARL",
    role: "COUNTERFACTUAL ENGINE",
    color: "purple",
    summary:
      "Asks what-if questions on the causal graph — substitute a node, sever an edge, model an embargo — and computes the counterfactual world.",
    detail: [
      "Unified intervention surface — scenario input, ablation, and interdiction co-located on one pane",
      "APPLY ALL + SIMULATE — counterfactual cascade auto-runs after intervention",
      "Explainable cuts — every interdicted edge surfaces a WHY trace back to the graph",
    ],
    pillar: "I · IRREPLACEABILITY  ·  R · RESTORATION",
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
    pillar: "T · TAIL DEPTH",
  },
] as const;

// Derived from the source-of-truth domain catalog (DOMAINS in
// lib/domains.ts) so the engine roster on /product can never drift
// from the per-slug pages. Previously hand-rolled, and 7 of 8 rows
// had stale stacks + INSURANCE was missing entirely (audit 2026-05-22).
const DOMAIN_STACKS = DOMAIN_SLUGS.map((slug) => {
  const d = DOMAINS[slug];
  return {
    domain: d.name.toUpperCase(),
    color: `bg-accent-${d.color}`,
    stack: d.engines.join(" · "),
  };
});

const colorMap: Record<string, { text: string; border: string; bg: string }> = {
  cyan:   { text: "text-accent-cyan",   border: "border-accent-cyan/30",   bg: "bg-accent-cyan" },
  amber:  { text: "text-accent-amber",  border: "border-accent-amber/30",  bg: "bg-accent-amber" },
  purple: { text: "text-accent-purple", border: "border-accent-purple/30", bg: "bg-accent-purple" },
  orange: { text: "text-accent-orange", border: "border-accent-orange/30", bg: "bg-accent-orange" },
};

// COPILOT — conversational control surface bullets. Sits in its own
// section between THE ENGINES and CONFIGURABILITY on /product so the
// "engines as substrate, chat as control" narrative reads top-down.
const COPILOT_FEATURES = [
  "Hands-free voice mode — barge-in interrupts the agent mid-response",
  "Every action emits a replay-able trace for audit",
  "Bulk-ablate TARSKI-restricted nodes with one command",
  "Tool registry — engines exposed as callable functions",
  "Model picker per session — Gemini default; Claude or local Ollama on demand",
] as const;

export default function ProductPage() {
  return (
    <>
      {/* Header with annotated graph */}
      <section className="relative border-b border-border overflow-hidden">
        <div className="absolute inset-0 grid-bg opacity-40 mask-fade-edges" aria-hidden />
        <div className="relative mx-auto max-w-7xl px-4 md:px-6 pt-16 pb-12 md:pt-20 md:pb-14">
          <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr] lg:items-center">
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <span className="font-[family-name:var(--font-michroma)] text-[10px] tracking-[0.3em] text-accent-cyan/90">
                  // PRODUCT
                </span>
                <span className="font-mono text-[10px] text-text-muted/60">manifold.engines</span>
              </div>
              <h1 className="font-[family-name:var(--font-michroma)] text-3xl md:text-5xl tracking-[0.04em] leading-[1.15] text-foreground">
                Four engines.
                <br />
                <span className="text-accent-cyan text-glow-cyan">One causal graph.</span>
              </h1>
              <p className="text-sm md:text-base font-mono text-text-muted leading-relaxed max-w-2xl">
                Manifold is a causal-intelligence terminal built on four
                specialized engines running in parallel on a shared scored
                graph.
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

      {/* Architecture: pipeline visual */}
      <Section className="py-10 md:py-14 border-t border-border">
        <TerminalHeader
          label="// ARCHITECTURE"
          path="manifold.flow"
          right="DATA → SCORED GRAPH → 4 ENGINES → Ω OUTPUT"
          color="cyan"
        />
        <div className="bg-surface-elevated border border-border rounded-lg p-4 md:p-6">
          <div className="aspect-[1100/360] w-full">
            <EngineFlow />
          </div>
        </div>
      </Section>

      {/* Engines deep-dive — 2x2 mosaic */}
      <Section className="py-10 md:py-14 border-t border-border">
        <TerminalHeader
          label="// THE ENGINES"
          path="manifold.engines.detail"
          right="04 CORES"
          color="purple"
        />
        <div className="grid gap-3 md:grid-cols-2">
          {ENGINES.map((e) => {
            const c = colorMap[e.color];
            return (
              <div
                key={e.name}
                className={`relative bg-surface-elevated border ${c.border} rounded-lg p-5 hover:bg-surface transition-colors flex flex-col gap-4`}
              >
                <div className="flex items-baseline justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`h-1.5 w-1.5 rounded-full ${c.bg}`} />
                    <span className={`font-[family-name:var(--font-michroma)] text-[9px] tracking-[0.3em] ${c.text}`}>
                      {e.role}
                    </span>
                  </div>
                  <span className="font-mono text-[9px] tracking-wider text-text-muted/70">
                    ENGINE
                  </span>
                </div>

                <div className={`font-[family-name:var(--font-michroma)] text-2xl md:text-3xl tracking-[0.12em] ${c.text} leading-none`}>
                  {e.name}
                </div>

                <p className="text-[12.5px] font-mono text-foreground/85 leading-relaxed">
                  {e.summary}
                </p>

                <ul className="space-y-1.5">
                  {e.detail.map((d) => (
                    <li
                      key={d}
                      className="flex items-start gap-2.5 text-[11.5px] font-mono text-text-muted leading-relaxed"
                    >
                      <span className={`mt-2 h-px w-2.5 ${c.bg} opacity-70 shrink-0`} />
                      <span>{d}</span>
                    </li>
                  ))}
                </ul>

                <div className={`mt-auto inline-flex items-center gap-2 self-start px-2.5 py-1 rounded border ${c.border} bg-surface`}>
                  <span className={`h-1 w-1 rounded-full ${c.bg}`} />
                  <span className={`font-[family-name:var(--font-michroma)] text-[8.5px] tracking-[0.25em] ${c.text}`}>
                    BACKS · {e.pillar}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      {/* COPILOT — conversational control surface on top of the
          engines. Same engines and same scored graph; chat or voice
          drives ablations / counterfactuals / cascade walks. */}
      <Section className="py-10 md:py-14 border-t border-border">
        <TerminalHeader
          label="// COPILOT"
          path="manifold.control"
          right="CHAT · VOICE · TRACEABLE"
          color="cyan"
        />
        <div className="bg-surface-elevated border border-accent-cyan/30 rounded-lg p-6 md:p-8">
          <div className="grid gap-6 md:grid-cols-[1.1fr_1fr] md:items-start">
            <div className="space-y-4">
              <div className="font-[family-name:var(--font-michroma)] text-[10px] tracking-[0.25em] text-accent-cyan/90">
                // DRIVE THE GRAPH BY CONVERSATION
              </div>
              <h3 className="font-[family-name:var(--font-michroma)] text-xl md:text-2xl tracking-[0.04em] text-foreground leading-[1.25]">
                Engines as tools. Conversation as control.
              </h3>
              <p className="text-[12.5px] font-mono text-text-muted leading-relaxed">
                Every engine exposes itself to a conversational layer on
                top of the terminal. Operators run ablations, build
                counterfactuals, and chase cascade chains in natural
                language — by typing or speaking — and the engines
                execute against the same scored graph.
              </p>
            </div>
            <ul className="space-y-2">
              {COPILOT_FEATURES.map((f) => (
                <li
                  key={f}
                  className="flex items-start gap-2.5 text-[12px] font-mono text-foreground/85 leading-relaxed"
                >
                  <span className="mt-2 h-px w-2.5 bg-accent-cyan opacity-70 shrink-0" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      {/* Configurability */}
      <Section className="py-10 md:py-14 border-t border-border">
        <TerminalHeader
          label="// CONFIGURABILITY"
          path="manifold.domain_stacks"
          right="ENGINES PER DOMAIN"
          color="green"
        />
        <div className="grid gap-3 md:grid-cols-[1fr_1.2fr]">
          <div className="bg-surface-elevated border border-border rounded-lg p-5 space-y-3">
            <div className="font-[family-name:var(--font-michroma)] text-[10px] tracking-[0.25em] text-accent-green/90">
              MANIFOLD IS A TEMPLATE
            </div>
            <p className="text-[12.5px] font-mono text-foreground/85 leading-relaxed">
              Criticality in fertilizer supply chains looks nothing like
              criticality in pancreatic biology — and the same Manifold
              substrate renders both. Engines plug per domain; the
              criticality core swaps; the rest of the system stays put.
              The same codebase ships today as a macro-impact terminal,
              a geopolitical terminal, and a biomedical-research terminal.
            </p>
            <div className="pt-2">
              <Link
                href="/framework"
                className="font-[family-name:var(--font-michroma)] text-[10px] tracking-[0.3em] text-accent-cyan/80 hover:text-accent-cyan inline-flex items-center gap-2"
              >
                <span>SEE THE Ω-FRAGILITY FRAMEWORK</span>
                <span>›</span>
              </Link>
            </div>
          </div>

          <div className="bg-surface-elevated border border-border rounded-lg p-5">
            <div className="grid gap-px bg-border border border-border rounded overflow-hidden">
              {DOMAIN_STACKS.map((row) => (
                <div
                  key={row.domain}
                  className="bg-surface-elevated px-4 py-2.5 flex items-center justify-between hover:bg-surface transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className={`h-1.5 w-1.5 rounded-full ${row.color}`} />
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
        </div>
      </Section>

      {/* CTA */}
      <Section className="py-14 md:py-20 border-t border-border">
        <div className="relative overflow-hidden bg-surface border border-accent-cyan/20 rounded-lg p-6 md:p-10">
          <div className="absolute inset-0 grid-bg opacity-30" aria-hidden />
          <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2 max-w-xl">
              <div className="font-mono text-[10px] tracking-[0.2em] text-accent-cyan/80">// TRY THE TERMINAL</div>
              <h3 className="font-[family-name:var(--font-michroma)] text-2xl md:text-3xl tracking-[0.06em] text-foreground leading-[1.25]">
                See the engines on real data.
              </h3>
              <p className="text-[12.5px] font-mono text-text-muted leading-relaxed">
                Trial accounts come pre-loaded with curated datasets across
                manufacturing, energy, and finance.
              </p>
            </div>
            <div className="flex flex-col gap-3 shrink-0">
              <CTAButton href={SITE.trialUrl} external>START 48-HR TRIAL</CTAButton>
              <CTAButton href="/access" variant="secondary">REQUEST ACCESS</CTAButton>
            </div>
          </div>
        </div>
      </Section>
    </>
  );
}
