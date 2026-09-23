# Session Map

Manifold development is split across focused sessions. Each session owns a slice of the product so context stays tight and changes don't bleed across concerns. When you spawn a new session, the first thing it should do is read its own scope file from this directory.

## Routing table

| Session | File | Owns |
| --- | --- | --- |
| UX & Onboarding | [`ux-onboarding.md`](./ux-onboarding.md) | Tour, welcome modal, persona pills, Domain Workspace, header chrome, feedback widget UX, brand vocabulary, news interpreter UI, accessibility, empty/loading states |
| Platform | [`platform.md`](./platform.md) | Auth, Supabase plumbing, middleware, webhooks, admin/feedback triage backend, account provisioning |
| Payments | [`payments.md`](./payments.md) | Billing, tier gating logic, payment flows |
| Rendering | [`rendering.md`](./rendering.md) | 2D/3D/MAP canvas, layout algorithms, viewport, selection, render performance |
| SPIRTES | [`spirtes.md`](./spirtes.md) | Causal-discovery engine (DCD/NOTEARS, PCMCI+, FCI) |
| TARSKI | [`tarski.md`](./tarski.md) | Constraint-verification engine (PHYSICAL / REGULATORY / HEURISTIC axioms) |
| PEARL | [`pearl.md`](./pearl.md) | Do-calculus interventions, ablations, CASCADE DEFENSE auto-interdiction |
| PARETO | [`pareto.md`](./pareto.md) | Criticality horizons (CSD, PH, LPPLS), Ω-Fragility, shock injection |
| Geopolitical / Macro | [`geopolitical-macro.md`](./geopolitical-macro.md) | Geopolitical / financial / macro / defense graph data (`dataset: main \| athena`) |
| T1D / Life Sciences | [`t1d.md`](./t1d.md) | Type-1 Diabetes graph data, β-cell dynamics, T1D vocabulary (`dataset: t1d`) |
| Copilot | [`copilot.md`](./copilot.md) | Linguistic access layer — tool-use primitive, intent routing, node isolation, system prompt, LLM provider, conversation memory. Long-term: hybrid LLM/agent. |

## How to use this

When you start a new session:

1. The user names the session (e.g. `manifold-platform`) and tells the agent to read `docs/sessions/<name>.md` first.
2. The scope doc states what the session owns and explicitly what it does *not* — including how to route out-of-scope requests.
3. Edit the scope doc when scope shifts (e.g. "Platform now also owns the deploy-webhook chain") so future sessions pick the change up.

## Cross-session etiquette

- If a request straddles two sessions, the receiving session flags the boundary and asks to route — it does not absorb the work.
- Don't duplicate code locations across scope docs. If something genuinely lives at a boundary, name it once and cross-reference.
- Shared substrates (e.g. `useApexStore`, `DomainProfile` seam) are referenced from any session that touches them, but only one session is the canonical owner of changes — call that out in the scope doc.

## Multi-device continuity (Mac / phone / travel)

All session state lives in this repo. To pick up work from a different device:

### MacBook (full Claude Code session)

```bash
git clone https://github.com/ApexAnalytica/apex-terminal.git
cd apex-terminal
npm install
# Install Claude Code if needed: https://claude.ai/code
claude
```

Then in the session, tell the agent which scope doc to read first — e.g. *"Read `docs/sessions/spirtes.md` and continue."* The scope doc is the single source of truth for what's in flight, recently merged, and pending.

### Phone (read / approve only)

- **GitHub mobile app** — review/approve open PRs, browse session docs (`docs/sessions/*.md`) directly in the repo, comment on issues.
- **Working Copy (iOS)** — clone the repo locally, read MD files offline, edit and push small changes.
- **claude.ai/code in mobile browser** — full Claude Code session from the phone if you need to drive code changes.

#### One-file offline bundle

For reading on a plane or anywhere without per-file navigation, every scope doc is concatenated into [`docs/sessions.bundle.md`](../sessions.bundle.md) — a single ~300 KB markdown file with a generated TOC. Open it in any markdown viewer (GitHub mobile renders it directly).

Regenerate after editing any scope doc:

```bash
npm run export:sessions
```

The bundle is committed alongside the source files so the latest pushed version is always browsable from the phone without running the script.

### Keeping continuity across devices

- **Always commit + push before switching devices.** If a session ends mid-task, push a WIP commit (`wip: <note>`) on the active branch so the next device sees it.
- **The active branch is the canonical state.** Currently: `claude/spirtes-tarski-engines-tbQHn`. When that branch is fully merged, the next session opens a new one.
- **Scope docs are the handoff.** After each significant change, the owning session doc gets updated — so a fresh device + fresh agent can read the doc and know exactly where things stand without conversation history.
- **Open PRs are the to-do list.** `gh pr list` (or GitHub mobile) shows what's pending review across devices.
