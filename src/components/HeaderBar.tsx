"use client";

import { useApexStore } from "@/stores/useApexStore";
import WorkspaceContextBar from "./WorkspaceContextBar";
import SettingsMenu from "./SettingsMenu";
import { ModuleId } from "@/lib/types";
import { DOMAIN_CARDS } from "@/lib/domains";
import DomainIcon from "./DomainIcon";
import { MODULE_TABS as GEOPOLITICAL_TABS } from "@/lib/module-tabs";

// Top-bar tabs are pinned to the four canonical labels regardless of active
// domain profile. Profile-scoped vocabulary lives in the right panel / pillar
// bars / methodology popup only.
const MODULE_TABS = GEOPOLITICAL_TABS.map((m) => ({
  id: m.id as ModuleId,
  label: m.name,
  icon: m.icon,
  color: m.color,
}));

export default function HeaderBar() {
  const activeModule = useApexStore((s) => s.activeModule);
  const setActiveModule = useApexStore((s) => s.setActiveModule);
  const selectedDomains = useApexStore((s) => s.selectedDomains);
  const setDomainSelectorOpen = useApexStore((s) => s.setDomainSelectorOpen);

  return (
    <header className="flex items-center justify-between px-3 md:px-6 h-14 border-b border-border bg-surface-elevated relative scanlines overflow-visible">
      {/* Left: Logo + Tabs */}
      <div className="flex items-center gap-2 md:gap-4 shrink-0 min-w-0 z-10 bg-surface-elevated">
        <div className="flex flex-col shrink-0">
          <span className="font-[family-name:var(--font-michroma)] text-[13px] md:text-[15px] tracking-[0.3em] text-accent-cyan font-medium">
            MANIFOLD
          </span>
          <span className="font-[family-name:var(--font-michroma)] text-[7px] tracking-[0.25em] text-text-muted -mt-0.5 hidden sm:block">
            by APEX ANALYTICA
          </span>
        </div>
        <div className="h-8 w-px bg-border hidden sm:block" />

        {/* Selected Domains */}
        {selectedDomains.length > 0 && (
          <>
            <button
              onClick={() => setDomainSelectorOpen(true)}
              className="flex items-center gap-1.5 px-2 py-1 rounded border border-border hover:border-accent-cyan/40 transition-colors group shrink-0"
              title="Change domain workspace"
              data-tour="domain-selector-trigger"
            >
              {selectedDomains.map((id) => {
                const domain = DOMAIN_CARDS.find((d) => d.id === id);
                if (!domain) return null;
                return (
                  <DomainIcon
                    key={id}
                    name={domain.icon}
                    size={14}
                    color={domain.color}
                    title={domain.label}
                  />
                );
              })}
              <span className="text-[8px] font-mono text-text-muted group-hover:text-accent-cyan transition-colors ml-0.5 hidden md:inline">
                {selectedDomains.length > 1 ? "MULTI" : "SINGLE"}
              </span>
            </button>
            <div className="h-8 w-px bg-border hidden md:block" />
          </>
        )}

        {/* Module Tabs — icons only on small screens */}
        <div className="flex items-center gap-0.5 md:gap-1" data-tour="module-tabs">
          {MODULE_TABS.map((tab) => {
            const isActive = activeModule === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveModule(tab.id)}
                className="flex items-center gap-1 md:gap-1.5 px-1.5 md:px-3 py-1.5 rounded text-[9px] font-[family-name:var(--font-michroma)] tracking-wider transition-colors"
                style={{
                  color: isActive ? tab.color : "var(--text-muted)",
                  backgroundColor: isActive
                    ? `color-mix(in srgb, ${tab.color} 10%, transparent)`
                    : "transparent",
                  borderBottom: isActive ? `1px solid ${tab.color}` : "1px solid transparent",
                }}
                title={tab.label}
              >
                <span className="text-xs">{tab.icon}</span>
                <span className="hidden md:inline">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Center: workspace context — allowed to shrink and clip when narrow */}
      <div className="min-w-0 overflow-hidden flex justify-center px-2">
        <WorkspaceContextBar />
      </div>

      {/* Right: single settings dropdown — z-10 so it sits above the center */}
      <div className="flex items-center gap-1.5 md:gap-3 shrink-0 z-10 bg-surface-elevated">
        <SettingsMenu />
      </div>
    </header>
  );
}
