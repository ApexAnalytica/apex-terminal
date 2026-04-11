"use client";

import { memo, useEffect, useState } from "react";

/**
 * Semi-transparent watermark overlay for anti-screenshot protection.
 * Renders a diagonal grid of session ID + timestamp text.
 * Uses pointer-events: none so it doesn't block interaction.
 *
 * Generated client-side only — Math.random()/Date during render would
 * mismatch SSR output and cause a React hydration error.
 */
const CanvasWatermark = memo(function CanvasWatermark() {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    const sessionId =
      "APEX-" + Math.random().toString(36).substring(2, 8).toUpperCase();
    const ts = new Date().toISOString().slice(0, 16).replace("T", " ");
    setLabel(`${sessionId} \u2022 ${ts}`);
  }, []);

  if (!label) return null;

  const cells = Array.from({ length: 120 }, (_, i) => (
    <span key={i} className="wm-text">
      {label}
    </span>
  ));

  return (
    <div className="watermark-grid">
      <div className="wm-inner">{cells}</div>
    </div>
  );
});

export default CanvasWatermark;
