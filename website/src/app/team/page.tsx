import Image from "next/image";
import { Section, TerminalHeader } from "@/components/ui/Section";
import CTAButton from "@/components/ui/CTAButton";
import { SITE } from "@/lib/site";

const TEAM = [
  {
    name: "Dr. Junaid Ghauri",
    role: "Principal Scientist · CEO",
    color: "cyan",
    initials: "JG",
    photo: "/team/junaid.png",
    linkedin: "https://www.linkedin.com/in/jghauri/",
    scholar: null,
    expertise:
      "Computational mathematics, advanced analytics, quantitative finance, network topology, quantum information and decision-making.",
    background:
      "Ex-General Partner at Pareto Technologies. Former CTO at MARK LABS. Chair of the Board at Emerta.",
    education: "Doctor of Engineering, Johns Hopkins University.",
  },
  {
    name: "Dr. Georgios Korpas",
    role: "Head of Research",
    color: "amber",
    initials: "GK",
    photo: "/team/gergios.png",
    linkedin: "https://www.linkedin.com/in/georgios-korpas/",
    scholar: "https://scholar.google.com/citations?user=pOcS2dkAAAAJ",
    expertise:
      "Quantum algorithms, hybrid computing for continuous optimization, collateral optimization, AI-quantum integration.",
    background:
      "AI, optimization, applied mathematics, and quantum computing at HSBC. Lead Researcher at the Archimedes AI Research Hub.",
    education:
      "Ph.D. in Mathematics, Trinity College Dublin. Visiting Ph.D. Scholar at Stanford University.",
  },
] as const;

const ADVISORS = [
  {
    name: "Dr. Takeru Igusa",
    role: "Technical Advisor · Systems Engineering",
    color: "cyan",
    initials: "TI",
    photo: "/team/igusa.png",
    scholar: "https://scholar.google.com/citations?user=g2Whhq0AAAAJ",
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
    scholar: "https://scholar.google.com/citations?user=BLx3FSQAAAAJ",
    expertise: "Natural-disaster risk, climate change, and infrastructure vulnerability.",
    background:
      "Associate Research Scientist at Johns Hopkins University. Senior Consultant at the World Bank.",
  },
  {
    name: "Dr. Arnesh Telukdarie",
    role: "Digital Business & AI Expert",
    color: "purple",
    initials: "AT",
    photo: "/team/telukdarie.png",
    scholar: "https://scholar.google.com/citations?user=LpNn2QUAAAAJ",
    expertise: "AI and large-scale systems design.",
    background:
      "Professor at the University of Johannesburg with extensive industry experience.",
  },
] as const;

const PARTNERS: {
  name: string;
  logo: string;
  alt: string;
  naturalW: number;
  naturalH: number;
  mono?: boolean;
}[] = [
  { name: "AWS",                     logo: "/partners/aws.svg",    alt: "Amazon Web Services",      naturalW: 304, naturalH: 182, mono: true },
  { name: "JOHNS HOPKINS UNIVERSITY", logo: "/partners/jhu.svg",    alt: "Johns Hopkins University", naturalW: 375, naturalH: 65,  mono: true },
  { name: "NVIDIA",                  logo: "/partners/nvidia.svg", alt: "NVIDIA",                   naturalW: 656, naturalH: 120 },
];

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

export default function TeamPage() {
  return (
    <>
      {/* Header */}
      <section className="relative border-b border-border overflow-hidden">
        <div className="absolute inset-0 grid-bg opacity-40 mask-fade-edges" aria-hidden />
        <div className="relative mx-auto max-w-7xl px-4 md:px-6 pt-16 pb-12 md:pt-20 md:pb-14">
          <div className="flex items-center gap-3 mb-4">
            <span className="font-[family-name:var(--font-michroma)] text-[10px] tracking-[0.3em] text-accent-purple/90">
              // TEAM
            </span>
            <span className="font-mono text-[10px] text-text-muted/60">apex.people</span>
          </div>
          <h1 className="font-[family-name:var(--font-michroma)] text-3xl md:text-5xl tracking-[0.04em] leading-[1.15] text-foreground max-w-3xl">
            The people behind{" "}
            <span className="text-accent-cyan text-glow-cyan">Apex Analytica.</span>
          </h1>
          <p className="mt-5 text-sm md:text-base font-mono text-text-muted leading-relaxed max-w-2xl">
            An interdisciplinary team building causal risk intelligence for
            capital markets in an era of escalating catastrophes.
          </p>
        </div>
      </section>

      {/* Core team — mosaic grid */}
      <Section className="py-10 md:py-14 border-t border-border">
        <TerminalHeader
          label="// LEADERSHIP"
          path="apex.team"
          right={`${TEAM.length} MEMBERS`}
          color="cyan"
        />
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {TEAM.map((m) => (
            <PersonTile key={m.name} person={m} variant="team" />
          ))}
        </div>
      </Section>

      {/* Advisors — mosaic grid */}
      <Section className="py-10 md:py-14 border-t border-border">
        <TerminalHeader
          label="// ADVISORS"
          path="apex.advisors"
          right={`${ADVISORS.length} ADVISORS`}
          color="amber"
        />
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {ADVISORS.map((a) => (
            <PersonTile key={a.name} person={a} variant="advisor" />
          ))}
        </div>
      </Section>

      {/* Partners */}
      <Section className="py-10 md:py-14 border-t border-border">
        <TerminalHeader
          label="// PARTNERS"
          path="apex.partners"
          right="03 ALLIANCES"
          color="green"
        />
        <div className="grid gap-px bg-border border border-border rounded-lg overflow-hidden md:grid-cols-3">
          {PARTNERS.map((p) => (
            <div
              key={p.name}
              className="bg-surface-elevated px-8 py-10 flex items-center justify-center hover:bg-surface transition-colors min-h-[140px]"
              title={p.name}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.logo}
                alt={p.alt}
                width={p.naturalW}
                height={p.naturalH}
                className="opacity-80 hover:opacity-100 transition-opacity"
                style={{
                  height: 48,
                  width: (48 * p.naturalW) / p.naturalH,
                  ...(p.mono ? { filter: "brightness(0) invert(1)" } : {}),
                }}
              />
            </div>
          ))}
        </div>
      </Section>

      {/* Hiring band */}
      <Section className="py-12 md:py-16 border-t border-border">
        <div className="bg-surface border border-border rounded-lg p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="space-y-2 max-w-xl">
            <div className="font-[family-name:var(--font-michroma)] text-[10px] tracking-[0.3em] text-accent-cyan/90">
              // JOIN US
            </div>
            <div className="font-[family-name:var(--font-michroma)] text-xl md:text-2xl tracking-[0.06em] text-foreground leading-[1.3]">
              Building causal-intelligence systems is a small-team problem.
            </div>
            <p className="text-[12px] font-mono text-text-muted leading-relaxed">
              Selectively expanding across engineering, quantitative research,
              and domain-specialist roles.
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

type Person = {
  name: string;
  role: string;
  color: string;
  initials: string;
  photo: string | null;
  linkedin?: string | null;
  scholar: string | null;
  expertise: string;
  background: string;
  education?: string;
};

function PersonTile({
  person,
  variant,
}: {
  person: Person;
  variant: "team" | "advisor";
}) {
  const c = colorMap[person.color];
  const photoSize = variant === "team" ? 112 : 96;
  return (
    <div
      className={`relative bg-surface-elevated border border-border rounded-lg p-5 transition-colors flex flex-col gap-4 ${c.soft}`}
    >
      {/* Accent corner */}
      <div className={`absolute top-0 left-0 h-0.5 w-12 ${c.accentBg} opacity-70`} />

      {/* Photo + name row */}
      <div className="flex items-start gap-4">
        {person.photo ? (
          <div
            className={`relative overflow-hidden border ${c.border} bg-surface shrink-0`}
            style={{ width: photoSize, height: photoSize }}
          >
            <Image
              src={person.photo}
              alt={`Portrait of ${person.name}`}
              fill
              sizes={`${photoSize}px`}
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
            className={`relative flex items-center justify-center border ${c.border} ${c.bg} shrink-0`}
            style={{ width: photoSize, height: photoSize }}
          >
            <span
              className={`font-[family-name:var(--font-michroma)] tracking-[0.1em] ${c.text}`}
              style={{ fontSize: variant === "team" ? 28 : 22 }}
            >
              {person.initials}
            </span>
            <Bracket position="tl" color={c.text} />
            <Bracket position="tr" color={c.text} />
            <Bracket position="bl" color={c.text} />
            <Bracket position="br" color={c.text} />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="font-[family-name:var(--font-michroma)] text-base tracking-[0.04em] text-foreground leading-tight">
            {person.name}
          </div>
          <div className={`mt-1.5 font-[family-name:var(--font-michroma)] text-[9px] tracking-[0.25em] ${c.text} leading-snug`}>
            {person.role.toUpperCase()}
          </div>
        </div>
      </div>

      {/* Bio blocks */}
      <div className="space-y-3">
        <BioRow label="EXPERTISE" body={person.expertise} accent={c.text} />
        <BioRow label="BACKGROUND" body={person.background} accent={c.text} />
        {person.education && (
          <BioRow label="EDUCATION" body={person.education} accent={c.text} />
        )}
      </div>

      {/* Links footer */}
      {(person.linkedin || person.scholar) && (
        <div className="mt-auto flex flex-wrap gap-2 pt-2 border-t border-border/60">
          {person.linkedin && (
            <LinkChip href={person.linkedin} label="LINKEDIN" colorClass={c.text} borderClass={c.border} />
          )}
          {person.scholar && (
            <LinkChip href={person.scholar} label="PUBLICATIONS" colorClass={c.text} borderClass={c.border} />
          )}
        </div>
      )}
    </div>
  );
}

function BioRow({ label, body, accent }: { label: string; body: string; accent: string }) {
  return (
    <div className="space-y-1">
      <div className={`font-[family-name:var(--font-michroma)] text-[8px] tracking-[0.3em] ${accent}`}>
        {label}
      </div>
      <p className="text-[11.5px] font-mono text-foreground/85 leading-relaxed">
        {body}
      </p>
    </div>
  );
}

function LinkChip({
  href,
  label,
  colorClass,
  borderClass,
}: {
  href: string;
  label: string;
  colorClass: string;
  borderClass: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 border ${borderClass} bg-surface rounded font-[family-name:var(--font-michroma)] text-[8px] tracking-[0.25em] ${colorClass} hover:bg-surface transition-colors`}
    >
      <span>{label}</span>
      <span aria-hidden>›</span>
    </a>
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
