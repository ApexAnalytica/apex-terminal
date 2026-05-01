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

export function SectionLabel({ children, color = "cyan" }: { children: ReactNode; color?: "cyan" | "amber" | "purple" | "green" | "red" | "magenta" | "orange" }) {
  const map: Record<string, string> = {
    cyan: "text-accent-cyan",
    amber: "text-accent-amber",
    purple: "text-accent-purple",
    green: "text-accent-green",
    red: "text-accent-red",
    magenta: "text-accent-magenta",
    orange: "text-accent-orange",
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
