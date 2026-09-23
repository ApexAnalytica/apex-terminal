// ─── AI Safety demo TrainingTrace ───────────────────────────────────
//
// Canonical synthetic substrate the AI-domain UI surfaces wire onto
// while PR 5 (real PyTorch / TF ingester) is still pending. Every
// trace this module emits is `source.kind === "synthetic"`; UI
// surfaces consuming derived values MUST render a SYNTHETIC badge
// — no customer business decision runs off this data.
//
// The curriculum reproduces the Ghauri 2025 Ch. 8 Heartbleed archetype:
// the IDS trains DDoS first, then MITM, then Heartbleed, then drifts
// back to DDoS. With Heartbleed configured at a much higher
// forgettingRate than DDoS/MITM, the trace shows the dissertation's
// signature pattern — Heartbleed peaks high but rots fast, while
// DDoS retention stays comfortable.
//
// Exposure preset:
//   DDoS       — 0.55  (most common attack class)
//   MITM       — 0.25
//   Heartbleed — 0.20  (less common but high-impact when present)
//
// Result: Ω-FP weights Heartbleed forgetting more aggressively than
// uniform-exposure would, which is the operationally honest reading
// the dissertation argues for.

import type { TaskRef } from "./training-trace-types";
import {
  buildSyntheticTrainingTrace,
  type CurriculumWindow,
} from "./training-trace-synthetic";

/** Ordered tasks the demo trace tracks. */
export const AI_SAFETY_DEMO_TASKS: TaskRef[] = [
  { id: "task_ddos", label: "DDoS", scope: "attack-class" },
  { id: "task_mitm", label: "MITM", scope: "attack-class" },
  { id: "task_heartbleed", label: "Heartbleed", scope: "attack-class" },
];

/**
 * Default per-task exposure used by the Ω-Forgetting Pressure surface.
 * Normalized to sum to 1; mirrors the public IDS-class distributions
 * the dissertation references (Ch. 8 §2). Values are illustrative —
 * a real production deployment would override per environment.
 */
export const AI_SAFETY_DEMO_EXPOSURE: Record<string, number> = {
  task_ddos: 0.55,
  task_mitm: 0.25,
  task_heartbleed: 0.2,
};

/**
 * Curriculum: 3 epochs DDoS → 3 epochs MITM → 3 epochs Heartbleed →
 * 6 epochs back to DDoS. The tail revisit on DDoS gives MITM and
 * (especially) Heartbleed a long off-task window to decay over so
 * the Ω-FP surface has a meaningful time-varying signal to render.
 */
const DEMO_CURRICULUM: CurriculumWindow[] = [
  { taskId: "task_ddos", startEpoch: 0, endEpoch: 3 },
  { taskId: "task_mitm", startEpoch: 3, endEpoch: 6 },
  { taskId: "task_heartbleed", startEpoch: 6, endEpoch: 9 },
  { taskId: "task_ddos", startEpoch: 9, endEpoch: 15 },
];

/**
 * Build the canonical AI Safety demo trace. Always synthetic; safe to
 * call multiple times — same seed + curriculum → bit-identical trace.
 */
export function buildAISafetyDemoTrace() {
  return buildSyntheticTrainingTrace({
    id: "ai-safety-demo-ids",
    label: "AI Safety — IDS continual-learning demo",
    tasks: AI_SAFETY_DEMO_TASKS,
    curriculum: DEMO_CURRICULUM,
    taskDynamics: {
      task_ddos: { forgettingRate: 0.05, learningRate: 0.5 },
      task_mitm: { forgettingRate: 0.08, learningRate: 0.5 },
      // Heartbleed: dissertation's archetypal high-FR task — rots ~4x
      // faster than DDoS when training moves away.
      task_heartbleed: { forgettingRate: 0.3, learningRate: 0.4 },
    },
    seed: 8201,
    noiseAmplitude: 0.015,
    description:
      "Synthetic continual-learning trace reproducing the Ghauri 2025 Ch. 8 Heartbleed-archetype forgetting pattern (DDoS / MITM / Heartbleed curriculum, exposure-weighted Ω-FP).",
  });
}
