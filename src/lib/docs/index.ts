// ─── In-app documentation index ─────────────────────────────────────
//
// Curated user-facing reference docs surfaced from the Settings →
// Documentation menu entry. Source markdown lives under `docs/` in
// the repo; the prebuild step (scripts/sync-public-docs.mjs) copies
// the curated subset into `public/docs/<slug>.md` so the client can
// fetch them as static assets.
//
// When adding a doc:
//   1. Add the source path + dest slug to DOCS in
//      scripts/sync-public-docs.mjs
//   2. Add a matching entry below with a human-readable title and
//      one-line blurb (shown in the left nav as secondary text)
//   3. The drawer picks both up automatically — no JSX changes
//      needed.

export interface DocEntry {
  /** URL slug — corresponds to public/docs/<slug>.md */
  slug: string;
  /** Display name in the drawer's left nav */
  title: string;
  /** One-line description shown under the title in the nav */
  blurb: string;
}

export const DOC_INDEX: readonly DocEntry[] = [
  {
    slug: "architecture",
    title: "Architecture",
    blurb: "How the pieces fit together — store, engines, rendering, feeds.",
  },
  {
    slug: "engines",
    title: "Engines",
    blurb: "Spirtes / Tarski / Pearl / Pareto — what each one does and when.",
  },
  {
    slug: "data-model",
    title: "Data Model",
    blurb: "Nodes, edges, ω fragility, epoch snapshots, temporal series.",
  },
  {
    slug: "performance",
    title: "Performance",
    blurb: "What's fast, what's not, and what we measure.",
  },
  {
    slug: "manifold-for-t1d",
    title: "Manifold for T1D",
    blurb: "Domain walkthrough — glycemic axioms, CGM data, intervention paths.",
  },
] as const;
