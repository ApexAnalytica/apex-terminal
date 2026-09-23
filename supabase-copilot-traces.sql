-- =============================================================
-- APEX Terminal — Copilot Trace Store (PR2)
-- Run this in the Supabase SQL Editor after supabase-setup.sql
-- =============================================================
--
-- Purpose: capture every copilot turn as a structured row so we
-- can later replay conversations, build evals, and use traces as
-- training material for distillation / fine-tuning.
--
-- One row = one turn (user message → assistant response). All
-- tool calls fired during that turn are stored together in the
-- tool_calls jsonb array, keeping related events colocated.
-- =============================================================

create table if not exists public.copilot_traces (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  -- Identity. user_id is nullable so anonymous / pre-auth turns
  -- still log (useful for marketing-page demos). RLS keeps users
  -- restricted to their own rows.
  user_id uuid references auth.users(id) on delete set null,
  conversation_id text not null,
  turn_index integer not null,

  -- Conversation payload. user_message is what the user typed;
  -- assistant_message is the LLM's full response (including any
  -- <<<ACTION:...>>> tags); display_text is the cleaned text the
  -- user actually sees in the chat panel.
  user_message text,
  assistant_message text,
  display_text text,

  -- Structured tool invocations. Shape per element:
  --   { name: text, params: jsonb, result: text,
  --     error: text | null, latency_ms: int }
  tool_calls jsonb not null default '[]'::jsonb,

  -- Model metadata — lets us A/B compare providers later.
  model_provider text,
  model_id text,

  -- System prompt accounting. We store size + a cheap hash so we
  -- can tell "did the prompt change between turns?" without
  -- copying the full prompt (~50-200KB) into every row. The
  -- prompt itself is reconstructable from graph state if needed.
  system_prompt_hash text,
  system_prompt_size integer,

  -- Active platform context — the inputs that shaped the prompt.
  -- Enough to roughly recreate the turn for replay/eval.
  dataset text,
  active_module text,
  selected_node text,
  active_shock_count integer,

  -- Free-form extension point. Client version, feature flags,
  -- A/B test arms, anything else we want to slice on later.
  client_meta jsonb not null default '{}'::jsonb
);

-- Indexes ------------------------------------------------------

-- "Show me my history" — the hot per-user read.
create index if not exists copilot_traces_user_created_idx
  on public.copilot_traces (user_id, created_at desc)
  where user_id is not null;

-- Ordered conversation playback.
create index if not exists copilot_traces_conversation_idx
  on public.copilot_traces (conversation_id, turn_index);

-- Global recency for admin dashboards.
create index if not exists copilot_traces_created_idx
  on public.copilot_traces (created_at desc);

-- Tool-call lookup: "find all turns where isolate_nodes was
-- called". jsonb_path_ops is smaller + faster for @> containment
-- queries than the default jsonb_ops.
create index if not exists copilot_traces_tool_calls_gin
  on public.copilot_traces using gin (tool_calls jsonb_path_ops);

-- RLS ----------------------------------------------------------

alter table public.copilot_traces enable row level security;

-- Users can read only their own traces.
drop policy if exists "Users read own copilot traces" on public.copilot_traces;
create policy "Users read own copilot traces"
  on public.copilot_traces for select
  using (auth.uid() = user_id);

-- Inserts go through the API route under the service role, so
-- no INSERT policy for anon/authenticated. Service role bypasses
-- RLS by default, which is what we want.

-- =============================================================
-- ANALYTICS HELPERS (run on demand in the SQL editor)
-- =============================================================
--
-- Most-called tools in the last 7 days:
--
--   select
--     tc->>'name' as tool,
--     count(*) as calls,
--     avg((tc->>'latency_ms')::int) as avg_latency_ms
--   from public.copilot_traces,
--        jsonb_array_elements(tool_calls) as tc
--   where created_at > now() - interval '7 days'
--   group by 1 order by 2 desc;
--
-- Conversations that hit isolate_nodes:
--
--   select distinct conversation_id, created_at
--   from public.copilot_traces
--   where tool_calls @> '[{"name": "isolate_nodes"}]'::jsonb
--   order by created_at desc;
--
-- Tool failure rate by tool:
--
--   select
--     tc->>'name' as tool,
--     count(*) filter (where tc->>'error' is not null) * 1.0 / count(*) as failure_rate
--   from public.copilot_traces,
--        jsonb_array_elements(tool_calls) as tc
--   group by 1 order by 2 desc;
-- =============================================================
