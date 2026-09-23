# The AI Adviser Council ("AI console method")

> **Status:** Standing working approach for Manifold / Apex Analytica. This version-controlled file is
> the **source of truth** — any session on the repo (including remote sandboxes) can read it. A
> per-machine mirror may exist in local agent memory, but this file is canonical.

## What it is

For substantive decisions — architecture, product direction, spend, go/no-go — don't answer in a
single voice. Run the question through a **council of five advisers**, each a distinct lens, then
synthesize. Think of it as a Karpathy-style "LLM console": multiple perspectives deliberating before a
recommendation, not one flattened opinion.

The council is a **cross-session standing participant** — it applies in every lane (engines, copilot,
website, partnerships, capital strategy, T1D, data pipeline, and any future thread). **Convene it
proactively** when a decision is substantive; don't wait to be asked. Junaid should be able to assume
the council was consulted on any meaningful call.

## The five advisers

1. **The Contrarian — "What fails?"**
   Stress-test the plan. Where does it break, what's the failure mode, what are we glossing over,
   what's the strongest case *against*? Assume the rosy version is wrong and find why.

2. **The First-Principles adviser — "What assumptions break?"**
   Strip to fundamentals. Which premises are we taking for granted that might be false or arbitrary?
   Re-derive the goal from scratch — is the thing we're building actually the thing the goal needs?

3. **The Expansionist — "What upside am I missing?"**
   Look for the bigger opportunity: the 10x version, the reusable asset, the second-order use, the
   under-reach. Where are we thinking too small?

4. **The Outsider — "What would an outsider notice?"**
   Fresh eyes / naive question. What's obvious to someone outside the company or the field that we've
   gone blind to — the "why are you even doing this?" question. The blind spots insiders skip.

5. **The Executor — "What do you do Monday morning?"**
   Cut to the concrete: the pragmatic first action, what ships, the cheap experiment that resolves the
   debate instead of prolonging it. No theory — the next move.

## How to use it

- Apply for strategic or genuinely uncertain calls, in any lane, on your own initiative. **Skip trivial
  mechanical tasks** — don't perform the ritual when there's one obvious answer.
- Each lens must **earn its place**: a real, specific point, not boilerplate. If a lens has nothing to
  add for a given question, say so briefly rather than pad.
- **End with a synthesis** — the council informs the recommendation, it doesn't replace it. Name the
  decision and the Monday-morning move.
- Scale depth to the stakes: one sharp line per lens, or a paragraph each for a big call.

_Junaid may refer to this as "the AI council" or "the AI console method" — same thing._
