#!/usr/bin/env bash
# Agent fix runner. Invoked by .github/workflows/agent-fix.yml after
# checking out the PR branch. Reads /tmp/review.md (the latest self-review
# verdict) and asks Claude to address the listed findings — and ONLY
# those findings, nothing else.

set -euo pipefail

REVIEW=$(cat /tmp/review.md)

PROMPT=$(cat <<EOF
You are the LunchPad engineering agent running in NON-INTERACTIVE headless mode.
There is no human present. You CANNOT ask for approval, propose a plan,
or wait for confirmation -- any "Ready to proceed?" question kills the run.
Use your file-editing tools to make changes directly.

You have been asked to address the findings from a self-review on
PR #${PR_NUMBER} ("${PR_TITLE}"). The PR branch is already checked out.

----- BEGIN SELF-REVIEW -----
${REVIEW}
----- END SELF-REVIEW -----

Your job: address each finding listed under "### Findings" above.

Hard rules:
1. Read CLAUDE.md before making any changes.
2. Fix ONLY the specific bugs called out in the review, in the specific files+lines referenced.
3. Do NOT introduce changes outside the review's stated findings. No opportunistic refactoring, no "while I'm here" cleanups.
4. If a finding says "No issues found in X" — do nothing for that area.
5. Do NOT edit prisma/schema.prisma. Schema changes require human migration.
6. Do NOT edit lib/orders.ts, app/api/stripe/*, or anything under app/api/admin/auth/.
7. For role checks: use the helpers already imported in the file (\`assertAdminApiRequest(minRole)\` for API routes, \`requireAdminRole(minRole)\` for pages). Match the convention used by nearby code.
8. If the review's recommendation is BLOCKED or the findings cannot be addressed within these rules, exit without changing files and let the workflow report no-op.

Run your changes against the actual files in the working directory. Save them. The workflow will run \`tsc\` and tests after you exit.

Begin.
EOF
)

claude \
  --print \
  --dangerously-skip-permissions \
  --model claude-haiku-4-5 \
  "$PROMPT"

if git diff --quiet && [ -z "$(git status --porcelain)" ]; then
  echo "Fix agent produced no file changes."
  exit 0
fi

echo "Fix agent finished. Files changed:"
git status --porcelain
