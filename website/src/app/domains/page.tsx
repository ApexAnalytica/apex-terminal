import Link from "next/link";
import type { Metadata } from "next";
import { Section, TerminalHeader } from "@/components/ui/Section";
import { DOMAINS, DOMAIN_SLUGS, type Color } from "@/lib/domains";

export const metadata: Metadata = {
  title: "Domains · Apex Analytica",
  description:
    "Seven domains where Manifold maps, scores, and stress-tests fragility. Pick the one that matches the system you care about.",
};

const colorMap: Record<
  Color,
  { text: string; border: string; bg: string; soft: string; glow: string; rule: string }
> = {
  cyan:    { text: "text-accent-cyan",    border: "border-accent-cyan/30",    bg: "bg-accent-cyan",    soft: "bg-accent-cyan/5",    glow: "text-glow-cyan",  rule: "bg-accent-cyan" },
  amber:   { text: "text-accent-amber",   border: "border-accent-amber/30",   bg: "bg-accent-amber",   soft: "bg-accent-amber/5",   glow: "text-glow-amber", rule: "bg-accent-amber" },
  purple:  { text: "text-accent-purple",  border: "border-accent-purple/30",  bg: "bg-accent-purple",  soft: "bg-accent-purple/5",  glow: "text-glow-cyan",  rule: "bg-accent-purple" },
  orange:  { text: "text-accent-orange",  border: "border-accent-orange/30",  bg: "bg-accent-orange",  soft: "bg-accent-orange/5",  glow: "text-glow-amber", rule: "bg-accent-orange" },
  green:   { text: "text-accent-green",   border: "border-accent-green/30",   bg: "bg-accent-green",   soft: "bg-accent-green/5",   glow: "text-glow-cyan",  rule: "bg-accent-green" },
  red:     { text: "text-accent-red",     border: "border-accent-red/30",     bg: "bg-accent-red",     soft: "bg-accent-red/5",     glow: "text-glow-amber", rule: "bg-accent-red" },
  magenta: { text: "text-accent-magenta", border: "border-accent-magenta/30", bg: "bg-accent-magenta", soft: "bg-accent-magenta/5", glow: "text-glow-cyan",  rule: "bg-accent-magenta" },
};

export default function DomainsIndexPage() {
  const domains = DOMAIN_SLUGS.map((s) => DOMAINS[s]);

  return (
    <>
      {/* Header */}
      <section className="relative border-b border-border overflow-hidden">
        <div className="absolute inset-0 grid-bg opacity-40 mask-fade-edges" aria-hidden />
        <div className="relative mx-auto max-w-7xl px-4 md:px-6 pt-16 pb-12 md:pt-20 md:pb-14">
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <span className="font-[family-name:var(--font-michroma)] text-[10px] tracking-[0.3em] text-accent-cyan/90">
              // DOMAINS
            </span>
            <span className="font-mono text-[10px] text-text-muted/60">manifold.domains</span>
            <span className="text-text-muted/40">·</span>
            <span className="font-mono text-[10px] text-text-muted/60">07 CONFIGURED</span>
          </div>
          <h1 className="font-[family-name:var(--font-michroma)] text-3xl md:text-5xl tracking-[0.04em] leading-[1.15] text-foreground max-w-3xl">
            Seven domains.{" "}
            <span className="text-accent-cyan text-glow-cyan">One graph engine.</span>
          </h1>
          <p className="mt-5 text-sm md:text-base font-mono text-text-muted leading-relaxed max-w-2xl">
            Manifold treats every critical system as a directed causal graph.
            Pick the domain that matches yours — each page explains the
            problem, the personas, the engines in play, and a sample readout.
          </p>
        </div>
      </section>

      {/* Tile grid */}
      <Section className="py-10 md:py-14 border-t border-border">
        <TerminalHeader
          label="// PICK A DOMAIN"
          path="manifold.domains.index"
          right="CLICK ANY TILE"
        />
        <div className="grid gap-4 md:gap-5 md:grid-cols-2 lg:grid-cols-3">
          {domains.map((d) => {
            const c = colorMap[d.color];
            const isStub = d.personas.length === 0;
            return (
              <Link
                key={d.slug}
                href={`/domains/${d.slug}`}
                className={`group relative overflow-hidden bg-surface border ${c.border} rounded-lg p-6 md:p-7 hover:bg-surface-elevated transition-colors flex flex-col gap-4 min-h-[260px]`}
              >
                <div className={`absolute top-0 left-0 h-0.5 w-16 ${c.rule} opacity-80`} />
                <div className="absolute inset-0 grid-bg opacity-15 pointer-events-none" aria-hidden />

                <div className="relative flex items-center justify-between">
                  <span className="relative flex h-2 w-2">
                    <span className={`absolute inline-flex h-full w-full rounded-full ${c.bg} opacity-50 pulse-ring`} />
                    <span className={`relative inline-flex h-2 w-2 rounded-full ${c.bg}`} />
                  </span>
                  <span className={`font-mono text-[10px] tracking-wider text-text-muted/70 group-hover:${c.text} transition-colors`}>
                    EXPLORE ›
                  </span>
                </div>

                <div className="relative">
                  <div className={`font-[family-name:var(--font-michroma)] text-[9px] tracking-[0.3em] ${c.text} mb-2`}>
                    // {d.name.toUpperCase()}
                  </div>
                  <h2 className={`font-[family-name:var(--font-michroma)] text-2xl md:text-[26px] tracking-[0.04em] leading-[1.15] ${c.text} ${c.glow}`}>
                    {d.name}.
                  </h2>
                </div>

                <p className="relative text-[12.5px] md:text-[13px] font-mono text-text-muted leading-relaxed flex-1">
                  {d.tagline}
                </p>

                <div className="relative pt-3 border-t border-border/60 flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    {d.pillars.slice(0, 5).map((p) => (
                      <span
                        key={p}
                        className={`inline-flex h-5 w-5 items-center justify-center rounded border ${c.border} font-[family-name:var(--font-michroma)] text-[10px] ${c.text}`}
                      >
                        {p}
                      </span>
                    ))}
                  </div>
                  {isStub ? (
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 border border-amber-500/30 bg-amber-500/5 rounded text-[9px] font-mono text-accent-amber tracking-wider">
                      <span className="h-1 w-1 rounded-full bg-accent-amber" />
                      DRAFT
                    </span>
                  ) : (
                    <span className="font-mono text-[10px] text-text-muted/70 tracking-wider">
                      {d.engines.length} ENGINE{d.engines.length === 1 ? "" : "S"}
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      </Section>

      {/* Footer note */}
      <Section className="pt-4 pb-16 md:pb-20">
        <div className="border-t border-border pt-6 max-w-2xl">
          <p className="text-[12px] font-mono text-text-muted/80 leading-relaxed">
            Don&apos;t see your domain? Manifold&apos;s shape is general — the
            seven above are the ones with the most curated content. If your
            system is a graph and the failure modes are causal, it fits.{" "}
            <Link href="/contact" className="text-accent-cyan hover:underline">
              Get in touch
            </Link>.
          </p>
        </div>
      </Section>
    </>
  );
}
