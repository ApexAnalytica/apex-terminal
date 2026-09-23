#!/usr/bin/env bash
# Configure `main` branch protection on apexanalytica/apex-terminal to
# require both Vercel deploy checks before merging.
#
# Usage:
#   ./scripts/configure-branch-protection.sh
#
# Requires:
#   - `gh` CLI authenticated as a repo admin (`gh auth status` to verify)
#   - jq (used for safe JSON construction)
#
# What this does:
#   PUTs the branch protection rule for `main` with:
#     - required_status_checks.strict = true  (branch must be up to
#       date before merge — Vercel will rebuild if main moves)
#     - required_status_checks.contexts = [
#         "Vercel – manifold",
#         "Vercel – apex-analytica-website",
#       ]
#     - enforce_admins = false  (admins can bypass-merge if Vercel is
#       degraded; flip to true if you want zero-bypass)
#     - required_pull_request_reviews = null  (no review requirement
#       change — preserves whatever's there today)
#     - restrictions = null  (no push restrictions)
#
# Re-run safely: PUT is idempotent. The script prints the new effective
# protection JSON on success.

set -euo pipefail

REPO="ApexAnalytica/apex-terminal"
BRANCH="main"

if ! command -v gh >/dev/null 2>&1; then
  echo "Error: gh CLI not found. Install from https://cli.github.com/" >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "Error: jq not found. brew install jq" >&2
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "Error: gh CLI not authenticated. Run: gh auth login" >&2
  exit 1
fi

echo "→ Configuring branch protection on ${REPO}@${BRANCH}..."

# Build the payload via jq so quoting / unicode in the Vercel context
# names (the em-dash "–" is U+2013, NOT a hyphen-minus) survives intact.
PAYLOAD=$(jq -n '{
  required_status_checks: {
    strict: true,
    contexts: [
      "Vercel – manifold",
      "Vercel – apex-analytica-website"
    ]
  },
  enforce_admins: false,
  required_pull_request_reviews: null,
  restrictions: null,
  allow_force_pushes: false,
  allow_deletions: false
}')

# Capture the full response so we can show it on success. --silent
# disables gh's pretty-printer; we feed the body through jq ourselves.
RESPONSE=$(gh api \
  --method PUT \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "/repos/${REPO}/branches/${BRANCH}/protection" \
  --input - <<<"$PAYLOAD")

echo "✓ Branch protection updated. Effective rule:"
echo "$RESPONSE" | jq '{
  required_status_checks: .required_status_checks,
  enforce_admins: .enforce_admins.enabled
}'

echo ""
echo "Verify: open any PR. The merge button should now be greyed out"
echo "until both Vercel checks flip from pending → success."
