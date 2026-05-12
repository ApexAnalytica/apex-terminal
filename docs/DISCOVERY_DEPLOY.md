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

## 6. What this does NOT do

- **No authentication on the Discovery API.** Anyone with the URL can `POST /api/discovery/run` and trigger a computation. After this migration, those runs land in your `discovery_runs` table with no `customer_id` scoping — anyone can write anything. Add API-key auth before exposing the Discovery API externally (next PR after this one).
- **No per-customer scoping on persisted runs.** The schema as deployed has no `customer_id` column. PR 3 in this sequence adds it once auth is in place.
- **No retention policy.** The table will grow without bound. Set up a Supabase cron / scheduled function or add a TTL column if expected volume is high. v0 expectation: a few hundred runs per month; reassess if real customers push it past 10k rows.

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
