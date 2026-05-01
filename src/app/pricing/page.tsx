import Link from "next/link";
import Image from "next/image";
import { PRICING_PLANS } from "@/lib/billing";

export const metadata = {
  title: "Pricing — Manifold by Apex Analytica",
  description:
    "Institutional pricing for Manifold, the causal-inference terminal for cross-domain risk.",
};

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <Image src="/logo.png" alt="Manifold" width={36} height={36} />
            <div className="leading-tight">
              <div className="text-[12px] font-[family-name:var(--font-michroma)] tracking-[0.25em] text-accent-cyan">
                MANIFOLD
              </div>
              <div className="text-[8px] font-[family-name:var(--font-michroma)] tracking-[0.25em] text-text-muted">
                by APEX ANALYTICA
              </div>
            </div>
          </Link>
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

      <main className="max-w-6xl mx-auto px-6 py-16">
        <div className="text-center mb-14 space-y-3">
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

        <div className="mt-16 border-t border-border pt-10 text-center space-y-3">
          <div className="text-[10px] font-[family-name:var(--font-michroma)] tracking-[0.25em] text-text-muted">
            EVALUATING MANIFOLD
          </div>
          <p className="text-[12px] font-mono text-text-muted max-w-2xl mx-auto leading-relaxed">
            We provision a 48-hour pilot for qualified institutional
            buyers — funds, banks, defense primes, sovereign offices,
            and research institutions. Tell us who you are and what
            you&apos;re evaluating; we&apos;ll respond within one business day.
          </p>
          <div className="pt-2">
            <Link
              href="/request-access"
              className="inline-block px-5 py-2.5 bg-accent-cyan/10 border border-accent-cyan/40 rounded text-[11px] font-[family-name:var(--font-michroma)] tracking-wider text-accent-cyan hover:bg-accent-cyan/20"
            >
              REQUEST ACCESS
            </Link>
          </div>
        </div>
      </main>

      <footer className="border-t border-border mt-16 py-8 text-center text-[9px] font-mono text-text-muted">
        © Apex Analytica · Manifold is an institutional research terminal
      </footer>
    </div>
  );
}
