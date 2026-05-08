import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Section, TerminalHeader } from "@/components/ui/Section";
import CTAButton from "@/components/ui/CTAButton";
import { SITE } from "@/lib/site";
import {
  DOMAINS,
  DOMAIN_SLUGS,
  type Color,
  type DomainContent,
  type Persona,
} from "@/lib/domains";

const PILLAR_NAMES: Record<string, string> = {
  I: "IRREPLACEABILITY",
  R: "RESTORATION LATENCY",
  J: "JURISDICTIONAL HAZARD",
  C: "CASCADE LOAD",
  T: "TAIL DEPTH",
};

const ENGINE_ROLE: Record<string, string> = {
  SPIRTES: "STRUCTURE DISCOVERY",
  TARSKI: "FORMAL VERIFICATION",
  PEARL: "COUNTERFACTUAL ENGINE",
  PARETO: "CASCADE & TAIL SIMULATION",
};

const ENGINE_COLOR: Record<string, Color> = {
  SPIRTES: "cyan",
  TARSKI: "amber",
  PEARL: "purple",
  PARETO: "orange",
};

/**
 * Domain-flavored Mini-Audit CTA copy. Each entry pairs a per-slug
 * action verb with the kind of graph the audit will actually hit
 * for that domain. Falls back to a generic "Audit your graph" if a
 * slug isn't covered (e.g. a future domain added without updating
 * this map).
 */
const AUDIT_CTA_BY_SLUG: Record<string, string> = {
  manufacturing: "Audit your supplier graph — $1,500",
  infrastructure: "Audit your infrastructure graph — $1,500",
  economic: "Audit your trade-flow graph — $1,500",
  finance: "Audit your counterparty graph — $1,500",
  energy: "Audit your grid / supply graph — $1,500",
  geopolitical: "Audit your sanctions exposure — $1,500",
  science: "Audit your research portfolio — $1,500",
  insurance: "Audit your treaty / exposure graph — $1,500",
};

const colorMap: Record<
  Color,
  { text: string; border: string; bg: string; soft: string; glow: string }
> = {
  cyan:    { text: "text-accent-cyan",    border: "border-accent-cyan/30",    bg: "bg-accent-cyan",    soft: "bg-accent-cyan/5",    glow: "text-glow-cyan" },
  amber:   { text: "text-accent-amber",   border: "border-accent-amber/30",   bg: "bg-accent-amber",   soft: "bg-accent-amber/5",   glow: "text-glow-amber" },
  purple:  { text: "text-accent-purple",  border: "border-accent-purple/30",  bg: "bg-accent-purple",  soft: "bg-accent-purple/5",  glow: "text-glow-cyan" },
  orange:  { text: "text-accent-orange",  border: "border-accent-orange/30",  bg: "bg-accent-orange",  soft: "bg-accent-orange/5",  glow: "text-glow-amber" },
  green:   { text: "text-accent-green",   border: "border-accent-green/30",   bg: "bg-accent-green",   soft: "bg-accent-green/5",   glow: "text-glow-cyan" },
  red:     { text: "text-accent-red",     border: "border-accent-red/30",     bg: "bg-accent-red",     soft: "bg-accent-red/5",     glow: "text-glow-amber" },
  magenta: { text: "text-accent-magenta", border: "border-accent-magenta/30", bg: "bg-accent-magenta", soft: "bg-accent-magenta/5", glow: "text-glow-cyan" },
  blue:    { text: "text-accent-blue",    border: "border-accent-blue/30",    bg: "bg-accent-blue",    soft: "bg-accent-blue/5",    glow: "text-glow-cyan" },
};

export function generateStaticParams() {
  return DOMAIN_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const d = DOMAINS[slug];
  if (!d) return {};
  return {
    title: `${d.name} · Apex Analytica`,
    description: d.tagline,
  };
}

export default async function DomainPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const d = DOMAINS[slug];
  if (!d) notFound();
  const c = colorMap[d.color];

  return (
    <>
      {/* Header */}
      <section className="relative border-b border-border overflow-hidden">
        <div className="absolute inset-0 grid-bg opacity-40 mask-fade-edges" aria-hidden />
        <div className="relative mx-auto max-w-7xl px-4 md:px-6 pt-16 pb-12 md:pt-20 md:pb-14">
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <Link
              href="/#domains"
              className="font-[family-name:var(--font-michroma)] text-[10px] tracking-[0.3em] text-text-muted/70 hover:text-foreground transition-colors"
            >
              ← // DOMAINS
            </Link>
            <span className="text-text-muted/40">·</span>
            <span className={`font-[family-name:var(--font-michroma)] text-[10px] tracking-[0.3em] ${c.text}`}>
              // {d.name.toUpperCase()}
            </span>
            <span className="font-mono text-[10px] text-text-muted/60">manifold.{d.slug}</span>
          </div>
          <h1 className="font-[family-name:var(--font-michroma)] text-3xl md:text-5xl tracking-[0.04em] leading-[1.15] text-foreground max-w-3xl">
            <span className={`${c.text} ${c.glow}`}>{d.name}.</span>
          </h1>
          <p className="mt-5 text-sm md:text-base font-mono text-text-muted leading-relaxed max-w-2xl">
            {d.tagline}
          </p>
        </div>
      </section>

      {/* Problem */}
      <Section className="py-10 md:py-14 border-t border-border">
        <TerminalHeader
          label="// THE PROBLEM"
          path={`manifold.${d.slug}.problem`}
          right="WHAT YOU WALK IN WITH"
          color={d.color}
        />
        <div className="bg-surface-elevated border border-border rounded-lg p-5 md:p-7 space-y-3 max-w-4xl">
          {d.problem.map((para, i) => (
            <p key={i} className="text-[13px] md:text-sm font-mono text-foreground/90 leading-relaxed">
              {para}
            </p>
          ))}
        </div>
      </Section>

      {/* How Manifold maps it */}
      <Section className="py-10 md:py-14 border-t border-border">
        <TerminalHeader
          label="// HOW MANIFOLD MAPS IT"
          path={`manifold.${d.slug}.graph`}
          right="CAUSAL TOPOLOGY"
          color="cyan"
        />
        <div className="grid gap-3 md:grid-cols-[1.4fr_1fr]">
          <div className="bg-surface-elevated border border-border rounded-lg p-5 md:p-7 space-y-3">
            {d.mapping.map((para, i) => (
              <p key={i} className="text-[13px] font-mono text-foreground/90 leading-relaxed">
                {para}
              </p>
            ))}
          </div>
          <div className="bg-surface-elevated border border-border rounded-lg p-5 space-y-3">
            <div className="font-[family-name:var(--font-michroma)] text-[10px] tracking-[0.25em] text-accent-cyan/90">
              KEY PILLARS
            </div>
            <div className="grid gap-2">
              {d.pillars.map((p) => (
                <div
                  key={p}
                  className="flex items-baseline justify-between border-b border-border last:border-0 pb-2 last:pb-0"
                >
                  <span className={`font-[family-name:var(--font-michroma)] text-2xl ${c.text} leading-none`}>
                    {p}
                  </span>
                  <span className="font-[family-name:var(--font-michroma)] text-[9px] tracking-[0.25em] text-foreground/80 text-right">
                    {PILLAR_NAMES[p]}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* Personas */}
      {d.personas.length > 0 && (
        <Section className="py-10 md:py-14 border-t border-border">
          <TerminalHeader
            label="// WHO THIS IS FOR"
            path={`manifold.${d.slug}.personas`}
            right={`${d.personas.length} ROLES`}
            color="amber"
          />
          <div className="grid gap-3 md:grid-cols-2">
            {d.personas.map((p) => (
              <PersonaTile key={p.title} persona={p} domainColor={d.color} />
            ))}
          </div>
        </Section>
      )}

      {/* Engines used in this domain */}
      <Section className="py-10 md:py-14 border-t border-border">
        <TerminalHeader
          label="// ENGINES IN PLAY"
          path={`manifold.${d.slug}.engines`}
          right={`${d.engines.length} OF 4`}
          color="purple"
        />
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          {d.engines.map((e) => {
            const ec = colorMap[ENGINE_COLOR[e]];
            return (
              <div
                key={e}
                className={`bg-surface-elevated border ${ec.border} rounded-lg p-5 hover:bg-surface transition-colors flex flex-col gap-2`}
              >
                <div className={`font-[family-name:var(--font-michroma)] text-[9px] tracking-[0.3em] ${ec.text}`}>
                  {ENGINE_ROLE[e]}
                </div>
                <div className={`font-[family-name:var(--font-michroma)] text-2xl tracking-[0.12em] ${ec.text} leading-none`}>
                  {e}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex justify-end">
          <Link
            href="/product"
            className="font-[family-name:var(--font-michroma)] text-[10px] tracking-[0.3em] text-accent-cyan/70 hover:text-accent-cyan inline-flex items-center gap-2"
          >
            <span>HOW THE ENGINES WORK</span>
            <span>›</span>
          </Link>
        </div>
      </Section>

      {/* Signals */}
      {d.signals.length > 0 && (
        <Section className="py-10 md:py-14 border-t border-border">
          <TerminalHeader
            label="// SIGNALS WE INGEST"
            path={`manifold.${d.slug}.signals`}
            right={`${d.signals.length} STREAMS`}
            color="green"
          />
          <div className="grid gap-px bg-border border border-border rounded-lg overflow-hidden md:grid-cols-2">
            {d.signals.map((s, i) => (
              <div
                key={i}
                className="bg-surface-elevated px-5 py-3 flex items-center gap-3 hover:bg-surface transition-colors"
              >
                <span className={`h-1.5 w-1.5 rounded-full ${c.bg}`} />
                <span className="font-mono text-[12.5px] text-foreground/85">{s}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Sample readout */}
      {d.sampleNode && <SampleReadout domain={d} />}

      {/* CTA */}
      <Section className="py-14 md:py-20 border-t border-border">
        <div className={`relative overflow-hidden bg-surface border ${c.border} rounded-lg p-6 md:p-10`}>
          <div className="absolute inset-0 grid-bg opacity-30" aria-hidden />
          <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2 max-w-xl">
              <div className={`font-mono text-[10px] tracking-[0.2em] ${c.text}`}>// SEE IT FOR YOUR DOMAIN</div>
              <h3 className="font-[family-name:var(--font-michroma)] text-2xl md:text-3xl tracking-[0.06em] text-foreground leading-[1.25]">
                Run Manifold on a {d.name.toLowerCase()} graph.
              </h3>
              <p className="text-[12.5px] font-mono text-text-muted leading-relaxed">
                Trial accounts come pre-loaded with a curated dataset. Or
                request an invite to bring your own graph.
              </p>
            </div>
            <div className="flex flex-col gap-3 shrink-0">
              <CTAButton href={SITE.trialUrl} external>START 48-HR TRIAL</CTAButton>
              <CTAButton href="/access" variant="secondary">REQUEST INVITE</CTAButton>
              {/* Domain-flavored Mini-Audit CTA — productized $1,500
                  alternative to the trial / invite paths. Phrasing
                  comes from AUDIT_CTA_BY_SLUG above. */}
              <Link
                href="/audit"
                className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded text-[11px] font-[family-name:var(--font-michroma)] tracking-[0.18em] bg-accent-amber/10 border border-accent-amber/40 text-accent-amber hover:bg-accent-amber/20 hover:border-accent-amber/60 transition-all"
              >
                <span>
                  {AUDIT_CTA_BY_SLUG[d.slug] ?? "Audit your graph — $1,500"}
                </span>
                <span aria-hidden>›</span>
              </Link>
              <a
                href={SITE.pricingUrl}
                className="font-[family-name:var(--font-michroma)] text-[10px] tracking-[0.3em] text-text-muted/70 hover:text-foreground inline-flex items-center justify-center gap-2 pt-1"
              >
                <span>SEE PRICING</span>
                <span>›</span>
              </a>
            </div>
          </div>
        </div>
      </Section>
    </>
  );
}

function PersonaTile({ persona, domainColor }: { persona: Persona; domainColor: Color }) {
  const c = colorMap[domainColor];
  return (
    <div className={`relative bg-surface-elevated border border-border rounded-lg p-5 transition-colors hover:bg-surface flex flex-col gap-3`}>
      <div className={`absolute top-0 left-0 h-0.5 w-12 ${c.bg} opacity-70`} />
      <div className="flex items-center gap-2">
        <span className={`h-1.5 w-1.5 rounded-full ${c.bg}`} />
        <span className={`font-[family-name:var(--font-michroma)] text-[9px] tracking-[0.3em] ${c.text}`}>
          PERSONA
        </span>
      </div>
      <div className="font-[family-name:var(--font-michroma)] text-[13px] tracking-[0.06em] text-foreground leading-snug">
        {persona.title}
      </div>
      <div className="space-y-2 pt-2 border-t border-border/60">
        <div>
          <div className={`font-[family-name:var(--font-michroma)] text-[8px] tracking-[0.3em] ${c.text} mb-1`}>
            WALKS IN WITH
          </div>
          <p className="text-[12px] font-mono text-foreground/85 leading-relaxed">{persona.pain}</p>
        </div>
        <div>
          <div className={`font-[family-name:var(--font-michroma)] text-[8px] tracking-[0.3em] ${c.text} mb-1`}>
            WALKS OUT WITH
          </div>
          <p className="text-[12px] font-mono text-foreground/85 leading-relaxed">{persona.gain}</p>
        </div>
      </div>
    </div>
  );
}

function SampleReadout({ domain }: { domain: DomainContent }) {
  const node = domain.sampleNode!;
  const c = colorMap[domain.color];
  const pillarRows = (Object.keys(node.breakdown) as Array<keyof typeof node.breakdown>).map(
    (k) => ({ pillar: k, value: node.breakdown[k] ?? 0 }),
  );
  return (
    <Section className="py-10 md:py-14 border-t border-border">
      <TerminalHeader
        label="// SAMPLE READOUT"
        path={`manifold.${domain.slug}.sample`}
        right={node.label}
        color="cyan"
      />
      <div className="bg-surface-elevated border border-border rounded-lg p-5 md:p-7">
        <div className="grid gap-5 md:grid-cols-[1fr_1.4fr]">
          <div className="space-y-3">
            <div className={`font-[family-name:var(--font-michroma)] text-[10px] tracking-[0.25em] ${c.text}`}>
              SAMPLE NODE
            </div>
            <div className="font-[family-name:var(--font-michroma)] text-base md:text-lg tracking-[0.05em] text-foreground leading-tight">
              {node.label}
            </div>
            <p className="text-[12px] font-mono text-text-muted leading-relaxed">{node.note}</p>
            <div className="pt-2">
              <div className={`font-[family-name:var(--font-michroma)] text-[9px] tracking-[0.25em] text-text-muted mb-1`}>
                ΩF COMPOSITE
              </div>
              <div className="flex items-baseline gap-1">
                <span className={`font-[family-name:var(--font-michroma)] text-4xl md:text-5xl ${c.text} ${c.glow} leading-none`}>
                  {node.omegaF.toFixed(2)}
                </span>
                <span className="font-mono text-xs text-text-muted">/ 10</span>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="font-[family-name:var(--font-michroma)] text-[9px] tracking-[0.25em] text-accent-cyan/80 mb-2">
              // PILLAR BREAKDOWN
            </div>
            {pillarRows.map((row) => (
              <div key={row.pillar} className="flex items-center gap-3">
                <span className={`font-[family-name:var(--font-michroma)] text-2xl ${c.text} w-6 leading-none`}>
                  {row.pillar}
                </span>
                <div className="flex-1 h-2 bg-surface border border-border rounded-full overflow-hidden">
                  <div
                    className={`h-full ${c.bg}`}
                    style={{ width: `${(row.value as number) * 10}%`, opacity: 0.85 }}
                  />
                </div>
                <span className="font-mono text-[12px] text-foreground/90 w-8 text-right">
                  {(row.value as number).toFixed(1)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Section>
  );
}
