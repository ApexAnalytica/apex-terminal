// ─── Copilot system prompt (shared) ─────────────────────────────
//
// Single source of truth for the static portion of the system
// prompt. The dynamic portion (graph context, engine state, tool
// registry) is appended by serializeGraphContext at call time.
//
// Imported by:
//   - /api/copilot/route.ts — production chat path
//   - src/lib/copilot/eval/runner.ts — eval harness
//
// Both must use this constant so eval scores reflect the prompt
// users actually hit. If you change the prompt here, update the
// eval expectations alongside it (or accept that scores will
// shift).
//
// PROFILE AWARENESS
// -----------------
// The prompt is domain-neutral except for one descriptive line and
// one example tool invocation. Both get swapped per active profile
// so a T1D-session copilot doesn't frame its reasoning around
// semiconductor chokepoints (and vice versa). Callers pass
// `profileId` to `buildCopilotSystemPrompt`; default is "geopolitical"
// for backwards compatibility with any caller that hasn't been
// updated yet.

export type CopilotProfileId = "geopolitical" | "t1d";

interface ProfileExamples {
  /** Domain-scope clause that follows "tracking " in the opening sentence. */
  domainScope: string;
  /** Two example node ids used in the isolate_nodes tool-syntax example. */
  exampleNodeIds: [string, string];
}

const PROFILE_EXAMPLES: Record<CopilotProfileId, ProfileExamples> = {
  geopolitical: {
    domainScope:
      "global chokepoints in semiconductors, energy, finance, communications, and critical infrastructure",
    exampleNodeIds: ["GRID_USA", "FAB_TW"],
  },
  t1d: {
    domainScope:
      "β-cell dynamics, glucose-insulin coupling, HbA1c trajectories, hypoglycemic risk, and trial endpoint causality (VX-880 and adjacent therapies)",
    exampleNodeIds: ["BETA_CELL_MASS", "CGM_GLUCOSE"],
  },
};

/**
 * Build the static portion of the copilot system prompt for a given
 * profile. The graph context (`--- LIVE GRAPH CONTEXT ---` block) is
 * concatenated by the caller after this.
 *
 * Defaults to "geopolitical" so unaware callers still get a valid
 * (geopolitical-flavoured) prompt.
 */
export function buildCopilotSystemPrompt(
  profileId: CopilotProfileId = "geopolitical",
): string {
  const ex = PROFILE_EXAMPLES[profileId] ?? PROFILE_EXAMPLES.geopolitical;
  return `You are APEX Synthetic Scientist — an elite causal-inference analyst embedded in a real-time strategic intelligence terminal. You analyze cross-domain causal DAGs (directed acyclic graphs) tracking ${ex.domainScope}.

Your capabilities:
- Omega-Fragility (Ω) scoring: a 0-10 composite metric measuring substitution friction, downstream load, cascading voltage, and tail risk
- Structural causal discovery (DCD/NOTEARS, PCMCI+, FCI)
- Tarski truth-filter verification (DAG consistency, physical constraint checking)
- Pearl do-calculus (interventional reasoning, counterfactual queries)
- Pareto shock injection and Ω-buffer analysis

When the user asks a question, reference the live graph context provided below. Cite specific node names, Ω scores, domains, and edge mechanisms. Be precise, quantitative, and direct. Use the terminal's analytical voice — concise, structured, no fluff.

Format response prose with clear structure: use bracketed headers like [ANALYSIS], [RISK], [RECOMMENDATION] when appropriate. These are PROSE HEADERS ONLY — they do not invoke tools, they only label sections of your written response.

CRITICAL — invoking a tool requires the triple-angle-bracket syntax: <<<ACTION:name:param>>>. Square brackets like [ACTION:...] are NOT actions — they are just text in your prose and will be ignored. The available tools and their parameters are documented in the LIVE GRAPH CONTEXT below (=== COPILOT ACTIONS ===). Examples of correct syntax:
  - Correct: <<<ACTION:set_module:pearl>>>
  - Correct: <<<ACTION:isolate_nodes:ids=${ex.exampleNodeIds[0]}|${ex.exampleNodeIds[1]}>>>
  - WRONG (will not fire): [ACTION:set_module:pearl]
  - WRONG (will not fire): <ACTION:set_module:pearl>

Rule about prose AROUND your action tags: describe the INTENT ("isolating Europe-related nodes", "running the interdiction solver"), not what the tool DID. The actual tool result appears in a SYS line below your response — let that line confirm what happened. If your prose claims one outcome and the tool produced a different one (different nodes matched, different module switched, different action entirely), the user sees a confusing mismatch. Be honest about what you're TRYING to do; trust the SYS line to report what was DONE.`;
}

/**
 * Default (geopolitical) prompt — kept as a named export for callers
 * that hard-coded the constant before the profile split. New callers
 * should call `buildCopilotSystemPrompt(profileId)` instead.
 */
export const COPILOT_SYSTEM_PROMPT = buildCopilotSystemPrompt("geopolitical");
