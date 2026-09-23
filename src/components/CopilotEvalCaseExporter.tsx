"use client";

// ─── Eval Case Exporter ────────────────────────────────────────
//
// Inline form rendered beneath an expanded trace row. Lets the
// user turn a captured turn into a TestCase TS snippet they can
// paste into src/lib/copilot/eval/cases/seed.ts.
//
// Why TS-snippet-to-clipboard, not DB-backed cases:
//   - Keeps the eval reviewable in PRs (the case lands as code)
//   - CI gate doesn't depend on prod data — no dev/prod skew
//   - Clear ownership: the seed set is curated, not a free-for-all
//
// Long-term we may add a DB-backed flow for bulk capture, but the
// canonical eval set should live in code.

import { useMemo, useState } from "react";
import {
  buildCaseSnippet,
  defaultFormFromTrace,
  type CaseSeedForm,
  type CaseSeedInput,
} from "@/lib/copilot/eval/case-snippet";

interface Props {
  trace: CaseSeedInput;
  onClose: () => void;
}

export default function CopilotEvalCaseExporter({ trace, onClose }: Props) {
  const [form, setForm] = useState<CaseSeedForm>(() => defaultFormFromTrace(trace));
  const [copied, setCopied] = useState(false);

  const snippet = useMemo(() => buildCaseSnippet(trace, form), [trace, form]);

  const update = <K extends keyof CaseSeedForm>(k: K, v: CaseSeedForm[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // clipboard write blocked (no HTTPS in dev sometimes) — user
      // can select-all + copy manually from the textarea.
    }
  };

  return (
    <div className="mt-2 pt-2 border-t border-border space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[8px] font-[family-name:var(--font-michroma)] tracking-wider text-accent-cyan">
          ADD AS EVAL CASE
        </span>
        <button
          onClick={onClose}
          className="text-[10px] text-text-muted hover:text-foreground transition-colors"
          title="Cancel"
        >
          ✕
        </button>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <Field label="ID" hint="snake_case; unique within seed.ts">
          <input
            value={form.id}
            onChange={(e) => update("id", e.target.value)}
            spellCheck={false}
            className={inputClass}
          />
        </Field>
        <Field label="GRAPH FIXTURE" hint="see seed.ts buildFixture">
          <select
            value={form.graph_fixture}
            onChange={(e) => update("graph_fixture", e.target.value)}
            className={inputClass}
          >
            <option value="geopolitical_main">geopolitical_main</option>
            <option value="small_energy">small_energy</option>
            <option value="empty">empty</option>
          </select>
        </Field>
      </div>

      <Field label="DESCRIPTION" hint="one line; what the case tests">
        <textarea
          value={form.description}
          onChange={(e) => update("description", e.target.value)}
          rows={2}
          className={inputClass}
        />
      </Field>

      <Field label="TAGS" hint="comma-separated">
        <input
          value={form.tags ?? ""}
          onChange={(e) => update("tags", e.target.value)}
          spellCheck={false}
          className={inputClass}
        />
      </Field>

      <div className="grid grid-cols-2 gap-1.5">
        <Field label="REQUIRED IN RESPONSE" hint="one regex per line">
          <textarea
            value={form.required_in_response ?? ""}
            onChange={(e) => update("required_in_response", e.target.value)}
            rows={2}
            placeholder="e.g.  energy"
            className={inputClass}
          />
        </Field>
        <Field label="FORBIDDEN IN RESPONSE" hint="one regex per line">
          <textarea
            value={form.forbidden_in_response ?? ""}
            onChange={(e) => update("forbidden_in_response", e.target.value)}
            rows={2}
            placeholder="e.g.  cannot|refuse"
            className={inputClass}
          />
        </Field>
      </div>

      <label className="flex items-center gap-1.5 text-[10px] font-mono text-text-muted">
        <input
          type="checkbox"
          checked={form.forbid_tool_calls ?? false}
          onChange={(e) => update("forbid_tool_calls", e.target.checked)}
        />
        forbid_tool_calls (assert no tool was emitted)
      </label>

      <div className="space-y-1">
        <div className="text-[8px] font-[family-name:var(--font-michroma)] tracking-wider text-text-muted">
          GENERATED SNIPPET — paste into <span className="text-accent-cyan">src/lib/copilot/eval/cases/seed.ts</span>
        </div>
        <textarea
          readOnly
          value={snippet}
          rows={Math.min(14, snippet.split("\n").length + 1)}
          className="w-full bg-surface-elevated font-mono text-[9px] text-foreground outline-none px-2 py-1 rounded border border-border resize-none"
          onFocus={(e) => e.currentTarget.select()}
        />
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={handleCopy}
          className="flex-1 text-[9px] font-[family-name:var(--font-michroma)] tracking-wider px-2 py-1.5 rounded border border-accent-cyan text-accent-cyan hover:bg-accent-cyan/10 transition-all"
        >
          {copied ? "✓ COPIED" : "COPY TO CLIPBOARD"}
        </button>
        <a
          href="https://github.com/ApexAnalytica/apex-terminal/blob/main/src/lib/copilot/eval/cases/seed.ts"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[9px] font-mono text-text-muted hover:text-accent-cyan transition-colors"
        >
          open seed.ts ↗
        </a>
      </div>
    </div>
  );
}

// ─── Internals ─────────────────────────────────────────────────

const inputClass =
  "w-full bg-surface font-mono text-[10px] text-foreground outline-none px-2 py-1 rounded border border-border placeholder:text-text-muted/60 focus:border-accent-cyan/50 transition-colors";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-0.5">
      <div className="text-[8px] font-[family-name:var(--font-michroma)] tracking-wider text-text-muted flex items-baseline gap-1.5">
        <span>{label}</span>
        {hint && <span className="text-text-muted/60 normal-case tracking-normal">— {hint}</span>}
      </div>
      {children}
    </div>
  );
}
