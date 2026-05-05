import Image from "next/image";
import Link from "next/link";
import { NAV, SITE } from "@/lib/site";

export default function SiteFooter() {
  return (
    <footer className="border-t border-border bg-surface/40">
      <div className="mx-auto max-w-7xl px-4 md:px-6 py-10">
        <div className="grid gap-8 md:grid-cols-4">
          <div className="md:col-span-2 space-y-4">
            <div className="flex items-center gap-3">
              <Image
                src="/mantis.png"
                alt="Apex Analytica"
                width={44}
                height={54}
                className="object-contain shrink-0"
              />
              <span className="font-[family-name:var(--font-michroma)] text-[11px] tracking-[0.3em] text-foreground">
                APEX ANALYTICA
              </span>
            </div>
            <p className="text-[12px] font-mono text-text-muted leading-relaxed max-w-md">
              {SITE.product} is causal intelligence for critical systems —
              measuring, mapping, and stress-testing fragility across the
              world&apos;s most consequential networks.
            </p>
            <div className="text-[10px] font-mono text-text-muted/70 tracking-wider">
              {SITE.tagline}
            </div>
          </div>

          <div className="space-y-3">
            <div className="font-[family-name:var(--font-michroma)] text-[10px] tracking-[0.25em] text-accent-cyan/80">
              EXPLORE
            </div>
            <ul className="space-y-2">
              {NAV.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="text-[12px] font-mono text-text-muted hover:text-foreground"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-3">
            <div className="font-[family-name:var(--font-michroma)] text-[10px] tracking-[0.25em] text-accent-cyan/80">
              ACCESS
            </div>
            <ul className="space-y-2">
              <li>
                <a href={SITE.trialUrl} className="text-[12px] font-mono text-text-muted hover:text-foreground">
                  Request trial
                </a>
              </li>
              <li>
                <a href={SITE.trustedUrl} className="text-[12px] font-mono text-text-muted hover:text-foreground">
                  Authorized signup
                </a>
              </li>
              <li>
                <a href={SITE.pricingUrl} className="text-[12px] font-mono text-text-muted hover:text-foreground">
                  Pricing
                </a>
              </li>
              <li>
                <a href={SITE.loginUrl} className="text-[12px] font-mono text-text-muted hover:text-foreground">
                  Login
                </a>
              </li>
              <li>
                <a href={`mailto:${SITE.email}`} className="text-[12px] font-mono text-text-muted hover:text-foreground">
                  {SITE.email}
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-border flex flex-col md:flex-row items-start md:items-center justify-between gap-2">
          <div className="text-[10px] font-mono text-text-muted/70 tracking-wider">
            © {new Date().getFullYear()} APEX ANALYTICA · ALL RIGHTS RESERVED
          </div>
          <div className="text-[10px] font-mono text-text-muted/70 tracking-wider">
            APEXANALYTICA.CO
          </div>
        </div>
      </div>
    </footer>
  );
}
