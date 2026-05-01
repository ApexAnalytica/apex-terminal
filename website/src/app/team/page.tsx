import Image from "next/image";
import { Section, SectionLabel, SectionHeading } from "@/components/ui/Section";
import CTAButton from "@/components/ui/CTAButton";
import { SITE } from "@/lib/site";

const TEAM = [
  {
    name: "Junaid Ghauri",
    role: "Principal Scientist · CEO",
    color: "cyan",
    initials: "JG",
    photo: "https://apexanalytica.co/junaid.png",
    linkedin: "https://www.linkedin.com/in/jghauri/",
    expertise: "Leadership in tech, Bayesian models, COVID-19 analytics, reinsurance risk.",
    background:
      "Ex-General Partner at Pareto Technologies. Former CTO at MARK LABS. Chair of the Board at Emerita.",
    education: "Doctor of Engineering, Johns Hopkins University.",
  },
  {
    name: "Georgios Korpas",
    role: "Head of Research",
    color: "amber",
    initials: "GK",
    photo: "https://apexanalytica.co/gergios.png",
    linkedin: "https://www.linkedin.com/in/georgios-korpas/",
    expertise:
      "Quantum algorithms, hybrid computing for continuous optimization, collateral optimization, AI-quantum integration.",
    background:
      "AI, optimization, applied mathematics, and quantum computing at HSBC. Lead Researcher at the Archimedes AI Research Hub.",
    education:
      "Ph.D. in Mathematics, Trinity College Dublin. Visiting Ph.D. Scholar at Stanford University.",
  },
  {
    name: "Brynna Shale",
    role: "Head of Operations",
    color: "purple",
    initials: "BS",
    photo: "/team/brynna.png",
    linkedin: null,
    expertise: "Business strategy, data analytics, and operational efficiency.",
    background:
      "Goldman Sachs Analyst in Capital Reporting. Background in business, computer science, and data analytics.",
    education: "NYU Stern School of Business — Business and Data Science.",
  },
] as const;

const ADVISORS = [
  {
    name: "Dr. Takeru Igusa",
    role: "Technical Advisor · Systems Engineering",
    color: "cyan",
    initials: "TI",
    photo: "/team/igusa.png",
    expertise: "Systems science, applied mathematics, epidemiology, and resilience.",
    background:
      "Professor at Johns Hopkins University with interdisciplinary roles. Funded by NIH and CDC.",
  },
  {
    name: "Dr. Gonzalo L. Pita",
    role: "Risk Modeling Specialist",
    color: "amber",
    initials: "GP",
    photo: "/team/pita.png",
    expertise: "Natural-disaster risk, climate change, and infrastructure vulnerability.",
    background:
      "Associate Research Scientist at Johns Hopkins University. Former Senior Consultant at the World Bank.",
  },
  {
    name: "Dr. Arnesh Telukdarie",
    role: "Digital Business & AI Expert",
    color: "purple",
    initials: "AT",
    photo: "/team/telukdarie.png",
    expertise: "AI and large-scale systems design.",
    background:
      "Professor at the University of Johannesburg with extensive industry experience.",
  },
] as const;

const PARTNERS = ["AWS", "JOHNS HOPKINS UNIVERSITY", "NVIDIA"];

const colorMap: Record<
  string,
  { text: string; border: string; bg: string; soft: string; accentBg: string }
> = {
  cyan:    { text: "text-accent-cyan",    border: "border-accent-cyan/30",    bg: "bg-accent-cyan/10",    soft: "hover:border-accent-cyan/40",    accentBg: "bg-accent-cyan" },
  amber:   { text: "text-accent-amber",   border: "border-accent-amber/30",   bg: "bg-accent-amber/10",   soft: "hover:border-accent-amber/40",   accentBg: "bg-accent-amber" },
  purple:  { text: "text-accent-purple",  border: "border-accent-purple/30",  bg: "bg-accent-purple/10",  soft: "hover:border-accent-purple/40",  accentBg: "bg-accent-purple" },
  green:   { text: "text-accent-green",   border: "border-accent-green/30",   bg: "bg-accent-green/10",   soft: "hover:border-accent-green/40",   accentBg: "bg-accent-green" },
  magenta: { text: "text-accent-magenta", border: "border-accent-magenta/30", bg: "bg-accent-magenta/10", soft: "hover:border-accent-magenta/40", accentBg: "bg-accent-magenta" },
};

const PHOTO_SIZE_TEAM = 200;
const PHOTO_SIZE_ADVISOR = 140;

export default function TeamPage() {
  return (
    <>
      {/* Header */}
      <section className="relative border-b border-border overflow-hidden">
        <div className="absolute inset-0 grid-bg opacity-40 mask-fade-edges" aria-hidden />
        <div className="relative mx-auto max-w-7xl px-4 md:px-6 pt-20 pb-16 md:pt-28 md:pb-20">
          <SectionLabel color="purple">TEAM</SectionLabel>
          <h1 className="mt-4 font-[family-name:var(--font-michroma)] text-3xl md:text-5xl tracking-[0.04em] leading-[1.15] text-foreground max-w-3xl">
            The people behind
            <br />
            <span className="text-accent-cyan text-glow-cyan">Apex Analytica.</span>
          </h1>
          <p className="mt-6 text-sm md:text-base font-mono text-text-muted leading-relaxed max-w-2xl">
            An interdisciplinary team combining quantitative finance, applied
            mathematics, and engineering — building causal risk intelligence
            for capital markets in an era of escalating catastrophes.
          </p>
        </div>
      </section>

      {/* Core team — horizontal cards with large boxy photos */}
      <Section className="py-20 md:py-24">
        <div className="space-y-3 mb-10">
          <SectionLabel color="cyan">CORE TEAM</SectionLabel>
          <SectionHeading>Engineering, research, operations.</SectionHeading>
        </div>

        <div className="space-y-5">
          {TEAM.map((m) => {
            const c = colorMap[m.color];
            return (
              <div
                key={m.name}
                className={`relative bg-surface-elevated border border-border rounded-lg p-6 md:p-8 transition-colors ${c.soft}`}
              >
                {/* Accent corner */}
                <div className={`absolute top-0 left-0 h-1 w-16 ${c.accentBg} opacity-70`} />

                <div className="grid gap-6 md:gap-8 md:grid-cols-[auto_1fr] items-start">
                  {/* Boxy headshot */}
                  {m.photo ? (
                    <div
                      className={`relative overflow-hidden border ${c.border} bg-surface`}
                      style={{
                        width: PHOTO_SIZE_TEAM,
                        height: PHOTO_SIZE_TEAM,
                        minWidth: PHOTO_SIZE_TEAM,
                        flexShrink: 0,
                      }}
                    >
                      <Image
                        src={m.photo}
                        alt={`Portrait of ${m.name}`}
                        fill
                        sizes={`${PHOTO_SIZE_TEAM}px`}
                        className="object-cover"
                        unoptimized
                      />
                      {/* Corner brackets for terminal aesthetic */}
                      <Bracket position="tl" color={c.text} />
                      <Bracket position="tr" color={c.text} />
                      <Bracket position="bl" color={c.text} />
                      <Bracket position="br" color={c.text} />
                    </div>
                  ) : (
                    <div
                      className={`relative flex items-center justify-center border ${c.border} ${c.bg}`}
                      style={{
                        width: PHOTO_SIZE_TEAM,
                        height: PHOTO_SIZE_TEAM,
                        minWidth: PHOTO_SIZE_TEAM,
                        flexShrink: 0,
                      }}
                    >
                      <span
                        className={`font-[family-name:var(--font-michroma)] tracking-[0.1em] ${c.text}`}
                        style={{ fontSize: 42 }}
                      >
                        {m.initials}
                      </span>
                      <Bracket position="tl" color={c.text} />
                      <Bracket position="tr" color={c.text} />
                      <Bracket position="bl" color={c.text} />
                      <Bracket position="br" color={c.text} />
                    </div>
                  )}

                  <div className="space-y-5 min-w-0">
                    <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
                      <div>
                        <div className="font-[family-name:var(--font-michroma)] text-xl md:text-2xl tracking-[0.06em] text-foreground leading-tight">
                          {m.name}
                        </div>
                        <div className={`mt-2 font-[family-name:var(--font-michroma)] text-[10px] tracking-[0.3em] ${c.text}`}>
                          {m.role.toUpperCase()}
                        </div>
                      </div>
                      {m.linkedin && (
                        <a
                          href={m.linkedin}
                          target="_blank"
                          rel="noreferrer"
                          className={`inline-flex items-center gap-2 px-3 py-1.5 border ${c.border} bg-surface rounded font-[family-name:var(--font-michroma)] text-[9px] tracking-[0.25em] ${c.text} hover:bg-surface-elevated transition-colors w-fit`}
                        >
                          <span>LINKEDIN</span>
                          <span aria-hidden>›</span>
                        </a>
                      )}
                    </div>

                    <div className="grid gap-4 md:grid-cols-3">
                      <BioBlock label="EXPERTISE"  body={m.expertise}  accent={c.text} />
                      <BioBlock label="BACKGROUND" body={m.background} accent={c.text} />
                      <BioBlock label="EDUCATION"  body={m.education}  accent={c.text} />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      {/* Advisors — horizontal cards (smaller than team) */}
      <Section className="py-20 md:py-24 border-t border-border">
        <div className="space-y-3 mb-10">
          <SectionLabel color="amber">ADVISORS</SectionLabel>
          <SectionHeading>Senior research and risk-modeling counsel.</SectionHeading>
        </div>

        <div className="space-y-4">
          {ADVISORS.map((a) => {
            const c = colorMap[a.color];
            return (
              <div
                key={a.name}
                className={`relative bg-surface-elevated border border-border rounded-lg p-5 md:p-6 transition-colors ${c.soft}`}
              >
                <div className="grid gap-5 md:gap-6 md:grid-cols-[auto_1fr] items-start">
                  {/* Boxy headshot or initials */}
                  {a.photo ? (
                    <div
                      className={`relative overflow-hidden border ${c.border} bg-surface`}
                      style={{
                        width: PHOTO_SIZE_ADVISOR,
                        height: PHOTO_SIZE_ADVISOR,
                        minWidth: PHOTO_SIZE_ADVISOR,
                        flexShrink: 0,
                      }}
                    >
                      <Image
                        src={a.photo}
                        alt={`Portrait of ${a.name}`}
                        fill
                        sizes={`${PHOTO_SIZE_ADVISOR}px`}
                        className="object-cover"
                        unoptimized
                      />
                      <Bracket position="tl" color={c.text} />
                      <Bracket position="tr" color={c.text} />
                      <Bracket position="bl" color={c.text} />
                      <Bracket position="br" color={c.text} />
                    </div>
                  ) : (
                    <div
                      className={`relative flex items-center justify-center border ${c.border} ${c.bg}`}
                      style={{
                        width: PHOTO_SIZE_ADVISOR,
                        height: PHOTO_SIZE_ADVISOR,
                        minWidth: PHOTO_SIZE_ADVISOR,
                        flexShrink: 0,
                      }}
                    >
                      <span
                        className={`font-[family-name:var(--font-michroma)] tracking-[0.1em] ${c.text}`}
                        style={{ fontSize: 28 }}
                      >
                        {a.initials}
                      </span>
                      <Bracket position="tl" color={c.text} />
                      <Bracket position="tr" color={c.text} />
                      <Bracket position="bl" color={c.text} />
                      <Bracket position="br" color={c.text} />
                    </div>
                  )}

                  <div className="space-y-4 min-w-0">
                    <div>
                      <div className="font-[family-name:var(--font-michroma)] text-base md:text-lg tracking-[0.05em] text-foreground leading-tight">
                        {a.name}
                      </div>
                      <div className={`mt-1.5 font-[family-name:var(--font-michroma)] text-[9px] tracking-[0.3em] ${c.text}`}>
                        {a.role.toUpperCase()}
                      </div>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <BioBlock label="EXPERTISE"  body={a.expertise}  accent={c.text} />
                      <BioBlock label="BACKGROUND" body={a.background} accent={c.text} />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      {/* Partners */}
      <Section className="py-16 md:py-20 border-t border-border">
        <div className="space-y-3 mb-8">
          <SectionLabel color="green">PARTNERS</SectionLabel>
          <SectionHeading>Backed by world-class infrastructure and research.</SectionHeading>
        </div>

        <div className="grid gap-px bg-border border border-border rounded-lg overflow-hidden md:grid-cols-3">
          {PARTNERS.map((p) => (
            <div
              key={p}
              className="bg-surface-elevated p-8 flex items-center justify-center hover:bg-surface transition-colors"
            >
              <span className="font-[family-name:var(--font-michroma)] text-sm tracking-[0.3em] text-foreground/80">
                {p}
              </span>
            </div>
          ))}
        </div>
      </Section>

      {/* Hiring band */}
      <Section className="py-16 md:py-20 border-t border-border">
        <div className="bg-surface border border-border rounded-lg p-6 md:p-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-3 max-w-xl">
            <SectionLabel color="cyan">JOIN US</SectionLabel>
            <h3 className="font-[family-name:var(--font-michroma)] text-xl md:text-2xl tracking-[0.06em] text-foreground leading-[1.3]">
              Building causal-intelligence systems is a small-team problem.
            </h3>
            <p className="text-[12px] font-mono text-text-muted leading-relaxed">
              We&apos;re selectively expanding across engineering, quantitative
              research, and domain-specialist roles.
            </p>
          </div>
          <div className="shrink-0">
            <CTAButton href={`mailto:${SITE.email}`} variant="primary" external>
              {SITE.email.toUpperCase()}
            </CTAButton>
          </div>
        </div>
      </Section>
    </>
  );
}

function BioBlock({ label, body, accent }: { label: string; body: string; accent: string }) {
  return (
    <div className="space-y-1.5">
      <div className={`font-[family-name:var(--font-michroma)] text-[9px] tracking-[0.3em] ${accent}`}>
        {label}
      </div>
      <p className="text-[12px] font-mono text-foreground/85 leading-relaxed">
        {body}
      </p>
    </div>
  );
}

function Bracket({ position, color }: { position: "tl" | "tr" | "bl" | "br"; color: string }) {
  const base = "absolute pointer-events-none";
  const map = {
    tl: { container: "top-1.5 left-1.5",     side1: "top-0 left-0 w-3 h-px",     side2: "top-0 left-0 w-px h-3" },
    tr: { container: "top-1.5 right-1.5",    side1: "top-0 right-0 w-3 h-px",    side2: "top-0 right-0 w-px h-3" },
    bl: { container: "bottom-1.5 left-1.5",  side1: "bottom-0 left-0 w-3 h-px",  side2: "bottom-0 left-0 w-px h-3" },
    br: { container: "bottom-1.5 right-1.5", side1: "bottom-0 right-0 w-3 h-px", side2: "bottom-0 right-0 w-px h-3" },
  };
  const m = map[position];
  return (
    <div className={`${base} ${m.container}`} style={{ width: 12, height: 12 }}>
      <span className={`absolute ${m.side1} ${color.replace("text-", "bg-")}`} style={{ opacity: 0.7 }} />
      <span className={`absolute ${m.side2} ${color.replace("text-", "bg-")}`} style={{ opacity: 0.7 }} />
    </div>
  );
}
