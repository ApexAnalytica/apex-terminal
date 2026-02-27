"use client";

import { motion } from "framer-motion";
import { OmegaState } from "@/lib/types";
import { getStatusColor } from "@/lib/omega-engine";

interface CDOmegaMonitorProps {
  state: OmegaState;
}

export default function CDOmegaMonitor({ state }: CDOmegaMonitorProps) {
  const color = getStatusColor(state.status);
  const segments = 40;
  const filledSegments = Math.round((state.buffer / 100) * segments);

  return (
    <div className="flex items-center gap-6">
      {/* CDΩ Label */}
      <div className="flex flex-col items-end">
        <span
          className="font-[family-name:var(--font-michroma)] text-[10px] tracking-[0.3em] uppercase"
          style={{ color: "var(--text-muted)" }}
        >
          Causal Distance
        </span>
        <span
          className="font-[family-name:var(--font-michroma)] text-lg font-bold tracking-wider"
          style={{ color }}
        >
          CD&Omega;
        </span>
      </div>

      {/* Buffer Bar */}
      <div className="flex flex-col gap-1">
        <div className="flex gap-[2px]">
          {Array.from({ length: segments }).map((_, i) => {
            const filled = i < filledSegments;
            const segColor =
              i < segments * 0.15
                ? "var(--accent-red)"
                : i < segments * 0.35
                  ? "var(--accent-amber)"
                  : "var(--accent-green)";
            return (
              <motion.div
                key={i}
                className="h-4 w-[6px] rounded-[1px]"
                style={{
                  backgroundColor: filled ? segColor : "var(--border)",
                  opacity: filled ? 1 : 0.3,
                }}
                animate={
                  filled && state.status === "OMEGA_BREACH"
                    ? { opacity: [1, 0.3, 1] }
                    : {}
                }
                transition={
                  state.status === "OMEGA_BREACH"
                    ? { duration: 0.5, repeat: Infinity }
                    : {}
                }
              />
            );
          })}
        </div>
        <div className="flex justify-between">
          <span className="text-[9px] font-mono" style={{ color: "var(--accent-red)" }}>
            &Omega;
          </span>
          <span className="text-[9px] font-mono" style={{ color: "var(--text-muted)" }}>
            {state.buffer.toFixed(1)}%
          </span>
          <span className="text-[9px] font-mono" style={{ color: "var(--accent-green)" }}>
            SAFE
          </span>
        </div>
      </div>

      {/* Status Badge */}
      <motion.div
        className="flex items-center gap-2 rounded border px-3 py-1.5"
        style={{
          borderColor: color,
          backgroundColor: `color-mix(in srgb, ${color} 8%, transparent)`,
        }}
        animate={
          state.status === "CRITICAL" || state.status === "OMEGA_BREACH"
            ? { borderColor: [color, "transparent", color] }
            : {}
        }
        transition={
          state.status === "CRITICAL" || state.status === "OMEGA_BREACH"
            ? { duration: 1, repeat: Infinity }
            : {}
        }
      >
        <div
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: color }}
        />
        <span
          className="font-[family-name:var(--font-michroma)] text-[10px] tracking-widest"
          style={{ color }}
        >
          {state.status.replace("_", " ")}
        </span>
      </motion.div>

      {/* Shock Count */}
      <div className="flex flex-col items-center">
        <span
          className="font-mono text-xl font-bold tabular-nums"
          style={{ color }}
        >
          {state.shocks.length}
        </span>
        <span className="text-[9px] text-text-muted tracking-wider">
          SHOCKS
        </span>
      </div>
    </div>
  );
}
