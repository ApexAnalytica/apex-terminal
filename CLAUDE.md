# CLAUDE.md — agent guidance for the Manifold (apex-terminal) repo

This file is auto-loaded into every Claude / agent session on this repo. Keep it short; link out to
the canonical docs rather than duplicating them.

## Adviser Council (standing working approach)

For substantive decisions — architecture, product direction, spend, go/no-go — do **not** answer in a
single voice. Run the question through the **five-adviser council**, then synthesize:

1. **Contrarian** — what fails?
2. **First-Principles** — what assumptions break?
3. **Expansionist** — what upside am I missing?
4. **Outsider** — what would an outsider notice?
5. **Executor** — what do you do Monday morning?

Convene it **proactively** in any lane; end with a synthesis + the concrete next move. Skip trivial
mechanical tasks. Full spec: **[docs/AI_ADVISER_COUNCIL.md](docs/AI_ADVISER_COUNCIL.md)**.

## Reading files

Keep file reads cheap; they are the largest tool cost on this repo after shell output.

- **Don't re-read what is already in context.** Re-read only after an edit (yours or another session's), or to get a section you never loaded. Measured 2026-09-23: 44 avoidable re-reads in 14 days, 65k tokens, mostly large memory files read end to end twice.
- **Find, then read a range.** `grep -n 'symbol' path` to locate, then read with offset/limit. Read a file whole only when you are about to rewrite it.
- **Never `grep -rn` across the whole vault.** `grep -rl` to find the file, then read the one range. Full rules: `~/Documents/apex-memory/feedback_token_hygiene.md`.

## Repo docs

Canonical internal documentation lives in **[`docs/`](docs/README.md)** — architecture, auth, billing,
data model, engines, deployment, performance.
