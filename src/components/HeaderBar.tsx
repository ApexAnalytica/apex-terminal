"use client";

import { OmegaState } from "@/lib/types";
import CDOmegaMonitor from "./CDOmegaMonitor";

interface HeaderBarProps {
  state: OmegaState;
}

export default function HeaderBar({ state }: HeaderBarProps) {
  return (
    <header className="flex items-center justify-between px-6 h-14 border-b border-border bg-surface-elevated relative scanlines">
      {/* Left: Logo */}
      <div className="flex items-center gap-4">
        <div className="flex flex-col">
          <span className="font-[family-name:var(--font-michroma)] text-[13px] tracking-[0.2em] text-foreground">
            APEX
          </span>
          <span className="font-[family-name:var(--font-michroma)] text-[8px] tracking-[0.35em] text-text-muted -mt-0.5">
            ANALYTICA
          </span>
        </div>
        <div className="h-8 w-px bg-border" />
        <div className="flex flex-col">
          <span className="font-[family-name:var(--font-michroma)] text-[10px] tracking-[0.15em] text-accent-cyan">
            CAUSAL INTELLIGENCE TERMINAL
          </span>
          <span className="text-[9px] text-text-muted font-mono tracking-wider">
            &Omega;-Critical AI Systems&trade; Playbook
          </span>
        </div>
      </div>

      {/* Center: CDΩ Monitor */}
      <CDOmegaMonitor state={state} />

      {/* Right: Meta */}
      <div className="flex items-center gap-4">
        <div className="flex flex-col items-end">
          <span className="text-[9px] text-text-muted font-mono tracking-wider">
            TECH 2.0
          </span>
          <span className="text-[9px] text-text-muted font-mono">
            CAUSAL DERIVATION
          </span>
        </div>
        <div className="h-8 w-px bg-border" />
        <div className="flex flex-col items-end">
          <span className="text-[9px] text-text-muted font-mono tracking-wider">
            SESSION
          </span>
          <span className="text-[9px] text-accent-green font-mono">
            ACTIVE
          </span>
        </div>
      </div>
    </header>
  );
}
