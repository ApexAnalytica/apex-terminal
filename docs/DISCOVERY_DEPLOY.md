# Discovery Persistence — Deploy Runbook

> **Scope:** Turning the `/api/discovery/*` endpoints from stateless ("compute and return") into durable ("compute, persist, return") on production. This is a **one-time DB migration** plus a verification check.
> **Authoritative files:** `supabase-discovery-runs.sql`, `src/lib/discovery/persistence.ts`, `src/app/api/discovery/run/route.ts`, `src/app/api/discovery/runs/route.ts`, `src/app/api/discovery/runs/[id]/route.ts`, `src/app/api/discovery/health/route.ts`.

---

## 1. Why this exists

The Discovery API ships every commit as part of the Next.js build. The TypeScript layer for persistence (`src/lib/discovery/persistence.ts`) has been in place since the feature went live — `persistRun`, `getRun`, `listRuns`, `isPersistenceAvailable` are all written and unit-tested.

**What's missing on production**: the `discovery_runs` Postgres table itself. Until the schema is applied, the persistence layer detects the missing table at runtime and gracefully degrades:

- `POST /api/discovery/run` — still works. Computes the run, returns it. The `persistRun(run)` call silently fails with `{persisted: false, reason: <table-missing-error>}`.
- `GET /api/discovery/runs` — returns `503 persistence layer unavailable` (it pre-checks `isPersistenceAvailable()` and short-circuits).
- `GET /api/discovery/runs/[id]` — same as above.

So customers can compute Discovery runs from their pipelines today, but they can't list past runs, fetch one by id, or audit them. That's what this deploy fixes.

---

## 2. Pre-flight

Confirm these are in place before running the migration:

1. **Supabase project exists** and is the same one Manifold is already deployed against. Verify by reading `NEXT_PUBLIC_SUPABASE_URL` in the Vercel project's Environment Variables.
2. **Service-role key is set** in Vercel as `SUPABASE_SERVICE_ROLE_KEY` (Production + Preview). The persistence layer uses this to bypass RLS.
3. **`supabase-setup.sql` has already run.** The discovery migration is additive — it doesn't depend on existing tables, but it's expected to land in a Supabase instance that already has the rest of the schema.

A quick way to confirm 1 and 2 are wired correctly **before** running the SQL: hit the health endpoint.

```bash
curl https://manifold.apexanalytica.co/api/discovery/health | jq
```

Expected response pre-deploy:

```json
{
  "ok": false,
  "persistenceAvailable": true,
  "envWired": true,
  "tableExists": false,
  "rowCount": null,
  "error": "relation \"public.discovery_runs\" does not exist",
  "checkedAt": "2026-05-12T..."
}
```

If `envWired` is **false**, fix the env vars in Vercel first — the migration would be useless until the application can authenticate against Supabase.

If `envWired` is **true** but the `error` doesn't mention `discovery_runs`, something else is wrong (RLS misconfiguration, networking) — don't proceed.

---

## 3. Run the migration

1. Open the Supabase dashboard → project → **SQL Editor** → **+ New query**.
2. Copy the entire contents of `supabase-discovery-runs.sql` (repo root) and paste.
3. Click **Run**. The script is idempotent (`create table if not exists`, `create index if not exists`, RLS policy via `do $$ begin ... exception when duplicate_object then null; end $$`) so re-running is safe.
4. Expected result: `Success. No rows returned.` — the migration creates a table, three indexes, and an RLS policy.

Sanity-check from the SQL Editor itself:

```sql
select count(*) from public.discovery_runs;
```

Should return `0`. Run it again after a Discovery API call to confirm runs are landing.

---

## 4. Verify from the deployed application

```bash
curl https://manifold.apexanalytica.co/api/discovery/health | jq
```

Expected response post-deploy:

```json
{
  "ok": true,
  "persistenceAvailable": true,
  "envWired": true,
  "tableExists": true,
  "rowCount": 0,
  "error": null,
  "checkedAt": "2026-05-12T..."
}
```

`ok: true` is the green light. From this point, every `POST /api/discovery/run` will persist its result and the list / get endpoints will return real data instead of 503.

You can also confirm end-to-end by running an actual Discovery API call (any test cohort + the `lag-correlation` algorithm is the cheapest) and then refreshing the health endpoint — `rowCount` will tick up.

---

## 5. Rollback

If something goes wrong (extremely unlikely — this is a CREATE-only migration), drop the table from the Supabase SQL Editor:

```sql
drop table if exists public.discovery_runs cascade;
```

The application will revert to graceful-degrade mode automatically; no application redeploy needed. The health endpoint will start reporting `tableExists: false` again on the next call.

---

## 6. What this section does NOT cover

- **No retention policy.** The table will grow without bound. Set up a Supabase cron / scheduled function or add a TTL column if expected volume is high. v0 expectation: a few hundred runs per month; reassess if real customers push it past 10k rows.

For the **API key auth layer** that gates the Discovery endpoints, see Section 8. For **per-customer scoping** on persisted runs (so customer A can't see customer B's runs), see Section 9.

---

## 7. Health endpoint reference

| Field | Type | Meaning |
|---|---|---|
| `ok` | bool | `envWired && tableExists && !error` — the all-green deploy state |
| `persistenceAvailable` | bool | `isPersistenceAvailable()` from the persistence layer — equivalent to `envWired` for the moment |
| `envWired` | bool | `SUPABASE_SERVICE_ROLE_KEY` and `NEXT_PUBLIC_SUPABASE_URL` are real (not CI stubs) |
| `tableExists` | bool \| null | Result of `select count(*)` probe; null when env is unwired |
| `rowCount` | number \| null | Total rows in `discovery_runs`; null when no probe was made |
| `error` | string \| null | Supabase error message if the probe failed |
| `checkedAt` | ISO-8601 | When the probe ran (each call is fresh; no caching) |

Always returns HTTP 200 — the response body carries the diagnostic, not the status code. Status codes are reserved for "the endpoint itself is broken" cases.

---

## 8. API key auth (PR 2 in the deploy sequence)

After persistence is live, the Discovery API endpoints are gated behind a per-customer API key — `POST /api/discovery/run`, `GET /api/discovery/runs`, `GET /api/discovery/runs/[id]`, and `GET /api/discovery/algorithms` all require an `X-Apex-Api-Key` header. Missing or invalid keys get a `401 unauthorized` response.

The `/api/discovery/health` endpoint stays **unauthenticated** so the operator can still probe deploy state.

### 8.1 Schema deploy

1. Open Supabase SQL Editor → New query.
2. Paste the contents of `supabase-api-keys.sql` (repo root).
3. Click **Run**. Idempotent — re-running is safe.

This creates `public.api_keys` with the columns:

| column | type | notes |
|---|---|---|
| `id` | uuid | primary key, auto-generated |
| `customer_id` | text | your label for who owns this key |
| `key_hash` | text | SHA-256 hex of the plaintext key (we never store the key itself) |
| `key_prefix` | text | first ~16 chars of the key (e.g. `apx_live_K8qRabcd`) for support/audit |
| `name` | text | human-readable label |
| `scopes` | text[] | defaults to `['discovery:read', 'discovery:write']` |
| `created_at` | timestamptz | auto |
| `last_used_at` | timestamptz | updated by the validator on each successful request |
| `revoked_at` | timestamptz | soft-delete signal; non-null = key rejected |

### 8.2 Issuing a key (one-off, per customer)

The plaintext key is generated by **application code**, shown to the customer **once**, and never persisted on our side — we only persist the hash + prefix. Run this from the Vercel CLI shell or a local script with the env vars set:

```bash
npx tsx -e "
import { generateApiKey } from './src/lib/discovery/api-key-auth';
const { key, hash, prefix } = generateApiKey();
console.log('plaintext (send to customer ONCE):', key);
console.log('key_hash (paste into Supabase):',   hash);
console.log('key_prefix (paste into Supabase):', prefix);
"
```

Then in the Supabase SQL Editor:

```sql
insert into public.api_keys (customer_id, key_hash, key_prefix, name) values
  ('customer-acme', '<hash from script output>', '<prefix from script output>', 'acme cli')
  on conflict (key_hash) do nothing;
```

Send the **plaintext key** to the customer via a secure channel (1Password share, encrypted email, etc.). The customer sets it as `X-Apex-Api-Key` on every Discovery API request.

### 8.3 Revoking a key

```sql
update public.api_keys
set revoked_at = now()
where key_prefix = 'apx_live_K8qR1234';   -- the prefix you noted at issuance
```

The validator's filter rejects keys with `revoked_at IS NOT NULL` on the next request. The row stays for audit; don't `DELETE` unless you're cleaning up a key that was never issued.

### 8.4 Smoke test

```bash
# Should return 401 unauthorized
curl https://manifold.apexanalytica.co/api/discovery/algorithms

# Should return the algorithm catalog
curl -H "X-Apex-Api-Key: apx_live_<your-key>" \
  https://manifold.apexanalytica.co/api/discovery/algorithms
```

### 8.5 What this does NOT do

- **No rate limiting.** A key can fire as many requests as it wants. Add Vercel KV or a Supabase function for rate limiting before opening the API to untrusted callers.
- **No key expiry.** Keys are valid until manually revoked. Add an `expires_at` column and validator filter when that becomes a requirement.
- **No admin UI for key issuance.** The flow above is operator-only via Supabase SQL Editor (or the `scripts/issue-api-key.ts` helper). Build `/admin/keys` if self-service issuance becomes a real need.

For **per-customer scoping** on persisted runs (so customer A can't see customer B's runs even with a valid key), see Section 9.

---

## 9. Per-customer scoping on persisted runs (PR 3 in the deploy sequence)

After API-key auth is live (§8), every authenticated request carries a validated `customer_id` from the `api_keys` row that matched. This section closes the last gap: making `listRuns` / `getRun` actually filter on that `customer_id`, so customer A can't read customer B's persisted runs even with a valid key.

### 9.1 Schema migration

1. Open Supabase SQL Editor → New query.
2. Paste the contents of `supabase-discovery-customer-scoping.sql` (repo root).
3. Click **Run**. Idempotent — re-running is safe.

What it does:
- Adds `customer_id text NOT NULL` to `public.discovery_runs`.
- Creates `discovery_runs_customer_id_idx` on `(customer_id, created_at desc)` — the index that `listRuns` reads on every request after this migration.

**Pre-condition**: `discovery_runs` should be empty (or near-empty) when this runs, because `NOT NULL` with no `DEFAULT` will fail on existing rows. The §4 health-endpoint check earlier in this doc reports `rowCount` — if it's still 0 (or all rows are yours and disposable), proceed. If a real customer has accumulated rows by the time you run this, either backfill the column first with a sentinel value (e.g. `update public.discovery_runs set customer_id = '<legacy-customer>' where customer_id is null;`) or modify the migration to use `alter table … add column customer_id text default '<legacy-customer>' not null` before dropping the default.

### 9.2 Verify

```bash
# As customer A, persist a run via POST /api/discovery/run.
curl -X POST -H "X-Apex-Api-Key: <customer-A-key>" \
  -H "Content-Type: application/json" \
  -d '<discovery payload>' \
  https://manifold.apexanalytica.co/api/discovery/run
# Response includes the run id; save it as RUN_ID.

# Customer A's listRuns includes the new run.
curl -H "X-Apex-Api-Key: <customer-A-key>" \
  https://manifold.apexanalytica.co/api/discovery/runs
# → { "runs": [{"id": "<RUN_ID>", ...}], "count": 1 }

# Customer A's getRun returns it.
curl -H "X-Apex-Api-Key: <customer-A-key>" \
  https://manifold.apexanalytica.co/api/discovery/runs/$RUN_ID
# → { "id": "<RUN_ID>", ... }

# Customer B (different key) trying to read A's run gets 404.
curl -i -H "X-Apex-Api-Key: <customer-B-key>" \
  https://manifold.apexanalytica.co/api/discovery/runs/$RUN_ID
# → HTTP/2 404, body {"error":"run not found","id":"<RUN_ID>"}

# Customer B's listRuns is empty (or shows only B's runs).
curl -H "X-Apex-Api-Key: <customer-B-key>" \
  https://manifold.apexanalytica.co/api/discovery/runs
# → { "runs": [], "count": 0 }
```

The 404 on cross-customer reads is intentional: returning 403 would leak the fact that the id exists in someone else's tenant. 404 looks identical to a miss.

### 9.3 What this does NOT do

- **Doesn't migrate existing unscoped rows.** If `discovery_runs` had data before this migration, see the pre-condition note in §9.1.
- **Doesn't add per-customer rate limiting or quotas.** Volume is currently unbounded per key.
- **Doesn't use RLS for cross-customer enforcement.** Application-layer filtering (the `.eq('customer_id', ...)` calls in `persistence.ts`) is the primary gate; RLS would only matter if anon-key clients ever talked to this table, which they don't. See the comment block in `supabase-discovery-customer-scoping.sql` for the trade-off explanation.
