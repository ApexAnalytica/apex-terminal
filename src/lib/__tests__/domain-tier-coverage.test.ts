// Domain ↔ tier_features seed coverage contract.
//
// Catches the failure mode that motivated this test: a new DomainCard
// ships in src/lib/domains.ts with `hasData: true`, the UI renders it,
// but the DB seed in supabase-billing-migration.sql doesn't list its id
// in `tier_features.domain_ids` for the public-access tiers. Result:
// users on those tiers see the card rendered with the UPGRADE badge
// and an unclickable disabled state, since `useUserAccess.access.domains`
// (loaded from `tier_features`) doesn't include the new id. Bug shipped
// in PR #277 (AI Safety) and surfaced when the user tried to click the
// new card.
//
// Contract: every `hasData: true` DomainCard with `dataset: "main"`
// must appear in the migration's `update public.tier_features set
// domain_ids = array[...]` block — that's the canonical seed for
// fresh installs.
//
// Notes:
//   - We scope to `dataset: "main"` because that's the bundle that
//     ships with the public app. Other datasets (athena/t1d/vx880)
//     also ship in `main` for the public tiers as far as the seed is
//     concerned (the seed lists ids regardless of dataset). Keeping
//     all hasData ids covered, not just main, is the simplest and
//     most-defensible rule.
//   - Per-customer overrides via `profiles.domain_access` aren't
//     covered here — that's an admin concern and varies per account.
//
// Adding a new public domain card now requires updating BOTH
// src/lib/domains.ts AND supabase-billing-migration.sql, plus a
// one-off patch SQL for prod (see supabase-billing-add-ai-safety-domain.sql
// for the canonical example).

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DOMAIN_CARDS } from "@/lib/domains";

// Resolve from process.cwd() rather than __dirname — vitest is run
// from the repo root by the project's `npm test` / `npm run prebuild`
// scripts, so this is the stable anchor. Avoids __dirname semantics
// that vary between CJS / ESM module resolution under different
// build environments (notably Vercel's prebuild hook, which the
// GH Actions test · build harness sidestepped on a previous attempt).
const MIGRATION_PATH = resolve(
  process.cwd(),
  "supabase-billing-migration.sql",
);

describe("DomainCard ids ⊆ tier_features seed", () => {
  it("every hasData DomainCard appears in the migration seed", () => {
    const sql = readFileSync(MIGRATION_PATH, "utf-8");

    // Pull the array literal out of the seed update. Looks for the
    // specific block introduced by section 8a; failing this regex
    // means the migration was restructured and this test needs a
    // companion update.
    const match = sql.match(
      /update public\.tier_features\s+set domain_ids = array\[([\s\S]*?)\]/,
    );
    expect(
      match,
      "Could not locate the tier_features seed update block in supabase-billing-migration.sql",
    ).not.toBeNull();

    const arrayBody = match![1];
    const seededIds = new Set(
      [...arrayBody.matchAll(/'([a-z0-9_-]+)'/g)].map((m) => m[1]),
    );

    const expectedIds = DOMAIN_CARDS.filter((c) => c.hasData).map((c) => c.id);
    const missing = expectedIds.filter((id) => !seededIds.has(id));

    expect(
      missing,
      missing.length === 0
        ? ""
        : `These hasData DomainCards from src/lib/domains.ts are missing ` +
          `from the tier_features seed in supabase-billing-migration.sql:\n  ${missing
            .map((id) => `- ${id}`)
            .join("\n  ")}\n` +
          `Add them to the array[...] in the section-8a update block, ` +
          `and create a one-off patch SQL for the live DB ` +
          `(see supabase-billing-add-ai-safety-domain.sql for the canonical example).`,
    ).toEqual([]);
  });

  it("seed entries all correspond to real DomainCard ids (no stale rows)", () => {
    const sql = readFileSync(MIGRATION_PATH, "utf-8");
    const match = sql.match(
      /update public\.tier_features\s+set domain_ids = array\[([\s\S]*?)\]/,
    );
    const arrayBody = match![1];
    const seededIds = [
      ...arrayBody.matchAll(/'([a-z0-9_-]+)'/g),
    ].map((m) => m[1]);

    const knownIds = new Set(DOMAIN_CARDS.map((c) => c.id));
    const orphans = seededIds.filter((id) => !knownIds.has(id));

    expect(
      orphans,
      orphans.length === 0
        ? ""
        : `These ids in the tier_features seed don't match any DomainCard ` +
          `in src/lib/domains.ts:\n  ${orphans
            .map((id) => `- ${id}`)
            .join("\n  ")}\n` +
          `Either remove them from the seed or restore the missing DomainCard.`,
    ).toEqual([]);
  });
});
