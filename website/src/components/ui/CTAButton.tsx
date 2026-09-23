import Link from "next/link";
import { ReactNode } from "react";

type Props = {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary";
  external?: boolean;
  className?: string;
};

export default function CTAButton({
  href,
  children,
  variant = "primary",
  external = false,
  className = "",
}: Props) {
  const base =
    "inline-flex items-center justify-center gap-2 px-5 py-3 rounded text-[11px] font-[family-name:var(--font-michroma)] tracking-[0.25em] transition-all";

  const styles =
    variant === "primary"
      ? "bg-accent-cyan/10 border border-accent-cyan/40 text-accent-cyan hover:bg-accent-cyan/20 hover:border-accent-cyan/60 glow-cyan"
      : "bg-surface border border-border text-text-muted hover:text-foreground hover:border-border-bright";

  const content = (
    <>
      <span>{children}</span>
      <span aria-hidden className="text-[10px]">{`›`}</span>
    </>
  );

  if (external) {
    return (
      <a href={href} className={`${base} ${styles} ${className}`}>
        {content}
      </a>
    );
  }
  return (
    <Link href={href} className={`${base} ${styles} ${className}`}>
      {content}
    </Link>
  );
}
