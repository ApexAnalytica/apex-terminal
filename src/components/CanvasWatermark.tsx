"use client";

import { memo, useRef } from "react";

/**
 * Semi-transparent watermark overlay for anti-screenshot protection.
 * Renders a diagonal grid of session ID + timestamp text.
 * Uses pointer-events: none so it doesn't block interaction.
 */
const CanvasWatermark = memo(function CanvasWatermark() {
  const sessionId = useRef(
    "APEX-" + Math.random().toString(36).substring(2, 8).toUpperCase()
  );
  const ts = new Date().toISOString().slice(0, 16).replace("T", " ");
  const label = `${sessionId.current} \u2022 ${ts}`;

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
