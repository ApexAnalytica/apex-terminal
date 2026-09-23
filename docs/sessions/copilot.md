# Session: COPILOT (Linguistic Access Layer → AI)

Owns the copilot as the **primary linguistic interface to the platform**. Long-term: this session evolves into Apex's own hybrid LLM/agent — the linguistic surface of the "platform-as-cortex" framing, where engine sessions (SPIRTES, TARSKI, PEARL, PARETO) are the cortex and this session is the access layer.

> **Status:** Active. The LLM roadmap (tool registry → trace store → provider abstraction → model picker → eval harness → eval CI gate → conversation memory → trace browser & analytics) shipped through 12 PRs landing 2026-05-06 → 05-11. The chat now drives platform actions via a declarative tool registry, every turn lands in `public.copilot_traces` for replay + analytics, and a 20-case eval harness gates every copilot PR via GitHub Actions. The two remaining roadmap items — **native `tool_use` migration** and **distillation** — are deliberately held: the first is a refactor with marginal upside (the text wire format works), the second is gated on traces ≥ 10K.

## Defaults & invariants (DO NOT change without explicit user direction)

- **Copilot LLM defaults to Gemini.** `useApexStore.ts` initializes `llmProvider: "gemini"`, and `SystemCopilot.tsx` flows that straight through into `copilotProvider`. Gemini is the chat path because the chat is high-frequency and Gemini is the cheaper / faster choice; Claude is the heavy-reasoning *compute* path (snapshot validation, Tarski runs) — that split stays.
- **Switching providers requires explicit user action.** The picker in the chat settings panel can flip to Anthropic (Claude) or local Ollama, but nothing flips automatically; on-load default is always Gemini.
- **Adding a new provider is one line in `/api/copilot/route.ts`** — `resolveModel` is a switch over `LLMProvider` returning an `@ai-sdk/...` adapter. OpenAI / Mistral / Groq / vLLM / OpenRouter all plug in there. Streaming + auth + wire-format details are delegated to the SDK.
- **Trace shape is provider-agnostic.** `model_provider` is a column on `copilot_traces`, so we can compare Gemini vs. Claude vs. local Ollama on the same conversation distribution. Comparison reads from the data; the prompt and registry don't change with provider.
- **Wire format stays text** (`<<<ACTION:name:k=v>>>`). Universal — works with every model including Ollama. Native `tool_use` blocks are deprioritized because the text format works and the refactor is high-cost / low-marginal-value.

## What's shipped (12 PRs, 2026-05-06 → 05-11)

| PR | What |
|---|---|
| [#249](https://github.com/ApexAnalytica/apex-terminal/pull/249) | **Tool registry.** Declarative `defineTool` replaces the hand-written switch. Schema-typed params (string / string[] / number / enum / boolean with required / default / min / max). Auto-generated system prompt via `renderToolsForPrompt()` — LLM-visible action list can never drift from the code. JSON-Schema export ready for native tool_use. 14 actions migrated + `isolate_nodes` and `reset_isolation` added. |
| [#251](https://github.com/ApexAnalytica/apex-terminal/pull/251) | **Trace store.** Every turn → row in `public.copilot_traces`. All tool calls colocated in `tool_calls jsonb[]` (`{name, params, result, error, latency_ms}`). RLS: users read own rows; writes via service role. GIN index on `tool_calls` for `@>` containment queries. Fire-and-forget logging — failures never break chat. SQL migration: `supabase-copilot-traces.sql`. |
| [#264](https://github.com/ApexAnalytica/apex-terminal/pull/264) | **5 more tools.** `explain_node`, `compare_nodes`, `run_tarski`, `set_node_size_metric`, `reset_ablation`. |
| [#296](https://github.com/ApexAnalytica/apex-terminal/pull/296) | **Provider abstraction (PR3.1).** Three hand-rolled per-provider streaming functions collapsed into one `streamText` call via Vercel AI SDK. Wire contract preserved (text/plain stream). Side fix: lazy-init the Supabase admin client in the trace route. |
| [#298](https://github.com/ApexAnalytica/apex-terminal/pull/298) | **Model picker UI (PR3.2).** Settings toggle `[GEMINI ⏐ CLAUDE ⏐ OLLAMA]`. Header surfaces active model id. Default-on-load stays Gemini. |
| [#302](https://github.com/ApexAnalytica/apex-terminal/pull/302) | **Eval harness (PR4).** 7 seed cases, CLI (`npm run eval:copilot`), 20 unit tests for assertion logic. Validated live: 7/7 PASS on Gemini Flash. |
| [#310](https://github.com/ApexAnalytica/apex-terminal/pull/310) | **Dataset routing.** Trace rows carry `dataset` (`main` / `athena` / `t1d` / `vx880`) derived from `selectedDomains`. Specialization rule t1d > vx880 > athena > main when domains span datasets. |
| [#315](https://github.com/ApexAnalytica/apex-terminal/pull/315) | **Trace browser UI.** ⧉ button in chat header → "Your Conversations" panel with per-turn drill-in. RLS-protected (auth-aware server client). |
| [#317](https://github.com/ApexAnalytica/apex-terminal/pull/317) | **Eval seed 7 → 20.** Module switches, view toggles, eigenvector size, truth filter, replay, isolation by ids, ambiguous-intent definitional Q&A, off-topic redirect. Surfaced + fixed ambiguous-intent design issue. 20/20 PASS post-change. |
| [#319](https://github.com/ApexAnalytica/apex-terminal/pull/319) | **Eval CI gate.** `.github/workflows/copilot-eval.yml`. Runs on every PR touching the copilot surface. Single retry on flake. Fail-open with `::warning::` if `GEMINI_API_KEY` secret missing. Verified live (24s wall, 20/20 PASS on its own PR). |
| [#324](https://github.com/ApexAnalytica/apex-terminal/pull/324) | **"+ EVAL CASE" exporter button.** Click any trace row in the browser → inline form auto-populated from the captured turn → copy snippet → paste into `seed.ts`. Closes the trace→eval bootstrap loop. |
| [#331](https://github.com/ApexAnalytica/apex-terminal/pull/331) | **Conversation window.** Sliding-window prune on `copilotMessages` before send (last 12 messages). Surfaces "N earlier turns omitted from context" hint when truncating. |
| [#332](https://github.com/ApexAnalytica/apex-terminal/pull/332) | **Trace analytics view.** STATS tab on the trace browser. Total turns / tool calls / conversations; per-tool count + error rate + mean & p95 latency; per-model rollup. |

## Architecture map

```
src/lib/copilot/
  tool-registry.ts        defineTool / schemas / parsers / coercion / prompt rendering / JSON Schema export
  tools.ts                every built-in tool (~21 of them as of #264)
  system-prompt.ts        buildCopilotSystemPrompt(profileId) + COPILOT_SYSTEM_PROMPT — shared between route + eval. Profile-aware: domain-scope clause and example tool-syntax node ids swap on "geopolitical" vs "t1d". Default is "geopolitical" for backwards compat; the named constant equals the geopolitical variant so the eval harness keeps reproducible scores.
  trace-logger.ts         logTurnTrace + hashPrompt + newConversationId + resolveActiveDataset (#310)
  conversation-window.ts  pruneConversation(messages, limit=12) — sliding window (#331)
  analytics.ts            summarize(rows) — pure aggregator (#332)
  eval/
    types.ts              TestCase / EvalResult / AssertionResult shapes
    assertions.ts         pure-function predicates (toolCallMatches, checkResponseText, …)
    runner.ts             streamText + parse via registry + score → EvalReport
    cases/seed.ts         20 seed cases + graph fixtures
    case-snippet.ts       buildCaseSnippet — pure fn that produces the TS literal (#324)
    README.md             how to run, how to add a case, limits

src/lib/
  copilot-actions.ts      thin compat shim — parseActions / processLlmActions / processLlmActionsWithTrace
  copilot-context.ts      serializeGraphContext — system-prompt builder, calls renderToolsForPrompt()
  copilot-engine.ts       streamLlmQuery — server-routed for Anthropic/Gemini, browser-direct for Ollama
  llm-providers.ts        LLMProvider type + PROVIDER_MODELS catalog

src/app/api/copilot/
  route.ts                POST — Vercel AI SDK streamText, provider switch in resolveModel
  trace/route.ts          POST — validate + insert copilot_traces (lazy-inits service-role client)
  traces/route.ts         GET  — RLS-filtered list of user's recent turns (#315)
  traces/analytics/route.ts  GET — RLS-filtered aggregations (#332)

src/components/
  SystemCopilot.tsx           chat UI + trace-capture wiring + window prune + picker
  CopilotTraceHistory.tsx     panel with [LIST | STATS] tabs (#315 + #332)
  CopilotTraceStats.tsx       aggregates view (#332)
  CopilotEvalCaseExporter.tsx + EVAL CASE form (#324)

scripts/
  eval-copilot.ts         CLI: npm run eval:copilot [--provider X --model Y --tag T --json out.json]

.github/workflows/
  copilot-eval.yml        Path-filtered CI gate (#319)

supabase-copilot-traces.sql   migration (already run in production)
```

## Scope (in)

- **Tool registry + new tools** — anything that adds, removes, or changes a `defineTool` registration in `src/lib/copilot/tools.ts`.
- **System prompt composition** — section ordering, what's elided when context is tight, how engine state is summarized for the model. `serializeGraphContext` and the static `COPILOT_SYSTEM_PROMPT` both live here.
- **Wire format + parser** — the `<<<ACTION:name:k=v>>>` text format, the kv parser, the registry's coercion + validation layer.
- **Trace store + analytics** — schema, ingestion route, read routes, RLS, aggregations. The DDL lives in `supabase-copilot-traces.sql`.
- **Eval harness** — seed cases, runner, assertion shapes, CI gate, the "+ EVAL CASE" exporter.
- **Conversation memory** — currently a sliding window (#331); future summarization or retrieval-augmented memory lives here.
- **LLM provider plumbing** — `resolveModel` in the route, the model picker UI, `LLMProvider` type.
- **Eventual hybrid LLM/agent** — when this session matures, it owns the in-house model: training-data curation, fine-tuning surface, agent loop, eval harness extensions.

## Scope (out — route elsewhere)

- **Engine state itself** (graph metadata, feed counts, Tarski violations, ΩF overlays) → owned by **TARSKI** / **SPIRTES** / **PEARL** / **PARETO**. This session consumes via `summarizeEngineState` only.
- **Chat panel chrome** (layout, scrolling, message bubbles, input affordances, autocomplete) → **UX & Onboarding**. The copilot session writes to `SystemCopilot.tsx` only for behavior that's logically part of the copilot (trace capture, prompt assembly, picker wiring).
- **Canvas filtering visuals** (how isolated nodes look dimmed) → **Rendering**.
- **Auth / API gating / rate limits** → **Platform**.
- **Domain-specific axiom or graph data** → respective data sessions.

## How to extend (quick reference for future agents)

### Add a new tool

1. Edit `src/lib/copilot/tools.ts`. Call `defineTool({ name, description, params, handler, ... })`.
2. The system prompt picks it up automatically via `renderToolsForPrompt()`.
3. Add an eval case in `src/lib/copilot/eval/cases/seed.ts` exercising it.
4. Run `npm run eval:copilot` locally to confirm Gemini picks it up.

### Add an eval case

1. Either hand-edit `src/lib/copilot/eval/cases/seed.ts`, or
2. Open the trace browser (⧉) in the chat → find a representative turn → click **+ EVAL CASE** → copy snippet → paste into `seed.ts`.
3. Run `npm run eval:copilot` to validate locally.
4. The CI gate (`.github/workflows/copilot-eval.yml`) runs the full set on every PR touching the copilot surface.

### Change the default provider

Don't. See "Defaults & invariants" above. If you genuinely need to, the change is:
1. `useApexStore.ts` initial `llmProvider` value.
2. Update the Defaults & invariants section here so future agents see the new rule.
3. Tell the user — it's a behavioral change, not a code refactor.

### Add a new provider

1. Install the `@ai-sdk/<provider>` adapter.
2. Add a branch to `resolveModel` in `src/app/api/copilot/route.ts`.
3. Add the provider's models to `PROVIDER_MODELS` in `src/lib/llm-providers.ts`.
4. Add the provider option to the picker in `SystemCopilot.tsx` (mirror the existing GEMINI / CLAUDE / OLLAMA pattern).

## Open follow-ups (priority-ordered)

1. **Native `tool_use` migration (PR3.3)** — held. Wire format would change from text regex to `tool_use` blocks for providers that support them; text format stays as the fallback for Ollama / older models. Marginal upside (slightly better tool selection on frontier models, structured arg streaming) at high refactor cost. Revisit if production traces start showing tool-selection errors that native blocks would fix.
2. **Distillation (PR5)** — gated on traces ≥ 10K + eval set ≥ 30 cases. Toolchain: Unsloth → Llama 3.1 8B (or Qwen 3 14B) fine-tuned on Claude/Gemini traces from this platform → vLLM serving. Cloud H100 rentals (Lambda / RunPod / Modal). Not actionable until trace volume gets there.
3. **Multi-shot stability sampling in the eval runner** — Gemini at temperature 0 is empirically not fully deterministic (observed during seed expansion). The CI gate has a single retry to absorb that; a more principled fix is N-shot sampling with a stability % reported alongside pass rate.
4. **Conversation memory upgrade** — current implementation is a sliding window (#331). When traces show users hitting deep coherent conversations that suffer from dropped context, swap the window for LLM-generated "earlier in this conversation, X happened" summarization. Further: per-user retrieval index built off `copilot_traces` for cross-conversation memory.
5. **Prompt caching** — Anthropic's prompt-cache headers on the static portion of the system prompt (tool docs + behavior rules, ~2KB). Lowers cost + latency on the Claude path. Only matters when usage on Claude is meaningful.

## Cross-session etiquette

- Every new tool that mutates engine state must be co-designed with the owning engine session. This session writes the router + the prompt; the engine session writes the store mutator and its invariants.
- If a request asks for engine-state expansion (more Tarski axioms, more feeds, new ΩF metric), route to TARSKI / data sessions. This session only consumes engine state via `summarizeEngineState`.
- If a request asks for chat-panel UX (bubble layout, animations, message styling), route to UX & Onboarding. SystemCopilot.tsx is co-owned at the file level — this session edits the trace-capture, prompt-assembly, and picker logic; UX edits the layout, autocomplete, and visual chrome.

## Stated end-state goal

Users drive the entire platform by natural language. Typing "show me sanctioned entities exposed to Iranian crude" isolates the right subgraph, surfaces the relevant Tarski violations, and explains the cascade — without the user touching any panel chrome. The copilot is the linguistic cortex; the engine sessions are the substrate. The eval harness keeps the model honest. The trace store keeps a record we can replay, analyze, and eventually distill into a self-hosted model.
