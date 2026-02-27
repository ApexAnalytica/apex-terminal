"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { useApexStore } from "@/stores/useApexStore";
import { getCategoryColor, getCategoryLabel, buildRiskCards } from "@/lib/graph-data";

export default function RiskPropagationFlow() {
  const graphData = useApexStore((s) => s.graphData);
  const shocks = useApexStore((s) => s.shocks);
  const riskCards = useMemo(() => buildRiskCards(graphData, shocks), [graphData, shocks]);

  return (
    <div className="flex items-stretch gap-2 px-4 py-2 overflow-x-auto border-t border-border bg-surface-elevated">
      {riskCards.map((card, i) => {
        const color = getCategoryColor(card.category);
        const barWidth = Math.min(100, card.riskPercent);

        return (
          <motion.div
            key={card.nodeId}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05, duration: 0.2 }}
            className="flex-shrink-0 w-44 rounded border px-3 py-2"
            style={{
              borderColor: `color-mix(in srgb, ${color} 30%, var(--border))`,
              backgroundColor: `color-mix(in srgb, ${color} 3%, var(--surface))`,
            }}
          >
            <div className="text-[10px] font-mono text-foreground truncate">
              {card.label}
            </div>
            <div
              className="text-[8px] font-[family-name:var(--font-michroma)] tracking-widest mt-0.5"
              style={{ color }}
            >
              {getCategoryLabel(card.category)}
            </div>
            {/* Risk bar */}
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
              style={{ color }}
            >
              {card.riskPercent}%
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
