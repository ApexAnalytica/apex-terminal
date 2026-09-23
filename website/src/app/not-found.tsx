import Link from "next/link";
import { Section, TerminalHeader } from "@/components/ui/Section";
import CTAButton from "@/components/ui/CTAButton";

export default function NotFound() {
  return (
    <>
      {/* Header */}
      <section className="relative border-b border-border overflow-hidden">
        <div className="absolute inset-0 grid-bg opacity-40 mask-fade-edges" aria-hidden />
        <div className="relative mx-auto max-w-7xl px-4 md:px-6 pt-16 pb-12 md:pt-20 md:pb-14">
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <span className="font-[family-name:var(--font-michroma)] text-[10px] tracking-[0.3em] text-accent-red/90">
              // 404
            </span>
            <span className="font-mono text-[10px] text-text-muted/60">
              apex.routing.miss
            </span>
            <span className="text-text-muted/40">·</span>
            <span className="font-mono text-[10px] text-text-muted/60">
              NODE NOT FOUND
            </span>
          </div>
          <h1 className="font-[family-name:var(--font-michroma)] text-3xl md:text-5xl tracking-[0.04em] leading-[1.15] text-foreground max-w-3xl">
            Off the{" "}
            <span className="text-accent-red text-glow-amber">graph.</span>
          </h1>
          <p className="mt-5 text-sm md:text-base font-mono text-text-muted leading-relaxed max-w-2xl">
            That route isn&apos;t in the topology. It might have moved, the
            URL might be a typo, or the page hasn&apos;t been built yet.
            Pick a known node below.
          </p>
        </div>
      </section>

      {/* Quick links */}
      <Section className="py-10 md:py-14 border-t border-border">
        <TerminalHeader
          label="// KNOWN NODES"
          right="PICK ONE"
        />
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <NodeLink
            href="/"
            label="HOME"
            blurb="Causal intelligence for critical systems."
          />
          <NodeLink
            href="/domains"
            label="DOMAINS"
            blurb="Seven domains where Manifold maps fragility."
          />
          <NodeLink
            href="/product"
            label="PRODUCT"
            blurb="The platform: engines, capabilities, readouts."
          />
          <NodeLink
            href="/framework"
            label="FRAMEWORK"
            blurb="The ΩF pillars and how they're computed."
          />
          <NodeLink
            href="/team"
            label="TEAM"
            blurb="The people behind Apex Analytica."
          />
          <NodeLink
            href="/contact"
            label="CONTACT"
            blurb="General, access, partnerships, research."
          />
          <NodeLink
            href="/access"
            label="REQUEST ACCESS"
            blurb="Submit an invite request — we route within 1 day."
            highlight
          />
        </div>
      </Section>

      {/* CTA */}
      <Section className="py-10 md:py-14 border-t border-border">
        <div className="bg-surface border border-accent-cyan/20 rounded-lg p-6 md:p-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-xl">
            <div className="font-mono text-[10px] tracking-[0.2em] text-accent-cyan">
              // STILL LOST?
            </div>
            <h3 className="font-[family-name:var(--font-michroma)] text-2xl md:text-3xl tracking-[0.06em] text-foreground leading-[1.25]">
              Tell us what you were looking for.
            </h3>
            <p className="text-[12.5px] font-mono text-text-muted leading-relaxed">
              We&apos;ll point you at the right page or follow up with the
              right person.
            </p>
          </div>
          <div className="flex flex-col gap-3 shrink-0">
            <CTAButton href="/contact">CONTACT US</CTAButton>
            <CTAButton href="/" variant="secondary">BACK TO HOME</CTAButton>
          </div>
        </div>
      </Section>
    </>
  );
}

function NodeLink({
  href,
  label,
  blurb,
  highlight = false,
}: {
  href: string;
  label: string;
  blurb: string;
  highlight?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`group relative bg-surface border ${
        highlight ? "border-accent-cyan/30" : "border-border"
      } rounded-lg p-5 hover:bg-surface-elevated transition-colors flex flex-col gap-3 min-h-[140px]`}
    >
      <div className="flex items-center justify-between">
        <span className="relative flex h-1.5 w-1.5">
          <span
            className={`absolute inline-flex h-full w-full rounded-full ${
              highlight ? "bg-accent-cyan" : "bg-text-muted"
            } opacity-50 pulse-ring`}
          />
          <span
            className={`relative inline-flex h-1.5 w-1.5 rounded-full ${
              highlight ? "bg-accent-cyan" : "bg-text-muted"
            }`}
          />
        </span>
        <span
          className={`font-mono text-[10px] tracking-wider transition-colors ${
            highlight
              ? "text-accent-cyan/80"
              : "text-text-muted/60 group-hover:text-foreground"
          }`}
        >
          ›
        </span>
      </div>
      <div
        className={`font-[family-name:var(--font-michroma)] text-[11px] tracking-[0.25em] flex-1 ${
          highlight ? "text-accent-cyan" : "text-foreground"
        }`}
      >
        {label}
      </div>
      <p className="text-[11.5px] font-mono text-text-muted leading-snug">
        {blurb}
      </p>
    </Link>
  );
}
