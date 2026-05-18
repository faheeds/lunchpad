#!/usr/bin/env bash
# Self-review runner. Invoked by .github/workflows/eng-agent.yml after
# the agent has produced changes + the workflow has run typecheck + tests.
# Writes review-verdict.md which the workflow posts as a PR comment.
#
# This is the "second opinion" that used to live in a separate QA workflow.
# It runs in the SAME workflow as the agent but uses a fresh Claude context
# and a reviewer prompt — distinct role and instructions from the engineer.

set -euo pipefail

# Pull the diff vs main.
DIFF=$(git diff origin/main...HEAD --stat=200,1000 || true)
FULL_DIFF=$(git diff origin/main...HEAD || true)

# Cap to ~30K chars to keep tokens reasonable.
# Uses pure-bash parameter expansion to avoid the `echo | head -c` pipe,
# which crashed under `set -euo pipefail` when `head` closed the pipe
# before `echo` finished (SIGPIPE → exit 1).
if [ "${#FULL_DIFF}" -gt 30000 ]; then
  FULL_DIFF="${FULL_DIFF:0:30000}

[truncated — diff is larger than 30k chars; reviewer saw top portion only]"
fi

PROMPT=$(cat <<EOF
You are reviewing PR #${PR_NUMBER} on the LunchPad codebase.
Treat this as code review from a senior engineer who did NOT write the code.
Be skeptical. Look for bugs, not for praise.

PR title: ${PR_TITLE}

Automated check results (already run before you got here):
- TypeScript compile:  ${TSC_RESULT}
- Unit tests:          ${TESTS_RESULT}

Diff stat:
$DIFF

Full diff (may be truncated):
$FULL_DIFF

Look specifically for:
1. Correctness bugs — missing await, wrong arg order, off-by-one, missing null checks, no-op operations (e.g. setting a field to its existing value).
2. Multi-tenant data leaks — any new Prisma query that does not filter by restaurantId where it should.
3. Type safety regressions — \`any\`, type assertions \`as Foo\`, ignored generics.
4. Schema usage diverging from prisma/schema.prisma (e.g. setting an enum value that doesn't exist).
5. Hardcoded school-y copy that should use the label utility.
6. UI changes missing accessibility basics (alt text, aria-label, keyboard nav).
7. Anything touching app/api/stripe/* or lib/orders.ts — these require extra scrutiny.
8. Scope creep — changes outside the issue's stated scope.

Write your verdict to review-verdict.md as Markdown with this EXACT shape (the leading "## Self-Review:" line is parsed by the workflow to decide auto-merge):

## Self-Review: <PASS | NEEDS_FIXES | BLOCKED>

**TypeScript:** <one-line note based on TSC_RESULT>
**Tests:** <one-line note based on TESTS_RESULT>

### Findings
<bullet list — each bullet is one specific finding with file+line, or "No issues found in <area>" if clean>

### Recommendation
<one paragraph: merge as-is, merge after listed fixes, or send back to the engineering agent>

Use PASS only if the diff is genuinely clean — no correctness bugs, no schema mismatches, no type-safety regressions. Use NEEDS_FIXES for anything that should be addressed before merge. Use BLOCKED if the PR is fundamentally wrong (wrong scope, wrong approach).

Be terse. No preamble. No praise. If you find nothing wrong in an area, say "No issues found in <area>" and move on.
EOF
)

claude \
  --print \
  --dangerously-skip-permissions \
  --model claude-haiku-4-5 \
  "$PROMPT" > review-verdict.md 2>&1

# Defensive fallback in case the model didn't follow the format.
if ! grep -q "^## Self-Review:" review-verdict.md; then
  RAW=$(cat review-verdict.md)
  cat > review-verdict.md << ENDFALLBACK
## Self-Review: NEEDS_FIXES

Reviewer did not produce a structured verdict. Raw output:

\`\`\`
$RAW
\`\`\`

Please review manually.
ENDFALLBACK
fi

echo "Self-review verdict written to review-verdict.md"
