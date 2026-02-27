"use client";

import { useApexStore } from "@/stores/useApexStore";

export default function StructuralMetrics() {
  const meta = useApexStore((s) => s.graphData.metadata);

  return (
    <div className="flex items-center gap-4 px-4 py-1.5 border-t border-border bg-surface text-[9px] font-mono text-text-muted">
      <span>
        DISCOVERY DENSITY:{" "}
        <span className="text-foreground">{meta.density.toFixed(2)}</span>
      </span>
      <span className="text-border">|</span>
      <span>
        CONSTRAINT:{" "}
        <span className="text-foreground">{meta.constraintType.split("+")[0].trim()}</span>
      </span>
      <span className="text-border">|</span>
      <span>
        VERIFICATION:{" "}
        <span
          style={{
            color:
              meta.verificationStatus === "VERIFIED"
                ? "var(--accent-green)"
                : meta.verificationStatus === "INCONSISTENCIES_FOUND"
                  ? "var(--accent-amber)"
                  : "var(--text-muted)",
          }}
        >
          {meta.verificationStatus}
        </span>
      </span>
    </div>
  );
}
