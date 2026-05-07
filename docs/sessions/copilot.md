# Session: Copilot (Linguistic Access Layer)

Owns the chat/copilot as the linguistic access layer to the platform: tool-use primitive, intent routing, node isolation, system prompt, LLM provider selection, conversation memory, trace logging. Long-term this evolves into a hybrid LLM/agent specialized for Apex Analytica's domain.

> **Status:** Active. Tool registry shipped ([#249](https://github.com/ApexAnalytica/apex-terminal/pull/249)). Trace store shipped ([#251](https://github.com/ApexAnalytica/apex-terminal/pull/251)). Provider abstraction (Vercel AI SDK) is the next planned PR.

## Scope summary (in)

- **Tool registry** — `defineTool` / param schemas / wire-format parsing / system-prompt rendering (`src/lib/copilot/tool-registry.ts`).
- **Built-in tools** — every action the LLM can emit (`src/lib/copilot/tools.ts`). Adding a new copilot capability = `defineTool({...})` here.
- **System prompt construction** — auto-generated tool list + graph context + engine state (`src/lib/copilot-context.ts`).
- **Trace logging** — every turn captured as a structured row in `public.copilot_traces` (`src/lib/copilot/trace-logger.ts`, `src/app/api/copilot/trace/route.ts`, `supabase-copilot-traces.sql`).
- **LLM call site** — `streamLlmQuery` in `src/lib/copilot-engine.ts`. Today: direct Anthropic / Gemini / Ollama calls. Planned: Vercel AI SDK provider abstraction so the call site is provider-agnostic.
- **Action routing into the store** — every tool handler accepts a `ToolContext` and reads/writes `useApexStore`. The handler decides what platform state changes (selection, isolation, shock injection, module switch, …).
- **Wire format** — `<<<ACTION:name:k=v,k=v>>>` text protocol. Comma separates kv pairs; `|` separates list items inside a value. Bare payloads (`<<<ACTION:select_node:USA_GRID>>>`) routed onto the tool's `legacyParam`.

## Scope summary (out — route elsewhere)

- **Chat panel chrome** — `SystemCopilot.tsx` UI (input box, message list, autocomplete dropdown, settings panel, voice input/output) → **UX & Onboarding**. This session changes `SystemCopilot.tsx` only when wiring trace capture or model providers — not for visual / interaction tweaks.
- **Engine state itself** — TARSKI / SPIRTES / PEARL / PARETO own their own data and validation. Copilot only *consumes* engine state via `summarizeEngineState` (already wired into `copilot-context.ts` via #215 + #217). New engine outputs that should appear in the prompt: route through `engine-state-summary.ts`, not the copilot directly.
- **Snapshot serialization** — `src/lib/snapshots/` is platform-state plumbing. Copilot reads snapshots via `serializeSnapshotContext` but doesn't author the snapshot format.
- **Auth / billing gates around the copilot** — **Platform** session.
- **Domain selection / dataset switching** — owned by data sessions (Geopolitical/Macro, T1D). The copilot has a `set_domains` tool to *invoke* their behavior; it doesn't define which domains exist.

## Boundary clarifications

- **A new tool**: define it in `src/lib/copilot/tools.ts`. The system prompt and the action runner pick it up automatically via `renderToolsForPrompt()`. Don't hand-write a list anywhere.
- **A new param type** (e.g. nested object): extend the discriminated union in `tool-registry.ts` (`ParamSchema`) and add cases to `coerceParam` + `renderParamSignature`. Keep the shape zod-compatible so we can swap to zod later without changing call sites.
- **Capturing more about a turn**: extend `TurnTrace` in `trace-logger.ts`, add the column to `supabase-copilot-traces.sql`, and add the field to the API route's validator. Schema changes are append-only — never rename or drop columns once in production.
- **A new model provider**: today this means a branch in `streamLlmQuery`. After PR3 (Vercel AI SDK abstraction) it'll be a provider config entry. Either way, the trace shape stays identical so traces remain comparable across providers.
- **Conversation memory**: there is no formal conversation-memory layer yet. Today the LLM gets the full message history per turn (`copilotMessages`). The trace store is the seed for proper memory: replay past conversations to build a per-user retrieval index.

## What's shipped

### PR #249 — tool registry
Replaced the hand-written `switch` in `copilot-actions.ts` with declarative `defineTool` registrations. Schema-typed params (`string` / `string[]` / `number` / `enum` / `boolean` with `required` / `default` / `min` / `max`). Auto-generated system prompt. JSON-Schema export (`renderToolsAsJsonSchema`) ready for native Anthropic `tool_use` migration. 14 existing actions migrated. Two new tools: `isolate_nodes` (filter visible graph by query or ids), `reset_isolation`. 28 unit tests.

### PR #251 — trace store
Every copilot turn becomes a row in `public.copilot_traces`. One row = one turn (user msg → assistant msg) with all tool calls colocated in `tool_calls jsonb[]`. Schema captures: conversation id + turn index, full message pair, structured tool calls (`{name, params, result, error, latency_ms}`), model provider/id, system-prompt hash + size, dataset / active module / selected node / shock count, free-form `client_meta`. RLS: users read own rows; writes via service role only. GIN index on `tool_calls` for `@>` containment queries. 13 new tests.

## Architecture

```
src/lib/copilot/
  tool-registry.ts     defineTool / schemas / parsers / coercion / prompt rendering / JSON-schema export
  tools.ts             every built-in tool — register here, system prompt picks it up automatically
  trace-logger.ts      logTurnTrace (fire-and-forget POST) + hashPrompt + newConversationId

src/lib/
  copilot-actions.ts   thin compat shim — parseActions / stripActions / processLlmActions(WithTrace)
  copilot-context.ts   serializeGraphContext — system prompt builder (consumes engine summary)
  copilot-engine.ts    streamLlmQuery — direct provider calls (PR3 will refactor this)

src/app/api/copilot/
  route.ts             POST /api/copilot — proxies to the LLM provider (Anthropic/Gemini)
  trace/route.ts       POST /api/copilot/trace — validates + inserts copilot_traces row

src/components/SystemCopilot.tsx
                       chat UI. Owned by UX & Onboarding for chrome; this session touches only the
                       LLM call site + trace-capture block

supabase-copilot-traces.sql
                       run in Supabase SQL Editor; ships with example analytics queries in comments
```

## How a turn flows

1. User types a message in `SystemCopilot.tsx` → `handleStreamingQuery(userContent)`.
2. `serializeGraphContext` builds the system prompt: `renderToolsForPrompt()` (auto-generated tool list) + engine state summary + graph context + active shocks/severed edges + Tarski report.
3. `streamLlmQuery` POSTs to the provider, streams tokens back.
4. After streaming completes, `processLlmActionsWithTrace(accumulated)` parses every `<<<ACTION:...>>>` tag, validates params against the registered schema, runs the handler, and returns `{displayText, actionResults, toolCalls}`.
5. Display text flushes to the store; action results render as a system message; structured `toolCalls` go into a `TurnTrace` and fire-and-forget POST to `/api/copilot/trace`.
6. Server validates, attaches `user_id` from the auth session, inserts via service role.

## Open follow-ups (priority-ordered)

1. **PR3 — provider abstraction (Vercel AI SDK)**. Replace direct provider calls in `streamLlmQuery` with a unified SDK so flipping between Claude / Gemini / local Ollama / vLLM is a config change, not code. Trace shape stays identical so we can A/B providers on the same conversation distribution. Ship a model picker in the chat UI. **5–7 days of work** — biggest architectural change post-#251.
2. **Eval harness**. Hand-curate 30–50 user queries with expected tool calls. Run them against current model + candidate models, score on tool-call accuracy + response quality. Use trace data to grow the eval set over time.
3. **Conversation memory**. Per-user retrieval index built from the trace store. Surfaces relevant past turns into the system prompt instead of dumping the entire `copilotMessages` array every time.
4. **Native tool-use migration**. Once PR3 ships, optionally swap the `<<<ACTION:...>>>` text wire format for native `tool_use` blocks (Anthropic) / functions (OpenAI) where the provider supports it. The text format stays as the fallback for providers / local models that don't. Registry already exports compatible JSON Schema (`renderToolsAsJsonSchema`).
5. **Distillation**. When trace volume hits ~10K rows: train a small open model (Llama 3.1 8B / Qwen 3 14B) on Claude/Gemini's traces from this platform via Unsloth + ART (Agent Reinforcement Trainer). Specialized, faster, cheaper, self-hosted. The traces are the moat — general LLMs don't see Apex's domain vocabulary.
6. **Dataset routing field**. `TurnTrace.dataset` is currently always null because the store doesn't have a top-level `activeDataset` field. Either add one to the store (cheap) or derive it from `selectedDomains` (also cheap). Useful for slicing traces by `main` / `athena` / `t1d` once we do.
7. **Per-user trace UI**. A "your conversation history" view that reads `copilot_traces` filtered to `auth.uid() = user_id`. Useful for users to revisit past sessions; also a debug tool for us.

## How to start a task

1. Read this file end-to-end.
2. `git log --oneline main -10` to spot anything that landed since the "Status" line above.
3. Check open PRs: `gh pr list` (or filter to copilot: `gh pr list --search "copilot in:title"`).
4. Pick from "Open follow-ups" or take fresh user direction.
5. **Update this file** at the end of every material change — especially the "What's shipped" section and any architecture diagram drift.

## Cross-session etiquette

- A request that's *about how the chat looks* → route to **UX & Onboarding**.
- A request that's *about what an engine computes* → route to the engine session (TARSKI / SPIRTES / PEARL / PARETO).
- A request that's *about new tools the copilot can call* → this session.
- A request that's *about which model powers the copilot, how it's prompted, or how its output is captured* → this session.
