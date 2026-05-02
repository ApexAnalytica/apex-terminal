"use client";

import {
  CAPABILITY_META,
  tailwindClassesForTone,
  type Capability,
} from "@/lib/capability";

// ─── CapabilityBadge ─────────────────────────────────────────────────
//
// Small reusable badge that surfaces the truth-state of any capability
// in the platform. Matches the existing brand: monospace, small caps,
// rounded border, tone-coloured. Hover reveals the description.
//
// Used by:
//   - DiscoveryRunsPanel (per algorithm tab)
//   - TissueCohortView (top of view, indicating "live-synthetic")
//   - SystemCopilot intro (overall platform status)
//   - Anywhere a capability label adds clarity.

export interface CapabilityBadgeProps {
  capability: Capability;
  /** Optional override label if the canonical label doesn't fit context. */
  labelOverride?: string;
  /** Optional className passthrough. */
  className?: string;
}

export default function CapabilityBadge({
  capability,
  labelOverride,
  className = "",
}: CapabilityBadgeProps) {
  const meta = CAPABILITY_META[capability];
  const tw = tailwindClassesForTone(meta.tone);
  return (
    <span
      title={meta.description}
      className={
        `inline-flex items-center gap-1 px-1.5 py-0.5 rounded border ${tw.border} ${tw.bg} ${tw.text} ` +
        `text-[7px] font-[family-name:var(--font-michroma)] tracking-wider whitespace-nowrap ${className}`
      }
    >
      <span aria-hidden className="opacity-70">●</span>
      {labelOverride ?? meta.label}
    </span>
  );
}
