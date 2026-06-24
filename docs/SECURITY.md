# Security — instrumentation, findings, runbook

> **Audience:** Apex Analytica engineers and operations.
> **Status:** Living document. The audit-log section ([§5](#5-audit-log)) is appended to whenever a meaningful security change ships.
> **Scope:** Authoritative reference for the security posture of the Manifold platform — what's currently protected, what's known-risky, and a chronological audit log so the same problems don't get re-discovered.

If you came here because:

- *You're triaging a reported vulnerability* — start at [§2 Findings](#2-findings) and check whether it's already logged.
- *You're adding a new API route* — read [§3 Conventions for new code](#3-conventions-for-new-code) first.
- *You're rotating a secret* — see [`DEPLOYMENT.md` §2.3](./DEPLOYMENT.md).
- *You're prepping for a customer security review* — [§4 Positive observations](#4-positive-observations) is the talking-points list.

This doc is a snapshot of an audit performed on 2026-05-07 against `main` at the time. Each finding has a severity, a one-paragraph explanation, and a recommendation. The audit log at the bottom is the place to append follow-up findings — keep the format consistent.

---

## 1. Trust boundaries

```mermaid
flowchart LR
  User[End user] -->|HTTPS + cookie| Edge[Edge middleware]
  Edge -->|session cookie verified| Pages[App Router pages + APIs]
  Edge -->|public allowlist| PublicAPI[/api/request-access<br/>/api/feeds<br/>/api/webhooks/...]
  Pages -->|service-role bypass| SBService[(Supabase service-role)]
  Pages -->|anon key + cookie| SBAnon[(Supabase anon — RLS-gated)]
  Admin[Admin tab pages] -->|requireAdmin email allowlist| AdminRoutes[/api/admin/*]
  PublicAPI -->|HMAC signed| Webhook[GitHub webhook receiver]
  AdminRoutes --> SBService

  classDef trust fill:#0aa,color:#fff;
  classDef untrust fill:#a00,color:#fff;
  class Edge,SBAnon trust
  class User,PublicAPI untrust
```

Four trust tiers, from most to least trusted:

1. **Service-role** — direct DB access, bypasses RLS. Used by every `/api/admin/*` route, the public lead-capture route, the webhook receiver, and the trusted-signup creator. Never reaches the browser. If `SUPABASE_SERVICE_ROLE_KEY` leaks, everything else falls.
2. **Admin (ADMIN_EMAILS allowlist)** — every `/admin/*` route and `/api/admin/*` mutation gated by `requireAdmin()` (`src/lib/admin-auth.ts`). Currently `junaid@apexanalytica.co`, `brynna@apexanalytica.co`.
3. **Authenticated user (Supabase session cookie)** — middleware enforces this on every route not in the public allowlist. Anon Supabase key + RLS policies do the heavy lifting at the DB layer.
4. **Anonymous (public allowlist)** — explicit, narrow set: `/login`, `/pricing`, `/request-access`, `/api/request-access`, `/api/webhooks`, `/api/discovery`, `/api/feeds`, and the auth flow pages. Each public API does its own gating (signature verification, invite code, input validation).

---

## 2. Findings

Severity scale:

- **Critical** — exploitable today, customer impact, fix this week.
- **High** — exploitable with effort or limited blast radius; fix this month.
- **Medium** — defense-in-depth gap or audit-readiness issue.
- **Low** — hygiene.

### 2.1 [High] SSRF surface in `/api/news/fetch-url`

**Where:** `src/app/api/news/fetch-url/route.ts`

The route accepts a user-supplied URL, validates only the protocol (`http`/`https`), then issues `fetch(parsed.toString())` against it server-side. It does **not** block private / loopback / link-local IP ranges after DNS resolution.

An authenticated user could submit:

- `http://127.0.0.1/` — loopback to any service co-resident with Manifold's runtime (none today on Vercel serverless, but the principle stands).
- `http://169.254.169.254/latest/meta-data/iam/security-credentials/` — AWS instance metadata. Vercel runs on AWS Lambda; whether this endpoint is reachable from inside the Lambda environment is a Vercel-internal detail and shouldn't be relied on as protection.
- `http://10.0.0.0/8`, `http://192.168.0.0/16`, `http://172.16.0.0/12` — RFC1918 private ranges.
- Anything else internal that the function happens to be able to reach.

The existing 12s timeout, 2MB byte cap, and Readability text extraction limit how much an attacker can extract per request, but don't address the underlying SSRF.

**Recommendation.** After `new URL(url)` succeeds, resolve the hostname via `dns.lookup()` and reject any result in `127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16`, `::1`, `fc00::/7`, `fe80::/10`. Also reject `localhost`. Apply the same check on each redirect hop (`redirect: "manual"` and re-validate, instead of `redirect: "follow"`). The Node `ipaddr.js` package is the standard tool for this in ~10 lines.

### 2.2 [High] `xlsx` dependency — Prototype Pollution + ReDoS, no upstream fix

**Where:** import parsers (`src/lib/import/parsers/*`).

`npm audit` flags two high-severity advisories on the `xlsx` package (SheetJS community edition):

- [GHSA-4r6h-8v6p-xvw6](https://github.com/advisories/GHSA-4r6h-8v6p-xvw6) — Prototype Pollution.
- [GHSA-5pgg-2g8v-p4x9](https://github.com/advisories/GHSA-5pgg-2g8v-p4x9) — ReDoS.

Both have **no fix available** on the npm-published versions. SheetJS moved the fixes behind their paid Pro tier. Customer-supplied workbooks (`.xlsx` files in the import flow) are the attack surface.

**Recommendation.** Migrate to **`exceljs`** (actively maintained, BSD-3-Clause, no known equivalents) for spreadsheet parsing. Estimated effort: 2–4 hours — the parser interface is similar enough that the calling code in `src/lib/import/` should change in a few well-defined spots. Add a test fixture with the known PoC payload from each advisory to verify the migration closes the surface.

### 2.3 [High] `ws` dependency — fixable

**Where:** transitive dependency (likely via `jsdom` → `@mozilla/readability`).

Two high-severity advisories on `ws` ≤ 8.20.1: uninitialized memory disclosure ([GHSA-58qx-3vcg-4xpx](https://github.com/advisories/GHSA-58qx-3vcg-4xpx)) and memory-exhaustion DoS ([GHSA-96hv-2xvq-fx4p](https://github.com/advisories/GHSA-96hv-2xvq-fx4p)).

**Recommendation.** Run `npm audit fix`. This is the cheap one — fixed upstream, no API changes needed. Should ship as its own PR so it's easy to revert if anything regresses.

### 2.4 [Medium] Engine routes are session-gated but not tier-gated

**Where:** `/api/compute`, `/api/copilot`, `/api/enrich`, `/api/structure`, `/api/news` (the LLM-call route, not the URL fetcher).

These routes:

- Require a session cookie (middleware enforces this — they aren't in the public allowlist).
- Take the **caller's own** LLM API key in the request body (BYO-key model).
- Do **no per-tier authorization check** — a `tier='trial'` user can hit them as freely as `tier='multi_domain'`.

This is a deliberate v1 design tradeoff already documented in [`BILLING_BLOCKERS.md` §3](../BILLING_BLOCKERS.md). It's listed here so the security review picks it up too. The exposure is:

- A trial user can use the *engine compute* (the value Manifold ships) without paying — they only need to bring their own LLM keys.
- The routes don't enforce rate limits, so a determined caller can hit them with arbitrary `graphContext` strings.

**Recommendation (when prioritized).** Add tier+domain check inside each engine route using `requireDomainAccess(claimedIds)` from `src/lib/billing-server.ts`. The handler signature would need a `domainIds` field on the request body. Out of scope per the original "don't touch engine code" guardrail — but worth opening as the next-after-Resend-rollout task.

### 2.5 [Medium] No rate limiting on public endpoints

**Where:** `/api/request-access`, `/api/feedback`, `/api/news/fetch-url`, `/api/webhooks/github`.

Anyone on the internet (or any authed user for `/api/news/fetch-url`) can hit these without throttling. The webhook receiver is HMAC-verified — abuse there is bounded by GitHub. The other three are unprotected.

Practical impact today is low because the institutional sales motion sees handfuls of requests per day. But:

- `/api/request-access` writes to a DB on every call → spammed could fill the `leads` table and exhaust Resend's free tier.
- `/api/feedback` is the same pattern → fills `feedback` table.
- `/api/news/fetch-url` issues outbound requests on every call → could be used to amplify against another origin via Manifold's bandwidth.

**Recommendation.** Add Vercel's built-in [Edge Middleware rate limit](https://vercel.com/docs/edge-network/rate-limiting) or an in-process token-bucket via `next-rate-limit` / `@upstash/ratelimit`. Defaults: 10 req / IP / hour on public POSTs. Trivial to wire.

### 2.6 [Medium] `feedback` table RLS state not verifiable from source

The `feedback` table is referenced by the feedback API and webhook handler but **no `create table public.feedback` or `enable row level security` for it appears in any committed `*.sql` file**. The schema was created via the Supabase dashboard or in an unversioned migration.

This is a documentation gap, not a known vulnerability. The service-role inserts work either way. But:

- Customer security reviewers will ask for the schema and RLS policies.
- A future developer reading the repo can't tell whether anonymous users can SELECT from `feedback` (they probably can't, but it's not provable from source).

**Recommendation.** Capture the current schema + RLS state via `pg_dump --schema-only` or by reading from the Supabase dashboard and write it into a new `supabase-feedback-table.sql`. Idempotent (`create table if not exists`, `create policy if not exists`). Ship as a docs PR.

### 2.7 [Low] Eager service-client init still in two routes

Most routes have migrated to lazy `getService()` / `getSupabase()` functions (see comments in `src/app/api/admin/billing/expire/route.ts`). Two haven't:

- `src/app/api/feedback/route.ts` — eager `const supabase = createClient(...)` at module scope.
- `src/app/api/webhooks/github/route.ts` — eager `const service = createClient(...)` at module scope.

This was a build-time issue elsewhere (see the comment chain in the migrated routes). It's not exploitable, but inconsistent across the codebase and could resurface a deploy bug if the package-data collector ever runs on these modules.

**Recommendation.** Convert to lazy `getService()` to match the convention. Two ~5-line edits.

### 2.8 [Low] BYO-LLM-key passthrough — logging exposure

Engine routes accept LLM API keys (Anthropic / Gemini / OpenAI / Ollama URL) in the request body. The keys are passed straight to the SDK and not stored. **However**, on error paths the entire SDK error can be logged (`console.error("Compute API error:", err)`), and some SDK errors include the offending request — which can include partial keys in headers.

**Recommendation.** Redact bearer tokens in error logging. Add a small `redactSecrets(err)` helper that strips anything matching `^sk-[a-zA-Z0-9-]{20,}` or `^AIza[0-9A-Za-z_-]{30,}` from any logged string. ~20 lines.

### 2.9 [Low] `console.error` content includes potentially-identifying data

Several admin routes log full Supabase error objects on insert/update failures (`console.error("admin/leads update:", error)`). These error objects can include row payloads with email addresses + lead organization names. Vercel function logs are admin-only but accumulate.

**Recommendation.** Wrap with a serializer that strips known PII fields (`email`, `name`) before logging. Lower priority than the BYO-key redaction above.

---

## 3. Conventions for new code

When adding new code:

- **Every new API route gets a runbook entry.** Document what auth it requires, what it writes, what input validation it does. If it accepts a URL or arbitrary string, write down the SSRF / injection considerations.
- **Public routes (in the middleware allowlist) MUST self-gate.** Either HMAC signature, invite code, API key header, or input-bounded with rate limiting.
- **Service-role usage is opt-in only.** Default to anon+cookie. Reach for service-role only when RLS would block legitimate writes (audit-trail tables, admin mutations).
- **Never `NEXT_PUBLIC_` a secret.** The `NEXT_PUBLIC_` prefix bakes the value into the client bundle. Reserved for genuinely public values (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — public-by-design per Supabase's threat model).
- **No `dangerouslySetInnerHTML` with user-derived content.** The single existing instance in `src/app/layout.tsx` uses a constant string literal — keep it that way.
- **Don't pull new heavy parsers from npm without audit.** The `xlsx` finding (2.2) is the cautionary tale.

---

## 4. Positive observations

For the customer-security-review conversation, these are accurate and worth citing:

- **Defense-in-depth on auth.** Middleware enforces session on every non-allowlisted route; admin routes additionally call `requireAdmin()` against an env-var email allowlist; service-role usage is restricted to known internal contexts.
- **HMAC signature verification on GitHub webhook** uses `crypto.timingSafeEqual` correctly — not vulnerable to timing-based comparison attacks (`src/app/api/webhooks/github/route.ts:17`).
- **Row Level Security enabled** on `profiles`, `tier_features`, `leads`. Anon-INSERT-only policy on `leads`; own-row read/update only on `profiles`.
- **`handle_new_user` trigger refuses client-supplied tier metadata** unless the caller is `service_role` (per the JWT claim). Browser callers cannot escalate their tier at signup.
- **Security headers shipped via `next.config.ts`:** `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()`, `Strict-Transport-Security: max-age=31536000; includeSubDomains`. CSP intentionally deferred for a `Content-Security-Policy-Report-Only` rollout first.
- **No `eval()`, no `new Function()`, no raw `innerHTML` / `outerHTML` writes** across the codebase. The single `dangerouslySetInnerHTML` in `src/app/layout.tsx` is a constant string literal for text-size restoration.
- **`TRUSTED_INVITE_CODE`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_EMAILS`, `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, `GITHUB_WEBHOOK_SECRET`, `RESEND_API_KEY`, `GITHUB_PIPELINE_TOKEN`** are all server-only — none have a `NEXT_PUBLIC_` prefix.
- **Lazy service-client construction pattern** (`getService()`) is documented in `src/app/api/admin/billing/expire/route.ts` and applied to most admin routes — avoids the production page-data-collection issue that bit earlier.
- **DB triggers run as `security definer`** to enforce invariants the application code can't easily bypass.

---

## 5. Audit log

Append a row each time a security-relevant change ships. Keep entries terse; cite PR numbers, not lines.

| Date | PR | Action | Outcome / notes |
|---|---|---|---|
| 2026-05-07 | (this PR) | Initial security audit. Findings documented in §2; positive observations in §4. No code changed — this commit is the audit report itself. | Five remediation actions queued: SSRF guard on news/fetch-url (§2.1), xlsx → exceljs migration (§2.2), `npm audit fix` for ws (§2.3), rate-limit on public POST endpoints (§2.5), feedback table SQL into repo (§2.6). |

---

## 6. See also

- [`AUTH.md`](./AUTH.md) — Supabase auth model and trial/trusted/admin flow.
- [`DEPLOYMENT.md`](./DEPLOYMENT.md) — env var inventory + secret rotation runbook.
- [`BILLING.md`](./BILLING.md) — tier model, who has access to what.
- [`BILLING_BLOCKERS.md`](../BILLING_BLOCKERS.md) — deferred billing items; finding §2.4 cross-references the engine-route gating item there.
