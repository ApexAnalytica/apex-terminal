import type { Metadata } from "next";
import Link from "next/link";
import { Section, TerminalHeader } from "@/components/ui/Section";
import CTAButton from "@/components/ui/CTAButton";
import { OFFERS, offerCheckoutHref, isPlaceholderUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Founding 10 · Apex Analytica",
  description:
    "Ten seats at founding pricing — $1,500 for year one, locked at $9,000/year forever. Six left.",
};

/**
 * /founding — landing page for the time-bound Founding 10 offer.
 *
 * COPY STATUS: Customer-facing prose in the marked sections is a
 * scaffold pending the source-of-truth spec at
 * `docs/outreach/founding-member-offer.md`. Replace each
 * `[COPY: ...]` block with the corresponding section from the doc
 * before public launch.
 *
 * Pricing default per the spec: Option A — $1,500 year 1, locked
 * at $9,000/year forever. Junaid will confirm if a different
 * structure (B or C) is selected before launch.
 *
 * Stripe Payment Link is the placeholder
 * `STRIPE_PAYMENT_LINK_FOUNDING_TBD` from `lib/site.ts` — swap in
 * the real URL after Stripe is wired.
 *
 * Seat counter is hardcoded `foundingSeatsLeft` from `lib/site.ts`
 * (currently 6). The upgrade-to-live-counter path is documented in
 * the source spec; do NOT swap to a live counter without that work.
 */
export default function FoundingPage() {
  const seatsLeft = OFFERS.foundingSeatsLeft;
  const totalSeats = OFFERS.foundingTotalSeats;
  const soldOut = seatsLeft <= 0;

  // Until Junaid wires the real Stripe Payment Link, route the
  // primary CTA at /access?source=founding-10 (working form). After
  // the URL is dropped into OFFERS.foundingStripeUrl, this resolves
  // to the real Stripe URL and the button becomes external.
  const claimHref = offerCheckoutHref(OFFERS.foundingStripeUrl, "founding-10");
  const claimIsExternal = !isPlaceholderUrl(OFFERS.foundingStripeUrl);

  return (
    <>
      {/* Hero */}
      <section className="relative border-b border-border overflow-hidden">
        <div className="absolute inset-0 grid-bg opacity-40 mask-fade-edges" aria-hidden />
        <div className="relative mx-auto max-w-7xl px-4 md:px-6 pt-16 pb-14 md:pt-20 md:pb-16">
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <span className="font-[family-name:var(--font-michroma)] text-[10px] tracking-[0.3em] text-accent-cyan/90">
              // FOUNDING 10
            </span>
            <span className="font-mono text-[10px] text-text-muted/60">
              apex.founding
            </span>
            <span className="text-text-muted/40">·</span>
            <SeatBadge seatsLeft={seatsLeft} totalSeats={totalSeats} />
          </div>
          <h1 className="font-[family-name:var(--font-michroma)] text-3xl md:text-5xl tracking-[0.04em] leading-[1.15] text-foreground max-w-3xl">
            Ten founding seats.{" "}
            <span className="text-accent-cyan text-glow-cyan">Locked forever.</span>
          </h1>
          <p className="mt-5 text-sm md:text-base font-mono text-text-muted leading-relaxed max-w-2xl">
            {/* COPY: replace with the hero subhead from the source doc's
                "Customer-facing copy" section. */}
            $1,500 for year one. $9,000 per year, locked at that rate
            forever, after that. Ten seats total. Once they&apos;re
            gone, this price doesn&apos;t come back.
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            {!soldOut ? (
              <CTAButton href={claimHref} external={claimIsExternal}>
                CLAIM A FOUNDING SEAT
              </CTAButton>
            ) : (
              <CTAButton href="/access" variant="secondary">
                JOIN THE WAITLIST
              </CTAButton>
            )}
            <Link
              href="#what-you-get"
              className="font-[family-name:var(--font-michroma)] text-[10px] tracking-[0.3em] text-text-muted hover:text-foreground transition-colors"
            >
              WHAT&apos;S INCLUDED ›
            </Link>
          </div>

          {soldOut && (
            <p className="mt-5 text-[12.5px] font-mono text-text-muted leading-relaxed max-w-xl">
              {/* COPY: failsafe-when-zero copy from the source doc. */}
              All ten founding seats are taken. Join the waitlist and
              we&apos;ll reach out if a seat opens up — otherwise the
              next opportunity to lock institutional pricing is the
              first renewal cycle.
            </p>
          )}
        </div>
      </section>

      {/* What you get */}
      <Section id="what-you-get" className="py-10 md:py-14 border-t border-border">
        <TerminalHeader
          label="// WHAT YOU GET"
          path="apex.founding.includes"
          right="LIFETIME LOCK"
        />
        <div className="grid gap-3 md:grid-cols-3">
          <Tile
            label="PRICING"
            title="$1,500 → $9,000 forever"
            blurb={
              // COPY: pull the pricing-explainer paragraph from the
              // source doc. Default is Option A.
              "First year is $1,500. Renewal is $9,000 per year — locked at that rate as long as the seat is active. Standard institutional pricing starts at $24,000/seat."
            }
          />
          <Tile
            label="ACCESS"
            title="Full Manifold platform"
            blurb={
              // COPY: pull the platform-access blurb from the source doc.
              "Same access as institutional seats: discovery runs, ΩF readouts, all available domains, all available engines. No feature gating."
            }
          />
          <Tile
            label="INVOLVEMENT"
            title="Direct line to the team"
            blurb={
              // COPY: pull the founder-perks paragraph from the source doc.
              "Quarterly office hours with the founder. Influence on the roadmap. Early access to new engines and domains as they ship."
            }
          />
        </div>
      </Section>

      {/* Why now */}
      <Section className="py-10 md:py-14 border-t border-border">
        <TerminalHeader
          label="// WHY NOW"
          path="apex.founding.thesis"
          right="TIME-BOUND"
          color="amber"
        />
        <div className="bg-surface-elevated border border-border rounded-lg p-5 md:p-7 max-w-3xl space-y-3">
          {/* COPY: replace this single paragraph with the "Why now" or
              equivalent narrative section from the source doc. The
              tone we want is: institutional credibility + scarcity,
              without being salesy. */}
          <p className="text-[13px] md:text-sm font-mono text-foreground/90 leading-relaxed">
            Manifold is past v1.0 and serving its first institutional
            users. The Founding 10 is the last cohort to join at a
            price that reflects the early commit, not the platform we
            ship in 18 months. After these seats are claimed, pricing
            steps up to the institutional rate and renewal locks no
            longer apply.
          </p>
          <p className="text-[12.5px] font-mono text-text-muted leading-relaxed">
            {/* COPY: optional second paragraph from the source doc — drop
                if the doc only has one. */}
            If you&apos;re evaluating Manifold for a fund, a
            reinsurer, a sovereign office, or a research institution,
            this is the lowest-friction path to a long-term
            relationship at a defensible price.
          </p>
        </div>
      </Section>

      {/* FAQ */}
      <Section className="py-10 md:py-14 border-t border-border">
        <TerminalHeader
          label="// FAQ"
          path="apex.founding.faq"
          right="COMMON QUESTIONS"
          color="purple"
        />
        <div className="space-y-3 max-w-3xl">
          {FAQ_PLACEHOLDERS.map((qa) => (
            <FaqItem key={qa.q} q={qa.q} a={qa.a} />
          ))}
          <p className="text-[11px] font-mono text-text-muted/70 leading-relaxed pt-2">
            {/* INTERNAL NOTE: replace FAQ_PLACEHOLDERS below with the
                FAQ section from the source doc. */}
            Have a question we didn&apos;t answer?{" "}
            <Link href="/contact" className="text-accent-cyan hover:underline">
              Get in touch
            </Link>{" "}
            and we&apos;ll respond within one business day.
          </p>
        </div>
      </Section>

      {/* Final CTA */}
      <Section className="py-12 md:py-16 border-t border-border">
        <div className="bg-surface border border-accent-cyan/30 rounded-lg p-6 md:p-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-xl">
            <div className="font-mono text-[10px] tracking-[0.2em] text-accent-cyan/80">
              // CLAIM A SEAT
            </div>
            <h3 className="font-[family-name:var(--font-michroma)] text-2xl md:text-3xl tracking-[0.06em] text-foreground leading-[1.25]">
              {soldOut
                ? "All seats claimed."
                : "Six left. Then this offer is closed."}
            </h3>
            <p className="text-[12.5px] font-mono text-text-muted leading-relaxed">
              {/* COPY: closing paragraph from the source doc. */}
              {soldOut
                ? "Waitlist is the only remaining path until a seat opens up."
                : "Renewal locked at $9,000/year. Same Manifold seat the institutions are buying for $24,000."}
            </p>
          </div>
          <div className="flex flex-col gap-3 shrink-0">
            {!soldOut ? (
              <CTAButton href={claimHref} external={claimIsExternal}>
                CLAIM A FOUNDING SEAT
              </CTAButton>
            ) : (
              <CTAButton href="/access">JOIN THE WAITLIST</CTAButton>
            )}
            <CTAButton href="/audit" variant="secondary">
              OR · GET A MINI-AUDIT FIRST
            </CTAButton>
          </div>
        </div>
      </Section>
    </>
  );
}

/* ───────── pieces ───────── */

function SeatBadge({
  seatsLeft,
  totalSeats,
}: {
  seatsLeft: number;
  totalSeats: number;
}) {
  const soldOut = seatsLeft <= 0;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 border rounded text-[10px] font-mono tracking-wider ${
        soldOut
          ? "border-text-muted/30 bg-text-muted/5 text-text-muted"
          : "border-accent-cyan/40 bg-accent-cyan/5 text-accent-cyan"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          soldOut ? "bg-text-muted/60" : "bg-accent-cyan"
        } ${soldOut ? "" : "pulse-ring"}`}
      />
      {soldOut
        ? `0 of ${totalSeats} LEFT`
        : `${seatsLeft} OF ${totalSeats} LEFT`}
    </span>
  );
}

function Tile({
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
      <div className="font-[family-name:var(--font-michroma)] text-base tracking-[0.04em] text-foreground leading-tight">
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
   COPY: Replace this entire array with the FAQ from the source doc
   `docs/outreach/founding-member-offer.md`. Keep the same {q, a}
   shape. */
const FAQ_PLACEHOLDERS = [
  {
    q: "What does the price actually lock?",
    a: "$9,000/year for as long as the seat is active. The lock survives renewal cycles — institutional rate increases don't apply.",
  },
  {
    q: "What happens if I cancel and try to come back?",
    a: "The lock dies with the seat. Re-joining means buying at the prevailing institutional rate.",
  },
  {
    q: "How is this different from the regular institutional seat?",
    a: "Same Manifold access. Different price floor and a direct line to the founder.",
  },
  {
    q: "Is the Stripe checkout the same as a sales contract?",
    a: "For Founding seats, yes — single-seat purchases use Stripe; multi-seat or org contracts go through standard procurement.",
  },
];
