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
