"use client";

/**
 * IntroOverlay — first-load brand reveal animation.
 *
 * Approach: render the brand at EXACTLY the same dimensions and
 * position as the real SiteHeader brand mark (44×54 mantis + 12px
 * wordmark with 0.3em tracking, anchored at the header brand's
 * fixed position). At intro start, scale it up and translate it to
 * viewport center. At intro end, return to identity (transform = 0)
 * so the cloned brand sits exactly on top of the real header brand.
 * When the overlay fades, the swap is invisible — no jump cut.
 *
 * Sequence (~2.8s):
 *   0–600ms     mantis fades in + pops to its scaled-up size
 *   600–1700ms  "APEX ANALYTICA" types out alongside it (mono).
 *               The two prominent A glyphs (start of APEX, start of
 *               ANALYTICA) drop in with a scaleY-from-top animation
 *               that evokes mantis arms folding down.
 *   1700–2200ms hold (full composition visible at intro size)
 *   2200–2800ms composition shrinks + flies to the exact header
 *               brand position. Overlay fades out simultaneously.
 *   2800ms+     unmount; real SiteHeader brand is exactly where the
 *               intro brand landed, so the user sees no swap.
 *
 * Re-trigger in dev: `sessionStorage.removeItem("apex-intro-played")`.
 */

import Image from "next/image";
import { useEffect, useState } from "react";

const STORAGE_KEY = "apex-intro-played";
const TOTAL_DURATION_MS = 2800;
const REMOVE_DELAY_MS = 80;

const WORDMARK = "APEX ANALYTICA";

type Phase = "init" | "playing" | "done";

export default function IntroOverlay() {
  const [phase, setPhase] = useState<Phase>("init");

  useEffect(() => {
    let played = false;
    try {
      played = sessionStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      /* sessionStorage unavailable — play it. */
    }
    if (played) {
      setPhase("done");
      return;
    }

    setPhase("playing");
    try {
      sessionStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }

    const t = window.setTimeout(() => {
      setPhase("done");
    }, TOTAL_DURATION_MS + REMOVE_DELAY_MS);
    return () => window.clearTimeout(t);
  }, []);

  if (phase === "done") return null;
  const visible = phase === "playing";

  // The two prominent A glyphs we want to highlight: the leading A of
  // APEX (index 0) and the leading A of ANALYTICA (index 5).
  const PROMINENT_A_INDEXES = new Set<number>([0, 5]);

  return (
    <div
      aria-hidden
      className={`apex-intro-root ${visible ? "apex-intro-running" : "apex-intro-prep"}`}
    >
      {/* Anchor positioned at the EXACT header brand location. The
          stage at scale 1 IS the header brand, pixel-identical. */}
      <div className="apex-intro-anchor">
        <div className="apex-intro-stage">
          <span className="apex-intro-mantis-frame">
            {/* Render at 2x the intro display size (440×540) so the image
                stays crisp at intro scale on HiDPI displays. CSS shrinks
                it to fit the frame at intro size, and shrinks further to
                header size at the end of the animation — only ever
                downsampling, never upscaling. */}
            <Image
              src="/mantis.png"
              alt=""
              width={440}
              height={540}
              priority
              quality={92}
              sizes="(max-width: 640px) 176px, 220px"
              className="apex-intro-mantis-img"
            />
          </span>
          <span className="apex-intro-wordmark">
            {WORDMARK.split("").map((ch, i) => {
              const isSpace = ch === " ";
              const isProminentA = PROMINENT_A_INDEXES.has(i);
              return (
                <span
                  key={i}
                  className={`apex-intro-char ${isProminentA ? "apex-intro-a" : ""}`}
                  style={{
                    animationDelay: `${600 + i * 70}ms`,
                  }}
                >
                  {isSpace ? " " : ch}
                </span>
              );
            })}
          </span>
        </div>
      </div>
    </div>
  );
}
