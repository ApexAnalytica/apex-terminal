"use client";

import { useState } from "react";
import Link from "next/link";
import type { CapabilityGapReport, GapGroup } from "@/lib/copilot/capability-gaps";

export default function CopilotGapsAdminList({
  report,
}: {
  report: CapabilityGapReport;
}) {
  const noToolPct =
    report.total_turns > 0
      ? Math.round((1 - report.turns_with_tools / report.total_turns) * 100)
      : 0;

  return (
    <div className="min-h-screen bg-background text-foreground p-6 font-mono">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-[14px] font-[family-name:var(--font-michroma)] tracking-wider">
              COPILOT GAPS
            </h1>
            <div className="text-[10px] text-text-muted mt-1">
              Actions users asked the copilot to do that it couldn&apos;t — across
              all users. Refresh after more usage to re-rank.
            </div>
          </div>
          <Link
            href="/admin"
            className="text-[10px] tracking-wider text-text-muted hover:text-foreground transition-colors"
          >
            ← ADMIN
          </Link>
        </div>

        {/* Summary */}
        <div className="flex flex-wrap gap-6 mb-8 border-b border-border/60 pb-4">
          <Stat label="turns analyzed" value={report.total_turns} />
          <Stat label="fired no tool" value={`${noToolPct}%`} />
          <Stat
            label="explicit refusals"
            value={report.explicit_refusal_count}
            tone={report.explicit_refusal_count > 0 ? "warn" : "default"}
          />
          <Stat
            label="suspected gaps"
            value={report.suspected_gap_count}
            tone={report.suspected_gap_count > 0 ? "warn" : "default"}
          />
        </div>

        <GapSection
          title="EXPLICITLY REFUSED"
          subtitle={'the copilot said "I can’t do that yet" — high confidence'}
          groups={report.explicit_refusals}
          accent="text-accent-amber"
        />
        <GapSection
          title="SUSPECTED GAPS"
          subtitle="action asked, no tool fired — needs review"
          groups={report.suspected_gaps}
          accent="text-accent-cyan"
        />

        {report.total_turns === 0 && (
          <div className="text-[11px] text-text-muted mt-8 leading-relaxed">
            No copilot traces yet. As people use the copilot, the gaps they hit
            will surface here automatically.
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number | string;
  tone?: "default" | "warn";
}) {
  return (
    <div className="leading-tight">
      <div
        className={`text-[16px] font-[family-name:var(--font-michroma)] ${
          tone === "warn" ? "text-accent-amber" : "text-foreground"
        }`}
      >
        {value}
      </div>
      <div className="text-[8px] text-text-muted tracking-wider uppercase">
        {label}
      </div>
    </div>
  );
}

function GapSection({
  title,
  subtitle,
  groups,
  accent,
}: {
  title: string;
  subtitle: string;
  groups: GapGroup[];
  accent: string;
}) {
  return (
    <div className="mb-10">
      <div className="mb-3">
        <div
          className={`text-[11px] font-[family-name:var(--font-michroma)] tracking-[0.2em] ${accent}`}
        >
          {title}
        </div>
        <div className="text-[9px] text-text-muted mt-1">{subtitle}</div>
      </div>
      {groups.length === 0 ? (
        <div className="text-[10px] text-text-muted/70 italic">none</div>
      ) : (
        <div className="space-y-2">
          {groups.map((g) => (
            <GapRow key={g.signature} group={g} />
          ))}
        </div>
      )}
    </div>
  );
}

function GapRow({ group }: { group: GapGroup }) {
  const [open, setOpen] = useState(false);
  const expandable = group.examples.length > 1;
  return (
    <div className="border border-border rounded bg-surface">
      <button
        type="button"
        onClick={() => expandable && setOpen((o) => !o)}
        className={`w-full flex items-center justify-between px-4 py-2.5 text-left transition-colors ${
          expandable ? "hover:border-accent-cyan/40" : "cursor-default"
        }`}
      >
        <span className="text-[11px] text-foreground truncate pr-3">
          {group.examples[0] ?? group.signature}
        </span>
        <span className="text-[12px] font-[family-name:var(--font-michroma)] text-accent-amber shrink-0">
          {group.count}&times;
        </span>
      </button>
      {open && (
        <div className="px-4 pb-3 pt-1 border-t border-border/50 space-y-1">
          {group.examples.map((ex, i) => (
            <div key={i} className="text-[10px] text-text-muted leading-relaxed">
              &bull; {ex}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
