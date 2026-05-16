#!/usr/bin/env bash
# Agent fix runner. Invoked by .github/workflows/agent-fix.yml after
# checking out the PR branch. Reads /tmp/review.md (the latest self-review
# verdict) and asks Claude to address the listed findings - and ONLY
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

Your job: address each ACTIONABLE finding listed under "### Findings" above.

CRITICAL: Verify each finding before acting on it.
- Open the file the reviewer cited and read the surrounding 10 lines.
- If the line numbers do not match what the reviewer described, the finding is hallucinated. Do not invent a fix.
- If the reviewer claims a route is missing (e.g. "404"), check whether the route actually exists on disk under app/. Many "missing route" claims by the reviewer are wrong.
- If a finding references code that does not exist in the file (e.g. claims a ternary structure that is not there), the finding is hallucinated. Skip it.

When acting:
- For findings that offer multiple fix options, pick the SIMPLEST one (usually removal).
- Prefer minimal, surgical edits over rewrites.
- Make changes ONLY in the files+lines the reviewer specifically named.

Hard rules:
1. Read CLAUDE.md before making any changes.
2. Do NOT introduce changes outside the review's verified findings.
3. Do NOT invent new files, components, or routes unless the review explicitly says to create one AND the create-it path is the simplest of the options offered.
4. Do NOT edit prisma/schema.prisma. Schema changes require human migration.
5. Do NOT edit lib/orders.ts, app/api/stripe/*, or anything under app/api/admin/auth/.
6. For role checks: use the helpers already imported in the file. Match the convention used by nearby code.
7. If all findings are hallucinated or unactionable, exit without changing files. The workflow will report no-op and the human will decide.
8. If you make changes, run \`npx tsc --noEmit\` mentally before finishing. The workflow will run it after you.

Begin by reading the cited files. Verify before fixing.
EOF
)

claude \
  --print \
  --dangerously-skip-permissions \
  --model claude-haiku-4-5 \
  "$PROMPT"

if git diff --quiet && [ -z "$(git status --porcelain)" ]; then
  echo "Fix agent produced no file changes (all findings either hallucinated or already addressed)."
  exit 0
fi

echo "Fix agent finished. Files changed:"
git status --porcelain
