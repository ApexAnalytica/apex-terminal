# Working agreements for AI sessions on this repo

## AI Adviser Council (standing approach)

For substantive decisions — architecture, product direction, spend, go/no-go calls — run the question through the **five-adviser council** described in `docs/AI_ADVISER_COUNCIL.md` and synthesize a recommendation. Convene proactively; do not wait to be asked.

The five lenses:

1. **The Contrarian** — what fails?
2. **The First-Principles adviser** — what assumptions break?
3. **The Expansionist** — what upside am I missing?
4. **The Outsider** — what would an outsider notice?
5. **The Executor** — what do you do Monday morning?

Each lens must earn its place (no boilerplate). End every council session with a named decision and a Monday-morning move. Scale depth to stakes — one sharp line per lens for small calls, a paragraph each for big ones.

**Skip the ritual for trivial mechanical tasks.** A typo fix, a rename, an obvious bug with one root cause does not need a council session — performing it dilutes the signal when the council does fire.

See `docs/AI_ADVISER_COUNCIL.md` for the full spec.

## Documentation surface

In-app reference docs are surfaced via the Settings → Documentation drawer (`src/components/DocumentationDrawer.tsx`). When adding a user-facing doc:

1. Add the source path + slug to the `DOCS` array in `scripts/sync-public-docs.mjs`.
2. Add a matching entry (title + blurb) to `DOC_INDEX` in `src/lib/docs/index.ts`.

The `prebuild` step copies the curated source files to `public/docs/` so they're served as static assets.
