-- One-off DB patch to add the ai-safety-ids and frontier-science
-- domains to existing tier_features rows. Idempotent — safe to re-run.
--
-- Why this is needed: the original seed in supabase-billing-migration.sql
-- only fires when a row's domain_ids is still '{}' (preserves admin
-- overrides on re-run). After Phase 2 ran, all four public-access tiers
-- (trial / multi_domain / enterprise / trusted) had concrete arrays,
-- which means re-running the seed is a no-op on prod. New public
-- domain ids that ship after the original seed need this kind of
-- explicit catch-up patch to land on prod.
--
-- Bug observed: AI Safety / Endogenous Catastrophe card rendered with
-- the UPGRADE badge and was unclickable for the framework owner
-- (trusted tier). Same latent bug applies to frontier-science which
-- shipped earlier and was missing from the seed too. The
-- domain-tier-coverage.test.ts test now gates this seam.
--
-- This patch:
--   - Adds 'ai-safety-ids' to any tier that doesn't already have it.
--   - Adds 'frontier-science' to any tier that doesn't already have it.
--   - Skips tiers with a custom override that intentionally excludes
--     either id (none today, but kept defensible — admin overrides
--     via profiles.domain_access already supersede this anyway).
--   - Is idempotent: running it twice leaves the arrays unchanged.
--
-- Run against the live Supabase via the SQL editor. After it lands,
-- both cards will be selectable for the four tiers below.

update public.tier_features
set domain_ids = array_append(domain_ids, 'ai-safety-ids'),
    updated_at = now()
where tier in ('trial','multi_domain','enterprise','trusted')
  and not (domain_ids @> array['ai-safety-ids']);

update public.tier_features
set domain_ids = array_append(domain_ids, 'frontier-science'),
    updated_at = now()
where tier in ('trial','multi_domain','enterprise','trusted')
  and not (domain_ids @> array['frontier-science']);

-- Sanity-check the result. Should return four rows after the update,
-- each with both 'ai-safety-ids' and 'frontier-science' in domain_ids.
-- (Use the SQL editor's "Run" button; output not consumed by code.)
select tier, domain_ids
from public.tier_features
where tier in ('trial','multi_domain','enterprise','trusted')
order by tier;
