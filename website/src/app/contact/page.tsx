import type { Metadata } from "next";
import { Section, TerminalHeader } from "@/components/ui/Section";
import CTAButton from "@/components/ui/CTAButton";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Contact · Apex Analytica",
  description:
    "Platform access, partnerships, research collaboration, or general inquiry — pick a path or email us directly.",
};

const ACCESS_OPTIONS = [
  {
    title: "TRIAL ACCESS",
    color: "cyan",
    label: "48-HOUR EVALUATION",
    blurb:
      "Time-boxed access to Manifold with a curated dataset. No invite needed — best for individuals evaluating the platform.",
    cta: "START TRIAL",
    href: SITE.trialUrl,
  },
  {
    title: "AUTHORIZED ACCESS",
    color: "amber",
    label: "INVITE-ONLY · INSTITUTIONAL",
    blurb:
      "Full platform access for institutional users. Issued by invite from the Apex Analytica team. Submit a request and we'll route it internally.",
    cta: "REQUEST INVITE",
    href: "/access",
  },
] as const;

const CONTACT_CHANNELS = [
  { channel: "GENERAL",         email: "info@apexanalytica.co",   subject: "" },
  { channel: "ACCESS · INVITE", email: "brynna@apexanalytica.co", subject: "Manifold%20%E2%80%94%20Invite%20Request" },
  { channel: "PARTNERSHIPS",    email: "junaid@apexanalytica.co", subject: "Partnership%20Inquiry" },
  { channel: "RESEARCH",        email: "info@apexanalytica.co",   subject: "Research%20Collaboration" },
];

const colorMap: Record<string, { text: string; border: string; bg: string }> = {
  cyan:  { text: "text-accent-cyan",  border: "border-accent-cyan/30",  bg: "bg-accent-cyan" },
  amber: { text: "text-accent-amber", border: "border-accent-amber/30", bg: "bg-accent-amber" },
};

export default function ContactPage() {
  return (
    <>
      <section className="relative border-b border-border overflow-hidden">
        <div className="absolute inset-0 grid-bg opacity-40 mask-fade-edges" aria-hidden />
        <div className="relative mx-auto max-w-7xl px-4 md:px-6 pt-16 pb-12 md:pt-20 md:pb-14">
          <div className="flex items-center gap-3 mb-4">
            <span className="font-[family-name:var(--font-michroma)] text-[10px] tracking-[0.3em] text-accent-cyan/90">
              // CONTACT
            </span>
          </div>
          <h1 className="font-[family-name:var(--font-michroma)] text-3xl md:text-5xl tracking-[0.04em] leading-[1.15] text-foreground max-w-3xl">
            Get in touch with{" "}
            <span className="text-accent-cyan text-glow-cyan">Apex Analytica.</span>
          </h1>
          <p className="mt-5 text-sm md:text-base font-mono text-text-muted leading-relaxed max-w-2xl">
            Platform access, partnerships, research collaboration, or general
            inquiry — pick a path or email us directly.
          </p>
        </div>
      </section>

      {/* Access options */}
      <Section className="py-10 md:py-14 border-t border-border">
        <TerminalHeader
          label="// PLATFORM ACCESS"
          right="2 PATHS"
          color="cyan"
        />
        <div className="grid gap-3 md:grid-cols-2">
          {ACCESS_OPTIONS.map((opt) => {
            const c = colorMap[opt.color];
            return (
              <div
                key={opt.title}
                className={`bg-surface-elevated border ${c.border} rounded-lg p-5 flex flex-col gap-4 hover:bg-surface transition-colors`}
              >
                <div className="space-y-1.5">
                  <div className={`font-[family-name:var(--font-michroma)] text-[9px] tracking-[0.3em] ${c.text}`}>
                    {opt.label}
                  </div>
                  <div className="font-[family-name:var(--font-michroma)] text-lg tracking-[0.12em] text-foreground">
                    {opt.title}
                  </div>
                </div>
                <span className={`block h-1 w-12 ${c.bg} opacity-70`} />
                <p className="text-[12.5px] font-mono text-text-muted leading-relaxed flex-1">
                  {opt.blurb}
                </p>
                <CTAButton
                  href={opt.href}
                  external={opt.href.startsWith("http")}
                  variant={opt.color === "cyan" ? "primary" : "secondary"}
                  className="w-full"
                >
                  {opt.cta}
                </CTAButton>
              </div>
            );
          })}
        </div>
      </Section>

      {/* Direct contact — channel grid */}
      <Section className="py-10 md:py-14 border-t border-border">
        <TerminalHeader
          label="// DIRECT"
          right="ROUTED BY PURPOSE"
          color="purple"
        />
        <div className="grid gap-3 md:grid-cols-2">
          {CONTACT_CHANNELS.map((ch) => {
            const href = ch.subject
              ? `mailto:${ch.email}?subject=${ch.subject}`
              : `mailto:${ch.email}`;
            return (
              <a
                key={ch.channel}
                href={href}
                className="flex items-center justify-between bg-surface-elevated border border-border rounded-lg px-5 py-4 hover:border-accent-cyan/40 hover:bg-surface transition-colors group"
              >
                <div className="space-y-1">
                  <div className="font-[family-name:var(--font-michroma)] text-[9px] tracking-[0.3em] text-accent-cyan/80">
                    {ch.channel}
                  </div>
                  <div className="font-mono text-[12.5px] text-foreground group-hover:text-accent-cyan transition-colors">
                    {ch.email}
                  </div>
                </div>
                <span className="font-[family-name:var(--font-michroma)] text-[10px] tracking-[0.3em] text-text-muted group-hover:text-accent-cyan transition-colors">
                  ›
                </span>
              </a>
            );
          })}
        </div>
      </Section>

      {/* Returning users */}
      <Section className="py-10 md:py-14 border-t border-border">
        <div className="bg-surface border border-border rounded-lg p-5 md:p-7 flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="space-y-1.5">
            <div className="font-[family-name:var(--font-michroma)] text-[10px] tracking-[0.3em] text-text-muted">
              // ALREADY HAVE ACCESS?
            </div>
            <div className="font-[family-name:var(--font-michroma)] text-lg md:text-xl tracking-[0.06em] text-foreground">
              Sign in to the Manifold terminal.
            </div>
          </div>
          <CTAButton href={SITE.loginUrl} external variant="secondary">
            OPEN TERMINAL ›
          </CTAButton>
        </div>
      </Section>
    </>
  );
}
