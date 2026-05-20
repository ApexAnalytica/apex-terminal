"use client";

import { useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useApexStore } from "@/stores/useApexStore";
import { useUserAccess } from "@/hooks/useUserAccess";
import {
  DOMAIN_CARDS,
  DOMAIN_GROUPS,
  PERSONAS,
  PERSONA_GROUPS,
  type DomainCard,
  type Persona,
} from "@/lib/domains";
import {
  buildGraphFromDomains,
  DATASET_NODE_COUNTS,
} from "@/lib/build-domain-graph";
import type { NodeCategory } from "@/lib/types";
import TTSControls from "@/components/TTSControls";
import DomainIcon, { type DomainIconName } from "@/components/DomainIcon";
import { WELCOME_DESCRIPTION } from "@/lib/tour-steps";
import { DemoFlowPicker } from "@/components/DemoFlowPlayer";

// Re-export catalog/builder from this module's old surface so any
// straggling caller keeps compiling. Prefer importing directly from
// `@/lib/domains` / `@/lib/build-domain-graph` for new code.
export { DOMAIN_CARDS } from "@/lib/domains";
export { buildGraphFromDomains } from "@/lib/build-domain-graph";

// Category icons swapped from OS-rendered emojis to the same hand-drawn
// monochrome line-art SVG system as the domain cards (PR #344). The
// DATA LAYERS accordion sits one click into the Domain Workspace modal;
// before this, expanding it surfaced the same 📊 💰 ⚡ 🏗 🏭 🌾 🌐 📡 🔬
// glyphs we just spent PR #344 retiring from the landing-page cards.
// Most categories reuse icons already defined for domains (chart-bar /
// bank / bolt / factory / globe) — `wheat` / `antenna` / `flask` /
// `tower` are new, added to `DomainIcon` so the same component renders
// both surfaces.
const NODE_CATEGORIES: { id: NodeCategory; label: string; icon: DomainIconName }[] = [
  { id: "economic", label: "ECONOMIC", icon: "chart-bar" },
  { id: "finance", label: "FINANCE", icon: "bank" },
  { id: "energy", label: "ENERGY", icon: "bolt" },
  { id: "infrastructure", label: "INFRASTRUCTURE", icon: "tower" },
  { id: "manufacturing", label: "MANUFACTURING", icon: "factory" },
  { id: "agriculture", label: "AGRICULTURE", icon: "wheat" },
  { id: "geopolitical", label: "GEOPOLITICAL", icon: "globe" },
  { id: "communications", label: "COMMUNICATIONS", icon: "antenna" },
  { id: "science", label: "SCIENCE", icon: "flask" },
];

const DISCOVERY_SOURCES = [
  { id: "DCD", label: "DCD / NOTEARS", desc: "Structural" },
  { id: "PCMCI+", label: "PCMCI+", desc: "Temporal" },
  { id: "FCI", label: "FCI", desc: "Latent confounders" },
  { id: "merged", label: "MERGED", desc: "Cross-engine" },
];

export default function DomainSelector() {
  const domainSelectorOpen = useApexStore((s) => s.domainSelectorOpen);
  const setDomainSelectorOpen = useApexStore((s) => s.setDomainSelectorOpen);
  const setTourActive = useApexStore((s) => s.setTourActive);
  const setIsMultiDomainMode = useApexStore((s) => s.setIsMultiDomainMode);
  const setSelectedDomains = useApexStore((s) => s.setSelectedDomains);
  const setVisibleCategories = useApexStore((s) => s.setVisibleCategories);
  const setVisibleDiscoverySources = useApexStore((s) => s.setVisibleDiscoverySources);
  const setSelectedDataSources = useApexStore((s) => s.setSelectedDataSources);
  const setGraphData = useApexStore((s) => s.setGraphData);
  const activePersonaRaw = useApexStore((s) => s.activePersona) as string;
  const setActivePersona = useApexStore((s) => s.setActivePersona);

  // Migrate legacy "analyst" value (pre-subdivision) to the new default.
  const activePersona: Persona = (
    PERSONAS.some((p) => p.id === activePersonaRaw)
      ? activePersonaRaw
      : "financial"
  ) as Persona;

  const [localSelected, setLocalSelected] = useState<string[]>([]);
  const [localMulti, setLocalMulti] = useState(false);
  const [localCategories, setLocalCategories] = useState<Set<string>>(new Set());
  const [localSources, setLocalSources] = useState<Set<string>>(new Set());
  const [showDataLayers, setShowDataLayers] = useState(false);

  // Tier-based domain access. While `access` is loading we leave
  // everything unlocked to avoid a visual flash; the API-level gate
  // is the authoritative check. Once loaded, any domain not in the
  // user's effective access is rendered locked + non-clickable.
  const { access } = useUserAccess();
  const lockedIds = useMemo(() => {
    if (!access) return new Set<string>();
    return new Set(
      DOMAIN_CARDS
        .filter((d) => !access.domains.includes(d.id))
        .map((d) => d.id)
    );
  }, [access]);

  // Cards visible for the active persona (filtered by domain group)
  const allowedGroups = PERSONA_GROUPS[activePersona];
  const visibleGroups = DOMAIN_GROUPS
    .filter((g) => allowedGroups.has(g.label));

  const switchPersona = useCallback(
    (persona: Persona) => {
      setActivePersona(persona);
      const allowed = PERSONA_GROUPS[persona];
      // Drop any currently-selected cards that don't belong to the new persona's groups
      const allowedCardIds = new Set(
        DOMAIN_GROUPS
          .filter((g) => allowed.has(g.label))
          .flatMap((g) => g.domains.map((d) => d.id))
      );
      setLocalSelected((prev) => prev.filter((id) => allowedCardIds.has(id)));
    },
    [setActivePersona]
  );

  const toggleDomain = useCallback(
    (id: string) => {
      // Defense-in-depth — UI also disables onClick for locked cards.
      if (lockedIds.has(id)) return;
      setLocalSelected((prev) => {
        if (prev.includes(id)) return prev.filter((d) => d !== id);
        if (!localMulti) return [id];
        // Focused personas restrict multi-select to a single dataset family to
        // keep the rendered graph coherent. CROSS-DOMAIN is the escape hatch.
        if (activePersona !== "cross") {
          const card = DOMAIN_CARDS.find((d) => d.id === id);
          const filtered = card
            ? prev.filter((prevId) => {
                const prevCard = DOMAIN_CARDS.find((d) => d.id === prevId);
                return prevCard && prevCard.dataset === card.dataset;
              })
            : prev;
          return [...filtered, id];
        }
        return [...prev, id];
      });
    },
    [localMulti, activePersona, lockedIds]
  );

  const switchMode = useCallback(
    (multi: boolean) => {
      setLocalMulti(multi);
      if (!multi) {
        setLocalSelected((prev) => (prev.length > 0 ? [prev[0]] : []));
      }
    },
    []
  );

  const toggleCategory = useCallback((id: string) => {
    setLocalCategories((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSource = useCallback((id: string) => {
    setLocalSources((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleLaunch = useCallback(() => {
    if (localSelected.length === 0) return;
    // Auto-build graph from selected domains (loads correct datasets)
    const mergedGraph = buildGraphFromDomains(localSelected);
    setGraphData(mergedGraph);
    // Track which datasets were loaded
    const datasets: string[] = [];
    const cards = localSelected.map((id) => DOMAIN_CARDS.find((d) => d.id === id)).filter(Boolean) as DomainCard[];
    if (cards.some((d) => d.dataset === "main")) datasets.push("middle-east-playbooks");
    if (cards.some((d) => d.dataset === "athena")) datasets.push("athena-isr");
    if (cards.some((d) => d.dataset === "t1d")) datasets.push("t1d-beta-cell");
    if (cards.some((d) => d.dataset === "vx880")) datasets.push("t1d-vx880");
    setSelectedDataSources(datasets);
    setSelectedDomains(localSelected);
    setIsMultiDomainMode(localMulti);
    setVisibleCategories(localCategories);
    setVisibleDiscoverySources(localSources);
    setDomainSelectorOpen(false);
  }, [localSelected, localMulti, localCategories, localSources, setGraphData, setSelectedDataSources, setSelectedDomains, setIsMultiDomainMode, setVisibleCategories, setVisibleDiscoverySources, setDomainSelectorOpen]);

  // Compute which datasets will be loaded based on current selection
  const selectedCards = localSelected.map((id) => DOMAIN_CARDS.find((d) => d.id === id)).filter(Boolean) as DomainCard[];
  const willLoadMain = selectedCards.some((d) => d.dataset === "main");
  const willLoadAthena = selectedCards.some((d) => d.dataset === "athena");
  const willLoadT1D = selectedCards.some((d) => d.dataset === "t1d");
  const willLoadVX880 = selectedCards.some((d) => d.dataset === "vx880");
  const totalNodes =
    (willLoadMain ? DATASET_NODE_COUNTS.main : 0) +
    (willLoadAthena ? DATASET_NODE_COUNTS.athena : 0) +
    (willLoadT1D ? DATASET_NODE_COUNTS.t1d : 0) +
    (willLoadVX880 ? DATASET_NODE_COUNTS.vx880 : 0);

  return (
    <AnimatePresence>
      {domainSelectorOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2 }}
            data-tour="domain-selector-modal"
            className="w-full max-w-2xl mx-4 rounded-lg border border-border bg-background shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div>
                <h2 className="text-[11px] font-[family-name:var(--font-michroma)] tracking-[0.15em] text-foreground">
                  DOMAIN WORKSPACE
                </h2>
                <span className="text-[9px] font-mono text-text-muted tracking-wider">
                  Select risk domain{localMulti ? "s" : ""} to initialize causal graph
                </span>
              </div>
              {/* Tutorial controls — speaker (read-aloud), language picker
                  (any installed system voice), and the visual feature tour.
                  Reachable before the user has even committed to a domain. */}
              <div className="flex items-center gap-1.5">
                <TTSControls
                  text={WELCOME_DESCRIPTION}
                  ariaLabel="Read tutorial aloud"
                />
                <button
                  onClick={() => setTourActive(true)}
                  className="flex items-center justify-center w-7 h-7 rounded border border-border text-[11px] font-[family-name:var(--font-michroma)] text-text-muted hover:text-accent-cyan hover:border-accent-cyan/40 transition-colors shrink-0"
                  title="Feature tour"
                  aria-label="Launch feature tour"
                >
                  ?
                </button>
              </div>
            </div>

            {/* Persona Selector */}
            <div className="px-6 pt-4 pb-2 border-b border-border/50">
              <div className="text-[7px] font-[family-name:var(--font-michroma)] tracking-wider text-text-muted/60 mb-2">
                PERSONA
              </div>
              <div className="flex gap-2 flex-wrap">
                {PERSONAS.map((p) => {
                  const isActive = activePersona === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => switchPersona(p.id)}
                      className="flex flex-col px-3 py-1.5 rounded border transition-all text-left"
                      style={{
                        borderColor: isActive ? "var(--accent-cyan)" : "var(--border)",
                        backgroundColor: isActive ? "rgba(0,229,255,0.08)" : "transparent",
                        color: isActive ? "var(--accent-cyan)" : "var(--text-muted)",
                      }}
                    >
                      <span className="text-[9px] font-[family-name:var(--font-michroma)] tracking-wider">
                        {p.label}
                      </span>
                      <span className="text-[7px] font-mono opacity-60 mt-0.5">{p.desc}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Mode Toggle */}
            <div className="px-6 pt-4 flex gap-2">
              <button
                onClick={() => switchMode(false)}
                className="px-3 py-1.5 rounded text-[9px] font-[family-name:var(--font-michroma)] tracking-wider transition-colors border"
                style={{
                  color: !localMulti ? "var(--accent-cyan)" : "var(--text-muted)",
                  borderColor: !localMulti ? "var(--accent-cyan)" : "var(--border)",
                  backgroundColor: !localMulti ? "rgba(0,229,255,0.08)" : "transparent",
                }}
              >
                SINGLE DOMAIN
              </button>
              <button
                onClick={() => switchMode(true)}
                className="px-3 py-1.5 rounded text-[9px] font-[family-name:var(--font-michroma)] tracking-wider transition-colors border"
                style={{
                  color: localMulti ? "var(--accent-cyan)" : "var(--text-muted)",
                  borderColor: localMulti ? "var(--accent-cyan)" : "var(--border)",
                  backgroundColor: localMulti ? "rgba(0,229,255,0.08)" : "transparent",
                }}
              >
                MULTI-DOMAIN NETWORK
              </button>
              {localMulti && (
                <span className="text-[8px] font-mono text-text-muted self-center ml-2">
                  Select any combination
                </span>
              )}
            </div>

            {/* Grouped Domain Cards */}
            <div className="px-6 py-4 max-h-[420px] overflow-y-auto space-y-4">
              {visibleGroups.map((group) => (
                <div key={group.label}>
                  <div
                    className="text-[8px] font-[family-name:var(--font-michroma)] tracking-wider mb-1.5"
                    style={{ color: group.color + "99" }}
                  >
                    {group.label}
                  </div>
                  <div className="grid gap-1.5">
                    {group.domains.map((domain) => {
                      const isSelected = localSelected.includes(domain.id);
                      const isComingSoon = !domain.hasData;
                      const isLocked = lockedIds.has(domain.id);
                      const isDisabled = isComingSoon || isLocked;

                      return (
                        <button
                          key={domain.id}
                          onClick={() => !isDisabled && toggleDomain(domain.id)}
                          title={
                            isLocked
                              ? `Not included in your ${access?.tier ?? ""} tier — contact sales to upgrade`
                              : undefined
                          }
                          className="flex items-center gap-3 px-4 py-2.5 rounded border transition-all text-left"
                          style={{
                            borderColor: isSelected ? domain.color : "var(--border)",
                            backgroundColor: isSelected
                              ? `${domain.color}10`
                              : "var(--surface)",
                            opacity: isDisabled ? 0.35 : 1,
                            cursor: isDisabled ? "not-allowed" : "pointer",
                            boxShadow: isSelected
                              ? `0 0 12px ${domain.color}20, 0 0 4px ${domain.color}15`
                              : "none",
                          }}
                        >
                          <DomainIcon
                            name={domain.icon}
                            size={22}
                            color={isSelected || domain.hasData ? domain.color : "var(--text-muted)"}
                            className="flex-shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <div
                              className="text-[10px] font-[family-name:var(--font-michroma)] tracking-wider flex items-center gap-2"
                              style={{ color: isSelected ? domain.color : domain.hasData ? "var(--foreground)" : "var(--text-muted)" }}
                            >
                              {domain.label.toUpperCase()}
                              {isComingSoon && (
                                <span className="text-[7px] px-1.5 py-0.5 rounded border border-border text-text-muted bg-surface/50">
                                  COMING SOON
                                </span>
                              )}
                              {isLocked && !isComingSoon && (
                                <span className="text-[7px] px-1.5 py-0.5 rounded border border-accent-amber/40 text-accent-amber bg-accent-amber/10 tracking-wider">
                                  UPGRADE
                                </span>
                              )}
                            </div>
                            <div className="text-[9px] font-mono text-text-muted mt-0.5 truncate">
                              {domain.description}
                            </div>
                          </div>
                          {isSelected && (
                            <span
                              className="text-[10px] font-mono flex-shrink-0"
                              style={{ color: domain.color }}
                            >
                              ACTIVE
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Data Layers */}
            <div className="px-6 pb-2">
              <button
                onClick={() => setShowDataLayers((p) => !p)}
                className="flex items-center gap-2 text-[8px] font-[family-name:var(--font-michroma)] tracking-wider text-text-muted hover:text-accent-cyan transition-colors"
              >
                <span style={{ transform: showDataLayers ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s", display: "inline-block" }}>▶</span>
                DATA LAYERS
                <span className="text-[7px] font-mono text-text-muted/50">
                  {localCategories.size === 0 && localSources.size === 0 ? "ALL" : `${localCategories.size + localSources.size} filters`}
                </span>
              </button>
              <AnimatePresence>
                {showDataLayers && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-2 space-y-3">
                      {/* Node Categories */}
                      <div>
                        <div className="text-[7px] font-[family-name:var(--font-michroma)] tracking-wider text-text-muted/60 mb-1.5">
                          NODE CATEGORIES
                          <span className="ml-2 text-[7px] font-mono text-text-muted/40">
                            {localCategories.size === 0 ? "showing all" : `${localCategories.size} selected`}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {NODE_CATEGORIES.map((cat) => {
                            const active = localCategories.size === 0 || localCategories.has(cat.id);
                            return (
                              <button
                                key={cat.id}
                                onClick={() => toggleCategory(cat.id)}
                                className="px-2 py-1 rounded border text-[8px] font-mono transition-all inline-flex items-center gap-1.5"
                                style={{
                                  borderColor: localCategories.has(cat.id) ? "var(--accent-cyan)" : "var(--border)",
                                  backgroundColor: localCategories.has(cat.id) ? "rgba(0,229,255,0.08)" : "transparent",
                                  color: active ? "var(--foreground)" : "var(--text-muted)",
                                  opacity: active ? 1 : 0.4,
                                }}
                              >
                                <DomainIcon name={cat.icon} size={11} />
                                {cat.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Discovery Sources */}
                      <div>
                        <div className="text-[7px] font-[family-name:var(--font-michroma)] tracking-wider text-text-muted/60 mb-1.5">
                          DISCOVERY ENGINES
                          <span className="ml-2 text-[7px] font-mono text-text-muted/40">
                            {localSources.size === 0 ? "showing all" : `${localSources.size} selected`}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {DISCOVERY_SOURCES.map((src) => {
                            const active = localSources.size === 0 || localSources.has(src.id);
                            return (
                              <button
                                key={src.id}
                                onClick={() => toggleSource(src.id)}
                                className="px-2 py-1 rounded border text-[8px] font-mono transition-all"
                                style={{
                                  borderColor: localSources.has(src.id) ? "var(--accent-cyan)" : "var(--border)",
                                  backgroundColor: localSources.has(src.id) ? "rgba(0,229,255,0.08)" : "transparent",
                                  color: active ? "var(--foreground)" : "var(--text-muted)",
                                  opacity: active ? 1 : 0.4,
                                }}
                              >
                                {src.label} <span className="text-text-muted/50">{src.desc}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {(localCategories.size > 0 || localSources.size > 0) && (
                        <button
                          onClick={() => { setLocalCategories(new Set()); setLocalSources(new Set()); }}
                          className="text-[7px] font-mono text-accent-cyan/60 hover:text-accent-cyan transition-colors"
                        >
                          ✕ CLEAR ALL FILTERS
                        </button>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Demo flow picker — guided cause-and-effect tours through the
                graph. Discoverable but unobtrusive: bottom of the modal,
                before the footer, so first-time visitors see the offer
                without it crowding the domain cards. */}
            <div className="px-6 pb-4">
              <DemoFlowPicker
                onPick={() => setDomainSelectorOpen(false)}
              />
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-border flex items-center justify-between">
              <span className="text-[9px] font-mono text-text-muted">
                {localSelected.length === 0
                  ? "No domain selected"
                  : `${localSelected.length} domain${localSelected.length > 1 ? "s" : ""} selected${totalNodes > 0 ? ` \u00B7 ${totalNodes} nodes` : ""}`}
              </span>
              <button
                onClick={handleLaunch}
                disabled={localSelected.length === 0}
                className="px-5 py-2 rounded text-[10px] font-[family-name:var(--font-michroma)] tracking-wider transition-all border"
                style={{
                  color:
                    localSelected.length > 0
                      ? "var(--accent-cyan)"
                      : "var(--text-muted)",
                  borderColor:
                    localSelected.length > 0
                      ? "var(--accent-cyan)"
                      : "var(--border)",
                  backgroundColor:
                    localSelected.length > 0
                      ? "rgba(0,229,255,0.1)"
                      : "transparent",
                  cursor:
                    localSelected.length > 0 ? "pointer" : "not-allowed",
                }}
              >
                LAUNCH WORKSPACE
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
