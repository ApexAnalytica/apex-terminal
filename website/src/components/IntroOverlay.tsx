"use client";

/**
 * IntroOverlay — first-load brand reveal animation.
 *
 * Sequence:
 *   0–500ms     mantis fades in + scales up center-screen
 *   500–1500ms  "APEX ANALYTICA" types out next to the mantis (mono),
 *               with the two A glyphs given a slight angled-stroke
 *               entrance to nod at the mantis-arms → A-strokes idea
 *   1500–2000ms hold
 *   2000–2600ms composition shrinks + slides toward the header brand
 *               position; overlay fades out
 *   2600ms+     unmount
 *
 * Suppressed on subsequent navigations within the same browser
 * session via sessionStorage. To re-trigger during testing, run
 * `sessionStorage.removeItem("apex-intro-played")` in the console.
 */

import Image from "next/image";
import { useEffect, useState } from "react";

const STORAGE_KEY = "apex-intro-played";
const TOTAL_DURATION_MS = 2600;
const REMOVE_DELAY_MS = 100; // small grace period before unmount

const WORDMARK = "APEX ANALYTICA";

type Phase = "init" | "playing" | "done";

export default function IntroOverlay() {
  const [phase, setPhase] = useState<Phase>("init");

  useEffect(() => {
    // Skip on subsequent loads within the same session.
    let played = false;
    try {
      played = sessionStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      /* sessionStorage not available — play it. */
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

  // While we wait for the effect to read sessionStorage, render the
  // overlay invisibly so we don't flash content underneath then
  // remount the overlay over it. This is a tiny FOUC guard.
  const visible = phase === "playing";

  return (
    <div
      aria-hidden
      className={`apex-intro-root fixed inset-0 z-[60] flex items-center justify-center bg-background ${
        visible ? "apex-intro-running" : "apex-intro-prep"
      }`}
    >
      <div className="apex-intro-stage relative flex items-center gap-3">
        <span
          className="apex-intro-mantis relative inline-flex shrink-0"
          style={{ width: 88, height: 108 }}
        >
          <Image
            src="/mantis.png"
            alt=""
            width={88}
            height={108}
            priority
            className="object-contain"
          />
        </span>
        <span className="apex-intro-wordmark font-[family-name:var(--font-michroma)] tracking-[0.22em] text-foreground whitespace-nowrap">
          {WORDMARK.split("").map((ch, i) => {
            const isSpace = ch === " ";
            const isA = ch === "A";
            return (
              <span
                key={`${ch}-${i}`}
                className={`apex-intro-char ${isA ? "apex-intro-a" : ""}`}
                style={{
                  animationDelay: `${500 + i * 60}ms`,
                  width: isSpace ? "0.45em" : undefined,
                }}
              >
                {isSpace ? " " : ch}
              </span>
            );
          })}
        </span>
      </div>
      {/* Caret-style cursor that blinks during the typewriter phase */}
      <span aria-hidden className="apex-intro-caret" />
    </div>
  );
}
