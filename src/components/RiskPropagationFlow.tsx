"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { useApexStore } from "@/stores/useApexStore";
import { getCategoryColor, getCategoryLabel, getDomainColor, buildRiskCards } from "@/lib/graph-data";

export default function RiskPropagationFlow() {
  const graphData = useApexStore((s) => s.graphData);
  const shocks = useApexStore((s) => s.shocks);
  const selectedNode = useApexStore((s) => s.selectedNode);
  const setSelectedNode = useApexStore((s) => s.setSelectedNode);
  const riskCards = useMemo(() => buildRiskCards(graphData, shocks), [graphData, shocks]);

  return (
    <div className="flex items-stretch gap-2 px-4 py-2 overflow-x-auto border-t border-border bg-surface-elevated" data-tour="risk-flow">
      {riskCards.map((card, i) => {
        const color = getCategoryColor(card.category);
        const domainColor = getDomainColor(card.domain);
        const barWidth = Math.min(100, (card.omegaScore / 10) * 100);
        const isActive = selectedNode === card.nodeId;

        return (
          <motion.div
            key={card.nodeId}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05, duration: 0.2 }}
            className="flex-shrink-0 w-48 rounded border px-3 py-2 cursor-pointer transition-colors"
            style={{
              borderColor: isActive
                ? "var(--accent-cyan)"
                : `color-mix(in srgb, ${color} 30%, var(--border))`,
              backgroundColor: isActive
                ? "rgba(0,229,255,0.06)"
                : `color-mix(in srgb, ${color} 3%, var(--surface))`,
            }}
            onClick={() => setSelectedNode(isActive ? null : card.nodeId)}
          >
            <div className="text-[10px] font-mono text-foreground truncate">
              {card.label}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <div
                className="text-[8px] font-[family-name:var(--font-michroma)] tracking-widest"
                style={{ color }}
              >
                {getCategoryLabel(card.category)}
              </div>
              <div
                className="text-[7px] px-1 py-0.5 rounded"
                style={{
                  color: domainColor,
                  backgroundColor: `${domainColor}10`,
                  border: `1px solid ${domainColor}30`,
                }}
              >
                {card.domain}
              </div>
            </div>
            {/* Concentration */}
            <div className="text-[8px] font-mono text-text-muted mt-1 truncate">
              {card.globalConcentration}
            </div>
            {/* Omega bar */}
            <div className="mt-1.5 h-1 w-full rounded-full bg-border overflow-hidden">
              <motion.div
                className="h-full rounded-full"
                style={{ backgroundColor: color }}
                initial={{ width: 0 }}
                animate={{ width: `${barWidth}%` }}
                transition={{ duration: 0.6, delay: i * 0.05 }}
              />
            </div>
            <div
              className="text-[10px] font-mono mt-1 font-bold"
              style={{
                color: card.omegaScore > 9 ? "#ff1744"
                  : card.omegaScore >= 7 ? "#ffab00"
                  : "#00e676",
              }}
            >
              {"\u03A9"} {card.omegaScore.toFixed(1)}
            </div>
          </motion.div>
        );
      })}

      {/* Flow arrows between cards */}
      {riskCards.length > 1 && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-between px-[11.5rem]">
          {/* Arrows rendered via CSS pseudo-elements on parent */}
        </div>
      )}
    </div>
  );
}
