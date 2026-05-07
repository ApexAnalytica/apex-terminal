import { ReactNode } from "react";

export function Section({
  children,
  className = "",
  id,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={`relative w-full ${className}`}>
      <div className="mx-auto max-w-7xl px-4 md:px-6">{children}</div>
    </section>
  );
}

export function SectionLabel({ children, color = "cyan" }: { children: ReactNode; color?: "cyan" | "amber" | "purple" | "green" | "red" | "magenta" | "orange" | "blue" }) {
  const map: Record<string, string> = {
    cyan: "text-accent-cyan",
    amber: "text-accent-amber",
    purple: "text-accent-purple",
    green: "text-accent-green",
    red: "text-accent-red",
    magenta: "text-accent-magenta",
    orange: "text-accent-orange",
    blue: "text-accent-blue",
  };
  return (
    <div className="flex items-center gap-3">
      <span className={`h-px w-8 bg-current opacity-50 ${map[color]}`} />
      <span className={`font-[family-name:var(--font-michroma)] text-[10px] tracking-[0.3em] ${map[color]}`}>
        {children}
      </span>
    </div>
  );
}

export function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <h2 className="font-[family-name:var(--font-michroma)] text-2xl md:text-3xl tracking-[0.08em] text-foreground leading-[1.25]">
      {children}
    </h2>
  );
}

export function SectionLede({ children }: { children: ReactNode }) {
  return (
    <p className="text-[13px] md:text-sm font-mono text-text-muted leading-relaxed max-w-2xl">
      {children}
    </p>
  );
}

/**
 * Mosaic-style terminal header — // LABEL · path · right-meta on a thin underline.
 * Replaces the SectionLabel + SectionHeading + SectionLede stripe.
 */
export function TerminalHeader({
  label,
  path,
  right,
  color = "cyan",
}: {
  label: string;
  path?: string;
  right?: string;
  color?: "cyan" | "amber" | "purple" | "green" | "red" | "magenta" | "orange" | "blue";
}) {
  const map: Record<string, string> = {
    cyan: "text-accent-cyan/90",
    amber: "text-accent-amber/90",
    purple: "text-accent-purple/90",
    green: "text-accent-green/90",
    red: "text-accent-red/90",
    magenta: "text-accent-magenta/90",
    orange: "text-accent-orange/90",
    blue: "text-accent-blue/90",
  };
  return (
    <div className="flex items-center justify-between border-b border-border pb-2 mb-6">
      <div className="flex items-baseline gap-3">
        <span className={`font-[family-name:var(--font-michroma)] text-[10px] tracking-[0.25em] ${map[color]}`}>
          {label}
        </span>
        {path && (
          <span className="hidden sm:inline font-mono text-[10px] text-text-muted/60">
            {path}
          </span>
        )}
      </div>
      {right && (
        <span className="font-mono text-[10px] tracking-wider text-text-muted/70">
          {right}
        </span>
      )}
    </div>
  );
}
