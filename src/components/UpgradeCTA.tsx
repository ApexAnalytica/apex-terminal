"use client";

// Reusable "Contact sales" affordance — primary CTA opens the
// scheduler if NEXT_PUBLIC_SCHEDULER_URL is configured, secondary
// opens a mailto: to NEXT_PUBLIC_SALES_EMAIL (default
// info@apexanalytica.co — the address already used on /expired).

const SCHEDULER_URL = process.env.NEXT_PUBLIC_SCHEDULER_URL ?? "";
const SALES_EMAIL =
  process.env.NEXT_PUBLIC_SALES_EMAIL ?? "info@apexanalytica.co";

export interface UpgradeCTAProps {
  primaryLabel?: string;
  secondaryLabel?: string;
  subjectHint?: string;
  variant?: "stacked" | "inline";
}

export default function UpgradeCTA({
  primaryLabel = "Schedule a call",
  secondaryLabel,
  subjectHint = "Apex Analytica — Manifold inquiry",
  variant = "stacked",
}: UpgradeCTAProps) {
  const mailto = `mailto:${SALES_EMAIL}?subject=${encodeURIComponent(subjectHint)}`;
  const hasScheduler = SCHEDULER_URL.length > 0;
  const secondary = secondaryLabel ?? `Email ${SALES_EMAIL}`;

  const containerCls =
    variant === "inline"
      ? "flex flex-wrap gap-3 items-center"
      : "flex flex-col gap-2 items-center";

  return (
    <div className={containerCls}>
      <a
        href={hasScheduler ? SCHEDULER_URL : mailto}
        target={hasScheduler ? "_blank" : undefined}
        rel={hasScheduler ? "noopener noreferrer" : undefined}
        className="inline-block px-5 py-2.5 bg-accent-cyan/10 border border-accent-cyan/40 rounded text-[11px] font-[family-name:var(--font-michroma)] tracking-wider text-accent-cyan hover:bg-accent-cyan/20 hover:border-accent-cyan/60 transition-all"
      >
        {primaryLabel}
      </a>
      {hasScheduler && (
        <a
          href={mailto}
          className="text-[10px] font-mono text-text-muted hover:text-foreground transition-colors"
        >
          {secondary}
        </a>
      )}
    </div>
  );
}
