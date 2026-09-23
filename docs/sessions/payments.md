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
