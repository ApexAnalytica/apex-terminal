# Manifold — Session Bundle

_Generated 2026-05-29 by `scripts/export-sessions.ts`. Re-run to refresh. Source of truth is the individual files under `docs/sessions/` — edit those, not this bundle._

---

## Session Map (README)

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

---

## Contents

- [`ux-onboarding.md`](#ux-onboarding)
- [`platform.md`](#platform)
- [`payments.md`](#payments)
- [`rendering.md`](#rendering)
- [`spirtes.md`](#spirtes)
- [`tarski.md`](#tarski)
- [`pearl.md`](#pearl)
- [`pareto.md`](#pareto)
- [`geopolitical-macro.md`](#geopolitical-macro)
- [`t1d.md`](#t1d)
- [`copilot.md`](#copilot)
- [`rendering-perf.md`](#rendering-perf)
- [`spirtes-live-scoping.md`](#spirtes-live-scoping)

---

## ux-onboarding.md

# Session: UX & Onboarding

Owns **what users see, click, and learn before they're productive**, plus the chrome around the experience after that.

## Product context

Manifold (internal: Apex Terminal) is a causal-graph terminal for systemic-risk analysis. Production: https://manifold.apexanalytica.co. The same substrate renders as either a geopolitical-risk terminal or a medical-research (T1D) terminal via a `DomainProfile` seam. Most users are first-time visitors who need to be walked into a non-trivial product.

This session does **not** care about graph data, engines, canvas rendering, or platform plumbing. It owns the moment-of-arrival experience and the persistent chrome.

## Surfaces this session owns

### First-visit flow
- Welcome modal + Domain Workspace + auto-launching SpotlightTour
- Component: `src/components/SpotlightTour.tsx` (rendering shell). Step data lives in `src/lib/tour-steps.ts`.
- Storage flag: `localStorage["manifold:tour-seen"]`
- Uses `data-tour="..."` anchors throughout the app to attach steps to UI elements
- **Two-phase structure**:
  - **First run** (~9 steps): auto-launches on first visit. Tight, hands-on — three steps gate on user interaction (`awaitInteraction`) before advancing: click any node, switch to TARSKI, drag the time dial. Last step opens an opt-in deep-dive menu.
  - **Deep dive** (opt-in, accessed from finish-step menu or via `?` button): three tracks the user picks from — `engines` (SPIRTES / TARSKI / PEARL / PARETO), `loop` (shocks · Cascade Defense · Compute), `customization` (views · text size · import · feedback).
- **Track-aware copy**: each step's `copy` field can be `StepCopy` (shared) or `Record<TourTrack, StepCopy>` (per-track). The two tracks are `analyst` (used for `financial | macro | geopolitical | cross | analyst`) and `scientist`. `trackForPersona()` does the mapping. Five personas collapse to two tracks because financial/macro/geopolitical/cross share enough vocab to take the same tour with shared copy; scientist is a distinct domain that deserves its own framing.
- **Escalating-hint stall recovery**: when a step has `awaitInteraction` and the user idles, after 8s the highlight starts a soft pulse (`tour-pulse-soft`); after 15s it pulses harder (`tour-pulse-strong`) and the in-tooltip hint goes bold. There is no "skip step" button — users can still bail from the whole tour via SKIP TOUR / Esc.

### Persona gating
- `activePersona: "scientist" | "financial" | "macro" | "geopolitical" | "cross" | "analyst"` in `useApexStore`, default `"financial"`. (`"analyst"` is retained only to tolerate legacy persisted values from before the persona refactor — no UI surfaces it.)
- Five pills in the Domain Workspace modal control which domain cards are visible:
  - **FINANCIAL** → Markets · Credit · Sovereign (`FINANCIAL & SOVEREIGN`, `MENA ENERGY & COMMODITIES`)
  - **MACRO** → Growth · Inflation · Policy (`MACRO IMPACT`, `FINANCIAL & SOVEREIGN`)
  - **GEOPOLITICAL** → Energy · Infra · Defense (`MENA ENERGY & COMMODITIES`, `INFRASTRUCTURE & DEFENSE`, `FINANCIAL & SOVEREIGN`)
  - **SCIENTIST** → Life Sciences (`dataset: t1d`)
  - **CROSS-DOMAIN** → all cards; only persona where multi-select across dataset families is allowed
- Switching persona silently drops out-of-family selections
- Within focused personas (Financial/Macro/Geopolitical/Scientist), multi-select is restricted to a single dataset family
- Canonical type union lives in `useApexStore.ts`. `DomainSelector.tsx` mirrors it locally as `Persona` — keep them in sync.

### Domain Workspace modal
- `src/components/DomainSelector.tsx`
- Persona pills, domain cards by group (LIFE SCIENCES / MACRO IMPACT / etc.), single vs multi-domain mode toggle, "launch workspace" CTA

### Header bar chrome
- `src/components/HeaderBar.tsx`
- Top-bar module tabs are pinned to canonical SPIRTES/TARSKI/PEARL/PARETO labels (per #70)
- Profile-scoped vocabulary (T1D module names, pillar labels) flows through the sidebar and inspector, *not* the top bar

### Text size toggle
- `src/components/TextSizeToggle.tsx`, `src/hooks/useTextSize.ts`
- S/M/L segmented control persisted to `localStorage["manifold:text-size"]`
- Sets `data-text-size` on `<html>`. CSS in `src/app/globals.css` defines a `--text-mult` variable per state and overrides each text utility actually used in the codebase (every `text-[Npx]` plus the standard `text-xs/sm/base/lg/xl/2xl/3xl`) with `font-size: calc(<original> * var(--text-mult))`. When adding a new `text-[Npx]` size, add a matching override line.
- Pre-paint inline script in `src/app/layout.tsx` prevents flash-of-wrong-size
- This *only* scales text — layout, canvas, and icons are not affected. (Earlier implementation used `zoom` on `<html>`, which scaled everything; replaced because it was a UX bug.)

### Feedback widget
- `src/components/FeedbackWidget.tsx`
- Fixed-position button + modal
- Drops a row into Supabase `feedback` table, which feeds the admin triage → agent PR → deploy pipeline
- The backend of that pipeline is **Platform-owned**; only the in-app widget UX is ours

### Branding / labels / copy
- "Manifold" is the primary brand title
- "Interdiction" is renamed "CASCADE DEFENSE" (#31)
- Manual interdiction in PEARL vs auto-interdiction is a vocabulary distinction users need to learn

### News interpreter UI
- `src/components/news/*`
- Panel that lets users paste an article URL or text and turns it into graph interventions
- The data flow is engine-side; the panel UX (URL fetch button, paste affordance, loading states, error display) is ours

### Right-rail context column
- Three stacked blocks at the top of `ModulePanel` (the right panel) that give the user immediate situational awareness:
  - **AT A GLANCE** (`relevantNowCallouts` in `ModulePanel.tsx`) — top 3 context signals; selection-aware (centrality, cascade, auto-bridges incident on selected node) or graph-wide (stability, components, bridge lifecycle counts, uncertainty)
  - **REVIEW** (`NodeInspector.tsx`, only when a node is selected) — synthesised verb-led recommendations (`buildContextualReview` in `src/lib/contextual-review.ts`): Tarski axiom hits on incident edges, ΩF velocity, unpromoted bridges, cascade saturation, confounder, χ★ membership
  - **CALCULATIONS** (`CalculationsPanel.tsx`) — pure-function readouts from `src/lib/calculations/` registry (HHI, cross-domain edges, mean ΩF). New entries (Greeks, T1D scores, supply-chain variants) plug in by appending to `CALCULATION_REGISTRY`. Two push paths to TimeDial:
    - **Node-scoped** — calcs implementing `toSnapshot(result, ctx)` (e.g. HHI) get a "→ DIAL" button that pushes the current value into the selected node's `liveData[]` via `pushCalculationSnapshot`. History accumulates through the existing temporal infrastructure; renders as a sparkline in the time-series cards.
    - **Graph-wide** — calcs implementing `toGraphSnapshot(result, ctx)` (e.g. mean ΩF, cross-domain edges) push into `graphCalcHistory[calc.id]` via `pushGraphCalcSnapshot`. A tiny inline sparkline (12px tall, 48px wide) renders next to the value once ≥2 entries exist — no node attachment needed
- All three render only when at least one entry fires — empty/healthy graphs don't paint dead chrome
- Tone-coloured dots (red/amber/green/neutral) keep the visual language consistent across the three blocks

## Scope summary (in)

- Tour content + step targeting + auto-launch logic + cutout/highlight/arrow behavior
- Welcome modal, modal collisions, first-visit storage flags
- Persona pill UX, gating logic, default-persona decisions, multi-select rules
- Domain Workspace modal layout, card grouping, mode toggle, launch CTA
- Header chrome (text size toggle, button placement, label pinning, FEEDBACK button conflicts)
- Feedback widget UX (entry affordance, form, success/error states)
- Brand vocabulary, terminology consistency, copy decisions
- Onboarding metrics / instrumentation if/when added
- Accessibility (keyboard nav, focus traps in modals, escape behavior, contrast for dim/cutout layers)
- Empty states, loading states, error toasts across the app

## Scope summary (out — route elsewhere)

Each item routes to its own session. Do not absorb out-of-scope work; flag and route.

- Graph data, nodes, edges, domain profiles (other than the persona→profile mapping) → **Geopolitical/Macro** or **T1D** session
- Engine logic (Pearl MC, Pareto criticality, Spirtes discovery, Tarski axioms) → respective **engine sessions**
- 2D/3D canvas, layout algorithms, viewport, selection mechanics, render perf → **Rendering** session
- Auth, Supabase plumbing, middleware, webhooks, the `/admin/feedback` triage backend, **account provisioning / whitelisting** → **Platform** session
- Payments, billing, tier gating logic → **Payments** session

Tour UX and persona gating sometimes cross into Rendering or Platform — flag boundary cases and route.

## Boundary clarifications

- **Tour ↔ Rendering**: anchors and tour mechanics are ours even when they sit on canvas chrome, but if a step requires changing how a canvas control renders/positions, that's a Rendering handoff.
- **Feedback widget ↔ Platform**: we own the button, modal, form fields, validation, success/error toast, and the *shape* of the row written to `feedback`. Platform owns the Supabase insert call, the admin triage UI, the GH-issue/agent-PR/deploy webhook chain, and any auth context attached server-side.
- **News interpreter ↔ Pareto/engine**: we own paste-vs-URL affordance, fetch button, loading skeletons, error copy, empty state. The actual article→intervention transformation, the engine call, and the resulting graph mutation are not ours.
- **Empty-state copy on data-driven cards** (e.g. "NO DATA — static Ω only" on ΩF SERIES): the *wording* is ours, the *condition that triggers it* belongs to the data session.
- **Persona persistence**: currently resets on page load by design. May revisit. If a task asks to make persona persist, check first because it touches store-hydration timing other sessions care about.

## Shipped PRs in this scope (history)

Tour (huge investment, ~10 PRs in late April):
- **#89** — rewrote SpotlightTour to 24 steps, auto-launches on first visit via `manifold:tour-seen`, dashed cyan connector arrow + cyan ring around cutout, added `data-tour` anchors
- **#90** — fixed welcome/domain-selector modal collision on first visit
- **#93** — don't strand users when they click outside the cutout on first visit
- **#94** — auto-advance when user interacts with the highlighted element (later partially reverted in #100)
- **#95** — let clicks reach the highlighted element; dropped the cyan ring
- **#96** — restored a prominent border around the cutout
- **#98** — guarantee the cutout is un-dimmed; backdrop click no longer closes the tour
- **#99** — gate advance on domain pick; flush cutout against the modal body
- **#100** — dual highlight on module-tabs (tabs + right panel via `secondaryTargetSelector`); migrated dim from 4 divs to an SVG mask to support multiple cutouts; removed click-to-advance
- **#112** — replace SVG mask with `<path fill-rule="evenodd">` so the cutout is truly un-dimmed across all browsers

Persona + workspace:
- **#70** — persona pills in Domain Workspace; `activePersona` in `useApexStore`; pinned top-bar module labels to `GEOPOLITICAL_PROFILE.modules`
- **#74** — subdivided ANALYST persona; fixed active pill highlight bug
- **#92** — refactored `DomainSelector` to drop the static `CASCADE_EXAMPLES` lookup + panel

Header chrome:
- **#85** — text-size toggle (S/M/L) using CSS `zoom` on `<html>`, localStorage persistence, pre-paint inline script
- **#53** — keep module panel content clear of the fixed FEEDBACK button

Branding / vocabulary:
- **#23** — Manifold branding + interactive DAG overlays
- **#29, #30** — make MANIFOLD the primary brand title
- **#31** — rename "Interdiction" to "CASCADE DEFENSE"
- **#68** — removed click-to-speak affordance (deprecated voice I/O #20)

Feedback widget UX:
- **#79** — full feedback-to-prod pipeline (admin/feedback triage UI + GH issue + Claude agent PR + Vercel deploy webhook). Widget is the entry point we own.

News interpreter UI:
- **#52** — news interpreter panel: article → graph interventions
- **#58** — URL-fetch button: paste a link instead of full article text

## Likely upcoming themes

- Real-user feedback from the production pipeline that lands as UX bug reports — triage and route here vs. other sessions.
- Onboarding completion metrics (how many users finish the tour, where they drop off) — not instrumented yet.
- Persona selection persistence (currently resets on page load).
- Empty-state language across modules (e.g. "NO DATA — static Ω only" on ΩF SERIES; data-side trigger, our wording).
- Mobile/tablet responsive behavior — desktop-first; likely a real UX project once a customer asks.
- **Calculations menu (user-requested, future).** Place it on the bottom-left of the DAG canvas, above the existing DOMAINS frame. A picker that exposes domain-specific calculations the user can invoke directly — e.g. financial Greeks (delta / gamma / vega / theta) on FRED / WB series, T1D-side calcs (HOMA-IR, time-in-range), supply-chain calcs (Herfindahl-Hirschman concentration, throughput-utilisation). Once a calc runs, its result becomes a pushable time series — sender pushes onto the TimeDial overlay so the user can watch "how Greeks evolve over time" alongside live feeds. Routing: the menu chrome + push-to-dial UX lives here (UX & Onboarding); per-domain calc implementations live in the relevant engine session (Pareto for risk-pricing Greeks, Pearl for counterfactual deltas, T1D for clinical scores). Cross-session coordination needed before this can ship.

## How to start a task

When given a task in this session:

1. Confirm the task is in-scope. If it sits on a boundary, flag and route rather than absorb.
2. For tour-step changes, look for the `data-tour="..."` anchor in the target component first — adding a new anchor is often the right move before touching `SpotlightTour.tsx`.
3. For persona logic, the canonical type union lives in `useApexStore.ts`. `DomainSelector.tsx` mirrors it locally — keep them in sync.
4. Verify visual/interaction changes by running the dev server, clearing `localStorage["manifold:tour-seen"]` to retest first-visit flows, and snapshotting key states. Don't ask the user to check manually unless tooling truly can't.

---

## platform.md

# Session: Platform

Owns identity, access control, server-side plumbing, and the admin tooling that sits behind the in-app surfaces. Anything between "user opens the URL" and "user sees the app" is in scope; anything inside the app post-login is owned by the relevant feature session.

> **Detailed reference docs already in the repo (read these first):**
> - [`docs/AUTH.md`](../AUTH.md) — auth model, two-tier (trial/trusted), middleware, RLS, runbook for managing users.
> - [`docs/feedback-pipeline-setup.md`](../feedback-pipeline-setup.md) — feedback → GitHub issue → agent PR → Vercel deploy chain.
> - [`docs/DEPLOYMENT.md`](../DEPLOYMENT.md) — env vars, Vercel config.
> - [`supabase-setup.sql`](../../supabase-setup.sql), [`supabase-feedback-pipeline.sql`](../../supabase-feedback-pipeline.sql) — schema.

## Scope summary (in)

### Auth & access control
- Supabase auth provider integration
- The two-tier access model: `trusted` (permanent, invite-code) vs `trial` (48h expiry)
- `public.profiles` table, RLS policies
- Edge middleware: `src/middleware.ts` (the single gate for all routes), `src/lib/supabase/middleware.ts`
- Admin auth helpers: `src/lib/admin-auth.ts`
- Sign-up routes: `/trusted-signup`, `/trial-signup`, `/expired`
- Server endpoint: `POST /api/trusted-signup` (validates invite codes server-side)
- **Account provisioning / whitelisting / promotion** — adding a user, promoting trial → trusted, revoking access. See §6.1 of `docs/AUTH.md` for the runbook.

### Admin backend
- `/admin/feedback` triage UI: `src/app/admin/feedback/`
- Admin API routes: `src/app/api/admin/feedback/`
- The feedback → GitHub issue → Claude agent PR → Vercel deploy webhook chain

### Webhooks
- `src/app/api/webhooks/github/` — PR-merge + deployment-status webhook handlers (HMAC-verified via `GITHUB_WEBHOOK_SECRET`)
- Any future provider webhooks (Stripe is **Payments**, not here)

### Server-side data plumbing
- Supabase client setup: `src/lib/supabase/`
- Server-side environment / config (`SUPABASE_SERVICE_ROLE_KEY`, `GITHUB_PIPELINE_TOKEN`, `ADMIN_EMAILS`, etc.)
- API routes that don't belong to a specific engine: `src/app/api/trusted-signup/`, `src/app/api/webhooks/`, `src/app/api/admin/`

## Scope summary (out — route elsewhere)

- In-app UX (welcome modal, tour, feedback widget BUTTON & form, persona pills, header chrome, copy) → **UX & Onboarding** session. Platform owns the data/auth flow; UX owns what the user sees and clicks.
- Billing, paywalls, tier-gated *features*, Stripe integration → **Payments** session. (Note: trial/trusted access tiers live in Platform; *paid* tier gating lives in Payments.)
- Engine logic and the API endpoints that wrap them (`/api/compute`, `/api/copilot`, `/api/enrich`, `/api/news`, `/api/structure`) → respective **engine sessions**. Platform doesn't own the contents of those routes, just the auth/middleware that protects them.
- Graph data, domain profiles → respective **data sessions** (Geopolitical/Macro, T1D).
- Canvas, rendering, viewport → **Rendering** session.

## Boundary clarifications

- **Feedback widget**: UX owns the in-app button, form, validation, success/error toast, and the *shape* of the row written to `feedback`. Platform owns the Supabase insert mechanics, RLS, the admin triage UI, and the webhook chain that turns rows into PRs.
- **Account provisioning**: Platform owns the entire mechanic. UX may need copy for "you're whitelisted, sign in here" emails or post-login welcome — that's a UX handoff after the row exists.
- **Trial expiry UI**: the `/expired` page itself is Platform's (server-rendered, gated). The styling/branding alignment with the rest of the app is a UX consultation.
- **API-route auth**: the engine sessions write the route logic; Platform writes the middleware that gates it. If an engine route needs a new auth shape (e.g. service role for an internal call), engine session asks Platform to extend the middleware.

## Common task: provision a pilot user

1. Confirm tier (almost always `trusted` for design partners / pilots).
2. Insert/promote the row in `public.profiles` per `docs/AUTH.md` §6.1.
3. Reply with: the sign-up URL the user should hit, whether they need an invite code, the email they must use, and any expiry/revocation considerations.

## Likely upcoming themes

- Pilot onboarding load (Sujit / Arka and similar).
- Hardening the feedback → PR webhook chain as it gets more traffic.
- Audit logging for admin actions (currently informal — promotions are just SQL updates).
- Self-serve invite-code rotation (today: manual env-var update).
- TODO: fill in once active session has more history.

## How to start a task

1. Confirm in-scope. Auth/Supabase/middleware/admin-backend/webhooks → yes. Anything else → flag and route per the table above.
2. Read the relevant docs first: `docs/AUTH.md` for anything auth-shaped, `docs/feedback-pipeline-setup.md` for the agent-PR chain, `docs/DEPLOYMENT.md` for env vars.
3. For schema changes, edit the `.sql` files in repo root and call out the migration step in the PR.
4. For middleware changes, test that both `trusted` and `trial` flows still work, and that expired sessions still redirect to `/expired`.

---

## payments.md

# Session: Payments

Owns billing, payment processing, paid-tier gating, and any commercial-flow UI/logic. Distinct from the trial/trusted access model in **Platform** — that gate decides *whether you can sign in at all*; payments decides *what you can do once you're in*.

> **Status:** session is active but the codebase doesn't yet have meaningful billing surface area as of this writing — no Stripe integration, no subscription state, no paid feature flags found in code search. Most of the scope below is forward-looking. Update this doc as work lands.

## Scope summary (in)

- Payment provider integration (likely Stripe — confirm when the session decides).
- Subscription state in the database (e.g. `profiles.subscription_tier`, `subscriptions` table — TBD by this session).
- Webhooks for payment events (Stripe checkout completed, subscription updated, invoice failed, etc.). Lives in `src/app/api/webhooks/stripe/` or similar (TBD).
- Paywall UI — "upgrade to access this", checkout redirect, post-checkout return state.
- Tier-gated features inside the app: which engines/datasets/seats/limits each tier unlocks.
- Billing portal links (Stripe customer portal, invoice history).
- Pricing copy and CTAs (the words on the pricing page; coordinate with UX for tone).

## Scope summary (out — route elsewhere)

- Auth, sign-up, the trial/trusted access model (`profiles.access_type`), invite codes → **Platform**. Payments builds *on top of* the user record Platform owns.
- The mechanics of inserting/updating the user record from Stripe webhooks — the *webhook handler* lives here, but it writes through the same `profiles` schema Platform manages. Coordinate when adding columns.
- In-app empty states / upsell modals / "this feature requires Pro" copy *positioning* → **UX & Onboarding** owns the visual treatment; Payments owns the *gating logic* and the data-driven CTA.
- Engine logic and outputs → respective engine sessions. Whether a tier *can run* PEARL or PARETO is Payments; what PEARL or PARETO actually computes is the engine session.

## Boundary clarifications

- **Trial expiry vs. subscription expiry**: trial expiry is Platform (48h, hardcoded, no money involved). Subscription expiry is Payments (driven by Stripe events, money involved). They share the `profiles` table but live in different columns.
- **Webhook chain**: Platform owns the GitHub webhook chain (feedback → PR). Payments owns the Stripe webhook chain. Both should follow the same HMAC-verification pattern; share helpers.
- **Admin actions**: promoting a user to trusted is Platform. Comping a user with a paid tier or refunding is Payments — both touch `profiles`/related tables but for different reasons. Document clearly which admin path to use.

## Anchor files (current / planned)

- TODO: confirm provider (Stripe assumed).
- Webhook route: `src/app/api/webhooks/stripe/` (planned).
- Pricing page: `src/app/pricing/` (planned, if customer-facing).
- Tier-gating helper: probably `src/lib/billing/` or `src/lib/tiers/` (TBD).
- Schema additions: future `supabase-payments.sql` migration alongside the existing `supabase-setup.sql` and `supabase-feedback-pipeline.sql`.

## Likely upcoming themes

- First Stripe integration (checkout + customer portal + webhooks).
- Defining tier matrix (what each tier unlocks).
- Plumbing tier checks into engine API routes (server-side guards) and into UX (paywall modals, locked CTAs).
- TODO: fill in once active session has more history.

## How to start a task

1. Confirm in-scope. Money / billing / subscription state / paid-tier gating → yes. Auth or trial mechanics → flag and route to Platform.
2. For schema changes that touch `profiles` or related tables, coordinate with Platform — it's the canonical owner of that schema.
3. For paywall UI, write the gating logic here and hand the visual treatment to UX (or co-author).

---

## rendering.md

# Session: Rendering

Owns how the causal graph is drawn: 3D WebGL force-directed canvas, 2D React Flow canvas, MAP geographic projection, and the shared selection / viewport / camera mechanics across all three. Owns render performance.

> **Status:** session brief is being inferred from cross-references — fill in detail as the session establishes itself.

## Scope summary (in)

- The canvas substrate that hosts all three views, mounting all three to preserve WebGL context across switches:
  - **3D** — WebGL force-directed (default). Components: `src/components/CausalDAG3D.tsx`, `src/components/dag3d/DAGNode3D.tsx`, `src/components/dag3d/DAGEdge3D.tsx`, `src/components/dag3d/DAGOverlay.tsx`. Likely uses `@react-three/fiber` / `three`.
  - **2D** — flat React Flow layout with animated causal flow. Component: `src/components/CausalDAG2D.tsx`.
  - **MAP** — geographic projection via MapLibre for domains with real-world coordinates (energy infrastructure, etc.). Component: `src/components/CausalDAGMap.tsx`.
- Top-level switcher / coordinator: `src/components/CausalDAG.tsx`.
- Layout algorithms (force-directed, hierarchical, geo-projection) and view-mode buttons (top-right of canvas).
- Viewport: orbit/zoom/pan, drag to orbit (3D), scroll to zoom, shift+drag for box-select.
- Selection mechanics: click to select node and open inspector, shift+drag for subgraph selection.
- Visual encoding: node size and color intensity for Ω-Fragility (hotter = more systemic risk), solid arrows for directed causal edges, dashed lines for confounded/latent.
- Ancillary canvas UI: `RiskPropagationFlow.tsx` (per-node vulnerability cards above the time dial), `CanvasWatermark.tsx`.
- Render performance — memoization, frustum culling, instancing, layout throttling, framerate budgets.

## Scope summary (out — route elsewhere)

- Tour anchors (`data-tour="..."`) on canvas chrome, including view-mode buttons → **UX & Onboarding** owns the anchor placement and tour mechanics; Rendering owns the underlying control. If a tour step requires a control to render/position differently, that's a Rendering ↔ UX collaboration.
- Graph data — nodes, edges, domain profiles → respective **data sessions** (Geopolitical/Macro, T1D). Rendering consumes whatever the data layer hands it.
- Engine outputs that drive node coloring (Ω-Fragility scores, criticality signals) → respective **engine sessions**. Rendering visualizes the values; engines compute them.
- Inspector panel that opens on node click → **UX & Onboarding** for layout/copy; engine sessions for the per-pillar / per-criticality content inside.
- Time-dial cascade replay scrubber → coordinated with PEARL (counterfactual timelines) and PARETO (criticality replay).

## Boundary clarifications

- **Tour ↔ Rendering**: anchors and overlays are UX's; the canvas controls themselves are Rendering's. Adding a `data-tour` attribute is UX. Repositioning or restyling a control to make it tour-able is Rendering.
- **Empty / loading states on canvas**: copy is UX, presence-of-state is Rendering. If the canvas has no graph yet, Rendering renders the placeholder structure; UX writes the words.
- **Map projection**: Rendering owns the MapLibre setup and projection math. Whether a domain *has* coordinates to project is a data-session concern.

## Anchor files

- `src/components/CausalDAG.tsx` — top-level switcher.
- `src/components/CausalDAG2D.tsx` — React Flow.
- `src/components/CausalDAG3D.tsx` + `src/components/dag3d/*` — three.js / r3f.
- `src/components/CausalDAGMap.tsx` — MapLibre.
- `src/components/RiskPropagationFlow.tsx` — risk cards.
- `src/components/CanvasWatermark.tsx` — branding overlay on canvas.

## Likely upcoming themes

- Performance with larger graphs (>500 nodes).
- Cross-view consistency (same selection across 3D/2D/MAP).
- Counterfactual visualization when PEARL injects an intervention timeline.
- Mobile/touch viewport — currently desktop-only.
- TODO: fill in as the session ships work.

## How to start a task

1. Confirm in-scope (canvas, layout, viewport, selection, render perf).
2. Be careful not to break the all-three-mounted invariant — switching views must not lose WebGL context.
3. Coordinate with engine sessions when changing how engine outputs are visualized.

---

## spirtes.md

# Session: SPIRTES (Causal Structure Discovery)

Owns the engine that discovers causal structure from data. Runs three discovery algorithms in parallel and surfaces results to the UI as edges and edge annotations.

> **Status:** session brief is being inferred from cross-references — fill in detail as the session establishes itself.

## Scope summary (in)

- **DCD / NOTEARS** — nonlinear structure discovery.
- **PCMCI+** — time-lagged causal effects across T-2 / T-1 / T-0 columns.
- **FCI** — hidden-confounder detection. Latent common causes surface as dashed edges with `?` markers.
- Cascade-header readouts driven by SPIRTES output (e.g. spectral radius λmax — below 1.0 the network is contractive and stable).
- Discovery API endpoint: `src/app/api/structure/route.ts`.
- Right-panel rendering of discovery results — *the engine's contribution* to the panel; the panel chrome itself is UX.

## Scope summary (out — route elsewhere)

- The right-panel layout, module tabs, and tab-switching UX → **UX & Onboarding**.
- The graph data and node/edge schema → respective **data sessions** (Geopolitical/Macro, T1D).
- Canvas rendering of edges (solid, dashed, color) → **Rendering**. SPIRTES *outputs* the edge type; Rendering draws it.
- Constraint verification of discovered edges → **TARSKI**. SPIRTES proposes; TARSKI audits.
- Auth / API gating → **Platform**.

## Boundary clarifications

- **Edge styling**: SPIRTES decides `solid` vs `dashed` vs `?` semantically. Rendering decides the visual treatment.
- **Snapshots**: when discovery results are part of a System State Snapshot for the copilot, the snapshot mechanics are shared with PEARL/PARETO/TARSKI; agree on a common snapshot schema.

## Anchor files (current / inferred — verify in session)

- `src/app/api/structure/route.ts` — discovery API.
- `src/lib/graph-data.ts`, `src/lib/athena-graph-data.ts` — graph data this engine reads. (Owned by data sessions; SPIRTES is a consumer.)
- TODO: identify the SPIRTES-specific engine module (if any) vs. logic spread across `copilot-engine.ts` / `omega-engine.ts` and consolidate.

## Notes on current state (verify in session)

- All four panels (DCD/PCMCI+/FCI + StructuralMetrics) currently render **precomputed** discovery tags from `src/lib/graph-data.ts` (`discoverySource: "DCD" | "PCMCI+" | "FCI" | "merged"` on each `CausalNode`, `lag` on edges, `isConfounded` on nodes). The panels do layout + temporal-window deltas, not real algorithm execution.
- "Spirtes-live" — running real DCD/PCMCI+/FCI on rolling windows — is a phase-2 effort that hasn't started. Needs separate scoping (in-browser library vs server-side with streamed results).
- **Algorithm trio is complete and cross-verified.** `lag-correlation`, `pcmci-linear`, `fci`, and `notears` all live in `src/lib/discovery/algorithms/` and are picked up by `algorithm-registry.ts`. Cross-algorithm consistency capstone (`src/lib/discovery/__tests__/cross-algorithm-consistency.test.ts`) exercises all four against contemporaneous and lagged chain cohorts, asserts each finds the data-generating adjacencies on its wheelhouse cohort, and confirms every registered algorithm runs on either cohort without throwing.
- Network metrics (eigenvector centrality, betweenness, clustering, density, community structure, spectral stability) computed live in StructuralMetrics from the current `graphData`.
- **Communities are now real.** Previously the "Communities" zone in `ModulePanel.tsx` was just a relabeling of `node.domain` — a fake "label propagation, 10 iterations" comment masked a one-line domain regroup. As of the modularity-greedy work, `src/lib/community-detection.ts` runs Louvain phase 1 (local-move modularity optimization) on the actual edge topology. The panel now surfaces emergent groupings, the modularity-proxy intra-edge fraction, and badges cross-domain communities (the interesting cases — communities the topology says belong together that the curator-assigned domain partition splits).

## Cross-references to TARSKI live-feed work

The TARSKI session has shipped two live API feeds (EIA Persian Gulf throughput, OFAC SDN sanctions) that mutate `CausalNode.liveData[]` and feed the validator. Spirtes panels read the same `graphData`, so any live mutation surfaces on the discovery panels too — but Spirtes has no algorithm-side response to live data yet (no recompute on tick). See `docs/sessions/tarski.md` for the feed-proxy pattern; reusing it for any Spirtes-driven live signal is straightforward.

## Likely upcoming themes

- **Phase-2 Spirtes-live: real algorithm runs on rolling windows.** Scoping doc: [`spirtes-live-scoping.md`](./spirtes-live-scoping.md). Covers the CausalGraph↔Cohort bridge, in-browser-vs-server tradeoffs, async UX for running/stale/done states, perf budget, and a 6-PR sequence (A: hook + main-thread T1D-FCI; B: Web Worker; C: PCMCI+; D: stale UX; E: IndexedDB persistence; F+: macro/geopolitical cohort bridge).
- ~~DCD / NOTEARS — third leg of the SPIRTES algorithm trio.~~ ✅ shipped (NOTEARS v0.2) — `src/lib/discovery/algorithms/notears.ts`. Continuous DAG-structure learning via the smooth acyclicity constraint h(W) = tr(e^(W∘W)) − d. Linear-Gaussian model, augmented-Lagrangian outer loop. **v0.2 swapped the inner loop from proximal gradient descent to L-BFGS-B** on the (W⁺, W⁻) split (the same trick the reference Python `notears` package uses with `scipy.optimize.minimize(method="L-BFGS-B")`). Under that split L1 ‖W‖₁ = λ·sum(W⁺ + W⁻) is linear, the objective is smooth, and the box constraint (W± ≥ 0, plus diagonals pinned to zero — no self-loops) is enforced by projection during Armijo backtracking line search. Result: acyclicity in roughly an order of magnitude fewer inner iterations — default `maxInnerIter` 200 → 100, and the new tests demonstrate h(W) < 5e-3 even at `maxInnerIter=20` on standard 3-variable cohorts. New helper module `_lbfgs.ts` exports `lbfgsDirection` (Nocedal–Liu two-loop recursion), `newLBFGSHistory` / `pushHistory` (FIFO eviction), and vector utilities (`dot`, `vSub`, `vNorm`, `vAddScaled`). Standardises columns to mitigate varsortability (Reisach et al. 2021). `_matrix-ops.ts` helper module from v0.1 unchanged (matmul, matExp via 20-term Taylor series, Hadamard, trace, transpose). Registered in `algorithm-registry.ts`. 21 NOTEARS unit tests (the original 18 from v0.1 plus 3 L-BFGS-convergence tests: acyclicity at `maxInnerIter=20`, adjacency recovery at `maxInnerIter=20`, convergence at `lbfgsMemory=3`) plus 10 dedicated `_lbfgs.test.ts` tests covering vector ops, history FIFO eviction, two-loop on a quadratic, descent direction on a multi-pair history, and degenerate-y handling. v0.2.1 added quadratic-interpolation backtracking on the projected line search — the cheap variant of Moré–Thuente (1994). On Armijo rejection, fit the parabola through (0, φ(0), φ'(0)) and (step, φ(step)) and pick its minimiser as the next trial, safeguarded to [0.1·step, 0.5·step]. Bracketing / zoom phases skipped: projection breaks the smoothness assumption strong-Wolfe needs, so the extra machinery wouldn't pay. New exported `quadraticInterpStep(phi0, dphi0, alpha, phiAlpha)` helper. Measurable speed-up — NOTEARS test wall-time roughly halved (chain test 1877ms → 737ms) without changing any output. 4 new unit tests on `quadraticInterpStep` (closed-form on a known quadratic, safeguard clamping when the model overshoots, concave / degenerate fall-through, positive-and-in-range across typical inputs). Open follow-ups: full Moré–Thuente bracketing + zoom for the rare ill-conditioned augmented-Lagrangian phases where the quadratic interp still bottoms out.
- ~~**NOTEARS-MLP (nonlinear extension)**~~ ✅ shipped (v0.1) — `src/lib/discovery/algorithms/notears-mlp.ts`. Registers as a separate algorithm (`id: "notears-mlp"`) alongside linear NOTEARS rather than replacing it. Yu, Chen, Gu (2019) variant: each variable j is predicted by a per-variable MLP (one hidden layer, tanh activation, configurable hidden size, default 8) consuming all OTHER variables. The derived adjacency `A[i, j] = ‖W₁ⱼ[:, i]‖₂` — the column-norm of MLP_j's first-layer weights at input i — feeds the same smooth acyclicity constraint `h(A) = tr(e^(A∘A)) − d` as linear NOTEARS. L1-on-column-norms regulariser drives unused input columns to zero (giving sparsity in the derived adjacency). Augmented-Lagrangian outer loop matches linear NOTEARS; inner loop is plain projected gradient descent with Armijo backtrack — the non-quadratic MLP objective makes L-BFGS curvature less reliable for v0.1, so honest GD is the default. Self-input column j of MLP_j is pinned to zero (no self-loops). Manual backprop (no autodiff): per-MLP `{dW1, db1, dW2, db2}` chain for the MSE term + `∂A[i,j]/∂W₁ⱼ[h,i] = W₁ⱼ[h,i] / A[i,j]` chain for the acyclicity term. **Differentiated capability**: a test on Y = sin(X) + noise — where linear NOTEARS sees Pearson r ≈ 0 — demonstrates NOTEARS-MLP recovers the X-Y adjacency. 11 unit tests covering MLP primitives (initMLP pinning, mlpForward finite output, derivedAdjacency shape, h-on-A acyclic / cyclic), registry metadata, output-shape contracts (variables match, diagnostics, no-grid sentinel, no self-loops), linear-chain pattern recovery, and the nonlinear-detection win on Y = sin(X). Picked up automatically by `algorithm-suite-validation.test.ts` via the registry — 9 additional shape-contract tests on direct / confounded cohorts pass. Open follow-ups: L-BFGS on the MLP parameters (faster convergence on larger d); deeper architectures; closed-form OLS on the W₂/b₂ layer per inner step.
- ~~Hardening of latent-confounder detection (FCI) for production graphs.~~ ✅ shipped (FCI v0.6) — `src/lib/discovery/algorithms/fci.ts`. Skeleton phase (PC-stable) + v-structure orientation + Zhang's R1 + R2 + R3 (kite) + R4 (discriminating-path) orientation rules as a fixed-point pass. **v0.5 extended R4 from length-3-only to arbitrary-length discriminating paths** via a BFS that walks backward from the focus edge B−C through nodes that are parents of C AND colliders on the path, terminating at a node W not adjacent to C. Cap `maxDiscriminatingPathLength` (default 5 intermediates) keeps the search bounded; lowering trades completeness on long latent-confounder chains for speed. New exported helper `findDiscriminatingPath(b, c, edges, adj, maxLength)` returns the W endpoint or `null`. Returns a Partial Ancestral Graph with `endpointMarks: { sourceMark, targetMark }` (`circle`/`arrow`/`tail`) on every edge. The orientation phase remains refactored into directly-testable helpers — `buildInitialEdges`, `applyVStructures`, `applyR1`, `applyR2`, `applyR3`, `applyR4` — each returning whether a mark changed, with `runOrientation` as the fixed-point composer. 33 unit tests for the v0.5 surface plus 3 new for v0.6 CMI-knn integration: evidence-string declares active CI test, linear chain recovery under cmi-knn as baseline sanity check, AND a positive negative — nonlinear dependence (Y = sin(X) + noise) where partial-correlation drops the X-Y edge but CMI-knn keeps it. Separately, 14 new `cmi-knn.test.ts` tests cover the estimator in isolation (digamma function correctness, CMI ≈ 0 for independent Gaussians, CMI > 0 for correlated Gaussians, nonlinear detection, full-conditioning collapses signal, insufficient-data sentinel, output shape, p-value behaviour, NaN-row handling, length-mismatch defensive throw). **v0.6 adds the `ciTest: "partial-correlation" | "cmi-knn"` param to `FciParams`** with default `"partial-correlation"` preserving v0.5 behaviour. Opt into nonparametric testing via `ciTest: "cmi-knn"` for non-Gaussian / nonlinear cohorts. The CMI-knn estimator is the Frenzel-Pompe (2007) k-NN variant of KSG with Chebyshev (max-norm) distance, p-value via the χ²(1) asymptotic of 2N·CMI (Kullback 1959). New shared `CITestResult` type ({r, p, n}) plus a `runCITest` dispatcher in fci.ts. New `_cmi-knn.ts` module exports `digamma`, `cmiKnn`, `cmiKnnTest`. **v0.6.1 swapped the naive O(N²) k-NN scan inside `cmiKnn` for a Chebyshev-distance KD-tree** (`src/lib/discovery/algorithms/_kd-tree.ts`) — `buildKdTree` + `kNearest` + `countWithinRadius` with bounding-box pruning. Per-call complexity drops to O(N·k·log N) average for low-dim point sets (joint dim 2+|Z| stays ≤ ~6 under FCI's `maxCondsDim=3`). Measured: CMI-knn test wall-time 112ms → 41ms (2.7×). 13 new `kd-tree.test.ts` tests verify build correctness (empty input, zero-dim sentinel, single-point, bounding-box covers subtree), kNearest matches naive on 2D / 5D point clouds, self-exclusion, sorted ascending output, edge cases (null tree, k=0), countWithinRadius matches naive on 3D clouds, strict-less-than semantics, self-exclusion, null / non-positive-radius sentinels. **v0.6.2 adds an opt-in local-permutation null** (Kim et al. 2022 variant) for a rigorous p-value vs the χ²(1) asymptotic — set `cmiKnnPermutations > 0` on `FciParams` (or `nPermutations > 0` on `cmiKnnTest` directly) and the test draws B samples from the conditional permutation distribution X | Z by random-walk swapping X values within Z-NN strata (`kPerm`, default 10), then returns the empirical p-value with standard +1 smoothing `(1+ge)/(1+B)`. Default 0 preserves v0.6 asymptotic behaviour; opt-in costs B× the CMI estimator (so use for small graphs / final-pass validation, not the full skeleton phase on a 30-node graph). Deterministic via a `seed` option. 5 new permutation tests on top of the 14 estimator tests: H0 calibration (p > 0.1 on independent Gaussians), H1 power (p collapses to 1/(B+1) on strong dependence), default-zero falls back to χ² (v0.6 preserved), seeded determinism, conditional-permutation respects Z-stratum on CMI(X,Y|X≈0). **v0.6.3 adds the formal Kim et al. 2022 Algorithm 1 chain** as an opt-in via `cmiKnnPermutationMode: "matching"` (default `"swap"` preserves v0.6.2 behaviour). The matching variant tracks the permutation π explicitly and accepts a proposed swap π(i)↔π(j) only when BOTH new assignments respect their Z-NN constraints — strictly uniform over the matching polytope (vs the direct-swap chain's approximately-uniform stationary distribution). Higher reject rate, longer mixing required for the same Type-I error control. 3 new tests for the matching variant on top of the 5 swap-mode tests: H0 calibration, H1 power (p = 1/(B+1) on strong dependence), default-swap behaviour preserved. UI wiring has an architectural prerequisite — the FCI panel consumes `CausalGraph` (curated runtime graph) while FCI consumes `Cohort` (subjects × measurements). Wiring FCI's PAG output into the panel needs either a CausalGraph→Cohort bridge or a stored `DiscoveryRun` to load; honest path is via Phase-2 Spirtes-live.
- ~~Confidence/uncertainty surfacing in the right panel.~~ ✅ shipped — `src/lib/discovery-uncertainty.ts` + `summarizeDiscoveryUncertainty(nodes, edges)` returns mean / median edge confidence, low-confidence count (`< 0.7`, matching Tarski A-06), and node-level breakdown by `discoverySource` (DCD / PCMCI+ / FCI / merged). New UNCERTAINTY zone in StructuralMetrics surfaces all of it; header chip shows `μ <mean>` and an amber `· N low-conf` badge when any edges are below the threshold.
- ~~Wiring network metrics → ΩF pillar **C** (systemic cascade load) — verify present and quantitatively sane.~~ ✅ verified + refined. `src/lib/omega-pillar-wiring.ts` now combines a base out-degree bump (above threshold 5, +0.3 per excess edge, base capped at +3.0) with a cross-community amplifier (each cross-community out-edge adds +0.4, amplifier capped at +2.0). Cross-community membership computed via Louvain phase 1 in the same pass. Total still capped at C_BUMP_CAP = 3.0. Source string attributes both components ("+1.7 from out-degree 8 (3 above structural median), 2 cross-community out-edges"). Hybrid design preserves backward-compat — single-community fixtures see no amplifier and behave identically to the old function. 16 → 20 unit tests covering the existing baseline plus dedicated amplifier cases (cross-community triggers, source-string composition, amplifier cap, all-intra-community zero).
- **Communities on the canvas (Rendering follow-up).** `detectCommunities` returns a stable `membership: Map<nodeId, communityId>`. Rendering can pick this up and add a "color-by-community" toggle alongside the existing color-by-domain mode (in 2D, 3D, and Relief views). Optionally a translucent hull overlay around each community. SPIRTES side is done; the work is in the Rendering session.
- ~~**RELEVANT NOW panel readout (right-column UX).**~~ ✅ shipped — `CascadeHeader` in `src/components/ModulePanel.tsx`. New collapsible-free callout zone at the top of the right panel surfaces the 2–3 most relevant network/selection metrics so the user doesn't have to expand every dropdown to know what's interesting. When a node is selected: centrality rank if top-5, elevated cascade load if C ≥ 7, count of incident auto-bridges. When nothing is selected: graph-wide signals — λmax instability, disconnected components, cross-domain communities, low-confidence edge count. Empty when the graph is healthy and nothing is selected, so it never clutters the panel. Each callout colour-coded by tone (green / amber / red).
- ~~**Cross-domain auto-bridging in MULTI-domain mode.**~~ ✅ shipped — `src/lib/cross-domain-bridging.ts`. When the user selects multiple domains and the resulting graph comes back in 2+ disconnected components, this module proposes heuristic cross-domain bridge edges so SPIRTES's centrality / community analyses operate on a connected graph instead of disjoint blobs. Algorithm: undirected BFS to find components, then for every cross-domain pair (a, b) between distinct components score `0.5 · categoryAffinity(a, b) + 0.3 · labelTokenJaccard(a, b) + 0.2 · Ω-anchor(a, b)`; keep top `maxPerComponentPair` (default 1) above `minScore` (default 0.3), global cap `maxTotal` (default 16). Emitted edges land with `confidence: 0.5` and `physicalMechanism: "auto-bridge: …"` so R-04 (cross-domain ∧ conf < 0.7) flags them as UNVERIFIED — by design: these are proposals, not facts, and verification or curator-promotion is the path to firming them up. Wired into `setGraphData` so every graph load auto-applies bridges when components > 1; no-op when the graph is already connected. New exported helpers `findConnectedComponents`, `proposeCrossDomainBridges`, `bridgesToEdges`, `applyCrossDomainBridges`, plus `isAutoBridge(edge)` + `extractAutoBridgeScore(physicalMechanism)` + `AUTO_BRIDGE_ID_PREFIX` for downstream consumers. The shared `EdgeInspector` popup now renders an `AUTO-BRIDGE · HEURISTIC · UNVERIFIED` section (amber) on these edges with the heuristic score and a short explanation that the link is proposed and below R-04's 0.7 cutoff by design — plus a **PROMOTE button** (also in `EdgeInspector`) that calls the new `promoteAutoBridge(edgeId)` store action. Promotion bumps `confidence` 0.5 → 0.8 (above R-04's cutoff) and flips the `physicalMechanism` prefix from `"auto-bridge:"` to `"promoted bridge:"`, keeping the heuristic score and rationale visible as an audit trail. New `bridgeStatus(edge)` returns `"auto" | "promoted" | "none"` so the inspector renders the right banner (amber `AUTO-BRIDGE · HEURISTIC · UNVERIFIED` vs green `PROMOTED BRIDGE · CONFIRMED`). The action is idempotent on already-promoted edges and a no-op on curator-authored edges; it re-runs Tarski validation in VERIFIED mode so previously-FLAGGED R-04 violations clear in the same tick. 15 unit tests (component finder behaviour incl. directed-edge handling and isolated-node case, bridge-proposal scoring + cross-domain filter + same-domain exclusion + minScore / maxPerComponentPair / maxTotal caps + score-descending sort, edge construction with R-04-flagging confidence, no-op on connected graphs, immutability of the input graph, post-bridge component-count drop). 1160 tests green.
- **Louvain phase 2 (multilevel).** Current implementation is single-pass — communities found, but no super-node aggregation + recursion. For larger graphs this can leave the modularity below optimum. Phase 2 would aggregate communities into super-nodes and re-run, repeating until modularity stops improving. Defer until graph size warrants it.

## How to start a task

1. Confirm in-scope (structure discovery algorithms, their outputs, the structure API route).
2. Coordinate with TARSKI when discovered edges affect verification.
3. Coordinate with Rendering when changing how edge types are encoded visually.
4. **Update this file** at the end of every material change.

---

## tarski.md

# Session: TARSKI (Constraint Verification)

Owns the engine that audits every edge in the causal graph against domain-aware axioms in three tiers: PHYSICAL, REGULATORY, HEURISTIC.

> **Status:** Active. Live API feeds wired into A-02 (production/throughput capacity saturation), A-04 (Hormuz throughput), R-01 / R-02 (sanctions), and R-04 (cross-domain confidence × WGI governance). Live Coverage Program: 8 providers shipped (EIA, OFAC, FRED, World Bank, OpenFDA, ClinicalTrials.gov, NOAA NHC, Derivations) covering **~56 graph nodes** including the T1D side, EM FX, sovereign default, MENA import dependency, the broader CPI / PCE / wage / sentiment expansion, WGI Rule of Law for the China / Brazil jurisdictions, and NOAA active-tropical-cyclone aggregates per basin. **Real-data-only goal reached: 0 synthetic composites remaining** — all 4 originally synthetic composites are now live-derived from real data. All free-tier; mock fallback when keys/upstream missing.
>
> **Stated end-state goal:** every node carries continuously-pulled real data. **No synthetic composites.** 4 composites still synthetic as of this writing — all 4 have a concrete path to real-data backing (see "Real-data-only goal" section below).

## Scope summary (in)

- The three axiom tiers:
  - **PHYSICAL** (Level 0) — immutable laws (e.g. A-01 Temporal Priority, A-02 Flow Conservation, A-03 DAG Integrity, A-04 Strait of Hormuz, A-05 Single-Source Fragility, plus the T1D physiological set TA-01..TA-06).
  - **REGULATORY** (Level 1) — sanctions, export controls, treaties, FDA tiers, IRB constraints (R-01..R-04 geopolitical, TR-01..TR-05 T1D).
  - **HEURISTIC** (Level 2) — anomaly flags (H-01, H-02 geopolitical; TH-01..TH-04 T1D).
- Auto-ranking constraints by relevance to active domains via `scoreAxiomRelevance(graph, activeProfileId)` in `src/lib/tarski-data.ts`.
- The VERIFY action: toggle axioms, run verification, recolor canvas (violating edges → red), expose clickable proof traces explaining which constraint failed.
- Constraint catalog and proof-trace logic.
- Snapshot validator: `src/lib/snapshots/tarski-validator.ts` — adapter that delegates to `runTarskiValidation` (the full 32-axiom library) when given a live graph. The thin 5-axiom path is kept as a `partial` fallback for legacy callers that pass only a snapshot without a live graph.
- **Live API feeds** that drive engine state — feed proxies, polling hooks, store mutators, validator branches.
- Engine-side ΩF wiring: Tarski violations → pillar **J** (jurisdictional hazard). Spirtes-metrics → pillar **C** (cascade) is owned in the SPIRTES doc.

## Scope summary (out — route elsewhere)

- Right-panel chrome and tab UX → **UX & Onboarding**.
- Canvas recoloring of violating edges → **Rendering** does the recolor; TARSKI decides which edges violate.
- Graph data (the edges being verified) → **data sessions** (Geopolitical/Macro, T1D).
- Discovery of new edges (which TARSKI then verifies) → **SPIRTES**.
- Auth / API gating → **Platform**.
- Pentagon ΩF radar plot in node-detail box → **UX & Onboarding** (punted from this session).
- Live ticks → continuous TimeSeriesOverlay curves with omegaComposite projection → **Rendering**.

## Boundary clarifications

- **Constraint authoring**: domain-specific constraints (T1D regulatory tiers, geopolitical sanctions) are authored *with* the relevant data session but the verification mechanism stays here.
- **Profile-specific axioms**: each `DomainProfile` may surface its own axioms — TARSKI consumes the profile via `appliesTo: string[]`, doesn't define it.
- **Live feeds in node attributes**: the engine session owns the *consumption* of live data into validator checks (via `liveData?: LiveDataPoint[]` on `CausalNode`). The data session owns the topology (which nodes exist, what jurisdictions they're in).
- **Status surfacing**: a small `<LiveFeedStatus />` chip strip lives in `src/components/LiveFeedStatus.tsx`. This is engine state surfacing (mirrors the brief's "status string, badge rendering" carve-out), not UI restyling.

## What's shipped (in chronological order)

### PR #7 — original dynamic Tarski engine
Rewrote axioms from generic physics to Middle East energy/petrochemical. Shipped VERIFIED-mode live validation, red/dashed flagging, proof traces, restricted-node lists, per-axiom violation counts.

### PR #215 + #217 — copilot routes to live engine state (closes brief item #14)
Shipped in two parts: (a) `src/lib/engine-state-summary.ts` — a pure helper exposing `summarizeEngineState(graph, tarskiReport)` plus `summarizeFeeds`, `summarizeTarski`, `summarizePillarOverlays`, and `renderEngineStateText`. (b) `serializeGraphContext` now emits an `=== ENGINE STATE SNAPSHOT ===` section before `=== GRAPH METADATA ===`, so every copilot prompt carries feed counts, Tarski state (axiom violations included when active), and ΩF pillar overlay aggregates. The copilot no longer paraphrases stale tags — it routes off the live engine state directly.

### PR #65 — 15 T1D axioms
TA-01..06 physiological, TR-01..05 clinical/regulatory, TH-01..04 heuristic biology with `relevantDomains` matching the five T1D graph-domain names.

### PR #66 — `appliesTo` profile filter
`TarskiAxiom.appliesTo: string[]` filters the library by active profile. T1D no longer surfaces chokepoint/sanctions axioms; geopolitical no longer surfaces glycemic/C-peptide axioms.

### PR #75 — fixed 7 leaking "universal" axioms
A-01, A-02, A-03, A-05, R-04, H-01, H-02 had geopolitical-flavored language (Aramco, LNG, Hormuz). Tagged `appliesTo: ["geopolitical"]`. Open follow-up: build a genuinely profile-agnostic universal axiom library.

### PR #142 — Live API feeds → Tarski engine *(latest material change)*
Three squashed commits introducing the first live API feeds:

1. **EIA Persian Gulf throughput → A-04 Hormuz**
   - `/api/feeds/eia/hormuz` queries EIA v2 international/data summed across Saudi/UAE/Iran/Iraq/Kuwait/Qatar, scaled by 0.85 Hormuz transit fraction.
   - 6h server cache, 5min client poll. Mock fallback (clearly tagged `(mock — EIA_API_KEY unset)`) when key absent.
   - A-04 prefers `liveData.value / liveData.capacity > 0.9`; structural edge-weight sum > 3.0 is the fallback.

2. **OFAC SDN → R-01 + new R-02 runtime**
   - `/api/feeds/ofac/sdn` proxies Treasury's pipe-CSV, parses entries → programs → ISO-2 country codes via static `PROGRAM_PREFIX_TO_COUNTRY` map.
   - 24h cache, 30min poll, mock-fallback on Treasury error.
   - R-01 prefers live sanctions on either endpoint; static `max(J) ≥ 8` falls through.
   - **R-02 gained its first runtime check** (was relevance-only before): live sanctions OR static J ≥ 7, AND restorationLatency ≥ 7 → flag.
   - Multi-signal `liveData` migration: `CausalNode.liveData` → `LiveDataPoint[]` with `kind` discriminator. Forced by Hormuz being both a chokepoint AND in a sanctioned jurisdiction.

3. **Status strip + TimeDial markers**
   - `<LiveFeedStatus />` chip strip at bottom-left of DAG canvas.
   - Each new feed reading appends a `TemporalEvent` to `temporalData.events`. TimeDial subscribes reactively; markers appear automatically without touching the dial.

### PR #145 — Layout fix + OFAC zero-entry fallback
- Strip moved from top-right (overlapped TOP-Ω panel) to bottom-left.
- Stale chips render at `opacity-50` to de-emphasize unfetched feeds.
- OFAC route: if parser returns 0 jurisdictions on 200 OK (Treasury redirect / maintenance), serve mock-fallback so the engine path still exercises rather than going stale.

### Per-card live-data rows + scalable display layer
- Standalone `<LiveFeedStatus />` component **deleted**. Live data now surfaces per-node, where it belongs.
- Each `RiskPropagationFlow` card (the "ΩF TIME SERIES" cards) renders one row per `node.liveData[]` entry between the domain-badge row and the sparkline. Card without live data → renders nothing.
- Global feed summary inlined in the `ΩF TIME SERIES` header (right-aligned): counts distinct feed `kind`s by mode (`live | mock-fallback | mock`), so "is anything flowing?" is answered at a glance without scanning every card.
- New shared display module `src/lib/feeds/display.ts`:
  - `feedModeFromSource`, `timeAgoLabel`, `feedDotClass` — utility helpers.
  - `KIND_FORMATTERS` registry: per-`kind` formatter producing `{shortLabel, primaryValue, qualifier}`. Throughput → "EIA · 18.50 mb/d · 88%". Sanctions → "OFAC · Iran · 4 prog". Generic fallback for unknown kinds → "value unit · ratio%".
  - `summarizeLiveFeeds(nodes)` → mode counts.
- **Adding a new feed now requires zero card changes.** New feed writes a new `kind` to `liveData[]` via the proxy → cards iterate and render the entry automatically. Optionally add a `KIND_FORMATTERS` entry for nicer display; otherwise generic fallback handles it.

### Profile-agnostic polling
- Both `useHormuzFeed` and `useOfacFeed` now gate on `graphData.nodes.length > 0` instead of "selectedDomains looks geopolitical".
- Justification: the cards layer, store actions, and display registry are all profile-agnostic. The hooks were the only place hardcoding "geopolitical" — a contradiction with the rest of the design.
- Each feed self-gates via the store action's node-matching: EIA matches "strait of hormuz"/"chokepoint" labels (no T1D node has those), OFAC matches sanctioned-country keywords (same). Sessions with no matches receive nothing — no waste in the UI, no special-casing per profile.
- A future cross-profile feed (T1D ADA targets, CGM streams, USGS minerals affecting either profile, etc.) plugs in identically — no profile gates to add or update.

### Phase 1 — Provider registry refactor *(latest material change)*

**Why:** The "one hook + one route + one store action per feed" pattern doesn't scale. The "Live coverage program" goal (every node on a real feed, ~167 nodes today) would explode into ~700 files. This refactor introduces the registry pattern so adding a new feed = one provider file + one server route + one registry entry, regardless of how many nodes the provider covers.

**New shape:**

```
src/lib/feeds/
  providers/
    types.ts             FeedProvider interface, FeedDispatchBatch, FeedDispatchEvent
    eia-hormuz.ts        EIA provider (matchPayload + cadence + label)
    ofac-sdn.ts          OFAC provider
  registry.ts            FEED_PROVIDERS list — single source of registered providers
  display.ts             (existing — KIND_FORMATTERS + utilities)
  eia-hormuz.ts          (existing — server-side URL builder + parser + mock, used by route)
  ofac-sdn.ts            (existing — same)

src/hooks/
  useFeedRegistry.ts     Single generic hook — iterates registry, polls each provider
                         on its cadence, dispatches batches to the store

src/stores/useApexStore.ts
  applyFeedBatch         Single generic action: upserts liveData[] from updates,
                         drops stale signals of `signalKinds` from non-matching nodes,
                         emits TemporalEvent if event provided, reruns Tarski validation
                         if VERIFIED mode is active
```

**Removed:**
- `src/hooks/useHormuzFeed.ts` (deleted)
- `src/hooks/useOfacFeed.ts` (deleted)
- `applyHormuzLiveData` and `applyOfacLiveData` actions (replaced by `applyFeedBatch`)

**Adding a new feed now requires:**
1. New `src/lib/feeds/providers/<name>.ts` implementing `FeedProvider` (matchPayload + cadence + label).
2. New `src/app/api/feeds/<path>/route.ts` matching the provider's `endpoint` (existing pattern).
3. One line added to `src/lib/feeds/registry.ts`.
4. (Optional) one entry in `KIND_FORMATTERS` (`src/lib/feeds/display.ts`) for nicer display.

**Adding more nodes to coverage of an existing provider:**
- Extend that provider's `matchPayload` to recognise more nodes. Zero other changes.

### Live coverage program — sequenced roadmap

A multi-PR program of work to migrate the graph from snapshot data → live feeds, one provider at a time.

| Phase | Provider(s) | Nodes | Status |
|---|---|---|---|
| 1 | Registry refactor (no new feeds) | 0 | **shipped (#149)** |
| 2 | FRED — initial batch | 18 macro/financial series (Fed Funds Effective/Target, SOFR, U-3 / U-6 unemployment, INDPRO, PAYEMS/MANEMP, JOLTS openings/quits/layoffs, building permits, 30Y mortgage, CPI YoY / Core CPI YoY, 5Y/10Y breakeven inflation, Case-Shiller YoY) | **shipped (#150)** |
| 3 | World Bank — country indicators | 5 series: China + Brazil Real GDP, China + Brazil Employment-to-Population, Global CPI Inflation YoY. Keyless. | **shipped (#151)** |
| 4a | FRED expansion | 7 more series: Labor Force Participation, Employment-Population Ratio, GDP QoQ Annualized, PPI All Commodities, PPI Final Demand Energy, 5Y5Y Forward Inflation Expectation, Global Wheat Price | **shipped (#152)** |
| 4b | OpenFDA — adverse events | 2 T1D drug nodes: Teplizumab, Insulin Glargine. Free, FAERS counts in last 12-month window. **First T1D-side feed.** | **shipped (#152)** |
| 5 | ClinicalTrials.gov — trial counts | 2 T1D therapy nodes: Teplizumab + VX-880 (with stem-cell-derived β-cell replacement label match). Free, JSON v2 API. Total + recruiting subset surfaced. | **shipped (#153)** |
| 5b | FRED expansion — EM FX | 3 emerging-market FX rates from FRED: Turkey FX Stress (TRY/USD via DEXTUUS), South Africa FX Stress (ZAR/USD via DEXSFUS), Brazil FX Stress (BRL/USD via DEXBZUS). Daily updates. | **shipped (#154)** |
| 7 | **Sovereign Default real data** — eliminates 3rd of 4 synthetic composites. ICE BofA US High Yield OAS (FRED `BAMLH0A0HYM2`) wired to the Sovereign Default / Restructuring node as a credit-stress proxy: HY spreads widen when sovereign + corporate default risk co-moves up. Capacity = 8% (stress regime threshold). | **shipped** |
| 8 | **MENA Import Dependency real data — goal reached** — eliminates the 4th and final synthetic composite. World Bank `NE.IMP.GNFS.ZS` (Imports of goods and services, % of GDP) for MEA aggregate region wired to the MENA Import Dependency Index node. Capacity = 50% (high-dependency regime). Pivoted from a separate UN Comtrade provider (rate-limited, auth-required) to a single-line addition to the existing keyless WB provider — ships faster, same fidelity for the regional aggregate. | **shipped** |
| 5c | Per-card live-data sparkline | `LiveDataPoint.history` field + `upsertLiveSignal` accumulation (capped at 60 entries, sorted, deduped). Card sparkline prefers live history when present, falls back to synthetic omega when not. LIVE badge + mode-colored stroke distinguish live curves visually. | **shipped** |
| 6 | USGS critical minerals | Phosphate / potash / sulfur — needs Excel-scraping (no JSON API) | blocked: needs scraper |
| 7 | BLS labor stats | ~10 labor/employment nodes | not started |
| 8 | NOAA NHC active tropical cyclones | Per-basin storm aggregates (Atlantic / EP / CP) attached to shipping nodes via labelPatterns | **shipped** |
| 9 | World Bank Pink Sheet | Commodity prices (wheat, fertilizer, phosphate, urea, ammonia) — needs CSV scraper | blocked: needs scraper |
| 10a | Henry Hub natural gas (via FRED MHHNGSP) → `Natural gas feedstock system` | 1 node | **shipped** |
| 10b-i | EIA Saudi crude production → Abqaiq Plants / Juaymah Crude Terminal (+ any future "Saudi Crude Production" labeled node) | 2+ nodes | **shipped** |
| 10b-ii | US refinery utilization (via FRED WPULEUS3) — closes the EIA expansion picture | future refinery-util node | **shipped** |

**Honest scoping notes:**
- Not every node has a public real-time data source. Specific corporate operations ("Refinery Throughput", "Aramco production") don't have free public APIs. Options: paid sources (Bloomberg/Vortexa), inferred from related public series (EIA international), or stay synthetic and tag `mode: "modeled"` (vs `"live"` / `"static"`) so the chip color reflects honest provenance.
- Polling load grows with coverage. Each provider declares its cadence; per-provider server-side caching keeps upstream calls bounded.
- A `mode` field on registry entries (live | modeled | static) is a likely Phase 2.5 addition so the UI can distinguish empirical from inferred.

## Real-data-only goal — no synthetic composites

**Stated objective:** every node in the active graph carries continuously-pulled real data. No synthetic composites in the end state.

This is the target; the current state is a work-in-progress program of incremental provider additions. The synthetic composites still in the graph as of this writing fall into three categories:

### A. Composites that can be derived from real primitives we already pull

- **Currency Contagion Channel** — derivable from FRED EM FX series (DEXTUUS / DEXSFUS / DEXBZUS) — e.g. average normalized depreciation across the basket.
- **Exchange Rate Pressure Index** — same primitives, different aggregation (weighted depreciation index).

These need a **derivation provider**: a `FeedProvider` whose `matchPayload` reads other nodes' existing `liveData[]` from the `nodes` parameter and emits computed composites. Same registry pattern, no new upstream API required. Ready to build when prioritized; one PR.

### B. Composites that need a real source we haven't wired yet

- **Sovereign Default / Restructuring** — closest free proxies: World Bank IDS external-debt service ratios, FRED's EM HY corporate bond yields (BAMLEMHB...), or IMF Article IV staff reports. Best candidate is a new provider on top of FRED's existing key.
- **MENA Import Dependency Index** — needs UN Comtrade, WITS, or IMF Direction of Trade. UN Comtrade has a free JSON API but tight rate limits on the unauthenticated tier.

### C. Composites with no defensible free source

If a composite ends up in this category after a real search, the rule is: **keep the node visible but blank** — no synthetic value, no live data, no qualifier. The empty slot itself is the signal that real data is still needed for that node, so future-you (or future Claude) can come back to it. Do **not** delete the node — deletion erases the TODO; blanking preserves it.

The principle, restated: a node we can't measure shows nothing rather than something fake. Synthetic-as-placeholder is rejected, but the slot remains as a known-incomplete marker.

The card render already does the right thing here: a node with no `liveData[]` simply doesn't render any live rows. The card still shows up (with its label, domain badge, and Ω score) but the live block is absent. That's the "blank" state — already implemented, just needs a corresponding entry in the registry to mark the node as "data needed" rather than left ambiguous.

**Future enhancement (shipped):** `dataStatus: "live" | "modeled" | "blank-needs-data"` is now an optional field on `CausalNode`. The `getDataStatus(node)` helper returns the explicit value when set, otherwise derives "live" (any liveData entry present) or "modeled" (none). The Category-C "blank-needs-data" label is exclusively explicit — never derived — so the data session can mark specific nodes as known-incomplete without affecting nodes that simply haven't been wired yet. The `RiskPropagationFlow` card header surfaces a small `DATA NEEDED` badge (amber) on nodes carrying `dataStatus: "blank-needs-data"`.

### Status of the goal as of last update

| Total nodes covered live | ~43 |
| Synthetic composites still present in graph | **0** |
| Synthetic composites with a clear path to real data | n/a (goal reached) |
| Synthetic composites with no defensible source (target: 0) | 0 |

**Implication: goal reached.** All 4 originally-synthetic composites (Currency Contagion, Exchange Rate Pressure, Sovereign Default, MENA Import Dependency) are now backed by live data — derivations on top of FRED EM FX for the first two, FRED HY OAS for the third, World Bank MEA imports for the fourth. The graph is fully real-data-driven on the engine side; remaining work is widening node coverage rather than replacing synthetics.

### Next phases against this goal

| Phase | Scope | Eliminates |
|---|---|---|
| 6 | **Derivation provider — shipped** — FeedProvider reads other providers' liveData and emits composites. Currency Contagion = mean ratio across FRED EM FX (DEXTUUS / DEXSFUS / DEXBZUS); Exchange Rate Pressure = max ratio. Source string tagged "Derived · mean EM FX stress" / "max EM FX stress" with per-country breakdown. Stub `/api/feeds/derivations/trigger` route, 5-min cadence (faster than primitives so derivations always catches up within one cycle). | 2 of 4 composites — **shipped** |
| 7 | **Sovereign-debt provider** — World Bank IDS or FRED EM HY proxies for the Sovereign Default node. | 3 of 4 composites |
| 8 | **UN Comtrade provider** — for MENA Import Dependency. Rate-limited; need careful caching. | 4 of 4 composites — goal reached |

## Architectural decisions

### `liveData` shape
- `CausalNode.liveData?: LiveDataPoint[]` — array, not single field.
- Each `LiveDataPoint` has `kind: "throughput" | "sanctions" | string`, plus `value`, `capacity`, `unit`, `observedAt`, `source`.
- Helpers `getLiveSignal(node, kind)` and `upsertLiveSignal(arr, point)` exported from `types.ts`.
- Reasoning: single-slot would clobber on every poll cycle when a node carries two signals.

### Validator branches (the pattern)
- Validator checks first try `getLiveSignal(node, kind)`; if present, use the quantitative ratio. Fall back to static omega-profile fields when absent so demos without a live feed attached still produce sensible flags.
- Proof trace gains an optional `detail: string` field for the quantitative readout ("Strait of Hormuz: 18.50/21.00 mb/d = 88.1% — EIA …").

### Feed proxy pattern (reusable)
1. **Server route** at `/api/feeds/<provider>/<endpoint>/route.ts` — holds keys, module-level cache with TTL, mock fallback on upstream error / parse failure. Headers `x-feed-cache`, `x-feed-mode`.
2. **Library** at `src/lib/feeds/<provider>-<endpoint>.ts` — URL builder, response parser, mock generator, types. Pure functions.
3. **Client hook** at `src/hooks/use<Provider>Feed.ts` — `setInterval` + `AbortController`, gated to relevant profile.
4. **Store action** in `useApexStore.ts` — maps payload → graph mutation, upserts `liveData`, appends `TemporalEvent`, re-runs validation when VERIFIED.
5. **Mount** in `src/app/page.tsx`.

### TimeDial integration discipline
Engine-side only: `applyHormuzLiveData` / `applyOfacLiveData` append `TemporalEvent` via the `appendFeedEvent` helper, returning a new `temporalData` reference. TimeDial subscribes reactively. **Never edit `TimeDial.tsx`** — that's rendering territory.

### Two-validator fork (resolved)
- `src/lib/snapshots/tarski-validator.ts` is now an adapter on top of `runTarskiValidation` from `tarski-data.ts`.
- `validateSnapshot(snapshot, { liveGraph, enabledAxioms })` runs the full 32-axiom validator and converts its `TarskiValidationReport` into the snapshot-side `TarskiValidationResult` via `reportToValidationResult`.
- `setSnapshot` now passes `s.graphData` and `s.enabledAxioms` so snapshots get full coverage.
- The original 5-axiom checks are preserved as a degraded fallback for callers that can't supply a live graph (e.g. the EngineProvider interface).
- Snapshots now reflect the same axiom set users see in TarskiPanel — fork eliminated.

## Anchor files

```
src/lib/types.ts                              LiveDataPoint, getLiveSignal/upsertLiveSignal helpers, ProofTrace.detail
src/lib/tarski-data.ts                        AXIOM_LIBRARY (32), runTarskiValidation, A-04/R-01/R-02 with liveData branches
src/lib/feeds/display.ts                      Shared display helpers — feedModeFromSource, KIND_FORMATTERS, summarizeLiveFeeds, feedDotClass
src/lib/feeds/eia-hormuz.ts                   EIA URL builder, parser, mock (server-side); HORMUZ_CAPACITY_MBD = 21
src/lib/feeds/ofac-sdn.ts                     OFAC pipe-CSV parser, PROGRAM_PREFIX_TO_COUNTRY, mock (server-side)
src/lib/feeds/fred.ts                         FRED v1 URL builder, parser, mock; FRED_SERIES list (18 macro series)
src/lib/feeds/providers/types.ts              FeedProvider interface, FeedDispatchBatch, FeedDispatchEvent
src/lib/feeds/providers/eia-hormuz.ts         EIA provider — matchPayload + cadence + label
src/lib/feeds/providers/ofac-sdn.ts           OFAC provider — matchPayload + jurisdiction inference
src/lib/feeds/providers/fred.ts               FRED provider — series→node label-pattern matching
src/lib/feeds/registry.ts                     FEED_PROVIDERS — single source of registered providers
src/hooks/useFeedRegistry.ts                  Single generic poll hook (replaces useHormuzFeed + useOfacFeed)
src/lib/snapshots/tarski-validator.ts         Adapter to runTarskiValidation (full 32-axiom library); thin 5-axiom path kept as fallback only
src/stores/useApexStore.ts                    applyHormuzLiveData, applyOfacLiveData, appendFeedEvent helper
src/hooks/useHormuzFeed.ts                    5-min poll, geopolitical-only gate
src/hooks/useOfacFeed.ts                      30-min poll, geopolitical-only gate
src/components/RiskPropagationFlow.tsx        Per-card live-data rows + global feed summary in header
src/app/api/feeds/eia/hormuz/route.ts         EIA proxy
src/app/api/feeds/ofac/sdn/route.ts           OFAC proxy with zero-entry defensive fallback
```

### Tests contributed by this session

- `src/lib/__tests__/feeds/eia-hormuz.test.ts` — 7 (URL builder, parser, mock)
- `src/lib/__tests__/feeds/ofac-sdn.test.ts` — 10 (URL constant, programToCountry, CSV parser, mock)
- `src/lib/__tests__/tarski-a04-livedata.test.ts` — 4 (A-04 liveData branch + structural fallback)
- `src/lib/__tests__/tarski-r01-r02-livedata.test.ts` — 7 (R-01/R-02 liveData + static branches)
- `src/lib/__tests__/feeds-display.test.ts` — 18 (feedModeFromSource, timeAgoLabel, formatLiveSignal, KIND_FORMATTERS registry, summarizeLiveFeeds, shortLabelFromSource)
- `src/lib/__tests__/store-feed-events.test.ts` — 7 (TemporalEvent emission, dedup)

**53 tests** total from this session. Project total: 459 / 459 passing.

## Env vars (operator)

| Name | Required | Behavior if unset |
|---|---|---|
| `EIA_API_KEY` | optional | `/api/feeds/eia/hormuz` returns mock data tagged `(mock — EIA_API_KEY unset)`. Register at https://www.eia.gov/opendata/register.php |
| `OFAC_SDN_URL` | optional | Defaults to `https://www.treasury.gov/ofac/downloads/sdn.csv`. Mock-fallback on errors / zero-entry parse |

## Verifying live status on production

1. `manifold.apexanalytica.co` → log in → pick any geopolitical domain.
2. Bottom-left of DAG canvas → "LIVE FEEDS" header + two chips.
3. Mode dot color: 🟢 green pulse = real upstream · 🟠 amber = mock-fallback · ⚪ grey = mock/stale.
4. DevTools Network → response header `x-feed-mode` confirms.
5. Click Strait of Hormuz node in VERIFIED mode — proof-trace details show quantitative readouts (A-04 ratio, R-01 program count, R-02 force majeure rationale).

## Open follow-ups (priority-ordered)

1. ~~**Two-validator fork resolution**~~ — ✅ shipped. `validateSnapshot` now delegates to `runTarskiValidation` when a live graph is supplied; snapshots now run the full 32-axiom library.
2. ~~**Profile-agnostic universal axiom library (#75 follow-up)**~~ — ✅ shipped. The 7 universal-concept axioms (A-01, A-02, A-03, A-05, R-04, H-01, H-02) had their `appliesTo: ["geopolitical"]` dropped, `relevantDomains` set to `[]`, and wording rewritten to remove geopolitical-specific tokens (Saudi/Aramco/Qatar/QAFCO/Ma'aden/LNG/Hormuz). `scoreAxiomRelevance` gives universal axioms (no `appliesTo`, no `relevantDomains`) a base relevance of 0.45 so they surface as recommended on every profile. Geopolitical-only axioms (A-04, R-01, R-02, R-03) and T1D-only axioms (TA-*, TR-*, TH-*) keep their scoping.
3. ~~**Copilot routes to live engine state (brief #14)**~~ — ✅ shipped (PR #215 helper + #217 wire-up). `serializeGraphContext` now emits an `=== ENGINE STATE SNAPSHOT ===` block before graph metadata, sourced from `summarizeEngineState`. Future UI status panels (`/api/engine/status`, debug overlay) plug into the same helper.
4. **More live feeds** — same proxy pattern as EIA/OFAC. Candidates:
   - USGS critical minerals → A-05 Single-Source Fragility
   - ~~NOAA storm tracks → conflict-zone proxies~~ ✅ shipped. New `noaaStormsProvider` polls `https://www.nhc.noaa.gov/CurrentStorms.json` (NHC active tropical cyclones, free, no auth) on a 1h cadence and emits `kind: "storm"` LiveDataPoints aggregated per basin (Atlantic / Eastern Pacific / Central Pacific). Each basin observation carries `stormCount` + `maxIntensityKt`; nodes are matched via the standard `labelPatterns` (Atlantic → "shipping cost / atlantic / gulf coast / caribbean", EP → "eastern pacific / central america", CP → "central pacific / hawaii"). 1h server cache + mock-fallback on upstream errors (NHC sometimes 503s during major-storm spikes). Capacity = `HURRICANE_THRESHOLD_KT` = 64 (Saffir-Simpson Cat-1 floor) so cards read intensity as a ratio vs hurricane strength. New `storm` `KIND_FORMATTERS` entry classifies the strongest storm — "tropical storm / hurricane / major hurricane / depression" — so the qualifier is human, not a meaningless percentage. Honest scope note: current graph has limited storm-relevant nodes (only "Shipping Cost Index" matches a basin's labelPatterns today); the infrastructure ships and is ready for graph expansion. 13 new tests (12 NOAA parser/mock/provider, 1 display formatter); 1123 tests green. A-04 wiring shipped — chokepoint axiom now checks `getLiveSignal(node, "storm")` independently of throughput. Active hurricane (≥ 64 kt) on a chokepoint flags edges as A-04 violations with a `"… active storm 80 kt ≥ 64 kt hurricane threshold — NOAA NHC …"` ProofTrace detail. Storm and throughput violations compose: when both are present the detail string lists each with a `·` joiner. Storm check stays scoped to chokepoint nodes; storm signals on non-chokepoint nodes (e.g. Shipping Cost Index) don't trigger A-04. 5 new A-04 storm-branch tests (below-threshold no-op, hurricane firing, composed detail, storm-only fires when throughput healthy, non-chokepoint negative); 1165 tests green.
   - ~~World Bank governance indicators → R-04 Cross-Domain Dependency~~ ✅ shipped. Added 2 WGI Rule of Law (`RL.EST`) series for China + Brazil to the existing World Bank provider — they attach to the China / Brazil Real GDP nodes via the standard `labelPatterns` matcher, but dispatch with `kind: "governance"` so axioms can address them separately via `getLiveSignal(node, "governance")`. `WbSeriesConfig` gained an optional `kind?: string` field; the WB provider's `matchPayload` now reads it (falls back to `"indicator"` for legacy series) and builds `signalKinds` from the actual set of emitted kinds. R-04 now branches on the WGI score: cross-domain edges keep the static confidence threshold of 0.7, but when either endpoint carries a `governance` signal with value < 0 (below world average), the threshold tightens to 0.85 — rationale: cross-domain causal claims under weak regulatory enforcement need stronger empirical backing. ProofTrace.detail reports which endpoint is weakest and the WGI value. New `governance` formatter in `KIND_FORMATTERS` renders signed values ("−0.42 WGI · below avg" / "+0.75 WGI · above avg"). 12 new tests (3 WB parser + matchPayload for WGI series, 8 R-04 governance branch, 1 display formatter); 1086 tests green.
5. ~~**ΩF pillar wiring audit**~~ — ✅ shipped. Audit found that Tarski violations only set `isRestricted: boolean` (no J writeback); Spirtes-metrics never updated `cascadeLoad` after import-time. Fix: added `OmegaLiveAdjustments` overlay (`liveAdjustments` field on `CausalNode`) that surfaces live deltas without mutating the static `omegaFragility` profile. `applyOmegaLiveAdjustments(graph)` walks nodes, computes J-bump from live sanctions (0.4 per active OFAC program, capped at +4) and C-bump from out-degree above 5 (0.3 per excess edge, capped at +3). Runs in `setGraphData` and after every `applyFeedBatch`. `getEffectivePillars(node)` returns clamped 0..10 sum for downstream consumers; static baseline stays auditable.
6. **More T1D axioms** as clinical evidence lands (MODY exclusions, LADA, age-of-onset, exogenous insulin half-life). Coordinate with T1D session.
7. **More geopolitical axioms** as new data verticals land. Coordinate with Geopolitical/Macro session.

## How to start a task

1. Read this file end-to-end.
2. `git log --oneline main -10` for any commits since "Status" line above.
3. Check open PRs: GitHub MCP `mcp__github__list_pull_requests`.
4. Pick from "Open follow-ups" or take fresh user direction.
5. **Update this file** at the end of every material change.

---

## pearl.md

# Session: PEARL (Do-Calculus, Interventions, CASCADE DEFENSE)

Owns the structural-intervention engine: do-calculus, manual ablations (SEVER / ABLATE), and the auto-interdiction optimizer rebranded as **CASCADE DEFENSE**.

> **Status:** session brief is being inferred from cross-references — fill in detail as the session establishes itself.

## Scope summary (in)

- **Do-calculus** — `do(X)` interventions that isolate a node from its causes.
- **Manual ablations** — SEVER (cuts an edge; goes amber, functionally removed but physically possible), ABLATE (deletes nodes/edges entirely).
- **CASCADE DEFENSE** (auto-interdiction):
  - Minimax optimization to find the cheapest set of edges whose removal maximally reduces downstream cascade damage.
  - When attacker-defender min-cut is solvable: explicit SEVER / ABLATE buttons per recommended cut.
  - When not: fallback to a structural-vulnerability ranking of the next-most-brittle edges.
  - Auto-triggers a Monte Carlo forecast so the user sees the expected damage distribution before committing.
- Counterfactual timeline support — the Time Dial gains a second timeline (BASELINE vs INTERVENTION) when an intervention exists. PEARL produces the counterfactual data; the time-dial UI mechanics are shared with Rendering.
- VX-880 trial fits as a survival prior into Monte Carlo (ref #107).
- Engine modules:
  - `src/lib/intervention-engine.ts`
  - `src/lib/ablation-engine.ts`
  - `src/lib/interdiction-engine.ts`
  - `src/lib/monte-carlo-engine.ts`
  - `src/lib/cascade-simulator.ts`
  - `src/lib/trial-prior.ts`

## Scope summary (out — route elsewhere)

- Vocabulary distinction between manual interdiction (PEARL) and CASCADE DEFENSE (auto) → **UX & Onboarding** owns the copy; PEARL owns the underlying mechanic.
- Canvas state changes (amber edges, deleted nodes) → **Rendering** draws; PEARL decides the state.
- Right-panel UI and module tabs → **UX & Onboarding**.
- Time-dial scrubber UI → **Rendering** / **UX**; PEARL provides the counterfactual data.
- Graph data → respective **data sessions**.
- SPIRTES / TARSKI / PARETO outputs that feed PEARL inputs → respective engine sessions.

## Boundary clarifications

- **CASCADE DEFENSE rename**: vocabulary is locked at "CASCADE DEFENSE" (replacing "Interdiction") per #31. UX session enforces; PEARL respects in any new copy added inside engine output.
- **Trial-prior plumbing**: PEARL consumes VX-880 trial data (`src/lib/vx880-trial-data.ts`). The data file itself is a data-session concern (T1D); PEARL is a consumer.

## Anchor files

- `src/lib/intervention-engine.ts`
- `src/lib/ablation-engine.ts`
- `src/lib/interdiction-engine.ts`
- `src/lib/monte-carlo-engine.ts`
- `src/lib/cascade-simulator.ts`
- `src/lib/trial-prior.ts`
- `src/components/VX880TrialPanel.tsx` (right-panel surface for trial data)
- TODO: identify any PEARL-specific API routes.

## Shipped PRs (representative)

- **#31** — rename "Interdiction" → "CASCADE DEFENSE"; AI ablation interpretation engine-side
- **#107** — wire VX-880 trial fits as a survival prior into Monte Carlo
- **#108** — tighten PROTECT GRAFT shock; default MC target to trial outcome

## Likely upcoming themes

- Counterfactual visualization quality (BASELINE vs INTERVENTION clarity in the time dial).
- Auto-interdiction performance on larger graphs.
- More trial priors as additional T1D / other-domain trials are digitized.
- TODO: fill in as the session ships work.

## How to start a task

1. Confirm in-scope (interventions, ablations, CASCADE DEFENSE, Monte Carlo, counterfactuals).
2. Coordinate with PARETO when intervention output drives criticality changes.
3. Coordinate with Rendering for any new visual treatment of intervened edges/nodes.

---

## pareto.md

# Session: PARETO (Criticality Horizons & Ω-Fragility)

Owns the criticality-monitoring engine: three independent signals each with a T-N countdown and confidence, plus the Ω-Fragility composite framework that drives node coloring across the app.

> **Status:** session brief is being inferred from cross-references — fill in detail as the session establishes itself.

## Scope summary (in)

- **CSD** — Critical Slowing Down. Watches recovery-rate decay via λmax approaching 1.0.
- **PH** — Persistent Homology. Sweeps a filtration for topological fragility holes.
- **LPPLS** — Log-Periodic Power Law Singularity. Fits the Sornette crash model.
- Each criticality card surfaces: observed vs model signal, formula, methodology, current assessment, expandable temporal chart with residual.
- **Ω-Fragility** composite (0–10) on every node, broken into five pillars:
  - Irreplaceability
  - Restoration Latency
  - Jurisdictional Hazard
  - Cascade Load
  - Tail Depth
- Ω-Fragility Assessment summary in the panel: NOMINAL / ELEVATED / CRITICAL / OMEGA_BREACH.
- Top critical nodes ranked by Ω-score.
- **CDΩ Doomsday Monitor** — header strip showing buffer depletion (green → amber → red), T-Nd, regime classification (STABLE, MELT_UP, CRASH, PHASE_TRANSITION, STAGNATION), Dragon-King probability, active-shock count.
- **Scenario Injector** — preset shocks calibrated for the active domain (Strait of Hormuz closure, Abqaiq attack, LNG train outage, insulin supply-chain disruption, etc.). Each depletes the buffer per its severity.
- News interpreter ingestion (article → graph interventions): the *engine logic* is here — the in-app paste/URL/loading panel UX is **UX**.
- Engine modules:
  - `src/lib/omega-engine.ts`
  - `src/lib/pareto-relevance.ts`
  - `src/lib/criticality-registry.ts`

## Scope summary (out — route elsewhere)

- Right-panel chrome, tabs, expand-panel UX → **UX & Onboarding**.
- Canvas color encoding of Ω-Fragility (hotter = higher Ω) → **Rendering** draws; PARETO supplies values.
- News-interpreter UI (paste affordance, URL fetch button, loading skeletons, error copy) → **UX**.
- Graph data → **data sessions**.
- Interventions / Monte Carlo cascade simulation → **PEARL** (PARETO consumes intervention output to update criticality; PEARL produces it).
- Auth / API gating → **Platform**.

## Boundary clarifications

- **News interpreter**: engine logic and the article→intervention transformation are PARETO. The panel where users paste a URL/article, the loading state, and the error message wording are UX.
- **Empty-state copy** (e.g. "NO DATA — static Ω only" on ΩF SERIES cards): the *trigger condition* is PARETO; the *wording* is UX.

## Anchor files

- `src/lib/omega-engine.ts`
- `src/lib/pareto-relevance.ts`
- `src/lib/criticality-registry.ts`
- `src/lib/cascade-simulator.ts` (shared with PEARL)
- News interpreter UI surface: `src/components/news/*` (UX-owned chrome around PARETO logic).
- TODO: identify any PARETO-specific API routes.

## Shipped PRs (representative)

- **#52** — news interpreter panel: article → graph interventions
- **#58** — URL-fetch button: paste a link instead of full article text
- **#109** — real F·E·G·S relevance score with LPPLS and PH grid-fits

## Likely upcoming themes

- Tighter LPPLS / PH fits as more time-series land.
- Scenario library expansion per active domain.
- Cross-domain Ω composition for multi-domain workspaces.
- TODO: fill in as the session ships work.

## How to start a task

1. Confirm in-scope (criticality signals, Ω-Fragility, scenario injection, news interpretation logic).
2. Coordinate with PEARL when intervention output should update criticality estimates.
3. Coordinate with UX when changing user-visible copy on cards / news panel / empty states.

---

## geopolitical-macro.md

# Session: Geopolitical / Macro

Owns the geopolitical, financial, macro, and defense graph data and the corresponding domain profile entries. These sit under the **Analyst** persona with `dataset: main | athena`.

> **Status:** session brief is being inferred from cross-references — fill in detail as the session establishes itself.

## Scope summary (in)

- Graph data:
  - `src/lib/graph-data.ts` — main geopolitical/macro causal graph (`dataset: main`).
  - `src/lib/athena-graph-data.ts` — Athena dataset (`dataset: athena`).
- Domain profile entries in `src/lib/domain-profiles.ts` for: ENERGY SYSTEMS, FERTILIZER & AGROCHEMICAL, SUPPLY CHAIN SHOCK, FINANCIAL CONTAGION, EMERGING MARKET SOVEREIGN, FRONTIER (frontier-science), etc.
- Persona mapping: Analyst persona — geopolitical / financial / macro / defense.
- Domain-specific vocabulary in sidebar / inspector / pillar labels for these domains. Top-bar module tabs stay canonical SPIRTES/TARSKI/PEARL/PARETO.
- Geo-coordinate mapping for MAP-view domains: `src/lib/geo-coordinates.ts`.
- Domain-specific shock library (PARETO scenario injector presets — Strait of Hormuz closure, Abqaiq attack, LNG train outage, etc.). Authoring lives here; PARETO consumes.
- Constraint authoring (REGULATORY tier — sanctions, export controls, treaties) co-authored with **TARSKI**.
- Athena copilot engine: `src/lib/athena-copilot-engine.ts` (the *data side* — the copilot framework itself is shared).

## Scope summary (out — route elsewhere)

- Engine logic (SPIRTES, TARSKI, PEARL, PARETO) → respective **engine sessions**. This session supplies the graph and domain-specific constants.
- Persona pill UX, Domain Workspace card rendering → **UX & Onboarding**. We define the domain entries; UX renders them.
- MAP-view projection mechanics → **Rendering**. We supply geo-coordinates; Rendering projects.
- Canvas, layout, viewport → **Rendering**.
- Auth / API gating → **Platform**.

## Boundary clarifications

- **Vocabulary**: domain-specific module names / pillar labels live in the relevant `DomainProfile` entries. They flow through sidebar and inspector. They do **not** flow through the top-bar tabs (#70).
- **Cross-domain edges**: the Cross-Domain persona allows multi-select across dataset families. Cross-domain edge logic and rendering are coordinated; this session contributes the edges, Rendering draws.
- **Geo-coordinates**: this session owns whether a domain *has* geo-coordinates and what they are. MapLibre projection is Rendering's.

## Anchor files

- `src/lib/graph-data.ts`
- `src/lib/athena-graph-data.ts`
- `src/lib/athena-copilot-engine.ts`
- `src/lib/domain-profiles.ts`
- `src/lib/geo-coordinates.ts`
- `src/lib/node-timeseries-map.ts` (geopolitical/macro entries)

## Shipped PRs (representative)

- TODO: fill in as the session ships work / from `git log`.

## 2026-05 Live-Data Coverage Push

### What landed (17 PRs, all merged into main)

| PR | Commit | What |
|---|---|---|
| #221 | `2035f04` | DXY → EM FX panel refit (β=0.520 [0.10, 0.94] on 15-EM annual PIMCO panel including Turkey/Argentina) · Frontier-science scaffold (6 placeholder fs_* nodes + 4 intra-domain edges) · Time-series overlay tooltip + legend chip now show raw underlying metric (e.g. "6.76 %" food inflation) instead of duplicating per-card omega sparkline · 5 new FRED series (HOUST, RSAFS, ULCNFB, CUSR0000SEHC, JTSHIR) · README empirical playbook (FRED → mirror → PIMCO → statsmodels → literature ladder) |
| #255 | `8e67d00` | Tile sparkline (OmegaSparkline in RiskPropagationFlow) switched from index-based x to timestamp-based x mapped onto the global timelineRange. Every tile now shares the same x-axis as the TimeDial scrubber and the bottom overlay. Sparse-data: 1 point → horizontal hold-forward; 2+ → polyline + hold-forward to right edge. Date labels read the timeline window. |
| #267 | `4696e77` | 3 more FRED series — PAYEMS(units=chg) for `mi_nonfarm_payrolls`, DTWEXBGS for `ip_dxy`, CES0500000003(units=pch) for `mi_ahe_mom`. Transform-aware routing key `{id}_{units?}` so duplicate FRED ids with different transforms don't collide in the provider matcher. |
| #268 | `9ecf57e` | 9 historical-only nodes promoted to live: 6 FC nodes via World Bank (SAU FI.RES.TOTL.CD, MEX DT.DOD.DECT.CD, PAK GC.DOD.TOTL.GD.ZS, TUR BN.CAB.XOKA.CD, EGY PA.NUS.FCRF, ARG PA.NUS.FCRF) + 3 food nodes via FRED PFOODINDEXM (level for qf/mn global-food-price-stress; pc1 for sc_food_price_inflation). |
| #333 | `0ef7599` | `.env.example` template at repo root · `scripts/check-feed-health.ts` + `npm run check:feeds` (hits FRED + WB endpoints, prints LIVE/MOCK/MISS verdict per series) · DEPLOYMENT.md §2.1a documenting the rotate-and-verify flow. |
| #347 | `c98d60c` | **WB matcher fan-out** — replaced single-match `nodes.find(...)` with Set-based `matchSeriesToNodes(...)` so one (country, indicator) tuple can drive N graph nodes. Promotes 4 fertilizer-market nodes (`qf_/mn_` India + Brazil) to live via WB `AG.CON.FERT.ZS` (Fertilizer consumption, kg/ha). Both `IND` and `BRA` rows fan out to 2 nodes each (QAFCO + Ma'aden export-market labels). Closes the multi-match bug flagged in PR #268's handoff. |
| #350 | `de28f41` | Cleared the 2 WB `MISS` entries that were left over from the May audit. **PAK debt** swapped `GC.DOD.TOTL.GD.ZS` (null for Pakistan since 2000) → `DT.DOD.DECT.GN.ZS` (external debt % GNI, 35.6 % at 2024) — same downstream node, recalibrated capacity 80 → 50. **WLD CPI** entry deleted outright — WB doesn't aggregate CPI to any region (WLD/LMY/HIC/EMU/OED all null), and the `"global cpi"` label pattern matched zero graph nodes anyway. Net: 0 MISS lines remain in `check:feeds`. |
| #353 | `1737a89` | **FIT toggle** in `TimeSeriesOverlay`. Adds an explicit `FIT: DIAL ⇄ DATA` button in the overlay header that flips between the dial-aligned 60-day x-axis (default, chart cursor lines up with TimeDial scrubber) and a data-span axis (curves' actual history extents). Solves the cadence-mismatch UX bug where annual WB series rendered as flat hold-forward lines because every published timestamp fell before `timelineRange.start`. Button only surfaces when ≥1 pinned curve has history extending >25 % of dial span before `xStart` — pure-daily pin sets stay clean. Header indicator `· ZOOMED 2005–2024` appears in DATA mode. |
| #375 | `3cb14b5` | **FIT-mode auto-reset + OUT OF WINDOW chip.** PR #353 turned out to be a one-way trap: once a user landed in DATA mode (intentionally or accidentally), subsequent dial preset clicks (`1H / 1D / 1W / 1M`) silently had no effect on the chart because the chart was no longer reading `timelineRange`. User-reported repro: `1D → 1M → 1D` left the chart stuck as a flat line. Fixed with a `useEffect` that resets `xAxisMode` to `"dial"` whenever `timelineRange.start` changes — dial preset clicks change `.start`, the live tick only advances `.end`, so DATA mode survives live ticks but always loses to an explicit dial click. Also added a per-curve amber **OUT OF WINDOW** chip in the legend that surfaces when 0 history points fall inside `[xStart, xEnd]` — tells the user the flat line is a cadence-vs-window mismatch, not broken data. |
| #387 | `4ce4bbc` | **`1Y / 5Y / ALL` dial preset buttons.** Direct follow-up to #375's chip — the chip says "no data inside the window" but the only way out was the small `ZOOM OUT` button to the right of LIVE. This adds three long-cadence presets next to the existing four, with a slightly heavier border between the short-cadence group and the long-cadence group so the tier boundary reads visually. `TimeGranularity` type extended with `"year" \| "5year" \| "all"`. The long presets bypass the `fullRange.start` clamp (which had capped at the 60-day synthetic-data baseline) and widen `timelineFullRange` so a subsequent ZOOM OUT lands at the chosen extent. After this lands, the user's repro for fertilizer / debt-to-GDP nodes produces real curves at `5Y` or `ALL`. |
| #393 | `8e598d5` | **PPIFGS swap + STALE verdict in `check:feeds`.** Two related changes. (1) FRED `PPIFGS` ("PPI Final Demand Goods") was upstream-discontinued since 2015-12 but FRED still returned the 10-year-stale value, so `check:feeds` reported it as LIVE — the silent worst case. Compounded by a labelPatterns typo (`"ppi final demand energy"` while PPIFGS is the *Goods* sub-index). Replaced with three correctly-routed current series: `PPIFIS` (headline, 156.5 @ 2026-04), `PPIFDS` (Services, 156.1), `WPSFD4131` (Energy, 267.9). Net: 3 previously-unwired PPI graph nodes promoted to live; stale time-bomb removed. (2) New 4th verdict tier in `check:feeds`: any series with a real (non-mock) source whose `observedAt` exceeds the per-feed staleness threshold (FRED 365d, WB 5y) is flagged STALE. Bold-red age annotation in the legend; STALE > 0 is a hard CI exit code. The "what to do" note in the script points operators at the PR #350/#393 precedent for fixing each flagged series. |
| #394 | `cd9010c` | **Remove deprecated WB WGI series + wire Core PPI YoY.** Probed all 6 WGI indicator codes (`RL.EST` / `GE.EST` / `CC.EST` / `PV.EST` / `RQ.EST` / `VA.EST`) against the WB v2 API; every one returns `"The indicator was not found. It may have been deleted or archived."` The entire WGI dataset has been retired from the v2 endpoint. Removed the `CHN/RL.EST` + `BRA/RL.EST` entries (previously showing as MISS, contributing zero to R-04's governance-tightening logic). R-04 gracefully degrades to its static threshold via the existing null-guards in `tarski-data.ts`. Bonus: wired `ip_core_ppi_yoy` to `PPICOR` with `units=pc1` (5.23 % @ 2026-04). The `kind: "governance"` discriminator on `WbSeriesConfig` is kept for future re-wiring if a non-WB governance source ever lands. |
| #408 | `570f855` | **Phase 14 #1 — DFII10 (10y TIPS yield) → `ip_real_rate_10y`.** Wires the previously-historical-only real-rate node. The graph data already explicitly noted this target in an inline comment on the `ip_real_rate_10y__ip_dxy` edge: *"Literature-cited until FRED DFII10 (TIPS yield) becomes reachable."* It became reachable when FRED_API_KEY landed 2026-05-21. 2.18 % at 2026-05-21, daily. +1 node. |
| #411 | `c0fa101` | **Phase 14 #2 — Brazil + China Sovereign Risk PWT via WB proxies.** The 8 PWT (Penn World Table) sovereign-risk nodes for BRA + CHN were historical-only — PWT publishes annually with a ~3y lag and has no public REST API. Wired 2 of the 4 PWT dimensions via WB annual proxies: Capital Stock → `NE.GDI.TOTL.KD` (Gross Capital Formation, constant 2015 US$); TFP Index → `SL.GDP.PCAP.EM.KD` (GDP per employed person, constant 2017 PPP $). MPK + K/L Ratio are DERIVED quantities (require K and L jointly) and stay historical-only until a derivations-provider extension. +4 nodes. WB catalog 13 → 17. |
| #412 | `15c36fb` | **Phase 14 #3 — Fertilizer PPI → `sc_fertilizer_price_index`.** FRED `PCU3253132531` (Fertilizer Manufacturing PPI by Industry) covers both nitrogenous + phosphatic sub-industries. Monthly, current to 2026-04 = 302.87. +1 node. Supply Chain Food Security domain: 3/10 → 4/10 live. |
| #413 | `f43d107` | **Phase 14 #4 — Cass Freight Expenditures → `sc_shipping_cost_index`.** FRED `FRGEXPUSM649NCIS` captures both rate and volume — best single-number freight cost proxy on FRED. The canonical Red Sea / Suez container indices (Drewry, Shanghai SCFI) referenced by the graph mechanism comment are not publicly available; Cass is the closest free alternative. Monthly, 3.382 at 2026-04. +1 node. Supply Chain Food Security domain: 4/10 → 5/10 live. |
| #416 | `be6c2cd` | **Phase 14 #5 — Derivations-provider extension (K/L, MPK, MENA Currency Depreciation).** Extends the existing derivations provider to emit 5 new composite signals from already-live primitives — no new HTTP endpoints, no new env vars, no new upstream dependencies. (1) K/L Ratio proxy = Capital Formation / Real GDP for BRA + CHN (Brazil ~0.18, China ~0.39 in 2024); (2) MPK Cobb-Douglas α=0.3 = 0.3 × Y/K for BRA + CHN (Brazil ~1.68, China ~0.77); (3) MENA Currency Depreciation = mean of EGY + ARG FX value/capacity ratios. New `collectMenaFxRatios()` and `deriveCapitalRatios()` helpers in `src/lib/feeds/derivations.ts`; provider matchPayload rewritten to remove the early-return that was preventing MENA + Capital code from running when only WB primitives were available. Tests grew 6 → 15. +5 nodes (closes Sovereign Risk to 12/12 = 100%). Overall live coverage 42% → 44%, which is **~85% of the practically-reachable ceiling** under the current free-source constraint. |

### Coverage state at end of session (2026-05-23, after Phase 14 + derivations extension land)

Projected post-deploy state:

```
=== FRED ===       58 expected · LIVE 58 · MOCK 0 · STALE 0 · MISS 0   (poll 30 min)
=== World Bank === 17 expected · LIVE 17 · MOCK 0 · STALE 0 · MISS 0   (poll 1 h)
EIA Hormuz:        1 live (Strait of Hormuz throughput, 5-min poll)
Derivations:       7 composites (Currency Contagion + Exchange Rate Pressure
                                  + MENA Currency Depreciation + Brazil/China
                                  K/L + Brazil/China MPK)
Overall:           75+ catalog entries + 7 derived composites · clean
```

Catalog evolution this session:
- FRED catalog: 52 → 58 entries. Net +6: removed PPIFGS (#393); added
  PPIFIS / PPIFDS / WPSFD4131 / PPICOR (#393/#394); added DFII10 (#408),
  PCU3253132531 (#412), FRGEXPUSM649NCIS (#413).
- WB catalog: 15 → 17 entries. Net +2: removed 2 WGI (#394); added 4
  Sovereign-Risk PWT proxies (#411).
- EIA: Hormuz throughput live since 2026-05-22 (`EIA_API_KEY` rollout).
- Derivations: 2 composites (Currency Contagion + Exchange Rate Pressure)
  → 7 composites (added MENA Currency Depreciation, Brazil K/L + MPK,
  China K/L + MPK in #416).
- New STALE verdict in `check:feeds` (FRED 365d, WB 5y thresholds).

### Graph-node live coverage (post-derivations-extension)

Final state for the geopolitical/macro vertical:

| Tier | Nodes | % of 192 |
|---|---:|---:|
| 🟢 LIVE (real-time API polling + derivations) | ~85 | ~44% |
| 🟡 HISTORICAL (CSV snapshot, no polling) | ~76 | ~40% |
| 🟠 SYNTHETIC (omega-fragility seeded) | 25 | 13% |
| ⚪ BARE (placeholder "blank-needs-data") | 6 | 3% |

Coverage trajectory over the May session:
- Pre-session (2026-05-20):    ~53 live ≈ 28% — heavy mock+historical
- Post-FRED+EIA (2026-05-22):  ~80 live ≈ 42% — Phase 14 PRs #408–#414
- Post-derivations (#416):     ~85 live ≈ 44% — **the practically-reachable ceiling**

Per-domain coverage at session close:

| Domain | LIVE / TOTAL | Notes |
|---|---:|---|
| Macro Impact: Inflation & Policy | 26/27 (96%) | NY Fed SCE the only synthetic |
| Macro Impact: Labor, Growth & Housing | 23/25 (92%) | ISM PMI ×2 proprietary |
| Sovereign Risk | **12/12 (100%)** | ✅ closed via #411 + #416 |
| Financial Contagion | 12/18 (67%) | 8 historical-only (fund/BIS) + derivations |
| Supply Chain Food Security | 6/10 (60%) | up from 30% pre-session |
| QAFCO Fertilizer | 4/19 (21%) | physical-asset moat |
| Ma'aden Phosphate | 4/21 (19%) | physical-asset moat |
| Saudi Aramco Energy | 0/14 (0%) | physical-asset moat |
| QatarEnergy LNG | 0/11 (0%) | physical-asset moat |
| Undersea Cable Infrastructure | 0/12 (0%) | physical-asset moat |
| AI Safety / IDS | 0/17 (0%) | intentionally synthetic (benchmarks) |
| Frontier Science | 0/6 (0%) | intentional placeholders |

Live-node coverage by domain (intersection of live signal + graph node, after today's three PRs):

| # nodes | Domain |
|---:|---|
| 16 | Macro Impact: Labor, Growth & Housing |
| 12 | Macro Impact: Inflation & Policy |
|  9 | Financial Contagion |
|  4 | Sovereign Risk |
|  3 | QAFCO Fertilizer |
|  3 | Ma'aden Phosphate |
|  2 | Supply Chain Food Security |

Fan-out (one upstream signal driving N graph nodes — only possible after #347):

| Signal | Nodes fed |
|---|---|
| FRED `PFOODINDEXM` | `qf_global_food_prices`, `mn_global_food_price_stress` |
| WB `IND/AG.CON.FERT.ZS` | `qf_india_fertilizer_market`, `mn_india_fertilizer_market` |
| WB `BRA/AG.CON.FERT.ZS` | `qf_brazil_fertilizer_market`, `mn_brazil_fertilizer_market` |

Remaining bare nodes (no public source available): same intentional set as before the push — 6 frontier-science placeholders (`dataStatus: "blank-needs-data"`), 5 Ma'aden private infra, 2 ISM PMI proprietary since ~2015, 1 NY Fed SCE non-FRED.

### Open handoff for next session

**✅ Resolved 2026-05-21 — `FRED_API_KEY` is live on prod.** Set via Vercel UI on the manifold project (Production + Preview, Sensitive), redeployed with build cache disabled, all 51 FRED series flipped MOCK → LIVE. Key also saved to `.env.local` in the repo root for local-dev `check:feeds` runs. Local fingerprint: 32 chars, starts `aebd…`, ends `…be68`.

**Resolved threads (all closed during 2026-05-21 → 2026-05-22 session):**

- ✅ **`FRED_API_KEY` live on prod** (set 2026-05-21). Local fingerprint: 32 chars, starts `aebd…`, ends `…be68`. Saved to `.env.local` (chmod 600, gitignored).

- ✅ **PPIFGS upstream-discontinued → swapped (#393).** Replaced with PPIFIS (headline) + PPIFDS (Services) + WPSFD4131 (Energy). Plus added STALE verdict to `check:feeds` so the next discontinuation can't silently ride on prod.

- ✅ **WB null-tuple investigation → entries removed (#394).** Turned out to be a bigger finding: WB retired the entire WGI dataset from their v2 API. All 6 WGI codes return "deleted or archived." Cleanly removed; R-04 axiom gracefully degrades. Bonus: wired Core PPI YoY (PPICOR pc1) to `ip_core_ppi_yoy` while in the area.

- ✅ **Annual cadence vs daily TimeDial UX** (3-PR iteration: #353 → #375 → #387). FIT toggle + auto-reset + OUT OF WINDOW chip + `1Y/5Y/ALL` dial presets land users at a discoverable solution.

- ✅ **Phase 14 — Live-data Coverage Extension** (2026-05-22 → 23, 5 PRs: #408 / #411 / #412 / #413 / #416). Pipeline audit identified the most-actionable historical-only nodes. Shipped 5 PRs promoting 12 nodes from HISTORICAL → LIVE: DFII10 (real rate), 4× WB PWT proxies for Sovereign Risk, Fertilizer Manufacturing PPI, Cass Freight Expenditures, and a derivations-provider extension that closed the remaining 5 (Brazil/China K/L + MPK + MENA Currency Depreciation). Overall live coverage 38% → 44% — the practically-reachable ceiling under free-source constraints.

**All threads now resolved.**

- ✅ **`EIA_API_KEY` live on prod** (2026-05-22). User registered at https://www.eia.gov/opendata/register.php, key saved to `.env.local` (chmod 600, alongside `FRED_API_KEY`), added to Vercel manifold project (Sensitive, Production + Preview), redeployed with "Use existing Build Cache" UNCHECKED. Hormuz endpoint flipped from `(mock — EIA_API_KEY unset)` to live `EIA v2 / Persian Gulf producers (period 2026-01)` after ~3 min. First live values:

  ```
  value: 26.053 mb/d   (115% of 21 mb/d stated chokepoint capacity)
  observedAt: 2026-01-01

  Breakdown by producer:
    Saudi Arabia  11.930 mb/d
    UAE            4.779 mb/d
    Iran           4.692 mb/d
    Iraq           4.508 mb/d
    Kuwait         2.882 mb/d
    Qatar          1.859 mb/d
  ```

  This is the signal driving the Tarski A-04 chokepoint axiom — value > capacity flags concentration risk.

### Pipeline audit (2026-05-22) — what's left after Phase 14

The audit categorized each of the 192 graph nodes by data status. The
remaining HISTORICAL-only and SYNTHETIC nodes break down into three
buckets, sorted by what's actually movable:

**Bucket A — Physical-asset moat (52 nodes, unlikely to wire live)**.
Per-asset APIs don't exist publicly for individual refineries, pipelines,
ports, mines, or undersea cables.

- Saudi Aramco Energy (14 hist) — Abqaiq, Ras Tanura, MGS, Fadhili, etc.
- QatarEnergy LNG (11 hist) — Ras Laffan, NFE, Pearl GTL.
- Undersea Cable Infrastructure (12 hist) — 2Africa, AAE-1, FLAG, SEA-ME-WE.
- QAFCO Fertilizer (15 hist) and Ma'aden Phosphate (12 hist + 5 synth)
  beyond their fan-out export-market nodes — same physical-asset pattern.

Aggregate proxies could lift some of these via the `derivations` provider
(e.g. EIA aggregate KSA production driving multiple Aramco nodes), but
that's a derivations-extension shape, not a simple FRED/WB add.

**Bucket B — Bespoke / fund-specific (8 nodes, no public source)**.
- Financial Contagion: PIMCO EMD, BlackRock EMD, Fund Concentration,
  Crisis Window, Haircut Transmission, Cross-Border Banking (BIS dead
  on FRED since 2019-2020 anyway).
- Supply Chain Food Security: Bunge / Almarai (company-specific),
  Strategic Reserves, Subsidy Program (government data, varies by country).

**Bucket C — Intentionally synthetic / placeholder (23 nodes)**.
- AI Safety / IDS (17 nodes) — CICIDS-2017, UNSW-NB15, DDoS, etc.
  Dissertation-derived BENCHMARK references; meant to be conceptual,
  not live signals.
- Frontier Science (6 bare) — Neutrino Mass, Dark Matter Direct,
  Axion, GW Observatory, Proton Decay, Hubble Tension. Research-
  aspirational placeholders.

**✅ Realistic next-batch ceiling achieved (#416, 2026-05-23).** The
derivations-provider extension landed 5 more nodes (MPK + K/L for
Brazil + China; MENA Currency Depreciation). Sovereign Risk now
12/12 = 100% live. Past this, the remaining historical/synthetic
nodes are structurally unmovable under free-source constraints —
physical-asset moat (no per-asset APIs), bespoke fund-specific data
(not published), and intentionally-synthetic dissertation refs.
**44% live = ~85% of the practically-reachable ceiling.**

**Continuation prompt for the next Claude window (paste verbatim):**

> I'm picking up the geopolitical/macro vertical of apex-terminal. Read `docs/sessions/geopolitical-macro.md` for full context. The 2026-05 live-data push + Phase 14 extension + derivations-provider extension are ALL CLOSED — 17 code PRs + 6 docs PRs merged, FRED_API_KEY + EIA_API_KEY live on prod, all four providers reading clean (FRED 58, WB 17, EIA Hormuz, derivations now 7 composites). Live coverage at ~44% of 192 graph nodes — **approximately 85% of the practically-reachable ceiling** under free-source constraints. The remaining 56% gap is structural: physical-asset moat (Aramco/QatarEnergy/Ma'aden facilities, undersea cables — no per-asset APIs exist publicly), bespoke fund-specific data (PIMCO/BlackRock/Bunge/Almarai snapshots), and intentionally-synthetic dissertation references (AI Safety / IDS, Frontier Science). See "Pipeline audit" section for the full breakdown. The geopolitical/macro live-data thread is functionally complete — pivot recommended to "Likely upcoming themes" (new domain cards for customer pilots, MAP-view geo-coordinates, sanction/export-control axiom expansion with TARSKI), or to a different in-scope area entirely. Only if user specifically asks for more live data: investigate aggregate proxies for the physical-asset moat (EIA aggregate KSA / Qatar production driving multiple downstream nodes via derivations), or look outside FRED/WB for one of the bespoke composites.

### Empirical playbook (the data ladder)

When wiring a new edge or live feed, work the sources in this priority order — each tier is a strictly weaker fallback. Documented in full in `research/macro/README.md`.

```
1. FRED API     (FRED_API_KEY set)
2. GitHub mirror of the FRED-equivalent series (datasets/* org)
3. PIMCO annual EM panel (claire/timeseries.json → pimco_sovereign)
4. statsmodels.macrodata bundled quarterly (1959-2009)
5. Literature-cited weight, transparently disclosed
```

DXY → EM FX (PR #221) is the canonical worked example: tier-2 monthly fit for the high-confidence point estimate, tier-3 annual fit for panel breadth (Turkey + Argentina), final edge weight is a defensible blend (0.44, between the two point estimates).

### Notable internals worth remembering

- **FRED provider routing key is `{id}_{units?}` not just `{id}`** since PR #267 — multiple entries with the same series + different transforms (PAYEMS level + chg, CES0500000003 Y/Y + M/M) live in `FRED_SERIES[]`. Both `parseFredSeriesResponse` and `mockFredFeed` emit observations with the transform-aware key.
- **WB provider routing key is `(country, indicator)` tuple** — `PA.NUS.FCRF` appears for both Egypt and Argentina, distinguished by country.
- **WB provider matcher is fan-out (multi-match-per-observation) since PR #347** — `matchSeriesToNodes(...)` returns a Set of all label-pattern matches. One (country, indicator) tuple can drive N graph nodes. Concrete use: `IND/AG.CON.FERT.ZS` feeds both `qf_india_fertilizer_market` and `mn_india_fertilizer_market`; same for Brazil. The old `nodes.find(...)` single-match behaviour was a latent bug that surfaced when the fertilizer batch needed wiring.
- **Tile sparkline x-axis (OmegaSparkline in RiskPropagationFlow) binds to `timelineRange`** — pan/zoom the TimeDial → every tile responds in lockstep. Sparse-data nodes render hold-forward lines edge-to-edge. The Hormuz "LIVE — building" empty tile from the screenshot user-report no longer happens.
- **`TimeSeriesOverlay` has two x-axis modes since PR #353** — `dial` (default, mirrors `timelineRange`, cursor aligns with TimeDial scrubber) and `data` (spans pinned curves' actual history). `FIT: DIAL ⇄ DATA` button surfaces in the overlay header only when ≥1 curve has history extending >25 % of dial span before `xStart`. In `data` mode, the chart cursor visually decouples from the TimeDial — by design, since the comment in `TimeSeriesOverlay.tsx` lines 319–326 captures the explicit trade-off. Local component state (`useState`), not persisted — chart defaults to `dial` on every remount.
- **Since PR #375, `xAxisMode` auto-resets to `"dial"` whenever `timelineRange.start` changes.** Dial preset clicks change `.start`; the live tick only advances `.end`. So `data` mode survives live ticks but always loses to an explicit dial click — the click is treated as the strongest signal that the user wants chart-follows-dial behaviour. Eliminates the one-way trap where users got stuck in DATA mode with seemingly-broken dial buttons.
- **OUT OF WINDOW chip (PR #375)** — amber chip in the legend that surfaces per-curve when 0 history points fall inside `[xStart, xEnd]`. Tells the user the flat hold-forward line is a cadence-vs-window mismatch, not broken data. Hidden in DATA mode by definition. `inWindowCounts` is a `useMemo` over `[curves, xStart, xEnd]` — cheap linear scan, ~5 curves × ~5–20 history points.
- **Dial preset buttons are tiered (PR #387)** — `1H / 1D / 1W / 1M` for fast-moving signals (FRED daily, EIA 5-min), then a visual divider, then `1Y / 5Y / ALL` for annual-cadence signals (WB, WGI). The long presets bypass the `fullRange.start` clamp in the store action — they're allowed to widen the window beyond the synthetic 60-day default. Also widens `timelineFullRange` when picked so a subsequent ZOOM OUT lands at the chosen extent.
- **Time-series overlay tooltip + legend chip now show raw value with unit** (e.g. "6.76 %") not the omega-normalized 0-10 number. `NodeTemporalState.rawValue` carries the unnormalized number; `formatRawValue()` picks decimal precision by magnitude regime.
- **`scripts/check-feed-health.ts`** is the verification entry point. `npm run check:feeds` runs against prod by default; `BASE=http://localhost:3000 npm run check:feeds` for local dev. The script reads `FRED_API_KEY` from `.env.local` (added 2026-05-21).
- **STALE verdict in `check:feeds` (PR #393)** — when an observation has a real (non-mock) source but its `observedAt` exceeds the per-feed staleness threshold (FRED 365d, WB 5y), it's flagged as a 4th tier `STALE` alongside LIVE/MOCK/MISS. STALE rows show age in bold red; LIVE rows get a faint age annotation. STALE > 0 is a hard CI exit code. Catches the class of upstream-discontinued series that the API keeps returning the last-known value for (PPIFGS-style failure). The WB threshold is 5y not 3y because WB has a normal 2-3y publication lag for annual series — fertilizer was a false positive at 3y. Calibrated by dry-run.
- **WB WGI dataset is fully retired from v2 API (PR #394 finding)** — `RL.EST` / `GE.EST` / `CC.EST` / `PV.EST` / `RQ.EST` / `VA.EST` all return `"The indicator was not found. It may have been deleted or archived."` If a future session needs governance signals, look outside the WB v2 endpoint. The `kind: "governance"` discriminator on `WbSeriesConfig` and the formatter's "governance" branch in `feeds-display` are kept in code for that future wiring.
- **PPIFGS / PPILFE upstream-discontinued at 2015-12** — same class of failure as the WGI deprecation but caught via different signal (observation age vs. error response). PPIFGS swapped in PR #393. PPILFE was never actively wired (only probed during the PR #393 investigation); not a real time-bomb, just documented in the fred.ts comment as a known-dead candidate.
- **FRED `PPICOR` (units=pc1) is the current Core PPI YoY series since PR #394** — supersedes the long-discontinued PPILFE. 5.23 % at 2026-04. Wires `ip_core_ppi_yoy`.

### Lessons from the 3-iteration UX arc (#353 → #375 → #387)

A single observation — "annual WB curves render as flat lines in the dial window" — produced three PRs in rapid succession, each fixing something the previous didn't. Worth remembering when shipping UX over data:

1. **#353 was the first-order fix.** Add a FIT button that zooms the chart to the data span. Solves the visible problem. But created a one-way trap because nothing reverts the user out of DATA mode.

2. **#375 was the trap fix.** Auto-reset on dial click + an OUT OF WINDOW chip explaining why curves look flat in tight windows. But left users with no good escape hatch from the chip — they'd have to know about the small ZOOM OUT button (off-screen-right for many viewports).

3. **#387 was the discoverable fix.** Long presets (`1Y / 5Y / ALL`) live in the same place as the existing dial buttons — no hunting for a hidden control.

The pattern: each PR addressed a real bug introduced by the previous. The first PR's design wasn't wrong, but its scope was wrong. The full solution required three mechanisms that work together — long presets are the primary path, FIT toggle is a power-user shortcut, OUT OF WINDOW chip is the diagnostic when neither has been used. **Default to shipping the smallest first-order fix, then iterate based on use.** Trying to design all three mechanisms upfront would have meant scope-bloating PR #353 into a major rewrite; instead we shipped three small focused PRs that each closed an identifiable gap.

User feedback after each PR was the unblocker. Listening for "still doing it" / "stretched to a line" / "1D didn't restore" surfaced the trap that wouldn't have shown up in unit tests.

## Likely upcoming themes

- New domain cards as customer pilots demand them.
- Real-world coordinate coverage for MAP-view domains.
- Sanction / export-control axiom expansion (TARSKI co-auth).
- Time-series coverage for currently sparse nodes.
- TODO: fill in.

## How to start a task

1. Confirm in-scope (geopolitical / financial / macro / defense data and profiles).
2. Coordinate with TARSKI when adding regulatory constraints.
3. Coordinate with PARETO when adding scenario-injector presets.
4. Coordinate with UX when adding/renaming domain cards or changing persona-mapped grouping.
5. Coordinate with Rendering when changing MAP-view geo-coordinates or layout assumptions.

---

## t1d.md

# Session: T1D / Life Sciences

Owns the Type-1 Diabetes graph data, β-cell dynamics, T1D-specific domain profile, and the vocabulary that flows through the sidebar/inspector when a T1D dataset is active.

> **Status:** session brief is being inferred from cross-references — fill in detail as the session establishes itself.

## Scope summary (in)

- T1D graph data:
  - `src/lib/t1d-graph-data.ts` — main T1D causal graph.
  - `src/lib/t1d-vx880-graph-data.ts` — VX-880 trial-specific graph.
  - `src/lib/vx880-trial-data.ts` — trial cohort data, NLME decay, Cox HR readout (#105).
  - `src/lib/t1d-estimator-inputs.ts` — estimator input wiring.
- T1D domain profile entries in `src/lib/domain-profiles.ts`.
- Persona mapping: T1D datasets are **Scientist** persona under Analyst/Scientist/Cross-Domain (`dataset: t1d`).
- T1D-specific vocabulary surfaced in sidebar / inspector / pillar labels (note: per #70, top-bar module tabs stay canonical SPIRTES/TARSKI/PEARL/PARETO regardless of profile).
- Pillar / regulatory tier definitions specific to T1D (FDA accelerated-approval, pediatric trial restrictions, orphan designation, ex-US approval divergence).
- Time-series mappings for T1D nodes — `src/lib/node-timeseries-map.ts` Tier-A entries (digitised published sources). Nodes without Tier-A mapping fall back to NO-DATA sparklines.
- Trial-cohort UI surface: `src/components/VX880TrialPanel.tsx`.
- Constraint authoring (regulatory tier definitions) co-authored with **TARSKI**.

## Scope summary (out — route elsewhere)

- Engine logic (SPIRTES discovery, TARSKI verification, PEARL interventions, PARETO criticality) → respective **engine sessions**. T1D supplies the data and domain-specific constants; engines compute on it.
- Persona pill UX, Domain Workspace card layout, persona switching mechanics → **UX & Onboarding**. T1D defines the domain entries; UX renders the cards and pills.
- Canvas, layout, viewport → **Rendering**.
- Auth / API gating → **Platform**.

## Boundary clarifications

- **Vocabulary**: T1D-specific module names / pillar labels live in the T1D `DomainProfile` entry. They flow through sidebar and inspector. They do **not** flow through the top-bar tabs (those are pinned canonical labels per #70).
- **Trial priors**: T1D owns the trial-data files (VX-880, etc.). PEARL consumes them as a survival prior into Monte Carlo (#107). Adding a new trial means updating both — coordinate.

## Anchor files

- `src/lib/t1d-graph-data.ts`
- `src/lib/t1d-vx880-graph-data.ts`
- `src/lib/vx880-trial-data.ts`
- `src/lib/t1d-estimator-inputs.ts`
- `src/lib/node-timeseries-map.ts` (Tier-A T1D entries)
- `src/lib/domain-profiles.ts` (T1D profile entries)
- `src/components/VX880TrialPanel.tsx`
- Reference doc: [`docs/MANIFOLD_FOR_T1D.md`](../MANIFOLD_FOR_T1D.md) and the T1D restoration HTMLs under `docs/`.

## Shipped PRs (representative)

- **#61** — M-T1D-02 estimator suite: Python reference + TS ports (BOCPD, TE, Moran, Takens)
- **#105** — VX-880 trial cohort analysis panel: NLME decay + Cox HR readout
- **#106** — wire `t1d-vx880` selector id to T1D VX-880 graph domain
- **#107** — wire VX-880 trial fits as a survival prior into Monte Carlo
- **#108** — tighten PROTECT GRAFT shock; default MC target to trial outcome

## Likely upcoming themes

- Additional digitized trials (beyond VX-880) as Tier-A data lands.
- Tier-B / Tier-C dataset onboarding (the sparkline NO-DATA fallbacks).
- Profile-specific shock library expansion (PARETO scenario injector).
- TODO: fill in as the session ships work.

## How to start a task

1. Confirm in-scope (T1D data, profile, vocabulary, trial digitization).
2. Coordinate with the relevant engine session when adding/editing data they consume.
3. Coordinate with UX when adding new persona-mapped domain cards.

---

## copilot.md

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
  system-prompt.ts        COPILOT_SYSTEM_PROMPT — shared between route + eval (extracted in #302)
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

---

## rendering-perf.md

# Session — Rendering & Perf (Manifold)

**Branch:** `claude/rendering-perf-manifold-UblqD`
**Scope:** layout algorithms, viewport behavior, selection mechanics, animations, render perf, bundle perf, visual regressions, time-series rendering on the canvas. Out of scope: domain data, engines (Spirtes / Tarski / Pearl / Pareto), UX/onboarding, auth/platform, payments — each has its own session.

This is the running log for the Rendering & Perf session. Every change pushed from this session also lands an entry here so the work survives a system crash and a fresh session can resume from the bottom of the file.

---

## Surfaces under this session

- `src/components/CausalDAG2D.tsx` — React Flow 11 (`reactflow`).
- `src/components/CausalDAG3D.tsx` — react-three-fiber + drei + postprocessing on `three@0.183`.
- `src/components/CausalDAGMap.tsx` — MapLibre GL, dynamically imported (`next/dynamic`, `ssr: false`).
- Shared: viewport refit, selection state, timeline scrubbing, shock cascade animations, status banner.
- Layout seam: `src/lib/graph-layout.ts` (3D force-directed + `DOMAIN_Z_OFFSETS`).
- Store seam: `src/stores/useApexStore.ts` (Zustand, fine-grained selectors).

---

## Open work tracked

- **Issue #1 — 3D layout fix (Sugiyama + bounds scaled to node count).** Highest-leverage rendering item still open. Pending greenlight. Plan-agent recommendation: Sugiyama-style rank layout, bounds scaled to node count.
- **Issue #2 — ΩF SERIES "NO DATA" cards.** _Shipped_ — see entry 2026-05-02 below.
- **Diagnostic — canvas-vs-screenshot mismatch.** Last poked 2026-04-24 via Claude_in_Chrome; DOM showed correctly-positioned nodes but the screenshot was an empty dark rectangle. Treated as a Claude_in_Chrome compositor artifact, not a real prod bug, until reproduced in a real browser.

---

## At-a-glance — PRs shipped from this session

A bottom-up read of the full log still works, but for a fresh session this is the fastest way to see the current state. Newest first.

**2026-05-27 round (load-time round 9)**

| PR | What |
|---|---|
| TBD | `perf(bundle)`: defer the `@supabase/ssr` chunk off the eager bundle. Both `HeaderBar` and `FeedbackWidget` (the only two critical-path components that pulled `supabase/client`) now dynamic-import `createClient` inside their respective callbacks — HeaderBar's `handleSignOut` (explicit user click) and FeedbackWidget's mount-time email lookup (effect with cancellation guard). |

**2026-05-27 round (load-time round 8) — _merged as #450_**

| PR | What |
|---|---|
| #450 | `perf(bundle)`: lazy-load `RiskPropagationFlow` (594 LOC) gated on `hasGraph` — empty workspace splash just rendered a collapsed toggle bar anyway. Lazy-load `ModulePanel` (842 LOC + DiscoveryRunsPanel 523 + community-detection 209 + discovery-uncertainty 106 + omega-engine 180 in transitive chain) with a column-shaped placeholder. After this round, the only static-imported page-level components are HeaderBar (167), StructuralMetrics (90), and FeedbackWidget (148). |

**2026-05-27 round (load-time round 7) — _merged as #449_**

| PR | What |
|---|---|
| #449 | `perf(bundle)`: split `DOMAIN_MAP` (~30 LOC lookup table) out of `domains.ts` (333 LOC) into a new `domain-map.ts`. `useFilteredGraph` (used by every critical-path component that renders a filtered graph view: RiskPropagationFlow, StructuralMetrics, NodeInspector, all four canvas surfaces) now imports from the lightweight file. `domains.ts` re-exports for backward compat. Net: ~300 LOC of DOMAIN_GROUPS catalog data dropped from the useFilteredGraph transitive chain. |

**2026-05-27 round (load-time round 6) — _merged as #448_**

| PR | What |
|---|---|
| #448 | `perf(bundle)`: pull the 1311-LOC `node-timeseries-map.ts` + 145-LOC `generateTemporalData` synthetic generator off the eager bundle. `RiskPropagationFlow` (critical path) dynamic-loads `getNodeDataDescription` via effect+state — the 6px data-label badges briefly absent on first paint, then appear when the chunk lands. New `temporal-state-helpers.ts` (~130 LOC) houses the lightweight readers (`getNodeStateAt` / `getEdgeStateAt` / `getEventsInRange` / `getVisibleNodesAt` + types) so `useTemporalGraph` (used by RiskPropagationFlow, ModulePanel, etc.) stops transitively pulling the synthetic-data generator. `temporal-data.ts` re-exports for backward compat. |

**2026-05-27 round (load-time round 5) — _merged as #447_**

| PR | What |
|---|---|
| #447 | `perf(bundle)`: `domain-profiles.ts` (480 LOC of three profile definitions + pillar labels + estimator configs) fully off the eager bundle. Extracted `GEOPOLITICAL_MODULES` (the four tab labels) into a new `module-tabs.ts` (~40 LOC); `HeaderBar` now imports from there directly instead of pulling the full profile data. `ModulePanel`'s `isT1DDomain` check replaced with a direct `selectedDomains.some(id => id.startsWith("t1d-"))` prefix test (functionally equivalent for that use case, no profile resolution needed). `useApexStore`'s four `resolveDomainProfile` call sites are all inside the deferred Tarski `.then()` blocks already, so the import is now co-loaded with `runTarskiValidation` via a parallel `Promise.all` in `loadTarskiHelpers()`. Net: ~480 LOC dropped from initial paint; only zero-cost `import type { PillarKey }` references remain. |

**2026-05-27 round (load-time round 4) — _merged as #446_**

| PR | What |
|---|---|
| #446 | `perf(bundle)`: extract `applyTarskiFlags` + `clearTarskiFlags` + the `TarskiValidationReport` type into a new lightweight `tarski-flags.ts`; dynamic-import `runTarskiValidation` (which carries the 891-LOC AXIOM_LIBRARY + 800-LOC validation engine) inside the four store actions that need it (`runTarskiWithAxioms`, `setTruthFilter`, `applyFeedBatch`, `promoteAutoBridge`). Verified mode is opt-in — the heavy chunk only loads once per session at the first verified-mode trigger. Also lazy-loads `TimeDial` (1207 LOC) from `app/page.tsx` with a placeholder matching the dial's geometry — biggest single static-imported component finally moved off the eager bundle. |

**2026-05-27 round (load-time round 3) — _merged as #445_**

| PR | What |
|---|---|
| #445 | `perf(bundle)`: dynamic-import `temporal-data` (334 LOC, `generateTemporalData`) and `real-timeseries` (426 LOC, `loadRealTemporalData`) inside the store's `initTemporalData` action — both only fire after a workspace is loaded, so the ~760 LOC chunk defers until then. Lazy-load `NewsInterpreterPanel` (~350 LOC) — only renders on the non-default Pareto tab. Lazy-load `NodeInspector` (~630 LOC) gated on `selectedNode != null` — initial paint never has a selection so the chunk only loads after the first click. |

**2026-05-24 round (load-time round 2) — _merged as #444_**

| PR | What |
|---|---|
| TBD | `perf(bundle)`: strip the unused future-stub methods from `EngineProvider` (`computeCounterfactual`, `validateSnapshot`, `solveInterdiction`, `computeDoomsday`) — zero call sites in the live codebase, but their LocalProvider implementations were transitively pulling `cascade-simulator` (446 LOC) + `tarski-validator` (204 LOC) + `interdiction-engine` (443 LOC) into the critical-path bundle via ModulePanel. Also dynamic-import `mergeGraphs` + `validateSnapshot` inside `useApexStore`'s `mergeGraphData` / `setSnapshot` actions so the two helpers (~275 LOC) stay off the eager bundle. |
| TBD | `perf(bundle)`: dynamic-import `cascade-simulator` (446 LOC) inside `useApexStore`'s three fire-and-forget replay handlers — replay is opt-in (user clicks REPLAY), so the simulator stays off the initial-paint bundle; also drops a dead-import (`simulateCascade` was unused). Extract pure `buildRiskCards` from `graph-data.ts` into its own 27-LOC file so `RiskPropagationFlow` (on critical path) stops transitively pulling the 3000-line dataset. Bypass the `@/lib/estimators` barrel in `StructuralMetrics` (also on critical path) — direct-import the 76-LOC `omega-bridge-density` leaf instead of the index which re-exports ~2500 LOC. |
| TBD | `perf(bundle)`: dynamic-import the feed registry chain (~38KB across 10 providers) inside `useFeedRegistry`'s effect — polling can't start until a graph is loaded anyway, so the providers stay off the initial-paint bundle until then |
| TBD | `perf(bundle)`: split `graph-data.ts` (3413 LOC) — extract `getCategoryColor` / `getDomainColor` / `getCategoryLabel` / `EMPTY_GRAPH` into a new lightweight `graph-color.ts`; rewire 13 consumers (including the always-eager `useApexStore`) so the 3000-line dataset no longer rides into the critical-path bundle. `TimeSeriesOverlay` (987 LOC) now dynamic-imported and gated on `pinnedTimeSeriesNodes.length > 0` — first paint never has pins so the chunk defers until the user pins a series. |

**2026-05-22 round (load-time + Map placement + criticality response)**

| PR | What |
|---|---|
| TBD | `feat(canvas)`: dial-scrub contraction round 2 — 2D CONTRACTION 0.35 → 0.55 and stress-curve ramp pushed up (4→8 instead of 5→10) for both 2D and 3D so typical historical omegas (5-7) actually produce visible orb movement on scrub |
| #439 | `feat(edges)`: new `"flow"` edge type (teal-green solid + animated arrow, distinct from `"directed"` claim and `"temporal"` lag) + per-edge-type visibility toggle chip strip in DAGOverlay across 2D / 3D / Map |
| #435 | `feat(timedial)`: granularity picker collapses to a single chip; click to expand, pick-to-collapse |
| #432 | `perf(bundle)`: lazy `SystemCopilot` chunk + lazy `buildGraphFromDomains` / `AXIOM_LIBRARY` inside copilot tool handlers — pulls ~6.8 K LOC off the initial-paint bundle |
| #427 | `feat(2d)`: dial-scrub now moves orbs via historical-omega contraction (matched 3D's already-shipped fallback); CONTRACTION 0.18 → 0.35 for visibility |
| #409 | `perf(2d)`: 2D layout sim + network metrics → layout Web Worker (`requestLayout2D` arm; same epoch cancellation pattern as 3D) |
| #406 | `perf(bundle)`: extract `TarskiPanel` / `ParetoPanel` / `CopilotInterdictionResults` / `SnapshotIndicator` from `ModulePanel.tsx` into `next/dynamic` chunks (`ModulePanel.tsx` 3384 → 821 LOC) |
| #404 | `perf(3d)`: 3D layout sim + network metrics → Web Worker (`src/lib/workers/layout3d-{worker,client}.ts`) |
| #399 | `fix(ui)`: removed the stray "CLIENT DEPLOYMENT → Athena Defense" CTA on the canvas |
| #398 | `feat(map)`: Map geo-placement — US-hub spread (replaces Kansas-blob centroid) + ~100 NODE_COORDINATES entries for Athena ISR, T1D, T1D VX-880, AI Safety / IDS, Macro Impact, Frontier Science; city/institution name scan; smarter country regex; 16 → 32 country centroids |

**2026-05-07 round (launch freeze + UX polish)**

| PR | What |
|---|---|
| #304 | `fix(perf)`: `CausalDAG2D` lazy + conditional — no parallel layout sim on launch |
| #303 | `perf(topo)`: 4σ Gaussian truncation in `computeReliefField` / `computeReliefLayers` / `computeFusedReliefField` (~5-10× kernel speedup) |
| #301 | `fix(perf)`: launch-workspace freeze — `applyOmegaLiveAdjustments` O(N×E) → O(N+E); `useDeferredValue` on `StructuralMetrics.omegaBridgeDensity` + `CascadeHeader.netMetrics` |
| #300 | `perf(bundle)`: first wave of `next/dynamic` panel deferrals (`MonteCarloForecast`, `VX880TrialPanel`, `InterdictionPanel`, `TissueCohortView`) |
| #299 | `perf(map)`: per-frame particle layer → imperative `setData` (no React reconciliation per rAF tick) |
| #288 | `fix(timeline)`: cap `loadRealTemporalData` range at `Date.now()` — no more scrubbing into 2030 |
| #285 | `fix(map)`: upgrade `maplibre-gl` v4.7 → v5.24 so the globe projection actually renders |
| #283 | `feat(canvas)`: `startTransition` around ISOLATE toggle; TOPO shift-lasso selection |
| #281 | `feat(canvas)`: unified card-colour resolver (`getDomainCardColor` in `lib/domains`); Map globe projection in style spec (made live by #285) |

**Older entries** live in `## Session log` below; see the dated section headers for each.

---

## Backlog (next-up, ordered roughly by priority)

- **Flow edge type + edge-type visibility toggles.** _Infrastructure shipped — 2026-05-22._ `"flow"` edge type wired across all four canvas surfaces with teal-green solid + animated arrow visual; per-type visibility chip strip in DAGOverlay (CAUSAL / TEMP / CONF / FLOW) hides/shows each type instantly. Open: data-team alignment on what `"flow"` means semantically + which existing edges should be re-tagged (no edge in the loaded datasets carries `type: "flow"` yet).
- **Time-dial range-selector collapsible (NEW).** The 1H / 1Y / 5Y / ALL preset row at the bottom of the dial currently takes a fixed slice of horizontal space. User wants it collapsible so the dial itself can take the full width when the user isn't picking a range.
- **Distance measures on dial scrub — round 2 shipped — 2026-05-22.** Traced end-to-end: wiring was correct (temporal graph → filtered graph → both contraction paths), the gap was stress magnitude. Synthetic temporal data drifts within ±0.5 of base, so typical historical omegas sit in the 5-7 band — and the old `(omega-5)/5` / `(omega-5)/4` stress curves produced stress 0.1-0.3 → pull 3-14 % of distance, invisible. Bumped 2D CONTRACTION 0.35 → 0.55 and stress curves on both surfaces (4 → 8 instead of 5 → 10) so typical omegas land in stress 0.25-0.75 → pull 14-41 %. Production verification still needed: confirm the dial-scrub now reads as cluster-pinching motion.
- **Platform load-time deep-dive.** _Round 1 shipped — 2026-05-22 (PR #432); Round 2 shipped — 2026-05-24 (graph-data.ts split + TimeSeriesOverlay lazy)._ Remaining candidates: lazy-load AXIOM_LIBRARY behind a getter in `copilot-engine.ts` + `copilot-context.ts` (lower priority — SystemCopilot + TarskiPanel are both already lazy, so AXIOM_LIBRARY is off the initial-paint bundle; only shrinks the copilot chunk further); audit `TimeDial` (1207 LOC) for dynamic-loadability (it's visible on first paint though — would need a static placeholder); `framer-motion` tree-shake check; real `ANALYZE=true next build` run.
- **Time-dial-driven positional response (round 1).** _Shipped — 2026-05-22 (PR #427)._ 2D contraction now handles both cascade replay AND dial-scrub (historical-omega fallback); CONTRACTION 0.18 → 0.35 for visibility. 3D already had the historical-fallback path. Map relies on omega-scaled radius. Production verification queued above.
- **TOPO compute-shader port for real-time scrub perf.** Deferred since PR #303 (4σ truncation) covered the headline cost. Only worth doing if real-time scrub still drops frames in production.

---

## Session log

### 2026-05-27 — Shipped: @supabase/ssr deferred from HeaderBar + FeedbackWidget

**PR:** TBD — round 9, deferring the supabase auth chunk.

**Trigger.** After round 8, the only remaining eager critical-path components were `HeaderBar` (167 LOC) and `FeedbackWidget` (148 LOC). Both small in their own right but both eagerly pulled `@/lib/supabase/client` — which transitively imports `@supabase/ssr` (auth + cookie handling + browser/server client logic, several hundred KB unminified).

**Fix.**
- **HeaderBar.handleSignOut**: lazy-import `createClient` inside the callback. The sign-out flow is an explicit user click, so the extra microtask to dynamic-import the auth client is invisible.
- **FeedbackWidget mount effect**: lazy-import inside the existing `useEffect`. The email-lookup that populates the feedback form's "from" field happens once after mount; the cancellation guard handles fast unmount during the dynamic import. Submit-time fetch is unchanged (uses the `/api/feedback` endpoint, no client-side auth needed there).

**Verification.** vitest 1524/1524 pass. tsc clean.

**Final eager critical path.** `page.tsx` static imports: `useApexStore`, `protectGraphData` (95 LOC), `useFeedRegistry` (registry lazy-loads providers inside effect), `HeaderBar` (167), `StructuralMetrics` (90), `FeedbackWidget` (148). Everything else — including the 3000-LOC graph dataset, 1700-LOC tarski-data, 1311-LOC node-timeseries-map, 1207-LOC TimeDial, 987-LOC TimeSeriesOverlay, 842-LOC ModulePanel + transitive subpanels, 633-LOC NodeInspector, 594-LOC RiskPropagationFlow, 480-LOC domain-profiles, 446-LOC cascade-simulator, ~38KB feed-registry chain, and the `@supabase/ssr` chunk — loads on-demand behind a real user gate.

### 2026-05-27 — Shipped: RiskPropagationFlow + ModulePanel lazy

**PR:** TBD — round 8, deferring the two largest remaining eager components in `app/page.tsx`.

**Trigger.** After rounds 2-7 the eager-bundle had been cut substantially, but `RiskPropagationFlow` (594 LOC + framer-motion + the entire useFilteredGraph chain) and `ModulePanel` (842 LOC + DiscoveryRunsPanel 523 + community-detection 209 + discovery-uncertainty 106 + omega-engine 180 in the transitive chain) were still static-imported. Both render their main content only after a workspace is loaded:
- RiskPropagationFlow's risk cards strip is empty on an empty graph (the toggle bar shows but it's a collapsed-default thin row).
- ModulePanel's right pane sits behind the DomainSelector modal during workspace selection — the user can't even see it.

**Fix.** Both converted to `next/dynamic`. RiskPropagationFlow is gated on `hasGraph` in the render site (so the chunk only loads after the workspace launches). ModulePanel gets a column-shaped placeholder (320px wide, "LOADING MODULES…" header) so the layout doesn't jump when the chunk lands.

**Verification.** vitest 1524/1524 pass. tsc clean.

**State after round 8.** The only static-imported page-level components in `app/page.tsx` are `HeaderBar` (167), `StructuralMetrics` (90), and `FeedbackWidget` (148). Everything else is dynamic + gated on the right user trigger.

### 2026-05-27 — Shipped: DOMAIN_MAP split out of domains.ts

**PR:** TBD — round 7, single-file targeted win.

**Trigger.** Audit after #448 showed `useFilteredGraph` (which is called from EVERY critical-path component with a filtered-graph view — RiskPropagationFlow, StructuralMetrics, NodeInspector, ModulePanel, CausalDAG2D/3D/Map/Relief) imported `DOMAIN_MAP` from `@/lib/domains` — a 333-LOC file. The hook only needs the ~30-LOC lookup table itself; the rest is `DOMAIN_GROUPS` (170 LOC of card metadata + descriptions + icon names) and the `DOMAIN_TO_CARD` reverse-lookup.

**Fix.** New `src/lib/domain-map.ts` (~40 LOC) houses just the `DOMAIN_MAP` constant. `domains.ts` re-imports it and re-exports for backward compat. `useFilteredGraph` now imports from the lightweight file directly.

**Verification.** vitest 1524/1524 pass. tsc clean.

### 2026-05-27 — Shipped: node-timeseries-map + synthetic generator off eager bundle

**PR:** TBD — round 6 critical-path cleanup.

**Trigger.** Audit after #447 found two more transitive eager pulls hidden behind innocuous-looking imports:
1. `RiskPropagationFlow` (critical-path component) imports `getNodeDataDescription` from `@/lib/real-timeseries`. That helper just reads a constant map. But `real-timeseries.ts` (426 LOC) eagerly imports `NODE_TIMESERIES_MAP` from `node-timeseries-map.ts` — a 1311-LOC constant of timeseries source definitions. Net: ~1700 LOC of timeseries data rode into the critical-path bundle so RiskPropagationFlow could render the tiny 6px data-label badges.
2. `useTemporalGraph` (used by RiskPropagationFlow, ModulePanel, TimeDial — everywhere with a timeline cursor) imported `getNodeStateAt` / `getEdgeStateAt` / `getEventsInRange` from `@/lib/temporal-data`. Those are pure readers (~70 LOC total) but the file also contained `generateTemporalData` (~145 LOC of synthetic-data generation + 50 LOC of event templates). The eager bundle paid for the generator even though it's only invoked once per session inside the dynamic-loaded `initTemporalData`.

**Fix.**
- **RiskPropagationFlow lazy data-description.** Replaced the static `import { getNodeDataDescription }` with an effect-loaded state pattern: `useEffect(() => import("@/lib/real-timeseries").then((mod) => setGetNodeDataDescription(() => mod.getNodeDataDescription)), [])`. The render site uses `getNodeDataDescription?.(card.nodeId)` so the badges are absent until the chunk lands (~50-100ms). Visual impact is negligible — these are 6px caption badges between the domain name and the omega bar.
- **`temporal-state-helpers.ts` extracted.** New 130-LOC file housing the four reader functions plus the seven shared types (`TimeGranularity`, `TemporalEvent`, `NodeTemporalState`, `TemporalNodeData`, `EdgeTemporalState`, `TemporalEdgeData`, `TemporalDataset`). `temporal-data.ts` imports the types + the one helper it uses (`getNodeStateAt`) and re-exports the rest for backward compat. `useTemporalGraph` now imports from the lightweight file directly, so the eager bundle no longer pulls the synthetic generator.

**Verification.** vitest 1524/1524 pass. tsc clean.

### 2026-05-27 — Shipped: domain-profiles fully off eager bundle (module-tabs split + lazy resolveDomainProfile)

**PR:** TBD — final cleanup pass on the store + critical-path components.

**Trigger.** After round 4 (#446) the only meaningful eager dep left in `useApexStore` was `resolveDomainProfile` from `domain-profiles.ts` (480 LOC). `HeaderBar` and `ModulePanel` were also pulling the full file for tiny needs.

**Fix.**
- **`module-tabs.ts` extraction.** `HeaderBar` was importing `GEOPOLITICAL_PROFILE` from domain-profiles just to map four module-tab labels (the SPIRTES / TARSKI / PEARL / PARETO chips). Moved the 4-entry `ManifoldModule[]` array into a new `src/lib/module-tabs.ts` (~50 LOC) with no profile data. `domain-profiles.ts` re-imports the array as `GEOPOLITICAL_MODULES` so the GEOPOLITICAL_PROFILE.modules field stays in sync. HeaderBar now pulls only the lightweight constant.
- **`ModulePanel` t1d check.** Replaced `resolveDomainProfile(selectedDomains).id === "t1d"` (which required the full profile data) with `selectedDomains.some(id => id.startsWith("t1d-"))` — functionally equivalent for the "should we mount TissueCohortView?" gate, no profile resolution needed.
- **`useApexStore` co-load.** The store's four `resolveDomainProfile` call sites were all inside the deferred `loadRunTarskiValidation().then(...)` blocks from round 4. Replaced the standalone `loadRunTarskiValidation` helper with `loadTarskiHelpers()` that parallel-imports both `tarski-data` and `domain-profiles` via `Promise.all`. Single network round-trip, both modules cached after first verified-mode trigger. The eager `import { resolveDomainProfile }` is replaced with a zero-cost `import type { PillarKey }`.

**Verification.** vitest 1524/1524 pass. tsc clean.

**State after round 5.** The eager `useApexStore` import graph is now: zustand, tarski-flags (lightweight), omega-pillar-wiring (hot path), cross-domain-bridging (hot path), graph-color, and types. All the heavy modules (tarski-data, domain-profiles, temporal-data, real-timeseries, cascade-simulator, mergeGraphs, validateSnapshot, snapshots/tarski-validator) load on-demand.

### 2026-05-27 — Shipped: tarski-data 891-LOC AXIOM_LIBRARY off eager bundle + TimeDial lazy

**PR:** TBD — the big one. Extracts the heaviest remaining critical-path imports.

**Trigger.** After rounds 2 + 3 (#444, #445), the two largest remaining single-import deps on the eager bundle were:
1. `tarski-data.ts` (1727 LOC: 891-LOC AXIOM_LIBRARY + 800-LOC validation engine + helpers) — eagerly imported by `useApexStore` for `runTarskiValidation` + `applyTarskiFlags` + `clearTarskiFlags`.
2. `TimeDial` (1207 LOC) — eagerly imported by `app/page.tsx`; the largest single component on the critical path.

**Fix (tarski-data split).** Created `src/lib/tarski-flags.ts` housing the two pure graph transforms (`applyTarskiFlags`, `clearTarskiFlags`) and the `TarskiValidationReport` type — total 76 LOC, no AXIOM_LIBRARY reference. `tarski-data.ts` now re-exports these for any straggler import paths but no longer defines them locally. `useApexStore` imports the lightweight trio from `tarski-flags` eagerly, and dynamic-imports `runTarskiValidation` via a new `loadRunTarskiValidation()` helper. The four call sites (`runTarskiWithAxioms`, `setTruthFilter`, `applyFeedBatch`, `promoteAutoBridge`) were rewritten:
- `runTarskiWithAxioms` + `setTruthFilter("verified")` paths: simple `void load…().then((fn) => set(…))` wrapping — these are explicit user clicks, so the first-load ~50-100ms delay is acceptable.
- `applyFeedBatch` + `promoteAutoBridge`: split into two phases — phase 1 applies the mutation + omega adjustments synchronously (atomic non-tarski state update), phase 2 trails the tarski revalidation only if `truthFilter === "verified"`. Each phase-2 block checks `s.truthFilter` again at fire-time so a mid-flight toggle to "raw" doesn't apply stale flags. The verified-mode user has already triggered the load via `setTruthFilter` so the dynamic-import resolves from the ES-module cache (microtask hop only).

**Fix (TimeDial lazy).** Converted `TimeDial` to `dynamic(() => import("@/components/TimeDial"), { ssr: false, loading: <placeholder /> })`. The placeholder matches the dial's actual height (72px) and border style so the layout doesn't jump when the chunk lands. The dial is briefly unscrubbable (~50-100ms) but the canvas above is the user's first-paint focus and the dial sits at the bottom.

**Verification.** vitest 1524/1524 pass. tsc clean.

**Why this matters.** This was the single biggest remaining win — the tarski-data chunk alone is ~1700 LOC, the largest eager block left after rounds 2-3. Combined with TimeDial (1207 LOC) this round shaves ~2900 LOC off the initial-paint bundle. After this, the only eagerly-imported heavy components on `page.tsx` are HeaderBar (167), RiskPropagationFlow (594), ModulePanel (842 host + dynamic subpanels), StructuralMetrics (90), FeedbackWidget (148). The store's remaining eager deps are `applyOmegaLiveAdjustments` (220), `applyCrossDomainBridges` (305), `resolveDomainProfile` (480) — all hot-path, can't defer without UX cost.

**Trade-off.** verified-mode feed events now show one render of un-flagged graph state before the tarski validation lands (one microtask hop). For most users this is imperceptible; only power-users in verified mode + watching feed events closely would see it. Mitigated by the cached ES-module fast-path on second+ verified-mode trigger.

### 2026-05-27 — Shipped: temporal-data lazy + NewsInterpreterPanel lazy + NodeInspector lazy

**PR:** TBD — three more bundle-shape wins after #444 (load-time round 2) merged.

**Trigger.** With round 2 merged, the next set of high-leverage candidates were:
1. `useApexStore` still eagerly imported `generateTemporalData` (334 LOC, synthetic timeline fallback) and `loadRealTemporalData` (426 LOC, network fetcher) for `initTemporalData`. Both only fire after a workspace is loaded.
2. `ModulePanel` still statically imported `NewsInterpreterPanel` (~350 LOC) and `NodeInspector` (~630 LOC). Pareto is a non-default tab so NewsInterpreterPanel never renders on first paint. NodeInspector renders `null` inside `<AnimatePresence>` when no node is selected — also never visible on first paint.

**Fix.**
- Added `loadGenerateTemporalData()` and `loadLoadRealTemporalData()` helpers at the top of `useApexStore` (same pattern as the previous round's `loadSimulateCascadeAsync` / `loadMergeGraphs` / `loadValidateSnapshot`). `initTemporalData` now wraps both calls in `void load…().then((fn) => …)` chains. The early-out check (`if (state.temporalData) return`) was duplicated inside the synthetic-data `.then()` so a concurrent call during the chunk load doesn't double-set state.
- `NewsInterpreterPanel` → `dynamic(() => import("./NewsInterpreterPanel"), { ssr: false, loading: PANEL_LOADER })`. Renders behind the Pareto tab.
- `NodeInspector` → `dynamic(() => import("./NodeInspector"), { ssr: false })` plus `{selectedNode && <NodeInspector />}` gate at the render site. The component itself already returned `null` when `selectedNode` was empty via its internal `<AnimatePresence>{node && (<motion.div>...)}</AnimatePresence>`, so the parent gate is behaviour-preserving on first paint and only adds a ~50-100ms chunk load on the first node click. Subsequent clicks hit the chunk cache.

**Verification.** vitest 1524/1524 pass. tsc clean.

**Out of scope / next round.**
- `tarski-data.ts` (891 LOC of AXIOM_LIBRARY + 800 LOC of validation logic) is still eagerly imported by `useApexStore`. It's used in 5 store action paths but conditionally — only when `truthFilter === "verified"`. Converting to dynamic-import would require restructuring the sync `set((s) => …)` updaters into `loadTarski().then((helpers) => set(…))` chains for all 5. Doable but invasive; the `applyFeedBatch` case in particular currently combines tarski work with omega-pillar work in a single atomic update, so the refactor would break that atomicity (the user might see a brief flicker of unflagged graph before the tarski flags land).
- `applyOmegaLiveAdjustments` (220 LOC) and `applyCrossDomainBridges` (305 LOC) are hot-path — every graph mutation calls them. Same fire-and-forget refactor would degrade UX visibly. Leave eager.
- `domain-profiles.ts` (480 LOC) is mostly profile-data constants used everywhere. Splitting wouldn't help.

### 2026-05-24 — Shipped: EngineProvider future-stubs stripped + mergeGraphs/validateSnapshot deferred

**PR:** TBD — `perf(bundle)`: more critical-path cleanup chasing the load-time backlog.

**Trigger.** With cascade-simulator dynamic-imported inside `useApexStore`'s replay handlers (entry above), I expected the simulator chunk to be fully off the eager bundle. It wasn't — `LocalProvider` (constructed via `getEngineProvider()` in the eagerly-imported `ModulePanel`) still statically imported `simulateCascade` (sync), `validateSnapshot`, and `solveInterdiction` to satisfy its `EngineProvider` interface. None of those methods has any caller in the live codebase: they're future-stubs anticipating a remote backend. Together they were dragging cascade-simulator (446) + tarski-validator (204) + interdiction-engine (443) ≈ 1100 LOC of transitive code into the initial-paint bundle for zero benefit.

**Fix (interface cleanup).** Stripped four unused methods from `EngineProvider`: `computeCounterfactual`, `validateSnapshot`, `solveInterdiction`, `computeDoomsday`. Trimmed `LocalProvider` to match — only `discoverStructure` (used by `ModulePanel`) and `scanTailRisk` (used by `ParetoPanel`) remain. The comment block in `engine-interface.ts` explains the YAGNI call so a future remote-provider author knows the methods can grow back with proper async signatures when there's an actual caller.

**Fix (store deferrals).** Two more store-internal helpers moved to dynamic imports following the same pattern as the cascade-sim refactor:
- `mergeGraphData` action: `mergeGraphs` (71 LOC) is dynamic-imported via `loadMergeGraphs()` inside the action body. Only called when the user imports a dataset via the lazy-loaded ImportModal.
- `setSnapshot` action: `validateSnapshot` (204 LOC) is dynamic-imported via `loadValidateSnapshot()`. Only called when the user saves a snapshot via the lazy-loaded SystemCopilot. Both call sites kept the original `set((s) => …)` updater pattern, just wrapped in a `void load…().then((fn) => set(…))` so the API surface is unchanged from callers' perspective (still fire-and-forget).

**Verification.** vitest 1524/1524 pass. tsc clean on the touched files. No interface contract breakage — the only EngineProvider call sites in the codebase (`engine.discoverStructure`, `engine.scanTailRisk`) still typecheck.

**Why this matters.** ~1400 LOC of transitive eager-bundle imports are now either deferred (mergeGraphs / validateSnapshot dynamic) or eliminated entirely (engine future-stubs). Combined with the previous round-2 commits the critical-path bundle has shed roughly 6500 LOC of code that used to ride along on every first paint.

### 2026-05-24 — Shipped: cascade-simulator dynamic + buildRiskCards extracted + estimators barrel bypass

**PR:** TBD — three small bundle-shape wins on the critical path.

**Trigger.** After the graph-color split + TimeSeriesOverlay lazy + useFeedRegistry lazy (commits above), `useApexStore` and the two eager components `RiskPropagationFlow` / `StructuralMetrics` were the remaining suspects on the critical path. A targeted import audit found three more leverage points:

**Fix.**
- **`cascade-simulator` lazy in the store.** `useApexStore` eagerly imported `simulateCascade` (sync — unused dead import) and `simulateCascadeAsync` (used in three fire-and-forget replay actions). Removed the dead import; added a `loadSimulateCascadeAsync()` helper at the top of the store that dynamic-imports the module; rewrote the three call sites to `void loadSimulateCascadeAsync().then((sim) => sim(…).then(epochs => …))`. Net: 446 LOC of cascade-sim code is deferred until the user clicks REPLAY.
- **`buildRiskCards` extracted to its own file.** The function is pure (takes a graph + shocks, returns top-6 risk cards) but lived in `graph-data.ts`, which transitively dragged the 3000-line dataset into `RiskPropagationFlow` (on the critical path). Created `src/lib/risk-cards.ts` (27 LOC) housing just the function; `RiskPropagationFlow` now imports from there. `graph-data.ts` no longer needs the `CausalShock` / `RiskPropagationCard` type imports either.
- **Estimators barrel bypass in `StructuralMetrics`.** `import { omegaBridgeDensity } from "@/lib/estimators"` was hitting the index file, which re-exports from 9 estimator modules (~2500 LOC of math: bocpd, chi-star, cvar-w1, lppls-fit, moran, nlme, ph-fit, transfer-entropy, persistent-homology). Webpack's barrel-file tree-shaking is unreliable when modules have side effects, so the safe fix is the direct path: `import { omegaBridgeDensity } from "@/lib/estimators/omega-bridge-density"` (76 LOC leaf).

**Verification.** vitest 1524/1524 pass. `tsc --noEmit` clean across all five touched files (the pre-existing 71 "Cannot find module 'react'" + missing-`ai`-SDK errors are sandbox env issues, unchanged by this round).

**Why this matters.** `useApexStore` is imported by every page surface. Shedding the cascade-sim chunk from its eager-import graph means the simulator never loads for users who don't click REPLAY. `RiskPropagationFlow` and `StructuralMetrics` are both eagerly visible on first paint; bypassing the indirect dataset / barrel imports keeps them on tiny dep graphs.

### 2026-05-24 — Shipped: feed-registry chain dynamic-imported inside useFeedRegistry

**PR:** TBD — `perf(bundle)`: dynamic-import `@/lib/feeds/registry` from inside the `useFeedRegistry` effect, so the 10-provider chain (~38KB) stays off the initial-paint bundle until a graph is loaded.

**Trigger.** `useFeedRegistry()` is called in `app/page.tsx`'s `Home` component — top of the critical path. The hook already gated on `hasGraph` (no polling until a workspace is launched) so the providers themselves were dormant on first paint, but the static `import { FEED_PROVIDERS } from "@/lib/feeds/registry"` still pulled all 10 provider modules (clinical-trials, derivations, eia-hormuz, eia-saudi-crude, fred, noaa-storms, ofac-sdn, openfda, world-bank, types) into the eager bundle. Roughly 38KB pre-minification.

**Fix.** Moved the registry import into a dynamic `import("@/lib/feeds/registry").then(({ FEED_PROVIDERS }) => …)` inside the effect, after the `hasGraph` gate. The effect cleanup now tracks both:
- `cancelled` flag — set in cleanup, checked after the dynamic import resolves, so we don't start polling a stale registry copy after a fast unmount/remount.
- `cleanupFns` array — built up inside the `.then()` callback, drained on cleanup.

The empty-graph case (first paint, no workspace) never triggers the dynamic import at all, so the chunk only loads after the user picks domains and clicks LAUNCH WORKSPACE.

**Why this matters.** Combined with the round-2 splits above, the feed providers were the last large eager block in the critical-path bundle. After this, the only eagerly-loaded heavy-ish modules left are `useApexStore` itself (~1290 LOC) and the four eager UI components that mount on first paint (HeaderBar 167, RiskPropagationFlow 594, ModulePanel 842, TimeDial 1207, plus StructuralMetrics 90 and FeedbackWidget 148). Everything else is either dynamic, gated, or lazy.

**Out of scope.** `useApexStore` itself still eagerly imports a long list of helpers (`omega-pillar-wiring`, `cross-domain-bridging`, `tarski-data`'s validation entry points, `temporal-data`, `real-timeseries`, `cascade-simulator`, `snapshots/tarski-validator`). Splitting any of these would require routing them through async-action paths in the store, which is invasive. Punt to a future round once we have real bundle-analyzer numbers.

### 2026-05-24 — Shipped: load-time round 2 — graph-data split + TimeSeriesOverlay deferred

**PR:** TBD — `perf(bundle)`: split `graph-data.ts` (3413 → 3357 LOC) into a lightweight `graph-color.ts` for the four color/empty-graph helpers; lazy-load `TimeSeriesOverlay` (987 LOC) gated on pinned-series presence.

**Trigger.** Round 1 of the load-time deep-dive (PR #432) lazy-loaded the SystemCopilot column and the heavy copilot-tool deps. The next leverage point: `src/lib/graph-data.ts` is a 3413-line file (mostly the NODES / EDGES arrays) but 13 of its 17 consumers only import tiny helpers like `getCategoryColor` / `getDomainColor` / `getCategoryLabel` / `EMPTY_GRAPH`. They were each dragging the whole dataset into their chunks. `useApexStore` was a critical-path importer (every page imports the store) and was using just `EMPTY_GRAPH`.

**Fix.**
- New `src/lib/graph-color.ts` houses `getCategoryColor`, `getCategoryLabel`, `getDomainColor`, and `EMPTY_GRAPH` (a tiny pure-constant CausalGraph placeholder). `graph-data.ts` still re-exports these for any straggler import paths but no longer defines them.
- Rewired 12 color-only consumers (`useApexStore`, `CausalDAG2D`, `CausalDAGMap`, `NodeInspector`, `TarskiPanel`, `ParetoPanel`, `DcdGraph`, `PcmciGraph`, `FciGraph`, `DAGOverlay`, `DAGNode3D`, `TimeSeriesOverlay`, `ClientHeaderBar`) to import from `graph-color` directly.
- `RiskPropagationFlow` split its mixed import (`getDomainColor` → `graph-color`; `buildRiskCards` stays in `graph-data` since it lives next to the dataset).
- `CausalDAG3D` (`getNodeDomainMap` needs NODES) and `app/client/page.tsx` + `build-domain-graph.ts` (use `MAIN_GRAPH`) keep importing from `graph-data`. All three were already on lazy paths.
- `TimeSeriesOverlay` (987 LOC, returns `null` when `pinnedTimeSeriesNodes` is empty) is now `dynamic(() => import("@/components/TimeSeriesOverlay"), { ssr: false })` and the render site is gated on `pinnedTimeSeriesNodes.length > 0`. Initial paint never has pins (store inits to `[]`), so the chunk is deferred until the user explicitly pins a series.

**Why this matters.** Critical-path bundle drops the `graph-data.ts` dataset and the `TimeSeriesOverlay` body. `useApexStore` is imported by every page surface; carving its `EMPTY_GRAPH` dependency over to a 75-LOC file means the 3000-line dataset only loads when something actually needs `MAIN_GRAPH` (`/client` route, `build-domain-graph`, or `CausalDAG3D` — all lazy).

**Verification.** `tsc --noEmit` clean on all touched files (only pre-existing errors in unrelated `*.test.ts` fixtures and missing `ai`/`@ai-sdk/*` modules remain). Vitest 1524/1524 pass. `next build` not runnable in this sandbox (no Google Fonts fetch + missing ai SDK packages) so production verification is deferred.

**Out of scope.** AXIOM_LIBRARY in `copilot-engine.ts` / `copilot-context.ts` would be the next obvious lazy-load, but SystemCopilot is already a `dynamic` chunk (PR #432) and TarskiPanel is a `dynamic` chunk (PR #406), so AXIOM_LIBRARY is already off the initial-paint bundle. Further deferral inside the copilot chunk is lower priority.

### 2026-05-02 — Issue #2 fix shipped: temporalData invariant on graph swap

**PR:** [#156 — fix(timeseries): refresh temporalData + prune ghost pins on graph swap](https://github.com/ApexAnalytica/apex-terminal/pull/156) — merged `20c3389`.

**Problem.** `TimeSeriesOverlay`'s "NO DATA" badge fires when a pinned node id exists in `graphData.nodes` but is missing from `temporalData.nodes`. `setGraphData` already cleared `temporalData` and re-fired `initTemporalData()` on swap, but `mergeGraphData`, `addSandboxGraph`, `switchSandboxGraph`, `deleteSandboxGraph`, and `removeImportedDataset` all changed the graph node id set without honoring that invariant. Imports and sandbox swaps left stale temporal data and ghost pins around.

**Fix.** Added `prunePinsToGraph` helper in `useApexStore.ts` and routed every graph-mutating action through the same `temporalData: null` + pin-prune + `initTemporalData()` path. Helper returns the same array reference when nothing changes so subscribers don't re-render.

**Verification.** `tsc --noEmit` clean; vitest 330/330 pass. Visual verification deferred to prod (manifold.apexanalytica.co) since the change is a store-level invariant with no canvas surface change.

**Out of scope.** Diagnosing whether the original "NO DATA" reports were also driven by the engine-side `loadRealTemporalData` producer (Pass 2 1-point fallback) was punted — the Explore agent's earlier read of `real-timeseries.ts:317–318` was misled by a stale comment; current rendering at `TimeSeriesOverlay.tsx:151–154` does render 1-point histories as flat lines with a "STATIC" badge. So "STATIC" is working as designed; only the "NO DATA" path was the bug, and it's mine.

### 2026-05-02 — Shipped: 2D Obsidian-style layout v1

**PR:** [#159 — feat(2d): Obsidian-style force layout, hover emphasis, drag perturb, focus](https://github.com/ApexAnalytica/apex-terminal/pull/159) — merged `38c56bd`.

**What shipped.** `CausalDAG2D.tsx`'s deterministic id-hash grid is replaced with a 2D force-directed canvas. v1 covers all four interactions in one shot:
- Force-directed layout via `d3-force-3d` at `nDim=2`, cached on graph signature (sorted node + edge id sets) — filter / isolation / replay never trigger a re-layout.
- Drag-to-perturb: pin the node (`fx`/`fy`), reheat alpha, tick via rAF, unpin on drop, alpha decays naturally.
- Hover emphasizes the node + 1-hop neighbors; everything else dims to opacity 0.18 with a 180ms ease. Edges out of scope drop to opacity 0.1.
- Click-to-focus is tied to the existing `selectedNode` store value, so the inspector flow is unchanged. Hover takes precedence over click.

**Files.**
- `src/lib/graph-layout-2d.ts` (new) — `compute2DForceLayout` (one-shot offline) + `create2DLiveSimulation` (live handle: `tick`, `pin`, `unpin`, `reheat`, `cool`, `positions`) + `graphSignature`.
- `src/components/CausalDAG2D.tsx` — id-hash grid replaced; hover/focus state; rAF loop pushes live positions during drag; emphasis flows through `node.data.emphasis` → opacity in `CausalNode2D`; edges dim when out of emphasis scope. Preserved: hand-rolled shift+drag marquee (was already on main as #157/#158-era work), isolation filter, refit-on-visible-set, replay contraction (now applied as offset over dynamic positions).

**Verification.** `tsc --noEmit` clean; lint clean on changed files; vitest 511/511 pass. Visual smoke test in the sandbox dev server was blocked (`critters` + Supabase env vars not configured locally) — visual sign-off happens on the Vercel preview / production deploy.

**Rebase note.** Branch had to rebase onto main to drop the duplicate `bda9da6` commit (squashed into `20c3389` via #156) and resolve a JSX conflict with main's hand-rolled shift+drag marquee (`flowWrapperRef` + `selectionRect` overlay + `selectionKeyCode={null}`). The marquee is preserved end-to-end; my new hover/drag handlers slot in alongside it.

### 2026-05-02 — Visual refinement v1.1: rectangular boxes → Obsidian-style circles

**Trigger.** Live-prod feedback: layout was force-directed correctly, but the **node visuals** were still the rich rectangular info-cards (`CausalNode2D`'s box with category fill, label, domain, ΩF, glow border). User wanted the actual Obsidian "little circles in a network" aesthetic — picked Option 2 (circles with ΩF visible) over Option 1 (pure circles).

**Change scope.**
- `CausalNode2D` rewritten as a circular node. Diameter scales with ΩF (`14 + clamp(omega, 0..10) * 2`) so high-risk nodes are visually larger. Layered box-shadow: selection ring (sharp 2px cyan + soft halo) + shock pulse + base ΩF glow. Fracture / stressed / shock animations preserved (now scale-pulse on the circle instead of border-color flash on a box). `RESTRICTED` becomes a 1px red circle border instead of inline text.
- ΩF value + label rendered as small text, absolutely positioned below the circle so the React Flow node bounding box stays circle-sized (edges anchor at circle edges, not at the label). Label colors cyan when focused/selected, gray otherwise; hidden into opacity 0.18 with the rest of the node when out of emphasis scope.
- `graph-layout-2d.ts` re-tuned for the smaller footprint: `NODE_COLLISION_R` 78 → 48; link distance `110 + (1-w)*140` → `65 + (1-w)*100`; charge connected `-900` → `-550`, isolated `-250` → `-150`. Mild label overlap is acceptable for the Obsidian-style density; circles themselves don't touch.

**Files touched.** `src/components/CausalDAG2D.tsx` (CausalNode2D body), `src/lib/graph-layout-2d.ts` (collision + link + charge tuning). All hover/focus/drag/marquee/refit/isolation behavior from #159 preserved unchanged.

**Verification.** `tsc --noEmit` clean; lint clean on changed files; vitest 511/511 pass. Visual sign-off on Vercel preview.

### 2026-05-02 — Housekeeping: stop tracking the auto-generated test suite HTML

`APEX-Terminal-Test-Suite.html` is regenerated on every `vitest run` by the custom HTML reporter at `src/lib/__tests__/html-reporter.ts`. The only diff between runs is the timestamp on the cover, so committing it created noise on every PR and tripped the stop-hook git-clean check repeatedly during this session. Untracked via `git rm --cached` and added to `.gitignore`. Anyone who wants the report runs `npx vitest run` locally — it generates fresh.

### 2026-05-02 — Issue #1: 3D Sugiyama-style rank layout (replaces force-directed)

**Problem.** The 3D view's previous force-directed layout normalized to fixed bounds (`{ x: 55, y: 40, z: 35 }`) regardless of node count. A 30-node graph and a 167-node graph occupied the same volume → dense graphs visually clustered, no causal-flow direction was readable, and the camera had nothing to "stretch" against on bigger graphs.

**Fix.** Replaced `computeLayout3D` in `src/lib/graph-layout.ts` with a Sugiyama-style rank layout:

1. **Rank assignment** via Kahn's topological sort with longest-path propagation. Sources land at rank 0; each successor's rank is `max(parent rank) + 1`. Cycle nodes (rare in causal DAGs but possible in inferred ones) stay at rank 0.
2. **Barycenter ordering** across ranks — two passes of down-sweep (predecessors define each rank's order) + up-sweep (successors). Crossings drop without needing the full per-rank median heuristic.
3. **Coordinate assignment** with N-scaled bounds: `xSpan = max(60, sqrt(N) * 9)`, `ySpan = max(45, sqrt(N) * 6.5)`. Sources at top, sinks at bottom — causal flow reads top-down in the camera's default tilt.
4. **Z stratified** by `DOMAIN_Z_OFFSETS` × 6 with a small id-hash jitter so co-domain nodes don't z-fight.

`computeFitCamera` in `CausalDAG3D.tsx` already auto-pulls back proportional to the bounding-box extent, so dense graphs naturally fill more screen space without any camera changes needed.

**Files touched.** `src/lib/graph-layout.ts` only. `computeNetworkMetrics` unchanged. `DOMAIN_Z_OFFSETS` kept exported. d3-force-3d imports + `LayoutNode`/`LayoutLink` interfaces removed (the new layout is purely combinatorial).

**Verification.** `tsc --noEmit` clean; lint clean on changed file; vitest 522/522 pass.

### 2026-05-02 — Reverted: 3D Sugiyama rank layout

**Reverted #168 on user request.** The strict rank layout read too rigid/grid-like in production — user preferred the previous force-directed look. `src/lib/graph-layout.ts` restored to the pre-#168 state (force-directed simulation, fixed bounds normalization). Latent `any`-cast lint errors that lived on main pre-#168 fixed with the same `AnySim` type-cast pattern used in `graph-layout-2d.ts` while the file was open. 2D circle layout from #166 is unchanged.

**Lesson.** Sugiyama gives a clean causal-flow read but loses the organic/spatial feel of force-directed. If we revisit 3D layout later, the right approach is probably force-directed seeding + a light rank-influence pass (use rank as a soft y-bias on top of free force layout), not a strict rank assignment.

### 2026-05-02 — Map view orb fixes (orbs on lines, constant speed)

**Two bugs in `CausalDAGMap.tsx`** from prod feedback:

1. **Orbs floating off the lines.** Edge lines were stored as `[source, controlPoint, target]` — three points which MapLibre renders as a kinked 2-segment polyline through the control point. Particles, however, used those same 3 points as a quadratic **bezier** where the control point is *off* the curve. The bezier path bulged away from the kinked line, so orbs visually floated above the edges they were supposed to trace.
2. **Speed varied with edge length.** `phase += 0.003` per frame for every edge regardless of length, so all particles completed traversal in the same number of frames. Long edges felt fast, short edges felt sluggish.

**Fixes** (single file: `src/components/CausalDAGMap.tsx`):
- **Sample the bezier into 25 polyline points** when building each edge's `LineString`. MapLibre now renders a near-smooth curve, and the line geometry IS the particle path — they can't drift apart.
- **Cumulative arc length** per polyline so the particle can interpolate by distance (not by raw vertex index, which would skew through curvature).
- **Constant degrees-per-frame** velocity (`SPEED_DEG_PER_FRAME = 0.05` ≈ 36 px/s at zoom 2). Per-edge `dPhase = SPEED / totalLen` keeps the phase fraction in `[0, 1]` while absolute speed is constant.
- While in the file, fixed a pre-existing `set-state-in-effect` lint violation by moving the empty-features clear into the rAF callback (instead of the effect body) and stopping the rAF loop when there are no temporal edges.

**Verification.** `tsc --noEmit` clean; lint clean on changed file; vitest 522/522 pass.

### 2026-05-02 — Perf sweep across canvas surfaces (#72 playbook leftovers)

Audit found four spots where the #72 playbook patterns hadn't been fully applied. All low-risk swaps; no behavior change.

1. **`CausalDAG2D.tsx:302–313`** — full-store destructure (`const { truthFilter, replayActive, currentEpoch, ... } = useApexStore()`) replaced with eight per-field selectors. The destructure re-rendered the entire 2D component on every store mutation including timeline scrub ticks (`currentEpoch` / `timelinePosition`) — even when those fields were irrelevant to the rendered output.
2. **`dag3d/DAGOverlay.tsx`** — added a memoized `nodeById` Map and replaced three `activeGraph.nodes.find(...)` calls (one in `selectedNodes.map()`, two in the ANALYZE-SELECTION button handler). With 20+ selected nodes the previous code was O(N²); now O(1) per lookup.
3. **`CausalDAG3D.tsx:907–912`** — edge inspector label resolution switched from `graphData.nodes.find(...)` to the existing `nodeById` Map. Same lookup used elsewhere in the file; no reason to re-walk the array per render.
4. **`CausalDAG3D.tsx:573` (new)** — added a memoized `edgeById` Map alongside `nodeById`. `greyedOutNodes` now resolves severed edges via `edgeById.get(edgeId)` instead of `graphData.edges.find(...)` per cut.

**Verification.** `tsc --noEmit` clean; lint clean on changed files; vitest 537/537 pass. (Three pre-existing lint errors at `CausalDAG3D.tsx:86, 91, 306` are unrelated — `posMapRef.current = ...` in render, an `any` cast, and `performance.now()` in `useRef` initializer. Out of scope for this sweep.)

### 2026-05-02 — Cleanup: pre-existing lint errors in CausalDAG3D

Cleared the three pre-existing lint errors flagged in the perf-sweep audit (PR #185 noted them as out of scope):

1. **`react-hooks/refs` at `:86`** — `posMapRef.current = posMap` in render body. Moved into a `useEffect(() => { posMapRef.current = posMap; }, [posMap])`. Render function is now pure; the effect runs after every render so the ref still tracks the latest `posMap` for downstream effects to read.
2. **`@typescript-eslint/no-explicit-any` at `:91`** — `useRef<any>(null)` for the OrbitControls handle. Typed it as `React.ComponentRef<typeof OrbitControls> | null`, which derives the imperative-handle type directly from the drei component without a separate import.
3. **`react-hooks/purity` at `:306`** — `useRef(performance.now())` in `FrameMonitor`. Initialized to `0` and set on mount in a `useEffect`. The `useFrame` callback overwrites it on the first rendered frame, so the `0` value is observed for at most one tick.

Also cleared two warnings while the file was open: removed the unused `NodeMetrics` import and the unused `HOME_POS` constant. The remaining `set-state-in-effect` error at the camera-animation `setControlsEnabled(false)` call (line ~161) was suppressed with a single targeted `eslint-disable-next-line` + rationale comment — it's legitimate event-driven external-system sync (toggle OrbitControls during scripted camera animations) and the cascading render is bounded by the `prevSelectionKey` guard. Refactoring it into ref-based imperative mutation would have been higher risk for the animation pipeline.

**Verification.** `tsc --noEmit` clean; lint clean on `CausalDAG3D.tsx`; vitest 567/567 pass.

### 2026-05-03 — 2D canvas perf pass: adjacency-indexed contraction

**PR:** [#198 — perf(2d): adjacency-indexed contraction + nodeById/edgeById lookups](https://github.com/ApexAnalytica/apex-terminal/pull/198) — merged `f8b3440`.

**Trigger.** User picked option #1 from a three-way split (profile 2D canvas / audit 3D scene / batch map orbs). Goal: identify and fix the highest-ROI perf issues on the most-recently-rebuilt surface before the 2D Obsidian layout starts feeling its weight on dense graphs.

**Hot spots found.**
1. **`CausalDAG2D.tsx:428–438` — replay contraction was O(N×E) per tick.** The inner contraction loop walked all of `graphData.edges` for every node in the `nodes` useMemo. That useMemo rebuilds on every `currentSnapshot` change (i.e. every replay tick at ~30 Hz). On a 100-node / 200-edge graph that's 20K iters per tick, ~600K ops/sec sustained during replay.
2. **`CausalDAG2D.tsx:404–407` — hover-emphasis neighbor lookup also walked `graphData.edges`** linearly on every hover. Same fix shape as (1).
3. **`graphSignature` recomputed on every render** (`CausalDAG2D.tsx:341`) — sort+join over node+edge id sets. Cheap individually, but runs on hover, drag, replay tick.
4. **`O(N)` / `O(E)` `find()` calls** in `onEdgeClick` and the `selectedSourceLabel` / `selectedTargetLabel` resolution.

**Fixes.**
- New memos: `nodeById`, `edgeById`, `adjacency` (`Map<id, neighborId[]>`), all keyed on the corresponding `graphData.nodes` / `graphData.edges` ref.
- Replay contraction now walks `adjacency.get(n.id)` — O(degree) per shocked node instead of O(E). Per-tick cost scales with edge count, not (nodes × edges).
- `emphasisMap` neighbor lookup reuses the same adjacency map.
- `graphSignature` wrapped in `useMemo` against the same node/edge refs.
- `onEdgeClick` uses `edgeById.get(rfEdge.id)`; label resolution uses `nodeById.get(...)`.

**Out of scope (deliberately).** The `edges` useMemo (`:478–541`) still rebuilds on every hover because `emphasisTarget` is in its deps — that's structural to React Flow's prop-diff model. Splitting structural edge data from emphasis-derived style would need a custom edge component subscribing to `emphasisTarget` separately. Filed as a follow-up if dense-graph hover starts feeling heavy.

**Files touched.** `src/components/CausalDAG2D.tsx` (+59 −31).

**Verification.** `tsc --noEmit` clean; lint clean on changed file; vitest 600/600 pass. No behavior change — just lookup-shape refactoring.

### 2026-05-03 — 3D scene audit: selection Sets + scrub-stable disconnected check

**PR:** [#199 — perf(3d): selection Sets in render loop + scrub-stable disconnected check](https://github.com/ApexAnalytica/apex-terminal/pull/199) — merged `febc761`.

**Trigger.** Continued the perf sweep with item #2 of the original three-way split (3D scene audit).

**Hot spots found.**
1. **Render loop `.includes()` checks were O(M) per node and per edge.** `CausalDAG3D.tsx` at `:996, :1000, :1017, :1051, :1089` calls `multiSelectedNodes.includes(...)` / `ablatedNodeIds.includes(...)` / `ablatedEdgeIds.includes(...)` inside the per-node and per-edge maps. With 50 selections on a 200-node graph that's ~20K ops per re-render across all four call sites.
2. **`disconnectedNodes` was scrub-thrashing.** Memoed on the full `graphData` ref, so a V+E BFS re-ran on every replay tick — but connectivity is purely structural and scrubbing only bumps temporal omega. Same cost as `positions` rebuild every tick, just for the connected-component check.
3. **Five separate invalidator effects** in `StoreInvalidator` (`:367–371`) — each `useEffect` has a one-element dep list, all calling `invalidate()`.

**Fixes.**
- New memos: `multiSelectedSet`, `ablatedNodeSet`, `ablatedEdgeSet`. Render-loop call sites switched to `.has()`. Same shape as the existing `selectedEdgeIds` / `selectedNeighborNodes` / `disconnectedNodes` Sets used elsewhere in the file.
- `disconnectedNodes` re-keyed on `topologyKey + severedEdges` and reads graph data via `graphDataForLayoutRef` — same scrub-stable pattern as `positions` and `networkMetrics`.
- Five invalidator effects collapsed to one with combined deps. Behaviorally identical (React fires on any-dep change), just less noise.

**Out of scope (deliberately).**
- The blanket `onPointerMove` invalidate on the Canvas (`:983`) — broad firehose on every pointer move, but it's the safety net for hover-driven node lighting under `frameloop="demand"`. Touching it risks visible regressions on hover. Filed as follow-up if a benchmark shows it as a real cost.
- `downstreamNodes` / `greyedOutNodes` BFS still iterates `graphData.edges` linearly. Only fires on intervention click; not hot.

**Files touched.** `src/components/CausalDAG3D.tsx` (+45 −18).

**Verification.** `tsc --noEmit` clean; lint clean on changed file; vitest 622/622 pass.

### 2026-05-03 — Map orb "batching" was already live

User asked about map orb batching (item #3 of the original perf split). Audit of `CausalDAGMap.tsx` confirms the orbs are already optimally batched: every rAF tick builds a single `FeatureCollection` containing all particles for all temporal edges and calls `setParticleGeoJSON(...)` once; the map renders all of them through a single `<Source id="particles" type="geojson">` with two layers (`particle-glow`, `particle-dots`). One buffer upload per frame regardless of edge count. No work to do under the "batching" framing.

Remaining map-view perf opportunity if ever needed: the per-frame particle update goes through React (`setParticleGeoJSON` → re-render → react-map-gl diffs → `setData`). Cutting React out of the per-frame loop and hitting `map.getSource('particles').setData(...)` imperatively would skip ~60 React renders/sec when temporal edges are visible. Not "batching" — different fix; not pursued this round.

### 2026-05-03 — Shipped: 4th view mode "Relief" — topographic criticality heightfield

**PR:** [#204 — feat(relief): 4th view mode — topographic criticality heightfield](https://github.com/ApexAnalytica/apex-terminal/pull/204) — merged `fe80279`. (Backfilled here — the original PR's doc update only carried the PR #199 entry through.)

**Trigger.** User asked for a 4th display method as a topological heatmap with peaks where criticality is higher, and asked how multilayer (per-domain) overlapping topo maps would look in the same format.

**What shipped (v1).** Single-domain Relief view: takes the existing 2D force layout, treats each node as a Gaussian source with weight = ΩF composite, evaluates the field on an 80×80 grid, renders as an r3f heightfield mesh with elevation-driven color ramp (deep blue → cyan → amber → red). Same 2D layout drives all four views, so peaks land exactly where nodes sit on the 2D canvas — view switching feels coherent.

**Files.**
- `src/lib/graph-relief-field.ts` (new) — `computeReliefField(nodes, layout)` returns interleaved Float32 buffers (positions, colors, indices) ready for `THREE.BufferGeometry`. Two-pass: evaluate field (per-vertex Gaussian sum), then write vertex buffers + per-vertex colors via the elevation ramp.
- `src/components/CausalDAGRelief.tsx` (new) — r3f Canvas + mesh + ambient/directional/2 colored point lights, OrbitControls capped at the horizon (`maxPolarAngle ≈ π/2`) so users can't flip under the terrain. One-shot camera framing on first non-empty field; manual orbit preserved across graph swaps.
- `src/lib/types.ts` — adds `"relief"` to `ViewMode`.
- `src/app/page.tsx` — dynamic import (separate chunk), conditional mount under `viewMode === "relief"`.
- `src/components/dag3d/DAGOverlay.tsx` — RELIEF added to the view-switcher buttons; rendering badge shows WEBGL_RELIEF.

**Cost.** Field evaluation is ~30ms on 100 nodes (6,400 cells × 100 samples × `exp()`). Memoized on graph identity, so hover / scrub / orbit / selection don't trigger recompute.

**Verification.** `tsc --noEmit` clean; lint clean on touched files; vitest 622/622 pass.

### 2026-05-03 — Shipped: Relief multilayer — per-domain additive stacks

**PR:** TBD (about to open after this entry).

**Trigger.** Direct follow-up to PR #204 — the user's original feature request explicitly asked about multilayer ("multiple color overlaps topologizal maps"). v1 was single-domain elevation ramp; v2 is per-domain additive stacks.

**What shipped.**
- `computeReliefLayers(nodes, layout, params?)` in `graph-relief-field.ts` — groups nodes by `node.domain`, evaluates each domain's Gaussian field over a **shared world-space grid** (global bounds across all nodes; bandwidth/sigma identical per layer). Each layer's vertex colors are pre-tinted by `getDomainColor(domain) × pow(norm, 1.5)` so valleys go to black (additive zero) and peaks saturate at the domain color. Triangle indices are shared across layers — same buffer reference, no duplication.
- New `<ReliefLayerMesh>` in `CausalDAGRelief.tsx` uses `meshBasicMaterial` + `THREE.AdditiveBlending` + `depthWrite: false` + `toneMapped: false`. Lighting is intentionally bypassed — domain colors must be unambiguous, not normal-modulated. Where two domain peaks coincide spatially, GPU adds the tints (red + cyan = magenta) — exactly the "color overlap" reading the user asked for.
- Auto-mode-switch: 1 unique domain → original single-mesh elevation ramp (preserves v1 read for single-vertical graphs); ≥2 unique domains → multilayer. No new toggle to learn.
- `<DomainLegend>` overlay in the top-left when multilayer is active: bullet + domain name + node count, sorted by peak descending.

**Design decisions captured.**
- *Shared layout vs per-domain layout.* Shared. Peaks across layers line up by node, so an overlap reads as "this region is critical across multiple domains" — analytically meaningful. Per-domain layouts would read as separate continents — visually pretty, analytically useless. Rejected.
- *Additive vs alpha-blended.* Additive. Order-independent on GPU; color mixing emerges naturally; valleys disappear without depth-sorting headaches.
- *Shared triangle index buffer.* All layers share one `Uint32Array` index buffer reference — N×N grids with identical topology. Saves N² × 6 × 4 bytes per extra layer.

**Files.**
- `src/lib/graph-relief-field.ts` — new export `computeReliefLayers` + `ReliefLayer` type + `hexToLinearRGB` helper. Existing `computeReliefField` unchanged for the single-domain path.
- `src/components/CausalDAGRelief.tsx` — multilayer branch with `<ReliefLayerMesh>`, legend overlay, mode-switch driven by unique-domain count.
- `src/lib/__tests__/graph-relief-field.test.ts` (new) — vitest covering: empty input, layer count = unique domains, shared bounds across layers, nodeCount per layer, peak-descending order, valley vertices = additive black, re-centering invariant.

**Cost.** O(layers × cells × samples_per_layer × `exp()`) — same total work as the single-pass since `Σ samples_per_layer = total samples`. On a 4-domain × 100-node graph at 80×80 the field eval is still ~30ms. Memoized on `[graphData.nodes, layout]` — hover/scrub/orbit don't recompute.

**Out of scope (deliberately).**
- *Per-layer Y-stacking.* Not needed: additive blending with `depthWrite: false` makes every fragment additive into the framebuffer regardless of depth, so two layers at the same Y read correctly.
- *Picking through additive layers.* Multilayer is informational; selection still happens in 2D/3D.
- *Per-domain visibility toggles in the legend.* The existing DomainSelector card-checks already control which domains feed the field (via `useFilteredGraph`), so a second toggle would be redundant.

**Verification.** `tsc --noEmit` clean; lint clean on touched files; vitest 666/666 pass (9 new in `graph-relief-field.test.ts`).

### 2026-05-03 — Hotfix: Relief production crash on tab-switch

**Trigger.** Right after PR #210 merged, user reported a Next.js "Application error: a client-side exception has occurred" on clicking RELIEF in production. Generic top-level error fallback — no console access from this session, so the diagnosis was forced to be remote.

**Working theory (most-to-least likely).**
1. **Static import of `getDomainColor` from `graph-data.ts`** in `graph-relief-field.ts`. `graph-data.ts` is the 2,920-line MAIN_GRAPH module and is intentionally split out via the `import("@/lib/graph-data")` dynamic import in `page.tsx` (item #6 in the bundle plan). My static import pulled it into the Relief chunk, defeating the split and creating two competing init paths for the same constant. Production chunk loaders handle this less gracefully than dev's webpack runtime.
2. **NaN/Infinity propagation through the heightfield.** A single non-finite `composite` (or non-finite `p.x`/`p.y` from a degenerate layout) corrupts `peak`, then `inv = 1/peak`, then every `norm`, and finally every Float32 in the colors/positions buffers. WebGL upload of a buffer full of NaN doesn't always throw cleanly — sometimes it's "INVALID_OPERATION" on first draw, sometimes silent black, sometimes a renderer abort.
3. **No error boundary** around the Relief Canvas, so any render-time throw inside r3f surfaces as a top-level Next.js fault and tears down the whole app instead of just the Relief pane.

**Fix shipped.**
- **Inlined `DOMAIN_COLOR_MAP`** in `graph-relief-field.ts`. Removed the static import of `getDomainColor` from `graph-data.ts` entirely. The map is now a local constant; the Relief chunk no longer depends on `graph-data.ts`. Note left in the file: keep in sync with `getDomainColor` if either changes.
- **Defensive guards in both field functions.** Skip nodes whose layout position is non-finite. Coerce a non-finite `omegaFragility?.composite` to 0. Coerce a missing/empty `domain` string to `"Unknown"`. In the second pass, clamp `norm` to `[0, 1]` and bail to 0 on non-finite — so the GPU upload is always sane Float32.
- **Empty-buffer guard in mesh components.** `<ReliefMesh>` and `<ReliefLayerMesh>` now early-return `null` when `field.positions.length === 0` and skip the `setAttribute`/`setIndex` calls — `THREE.BufferAttribute(empty, 3)` was the most plausible direct throw point.
- **Removed `computeVertexNormals()`** from `<ReliefLayerMesh>` — `meshBasicMaterial` doesn't use lighting, so normals were wasted work and one less thing to fail on.
- **`<ReliefErrorBoundary>` class component** wraps the whole Relief view. A render error inside now logs to the console and shows a small in-pane "RELIEF VIEW UNAVAILABLE" fallback; the rest of the app stays interactive. Cheap belt-and-braces — should be the last line of defence regardless of which of the above was the actual culprit.

**Out of scope (deliberate).** Changing chunking config in `next.config.ts` to force the desired split — too broad. The inline copy of the color map is sufficient and decouples Relief from graph-data forever.

**Verification.** `tsc --noEmit` clean; lint clean on touched files; vitest 673/673 pass.

**Files touched.**
- `src/lib/graph-relief-field.ts` (+ ~50 / − 4) — inlined color map, defensive sample/norm guards.
- `src/components/CausalDAGRelief.tsx` (+ ~50 / − 5) — error boundary, empty-buffer guards, removed redundant normal compute.
- `docs/sessions/rendering-perf.md` — this entry.

### 2026-05-03 — Shipped: Relief readability pass — peakier terrain, tilted camera, grid, top-K node labels

**PR:** TBD (about to open).

**Trigger.** User said the live Relief view "kinda just looks like a flat map" — the multi-domain mesh was reading as one soft mound instead of distinguishable peaks, the camera was too top-down to see silhouette, and there was no way to identify *which* nodes the ridges belonged to. Asked for tilt + axes/grid + node labels.

**What shipped.**
- **Sharper terrain.** `heightScale 30 → 90`, `sigmaFraction 0.12 → 0.06` (tighter Gaussian — peaks no longer smear into one another), and a new `heightGamma: 1.35` knob that powers the normalised elevation before mapping to vertex Y. Combined with the upstream `nodeWeight()` power-1.5 boost (PR #218 territory), peaks now read as discrete ridges with flat valleys instead of a single dome. `elevationColor()` still keys off the linear `norm` so the legend ramp stays readable.
- **Tilted initial camera.** `dist * 0.55` Y-multiplier dropped to `0.35`, giving a ~20° elevation angle instead of a half-overhead view. The mesh now has actual silhouette on first frame; OrbitControls take over from there.
- **`<ReliefGrid>`.** Flat `gridHelper` at `y = -2`, sized to 1.2 × the bounds and divided into 16 cells. Two-tone colors (`#1a1d2b` / `#0e1018`) sit just-visible against the `#050508` background — the mesh is no longer floating in featureless black.
- **Top-K node labels.** New `computeNodeAnchors(nodes, layout, field, params, K=8)` in `graph-relief-field.ts` samples the field at each top-K node's position and returns mesh-local `(x, z, y)` so the component can drop drei `<Html>` cards above the highest peaks. Each label shows `{node.label}` + `Ω X.X` and a thin vertical tick down to the peak surface so the visual anchor is unambiguous. Defaults to 8 labels — enough to identify the dominant ridges, not so many that the canvas turns into label soup.
- **`ReliefField` exposes `cx, cy`.** The world-space recentring origin used by both compute functions. Lets `computeNodeAnchors` (and any future picking work) convert raw layout coords to mesh-local without re-deriving the bounds.

**Files.**
- `src/lib/graph-relief-field.ts` — `heightGamma` param + `cx/cy` field exports, height-gamma applied in both compute functions, new `computeNodeAnchors` + `NodeAnchor` exports.
- `src/components/CausalDAGRelief.tsx` — `<ReliefGrid>`, `<NodeLabels>`, tilted `<CameraSetup>`, `Html` import from drei, anchors useMemo against the dominant peak field.
- `src/lib/__tests__/graph-relief-field.test.ts` — added 4 tests: `cx/cy` exposed correctly; anchors top-K + sorted; anchors recentred to mesh-local; anchors empty on empty field.

**Cost.** Anchor sampling is O(K × N) per recompute (K=8, N=node count). On a 200-node graph that's ~1,600 `exp()` calls — under 1ms. Memoised on `[graphData.nodes, layout]` so hover/scrub/orbit don't trigger.

**Out of scope (deliberately).** Per-layer Y-stacking (option B in the user's pick) — the sharpened terrain alone already separates peaks readably, and stacking would compete with the additive color-mixing read. Picking through the mesh — still a future PR.

**Verification.** `tsc --noEmit` clean; lint clean on touched files; vitest 696/696 pass (4 new tests).

### 2026-05-03 — Shipped: Relief v3 — fused mesh, iso-contours, picking

**PR:** TBD (about to open).

**Trigger.** User feedback on the v2 multilayer was direct: *"the peaks are not really well differentiated. it's not really good… can't select any of these nodes."* They sent a Reddit reference (r/SideProject — "topographic map of 10 million research papers") showing how a real topographic map should look: discrete mountain ridges, iso-contour rings, dense labels, all clickable. The v2 additive multilayer fundamentally couldn't get there because every domain contributed everywhere, smearing peaks into haze.

**What shipped (v3 — bigger rework).**
- **Fused single mesh** replaces additive multilayer. New `computeFusedReliefField(nodes, layout, params)` builds ONE BufferGeometry by summing every domain's Gaussians into a total height field, but tracks the *dominant* domain at each grid cell. Vertex color = `dominantDomainColor × elevationTint × isoContourBand`. Each peak now reads as a discrete ridge with a single colour identity ("this peak is mostly Energy"), not the previous translucent pile-up. Returns a populated `legend` field — replaces the old per-layer legend rendering.
- **Iso-contour bands** baked into the vertex colour. `(cos(norm × BANDS × 2π) + 1) / 2` modulates each vertex's intensity; bands at edge centres are bright, valleys between bands are 0.6× dimmer. 12 bands gives the topographic-map ringed look the user asked for, without needing a custom shader. Sat on top of the elevation tint so darker valleys ringfade gracefully.
- **Picking.** New `pickNearestNode(clickX, clickZ, nodes, layout, field, params, maxDistance)` does a nearest-node search over mesh-local layout positions, capped at ~1.5 × sigma so a click on flat ground doesn't pick a far-away node. The mesh now has an `onClick` handler that takes the r3f hit point, calls picker, and dispatches `setSelectedNode(id)` into the store. Same selection signal the rest of the app already listens to (3D pillars, ModulePanel, RiskPropagationFlow). Plus a brief "SELECTED: {label}" hint at the bottom of the canvas for 1.4s so the user gets a visible confirmation.
- **Beefier labels.** Top-K bumped 8 → 12, switched to high-contrast white-on-black-with-shadow cards (the previous bg-surface-elevated/80 read as washed-out against bright peaks), thicker ticks (0.5r × 18h vs 0.6r × 14h), distance factor tuned tighter so labels stay legible at common camera distances.

**Files.**
- `src/lib/graph-relief-field.ts` — new `computeFusedReliefField` + `FusedReliefField` + `FusedReliefLegendEntry` exports, new `pickNearestNode` exporter. Existing `computeReliefField` / `computeReliefLayers` / `computeNodeAnchors` unchanged for back-compat with tests and any future re-use.
- `src/components/CausalDAGRelief.tsx` — drops `<ReliefLayerMesh>` from the render path entirely (the type stays imported only by tests). New `<ReliefMesh>` accepts `onPick` and routes click events. Pick hint UI element added. Lighting bumped (ambient 0.35→0.45, directional 0.7→0.85) so iso-contours read clearly against the now-tinted vertex colours.
- `src/lib/__tests__/graph-relief-field.test.ts` — 6 new tests: `computeFusedReliefField` shape + legend ordering, dominant-domain colouring at distant clusters, empty-graph handling; `pickNearestNode` happy path, cap radius, empty field.

**Out of scope.** Replay animation (bind field input to `currentSnapshot`), per-layer Y-stacking (option B from the original choice — moot now that the fused mesh reads cleanly), onboarding tooltip. Filed.

**Verification.** `tsc --noEmit` clean; lint clean on touched files; vitest 702/702 pass (6 new in `graph-relief-field.test.ts`).

### 2026-05-03 — Shipped: Topo v4 — heatmap palette, dense labels, more drama

**PR:** TBD (about to open).

**Trigger.** v3 user feedback: *"why did you randomly color these across? these are supposed to show colors getting brighter as peaks get larger — that's the whole thing, this is a heatmap. don't know if relief is the correct term either. can't see all the nodes. peaks and troughs still not differentiated."*

The dominant-domain colour scheme from v3 read as patchwork. Users expect a topographic / heatmap visualisation to follow a single ramp where elevation = colour, full stop. Domain identity should live elsewhere (legend, label borders), not on the surface itself.

**What shipped.**
- **Heatmap palette on the surface.** `computeFusedReliefField` now uses the `elevationColor` ramp (deep blue → cyan → amber → red) for vertex colours instead of the dominant-domain tint. Iso-contour modulation stays — bright at band centres, 0.55× at edges. Result: brighter / hotter = higher peak, full stop. Domain bookkeeping (`legend`, `dominantDomain`) still computed and exposed for downstream UI but no longer drives surface colour.
- **More vertical drama.** `heightScale 90 → 140`, `sigmaFraction 0.06 → 0.05`, `heightGamma 1.35 → 1.6`. Peaks now stand visibly above valleys in silhouette, not just colour.
- **Lower camera tilt.** Initial Y multiplier `0.35 → 0.25` so users see real horizon-relative silhouette on first frame.
- **Many more labels, scaled by Ω.** `topK` bumped 12 → 40. Each label's font size, tick height, tick width, and card opacity all scale linearly with `composite`: a top-Ω node gets 10.5px text + 28-unit tick + 1.0r tick + 0.95 card opacity; a borderline-3 node gets 7.5px text + 14-unit tick + 0.4r tick + 0.7 opacity. Label borders + Ω text get domain colour — that's where domain identity now lives.
- **Renamed "RELIEF" → "TOPO" in the UI.** Internal `viewMode === "relief"` stays unchanged (would have rippled through types, store, and tests for no real benefit); button label is now "TOPO" and the rendering badge reads "WEBGL_TOPO". User flagged that RELIEF was unfamiliar and "TOPO" is closer to the layperson term for a topographic map.

**Files.**
- `src/lib/graph-relief-field.ts` — DEFAULTS bumped (heightScale 140, sigmaFraction 0.05, heightGamma 1.6); `computeFusedReliefField` colour pass swapped to `elevationColor` ramp.
- `src/components/CausalDAGRelief.tsx` — `topK` 12 → 40, label-size scaling with composite, domain-coloured label borders, camera Y multiplier 0.35 → 0.25.
- `src/components/dag3d/DAGOverlay.tsx` — view-mode button label and rendering-badge string updated to "TOPO" / "WEBGL_TOPO".
- `src/lib/__tests__/graph-relief-field.test.ts` — replaced "dominant domain colour" test with "elevation ramp is monotonic with elevation" test (max-RGB-sum vertex is markedly brighter than min).

**Verification.** `tsc --noEmit` clean; lint clean on touched files; vitest 702/702 pass.

### 2026-05-03 — Shipped: Topo v5 — fragment shader, denser geometry, smooth contours

**PR:** TBD (about to open).

**Trigger.** v4 user feedback: *"this is better, but it's pixelated-looking. I've seen platforms that have a lot clearer terrain. Is there a different framework we can use?"*

The framework is fine — three.js / r3f is exactly what those reference platforms use. The "pixelated" look came from two things stacking: (1) the geometry was 80×80 cells, so triangles were visible at silhouette, and (2) the iso-contour bands were baked into per-vertex RGB and linearly interpolated across triangles, so a band drawn at norm=0.5 only landed on triangles whose edges crossed 0.5 — apparent line width followed the triangle grid, not the screen. Pixel-rate fragment shading fixes both.

**What shipped.**
- **Fragment-shader topo material.** New `<shaderMaterial>` with custom GLSL inside `CausalDAGRelief.tsx`. The vertex shader passes a single per-vertex `aNorm` (normalised height) as a varying; the fragment shader reconstructs the elevation colour ramp + iso-contour lines + Lambert shading **per pixel**. Result: silky smooth gradients and crisp anti-aliased contour lines, regardless of geometry resolution. Iso-contour line is `1 - smoothstep(uLineWidth, uLineWidth + 0.008, distToBandEdge)`, mixed at 0.75 strength against `0.35× baseColor` for visible-but-not-busy ringing. 14 bands by default (was 12). Ambient floor 0.45 + 0.55 Lambert.
- **Per-vertex `norms` attribute** on `FusedReliefField`. Same length as `positions/3`. The shader reads it; vertex `colors` stay populated as a fallback for any code path that doesn't bind the shader.
- **Geometry resolution 80 → 128.** Triangles still get smaller for a smoother silhouette, but we don't need to crank further because the surface smoothness now comes from the fragment shader, not mesh density. ~16K vertices, ~100ms compute on 200-node graphs.
- The single-domain path (1 unique domain) keeps using `meshStandardMaterial` with vertex colours — the shader is wired conditionally on the presence of `norms`.

**Files.**
- `src/lib/graph-relief-field.ts` — DEFAULTS resolution 80 → 128; `FusedReliefField` adds `norms: Float32Array`; `computeFusedReliefField` writes per-vertex norms in pass 2 (vertex colours stay populated minus the iso-contour modulation, which moved to the shader).
- `src/components/CausalDAGRelief.tsx` — `TOPO_VERTEX_SHADER` + `TOPO_FRAGMENT_SHADER` GLSL strings, `<ReliefMesh>` accepts `norms?: Float32Array` and conditionally renders `<shaderMaterial>` vs `<meshStandardMaterial>` based on its presence. Fused-mesh call site passes `fusedField.norms`.

**Verification.** `tsc --noEmit` clean; lint clean on touched files; vitest 702/702 pass.

### 2026-05-03 — Shipped: Topo replay animation — terrain morphs as the cascade runs

**PR:** TBD (about to open).

**Trigger.** User picked option 1 — turn TOPO from a static topology view into a scenario tool that morphs as the cascade replay advances. Bind the field input to `currentSnapshot.nodeStates[id].omegaComposite` so peaks rise / fall in sync with the replay scrubber.

**What shipped.**
- **Replay-aware field input.** `CausalDAGRelief` now reads `replayActive`, `activeTimeline`, `baselineEpochs` / `interventionEpochs`, and `currentEpoch` from the store. Derives a `currentSnapshot: EpochSnapshot | null` (clamped to range, like `CausalDAG2D` does). When non-null, builds a `fieldNodes` array that overrides each node's `omegaFragility.composite` with the snapshot's per-node ΩF. The fused / single field, the anchors, and the labels all read from `fieldNodes` — so the surface, the elevation, and the label Ω text all morph in lockstep as the user scrubs.
- **Stable layout under scrub.** Switched the layout `useMemo` from `[graphData.nodes, graphData.edges]` (re-fires every scrub tick because `useTemporalGraph` allocates fresh arrays + node objects) to `[sig]` where `sig = graphSignature(nodes, edges)` (sorted node + edge id string). Topology changes still re-run the force-directed simulation; replay scrubs don't. Same pattern `CausalDAG2D` uses (`graphSignature` from `graph-layout-2d.ts`). Without this fix, scrubbing would also shuffle the canvas, which would compete with the field eval for the main thread and look terrible.
- **REPLAY · EPOCH N / M pill** in the top-right. Amber-bordered, only renders when `currentSnapshot` is active. Tells users at a glance that the surface they're seeing is a replay frame, not the static graph.

**Files.**
- `src/components/CausalDAGRelief.tsx` — adds replay-state selectors, `currentSnapshot` derive, `fieldNodes` override, sig-keyed layout cache, REPLAY pill. Also adds imports: `graphSignature` from `graph-layout-2d`, `EpochSnapshot` type from `lib/types`.
- `src/lib/__tests__/graph-relief-field.test.ts` — added 2 tests: `norms` length matches `positions/3` and ranges across [0,1]; replay contract — same nodes/layout, escalated ΩF → strictly higher peak.

**Out of scope.** Throttling field recompute during fast scrubbing — at 128² × 169 samples × N domains the eval is ~100ms per frame, which is fine for click-stepping through epochs but would feel laggy for a real-time slider drag. If users actually scrub at 60fps, the right fix is either (a) lower-resolution preview during drag + full res on settle, or (b) port the kernel sum to a compute shader. Filed for later.

**Verification.** `tsc --noEmit` clean; lint clean on touched files; vitest 704/704 pass (2 new in `graph-relief-field.test.ts`).

### 2026-05-03 — Shipped: Topo label-on-peak fix + Ω intensity legend

**PR:** TBD (about to open).

**Trigger.** User feedback: *"the way nodes render on top of it is really hard to follow. Right now they seem to be sitting at the bottom on a flat map. Also could we have a vertical scale showing what each striation is in terms of Ω."*

**The bug.** `computeNodeAnchors` was sampling each node's height with the raw `composite` value:
```ts
h += s.composite * Math.exp(-(...) / sigma2);
```
But the field eval uses `nodeWeight(composite) = composite ^ WEIGHT_EXPONENT (1.5)`. For composite=10, that's 10 vs 31.6 — the anchor's `h / field.peak` ratio was ~0.3 of the actual mesh-vertex norm at that point, so `pow(norm, heightGamma) * heightScale` came out at ~20 when the surface peak was at 140. Labels rendered close to y=0 — exactly the "sitting at the bottom" the user reported. One-line fix: anchor sampling now mirrors the field-eval kernel.

**What shipped.**
- **Anchor height fix.** `computeNodeAnchors` now uses `nodeWeight(s.composite)` to match the field eval. Labels now float at the true peak height.
- **`<ElevationLegend>` component.** Vertical heatmap-gradient strip on the right edge of the canvas, ~180px tall, with five label stops (Ω peak / HIGH / MID / LOW / Ω 0). Uses 14 horizontal tick lines that mirror the shader's `uBands = 14`, so the strip's tick density visually maps to the iso-rings on the surface. Right-side rotated "Ω INTENSITY" text. Pulls `peakOmega` from `fieldNodes` (replay-aware), so the top label updates as ΩF changes during a replay.
- **`elevationColorJS`** small helper in the component — JS mirror of the shader's GLSL elevationColor ramp, used to paint the CSS gradient stops so the legend visually matches the surface palette. Comment ties them together; keep in sync if the ramp ever changes.

**Files.**
- `src/lib/graph-relief-field.ts` — `computeNodeAnchors` height kernel uses `nodeWeight()` instead of raw `composite`. Comment explaining the contract.
- `src/components/CausalDAGRelief.tsx` — adds `<ElevationLegend>`, `elevationColorJS()` helper, `peakOmega` useMemo, render call site below the domain legend.
- `src/lib/__tests__/graph-relief-field.test.ts` — new regression test "anchor y matches the actual mesh-vertex height at the node position": for an isolated source the anchor should reach ≥ 95% of the global mesh-vertex max-Y (was previously sitting at <30% of it).

**Verification.** `tsc --noEmit` clean; lint clean on touched files; vitest 711/711 pass.

### 2026-05-03 — Shipped: 2D hover/select stability — custom EmphasizedEdge + Dag2DContext

**PR:** TBD (about to open).

**Trigger.** User feedback: *"the 2D map is doing this weird thing where if I hover over any node, the whole map starts to blink consistently. And when I select any one node, the map just disappears temporarily."*

**Root cause.** Both the `nodes` and `edges` useMemos depended on `emphasisMap` / `emphasisTarget` (= `hoveredNodeId ?? selectedNode`). Every mousemove that hit a node, and every click that selected one, re-fired both memos and produced **brand-new node + edge object arrays**. React Flow then diffs against its internal store, decides everything is new, and tears down + rebuilds every node and edge DOM element. With many edges and a 180ms opacity transition, that read as a canvas-wide blink. The select-then-disappear case was the same mechanism — `emphasisTarget = selectedNode` flipped the entire arrays, RF unmounted before the new tree was mounted.

This was the work deferred in PR #198 with the note *"would need a custom edge component subscribing to emphasisTarget separately."*

**What shipped.**
- **`Dag2DContext`** — new React Context carrying `{ adjacency, hoveredNodeId, selectedEdgeId }`. The adjacency Map is the same one the parent already builds; it's stable across hovers because it's keyed on graph topology only.
- **`computeNodeEmphasis(id, hoveredNodeId, selectedNode, multiSelected, adjacency)`** — pure helper that returns `"focus" | "neighbor" | "dim" | "none"` for a single node. Used by `CausalNode2D` directly. Same logic as the old `emphasisMap` builder, just per-node instead of all-up-front.
- **`CausalNode2D` consumes context + store directly.** Reads `hoveredNodeId` from `Dag2DContext`, `selectedNode` and `multiSelectedNodes` from `useApexStore`. Computes its own emphasis. The parent's `nodes` useMemo no longer depends on emphasis-derived state, so hover / single-select don't rebuild the array.
- **New `EmphasizedEdge` custom edge component.** Subscribes to context + store the same way. Carries structural data (`baseColor`, `baseWidth`, `baseOpacity`, propagation signal, isSelected, type flags) on `edge.data` — all stable per graph state, NOT per hover. In render, computes opacity / strokeWidth / dim modulation from current emphasis. Renders via drei's `BaseEdge` + `getBezierPath`.
- **Parent's `edges` useMemo deps**: dropped `emphasisTarget`; kept `[graphData, truthFilter, currentSnapshot, selectedEdge]`. Hovering no longer rebuilds the edges array; `selectedEdge` (the edge inspector signal — separate from `selectedNode`) still does, which is correct.
- Registered `edgeTypes = { emphasized: EmphasizedEdge }` and switched the per-edge `type` from `"default"` to `"emphasized"`.

**Files.**
- `src/components/CausalDAG2D.tsx` — Context + helper added at top, `CausalNode2D` updated, `EmphasizedEdge` added, parent `nodes`/`edges` useMemos restructured, render wraps in `<Dag2DContext.Provider>`, `edgeTypes` passed to ReactFlow.

**Out of scope (deliberate).**
- The replay contraction `nodes` useMemo (`graphData, nodePositions, truthFilter, currentSnapshot, adjacency`) still re-fires on each replay tick, which is correct — node positions actually move during replay. The point of this PR was severing the *hover/select* dependency, not the replay dependency.
- The "map disappears on select" symptom — same root cause as the blink (whole-array rebuild). Both are fixed by the same change.

**Verification.** `tsc --noEmit` clean; lint clean on touched files; vitest 723/723 pass.

### 2026-05-03 — Shipped: 3D readability — labels-on-demand, brighter orbs, size-metric toggle

**PR:** TBD (about to open).

**Trigger.** User feedback on the 3D diagram: *"looks busy / hard to track. Rather than every node labeled, only show labels when I select one. The orbs themselves are near invisible — make them easier to identify. Should we link the orb size to a network feature shown on the right? Maybe a toggle?"*

**What shipped.**
- **Labels on demand only.** `DAGNode3D` previously rendered every node's label permanently (hidden only during active orbit). Now the label only shows when the node is hovered, single-selected, or a neighbour of the selected node. The hover detail card (full ΩF profile + radar + network metrics) still surfaces full info on demand. Removes the "hodgepodge of overlapping text" the user flagged.
- **Brighter orbs.** Three changes in concert: (a) base radius range 0.20–0.75 → 0.45–1.05 (≈ 2× across the board, lifts the floor so peripheral nodes still read as orbs not dots); (b) idle emissive intensity floor 0.4 → 0.7 (and hover 0.8 → 0.95); (c) outer glow-sphere opacity 0.06 / 0.12 → 0.16 / 0.32; (d) ΩF colour ring opacity 0.15 / 0.35 → 0.32 / 0.55. Orbs now have visible presence at idle, not just when hovered.
- **`nodeSizeMetric` toggle.** New `NodeSizeMetric = "omega" | "eigenvector" | "betweenness"` type added to `lib/types.ts`. Store carries `nodeSizeMetric` (default `"eigenvector"` — same as before, just now selectable) + `setNodeSizeMetric` action. `DAGOverlay` exposes a small `SIZE: ΩF / EIG / BTW` button trio in the top-right control strip, only visible in 3D view. `DAGNode3D` reads the store value and computes radius from the chosen metric — `omega` maps `composite/10` to the unit interval; the centralities are passed through directly. Hover-card footer reflects the active metric ("size ∝ ΩF composite", etc.).

**Files.**
- `src/lib/types.ts` — new `NodeSizeMetric` type.
- `src/stores/useApexStore.ts` — `nodeSizeMetric` slot + setter, default `"eigenvector"`.
- `src/components/dag3d/DAGOverlay.tsx` — 3D-only `SIZE:` toggle wired to the store.
- `src/components/dag3d/DAGNode3D.tsx` — radius formula honours the toggle, label conditional gate, glow / emissive intensity bumps, hover-card footer text.

**Verification.** `tsc --noEmit` clean; lint clean on touched files; vitest 729/729 pass. (Three pre-existing lint warnings outside the diff.)

### 2026-05-03 — Shipped: 2D floating edges + node-size toggle parity

**PR:** TBD (about to open).

**Trigger.** User feedback after the 3D readability pass: *"some 2D lines are still all curvy. It almost seems like they have to be pointing to the bottom or top of any node. Can't we have them just pointing straight from whatever direction makes the most sense? Also the size differences should also be available in 2D rendering."*

**Floating edges.** The previous `EmphasizedEdge` used `getBezierPath` against React Flow's handle-anchored `sourceX/Y` / `targetX/Y` — every line had to pass through one of the four invisible handles (top/bottom/left/right) on each circle, so a node placed to the left of another would still draw a line that detoured up to the top handle and curved back down. Replaced with the "floating edge" pattern from the RF docs: read the source/target `nodeInternals` via `useReactFlowStore`, compute centre-to-centre direction, trim each end to the circle perimeter, draw a single straight `M…L…` SVG path. Now lines go in the geometrically natural direction, no curvature, no detours. Arrowhead lands on the circle perimeter cleanly.

**Node-size toggle parity.** The 3D `SIZE: ΩF / EIG / BTW` toggle now drives 2D node diameter too:
- `CausalDAG2D` computes `networkMetrics` via the existing `computeNetworkMetrics` util (same one 3D uses) and caches on `graphSignature`. Replay scrubs / hover don't re-run the centrality sweep.
- Each node's `data` now carries `metrics: NodeMetrics`.
- `CausalNode2D` reads `nodeSizeMetric` from the store and maps the chosen signal into a 14–34 px diameter range.
- `DAGOverlay` SIZE toggle visibility extended from `viewMode === "3d"` to `(viewMode === "3d" || viewMode === "2d")`. MAP / TOPO stay hidden since their visual primitive isn't a sized node.

**Files.**
- `src/components/CausalDAG2D.tsx` — `EmphasizedEdge` switched to floating straight path via `useReactFlowStore`; `CausalNode2D` accepts `metrics` and reads `nodeSizeMetric`; parent `nodes` useMemo passes per-node metrics; `networkMetrics` useMemo cached on `sig`.
- `src/components/dag3d/DAGOverlay.tsx` — SIZE toggle now visible in 2D as well.

**Verification.** `tsc --noEmit` clean; lint clean on touched files; vitest 729/729 pass.

### 2026-05-03 — Hotfix (out-of-scope but blocking prod): lazy-init Supabase clients in API routes

**PR:** TBD (about to open).

**Trigger.** User reported `manifold.apexanalytica.co` → Vercel **404 DEPLOYMENT_NOT_FOUND**. Local `npm run build` reproduced: `Error: supabaseUrl is required.` at the "Collecting page data" step, dying on `/api/admin/billing/expire`. Bisected — none of the rendering/perf commits touched these routes; the failure is structural.

**Root cause.** Ten API route files were instantiating service-role Supabase clients (and one Resend client) **at module-load time** at the top of the file:

```ts
const service = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
```

Next.js 16's Turbopack production builder is more aggressive about evaluating route modules during page-data collection, so any missing env var at build time crashes the entire build. On Vercel that took out the production deployment alias and produced the user-facing DEPLOYMENT_NOT_FOUND.

**Fix.** All 10 routes wrapped the client creation in a `function getService() { return createClient(...) }` and switched callsites to call `getService()` (or `getSupabase()` / `getResend()`) inside the request handler. Module-load no longer touches env vars; the client is constructed at request time when env vars are guaranteed present (or fails with a clearer 500).

**Files touched.**
- `src/app/api/admin/billing/expire/route.ts`
- `src/app/api/admin/billing/grant-tier/route.ts`
- `src/app/api/admin/billing/customers/route.ts`
- `src/app/api/admin/feedback/[id]/approve/route.ts`
- `src/app/api/admin/feedback/[id]/reject/route.ts`
- `src/app/api/admin/leads/[id]/route.ts`
- `src/app/api/request-access/route.ts` (also lazy-inits Resend)
- `src/app/api/feedback/route.ts`
- `src/app/api/webhooks/github/route.ts`
- `src/app/api/trusted-signup/route.ts`

**Verification.** Local `npm run build` now passes the "Collecting page data" step (where it was failing). Static page pre-rendering still requires env vars present (e.g. `/forgot-password` uses `@supabase/ssr`); that's expected on Vercel where the env vars exist and was always working there.

**Out of scope (deliberate).** This is auth/platform code, not rendering/perf. Logging the hotfix here because it's the only session that's been touching the codebase today and prod was down.

### 2026-05-03 — Shipped: discoverable LEGEND popover replaces cryptic SIZE buttons

**PR:** TBD (about to open).

**Trigger.** User feedback after the SIZE toggle landed: *"the toggle ΩF / EIG / BTW is still kind of confusing — what do they mean? Also what about the distance measures? What are those relative to the orbs? We need to be more specific and consistent."*

The cryptic three-letter labels surfaced no meaning, and three other visual encodings (inter-node distance, edge thickness, edge colour) had **zero documentation** in the UI. Power users could probably guess, first-time users couldn't.

**What shipped.**
- New `EncodingLegend` popover component in `DAGOverlay`, anchored to a single `LEGEND` button that replaces the inline `SIZE: ΩF / EIG / BTW` strip. Same trigger in 2D and 3D.
- **Size toggle moved inside the popover** with full names + one-line explanations:
  - **Criticality (ΩF)** — Static fragility composite — 0–10. Default analytical signal.
  - **Influence (eigenvector centrality)** — Importance via connections to other important nodes. Surfaces hubs.
  - **Bridge (betweenness centrality)** — Lies on shortest paths between others. Surfaces chokepoints.
- **Five read-only encoding rows**, each with a colour swatch + plain-English explanation:
  - Node colour → domain
  - Node glow → ΩF severity (red ≥ 9, amber 7–9, green < 7)
  - Distance → force-directed: stronger correlation ⇒ shorter spring ⇒ closer
  - Edge thickness → correlation magnitude
  - Edge colour → causal (cyan) / temporal (amber) / confounded (orange) / Tarski-violation (red)
- Click-outside + Escape dismiss the popover.

**Tradeoff captured.** Size-metric switching is now a 2-click action (open legend → click metric) instead of 1-click. The discoverability win — users can finally tell what BTW *is* — was the bigger problem.

**Files.**
- `src/components/dag3d/DAGOverlay.tsx` — `EncodingLegend` + `LegendRow` components, `legendOpen` state, replaces the inline `SIZE:` button strip with a single `LEGEND` button + popover.

**Verification.** `tsc --noEmit` clean; lint clean; vitest 729/729 pass.

### 2026-05-03 — Shipped: edge thickness power-scale + plain-English edge legend

**PR:** TBD (about to open).

**Trigger.** User feedback after the LEGEND landed: *"have we actually implemented edge thickness? They all seem to have pretty much the same thickness. The distance — is that actually being calculated appropriately? Also our blue lines vs yellow lines — I thought there were correlation and causal analytics. Please clarify."*

**Diagnosis.**
- Edge thickness *was* implemented: linear `0.5 + weight * 1.5`. But real edge weights cluster between **0.4 and 0.8** (86 at 0.6, 70 at 0.7, 37 at 0.8) → visible width range was **1.1–1.7 px** = barely distinguishable. Code was right, calibration was wrong.
- Distance *is* implemented: 2D layout uses `distance = 65 + (1 - weight) * 100`, so weight 0.4 → 125, weight 0.8 → 85. Force-directed layout also balances charge / collision / centering, so distance is a *soft* signal that gets partially drowned out — not a literal weight readout.
- Edge colours are correct but the legend was cryptic. Three real edge types in the dataset: `directed` = direct causal (cyan, 183 edges), `temporal` = lag-correlation (amber + animated particles, 135 edges), `confounded` = latent common cause (orange, dashed, 9 edges). Plus Tarski-violation overlay (red).

**What shipped.**
- **Edge thickness power-scale.** Both `CausalDAG2D` (`EmphasizedEdge`'s `baseWidth`) and `DAGEdge3D` switched from `0.5 + weight * 1.5` to `0.7 + pow(weight, 2.4) * 3.3`. The 0.4–0.8 weight band now produces 0.46–1.34 (multiplied by the constant), giving ~3× spread between thin and thick edges at typical weights. Min 0.7 floor keeps very weak edges still drawable.
- **Legend rewritten** with plain-English edge type names. The single `EDGE COLOUR` row split into four:
  - `CAUSAL (cyan →)` — Direct cause: A → B. Arrowed.
  - `TEMPORAL (amber, animated)` — Lag-correlation: A leads B by some delay. Particles flow source → target.
  - `CONFOUNDED (orange, dashed)` — A and B share a hidden common cause, no direct link.
  - `INCONSISTENT (red)` — Tarski filter: edge violates a domain-aware axiom (only visible with verified-truth filter on).
- **Distance row updated** to call out that the signal is *approximate* — force-directed layout, with charge / collision / centering forces competing.
- **Edge thickness row updated** to match the new power-scale wording: "Correlation / causal magnitude — power-scaled so the typical 0.4–0.8 weight range reads as ~3× spread on screen."

**Files.**
- `src/components/CausalDAG2D.tsx` — `baseWidth` formula in the `edges` useMemo.
- `src/components/dag3d/DAGEdge3D.tsx` — `lineWidth` formula at the top of the inner component.
- `src/components/dag3d/DAGOverlay.tsx` — legend rows updated.

**Verification.** `tsc --noEmit` clean; lint clean on touched files; vitest 732/732 pass.

### 2026-05-03 — Shipped: 3D hover-vs-click parity with 2D

**PR:** TBD (about to open).

**Trigger.** User feedback on 3D: *"when I hover above a node, I'd like to see just the small label like 2D does. I didn't mean the huge box that appears — that should only appear when I physically click on it."*

**What shipped.** Single one-line change in `DAGNode3D`: the heavy "ΩF profile + network metrics" hover card was gated on `hovered && !dimmed`. Switched to `isSelected && !dimmed`. The lightweight floating-label (`{node.label} | {domain} | Ω X.X`) still shows on hover (gate already includes `hovered || isSelected || isNeighborOfSelected`), so hover gives the small label and only an explicit click opens the heavy card. Mirrors the 2D pattern.

**Files.**
- `src/components/dag3d/DAGNode3D.tsx` — one conditional swap on the detail-card mount.

**Verification.** `tsc --noEmit` clean; lint clean (pre-existing `ablationMode` warning unchanged); vitest 778/778 pass.

### 2026-05-03 — Next up

- Verify on production: hover a 3D orb → only the small label appears. Click an orb → the full detail card appears (and stays until you click elsewhere or hit ESC).
- Backlog: deferred 3D `onPointerMove` throttle (PR #199), map-view imperative-setData refactor, real bundle-analyzer perf sweep using PR #222's tooling.

### 2026-05-07 — Shipped: 2D click-dim softened, TOPO neighbour pillars, in-scene Ω legend, collapsible domain panel

**PR:** TBD (about to open).

**Trigger.** Four-item feedback batch from the user, in order:
1. *"If you click on it, the screen all the notes disappear, so it kinda goes black. That needs to fixed."* — 2D click was producing a permanent dim (0.18 node, 0.10 edge) that read as a blacked-out canvas.
2. *"Anytime you select the node … it should be persistent across all ball mapping options. … The same thing in topology as well."* — node + neighbours highlight existed in 2D and 3D, but TOPO only marked the selected node itself.
3. *"It could be nice if that gradient identifier was actually hung up above the or around the mountains and so you could easily use it as a comparison element. Rather than … on the side of the screen."* — TOPO Ω legend was a DOM strip pinned to the right edge with no relationship to actual peak heights.
4. *"The bottom-left domain selector … takes too much room. I think it should be a collapsible menu."*

**What shipped.**

- **Click-dim softened, hover-dim untouched.** In `CausalDAG2D` (the same `computeNodeEmphasis` + `EmphasizedEdge` path) the dim *strength* now branches on whether `hoveredNodeId` is set:
  - Hover-driven (transient): nodes 0.18, edges 0.10 / multi 0.08 — full spotlight, what the user said is "kinda cool".
  - Click-driven (persistent): nodes 0.50, edges 0.35 / multi 0.25 — non-neighbour orbs and edges still legible, no "black canvas" feel.
  The clicked node itself is still "focus" via the existing emphasis path, so it stays vivid.
- **TOPO neighbour pillars.** `SelectionMarkers` now also receives `edges` and renders a second "neighbour" tier: shorter, thinner, dimmer cyan pillars at every node adjacent to a primary selection. Same spotlight semantics as 2D and 3D — clicking a node in any view now lights up the same neighbourhood across all three.
- **In-scene Ω elevation legend.** `ElevationLegend` (right-edge DOM strip) replaced by `InSceneElevationLegend` rendered inside the `<Canvas>` at the SE corner of the field. The column is a 1×128 `CanvasTexture` standing 140 world units tall — the same `heightScale` the surface uses — so the user can compare a peak's height directly to the legend's Ω ticks. Tick labels (`Ω 0`, two intermediates, `Ω peak`) are placed on the gamma-shaped curve (`pow(t, heightGamma=1.6) * 140`) so they line up with what the eye reads off a mountain at the same height.
- **Collapsible bottom-left DOMAINS panel.** `DAGOverlay` got a `domainPanelOpen` state (default closed). Header is always visible with a chevron toggle and a count summary; the body (per-domain rows with click-to-highlight) only mounts when expanded.

**Files.**
- `src/components/CausalDAG2D.tsx` — node + edge dim splits on `isHoverDriven`.
- `src/components/CausalDAGRelief.tsx` — neighbour-pillar tier in `SelectionMarkers`, new `InSceneElevationLegend`, removed DOM-side `ElevationLegend`.
- `src/components/dag3d/DAGOverlay.tsx` — chevron toggle on the DOMAINS panel.

**Out of scope (flagged to data/engines).** "Nodes from unselected domains still appear" (likely a `selectedDomains` filter bug) and "domain grouping looks apples-to-oranges" (sovereign risk vs Saudi/Iran co-energy in the same group) — both belong with the engines team's domain-data layer, not with rendering.

**Verification.** `tsc --noEmit` clean; lint clean on touched files; vitest 778/778 pass.

### 2026-05-07 — Shipped: Map multi-select dim, 3D card-explosion fix, TOPO isolate, domain panel rolled up

**PR:** TBD (about to open).

**Trigger.** Four-item batch from the user after merging PR #262:

1. *"On maps, it didn't actually shade out the rest of them. … in the same way that it did under 2D."* — Map only dimmed when `isolateSelection` was on; 2D dims unconditionally on multi-select.
2. *"Under 3D, it has, like, a million different cards open. … It should only just have, like, that short little title above that node."* — When PR #261 moved the heavy detail card behind `isSelected`, multi-select set `isSelected=true` for every selected node, popping a wall of overlapping cards.
3. *"Under topology … it hasn't isolated the region, which I guess is what it should be doing."* — TOPO didn't honour `isolateSelection` at all.
4. *"Under the bottom-left domain section … sovereign risk Saudi Aramco Energy. These look like not the same level of complexity. And on top of that, you're also showing certain domains for which there are not any nodes."* — The panel iterated raw `n.domain` strings, which carry inconsistent abstraction (per-company vs per-theme), and showed buckets the user hadn't selected at landing.

**What shipped.**

- **Map dim-on-multi-select.** `nodeGeoJSON` now dims non-selected nodes whenever `selectedNodes.length > 0` (0.35 with isolate off, 0.15 with isolate on). Edges branch three ways: cull when isolate ON and not fully in scope, dim to 0.08 when isolate OFF and no endpoint is selected, otherwise render normally.
- **3D `isSingleSelected` prop.** `DAGNode3D` now takes both `isSelected` (single OR multi → drives ring/scale/label) and `isSingleSelected` (the singular click target → drives the heavy detail card). Multi-selected nodes still get the floating label, never the card.
- **TOPO isolate + tint.**
  - With `isolateSelection && multiSelected.size > 0`, `fieldNodes` filters to the selected subset before the relief field is computed — non-selected mountains literally don't render.
  - Without isolate but with a multi-selection, the surface gets a `uSurfaceTint=0.4` uniform multiplier (new in `TOPO_FRAGMENT_SHADER`) so mountains read as faded context behind the cyan selection pillars. Vanilla `meshStandardMaterial` path mirrors via `transparent + opacity`.
  - Uniform held in `useState`, mutated imperatively through a `materialRef` to avoid rebuilding the shader pipeline on tint changes.
- **Domain panel rolled up to card labels.** Replaced the raw `n.domain` enumeration with a card-keyed pipeline: reverse `DOMAIN_MAP` (selector-id → raw-domain[]) into raw → card, bucket nodes by card, show `card.label` (e.g. "Energy Systems") and `card.color`. Cross-domain connectors (`Geopolitical`, `Energy Grid`) keep their raw-name row since they have no card mapping. When `selectedDomains.length > 0`, non-cross-domain rows filter to the user's actual landing-page picks; otherwise fall back to "show everything in the visible graph". Click-to-highlight now selects every node whose raw `n.domain` is in the row's mapped set.

**Files.**
- `src/components/CausalDAGMap.tsx` — node + edge dim branches.
- `src/components/dag3d/DAGNode3D.tsx` — new `isSingleSelected` prop, gate on detail card, memo equality.
- `src/components/CausalDAG3D.tsx` — pass `isSingleSelected={selectedNode === node.id}` to `DAGNode3D`.
- `src/components/CausalDAGRelief.tsx` — `uSurfaceTint` uniform + shader update; `surfaceTint` prop on `ReliefMesh`; `fieldNodes` isolate filter; multi-select state read in the parent.
- `src/components/dag3d/DAGOverlay.tsx` — `domainPanelRows` (card-keyed), updated panel render + click handler.

**Caveats / what's still data-side.** "Apples-to-oranges" was addressed at the rendering layer by displaying card labels instead of raw `n.domain` strings. The underlying data still has nodes labelled at multiple abstraction levels — that's an engines-team thing if the picker / canvas ever needs to surface the raw string.

**Verification.** `tsc --noEmit` clean; lint clean on touched files (pre-existing `ablationMode` warning unchanged); vitest 778/778 pass.

### 2026-05-07 — Shipped: 2D click no longer reheats the layout sim

**PR:** TBD (about to open).

**Trigger.** User: *"Click any one of the nodes under 2D, and then everything disappears … it disappears for, like, a few seconds, and then it rerenders again. But it's weird because when it rerenders, nothing is selected."*

**Diagnosis.** RF fires `onNodeDragStart` on mousedown — even for a pure click. The handler called `sim.reheat(0.5)` + `startSimLoop()`, so every click ran the force-directed layout for ~1.5s while alpha decayed from 0.5 to 0.005. The orbs drifted (sometimes far enough to leave the viewport) and settled back, which the user perceived as "everything disappeared then re-rendered." The selection ring was technically still applied but invisible because the selected orb had moved off-frame mid-drift.

**What shipped.** Click-vs-drag distinction in `CausalDAG2D`:
- `onNodeDragStart` now only pins the node (cheap). No reheat, no sim loop.
- `onNodeDrag` (which fires only when actual movement occurs) reheats and starts the sim on its first tick, then keeps re-pinning to the cursor.
- `onNodeDragStop` only calls `sim.cool()` if a drag actually happened — pure-click → pin/unpin pair is a no-op for the simulator.
A `draggedRef` tracks whether motion fired between drag start/stop.

**Files.**
- `src/components/CausalDAG2D.tsx` — drag-vs-click handlers.

**Verification.** `tsc --noEmit` clean; lint clean on touched files; vitest 782/782 pass.

### 2026-05-07 — Shipped: 3D card removed, TOPO legend anchored to peak, Map basemap de-cluttered

**PR:** TBD (about to open).

**Trigger.** Three-item batch:

1. *"Under 3D, selecting any node still gives us a whole box that's hard to get rid of. All it needs to do is give a small title hovering above it along with its nearest neighbors. Like 2D."* — even after PR #265 narrowed the in-canvas detail card to single-click only, the user wants no in-canvas card at all. The 2D pattern is the model: small floating label + neighbour spotlight.
2. *"The legend on the side of the topology diagram is really off to the side. It should kinda be floating above wherever we're scaling to so we can always kind of see how it compares."* — the SE-corner placement of `InSceneElevationLegend` was visually disconnected from the actual peaks.
3. *"For the map, … it's almost a globe-like looking map. Looks somewhat like Google Maps, but it gets all the way down to the street. … This is just getting very busy."* — the CARTO `dark_all` basemap rendered street labels and city names under the causal-graph overlay.

**What shipped.**

- **3D in-canvas detail card removed entirely.** Dropped the `Html`-mounted card from `DAGNode3D` (was ~140 lines of JSX rendering a 280px panel with axis bars, network metrics, metadata). The small floating label above the orb is now the only on-canvas affordance — same gate as before (`!dimmed && !isOrbiting && (hovered || isSelected || isNeighborOfSelected)`). Full ΩF profile / network metrics still live in `NodeInspector` and `ModulePanel` as side panels — the right home for the heavy data. Cleanup: removed `isSingleSelected` prop, dead helpers (`getBarColor`, `getCentralityLabel`), unused imports (`getDomainColor`, `resolveDomainProfile`), and the `axes` / `selectedDomains` / `profile` / `pillarLabels` locals.
- **TOPO legend anchored to the peak.** `InSceneElevationLegend` now takes a `peakAnchor` (translated x/z of the highest-Ω node, in surface coords) and stands the column 12 world units beside it. Cascade replay re-anchors as the peak shifts. Falls back to the SE corner if no anchor is available.
- **Map basemap switched to `dark_nolabels` + zoom cap 6.** No more street labels / city names. `maxzoom: 6` caps tile detail at country / sub-region scale so the basemap stops loading new tiles past that — pinch-zooming further is allowed but doesn't reveal streets. Same dark theme; just much less competing visual density under the graph.

**Files.**
- `src/components/dag3d/DAGNode3D.tsx` — card removed; props + helpers / locals trimmed.
- `src/components/CausalDAG3D.tsx` — stop passing `isSingleSelected`.
- `src/components/CausalDAGRelief.tsx` — `peakNodeId` + `peakAnchor` derivation; `InSceneElevationLegend` accepts `peakAnchor`.
- `src/components/CausalDAGMap.tsx` — `dark_nolabels` tile URL, `maxzoom: 6`.

**Verification.** `tsc --noEmit` clean; lint clean on touched files (pre-existing `ablationMode` warning unchanged); vitest 793/793 pass.

### 2026-05-07 — Shipped: 3D Canvas pointer-move invalidates coalesced to one per rAF

**PR:** TBD (about to open).

**Trigger.** Backlog item from PR #199 follow-up. The Canvas-level `onPointerMove` was an inline arrow that called `window.dispatchEvent(new Event("dag3d-invalidate"))` on every pointer-pixel-move. At typical 120Hz mouse polling that's ~120 dispatches/sec, each routing through `StoreInvalidator`'s listener and calling R3F's `invalidate()`. R3F coalesces frames internally so we weren't *rendering* 120Hz, but the per-event JS work (Event allocation + listener fire + invalidate bookkeeping) was non-trivial overhead just for keeping demand-mode responsive.

**What shipped.** rAF-coalesced handler in `CausalDAG3D`. An `invalidatePendingRef` flag gates dispatches: first move sets the flag and schedules a rAF; the rAF callback clears the flag and dispatches the invalidate. Subsequent moves before the rAF fires are no-ops. Worst case is now 60 dispatches/sec (or display rate, whichever is lower), regardless of mouse polling.

**Files.**
- `src/components/CausalDAG3D.tsx` — `onCanvasPointerMove` callback replacing the inline arrow.

**Verification.** `tsc --noEmit` clean; lint clean; vitest 793/793 pass.

### 2026-05-07 — Shipped: panel-canvas colour alignment + globe projection

**PR:** TBD (about to open).

**Trigger.** Two interlocking complaints:
1. *"The colours for the nodes aren't really matching what we have as colour coding for the main domains. Select any of the domains. It's not always the same colours rendering on the map. We should make them match."* — clicking a row in the bottom-left DOMAINS panel selected nodes that on canvas rendered in completely different colours from the panel row.
2. *"For the map I've kinda seen these dimension-map outline approaches — I like that idea. So if we [had] a 3D map instead, you'd have the same ability to zoom in/out. Would be great. … We do need to address the ability to … zoom in down to the street type of thing if you need to."* — the 2D mercator basemap with `maxzoom: 6` (from PR #270) was correct for "less busy" but cut off the street-level option entirely.

**What shipped.**

- **Unified colour resolver.** New `getDomainCardColor(rawDomain)` in `@/lib/domains` reverse-maps raw `n.domain` strings → `DomainCard.color` via the existing `DOMAIN_MAP`. `DOMAIN_MAP` itself moved out of `useFilteredGraph.ts` into `@/lib/domains` (its natural home alongside `DOMAIN_CARDS` / `DOMAIN_GROUPS`); `useFilteredGraph` now re-exports it for back-compat. 2D / 3D / Map node renderers all resolve colour via `getDomainCardColor → datasetColor → getDomainColor → getCategoryColor` so a click on the panel's "Energy Systems" row now selects orbs that render in the same red the row shows. Trade-off: nodes within a multi-domain card (e.g. all `defense-isr` sub-domains) collapse to a single card colour; per-sub-domain colour signal is lost on the canvas. Side-panel chips (NodeInspector, ModulePanel, TimeSeriesOverlay) keep their per-domain palette since those views are detail-oriented.
- **Globe projection on the Map view.** Added `projection: { type: "globe" }` to the maplibre style. Renders the world as a 3D sphere at low zoom and smoothly transitions to mercator as the user zooms in (built-in MapLibre v4 behaviour). Restored `maxzoom: 19` so street-level detail returns when the analysis demands it; the globe + `dark_nolabels` combination keeps the basemap visually quiet at typical zoom levels but doesn't hide the option to drill down.

**Files.**
- `src/lib/domains.ts` — new `DOMAIN_MAP`, `DOMAIN_TO_CARD`, `getDomainCardColor`.
- `src/hooks/useFilteredGraph.ts` — `DOMAIN_MAP` re-export.
- `src/components/CausalDAG2D.tsx` — colour resolver chain in `CausalNode2D`.
- `src/components/dag3d/DAGNode3D.tsx` — same chain on `baseColor`.
- `src/components/CausalDAGMap.tsx` — same chain on `domainColor`; `projection: globe`; `maxzoom` restored.

**Verification.** `tsc --noEmit` clean; lint clean (pre-existing `ablationMode` warning unchanged); vitest 793/793 pass.

### 2026-05-07 — Shipped: ISOLATE freeze unblocked + TOPO shift-lasso

**PR:** TBD (about to open).

**Trigger.** Two-item batch:
1. *"On the bottom-left domains panel, if I click [a domain row] and then click ISOLATE, it kinda slows down and freezes. … If I use lasso, it doesn't do that."* — clicking ISOLATE after a multi-domain pick blocked the main thread while React unmounted ~150 DAGNode3D + ~270 DAGEdge3D children in a single render cycle (and rebuilt 4 GeoJSON FCs in the Map view). Lasso selections were typically smaller, but the real perceptual difference was that lasso users had already paid the multi-select cost during the drag — the ISOLATE click only triggered the re-render at peak fan-out.
2. *"For the topological [view], a user should be able to select specific parts of the topology using the shift-lasso feature you have across the other views."* — TOPO had no marquee.

**What shipped.**

- **`startTransition` around the ISOLATE toggle.** `setIsolateSelection(...)` now runs inside `startTransition`, marking the resulting re-render as non-urgent. React keeps the current UI interactive while it computes the new tree (and processes the unmount cascade) in the background. The actual switch still takes its full ~150-300ms in the worst case, but the click feels instant — the button highlights immediately and the user can keep interacting with other controls. No data-shape changes; just a render-priority hint.
- **TOPO shift+drag lasso.** New `TopoShiftMarquee` component inside the relief Canvas (mirrors the 3D `ShiftMarquee` pattern). Listens on `gl.domElement` for `pointerdown/move/up`, gates on `e.shiftKey`, tracks a screen-space rect, and on release projects each node's ground-plane position (`layout.x - field.cx`, `0`, `layout.y - field.cy` — same translation `SelectionMarkers` uses) into screen coords for hit-testing. OrbitControls disabled during the drag so the camera doesn't rotate. DOM rect overlay rendered outside the Canvas, identical class set to 2D / 3D / Map for visual consistency.

**Files.**
- `src/components/dag3d/DAGOverlay.tsx` — `startTransition(() => setIsolateSelection(...))`.
- `src/components/CausalDAGRelief.tsx` — new `TopoShiftMarquee`; `selectionBoxRef`, `selectionRect`, `shiftDragging`, `handleShiftSelect` state in parent; OrbitControls.enabled bound to `!shiftDragging`; DOM overlay for the rect.

**Verification.** `tsc --noEmit` clean (modulo pre-existing `onboarding-metrics.test.ts` strictness errors inherited from main); lint clean; vitest 833/833 pass.

### 2026-05-07 — Shipped: maplibre-gl v5 upgrade — globe projection now actually works

**PR:** TBD (about to open).

**Trigger.** User: *"the 3D map doesn't seem to be working, still 2D"* — the `projection: { type: "globe" }` field I added in PR #281 was being silently ignored. Globe projection landed in **maplibre-gl v5.0**; we were on `^4.7.1`. v4 doesn't recognise the `projection` style field, so the globe never rendered.

**What shipped.** `maplibre-gl: ^4.7.1 → ^5.24.0`. `@vis.gl/react-maplibre@8.1.0`'s peer-dep range is `>=4.0.0`, so the upgrade is in-bounds; no companion bump needed. The existing `mapStyle.projection = { type: "globe" }` is now honoured, the `ProjectionSpecification` type is exported from the v5 style spec (typecheck stayed clean), and the v5 globe-projection runtime kicks in at low zoom and transitions to mercator as the user pinches in.

**Files.**
- `package.json`, `package-lock.json` — maplibre-gl version bump.

**Verification.** `tsc --noEmit` clean (same pre-existing onboarding-metrics test errors); vitest 833/833 pass.

### 2026-05-07 — Shipped: timeline range capped at "now" — no more 2030 scrub

**PR:** TBD (about to open).

**Trigger.** User: *"the bottom timeline allows us to go to like 2030 which doesn't make sense. Also I'm skeptical if the data is being categorized correctly with the date / time."*

**Diagnosis.** `loadRealTemporalData` in `src/lib/real-timeseries.ts` blindly min/maxed timestamps across every node's history to derive `rangeStart` / `rangeEnd`. Several sources in `public/datasets/claire/timeseries.json` carry forecast / target end-state rows that extend years past today (`2030-12-31` for one, plus monthly projections through 2027). Those pushed `rangeEnd` forward, the store wired `timelineRange.end` to it, and the bottom dial then let the user scrub into 2030.

**What shipped.** Cap `rangeEnd` at `Date.now()` while iterating timestamps. Forecast / future points stay in each node's `history` (so a future overlay can still plot them as projection if a feature wants that), but they don't drag the timeline range past the present. Plus a fallback: if every series turns out to be forecast-only or empty, default the range to the last 60 days instead of leaving it pinned at the 1970 sentinel.

**Files.**
- `src/lib/real-timeseries.ts` — future-point skip + empty-range fallback in the `rangeStart` / `rangeEnd` derivation.

**Out of scope.** Date-vs-value categorisation correctness (the second half of the user's report) is a domain-data question. The parser itself looks sound — ISO strings via `new Date(s)` and year numbers via `new Date(year, 0, 1)` — but verifying that each value is on the right date is a data-team job, not a rendering one. Will surface specific cases if the user provides them.

**Verification.** `tsc --noEmit` clean; vitest 843/843 pass.

### 2026-05-07 — Shipped: Map particles → imperative `setData`

**PR:** TBD (about to open).

**Trigger.** Backlog item flagged in earlier sessions. The particle layer's GeoJSON was held in `useState`, so `setParticleGeoJSON({...})` fired on every rAF tick (60fps). Each set forced a full React re-render of the Map subtree, which re-evaluated 5+ Source/Layer JSX expressions just so react-maplibre's `<Source data={...}>` reconciler could call `source.setData()` on the underlying maplibre source. The `setData` itself was the only thing that needed to happen per frame; everything around it was wasted.

**What shipped.** Direct route around React. The particle Source mounts once with a stable empty FeatureCollection, and the rAF callback writes new features into the underlying maplibre source via `mapRef.current.getMap().getSource('particles').setData(fc)`. A re-usable `Feature[]` buffer + FC wrapper lives in the effect's closure so we re-use the same array across frames (one fewer allocation per tick — ~60/sec saved). Phase state still lives in the existing `particlePhases` ref; nothing else changes about the physics.

Net effect: per-frame work shrinks from "render + diff + reconcile + setData" to a single `setData` call. Still correct on dependency changes (the effect tears down on `temporalEdgePaths` change and rebuilds the buffer + rAF).

**Files.**
- `src/components/CausalDAGMap.tsx` — `useState<FC>` removed; `writeData` helper inside the temporal-edge effect; Source's `data` prop bound to the stable empty FC.

**Verification.** `tsc --noEmit` clean; lint clean on touched file; vitest 843/843 pass.

### 2026-05-07 — Shipped: defer tab-gated ModulePanel sub-panels via next/dynamic

**PR:** TBD (about to open).

**Trigger.** Backlog: bundle-analyzer perf sweep (PR #222 wired the tooling). Sandbox can't run `ANALYZE=true npx next build` end-to-end — Google Fonts blocked + `ai`/`@ai-sdk/*` not installed — so I switched to static analysis. The ModulePanel mounts on first paint (right pane is the default), and it statically imports a swarm of sub-panels gated on the active module tab. Spirtes is the default tab; users on Spirtes were paying for the JS of every other tab's sub-panel.

**What shipped.** Four tab-gated sub-panels converted to `next/dynamic` with `ssr: false`:
- `MonteCarloForecast` (~714 LOC, Pearl tab)
- `VX880TrialPanel` (~910 LOC, Pearl tab)
- `InterdictionPanel` (~191 LOC, Pareto tab)
- `TissueCohortView` (~504 LOC, Spirtes tab but only when `isT1DDomain`)

Common loading hint (`<div>LOADING…</div>`) sized to the panel padding so the layout doesn't jump when the chunk lands. Inline panels (`TarskiPanel`, `ParetoPanel`, `CopilotInterdictionResults`, `SnapshotIndicator`) live as functions inside `ModulePanel.tsx` itself, so I'd need to extract them before they could be deferred — out of scope for a perf sweep, queued for later.

The Spirtes-tab default sub-panels (`TrinityPanel`, `DiscoveryRunsPanel`) stay static since they're on the critical path; `TrinityPanel` already lazy-loads its three Trinity graphs internally so there's no double-defer to chase.

**Files.**
- `src/components/ModulePanel.tsx` — four `dynamic()` declarations replacing the static imports.

**Notes for future sweep.** When the analyzer can be run end-to-end on a real env, things to look at next: the `tarski-data` axiom library size; estimator libs (`lppls-fit`, `ph-fit`, `pareto-relevance-bootstrap`) imported at module top-level — could be deferred to first-use; `framer-motion` is everywhere and probably unavoidable but worth confirming we're tree-shaking.

**Verification.** `tsc --noEmit` clean (modulo pre-existing inherited errors from `ai`-SDK types missing in sandbox + a known fci.test endpointMarks drift); lint pre-existing errors only (2 errors on lines 81 + 1806, both confirmed on main pre-merge); vitest 909/909 pass.

### 2026-05-07 — Shipped: launch-workspace freeze — O(N×E) → O(N+E) + defer Brandes' metrics

**PR:** TBD (about to open).

**Trigger.** User: *"manifold keeps freezing after I select domains and click LAUNCH WORKSPACE."* The launch flow synchronously runs:
1. `applyOmegaLiveAdjustments(g)` inside `setGraphData`
2. `omegaBridgeDensity(graph)` inside `StructuralMetrics`
3. `netMetrics` inside `CascadeHeader` (eigenvector + Brandes' edge betweenness + clustering + diameter BFS, all in one memo)
4. Canvas mount + `computeNetworkMetrics` + `compute2DForceLayout`

Items 2 + 3 each Brandes'-class O(V·E). Item 1 was secretly O(N×E) — `computeCascadeLoadDelta` ran `graph.edges.filter(e => e.source === node.id)` once per node. Combined cost on a CROSS-DOMAIN multi-card workspace blew past the user's freeze threshold.

**What shipped.**
- **`applyOmegaLiveAdjustments` linearised.** Pre-compute `outDegreeBy: Map<sourceId, count>` once in O(N+E), then look up each node's out-degree in O(1). New internal helper `computeCascadeLoadDeltaFromOutDegree` so the per-node math doesn't re-scan all edges. Original exported `computeCascadeLoadDelta(node, graph)` kept for back-compat with tests.
- **`useDeferredValue` on the heavy metric paths.** `StructuralMetrics` wraps `graph` in `useDeferredValue` before passing it to `omegaBridgeDensity`. `CascadeHeader` wraps both `graphData` and `selectedNodes` and threads the deferred refs through `cascade`, `netMetrics`, and the deps array. The strip + panel paint immediately with whatever value React has (stale by one frame on a graph swap); the recompute lands as a low-priority work unit afterwards. Launch feels interactive instead of locked.

**Files.**
- `src/lib/omega-pillar-wiring.ts` — out-degree pre-pass + private `computeCascadeLoadDeltaFromOutDegree`.
- `src/components/StructuralMetrics.tsx` — `useDeferredValue(graph)` before `omegaBridgeDensity`.
- `src/components/ModulePanel.tsx` — `useDeferredValue` on `graphData` + `selectedNodes` in `CascadeHeader`.

**Verification.** `tsc --noEmit` clean (modulo same pre-existing inherited errors); lint pre-existing errors only; vitest 918/918 pass.

### 2026-05-07 — Shipped: relief-field 4σ Gaussian truncation

**PR:** TBD (about to open).

**Trigger.** Backlog: TOPO compute-shader port for real-time scrub. The headline item was a full GPU port (multi-PR, requires WebGL render-to-texture + vertex-shader sampling). Before paying that cost, lower the CPU bar with a math-level optimisation.

**Diagnosis.** All three field-compute paths (`computeReliefField`, `computeReliefLayers`, `computeFusedReliefField`) call `Math.exp(-(dx² + dy²) / σ²)` once per (grid-vertex × sample). For a 128² grid × 200 samples that's 3.3M exp evals; multi-domain stacks the cost across layers. `Math.exp` is the dominant kernel cost.

**What shipped.** A 4σ truncation around the squared-distance check. `exp(-16) ≈ 1.1e-7`, which contributes nothing visible to the rendered surface. For typical layouts each grid point only "sees" 10-30 of the 200 samples within `truncSq = 16·σ²`, so the inner loop short-circuits ~85% of its iterations before the exp call. End-to-end ~5-10× speedup on the single-domain path; the savings compound on the multi-domain fused path because they apply per-layer.

The full GPU compute-shader port is still queued — if real-time scrub still drops frames after this lands in production, the next step is a Web Worker port (cheaper than GPU), then a WebGL render-target if needed.

**Files.**
- `src/lib/graph-relief-field.ts` — `truncSq` constant + squared-distance early-out in all three field-compute inner loops.

**Verification.** `tsc --noEmit` clean; vitest 918/918 pass (22 of which are relief-field-specific).

### 2026-05-07 — Shipped: stop CausalDAG2D from running its layout sim on launch

**PR:** TBD (about to open).

**Trigger.** User: *"still keeps freezing"* after the previous launch-workspace fix. Identified the remaining sync hog: `CausalDAG2D` was statically imported and always-mounted (with `visibility: hidden` for instant view-switching), so its `compute2DForceLayout` + `computeNetworkMetrics` ran *in parallel* with the 3D path's equivalents on every launch — even though the user lands on 3D and the 2D canvas is hidden.

The always-mount pattern was in place to keep the 3D WebGL context alive across view switches (the browser's GPU process can deallocate it on remount). 2D doesn't carry a WebGL context — it renders through React Flow — so the rationale doesn't apply to it.

**What shipped.** `CausalDAG2D` converted to `next/dynamic` (matching Map / Relief) and conditionally rendered only when `viewMode === "2d"`. 3D stays always-mounted with the `visibility: hidden` toggle. Trade-off: first switch from 3D → 2D pays a chunk-load + layout-compute beat (~300-500ms on a 500-node CROSS-DOMAIN workspace), same shape as the existing first-Map and first-Relief switch.

**Files.**
- `src/app/page.tsx` — `CausalDAG2D` static import → `dynamic`; render block wrapped in `viewMode === "2d"` gate.

**Verification.** `tsc --noEmit` clean; vitest 918/918 pass.

---

### 2026-05-22 — Shipped: Map geo-placement — unbreak US clustering, fill 5 missing domains

**PR:** TBD (about to open).

**Trigger.** User: *"a lot of the nodes, for example, in the US are just kinda cluttered in the same area, which makes me kinda skeptical about node placement … whatever the closest estimate is for what would be the physical location of that node, we should get … down to the city if we can."*

**Diagnosis** (`src/lib/geo-coordinates.ts`):
1. The US country centroid was `[-95.7, 37.1]` — the geographic centre of the country, in rural Kansas. Every "100% US" node hashed within ±2° of that single point → the visible Oklahoma blob.
2. `NODE_COORDINATES` covered ~150 nodes, all Saudi/Qatar/Ma'aden + a sparse handful in financial centres. Five whole domains had zero entries: **Athena ISR / Defense, T1D β-cell biology, T1D VX-880, AI Safety / IDS, Macro Impact, Frontier Science**. Their nodes fell through to a single domain-centroid with ±3° jitter, or to the Middle East seed when the domain wasn't in the table either.
3. The `globalConcentration` country regex only matched the explicit `"100% Country"` form, so strings like `"60% US / 40% global"` or `"Headquartered in Boston"` fell through entirely.

**What shipped.**
- **~100 new `NODE_COORDINATES` entries** for the five missing domains. Pinned to the institution / company / site that owns each concept: Athena ISR → US defense corridor (NVIDIA Santa Clara, Raytheon Waltham, NSA Fort Meade, Anduril Costa Mesa, Palantir Denver, Pentagon, Schriever AFB, SpaceX Hawthorne…); Macro Impact → BLS / BEA / Fed in DC + ISM Chicago + NY Fed; T1D β-cell → Joslin / Vertex / NIDDK / Dexcom / Stanford; T1D VX-880 → Vertex Seaport Boston (all 26 trial-endpoint nodes anchored at the sponsor HQ with hash jitter); AI Safety / IDS → UNB CIC Fredericton + UNSW Sydney + Aegean Greece (matched to dataset provenance); Frontier Science → ADMX, LIGO Hanford, Fermilab, ALMA Atacama, Super-Kamiokande.
- **`US_HUBS` replaces the single Kansas centroid.** When a node resolves to "United States" via the country regex without a specific pin, it's now spread across 10 hub-cities (NYC / DC / Boston / Chicago / SF / Seattle / LA / Houston / Atlanta / Denver) by hash bucket, with ±0.6° jitter inside the bucket. Visually: distributed across US economic / policy / tech corridors instead of stacked on Oklahoma.
- **`CITY_COORDINATES` city/institution scan.** Before falling through to the country regex, the resolver now scans `globalConcentration` for ~50 known city names (US metros + international hubs). Catches "Headquartered in Boston" / "based in Singapore" / etc.
- **Smarter country regex.** Replaced the `100% (country)` form with a percent-prefix + general country mention sweep. Handles plural-percent strings, "Sourced from Japan and South Korea", "Headquartered in Saudi Arabia, exports global". Sorted by name length so "United States" wins over "States".
- **`COUNTRY_COORDINATES` extended** with Canada, Mexico, UK, Germany, France, Italy, Spain, Netherlands, Switzerland, Japan, South Korea, Singapore, Indonesia, Greece, Russia, Nigeria + USA/US aliases. 16 → 32 countries.
- **`DOMAIN_COORDINATES` extended** with the new families' domain centroids so the last-ditch fallback still lands the node somewhere sensible if no NODE_COORDINATES entry exists.

**Files.**
- `src/lib/geo-coordinates.ts` — rewritten resolver + expanded tables.
- `src/lib/__tests__/geo-coordinates.test.ts` — new, 9 tests covering exact match, city scan, US-hub spread, country-regex variants (`100% China`, `60% Brazil / 40% global`, embedded mention), and domain-centroid fallback.

**Verification.** `tsc --noEmit` clean (same pre-existing inherited errors); lint clean on touched files; vitest **1319/1319** pass.

---

### 2026-05-22 — Shipped: remove stray "CLIENT DEPLOYMENT → Athena Defense" CTA from the canvas

**PR:** TBD (about to open).

**Trigger.** User: *"we randomly have on the bottom right of the product itself … CLIENT DEPLOYMENT … ATHENA DEFENSE SYSTEMS. It's just so random. I feel like this was intended to be a sandbox, but it seems like it's heavily out of date now … if we're gonna offer a sandbox, I feel like there's a different format that we should do it."*

**What shipped.** Removed the `bottom-4 right-4` floating `<Link href="/client">` and dropped the now-unused `next/link` import in `src/app/page.tsx`. The `/client` route itself stays put — that's a separate decision; this PR only takes the CTA off the workspace canvas where it was reading as a promo on top of the user's live analysis.

**Files.**
- `src/app/page.tsx` — removed the floating CTA + `Link` import.

**Verification.** `tsc --noEmit` clean (same inherited fci.test drift); lint clean on touched file; vitest 1319/1319 pass.

---

### 2026-05-22 — Shipped: layout-3D + network-metrics moved off the main thread (Web Worker)

**PR:** TBD (about to open).

**Trigger.** Backlog: Web Worker port of `computeLayout3D` / `computeNetworkMetrics`. After the launch-perf chain (PRs #301 / #303 / #304) the user's freeze report stopped, but the d3-force-3d sim + Brandes' centrality were still running synchronously on first 3D mount and on every `topologyKey` change (domain toggle, edge sever). Those are the heaviest pure-data computes in the canvas; moving them off-thread is the right architectural fix.

**What shipped.**

- **`src/lib/workers/layout3d-worker.ts`** — Module-mode Web Worker. Handles `{ id, nodes, edges, prev? }` requests; returns `{ id, positions, metrics }` in one shot (bundled so the canvas doesn't need a second postMessage roundtrip). Both compute functions are pure — perfect worker fodder.

- **`src/lib/workers/layout3d-client.ts`** — Main-thread wrapper. Lazily spins up a single shared worker on first call, multiplexes concurrent requests via a `nextId` epoch, routes each response back to its caller. Includes an SSR / no-Worker fallback that dynamic-imports the sync functions, so the API contract stays Promise-shaped everywhere.

- **`CausalDAG3D.tsx` refactor.** The `positions` and `networkMetrics` useMemos are gone. In their place: a `layoutResult` state populated by an effect on `topologyKey` change, plus a `latestRequestIdRef` to drop stale responses when topology flips multiple times in quick succession (fast domain toggling). Previous positions stay rendered while a new layout computes — no flash, no main-thread block. First-mount-only `COMPUTING LAYOUT…` overlay covers the brief gap before the worker returns the initial layout (the WebGL canvas mounts immediately once the dynamic chunk loads, but orbs can't render until positions arrive).

- **Stable references** — `positions` / `networkMetrics` derivations are wrapped in `useMemo` so the array/map references stay stable across renders that don't actually flip `layoutResult`. Otherwise downstream `useMemo`s keyed on `positions` would invalidate every render.

**Files.**
- `src/lib/workers/layout3d-worker.ts` (new)
- `src/lib/workers/layout3d-client.ts` (new)
- `src/lib/workers/__tests__/layout3d-client.test.ts` (new — 2 tests covering the SSR fallback path: returns positions + metrics for every node; assigns a different id to each call)
- `src/components/CausalDAG3D.tsx` — sync useMemos → async effect + state + overlay; removed the value imports of `computeLayout3D` / `computeNetworkMetrics` (kept the types).

**Verification.** `tsc --noEmit` clean (same inherited fci.test drift); lint clean on touched files (pre-existing `chiStarSet` warning unchanged); vitest **1321 / 1321** pass.

**Follow-ups.** `CausalDAG2D` still runs `computeNetworkMetrics` synchronously on the main thread. Same pattern would apply (2D layout is light enough that it probably doesn't need the worker, but the metrics compute is identical to 3D's). Defer until needed — 2D is only mounted when actively in 2D view.

---

### 2026-05-22 — Shipped: extract inline ModulePanel panels into `next/dynamic` chunks

**PR:** TBD (about to open).

**Trigger.** Backlog: bundle-size load-time push. PR #300 lazy-loaded the four sub-panels that already lived in their own files. The remaining inline definitions (`TarskiPanel`, `ParetoPanel`, `CopilotInterdictionResults`, `SnapshotIndicator`, plus their co-located helpers — `AxiomIcon`, `ProofTraceList`, `CritSparklineChart`, `CritSparkline`, `shortenEventLabel`, `CriticalityCard`, `type CriticalityEmptyState`) couldn't be deferred without first extracting them to their own files. ~2.5K LOC + heavy estimator-lib transitive deps shipped on every initial paint, even though Spirtes is the only default tab that needs none of them.

**What shipped.**

Three new files under `src/components/modules/`:

- **`CopilotInterdictionResults.tsx`** (~253 LOC) — Pearl-tab solver results card.
- **`TarskiPanel.tsx`** (~599 LOC) — Tarski-tab axiom panel + its two private helpers (`AxiomIcon`, `ProofTraceList`). Brings `AXIOM_LIBRARY`, `scoreAxiomRelevance` with it.
- **`ParetoPanel.tsx`** (~1.78K LOC) — Pareto-tab criticality observation panel, the heaviest of the three. Co-locates `SnapshotIndicator` (named export so the outer `ModulePanel` can dynamic-import both from the same chunk), the two sparkline components, `shortenEventLabel`, `CriticalityCard`, and the `CriticalityEmptyState` type. Pulls the estimator-lib transitive deps with it: `lppls-fit`, `ph-fit`, `pareto-relevance-bootstrap`, `pareto-relevance-reference`, `moran`, `t1d-estimator-inputs`.

In `ModulePanel.tsx`:
- Removed all four inline definitions and their helpers.
- Trimmed the imports list — dropped 14 lib-level imports (estimator regime gates, lppls/ph fits, criticality registry, tarski-data, etc.) that the extracted files now own. Also dropped `useCallback`, `useRef`, `SnapshotDiagnostics`.
- Added four `next/dynamic` declarations for `TarskiPanel`, `ParetoPanel`, `CopilotInterdictionResults`, and the named `SnapshotIndicator` (via `.then(m => ({ default: m.SnapshotIndicator }))` so it shares the ParetoPanel chunk).

`ModulePanel.tsx` shrank **3384 LOC → 821 LOC**. The default Spirtes-tab first paint is now `CascadeHeader` + `TrinityPanel` + `DiscoveryRunsPanel` (+ optional `TissueCohortView`) — all the heavy regime-gate / criticality-card code is deferred to first-tab-visit.

**Files.**
- `src/components/modules/CopilotInterdictionResults.tsx` (new)
- `src/components/modules/TarskiPanel.tsx` (new)
- `src/components/modules/ParetoPanel.tsx` (new)
- `src/components/ModulePanel.tsx` — trimmed
- `src/lib/workers/__tests__/layout3d-client.test.ts` — drive-by: fixed two missing fields on the test graph fixture (`isConfounded` on nodes, `inconsistentEdges` / `restrictedNodes` on metadata) that tsc started flagging since PR #404 landed

**Verification.** `tsc --noEmit` clean (same pre-existing inherited errors); lint has 2 errors that are the SAME pre-existing `set-state-in-effect` + `rules-of-hooks` warnings from the original inline definitions (just moved to their new files, identical code); vitest 1321 / 1321 pass.

---

### 2026-05-22 — Shipped: 2D layout sim moves off the main thread (Worker reuse)

**PR:** TBD (about to open).

**Trigger.** Continuation of the load-time arc. PR #404 moved the 3D layout + centrality off the main thread; 2D was still running both synchronously inside the same component. After PR #304 made `CausalDAG2D` lazy + conditional, that compute no longer hits launch — but the first user-initiated 2D-tab visit was still paying ~150-300ms of main-thread block on a 500-node CROSS-DOMAIN workspace.

Estimator-lib audit (the other backlog candidate) turned out to be a no-op in production — the heavy libs (`lppls-fit`, `ph-fit`, `pareto-relevance-bootstrap`) are only reachable from `modules/ParetoPanel.tsx` after PR #406, so they already ship only in the Pareto chunk. The `csd-fit-hypo-calibrator.ts` consumer is reachable only from a test fixture, not the runtime bundle. Closed that ticket as already-done.

**What shipped.**

- **Worker generalised.** `src/lib/workers/layout3d-worker.ts` now dispatches on a `kind: "layout3d" | "layout2d"` discriminator. 3D path unchanged; 2D path runs `compute2DForceLayout(nodes, edges)` + `computeNetworkMetrics(nodes, edges)` and posts back `{ positions2d: Map<string, Position2D>, metrics }`. Both layouts share one worker instance.
- **Client wrapper got a `requestLayout2D` sibling** to `requestLayout3D`. Same epoch-cancellation pattern, same SSR-fallback path (dynamic-imports the sync functions when `Worker` is unavailable).
- **`CausalDAG2D` refactor.** The synchronous `compute2DForceLayout` + `computeNetworkMetrics` useMemos are gone. In their place: a `useEffect` keyed on the graph `sig` that posts to the worker, plus `cachedLayout` / `networkMetrics` state populated when the response lands. `latestRequestIdRef` drops stale responses on fast topology changes — same epoch pattern as `CausalDAG3D`. Previously-rendered orbs stay put while a new layout computes.

**Files.**
- `src/lib/workers/layout3d-worker.ts` — kind discriminator, 2D dispatch arm.
- `src/lib/workers/layout3d-client.ts` — `requestLayout2D` export + shared worker bookkeeping.
- `src/lib/workers/__tests__/layout3d-client.test.ts` — added one fallback-path test for `requestLayout2D`.
- `src/components/CausalDAG2D.tsx` — imports trimmed, sync useMemos → async effect + state.

**Verification.** `tsc --noEmit` clean (same pre-existing inherited errors); lint clean on touched files; vitest 1322 / 1322 pass.

---

### 2026-05-22 — Shipped: dial-scrub contraction round 2 — visible at typical historical omegas

**PR:** TBD (about to open).

**Trigger.** User reported PR #427 still wasn't moving orbs on dial scrub. Traced end-to-end and the wiring was correct (`useTemporalGraph` injects per-tick omega values into `graphData.nodes[].omegaFragility.composite`; `useFilteredGraph` passes the temporal graph through; both 2D and 3D consume it in their contraction passes). The actual gap was **stress magnitude**: synthetic temporal data's random walk drifts within ±0.5 of base, so typical historical omegas sit in the 5–7 band. The old `(omega-5)/5` (2D) and `(omega-5)/4` (3D) stress curves only produced stress 0.1–0.3 at those levels → centroid pulls of 3–14 % of distance — visible if you stare, invisible otherwise.

**What shipped.**

- **2D `CONTRACTION` 0.35 → 0.55** and **stress curve `(omega-5)/5` → `(omega-4)/4`** (both the self branch and the `neighborStressOf` branch). Typical omegas 5–7 now produce stress 0.25–0.75 → pull 14–41 % of distance to the stressed-neighbour centroid. Visibly readable.

- **3D historical stress curve `(omega-5)/4` → `(omega-4)/3`.** Bracketed by the existing `PULL_MAX=0.45` and `PUSH_MAX=0.25`. Typical omegas now produce stress 0.33–1.0 instead of 0.25–0.5 — visibly tighter contraction on stressed nodes and visibly more dispersion on relaxed ones.

Cascade-replay path (using `currentSnapshot.shockIntensity`) is unchanged — that path always had access to the proper full-range stress signal.

**Files.**
- `src/components/CausalDAG2D.tsx` — CONTRACTION + both stress curves bumped.
- `src/components/CausalDAG3D.tsx` — historical stress curve bumped.

**Verification.** `tsc --noEmit` clean; vitest 1522 / 1522 pass.

### 2026-05-22 — Shipped: `flow` edge type + per-type visibility toggle row

**PR:** TBD (about to open).

**Trigger.** User: *"we have directed relationships. We have temporal relationships. And we should also have a flow relationship where it might make sense. And one thing we should give the ability to is to be able to toggle different types of connections we want to be able to see visually."*

**What shipped.**

1. **New `"flow"` edge type.** `EdgeType = "directed" | "temporal" | "confounded"` becomes `EdgeType = "directed" | "temporal" | "confounded" | "flow"`. Visual: solid teal-green (`#1de9b6`), arrow on target, animated particle with a slightly faster cadence than `"temporal"` so the eye reads "stuff in motion" vs `"temporal"`'s slower "lag" cadence. Distinct from `"directed"` (a causal claim) and `"temporal"` (a lag correlation) — flow is "material / capital / signal is actually moving along this edge."
2. **Store-side visibility filter.** New `visibleEdgeTypes: Set<EdgeType>` slice + `toggleEdgeTypeVisibility(type)` action + `setVisibleEdgeTypes(types)` setter. Default = all four types visible. Empty Set is treated as "all visible" by consumers so older sessions without the setting still render every edge.
3. **UI: chip row in `DAGOverlay`.** Four chips (CAUSAL / TEMP / CONF / FLOW) live in the top-right near the LEGEND button, on 3D / 2D / Map. Click to toggle each type on/off across every canvas. Chip background uses the type's colour at low opacity when visible, fades to muted grey when hidden.
4. **All four canvas surfaces wired.** 2D filters at the `visibleEdges` useMemo via `edgeById` lookup (O(1) per edge); 3D filters inline in the edge map at `CausalDAG3D.tsx`; Map filters at the GeoJSON-build forEach loop. The rendering switch statements in each (2D `EmphasizedEdge`, `DAGEdge3D.getEdgeColor`, Map's `edgeColor` ternary chain) now include the `"flow"` case rendering the teal-green solid + arrow.
5. **LEGEND popover.** Added the FLOW row alongside CAUSAL / TEMPORAL / CONFOUNDED, with a teal-green swatch.

**Caveats.** No existing dataset carries `type: "flow"` yet — the rendering + filter infrastructure is in place, but the user will only see flow edges once data sources tag edges that way. Data-team alignment needed on the semantic ("material flow" vs "capital flow" vs "cascade-propagation flow" — anything that's actually-in-motion belongs here, anything that's a causal claim stays as `"directed"`).

**Files.**
- `src/lib/types.ts` — `EdgeType` union extended.
- `src/stores/useApexStore.ts` — `visibleEdgeTypes` slice + toggle.
- `src/components/dag3d/DAGOverlay.tsx` — chip strip + new LEGEND row.
- `src/components/CausalDAG2D.tsx` — `visibleEdges` filter; `isFlow` color/arrow handling.
- `src/components/CausalDAG3D.tsx` — inline filter in edge map.
- `src/components/dag3d/DAGEdge3D.tsx` — `"flow"` case in `getEdgeColor`; faster anim cadence for flow.
- `src/components/CausalDAGMap.tsx` — filter at edges forEach; `"flow"` colour branch.
- `src/lib/__tests__/store-visible-edge-types.test.ts` — new, 5 tests covering toggle / set / empty-set back-compat.

**Verification.** `tsc --noEmit` clean (modulo pre-existing inherited errors); lint pre-existing warnings only; vitest **1511 / 1511** pass.

### 2026-05-22 — Shipped: collapsible time-dial granularity picker

**PR:** TBD (about to open).

**Trigger.** User: *"the time dial itself has a very extensive selection window now all the way from one hour to all. We should make that collapsible so that there's more room for the time dial itself as well."*

**What shipped.** `TimeDial` granularity picker now collapses to a single chip showing the active preset (e.g. `1Y ▾`). Clicking the chip expands the full row (1H / 1D / 1W / 1M / 1Y / 5Y / ALL); picking any preset re-collapses. No behavioural change beyond the toggle — same `setTimelineGranularity` writes, same group-divider styling when expanded, same tooltips.

**Files.**
- `src/components/TimeDial.tsx` — `granularityExpanded` state; render-time branch on the granularity block.

**Verification.** `tsc --noEmit` clean; lint clean; vitest 1504 / 1504 pass.

### 2026-05-22 — Shipped: load-time deep-dive round 1 — lazy SystemCopilot + lazy heavy copilot-tool deps

**PR:** TBD (about to open).

**Trigger.** User asked for a platform load-time deep-dive. Found a clear gap: `SystemCopilot` was statically imported on `page.tsx` (~2 K LOC component), and its dep chain pulled in **~6,800 LOC of graph data + axiom library** via `copilot-actions` → `copilot/tools.ts` → `buildGraphFromDomains` + `AXIOM_LIBRARY`. The graph-data side was supposed to be lazy-loaded (the comment in `page.tsx` near `DomainSelector` even calls it out as a deliberate split), but the copilot tools registry undid that split by side-effect importing the same heavy modules.

**What shipped.**

1. **`SystemCopilot` → `next/dynamic`.** The whole left-column copilot chunk now ships separately. A small `LOADING COPILOT…` placeholder shows in the column for ~50-100 ms after first paint, then the chat surface mounts. Everything copilot-related (tools, conversation, the copilot-engine, copilot-context) lazy-loads in the copilot chunk.

2. **`copilot/tools.ts` lazy-imports its heavy deps.** Top-of-file `import { buildGraphFromDomains }` and `import { AXIOM_LIBRARY }` removed; both replaced with `await import(...)` inline inside the specific tool handlers that need them (`applyDomainFilter` and the axiom-filtered restricted-nodes handler). Result: even inside the copilot chunk, the graph-data + axiom-library blocks only load when a user actually invokes those tools — small async delay on first use, otherwise free.

The `applyDomainFilter` helper became `async`; its callers (the `set_domains` / `select_domains` tool handlers) were already typed `string | Promise<string>` so no signature changes upstream. The `remove_restricted_nodes` handler was synchronous; bumped it to `async`.

**Files.**
- `src/app/page.tsx` — `SystemCopilot` static import → `dynamic`.
- `src/lib/copilot/tools.ts` — heavy imports moved to inline `await import(...)` inside the consuming handlers.

**Verification.** `tsc --noEmit` clean (modulo pre-existing inherited errors); lint clean; vitest 1504 / 1504 pass.

### 2026-05-22 — Shipped: 2D contraction now responds to time-dial scrub, not just cascade replay

**PR:** TBD (about to open).

**Trigger.** User: *"previously, when we were running this criticality, you should be able to see distance measures changing as you play the time dial forward."* Scrubbing the dial was visually altering colour / glow / orb size per-tick, but the canvas was positionally frozen — orbs stayed at their cached layout coordinates regardless of how the per-node ΩF (criticality) was changing.

**Diagnosis.** Two different paths populate per-tick criticality:
- **Cascade replay** populates `currentSnapshot.nodeStates[]` per epoch.
- **Time-dial scrub** uses `useTemporalGraph` to inject historical ΩF values directly into `graphData.nodes[].omegaFragility.composite`. `currentSnapshot` stays null.

`CausalDAG3D.posMap` already handled both: when `currentSnapshot` is null but a node carries a non-neutral omega, it derives stress from `(omega - 5) / 4` and applies push/pull. `CausalDAG2D`'s contraction was hard-coded to the `if (currentSnapshot)` branch only — so dial-scrub left it positionally frozen.

**What shipped.**
- Added a historical-omega fallback path inside `CausalDAG2D`'s `nodes` useMemo. When `currentSnapshot` is null, derives stress as `max(0, (omega − 5) / 5)` and pulls the node toward its stressed-neighbour centroid the same way. Below-neutral omega doesn't contract (2D's contraction is one-directional by design — only pulls inward).
- Bumped `CONTRACTION` magnitude 0.18 → 0.35. The original was visually subtle even at peak shock; the new floor pinches stressed clusters tight enough that the eye actually catches the movement during a typical scrub.

**Files.**
- `src/components/CausalDAG2D.tsx` — historical-mode stress derivation + magnitude bump.

**Verification.** `tsc --noEmit` clean (modulo pre-existing inherited errors); lint clean on touched file; vitest 1489 / 1489 pass.

---

## How a fresh session resumes

1. Read this file bottom-up — the most recent entry is the live state.
2. Check the session brief in scrollback or in `~/.claude/projects/-Users-Junaid-Documents-apex-terminal/memory/` for the canonical scope.
3. Confirm branch: `git branch --show-current` should be `claude/rendering-perf-manifold-UblqD`. Check `git status` and `git log --oneline -5` to see what's landed locally vs pushed vs merged.
4. Check open PRs in `ApexAnalytica/apex-terminal` filtered to this branch / session label.
5. Resume from the most recent "In progress" or "Next" line above.

---

## spirtes-live-scoping.md

# Phase-2 Spirtes-live — scoping

**Status:** scoping draft, not yet implementation. Owned by the SPIRTES session.
Builds on the FCI work shipped 2026-05 (`src/lib/discovery/algorithms/fci.ts`,
v0.4) and the existing offline pipeline at `src/lib/discovery/`.

---

## 1. The goal — what "Spirtes-live" means concretely

The four right-panel SPIRTES views (DCD / PCMCI+ / FCI / StructuralMetrics)
currently render **precomputed** discovery tags from `src/lib/graph-data.ts`.
`discoverySource: "DCD" | "PCMCI+" | "FCI" | "merged"` and `isConfounded`
are static labels baked into the curated graph. The user looks at the FCI
panel and sees a curator's confounder hypotheses; they don't see *the
algorithm running*.

Spirtes-live closes that gap. The algorithms run on real data. The panels
display algorithm output, not labels. The end-state is:

- Open a domain in the workspace → its associated cohort loads.
- Algorithms run (lag-correlation, PCMCI+, FCI) over a rolling window of
  the cohort's time-series.
- Each panel renders **its** algorithm's output: PCMCI+ shows the lag
  graph, FCI shows the PAG with endpoint marks, etc.
- Re-run on data refresh (live feed tick, granularity change, or a
  manual "rerun" button).

Out of scope here: making it run on the geopolitical / macro graph
(those don't have an associated cohort yet) and fully replacing the
curated `discoverySource` field (the curator overrides remain valuable
when algorithm output is silent or noisy).

---

## 2. The architectural prerequisite — CausalGraph ↔ Cohort

The runtime graph and the cohort schema speak different languages:

| | Source | Shape |
| --- | --- | --- |
| **`CausalGraph`** | `src/lib/graph-data.ts` and friends | Curated nodes + edges. No time series. Used by every panel today. |
| **`Cohort`** | `src/lib/discovery/cohort-types.ts` | Subjects × measurements over time. PHI-free by construction. Consumed by `DiscoveryAlgorithm.run`. |

FCI takes a `Cohort`, returns a `DiscoveryResult`. The FCI panel reads a
`CausalGraph`. There's no built-in conversion in either direction.

The bridge is the central architectural decision:

### Option A — Cohort-per-domain (preferred for T1D)

Each domain ships an associated cohort. T1D already has cohorts via
`src/lib/discovery/ingesters/` (OhioT1DM, JAEB, hall-cgm). The
`DiscoveryRun` carries the cohort id, so output edges have a defined
mapping back to the variables in the cohort.

For T1D this is straightforward — `cohort.variables[].id` aligns with
`CausalNode.id` for nodes that come from cohort data (CGM, insulin
delivery, meals, etc.). Curated nodes that aren't directly measured
(e.g. β-cell mass) don't appear in the cohort and so don't get
algorithm-discovered edges; their existing curated edges remain.

**For non-T1D domains**: geopolitical / macro doesn't have a cohort
today. Either (a) add a cohort source (the live API feeds — EIA, OFAC,
FRED — could be normalised into a single-cohort multi-subject view), or
(b) Spirtes-live is T1D-only initially and unlocks for other domains as
their cohorts arrive.

Recommended: ship Spirtes-live for T1D first; macro / geopolitical
unlocks when their feed-derived cohort is normalised.

### Option B — DiscoveryRun-as-source

The pipeline already writes `DiscoveryRun` JSON records. The panel
loads the most recent `DiscoveryRun` for the active cohort and
renders its edges. The actual algorithm doesn't run when the panel
mounts — the run was triggered offline (cron, post-ingest hook,
manual script).

**Pro:** zero compute on the client. Audit-friendly. Determines what
the user sees from a known artefact.
**Con:** "live" is a misnomer — output is whatever was computed at
ingest time. Doesn't react to live feed ticks within a session.

### Option C — Hybrid: stored runs + on-demand re-run

Mostly Option B (panel reads stored DiscoveryRun), with a per-panel
"Rerun" button that triggers a fresh algorithm execution against the
current cohort + window. New result becomes the displayed run.

**Pro:** fast load (cached run), interactive (rerun is explicit).
**Con:** more moving parts; need a persistence story for re-run results.

**Recommendation:** Option C as the long-term shape; ship Option B as
the first PR (read-only display of the stored run); add the on-demand
rerun in a follow-up.

---

## 3. Algorithm execution — where compute runs

### In-browser, main thread

Cheapest. Just call `fciAlgorithm.run(cohort)` in the React tree.

**Problem:** PCMCI+ on a 200-row × 12-variable cohort with 5 conditioning
depths can take seconds. FCI is roughly O(n³) skeleton + O(n²)
orientation; for n ≈ 30 variables it's <100ms, for n ≈ 100 it's >1s.
Blocks the UI thread. Bad.

Verdict: only viable for n < 20 variables.

### In-browser, Web Worker

Same code, off-main-thread. Cohort + params marshalled across
`postMessage`, result returned the same way.

**Pro:** no infra, no auth, no rate limits. Algorithms are deterministic
pure functions — perfect for workers. The discovery algorithm interface
(`DiscoveryAlgorithm<P>`) was explicitly designed to be pure (no fs /
network) so this drops in cleanly.
**Con:** transferring large cohorts via `postMessage` has a one-time
serialisation cost. Cancellation needs explicit message protocol.
Bundle size grows by the algorithm code. No persistence — every
session re-runs unless we cache results in IndexedDB.

### Server-side, request-response

`POST /api/discovery/run` enqueues a job, polls for completion, returns
`DiscoveryRun`. Already foreshadowed in `algorithm-interface.ts`'s
"ENTERPRISE LADDER" comment.

**Pro:** unbounded compute. Audit-trail. Can cache by cohort hash.
Parallelizes across cohorts.
**Con:** infra (worker, queue, persistence). Not free latency-wise.
Auth-bound.

### Server-side streaming (SSE / WebSocket)

For long-running algorithms (PCMCI+ on 5000-row cohorts), stream
incremental results — phase-by-phase progress. UX shows live progress.

**Pro:** best UX for slow runs. Lets the user see the skeleton phase
before the orientation phase finishes.
**Con:** most infra work; only worth it if runs take more than ~5s.

**Recommendation:** **Web Worker** for the first PR. Algorithms in this
codebase are within tractable bounds for client compute. Server-side
becomes the next step when graph size or auth-attribution requires it.

---

## 4. Async UX — running / stale / done

The panel needs to communicate three states:

| State | When | UI |
| --- | --- | --- |
| **Idle** | No run yet for this cohort | Empty-state with "RUN" button |
| **Running** | Worker compute in flight | Subtle progress bar / spinner over the panel; existing tags fade |
| **Stale** | Cohort changed (new feed tick, new domain selected) since last run | Orange "STALE — rerun" banner |
| **Fresh** | Run is current | No banner; tags rendered |
| **Failed** | Worker errored or returned `partial`/`failed` | Red error chip with retry |

Idempotency: re-rendering with the same `(cohortHash, params)` should
not re-run. Hash the cohort source content — `Cohort.source.sourceHash`
already exists on the schema for this. New result invalidates by
`(cohortHash, algorithmId, paramsHash)`.

Cancellation: when the user navigates away or the cohort changes
mid-run, the worker request should be abandoned. The worker doesn't
need true cancellation; just ignore the late result.

---

## 5. Performance budget

Real cohort sizes (currently shipped ingesters):

- **OhioT1DM**: ~12 variables × 50,000 measurements / subject × 12 subjects
- **JAEB**: similar
- **hall-cgm**: smaller, single-subject

After grid-construction, the per-cohort matrix is roughly 12 variables
× 5,000 grid points (concatenated across subjects).

FCI cost on this cohort:
- Skeleton phase: O(n² · 2^maxCondsDim · CIcost) where CIcost is a
  partial correlation on N samples = O(N · |Z|²). For n=12, depth=3,
  N=5000: ~12² · 8 · 5000 · 9 = 50M ops ≈ 200 ms in JS
- Orientation: O(n³) for v-structure + R3, O(n⁴) worst-case for R4.
  For n=12: ~2k–20k ops ≈ < 1 ms

**Per-run total: ~200-400 ms in a worker for T1D cohorts.** Tractable.

PCMCI+ is more expensive due to the lagged-conditioning phase.
Empirically `pcmci-linear.ts` already runs on these cohorts — would
need profiling under worker boundary, but order-of-magnitude is
similar.

---

## 6. Minimum-viable first PR

Concrete shape, ~250-400 lines, no UI restyling:

**File-set:**
1. `src/workers/discovery-worker.ts` — Web Worker entry. Receives
   `{ algorithmId, cohort, params }`, returns `DiscoveryRun`. Wraps
   `getAlgorithm(id).run(cohort, params)` plus run-record assembly.
2. `src/lib/discovery/run-cohort-bridge.ts` — pure helper that takes
   a `CausalGraph` (or just an active cohort id) and returns a
   `Cohort`. For the first PR, scoped to T1D — looks up the cohort
   from a registered fixture.
3. `src/hooks/useDiscoveryRun.ts` — React hook. Inputs: `cohortId`,
   `algorithmId`, `params`. Manages worker lifecycle, returns
   `{ status, run, error }`. Caches per `(cohortHash, paramsHash)`.
4. `src/components/trinity/FciGraph.tsx` — extend to optionally
   render a `DiscoveryRun`'s edges with their PAG marks alongside
   the curated tags. Behind a "live FCI" toggle initially.

**Deliberately deferred to follow-ups:**
- PCMCI+ panel wiring (same pattern, separate PR)
- Lag-correlation panel (currently DCD panel — needs renaming clarity)
- Server-side execution
- IndexedDB persistence
- Geopolitical / macro cohorts

**Scope flag:** the FCI panel chrome belongs to UX & Onboarding. This
PR adds the *data* the panel renders; chrome restyling (toggle
position, banner styling, error chip) is UX's call. Keep the rendering
minimal and let UX iterate.

---

## 7. Architectural decisions still open

| Decision | Question | Default |
| --- | --- | --- |
| Bridge | A (cohort-per-domain), B (stored DiscoveryRun), C (hybrid) | C, ship B first |
| Compute | Main thread, Worker, Server | Worker |
| Cohort source for T1D | Which ingester is the canonical "live" one | `hall-cgm` for ML demos, `OhioT1DM` for benchmark |
| Persistence | None / IndexedDB / Supabase | None for first PR; IndexedDB later |
| Live updates | Manual rerun / auto on cohort change | Manual rerun first |
| Cancellation | Required / nice-to-have for v1 | Nice-to-have |
| Curator override | Algorithm output replaces / augments curated edges | Augments — curated edges remain visible, algorithm overlays in a different visual treatment (Rendering's call) |

---

## 8. Out-of-scope (for this scoping doc)

- **DCD / NOTEARS implementation.** Currently the DCD panel renders
  static tags. A real DCD requires implementing NOTEARS (constraint-
  optimisation) — separate algorithm work, not a Spirtes-live
  blocker.
- **Cross-cohort joins.** Running FCI across multiple domains'
  cohorts simultaneously. Out of scope until single-cohort is solid.
- **Discovery for geopolitical / macro graphs.** No cohort source
  yet. Unlocks separately.
- **Result authoring back into the curated graph.** "Promote this
  algorithm-discovered edge into the canonical graph" UX. Useful
  long-term but a separate UX flow.
- **Multi-user run sharing.** Shared discovery runs across team
  members. Server-side path; out of scope until that path lands.

---

## 9. Suggested PR sequence (post-scoping approval)

1. **PR A** — `run-cohort-bridge.ts` + `useDiscoveryRun.ts` hook with
   main-thread execution (no worker yet). Scoped to T1D and FCI.
   Renders endpoint marks alongside existing FCI panel content. Behind
   a default-off feature flag.
2. **PR B** — Move execution into a Web Worker. No semantic change;
   purely perf isolation. Cancellation via "ignore late result"
   pattern.
3. **PR C** — PCMCI+ panel wiring (same hook, different algorithm id).
4. **PR D** — Stale-state UX (banner / rerun button). Coordinate with
   UX & Onboarding on chrome.
5. **PR E** — IndexedDB persistence for runs (so reload doesn't
   re-trigger compute).
6. **PR F+** — Geopolitical / macro cohort bridge once the feeds
   normalise.

R4 longer-paths and nonparametric CI tests can land in parallel —
independent of the live wiring.

---

## 10. What this scoping doc explicitly does NOT decide

- The bridge (Option A / B / C) is recommended but not locked.
- Web Worker over server-side is recommended but not locked. Both
  sides of that decision have value depending on auth / audit / scale
  priorities outside the SPIRTES session's scope.
- The visual treatment of algorithm-discovered edges vs. curated
  edges is Rendering's decision, not SPIRTES's.

The point of this doc is to make the trade-offs explicit so the next
implementation PR can reference back to a chosen path rather than
re-derive the design.

---
