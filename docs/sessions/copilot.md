# Session: COPILOT (Linguistic Access Layer → AI)

Owns the copilot as the **primary linguistic interface to the platform**. Long-term: this session evolves into Apex's own hybrid LLM/agent — the linguistic surface of the "platform-as-cortex" framing, where engine sessions (SPIRTES, TARSKI, PEARL, PARETO) are the cortex and this session is the access layer.

> **Status:** Newly split from TARSKI on 2026-05-04. Inherits a working substrate: `serializeGraphContext` already injects an `=== ENGINE STATE SNAPSHOT ===` block (PR #215 + #217), and `copilot-actions.ts` already parses `<<<ACTION:type:param>>>` blocks with 14 action types wired to the store. First-PR ask is to extend that scaffold into a richer **tool-use primitive** so users can drive the platform by language.

## Scope summary (in)

- **Tool-use primitive**: the `<<<ACTION:...>>>` mechanism — its parser, action vocabulary, parameter schema (currently single-string; needs richer payload), and the executor that maps actions to `useApexStore` mutations.
- **Intent routing**: turning natural-language input ("show me nodes related to sanctions") into structured tool calls. Includes prompt-engineering of the system prompt that teaches the LLM which tools exist.
- **Node isolation / graph filtering** as a copilot-driven action — first new tool: `isolate_nodes(query | ids[])` filters the graph to a relevant subset.
- **Conversation memory & turn management** — what the copilot remembers across turns, how prior tool calls feed the next prompt.
- **System prompt composition** — the section ordering, what's elided, how engine-state context is summarized for the model.
- **LLM provider plumbing** — `src/lib/llm-providers.ts`, model selection, streaming, fallback.
- **Eventual hybrid LLM/agent** — when this session matures, it owns the in-house model: training-data curation, fine-tuning surface, agent loop, evaluation harness.

## Scope summary (out — route elsewhere)

- **Engine state itself** (graph metadata, feed counts, Tarski violations, ΩF overlays) → owned by **TARSKI** / **SPIRTES** / **PEARL** / **PARETO**. This session only consumes via `summarizeEngineState` (`src/lib/engine-state-summary.ts`).
- **Chat panel chrome** (layout, scrolling, message bubbles, input affordances) → **UX & Onboarding**.
- **Canvas filtering visuals** (how isolated nodes are visually emphasized, how the rest fades) → **Rendering**. This session decides *which* nodes are isolated; Rendering decides *how* the filter looks.
- **Auth / API gating / rate limits on `/api/copilot`** → **Platform**.
- **Domain-specific axiom or graph data** → respective data sessions.

## Boundary clarifications

- **Engine context provision**: TARSKI ships `summarizeEngineState`. This session decides how that summary is rendered into the prompt and which parts get elided when context budget is tight.
- **Action execution**: store mutations (`setSelectedNode`, `severEdge`, `addShock`, etc.) are owned by their respective engine/UI sessions. This session owns the *router* that dispatches to them.
- **Snapshot mechanics**: shared with PEARL/PARETO/TARSKI via the System State Snapshot schema; agree on a common schema rather than diverging.
- **System prompt vs engine context**: system prompt (how the model should behave, what tools it has) lives here. Engine context (current graph state) is composed by `serializeGraphContext` here but sourced from engine helpers.

## Anchor files

- `src/lib/copilot-context.ts` — composes the prompt sent to the LLM. Already injects `=== ENGINE STATE SNAPSHOT ===`, `=== GRAPH METADATA ===`, `=== SELECTED NODE ===` (when a node is clicked).
- `src/lib/copilot-actions.ts` — action parser + executor. 14 action types live here (`select_node`, `add_shock`, `sever_edge`, `set_domains`, `solve_interdiction`, etc.). Parser is regex-based and single-arg — needs upgrade for multi-arg tools.
- `src/lib/copilot-engine.ts` — copilot's domain knowledge / reasoning helpers.
- `src/lib/athena-copilot-engine.ts` — Athena dataset variant.
- `src/lib/llm-providers.ts` — provider abstraction (Claude API, etc.).
- `src/app/api/copilot/route.ts` — the API endpoint the chat UI POSTs to.
- `src/components/SystemCopilot.tsx` — the chat UI surface (chrome owned by UX, but this session writes to it).
- `src/lib/engine-state-summary.ts` — TARSKI-owned helper; consumed read-only.

## Notes on current state

- The action mechanism (`<<<ACTION:type:param>>>`) works but is single-string and brittle. Multi-arg tools (e.g. `isolate_nodes(["sanctions", "iran"])`) need either a richer parser or a JSON payload format.
- The system prompt is composed in `serializeGraphContext` and is well-structured (sections, ordering, deterministic) — this is a strong foundation for tool-use.
- The copilot already routes to live engine state (PR #215 + #217). It does **not** yet have node-selection / isolation by query — clicking a node is the only way to deepen context today.
- LLM provider is configurable; Anthropic SDK is the current path. Prompt caching is not yet wired.

## Open follow-ups

1. **Tool-use scaffold + `isolate_nodes` (first PR)** — extend the action format from `<<<ACTION:type:param>>>` to a multi-arg form (proposal: `<<<ACTION:type:JSON_PAYLOAD>>>`) while keeping the existing 14 actions backward-compatible. Add `isolate_nodes` action that takes either a query string or `ids[]`, filters `graphData` to the matching subset, and tells Rendering to emphasize them. Update the system prompt to teach the LLM when to call it ("when the user names a topic, theme, or set of entities, isolate the matching nodes before answering").
2. **Intent-routing prompt design** — write the section of the system prompt that lists available tools, when to call each, and example invocations. Today the LLM emits actions ad-hoc; with a richer vocabulary we need explicit tool docs in the prompt.
3. **Conversation memory** — currently each turn rebuilds context from scratch. Decide what persists across turns (prior tool calls, isolated subgraph, mentioned entities) and how it's surfaced.
4. **Prompt caching** — Anthropic prompt-caching on the static portion of the system prompt (engine context changes per turn, but the tool docs and behavior rules don't). Lowers cost + latency.
5. **Evaluation harness** — once the tool vocabulary stabilizes, a small set of natural-language inputs → expected tool-call traces, run on PR.
6. **Hybrid LLM/agent (long-term)** — own-model surface. Out of scope until the tool-use vocabulary is mature; flagged here as the session's stated end-state.

## Cross-session etiquette

- Every new tool that mutates engine state must be co-designed with the owning engine session. This session writes the router and the prompt; the engine session writes the store mutator and its invariants.
- If a request asks for engine-state expansion (more Tarski axioms, more feeds, new ΩF metric), route to TARSKI / data sessions. This session only consumes engine state via `summarizeEngineState`.
- If a request asks for chat-panel UX (bubble layout, animations, message styling), route to UX & Onboarding.

## Stated end-state goal

Users drive the entire platform by natural language. Typing "show me sanctioned entities exposed to Iranian crude" isolates the right subgraph, surfaces the relevant Tarski violations, and explains the cascade — without the user touching any panel chrome. The copilot is the linguistic cortex; the engine sessions are the substrate.
