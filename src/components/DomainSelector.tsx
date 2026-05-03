"use client";

import { useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useApexStore } from "@/stores/useApexStore";
import { useUserAccess } from "@/hooks/useUserAccess";
import { MAIN_GRAPH, EMPTY_GRAPH } from "@/lib/graph-data";
import { ATHENA_GRAPH, BRIDGE_EDGES } from "@/lib/athena-graph-data";
import { T1D_GRAPH } from "@/lib/t1d-graph-data";
import { VX880_GRAPH } from "@/lib/t1d-vx880-graph-data";
import { mergeGraphs } from "@/lib/import/merge";
import type { NodeCategory, CausalGraph } from "@/lib/types";
import TTSControls from "@/components/TTSControls";
import { WELCOME_DESCRIPTION } from "@/lib/tour-steps";
import { DemoFlowPicker } from "@/components/DemoFlowPlayer";

const NODE_CATEGORIES: { id: NodeCategory; label: string; icon: string }[] = [
  { id: "economic", label: "ECONOMIC", icon: "📊" },
  { id: "finance", label: "FINANCE", icon: "💰" },
  { id: "energy", label: "ENERGY", icon: "⚡" },
  { id: "infrastructure", label: "INFRASTRUCTURE", icon: "🏗" },
  { id: "manufacturing", label: "MANUFACTURING", icon: "🏭" },
  { id: "agriculture", label: "AGRICULTURE", icon: "🌾" },
  { id: "geopolitical", label: "GEOPOLITICAL", icon: "🌐" },
  { id: "communications", label: "COMMUNICATIONS", icon: "📡" },
  { id: "science", label: "SCIENCE", icon: "🔬" },
];

const DISCOVERY_SOURCES = [
  { id: "DCD", label: "DCD / NOTEARS", desc: "Structural" },
  { id: "PCMCI+", label: "PCMCI+", desc: "Temporal" },
  { id: "FCI", label: "FCI", desc: "Latent confounders" },
  { id: "merged", label: "MERGED", desc: "Cross-engine" },
];

// ─── Grouped domain structure ────────────────────────────────────
// Each domain knows which dataset it pulls from (for auto-loading)

interface DomainCard {
  id: string;
  label: string;
  icon: string;
  color: string;
  colorVar: string;
  description: string;
  hasData: boolean;
  dataset: "main" | "athena" | "t1d" | "vx880"; // which graph to load
}

interface DomainGroup {
  label: string;
  color: string;
  domains: DomainCard[];
}

type Persona =
  | "scientist"
  | "financial"
  | "macro"
  | "geopolitical"
  | "cross";

const PERSONAS: { id: Persona; label: string; desc: string }[] = [
  { id: "financial", label: "FINANCIAL", desc: "Markets · Credit · Sovereign" },
  { id: "macro", label: "MACRO", desc: "Growth · Inflation · Policy" },
  { id: "geopolitical", label: "GEOPOLITICAL", desc: "Energy · Infra · Defense" },
  { id: "scientist", label: "SCIENTIST", desc: "Life Sciences" },
  { id: "cross", label: "CROSS-DOMAIN", desc: "All domains · multi-select" },
];

// Each persona shows a subset of domain groups (by group label).
// CROSS shows everything and is the only persona allowed to multi-select
// across different datasets.
const PERSONA_GROUPS: Record<Persona, Set<string>> = {
  financial: new Set(["FINANCIAL & SOVEREIGN", "MENA ENERGY & COMMODITIES"]),
  macro: new Set(["MACRO IMPACT", "FINANCIAL & SOVEREIGN"]),
  geopolitical: new Set([
    "MENA ENERGY & COMMODITIES",
    "INFRASTRUCTURE & DEFENSE",
    "FINANCIAL & SOVEREIGN",
  ]),
  scientist: new Set(["LIFE SCIENCES", "FRONTIER"]),
  cross: new Set([
    "MENA ENERGY & COMMODITIES",
    "FINANCIAL & SOVEREIGN",
    "INFRASTRUCTURE & DEFENSE",
    "MACRO IMPACT",
    "LIFE SCIENCES",
    "FRONTIER",
  ]),
};

const DOMAIN_GROUPS: DomainGroup[] = [
  {
    label: "MENA ENERGY & COMMODITIES",
    color: "#ff1744",
    domains: [
      {
        id: "energy-systems",
        label: "Energy Systems",
        icon: "\u{26A1}",
        color: "#ff1744",
        colorVar: "var(--accent-red)",
        description: "Saudi Aramco crude/gas infrastructure, QatarEnergy LNG export chains",
        hasData: true,
        dataset: "main",
      },
      {
        id: "manufacturing",
        label: "Fertilizer & Agrochemical",
        icon: "\u{1F3ED}",
        color: "#448aff",
        colorVar: "var(--accent-blue)",
        description: "QAFCO urea/ammonia complex, Ma'aden phosphate supply chains, food price transmission",
        hasData: true,
        dataset: "main",
      },
      {
        id: "supply-chain",
        label: "Supply Chain Shock Risk",
        icon: "\u{1F517}",
        color: "#00e5ff",
        colorVar: "var(--accent-cyan)",
        description: "MENA food security, Bunge/Almarai supply chains, wheat price transmission",
        hasData: true,
        dataset: "main",
      },
    ],
  },
  {
    label: "FINANCIAL & SOVEREIGN",
    color: "#ffab00",
    domains: [
      {
        id: "financial-contagion",
        label: "Financial Contagion Risk",
        icon: "\u{1F3E6}",
        color: "#ff6d00",
        colorVar: "var(--accent-orange)",
        description: "Systemic banking failures, credit default cascades, liquidity traps",
        hasData: true,
        dataset: "main",
      },
      {
        id: "sovereign-risk",
        label: "Emerging Market Sovereign Risk",
        icon: "\u{1F30D}",
        color: "#ffab00",
        colorVar: "var(--accent-amber)",
        description: "Currency crises, debt restructuring, capital flight contagion",
        hasData: true,
        dataset: "main",
      },
    ],
  },
  {
    label: "INFRASTRUCTURE & DEFENSE",
    color: "#7c4dff",
    domains: [
      {
        id: "infrastructure",
        label: "Infrastructure Resilience",
        icon: "\u{1F3D7}",
        color: "#7c4dff",
        colorVar: "var(--accent-purple)",
        description: "Undersea cable systems, Red Sea exposure, Telecom Egypt/Orange Marine",
        hasData: true,
        dataset: "main",
      },
      {
        id: "defense-isr",
        label: "Defense & ISR",
        icon: "\u{1F6E1}\uFE0F",
        color: "#00e676",
        colorVar: "var(--accent-green)",
        description: "Drone swarms, SATCOM, ISR fusion, chip embargo, secure compute, kill chain",
        hasData: true,
        dataset: "athena",
      },
    ],
  },
  {
    label: "MACRO IMPACT",
    color: "#40c4ff",
    domains: [
      {
        id: "macro-labor",
        label: "Labor, Growth & Housing",
        icon: "\u{1F4CA}",
        color: "#40c4ff",
        colorVar: "var(--accent-cyan)",
        description: "Nonfarm payrolls, unemployment, wages, JOLTS, GDP, retail sales, industrial production, ISM PMI, housing",
        hasData: true,
        dataset: "main",
      },
      {
        id: "macro-inflation",
        label: "Inflation & Policy",
        icon: "\u{1F4B9}",
        color: "#ff80ab",
        colorVar: "var(--accent-pink)",
        description: "CPI/PPI/PCE inflation, breakeven expectations, Fed funds rate, SOFR, Fed policy transmission",
        hasData: true,
        dataset: "main",
      },
    ],
  },
  {
    label: "LIFE SCIENCES",
    color: "#40c4ff",
    domains: [
      {
        id: "t1d-beta-cell",
        label: "T1D \u03B2-Cell Restoration",
        icon: "\u{1F9EC}",
        color: "#40c4ff",
        colorVar: "var(--accent-blue)",
        description: "Autoimmune \u2192 \u03B2-cell loss \u2192 glycemic collapse \u2192 complications; teplizumab / stem-cell intervention paths",
        hasData: true,
        dataset: "t1d",
      },
      {
        id: "t1d-vx880",
        label: "T1D Stem-Cell Transplant (VX-880)",
        icon: "\u{1F489}",
        color: "#40c4ff",
        colorVar: "var(--accent-blue)",
        description: "Vertex VX-880 trial topology: HLA/autoantibody risk \u2192 dose + immunosuppression \u2192 engraftment \u2192 graft \u03B2-mass \u2192 MMTT / insulin-independence / severe-hypo endpoints",
        hasData: true,
        dataset: "vx880",
      },
    ],
  },
  {
    label: "FRONTIER",
    color: "#e040fb",
    domains: [
      {
        id: "frontier-science",
        label: "Frontier Science",
        icon: "\u269B\uFE0F",
        color: "#e040fb",
        colorVar: "var(--accent-magenta)",
        description: "Post-Standard Model physics, neutrino frontier, quantum gravity, dark sector detection",
        hasData: false,
        dataset: "main",
      },
    ],
  },
];

// Flat list for export (used by HeaderBar etc.)
export const DOMAIN_CARDS = DOMAIN_GROUPS.flatMap((g) => g.domains);

// Build the graph from selected domains — auto-includes the right datasets
export function buildGraphFromDomains(domainIds: string[]): CausalGraph {
  const selectedDomains = domainIds.map((id) =>
    DOMAIN_CARDS.find((d) => d.id === id)
  ).filter(Boolean) as DomainCard[];

  const needsMain = selectedDomains.some((d) => d.dataset === "main");
  const needsAthena = selectedDomains.some((d) => d.dataset === "athena");
  const needsT1D = selectedDomains.some((d) => d.dataset === "t1d");
  const needsVX880 = selectedDomains.some((d) => d.dataset === "vx880");

  let graph: CausalGraph = { nodes: [], edges: [], metadata: EMPTY_GRAPH.metadata };

  if (needsMain) {
    const { graph: merged } = mergeGraphs(graph, { nodes: MAIN_GRAPH.nodes, edges: MAIN_GRAPH.edges });
    graph = merged;
  }
  if (needsAthena) {
    const { graph: merged } = mergeGraphs(graph, { nodes: ATHENA_GRAPH.nodes, edges: ATHENA_GRAPH.edges });
    graph = merged;
  }
  if (needsT1D) {
    const { graph: merged } = mergeGraphs(graph, { nodes: T1D_GRAPH.nodes, edges: T1D_GRAPH.edges });
    graph = merged;
  }
  if (needsVX880) {
    const { graph: merged } = mergeGraphs(graph, { nodes: VX880_GRAPH.nodes, edges: VX880_GRAPH.edges });
    graph = merged;
  }

  // When both MAIN and ATHENA are loaded, splice in the bridge edges that
  // wire civilian/energy/financial domains into the defense substrate.
  // mergeGraphs will silently skip any bridge whose endpoints aren't present.
  if (needsMain && needsAthena) {
    const { graph: merged } = mergeGraphs(graph, { nodes: [], edges: BRIDGE_EDGES });
    graph = merged;
  }

  return graph;
}

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
  const totalNodes = (willLoadMain ? MAIN_GRAPH.nodes.length : 0) + (willLoadAthena ? ATHENA_GRAPH.nodes.length : 0) + (willLoadT1D ? T1D_GRAPH.nodes.length : 0) + (willLoadVX880 ? VX880_GRAPH.nodes.length : 0);

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
                          <span className="text-xl flex-shrink-0">{domain.icon}</span>
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
                                className="px-2 py-1 rounded border text-[8px] font-mono transition-all"
                                style={{
                                  borderColor: localCategories.has(cat.id) ? "var(--accent-cyan)" : "var(--border)",
                                  backgroundColor: localCategories.has(cat.id) ? "rgba(0,229,255,0.08)" : "transparent",
                                  color: active ? "var(--foreground)" : "var(--text-muted)",
                                  opacity: active ? 1 : 0.4,
                                }}
                              >
                                {cat.icon} {cat.label}
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
