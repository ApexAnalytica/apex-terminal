"use client";

import { motion } from "framer-motion";
import type { CausalEdge } from "@/lib/types";

interface EdgeInspectorProps {
  edge: CausalEdge;
  sourceLabel: string;
  targetLabel: string;
  onClose: () => void;
}

export default function EdgeInspector({ edge, sourceLabel, targetLabel, onClose }: EdgeInspectorProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 bg-surface-elevated border border-border rounded-lg shadow-lg p-4 min-w-[280px] max-w-[400px]"
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-[family-name:var(--font-michroma)] tracking-wider text-accent-cyan">
          EDGE INSPECTOR
        </span>
        <button
          onClick={onClose}
          className="text-[10px] text-text-muted hover:text-foreground transition-colors"
        >
          &times;
        </button>
      </div>
      <div className="space-y-2 text-[9px] font-mono">
        <div className="flex justify-between">
          <span className="text-text-muted">SOURCE</span>
          <span className="text-foreground">{sourceLabel}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-muted">TARGET</span>
          <span className="text-foreground">{targetLabel}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-muted">WEIGHT</span>
          <span className="text-foreground">{edge.weight.toFixed(3)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-muted">TYPE</span>
          <span className="text-foreground">{edge.type.toUpperCase()}</span>
        </div>
        {edge.lagDays !== undefined && (
          <div className="flex justify-between">
            <span className="text-text-muted">LAG</span>
            <span className="text-foreground">{edge.lagDays}d</span>
          </div>
        )}
        {edge.isSevered && (
          <div className="text-accent-red text-center mt-2 tracking-wider">SEVERED</div>
        )}
      </div>
    </motion.div>
  );
}
