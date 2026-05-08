# Copilot eval harness

Grades the copilot's behavior against a curated set of `(user_message, expected_outcome)` test cases. Run a fixed test set against any model/provider; compare results to pick the right tradeoff between quality, latency, and cost.

## Why this exists

Without evals, every model decision (do we switch to Claude? distill to Llama? upgrade Gemini?) is guesswork. With evals, every decision is measurement.

This harness is the gate between today's "Gemini default" and the eventual "we trained our own model." You can't fine-tune without an eval set to grade the candidate model on.

## Quick start

```bash
# default: gemini-2.5-flash
npm run eval:copilot

# pick a model
npm run eval:copilot -- --provider anthropic --model claude-sonnet-4-20250514
npm run eval:copilot -- --model gemini-2.5-pro-preview-06-05

# write a JSON report
npm run eval:copilot -- --json eval-results.json

# run only cases tagged "tool-selection"
npm run eval:copilot -- --tag tool-selection
```

API keys come from `.env.local` (`GEMINI_API_KEY`, `ANTHROPIC_API_KEY`).

## What a case looks like

```ts
{
  id: "isolate_energy",
  description: "User asks for energy focus — model should isolate the subgraph.",
  user_message: "show me only the energy stuff",
  graph_fixture: "geopolitical_main",
  accepted_tool_calls: [
    { name: "isolate_nodes", params_match: { query: /energ/i } },
    { name: "set_domains",   params_match: { domains: { array_includes: "energy-systems" } } },
  ],
  required_in_response:  [/energy/i],
  forbidden_in_response: [/cannot|refuse/i],
  tags: ["tool-selection", "filtering"],
}
```

Two important properties:
- **Multiple acceptable tool calls.** The model passes if it picks any one of them. This case accepts both `isolate_nodes` and `set_domains` because both are legitimate answers to "show me energy."
- **Param matchers are flexible.** `{ query: /energ/i }` doesn't require an exact string — it matches any param value containing "energ". For arrays use `{ array_includes: "x" }`; for substrings use `{ includes: "x" }`.

## File layout

```
src/lib/copilot/eval/
  types.ts            TestCase, EvalResult, AssertionResult shapes
  assertions.ts       Pure-function predicates (checkToolCalls, checkResponseText, …)
  runner.ts           runEval() — calls streamText, parses tool calls via the registry, scores
  cases/seed.ts       Seed test set (~7 cases) + graph fixtures

scripts/
  eval-copilot.ts     CLI entry — parses args, runs, prints, optional JSON output

src/lib/__tests__/
  copilot-eval.test.ts  Unit tests for assertion logic (no LLM call required)
```

## Adding a case

1. Append a `TestCase` to `SEED_CASES` in `cases/seed.ts`.
2. Pick the `graph_fixture` it needs. Add a new fixture in `buildFixture` if none of the existing ones works.
3. Bias toward cases that exercise distinct behaviors. Adding a third "show me energy" variant adds noise; adding a "what is omega-fragility?" (no-tool case) adds signal.
4. Run `npm run eval:copilot` and confirm the case behaves as expected on at least one frontier model before merging.

## How the runner calls the LLM

It calls `streamText` from Vercel AI SDK directly with the same model adapter `/api/copilot/route.ts` uses. **Skips the route handler.** That's deliberate — the route is thin (it just wraps `streamText`); the eval grades model behavior, not route plumbing.

The system prompt is built via the same `serializeGraphContext` + `COPILOT_SYSTEM_PROMPT` that production uses, so eval scores reflect what real users hit.

`temperature: 0` for stability. LLMs are still slightly stochastic at temp 0 (especially Gemini), so single-shot results have some noise. Multi-shot stability sampling is a follow-up.

## Limitations of this first cut

- Single shot per case (no statistical sampling)
- No token / cost capture (the SDK exposes usage on `finishReason`; left for follow-up)
- No CI integration (you run it on demand; CI gating is a follow-up once cases are stable)
- No native `tool_use` — relies on the existing text-tag wire format. When PR3.3 lands, the runner will need to read native tool calls from `streamText` events alongside text deltas.

## Why so few seed cases?

Seven cases isn't enough for a robust eval — but it's enough to *seed* the harness and prove the loop works end-to-end. Real growth comes from production traces: query `copilot_traces` for turns where the LLM picked a surprising tool, hand-curate them into cases, and the eval set grows organically with the traffic.
