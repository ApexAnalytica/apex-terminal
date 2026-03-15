import { useRef, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { useApexStore } from "@/stores/useApexStore";

const BASE_INTERVAL_MS = 150; // ms per epoch at 1x speed

export function useReplayTick() {
  const accumulator = useRef(0);

  useFrame((_, delta) => {
    const state = useApexStore.getState();
    if (!state.replayActive || !state.replayPlaying) {
      accumulator.current = 0;
      return;
    }

    const epochs =
      state.activeTimeline === "baseline"
        ? state.baselineEpochs
        : state.interventionEpochs;
    const maxEpoch = epochs.length - 1;
    if (maxEpoch <= 0) return;

    accumulator.current += delta * 1000; // convert to ms
    const interval = BASE_INTERVAL_MS / state.replaySpeed;

    if (accumulator.current >= interval) {
      accumulator.current -= interval;
      const nextEpoch = state.currentEpoch + 1;
      if (nextEpoch > maxEpoch) {
        // Auto-pause at end
        useApexStore.setState({ replayPlaying: false });
      } else {
        useApexStore.setState({ currentEpoch: nextEpoch });
      }
    }
  });
}

/**
 * DOM-based replay tick driver using requestAnimationFrame.
 * Works outside of R3F Canvas — use in 2D views.
 */
export function useReplayTickDOM() {
  const lastTimeRef = useRef(0);
  const accumulator = useRef(0);

  useEffect(() => {
    let raf: number;

    const tick = (time: number) => {
      const state = useApexStore.getState();
      if (!state.replayActive || !state.replayPlaying) {
        accumulator.current = 0;
        lastTimeRef.current = time;
        raf = requestAnimationFrame(tick);
        return;
      }

      const delta = lastTimeRef.current ? (time - lastTimeRef.current) / 1000 : 0;
      lastTimeRef.current = time;

      const epochs =
        state.activeTimeline === "baseline"
          ? state.baselineEpochs
          : state.interventionEpochs;
      const maxEpoch = epochs.length - 1;
      if (maxEpoch <= 0) {
        raf = requestAnimationFrame(tick);
        return;
      }

      accumulator.current += delta * 1000;
      const interval = BASE_INTERVAL_MS / state.replaySpeed;

      if (accumulator.current >= interval) {
        accumulator.current -= interval;
        const nextEpoch = state.currentEpoch + 1;
        if (nextEpoch > maxEpoch) {
          useApexStore.setState({ replayPlaying: false });
        } else {
          useApexStore.setState({ currentEpoch: nextEpoch });
        }
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
}
