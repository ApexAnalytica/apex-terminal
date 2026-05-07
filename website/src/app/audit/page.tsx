import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Section, TerminalHeader } from "@/components/ui/Section";
import CTAButton from "@/components/ui/CTAButton";
import { OFFERS, offerCheckoutHref, isPlaceholderUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "ΩF Mini-Audit · Apex Analytica",
  description:
    "$1,500 flat. Five-day causal-fragility readout on your data. No platform commitment.",
};

/**
 * /audit — landing page for the productized ΩF Mini-Audit.
 *
 * COPY STATUS: Customer-facing prose in the marked sections is a
 * scaffold pending the source-of-truth spec at
 * `docs/outreach/mini-audit-offer.md`. Replace each `[COPY: ...]`
 * block with the corresponding section from the doc before public
 * launch. The 12-page deliverable spec and fulfillment workflow
 * from the source doc are INTERNAL — do NOT publish them on this
 * page.
 *
 * Pricing: $1,500 flat, single price, no tiers.
 *
 * Stripe Payment Link: placeholder
 * `STRIPE_PAYMENT_LINK_AUDIT_TBD` from `lib/site.ts`. After payment,
 * post-payment redirect goes to `TALLY_INTAKE_FORM_TBD` for CSV
 * upload. Junaid swaps both URLs in after Stripe + Tally are wired.
 *
 * Sample-report PDF preview is a "coming soon" placeholder. Junaid
 * will produce the sanitized sample later.
 */
export default function AuditPage() {
  // Until Junaid wires the real Stripe Payment Link, route the
  // ORDER AUDIT CTAs at /access?source=mini-audit. Once the URL is
  // dropped into OFFERS.auditStripeUrl, this resolves to the real
  // Stripe URL and the button becomes external.
  const orderHref = offerCheckoutHref(OFFERS.auditStripeUrl, "mini-audit");
  const orderIsExternal = !isPlaceholderUrl(OFFERS.auditStripeUrl);

  return (
    <>
      {/* Hero */}
      <section className="relative border-b border-border overflow-hidden">
        <div className="absolute inset-0 grid-bg opacity-40 mask-fade-edges" aria-hidden />
        <div className="relative mx-auto max-w-7xl px-4 md:px-6 pt-16 pb-14 md:pt-20 md:pb-16">
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <span className="font-[family-name:var(--font-michroma)] text-[10px] tracking-[0.3em] text-accent-cyan/90">
              // ΩF MINI-AUDIT
            </span>
            <span className="font-mono text-[10px] text-text-muted/60">
              apex.audit
            </span>
            <span className="text-text-muted/40">·</span>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 border border-accent-amber/40 bg-accent-amber/5 rounded text-[10px] font-mono text-accent-amber tracking-wider">
              <span className="h-1.5 w-1.5 rounded-full bg-accent-amber pulse-ring" />
              5-DAY READOUT · $1,500 FLAT
            </span>
          </div>

          <h1 className="font-[family-name:var(--font-michroma)] text-3xl md:text-5xl tracking-[0.04em] leading-[1.15] text-foreground max-w-3xl">
            <span className="text-accent-cyan text-glow-cyan">ΩF</span>{" "}
            Mini-Audit.
          </h1>
          <p className="mt-5 text-sm md:text-base font-mono text-text-muted leading-relaxed max-w-2xl">
            {/* COPY: replace with the hero subhead from the source doc's
                "Customer-facing one-pager" section. */}
            A 5-day causal-fragility readout on your data. We map the
            graph, score every node on five pillars, name the
            decisive ones, and hand you a 12-page report. $1,500
            flat. No platform commitment.
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <CTAButton href={orderHref} external={orderIsExternal}>
              ORDER AUDIT — $1,500
            </CTAButton>
            <Link
              href="#what-you-get"
              className="font-[family-name:var(--font-michroma)] text-[10px] tracking-[0.3em] text-text-muted hover:text-foreground transition-colors"
            >
              WHAT YOU GET ›
            </Link>
          </div>

          <p className="mt-4 text-[11px] font-mono text-text-muted/70 leading-relaxed max-w-xl">
            {/* COPY: post-payment flow blurb from source doc. */}
            After payment you&apos;ll be redirected to a short
            intake form to upload your data. Readout delivered
            within 5 business days.
          </p>
        </div>
      </section>

      {/* Trust bar */}
      <Section className="py-8 md:py-10 border-t border-border">
        <div className="grid gap-px bg-border border border-border rounded-lg overflow-hidden md:grid-cols-3">
          {TRUST_PARTNERS.map((p) => (
            <div
              key={p.name}
              className="bg-surface-elevated px-8 py-7 flex items-center justify-center hover:bg-surface transition-colors min-h-[110px]"
              title={p.name}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.logo}
                alt={p.alt}
                width={p.naturalW}
                height={p.naturalH}
                className="opacity-80 hover:opacity-100 transition-opacity"
                style={{
                  height: 36,
                  width: (36 * p.naturalW) / p.naturalH,
                  ...(p.mono ? { filter: "brightness(0) invert(1)" } : {}),
                }}
              />
            </div>
          ))}
        </div>
      </Section>

      {/* What you get */}
      <Section
        id="what-you-get"
        className="py-10 md:py-14 border-t border-border"
      >
        <TerminalHeader
          label="// WHAT YOU GET"
          path="apex.audit.deliverable"
          right="12-PAGE READOUT"
        />
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          {/* COPY: replace each tile with the corresponding bullet from
              the source doc's "Customer-facing one-pager" deliverable
              summary. Keep the visual structure (label / title /
              short blurb). */}
          <DeliverableTile
            label="01 · MAP"
            title="Your causal graph"
            blurb="We ingest your data and surface the actual dependency network — the one your ops databases imply but your dashboards don't."
          />
          <DeliverableTile
            label="02 · SCORE"
            title="ΩF on every node"
            blurb="Five pillars (I, R, J, C, T) computed per node. Decisive nodes ranked. Tail-depth quantified."
          />
          <DeliverableTile
            label="03 · STRESS-TEST"
            title="Counterfactual on the top 3"
            blurb="What happens if the top-three decisive nodes fail? Cascade simulation, restoration latency, and a defensible loss number."
          />
          <DeliverableTile
            label="04 · REPORT"
            title="12 pages, plain English"
            blurb="The graph, the scores, the counterfactuals, and a one-page executive summary you can hand to a board."
          />
        </div>
      </Section>

      {/* Sample report preview */}
      <Section className="py-10 md:py-14 border-t border-border">
        <TerminalHeader
          label="// SAMPLE READOUT"
          path="apex.audit.sample"
          right="REDACTED PREVIEW"
          color="amber"
        />
        <div className="grid gap-5 md:grid-cols-[1.4fr_1fr] items-stretch">
          <div className="bg-surface-elevated border border-border rounded-lg p-6 md:p-8 space-y-3">
            {/* COPY: short narrative about what the sample shows.
                Pulls from the source doc's preview-section text. */}
            <h3 className="font-[family-name:var(--font-michroma)] text-lg tracking-[0.06em] text-foreground">
              What the report looks like.
            </h3>
            <p className="text-[12.5px] font-mono text-foreground/85 leading-relaxed">
              A redacted sample on a 47-node manufacturing supplier
              graph. The full version comes back with your actual
              data, your actual node names, and a 12-page narrative
              you can hand to a CRO or a board.
            </p>
            <p className="text-[12px] font-mono text-text-muted leading-relaxed">
              {/* COPY: the sanitized sample link copy from the source doc. */}
              The sanitized PDF lands here once it&apos;s reviewed.
            </p>
          </div>

          {/* Placeholder for the sample-report PDF preview. Replace
              with a real preview image once the sanitized PDF is
              produced. */}
          <div className="relative bg-surface-elevated border border-dashed border-border rounded-lg flex items-center justify-center min-h-[220px] p-6">
            <div className="absolute inset-0 grid-bg opacity-20 pointer-events-none" aria-hidden />
            <div className="relative text-center space-y-2">
              <div className="font-[family-name:var(--font-michroma)] text-[10px] tracking-[0.3em] text-text-muted">
                SAMPLE PDF
              </div>
              <div className="font-mono text-[12px] text-text-muted/80">
                Preview coming soon
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* Team */}
      <Section className="py-10 md:py-14 border-t border-border">
        <TerminalHeader
          label="// WHO YOU'RE WORKING WITH"
          path="apex.audit.team"
          right="2 OF 3"
          color="purple"
        />
        <div className="grid gap-3 md:grid-cols-2">
          {AUDIT_TEAM.map((p) => (
            <div
              key={p.name}
              className="bg-surface-elevated border border-border rounded-lg p-5 flex gap-4 hover:bg-surface transition-colors"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.photo}
                alt={p.name}
                width={64}
                height={64}
                className="rounded-md object-cover h-16 w-16 shrink-0"
              />
              <div className="space-y-1.5">
                <div className="font-[family-name:var(--font-michroma)] text-[14px] tracking-[0.04em] text-foreground leading-tight">
                  {p.name}
                </div>
                <div className="font-mono text-[10px] text-accent-cyan/80 tracking-wider uppercase">
                  {p.role}
                </div>
                <p className="text-[12px] font-mono text-text-muted leading-relaxed">
                  {p.blurb}
                </p>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-4 text-[11px] font-mono text-text-muted/70">
          See the full team and advisors on{" "}
          <Link href="/team" className="text-accent-cyan hover:underline">
            /team
          </Link>
          .
        </p>
      </Section>

      {/* FAQ */}
      <Section className="py-10 md:py-14 border-t border-border">
        <TerminalHeader
          label="// FAQ"
          path="apex.audit.faq"
          right="COMMON QUESTIONS"
          color="green"
        />
        <div className="space-y-3 max-w-3xl">
          {FAQ_PLACEHOLDERS.map((qa) => (
            <FaqItem key={qa.q} q={qa.q} a={qa.a} />
          ))}
          <p className="text-[11px] font-mono text-text-muted/70 leading-relaxed pt-2">
            Have a question we didn&apos;t answer?{" "}
            <Link href="/contact" className="text-accent-cyan hover:underline">
              Get in touch
            </Link>
            .
          </p>
        </div>
      </Section>

      {/* Final CTA */}
      <Section className="py-12 md:py-16 border-t border-border">
        <div className="bg-surface border border-accent-cyan/30 rounded-lg p-6 md:p-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-xl">
            <div className="font-mono text-[10px] tracking-[0.2em] text-accent-cyan/80">
              // ORDER AUDIT
            </div>
            <h3 className="font-[family-name:var(--font-michroma)] text-2xl md:text-3xl tracking-[0.06em] text-foreground leading-[1.25]">
              $1,500 flat. Readout in 5 business days.
            </h3>
            <p className="text-[12.5px] font-mono text-text-muted leading-relaxed">
              {/* COPY: closing nudge from the source doc. */}
              No platform commitment. If the audit lands well, talk
              to us about a Founding seat or a full institutional
              engagement.
            </p>
          </div>
          <div className="flex flex-col gap-3 shrink-0">
            <CTAButton href={orderHref} external={orderIsExternal}>
              ORDER AUDIT — $1,500
            </CTAButton>
            <CTAButton href="/founding" variant="secondary">
              OR · SEE FOUNDING 10
            </CTAButton>
          </div>
        </div>
      </Section>
    </>
  );
}

/* ───────── pieces ───────── */

function DeliverableTile({
  label,
  title,
  blurb,
}: {
  label: string;
  title: string;
  blurb: string;
}) {
  return (
    <div className="bg-surface-elevated border border-border rounded-lg p-5 flex flex-col gap-3 hover:bg-surface transition-colors">
      <div className="font-[family-name:var(--font-michroma)] text-[9px] tracking-[0.3em] text-accent-cyan/80">
        {label}
      </div>
      <div className="font-[family-name:var(--font-michroma)] text-[14px] tracking-[0.04em] text-foreground leading-tight">
        {title}
      </div>
      <p className="text-[12px] font-mono text-text-muted leading-relaxed">
        {blurb}
      </p>
    </div>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  return (
    <details className="group bg-surface-elevated border border-border rounded-lg open:border-accent-cyan/30 transition-colors">
      <summary className="cursor-pointer list-none flex items-center justify-between gap-4 px-5 py-4 font-[family-name:var(--font-michroma)] text-[11px] tracking-[0.15em] text-foreground">
        <span>{q}</span>
        <span className="text-accent-cyan/60 group-open:rotate-90 transition-transform">
          ›
        </span>
      </summary>
      <div className="px-5 pb-5 text-[12.5px] font-mono text-text-muted leading-relaxed">
        {a}
      </div>
    </details>
  );
}

/* ───────── placeholder content ─────────
   COPY: Replace TRUST_PARTNERS / AUDIT_TEAM / FAQ_PLACEHOLDERS
   below with content drawn from the source-of-truth spec at
   `docs/outreach/mini-audit-offer.md`. Photo paths for AUDIT_TEAM
   should match what's already in /team — I'm using the apexanalytica.co
   hosted versions to stay consistent with the team page. */

const TRUST_PARTNERS = [
  { name: "AWS", logo: "/partners/aws.svg", alt: "Amazon Web Services", naturalW: 304, naturalH: 182, mono: true },
  { name: "JOHNS HOPKINS UNIVERSITY", logo: "/partners/jhu.svg", alt: "Johns Hopkins University", naturalW: 375, naturalH: 65, mono: true },
  { name: "NVIDIA", logo: "/partners/nvidia.svg", alt: "NVIDIA", naturalW: 656, naturalH: 120, mono: false },
];

const AUDIT_TEAM = [
  {
    name: "Dr. Junaid Ghauri",
    role: "Principal Scientist · CEO",
    blurb:
      "Doctor of Engineering, Johns Hopkins. Computational mathematics, advanced analytics, quantitative finance.",
    photo: "/team/junaid.png",
  },
  {
    name: "Dr. Georgios Korpas",
    role: "Head of Research",
    blurb:
      "PhD, Trinity College Dublin. Quantum algorithms, hybrid optimization, applied mathematics.",
    photo: "/team/gergios.png",
  },
];

const FAQ_PLACEHOLDERS = [
  {
    q: "What data do I need to send?",
    a: "One CSV per layer of your graph (nodes + edges). The intake form walks you through the shape. We have templates for manufacturing, finance, and infrastructure.",
  },
  {
    q: "What if my data isn't tabular?",
    a: "Get in touch first — for non-tabular data we either scope a brief data-prep step or recommend you start with the institutional engagement.",
  },
  {
    q: "Is the readout signed by the team?",
    a: "Yes. Junaid and Georgios both review and sign. The 12-page report includes a one-page executive summary you can hand to a board.",
  },
  {
    q: "Can I expense this and use it as a pilot?",
    a: "Yes. The audit is invoiced as a fixed-price engagement and credits toward your first year of an institutional seat if you sign within 90 days.",
  },
];
