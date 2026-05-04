# Performance — instrumentation, runbook, audit log

> **Audience:** Apex Analytica engineers and operations.
> **Status:** Living document. The audit-log section ([§5](#5-audit-log)) is appended to whenever a meaningful perf change ships.
> **Scope:** What perf instrumentation is wired into Manifold, how to read the data, what to watch for, and a chronological log of past audits + actions so we don't redo work.

The platform doesn't have a dedicated perf engineer. This doc is the substitute — a discoverable, persistent process so that any session (Claude or human) can:

1. Look up what's instrumented today.
2. Know which thresholds matter.
3. See what was already audited and what was deliberately left alone.

**If you're about to do a perf audit, append your findings + actions to the audit log at the bottom.** Future you will thank present you.

---

## 1. What's instrumented

### 1.1 `@vercel/speed-insights` — real-user Web Vitals

Wired into `src/app/layout.tsx`. Reports per-route Core Web Vitals (LCP, INP, CLS, FCP, TTFB) from real users back to Vercel.

- **Where to read the data:** `vercel.com/junaidapexs-projects/manifold/observability/speed-insights`
- **What it costs:** $0 on Hobby, included in Pro. No code changes required to see the data — it accumulates passively as users visit.
- **First useful results:** ~24 hours of real traffic. Don't expect signal until then.

### 1.2 `@next/bundle-analyzer` — client + server bundle treemap

Wrapped around `next.config.ts`'s export. **Inert by default**; only active when `ANALYZE=true` is set at build time. This means production builds on Vercel are not affected.

- **How to run locally:**
  ```bash
  ANALYZE=true npm run build
  ```
  The build opens a browser tab with an interactive treemap of every JS chunk shipped to the client (and a separate one for the server). Hover any rectangle to see its byte size and what it contains.
- **What to look for:**
  - Single packages > 100 KB minified+gzipped (red flag — should be dynamic-imported).
  - Duplicate-looking trees (e.g., two copies of `react-three-fiber` from different transitive paths — fix via `npm dedupe` or version pinning).
  - Anything in the *initial* (entry) bundle that only one route uses (move to that route's page or `dynamic()`).

### 1.3 `prebuild` test gate

Defined in `package.json`:
```json
"prebuild": "vitest run"
```

Every Vercel build runs the full unit-test suite before `next build`. A failing test blocks the deploy. This is intentional and is the project's only quality gate.

- **Side effect on perf:** Adds ~15s to every build. Acceptable.
- **If a test starts breaking deploys:** `CI=1 npm run build` locally to reproduce. **Never disable `prebuild` to ship.** Fix the test.

### 1.4 What is *not* instrumented (deliberate gaps)

- **No Sentry / error-tracking SDK.** Vercel function logs are the catch-all. Add Sentry only if reproducing production errors becomes painful.
- **No synthetic monitoring** (uptime pings). Vercel's own deployment health is the substitute.
- **No React DevTools Profiler integration in production.** If a re-render perf issue is reported, profile locally with the user's exact path.

---

## 2. Thresholds — what counts as "slow"

Use these as the line for "we should investigate":

| Metric | Green | Yellow | Red |
|---|---|---|---|
| **LCP** (Largest Contentful Paint) | ≤ 2.5 s | 2.5 – 4 s | > 4 s |
| **INP** (Interaction to Next Paint) | ≤ 200 ms | 200 – 500 ms | > 500 ms |
| **CLS** (Cumulative Layout Shift) | ≤ 0.1 | 0.1 – 0.25 | > 0.25 |
| **First-load JS** (per route, gzipped) | ≤ 250 KB | 250 – 500 KB | > 500 KB |
| **TTFB** (Time to First Byte, p75) | ≤ 600 ms | 600 ms – 1.5 s | > 1.5 s |

These mirror Google's Core Web Vitals defaults. Don't chase green on every metric — chase "no red" on the high-traffic routes (`/`, `/pricing`, `/login`, `/request-access`) and accept yellow on the heavy workspace pages (`/`, the 3D causal graph) where interactivity > paint speed.

---

## 3. Recurring review cadence

Suggested rhythm:

- **Monthly** (calendar reminder): open Speed Insights, look at the worst route by INP. If it moved into red, file an issue.
- **After any large dependency change** (`npm install <new-package>`, major version bumps): run `ANALYZE=true npm run build` and confirm no chunk gained more than ~30 KB unexpectedly.
- **Before adding a heavy SDK** (anything > 50 KB minified): consider dynamic import + a feature flag rather than a static import.

If the monthly cadence slips, no penalty. The instrumentation runs on its own; the data is there when you want it.

---

## 4. Common interventions, ranked by leverage

When the audit finds a problem, this is the menu of fixes, ordered by typical impact:

1. **Convert a static import to `dynamic()` with `ssr: false`** — biggest win for client-heavy components. Already done for `CausalDAG3D`, `CausalDAGMap`, `CausalDAGRelief`, the Trinity graphs. If a new heavy component lands, follow the same pattern.
2. **Remove a dependency you no longer use.** `grep -rln "from ['\"]<pkg>" src/` to confirm zero usage; then `npm uninstall <pkg>`.
3. **Inline-defer below-the-fold UI.** Wrap with `React.lazy()` + `<Suspense>`. Saves initial JS at the cost of a brief skeleton.
4. **`next/image` with explicit width/height + `priority` only on the LCP image.** Cuts CLS and unblocks LCP.
5. **Server Components for read-only data fetches.** Already doing this for `/admin/*` pages.
6. **Memoize expensive Zustand selectors.** Profile first; don't memoize speculatively.
7. **Cache LLM responses where the input is identical** (compute, copilot). Out of scope for v1; consider when latency complaints arrive.

---

## 5. Audit log

Append a row each time a perf-relevant change ships. Keep entries terse; cite PR numbers, not lines.

| Date | PR | Action | Outcome / notes |
|---|---|---|---|
| 2026-05-01 | (this PR) | Wired `@vercel/speed-insights` into root layout + `@next/bundle-analyzer` into `next.config.ts`. Removed dead `@react-three/postprocessing` (zero source references). | Establishes baseline. Speed Insights data starts accumulating on next prod deploy. Bundle analyzer runs locally only via `ANALYZE=true npm run build`. |

Future entries: copy the row template above.

---

## 6. See also

- [`DEPLOYMENT.md`](./DEPLOYMENT.md) — Vercel build pipeline, env vars, runbook.
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — request lifecycle and runtime split (client / Edge / Node).
- [`BILLING.md`](./BILLING.md) — for context on which routes are public vs admin-only (different perf SLAs apply).
