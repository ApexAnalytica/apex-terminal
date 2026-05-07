import type { Metadata } from "next";
import { Section, TerminalHeader } from "@/components/ui/Section";
import { SITE } from "@/lib/site";
import AccessForm from "./AccessForm";

export const metadata: Metadata = {
  title: "Request access · Apex Analytica",
  description:
    "Request access to Manifold. We respond within one business day.",
};

export default function AccessPage() {
  return (
    <>
      {/* Header */}
      <section className="relative border-b border-border overflow-hidden">
        <div className="absolute inset-0 grid-bg opacity-40 mask-fade-edges" aria-hidden />
        <div className="relative mx-auto max-w-7xl px-4 md:px-6 pt-16 pb-12 md:pt-20 md:pb-14">
          <div className="flex items-center gap-3 mb-4">
            <span className="font-[family-name:var(--font-michroma)] text-[10px] tracking-[0.3em] text-accent-cyan/90">
              // REQUEST ACCESS
            </span>
            <span className="font-mono text-[10px] text-text-muted/60">
              apex.access
            </span>
          </div>
          <h1 className="font-[family-name:var(--font-michroma)] text-3xl md:text-5xl tracking-[0.04em] leading-[1.15] text-foreground max-w-3xl">
            Request access to{" "}
            <span className="text-accent-cyan text-glow-cyan">Manifold.</span>
          </h1>
          <p className="mt-5 text-sm md:text-base font-mono text-text-muted leading-relaxed max-w-2xl">
            Tell us a bit about your team and what you&apos;re trying to map.
            We&apos;ll route the request internally and follow up with the
            right path — trial, authorized invite, or partnership.
          </p>
        </div>
      </section>

      {/* Form */}
      <Section className="py-10 md:py-14 border-t border-border">
        <TerminalHeader
          label="// SUBMIT"
          path="apex.access.form"
          right="ROUTED TO INFO@APEXANALYTICA.CO"
        />
        <div className="grid gap-6 md:grid-cols-[1fr_minmax(0,1.4fr)]">
          <div className="space-y-4">
            <p className="text-[13px] md:text-sm font-mono text-foreground/85 leading-relaxed">
              Manifold is currently invite-only for institutional users, with
              a separate self-serve trial track for individuals.
            </p>
            <p className="text-[12.5px] font-mono text-text-muted leading-relaxed">
              Use this form for invite requests, partnerships, research
              collaboration, or anything that doesn&apos;t fit the trial
              flow. Your message goes straight to{" "}
              <span className="text-foreground/90">info@apexanalytica.co</span>{" "}
              with your email as the reply-to.
            </p>
            <div className="pt-3 border-t border-border space-y-2">
              <div className="font-[family-name:var(--font-michroma)] text-[9px] tracking-[0.3em] text-text-muted">
                ALSO AVAILABLE
              </div>
              <ul className="space-y-1.5 text-[12.5px] font-mono text-text-muted">
                <li>
                  Self-serve trial:{" "}
                  <a
                    href={SITE.trialUrl}
                    className="text-accent-cyan hover:underline"
                  >
                    48-hour evaluation ›
                  </a>
                </li>
                <li>
                  Already have a code:{" "}
                  <a
                    href={SITE.trustedUrl}
                    className="text-accent-cyan hover:underline"
                  >
                    authorized signup ›
                  </a>
                </li>
                <li>
                  Pricing:{" "}
                  <a
                    href={SITE.pricingUrl}
                    className="text-accent-cyan hover:underline"
                  >
                    see plans ›
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <AccessForm />
        </div>
      </Section>
    </>
  );
}
