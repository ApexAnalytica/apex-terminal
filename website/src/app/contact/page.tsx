import { Section, SectionLabel, SectionHeading, SectionLede } from "@/components/ui/Section";
import CTAButton from "@/components/ui/CTAButton";
import { SITE } from "@/lib/site";

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
      "Full platform access for institutional users. Issued by invite from the Apex Analytica team. Email below to request an invite code.",
    cta: "EMAIL FOR INVITE",
    href: `mailto:${SITE.email}?subject=Manifold%20%E2%80%94%20Invite%20Request`,
  },
] as const;

const colorMap: Record<string, { text: string; border: string; bg: string }> = {
  cyan:  { text: "text-accent-cyan",  border: "border-accent-cyan/30",  bg: "bg-accent-cyan" },
  amber: { text: "text-accent-amber", border: "border-accent-amber/30", bg: "bg-accent-amber" },
};

export default function ContactPage() {
  return (
    <>
      <section className="relative border-b border-border overflow-hidden">
        <div className="absolute inset-0 grid-bg opacity-40 mask-fade-edges" aria-hidden />
        <div className="relative mx-auto max-w-7xl px-4 md:px-6 pt-20 pb-16 md:pt-28 md:pb-20">
          <SectionLabel>CONTACT</SectionLabel>
          <h1 className="mt-4 font-[family-name:var(--font-michroma)] text-3xl md:text-5xl tracking-[0.04em] leading-[1.15] text-foreground max-w-3xl">
            Get in touch
            <br />
            with{" "}
            <span className="text-accent-cyan text-glow-cyan">Apex Analytica.</span>
          </h1>
          <p className="mt-6 text-sm md:text-base font-mono text-text-muted leading-relaxed max-w-2xl">
            For platform access, partnerships, research collaboration, or
            general inquiry — reach us by email or pick the access path that
            fits.
          </p>
        </div>
      </section>

      {/* Access options */}
      <Section className="py-20 md:py-24">
        <div className="space-y-3 mb-12">
          <SectionLabel color="cyan">PLATFORM ACCESS</SectionLabel>
          <SectionHeading>Two ways to get into Manifold.</SectionHeading>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {ACCESS_OPTIONS.map((opt) => {
            const c = colorMap[opt.color];
            return (
              <div
                key={opt.title}
                className={`bg-surface-elevated border ${c.border} rounded-lg p-8 flex flex-col gap-5 hover:bg-surface transition-colors`}
              >
                <div className="space-y-1">
                  <div className={`font-[family-name:var(--font-michroma)] text-[9px] tracking-[0.3em] ${c.text}`}>
                    {opt.label}
                  </div>
                  <div className="font-[family-name:var(--font-michroma)] text-xl tracking-[0.15em] text-foreground">
                    {opt.title}
                  </div>
                </div>
                <span className={`block h-1 w-12 ${c.bg} opacity-70`} />
                <p className="text-[13px] font-mono text-text-muted leading-relaxed flex-1">
                  {opt.blurb}
                </p>
                <CTAButton
                  href={opt.href}
                  external
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

      {/* Direct contact */}
      <Section className="py-20 md:py-24 border-t border-border">
        <div className="grid gap-10 lg:grid-cols-[1fr_1fr] lg:items-start">
          <div className="space-y-4">
            <SectionLabel color="purple">DIRECT</SectionLabel>
            <SectionHeading>Email is the best way.</SectionHeading>
            <SectionLede>
              We read every inbound. Use the addresses on the right and add
              context — your organization, what you&apos;re trying to solve,
              and the timeframe you&apos;re working on.
            </SectionLede>
          </div>

          <div className="space-y-3">
            <ContactRow
              channel="GENERAL"
              dest={SITE.email}
              href={`mailto:${SITE.email}`}
            />
            <ContactRow
              channel="ACCESS · INVITE"
              dest={SITE.email}
              href={`mailto:${SITE.email}?subject=Manifold%20%E2%80%94%20Invite%20Request`}
            />
            <ContactRow
              channel="PARTNERSHIPS"
              dest={SITE.email}
              href={`mailto:${SITE.email}?subject=Partnership%20Inquiry`}
            />
            <ContactRow
              channel="RESEARCH"
              dest={SITE.email}
              href={`mailto:${SITE.email}?subject=Research%20Collaboration`}
            />
          </div>
        </div>
      </Section>

      {/* Returning users */}
      <Section className="py-16 md:py-20 border-t border-border">
        <div className="bg-surface border border-border rounded-lg p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="font-[family-name:var(--font-michroma)] text-[10px] tracking-[0.3em] text-text-muted">
              ALREADY HAVE ACCESS?
            </div>
            <div className="font-[family-name:var(--font-michroma)] text-lg md:text-xl tracking-[0.08em] text-foreground">
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

function ContactRow({
  channel,
  dest,
  href,
}: {
  channel: string;
  dest: string;
  href: string;
}) {
  return (
    <a
      href={href}
      className="flex items-center justify-between bg-surface-elevated border border-border rounded-lg px-5 py-4 hover:border-accent-cyan/40 hover:bg-surface transition-colors group"
    >
      <div className="space-y-1">
        <div className="font-[family-name:var(--font-michroma)] text-[9px] tracking-[0.3em] text-accent-cyan/80">
          {channel}
        </div>
        <div className="font-mono text-[13px] text-foreground group-hover:text-accent-cyan transition-colors">
          {dest}
        </div>
      </div>
      <span className="font-[family-name:var(--font-michroma)] text-[10px] tracking-[0.3em] text-text-muted group-hover:text-accent-cyan transition-colors">
        ›
      </span>
    </a>
  );
}
