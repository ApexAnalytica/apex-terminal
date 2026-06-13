import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Section, TerminalHeader } from "@/components/ui/Section";
import CTAButton from "@/components/ui/CTAButton";
import { OFFERS, offerCheckoutHref, isPlaceholderUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "ΩF Mini-Audit · Apex Analytica",
  description:
    "From $1,500. Causal-fragility readout on your data. LITE 3-day automated, FULL 5-day hand-delivered. No platform commitment.",
};

/**
 * /audit — landing page for the productized ΩF Mini-Audit.
 *
 * PRICING: two tiers (decided 2026-05-07 with Junaid).
 *   LITE — $1,500 — 3-day automated readout (Stripe placeholder
 *          OFFERS.auditLiteStripeUrl). For internal diagnostic /
 *          scoping.
 *   FULL — $5,000 — 5-day hand-delivered review signed by Junaid
 *          and Georgios (Stripe placeholder OFFERS.auditFullStripeUrl).
 *          For board-ready output / defensible loss numbers.
 * Until the real Stripe Payment Links are wired, both tier CTAs
 * route to /access?source=mini-audit-lite (or -full) via
 * offerCheckoutHref(); the access form picks up the source and
 * surfaces it in the email subject + body.
 *
 * COPY STATUS: Customer-facing prose in the marked sections is a
 * scaffold pending the source-of-truth spec at
 * `docs/outreach/mini-audit-offer.md`. Replace each `// COPY:`
 * block with the corresponding section from the doc before public
 * launch. The 12-page deliverable spec and fulfillment workflow
 * from the source doc are INTERNAL — do NOT publish them on this
 * page.
 *
 * Sample-report PDF preview is a "coming soon" placeholder. Junaid
 * will produce the sanitized sample later.
 */
export default function AuditPage() {
  const liteHref = offerCheckoutHref(OFFERS.auditLiteStripeUrl, "mini-audit-lite");
  const liteIsExternal = !isPlaceholderUrl(OFFERS.auditLiteStripeUrl);
  const fullHref = offerCheckoutHref(OFFERS.auditFullStripeUrl, "mini-audit-full");
  const fullIsExternal = !isPlaceholderUrl(OFFERS.auditFullStripeUrl);

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
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 border border-accent-amber/40 bg-accent-amber/5 rounded text-[10px] font-mono text-accent-amber tracking-wider">
              <span className="h-1.5 w-1.5 rounded-full bg-accent-amber pulse-ring" />
              FROM $1,500 · LITE 3-DAY · FULL 5-DAY
            </span>
          </div>

          <h1 className="font-[family-name:var(--font-michroma)] text-3xl md:text-5xl tracking-[0.04em] leading-[1.15] text-foreground max-w-3xl">
            <span className="text-accent-cyan text-glow-cyan">ΩF</span>{" "}
            Mini-Audit.
          </h1>
          <p className="mt-5 text-sm md:text-base font-mono text-text-muted leading-relaxed max-w-2xl">
            {/* COPY: replace with the hero subhead from the source doc's
                "Customer-facing one-pager" section. */}
            A causal-fragility readout on your data. We map the
            graph, score every node on five pillars, name the
            decisive ones, and hand you a report. Two tiers — a
            $1,500 automated diagnostic, or a $5,000 hand-delivered
            review signed by the team. No platform commitment.
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link
              href="#tiers"
              className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded text-[11px] font-[family-name:var(--font-michroma)] tracking-[0.25em] bg-accent-cyan/10 border border-accent-cyan/40 text-accent-cyan hover:bg-accent-cyan/20 hover:border-accent-cyan/60 transition-all glow-cyan"
            >
              <span>SEE BOTH TIERS</span>
              <span aria-hidden>›</span>
            </Link>
            <Link
              href="#what-you-get"
              className="font-[family-name:var(--font-michroma)] text-[10px] tracking-[0.3em] text-text-muted hover:text-foreground transition-colors"
            >
              WHAT&apos;S IN A READOUT ›
            </Link>
          </div>

          <p className="mt-4 text-[11px] font-mono text-text-muted/70 leading-relaxed max-w-xl">
            {/* COPY: post-payment flow blurb from source doc. */}
            After payment you&apos;ll be redirected to a short
            intake form to upload your data. Lite delivers in 3
            business days; Full in 5.
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
            title="3 pages (Lite) / 12 pages (Full)"
            blurb="Lite: a 3-page exec summary with the headline numbers. Full: a 12-page report with executive summary, technical narrative, and appendix — signed by the team."
          />
        </div>
      </Section>

      {/* Tiers — pick LITE or FULL */}
      <Section id="tiers" className="py-10 md:py-14 border-t border-border">
        <TerminalHeader
          label="// CHOOSE YOUR DEPTH"
          right="TWO PRICE POINTS"
          color="amber"
        />
        <p className="mb-6 text-[13px] md:text-sm font-mono text-text-muted leading-relaxed max-w-2xl">
          Same underlying engine, two ways to buy. Lite is a fast,
          algorithmic diagnostic — best for internal scoping. Full
          is hand-delivered, signed, and built for board-ready
          decisions.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          {/* LITE */}
          <div className="bg-surface-elevated border border-border rounded-lg p-6 md:p-7 flex flex-col gap-4 hover:bg-surface transition-colors">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-[family-name:var(--font-michroma)] text-[10px] tracking-[0.3em] text-text-muted">
                LITE
              </span>
              <span className="font-[family-name:var(--font-michroma)] text-[9px] tracking-[0.25em] text-accent-amber/80">
                3-DAY · AUTOMATED
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="font-[family-name:var(--font-michroma)] text-3xl md:text-4xl text-foreground leading-none">
                $1,500
              </span>
              <span className="font-mono text-[11px] text-text-muted/80">flat</span>
            </div>
            <p className="text-[12.5px] font-mono text-text-muted leading-relaxed">
              Algorithmic readout on your data. Best for an internal
              diagnostic, scoping a deeper engagement, or evaluating
              Manifold before institutional commitment.
            </p>
            <ul className="space-y-1.5 flex-1 pt-2 border-t border-border/60">
              {[
                "Causal graph mapped from your data",
                "ΩF score on every node, all 5 pillars",
                "Top-3 decisive nodes named",
                "3-page executive summary (PDF)",
                "3 business days",
              ].map((item) => (
                <li
                  key={item}
                  className="flex gap-2 text-[12px] font-mono text-foreground/85 leading-relaxed"
                >
                  <span className="text-accent-cyan/70 mt-0.5 shrink-0">·</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <CTAButton
              href={liteHref}
              external={liteIsExternal}
              variant="secondary"
              className="w-full"
            >
              ORDER LITE — $1,500
            </CTAButton>
          </div>

          {/* FULL */}
          <div className="bg-accent-cyan/[0.04] border border-accent-cyan/40 rounded-lg p-6 md:p-7 flex flex-col gap-4 hover:bg-accent-cyan/[0.08] transition-colors relative">
            <span className="absolute top-0 right-4 -translate-y-1/2 px-2 py-0.5 bg-accent-cyan/15 border border-accent-cyan/50 rounded text-[9px] font-[family-name:var(--font-michroma)] tracking-[0.25em] text-accent-cyan">
              RECOMMENDED
            </span>
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-[family-name:var(--font-michroma)] text-[10px] tracking-[0.3em] text-accent-cyan">
                FULL
              </span>
              <span className="font-[family-name:var(--font-michroma)] text-[9px] tracking-[0.25em] text-accent-cyan/80">
                5-DAY · HAND-DELIVERED
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="font-[family-name:var(--font-michroma)] text-3xl md:text-4xl text-foreground leading-none">
                $5,000
              </span>
              <span className="font-mono text-[11px] text-text-muted/80">flat</span>
            </div>
            <p className="text-[12.5px] font-mono text-text-muted leading-relaxed">
              Hand-delivered review, signed by Junaid Ghauri and
              Georgios Korpas. Best for board-ready output,
              defensible loss numbers, or evaluating partnership
              terms.
            </p>
            <ul className="space-y-1.5 flex-1 pt-2 border-t border-accent-cyan/20">
              {[
                "Everything in Lite, plus:",
                "Counterfactual stress-test on the top-3 nodes",
                "12-page report with executive summary + technical narrative",
                "Custom recommendations and follow-on roadmap",
                "Signed by Junaid Ghauri + Georgios Korpas",
                "5 business days",
              ].map((item, i) => (
                <li
                  key={item}
                  className={`flex gap-2 text-[12px] font-mono leading-relaxed ${
                    i === 0 ? "text-accent-cyan/90" : "text-foreground/85"
                  }`}
                >
                  <span className="text-accent-cyan/70 mt-0.5 shrink-0">·</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <CTAButton
              href={fullHref}
              external={fullIsExternal}
              className="w-full"
            >
              ORDER FULL — $5,000
            </CTAButton>
          </div>
        </div>

        <p className="mt-5 text-[11px] font-mono text-text-muted/80 leading-relaxed">
          Either tier credits 100% toward the first year of an
          institutional Manifold seat if you sign within 90 days of
          delivery.
        </p>
      </Section>

      {/* Sample report preview */}
      <Section className="py-10 md:py-14 border-t border-border">
        <TerminalHeader
          label="// SAMPLE READOUT"
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

          {/* Sample-report PDF preview — option A from the strategic
              call (mock spread inline as SVG). Option B (hand-laid
              real PDF on a synthetic 47-node manufacturing supplier
              graph) is queued for follow-up. */}
          <SampleReportSpread />
        </div>
      </Section>

      {/* Team */}
      <Section className="py-10 md:py-14 border-t border-border">
        <TerminalHeader
          label="// WHO YOU'RE WORKING WITH"
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
              From $1,500. Pick your tier.
            </h3>
            <p className="text-[12.5px] font-mono text-text-muted leading-relaxed">
              {/* COPY: closing nudge from the source doc. */}
              No platform commitment. Either tier credits toward an
              institutional seat if you sign within 90 days. If the
              audit lands well, talk to us about a Founding seat or
              a full engagement.
            </p>
          </div>
          <div className="flex flex-col gap-3 shrink-0">
            <CTAButton href={fullHref} external={fullIsExternal}>
              ORDER FULL — $5,000
            </CTAButton>
            <CTAButton href={liteHref} external={liteIsExternal} variant="secondary">
              OR · ORDER LITE — $1,500
            </CTAButton>
            <Link
              href="/founding"
              className="font-[family-name:var(--font-michroma)] text-[10px] tracking-[0.3em] text-text-muted/70 hover:text-foreground inline-flex items-center justify-center gap-2 pt-1"
            >
              <span>SEE FOUNDING 10</span>
              <span aria-hidden>›</span>
            </Link>
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

/**
 * SampleReportSpread — inline-SVG mock of the audit's first two
 * pages (cover + first content page) styled with the site's brand
 * tokens. This is option A from the strategic call: a "feels real"
 * preview to fill the slot until option B (a hand-laid sanitized
 * PDF on a real synthetic graph) is produced.
 *
 * The numbers below are illustrative — they line up to a fictional
 * 47-node manufacturing supplier graph with FAB · TSMC ARIZONA-1
 * as the top-fragility node (matches the sample-readout entry that
 * already lives in the manufacturing domain page for visual
 * consistency).
 */
function SampleReportSpread() {
  return (
    <div className="relative bg-surface-elevated border border-border rounded-lg p-5 md:p-6">
      <div className="grid gap-3 grid-cols-2">
        {/* Page 1 — cover */}
        <div className="relative aspect-[3/4] bg-background border border-border rounded shadow-[0_8px_24px_rgba(0,0,0,0.5)] overflow-hidden">
          <div className="absolute inset-0 grid-bg opacity-25 pointer-events-none" aria-hidden />
          <div className="relative h-full flex flex-col justify-between p-3 md:p-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <div className="h-1.5 w-1.5 rounded-full bg-accent-cyan" />
                <div className="font-[family-name:var(--font-michroma)] text-[6px] md:text-[7px] tracking-[0.3em] text-accent-cyan">
                  APEX ANALYTICA
                </div>
              </div>
              <div className="font-[family-name:var(--font-michroma)] text-[6px] tracking-[0.25em] text-text-muted/70">
                ΩF MINI-AUDIT · CONFIDENTIAL
              </div>
            </div>

            <div className="space-y-2.5">
              <div className="font-[family-name:var(--font-michroma)] text-[14px] md:text-[18px] tracking-[0.04em] text-foreground leading-[1.05]">
                Manufacturing
                <br />
                supplier graph
                <br />
                <span className="text-accent-cyan">readout.</span>
              </div>
              <div className="h-px w-12 bg-accent-cyan/60" />
              <div className="space-y-0.5 font-mono text-[7px] md:text-[8px] text-text-muted">
                <div>PREPARED FOR: ACME INDUSTRIAL CO.</div>
                <div>GRAPH: 47 nodes · 89 edges</div>
                <div>DELIVERED: MAY 2026</div>
              </div>
            </div>

            <div className="flex items-end justify-between gap-2 pt-2 border-t border-border/60">
              <div className="font-mono text-[6px] md:text-[7px] text-text-muted/70 tracking-wider">
                manifold.audit
              </div>
              <div className="font-[family-name:var(--font-michroma)] text-[6px] md:text-[7px] tracking-[0.2em] text-text-muted/70">
                01 / 12
              </div>
            </div>
          </div>
        </div>

        {/* Page 2 — top fragility node + ΩF breakdown */}
        <div className="relative aspect-[3/4] bg-background border border-border rounded shadow-[0_8px_24px_rgba(0,0,0,0.5)] overflow-hidden">
          <div className="absolute inset-0 grid-bg opacity-25 pointer-events-none" aria-hidden />
          <div className="relative h-full flex flex-col p-3 md:p-4 gap-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <div className="font-[family-name:var(--font-michroma)] text-[6px] md:text-[7px] tracking-[0.25em] text-accent-cyan">
                  // TOP FRAGILITY
                </div>
              </div>
              <div className="font-[family-name:var(--font-michroma)] text-[6px] tracking-[0.2em] text-text-muted/70">
                03 / 12
              </div>
            </div>

            <div className="space-y-1">
              <div className="font-[family-name:var(--font-michroma)] text-[7px] md:text-[8px] tracking-[0.2em] text-text-muted">
                NODE
              </div>
              <div className="font-[family-name:var(--font-michroma)] text-[10px] md:text-[12px] tracking-[0.05em] text-foreground leading-tight">
                FAB · TSMC
                <br />
                ARIZONA-1
              </div>
            </div>

            <div className="grid grid-cols-[auto_1fr_auto] items-center gap-x-2 gap-y-1 pt-1 border-t border-border/60">
              <div className="col-span-3 font-[family-name:var(--font-michroma)] text-[6px] md:text-[7px] tracking-[0.2em] text-text-muted">
                ΩF · 7.42 / 10
              </div>
              {[
                { p: "I", v: 9.1, color: "bg-accent-cyan" },
                { p: "R", v: 8.4, color: "bg-accent-green" },
                { p: "J", v: 7.8, color: "bg-accent-red" },
                { p: "C", v: 7.2, color: "bg-accent-purple" },
                { p: "T", v: 4.6, color: "bg-accent-amber" },
              ].map((row) => (
                <PillarRow key={row.p} {...row} />
              ))}
            </div>

            <div className="mt-auto space-y-1 pt-2 border-t border-border/60">
              <div className="font-[family-name:var(--font-michroma)] text-[6px] tracking-[0.2em] text-text-muted/80">
                COUNTERFACTUAL
              </div>
              <div className="font-mono text-[7px] md:text-[8px] text-foreground/85 leading-snug">
                90-day outage cascades to{" "}
                <span className="text-accent-amber">37 downstream nodes</span>.
                Estimated value-at-risk: $2.1B.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Caption */}
      <div className="mt-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="font-mono text-[10.5px] text-text-muted/80 leading-relaxed">
          <span className="text-text-muted">Stylized preview</span> —
          actual readout is delivered as a PDF on your data, with
          your node names and your numbers.
        </div>
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 border border-border rounded text-[9px] font-mono text-text-muted/70 tracking-wider">
          PREVIEW · NOT REAL DATA
        </span>
      </div>
    </div>
  );
}

function PillarRow({
  p,
  v,
  color,
}: {
  p: string;
  v: number;
  color: string;
}) {
  return (
    <>
      <span className="font-[family-name:var(--font-michroma)] text-[9px] md:text-[10px] text-foreground leading-none">
        {p}
      </span>
      <div className="h-1 bg-surface border border-border rounded-full overflow-hidden">
        <div
          className={`h-full ${color}`}
          style={{ width: `${v * 10}%`, opacity: 0.85 }}
        />
      </div>
      <span className="font-mono text-[7px] md:text-[8px] text-foreground/85 tabular-nums">
        {v.toFixed(1)}
      </span>
    </>
  );
}

/* ───────── placeholder content ─────────
   COPY: Replace TRUST_PARTNERS / AUDIT_TEAM / FAQ_PLACEHOLDERS
   below with content drawn from the source-of-truth spec at
   `docs/outreach/mini-audit-offer.md`. */

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
    q: "What's the difference between Lite and Full?",
    a: "Lite ($1,500) is a 3-day automated readout — algorithmic ΩF score on every node, top-3 decisive nodes named, 3-page executive summary. Best for an internal diagnostic. Full ($5,000) is a 5-day hand-delivered review signed by Junaid and Georgios — adds counterfactual stress-tests on the top-3 nodes, custom recommendations, and a 12-page report with technical narrative. Best for board-ready output.",
  },
  {
    q: "Which tier should I order?",
    a: "If you're scoping internally or evaluating whether Manifold is a fit, Lite is the right entry point. If you need a defensible loss number for a board, a regulator, or a partner conversation, order Full — the hand-delivered narrative and team signatures are the difference.",
  },
  {
    q: "What data do I need to send?",
    a: "One CSV per layer of your graph (nodes + edges). The intake form walks you through the shape. We have templates for manufacturing, finance, and infrastructure.",
  },
  {
    q: "What if my data isn't tabular?",
    a: "Get in touch first — for non-tabular data we either scope a brief data-prep step or recommend you start with the institutional engagement.",
  },
  {
    q: "Is the Full readout signed by the team?",
    a: "Yes. For Full, Junaid and Georgios both review and sign. The 12-page report includes a one-page executive summary you can hand to a board. Lite is algorithmic and unsigned by design — that's part of why the price is lower.",
  },
  {
    q: "Can I credit this toward an institutional seat?",
    a: "Yes — both tiers. The audit is invoiced as a fixed-price engagement and credits 100% toward your first year of an institutional seat if you sign within 90 days of delivery.",
  },
];
