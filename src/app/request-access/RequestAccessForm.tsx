"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { TIER_LABELS, type Tier } from "@/lib/billing";

const VALID_TIER_HINTS: ReadonlyArray<Tier> = [
  "analyst",
  "multi_domain",
  "enterprise",
];

export default function RequestAccessForm() {
  const sp = useSearchParams();
  const tierHintRaw = sp.get("tier");
  const tierHint = (VALID_TIER_HINTS as ReadonlyArray<string>).includes(
    tierHintRaw ?? ""
  )
    ? (tierHintRaw as Tier)
    : null;

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [org, setOrg] = useState("");
  const [useCase, setUseCase] = useState(
    tierHint ? `Interested in the ${TIER_LABELS[tierHint]} tier. ` : ""
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/request-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          organization: org.trim(),
          useCase: useCase.trim() || null,
          source: tierHint ? `pricing-${tierHint}` : "request-access",
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? `HTTP ${res.status}`);
        return;
      }
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="bg-surface border border-accent-cyan/30 rounded p-6 space-y-4 text-center">
        <div className="text-[11px] font-[family-name:var(--font-michroma)] tracking-wider text-accent-cyan">
          REQUEST RECEIVED
        </div>
        <p className="text-[11px] font-mono text-text-muted leading-relaxed">
          Thanks for reaching out. A member of the Apex Analytica team
          will respond within one business day to scope a 48-hour pilot.
        </p>
        <Link
          href="/pricing"
          className="inline-block text-[10px] font-mono text-accent-cyan/70 hover:text-accent-cyan"
        >
          ← BACK TO PRICING
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="bg-surface border border-border rounded p-4 space-y-2">
        <div className="text-[10px] font-[family-name:var(--font-michroma)] tracking-wider text-accent-cyan">
          INSTITUTIONAL EVALUATION
        </div>
        <div className="text-[11px] font-mono text-text-muted leading-relaxed">
          Manifold is provisioned per-seat, per institution. Tell us
          who you are and what you&apos;re evaluating. A 48-hour pilot
          follows the introductory call.
          {tierHint && (
            <>
              {" "}
              Inquiry tier:{" "}
              <span className="text-accent-cyan">{TIER_LABELS[tierHint]}</span>.
            </>
          )}
        </div>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Name">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="Jane Doe"
            className="w-full px-3 py-2.5 bg-surface border border-border rounded text-sm font-mono text-foreground placeholder:text-text-muted/50 focus:outline-none focus:border-accent-cyan/60 transition-colors"
          />
        </Field>
        <Field label="Work email">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="jane@institution.com"
            className="w-full px-3 py-2.5 bg-surface border border-border rounded text-sm font-mono text-foreground placeholder:text-text-muted/50 focus:outline-none focus:border-accent-cyan/60 transition-colors"
          />
        </Field>
        <Field label="Organization">
          <input
            type="text"
            value={org}
            onChange={(e) => setOrg(e.target.value)}
            required
            placeholder="Fund · Bank · Sovereign · Defense · Research"
            className="w-full px-3 py-2.5 bg-surface border border-border rounded text-sm font-mono text-foreground placeholder:text-text-muted/50 focus:outline-none focus:border-accent-cyan/60 transition-colors"
          />
        </Field>
        <Field label="What are you evaluating?">
          <textarea
            value={useCase}
            onChange={(e) => setUseCase(e.target.value)}
            rows={4}
            placeholder="Briefly: which risk domain, which decision, which timescale."
            className="w-full px-3 py-2.5 bg-surface border border-border rounded text-sm font-mono text-foreground placeholder:text-text-muted/50 focus:outline-none focus:border-accent-cyan/60 transition-colors resize-none"
          />
        </Field>

        {error && (
          <div className="text-[11px] font-mono text-accent-red bg-accent-red/10 border border-accent-red/20 rounded px-3 py-2">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-2.5 bg-accent-cyan/10 border border-accent-cyan/40 rounded text-[11px] font-[family-name:var(--font-michroma)] tracking-wider text-accent-cyan hover:bg-accent-cyan/20 hover:border-accent-cyan/60 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? "SUBMITTING..." : "REQUEST ACCESS"}
        </button>
      </form>

      <p className="text-center text-[10px] font-mono text-text-muted">
        Already have access?{" "}
        <Link
          href="/login"
          className="text-accent-cyan/70 hover:text-accent-cyan"
        >
          Sign in
        </Link>
      </p>
    </>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-mono text-text-muted tracking-wider uppercase">
        {label}
      </label>
      {children}
    </div>
  );
}
