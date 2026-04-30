# Session: UX & Onboarding

Owns **what users see, click, and learn before they're productive**, plus the chrome around the experience after that.

## Product context

Manifold (internal: Apex Terminal) is a causal-graph terminal for systemic-risk analysis. Production: https://manifold.apexanalytica.co. The same substrate renders as either a geopolitical-risk terminal or a medical-research (T1D) terminal via a `DomainProfile` seam. Most users are first-time visitors who need to be walked into a non-trivial product.

This session does **not** care about graph data, engines, canvas rendering, or platform plumbing. It owns the moment-of-arrival experience and the persistent chrome.

## Surfaces this session owns

### First-visit flow
- Welcome modal + Domain Workspace + auto-launching SpotlightTour
- Component: `src/components/SpotlightTour.tsx`
- Storage flag: `localStorage["manifold:tour-seen"]`
- Uses `data-tour="..."` anchors throughout the app to attach steps to UI elements
- Tour currently has 22+ steps covering persona-based domain selector, 3D/2D/MAP views, text-size toggle, PEARL manual vs CASCADE DEFENSE auto-interdiction, feedback widget, etc.

### Persona gating
- `activePersona: "scientist" | "analyst" | "cross"` in `useApexStore`, default `"analyst"`
- Three pills in the Domain Workspace modal control which domain cards are visible:
  - **Analyst** → geopolitical / financial / macro / defense (`dataset: main | athena`)
  - **Scientist** → Life Sciences (`dataset: t1d`)
  - **Cross-Domain** → all cards; only persona where multi-select across dataset families is allowed
- Switching persona silently drops out-of-family selections
- Within Analyst/Scientist, multi-select is restricted to the same family
- Canonical type union lives in `useApexStore.ts`. `DomainSelector.tsx` mirrors it locally — keep them in sync.

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
- Applied via CSS `zoom` on `<html>` (the app uses ~700 fixed px text classes so root font-size won't propagate)
- Pre-paint inline script in `src/app/layout.tsx` prevents flash-of-wrong-size

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

## How to start a task

When given a task in this session:

1. Confirm the task is in-scope. If it sits on a boundary, flag and route rather than absorb.
2. For tour-step changes, look for the `data-tour="..."` anchor in the target component first — adding a new anchor is often the right move before touching `SpotlightTour.tsx`.
3. For persona logic, the canonical type union lives in `useApexStore.ts`. `DomainSelector.tsx` mirrors it locally — keep them in sync.
4. Verify visual/interaction changes by running the dev server, clearing `localStorage["manifold:tour-seen"]` to retest first-visit flows, and snapshotting key states. Don't ask the user to check manually unless tooling truly can't.
