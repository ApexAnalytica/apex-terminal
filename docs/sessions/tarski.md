# Session: TARSKI (Constraint Verification)

Owns the engine that audits every edge in the causal graph against domain-aware axioms in three tiers: PHYSICAL, REGULATORY, HEURISTIC.

> **Status:** session brief is being inferred from cross-references — fill in detail as the session establishes itself.

## Scope summary (in)

- The three axiom tiers:
  - **PHYSICAL** — immutable laws.
  - **REGULATORY** — sanctions, export controls, treaties, FDA tiers, IRB constraints.
  - **HEURISTIC** — anomaly flags.
- Auto-ranking constraints by relevance to active domains.
- The VERIFY action: toggle axioms, run verification, recolor canvas (violating edges → red), expose clickable proof traces explaining which constraint failed.
- Constraint catalog and proof-trace logic.
- Snapshot validator: `src/lib/snapshots/tarski-validator.ts`.

## Scope summary (out — route elsewhere)

- Right-panel chrome and tab UX → **UX & Onboarding**.
- Canvas recoloring of violating edges → **Rendering** does the recolor; TARSKI decides which edges violate.
- Graph data (the edges being verified) → **data sessions**.
- Discovery of new edges (which TARSKI then verifies) → **SPIRTES**.
- Auth / API gating → **Platform**.

## Boundary clarifications

- **Constraint authoring**: domain-specific constraints (T1D regulatory tiers, geopolitical sanctions) are authored *with* the relevant data session but the verification mechanism stays here.
- **Profile-specific axioms**: each `DomainProfile` may surface its own axioms — TARSKI consumes the profile, doesn't define it.

## Anchor files (current)

- `src/lib/tarski-data.ts` — constraint catalog.
- `src/lib/snapshots/tarski-validator.ts` — verification logic for snapshots.
- TODO: identify the verify-API route (likely under `src/app/api/`) and any UI integration files.

## Likely upcoming themes

- Expanding the regulatory axiom set as more domains land.
- Per-domain auto-ranking quality.
- TODO: fill in as the session ships work.

## How to start a task

1. Confirm in-scope (axioms, verification, proof traces, the VERIFY action).
2. Coordinate with the data session whose constraints are being added/edited.
3. Coordinate with Rendering when changing the visual representation of violations.
