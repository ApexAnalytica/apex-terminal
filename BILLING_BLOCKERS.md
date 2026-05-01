# Billing — deferred items / blockers

Tracking decisions that were deferred during the institutional-billing
build (branch: `claude/billing-tier-gating-zOcFJ`). Each item is either
unblocked by a small, well-defined external action or genuinely waiting
on product input.

## 1. Mercury invoice webhooks — DEFERRED (no path forward today)

**Status:** Mercury's webhook event surface as of 2026-04-30 only
exposes treasury-level events. Confirmed via the Create-webhook UI on
the Apex Analytica workspace:

- `transaction.created`, `transaction.updated`
- `checkingAccount.balance.updated`, `savingsAccount.balance.updated`,
  `treasuryAccount.balance.updated`, `investmentAccount.balance.updated`,
  `creditAccount.balance.updated`

There are **no `invoice.*` events**. The auto-flip-on-payment flow is
not viable on Mercury's current API.

**Workarounds considered and rejected for v1:**

- *Inferring invoice payment from `transaction.created` payloads by
  matching ACH/wire memo strings against invoice IDs.* Brittle: wire
  memos get truncated by intermediary banks, customer references are
  unreliable, and false positives are real on multi-invoice customers.

**Recommended posture:** stay on Path A (manual mark-paid via
`/admin/billing`). The `profiles.mercury_invoice_id` column is a
tracking field — admin pastes the Mercury invoice ID there for record
keeping. When Mercury ships invoice webhooks, layer them on top
without changing the schema.

**To revisit when:** Mercury announces invoice webhooks (track their
[changelog](https://docs.mercury.com/changelog)).

## 2. Renewal email transport — DEFERRED (scope decision)

The handoff plan included T-30d renewal reminder emails. No
transactional email transport (Resend / Postmark / SES) was selected,
so v1 surfaces upcoming renewals in the admin console (the "DUE SOON"
view filters customers whose `current_period_end` is ≤ 30d away) and
admins email customers manually from their own inbox.

**Unblock with:** pick a transport, add an env var
(`RESEND_API_KEY` or equivalent), build a simple
`renewalReminderEmail(customer)` and a `pg_cron` daily that selects
customers expiring in 30/14/7 days and dispatches.

## 3. Scheduler URL (Cal.com / Savvycal) — PLACEHOLDER (Phase 4)

Phase 4's upgrade-wall and `/pricing` CTAs need a real "book a call"
URL. v1 will use `NEXT_PUBLIC_SCHEDULER_URL` with a fallback so a
single env-var change swaps the link. Pick one when ready.

## 4. Server-enforced domain gating on engine routes — DEFERRED

The compute, copilot, enrich, news, and structure routes accept
opaque graph-context strings without explicit domain IDs.
`requireDomainAccess()` is wired and ready, but those routes can't
truly enforce gating without a deeper refactor that moves graph
construction server-side. v1 relies on the UI lock in
`DomainSelector.tsx` (a user can't select a locked domain to begin
with). A determined caller hand-crafting requests is a v2 concern.

**Unblock with:** refactor the client→server contract so the client
sends `{ domainIds, ... }` and the server reconstructs the graph
after `requireDomainAccess()`. Out of scope per the
"don't-touch-engine-code" guardrail.
