"use client";

import { useActionState, useEffect, useState } from "react";
import { submitAccessRequest, type AccessResult } from "./actions";

/**
 * Recognized `?source=` values surfaced in the form submission so
 * the inbound email tells Junaid which offer the visitor came in
 * on. Values not in this map are dropped (defense against random
 * URL-injected source strings landing in inboxes).
 */
const SOURCE_LABELS: Record<string, string> = {
  "founding-10": "Founding 10 (apex.founding)",
  "mini-audit": "ΩF Mini-Audit (apex.audit)",
};

const DOMAINS = [
  { value: "", label: "Select a domain (optional)" },
  { value: "manufacturing", label: "Manufacturing" },
  { value: "infrastructure", label: "Infrastructure" },
  { value: "economic", label: "Economic" },
  { value: "finance", label: "Finance" },
  { value: "energy", label: "Energy" },
  { value: "geopolitical", label: "Geopolitical" },
  { value: "science", label: "Science" },
  { value: "other", label: "Other / cross-domain" },
];

export default function AccessForm() {
  const [state, formAction, pending] = useActionState<AccessResult | null, FormData>(
    submitAccessRequest,
    null,
  );

  // Read `?source=` from the URL on mount and stash it in a hidden
  // input below. Server action picks it up and includes it in the
  // email body so we know whether the visitor came in via /founding,
  // /audit, or directly. Whitelist-validated against SOURCE_LABELS
  // so random / injected values don't propagate.
  const [source, setSource] = useState<string>("");
  const [sourceLabel, setSourceLabel] = useState<string>("");
  useEffect(() => {
    try {
      const raw = new URLSearchParams(window.location.search).get("source") ?? "";
      if (raw && SOURCE_LABELS[raw]) {
        setSource(raw);
        setSourceLabel(SOURCE_LABELS[raw]);
      }
    } catch {
      /* SSR / no-window — leave empty. */
    }
  }, []);

  if (state?.ok) {
    return (
      <div className="bg-surface-elevated border border-accent-cyan/30 rounded-lg p-6 md:p-8">
        <div className="flex items-center gap-2 mb-3">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-accent-cyan opacity-50 pulse-ring" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-accent-cyan" />
          </span>
          <span className="font-[family-name:var(--font-michroma)] text-[10px] tracking-[0.3em] text-accent-cyan">
            REQUEST RECEIVED
          </span>
        </div>
        <p className="font-mono text-[13px] md:text-sm text-foreground/90 leading-relaxed">
          Got it. We&apos;ve routed your request to{" "}
          <span className="text-accent-cyan">info@apexanalytica.co</span> and
          will be in touch within one business day.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {/* Source hidden field — captured from ?source= URL param above
          and posted with the form so the email tells Junaid which
          offer brought the visitor in (Founding 10, Mini-Audit). */}
      <input type="hidden" name="source" value={source} />

      {/* Visible source banner — confirms to the visitor that we
          know they came in from the offer they clicked, so the form
          doesn't feel like a generic dead-end. */}
      {sourceLabel && (
        <div className="flex items-center gap-2 px-3 py-2 border border-accent-cyan/30 bg-accent-cyan/5 rounded">
          <span className="h-1.5 w-1.5 rounded-full bg-accent-cyan" />
          <span className="font-mono text-[11px] text-accent-cyan/90 leading-tight">
            Coming in from{" "}
            <span className="text-accent-cyan">{sourceLabel}</span> — we&apos;ll
            handle the next step manually until checkout is wired.
          </span>
        </div>
      )}

      {/* Honeypot — hidden from humans, bots fill it in */}
      <div aria-hidden className="hidden" style={{ display: "none" }}>
        <label>
          Company website
          <input type="text" name="company_website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="NAME" name="name" required autoComplete="name" />
        <Field
          label="WORK EMAIL"
          name="email"
          type="email"
          required
          autoComplete="email"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="ORGANIZATION" name="org" autoComplete="organization" />
        <Select label="DOMAIN INTEREST" name="domain" options={DOMAINS} />
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="useCase"
          className="block font-[family-name:var(--font-michroma)] text-[9px] tracking-[0.3em] text-text-muted"
        >
          USE CASE
        </label>
        <textarea
          id="useCase"
          name="useCase"
          rows={4}
          maxLength={4000}
          placeholder="What system are you trying to map? Optional, but it helps us route the conversation."
          className="w-full bg-surface border border-border rounded-md px-3 py-2.5 font-mono text-[13px] text-foreground placeholder:text-text-muted/50 focus:outline-none focus:border-accent-cyan/60 resize-y"
        />
      </div>

      {state?.ok === false && (
        <div className="border border-accent-red/40 bg-accent-red/5 rounded-md px-4 py-3 font-mono text-[12.5px] text-accent-red leading-relaxed">
          {state.error}
        </div>
      )}

      <div className="flex items-center justify-between gap-4 pt-2 flex-wrap">
        <p className="text-[11px] font-mono text-text-muted/80 leading-relaxed max-w-md">
          We&apos;ll route this to info@apexanalytica.co and respond within one
          business day.
        </p>
        <button
          type="submit"
          disabled={pending}
          className="px-5 py-2.5 bg-accent-cyan/10 border border-accent-cyan/40 rounded text-[10px] font-[family-name:var(--font-michroma)] tracking-[0.3em] text-accent-cyan hover:bg-accent-cyan/20 hover:border-accent-cyan/60 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {pending ? "SENDING…" : "REQUEST ACCESS ›"}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  type = "text",
  required = false,
  autoComplete,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  autoComplete?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={name}
        className="block font-[family-name:var(--font-michroma)] text-[9px] tracking-[0.3em] text-text-muted"
      >
        {label}
        {required && <span className="text-accent-cyan/70 ml-1">*</span>}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        autoComplete={autoComplete}
        maxLength={type === "email" ? 320 : 200}
        className="w-full bg-surface border border-border rounded-md px-3 py-2.5 font-mono text-[13px] text-foreground placeholder:text-text-muted/50 focus:outline-none focus:border-accent-cyan/60"
      />
    </div>
  );
}

function Select({
  label,
  name,
  options,
}: {
  label: string;
  name: string;
  options: ReadonlyArray<{ value: string; label: string }>;
}) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={name}
        className="block font-[family-name:var(--font-michroma)] text-[9px] tracking-[0.3em] text-text-muted"
      >
        {label}
      </label>
      <select
        id={name}
        name={name}
        defaultValue=""
        className="w-full bg-surface border border-border rounded-md px-3 py-2.5 font-mono text-[13px] text-foreground focus:outline-none focus:border-accent-cyan/60"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} className="bg-background">
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
