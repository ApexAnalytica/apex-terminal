import Link from "next/link";
import Image from "next/image";
import { PRICING_PLANS } from "@/lib/billing";
import PricingBackground from "@/components/visuals/PricingBackground";

export const metadata = {
  title: "Pricing — Manifold by Apex Analytica",
  description:
    "Institutional pricing for Manifold, the causal-inference terminal for cross-domain risk.",
};

export default function PricingPage() {
  return (
    <div className="relative min-h-screen bg-background text-foreground">
      {/* Ambient causal-graph background — sits behind every section
          on the page. Fixed so it doesn't scroll, low opacity so it
          coexists with the price grid and CTA blocks. */}
      <div
        aria-hidden
        className="fixed inset-0 -z-10 pointer-events-none opacity-[0.28]"
      >
        <PricingBackground />
      </div>

      <header className="relative border-b border-border">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          {/* Brand mark on /pricing routes back to the new marketing
              site (apex-analytica-website.vercel.app), NOT to the
              platform root or the legacy apexanalytica.co Vite SPA.
              Visitors landing here are evaluating the product, so
              "home" means the new public marketing site we're
              building, not the platform dashboard.

              TODO when DNS for apexanalytica.co cuts over to this
              new website (the Vercel project apex-analytica-website),
              swap this href to https://apexanalytica.co/ so the
              brand mark uses the canonical domain. */}
          <a href="https://apex-analytica-website.vercel.app/" className="flex items-center gap-3">
            <Image src="/logo.png" alt="Apex Analytica" width={36} height={36} />
            <div className="leading-tight">
              <div className="text-[12px] font-[family-name:var(--font-michroma)] tracking-[0.25em] text-accent-cyan">
                MANIFOLD
              </div>
              <div className="text-[8px] font-[family-name:var(--font-michroma)] tracking-[0.25em] text-text-muted">
                by APEX ANALYTICA
              </div>
            </div>
          </a>
          <nav className="flex items-center gap-5 text-[10px] font-mono text-text-muted">
            <Link href="/login" className="hover:text-foreground">
              SIGN IN
            </Link>
            <Link
              href="/request-access"
              className="px-3 py-1.5 border border-accent-cyan/40 rounded text-accent-cyan hover:bg-accent-cyan/10 tracking-wider"
            >
              REQUEST ACCESS
            </Link>
          </nav>
        </div>
      </header>

      <main className="relative max-w-6xl mx-auto px-6 py-16">
        <div className="text-center mb-10 space-y-3">
          <div className="text-[10px] font-[family-name:var(--font-michroma)] tracking-[0.3em] text-text-muted">
            INSTITUTIONAL ACCESS
          </div>
          <h1 className="text-3xl md:text-4xl font-[family-name:var(--font-michroma)] tracking-wider">
            Pricing
          </h1>
          <p className="text-[12px] font-mono text-text-muted max-w-xl mx-auto leading-relaxed">
            Manifold is sold per-seat, annual. No self-serve checkout.
            Every deployment starts with a sales conversation and a
            48-hour pilot scoped to your evaluation use case.
          </p>
        </div>

        {/* "Evaluating Manifold? Pilot first" CTA above the price
            grid — visitors see the access path before scrolling
            through the tiers, so the prices feel like a follow-up
            to the pilot conversation, not a paywall. */}
        <div className="mb-12 rounded-lg border border-accent-cyan/30 bg-accent-cyan/[0.04] p-5 md:p-6 flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="space-y-1.5 max-w-2xl">
            <div className="text-[10px] font-[family-name:var(--font-michroma)] tracking-[0.25em] text-accent-cyan">
              EVALUATING MANIFOLD?
            </div>
            <p className="text-[12.5px] font-mono text-foreground/85 leading-relaxed">
              Start with a 48-hour pilot before talking pricing. We
              provision against your real use case and reply within
              one business day.
            </p>
          </div>
          <Link
            href="/request-access"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-accent-cyan/15 border border-accent-cyan/60 rounded text-[11px] font-[family-name:var(--font-michroma)] tracking-[0.25em] text-accent-cyan hover:bg-accent-cyan/25 transition-colors shrink-0"
          >
            <span>REQUEST ACCESS</span>
            <span aria-hidden>›</span>
          </Link>
        </div>

        <div className="grid md:grid-cols-3 gap-5">
          {PRICING_PLANS.map((plan) => (
            <div
              key={plan.tier}
              className={`flex flex-col rounded border p-6 transition-colors ${
                plan.highlight
                  ? "border-accent-cyan/60 bg-accent-cyan/5"
                  : "border-border bg-surface"
              }`}
            >
              <div className="text-[9px] font-[family-name:var(--font-michroma)] tracking-[0.25em] text-text-muted">
                {plan.name.toUpperCase()}
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <div className="text-2xl font-[family-name:var(--font-michroma)] text-foreground">
                  {plan.priceLabel}
                </div>
                <div className="text-[9px] font-mono text-text-muted">
                  {plan.cadence}
                </div>
              </div>
              <p className="mt-3 text-[11px] font-mono text-text-muted leading-relaxed">
                {plan.blurb}
              </p>

              <ul className="mt-5 space-y-2 flex-1">
                {plan.features.map((f) => (
                  <li
                    key={f}
                    className="flex gap-2 text-[11px] font-mono text-foreground/90 leading-relaxed"
                  >
                    <span className="text-accent-cyan/70 mt-0.5">·</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <Link
                href={`/request-access?tier=${plan.tier}`}
                className={`mt-6 inline-block text-center px-4 py-2.5 rounded text-[10px] font-[family-name:var(--font-michroma)] tracking-wider border transition-colors ${
                  plan.highlight
                    ? "bg-accent-cyan/15 border-accent-cyan/60 text-accent-cyan hover:bg-accent-cyan/25"
                    : "border-border text-foreground hover:border-accent-cyan/60 hover:text-accent-cyan"
                }`}
              >
                {plan.ctaLabel.toUpperCase()}
              </Link>
            </div>
          ))}
        </div>

        <div className="mt-14 border-t border-border pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-[11.5px] font-mono text-text-muted leading-relaxed">
            Funds, banks, defense primes, sovereign offices, research
            institutions. Pilot first, paperwork second.
          </p>
          <Link
            href="/request-access"
            className="inline-flex items-center justify-center gap-2 px-4 py-2 border border-border rounded text-[10px] font-[family-name:var(--font-michroma)] tracking-[0.25em] text-text-muted hover:text-accent-cyan hover:border-accent-cyan/60 transition-colors"
          >
            <span>REQUEST ACCESS</span>
            <span aria-hidden>›</span>
          </Link>
        </div>
      </main>

      <footer className="relative border-t border-border mt-16 py-8 text-center text-[9px] font-mono text-text-muted">
        © Apex Analytica · Manifold is an institutional research terminal
      </footer>
    </div>
  );
}
