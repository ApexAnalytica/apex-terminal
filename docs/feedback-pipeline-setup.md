# Feedback → Production Pipeline — Setup

End-to-end flow: in-app feedback → admin triage → GitHub issue → Claude Code agent opens PR → you review/merge → Vercel auto-deploys → row flips to `shipped`.

## 1. Run the Supabase migration

In the Supabase dashboard SQL Editor, run `supabase-feedback-pipeline.sql`. It adds `status`, `admin_notes`, `github_issue_url`, `github_issue_number`, `pr_url`, `shipped_at`, `updated_at` to the existing `feedback` table plus an index and trigger.

## 2. Environment variables

Add these in Vercel → Project Settings → Environment Variables (and locally in `.env.local`):

| Name | Value | Where it's used |
|---|---|---|
| `ADMIN_EMAILS` | `junaid@apexanalytica.co,other@example.com` | Middleware gate for `/admin/*` |
| `GITHUB_PIPELINE_TOKEN` | Fine-grained PAT with `issues: write`, `contents: read` on this repo | Approve API → creates issue |
| `GITHUB_PIPELINE_REPO` | `your-org/apex-terminal` | Approve API target repo |
| `GITHUB_WEBHOOK_SECRET` | Random 32+ char string | PR-merge + deployment-status webhook HMAC verification |

Existing vars already in use — confirm they're set: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`.

## 3. GitHub repo config

**Create a `feedback-approved` label** (Settings → Labels → New) — the workflow only fires on issues carrying this label.

**Add repo secret** `ANTHROPIC_API_KEY` (Settings → Secrets and variables → Actions → New repository secret).

**Install Claude Code GitHub App** on this repo (once per repo): https://github.com/apps/claude — required for the `anthropics/claude-code-action`. If the action schema differs from what's in `.github/workflows/feedback-to-pr.yml`, check the action's README and update the `with:` block.

## 4. GitHub webhook (PR merge → in_progress, deploy success → shipped)

Settings → Webhooks → Add webhook:

- **Payload URL**: `https://<your-domain>/api/webhooks/github`
- **Content type**: `application/json`
- **Secret**: same value as `GITHUB_WEBHOOK_SECRET`
- **Events**: "Let me select individual events" → tick **Pull requests** and **Deployment statuses**

The PR body must contain `Feedback-ID: N` — the `feedback-to-pr.yml` footer handles this automatically. If you open a PR manually and want it tracked, add the trailer yourself.

**Deploy → shipped**: Vercel reports production deploys to GitHub as deployment statuses. When the `deployment_status` event fires with `state=success` on the production environment, the handler flips every `in_progress` row to `shipped`. That's "best-effort" on purpose: single-main-branch + auto-deploy means any merged in_progress PR ends up in the next prod deploy, so batching is fine. (Vercel webhooks are Pro-plan only, so we piggyback on GitHub's free deployment_status event instead.)

## 6. Test the flow

1. Submit a feedback item via the widget.
2. Visit `/admin/feedback` — status = `new`.
3. Click Approve. Check that a GitHub issue was created with the `feedback-approved` label; row flips to `approved` with `github_issue_url` populated.
4. GH Actions workflow `Feedback → PR` runs. Opens a PR with `Feedback-ID: <id>` in the body.
5. On PR merge, GitHub webhook fires → row flips to `in_progress` with `pr_url` populated.
6. Vercel builds + deploys → GitHub `deployment_status` webhook fires → row flips to `shipped` with `shipped_at`.

## Known edges / future work

- **`claude-code-action` schema**: the `@v1` action's exact inputs may differ; check before first run. If the action doesn't support the `mode: issue` dispatch natively, use a `workflow_dispatch` trigger with the issue body passed via inputs.
- **Deploy-shipped precision**: v1 marks *all* `in_progress` rows shipped on any prod deploy. If you start merging multiple feedback PRs in a window and a deploy partially fails, rows may be mismarked. v2 would diff the deployment's commit range and only ship rows whose `pr_url` is in that range.
- **Submitter notification**: not wired in v1. Drop a Resend call into the deployment_status handler after the update if you want the PM to get an email on ship.
- **Re-opening after reject**: `/admin/feedback` currently only shows Approve/Reject on `new` rows. If a rejected item needs revisiting, un-reject via SQL.
