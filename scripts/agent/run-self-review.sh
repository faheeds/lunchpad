#!/usr/bin/env bash
# Self-review runner. Invoked by .github/workflows/eng-agent.yml after
# the agent has produced changes + the workflow has run typecheck + tests.
# Writes review-verdict.md which the workflow posts as a PR comment.
#
# This is the "second opinion" that used to live in a separate QA workflow.
# It runs in the SAME workflow as the agent but uses a fresh Claude context
# and a reviewer prompt — distinct role and instructions from the engineer.
#
# HARDENING (2026-05): the reviewer model call is retried and is NEVER
# allowed to abort this script. If review genuinely cannot run, we still
# emit a NEEDS_FIXES verdict so the workflow (a) posts a visible comment
# and (b) withholds auto-merge. An un-reviewed PR must never auto-merge.

set -euo pipefail

# Pull the diff vs main.
DIFF=$(git diff origin/main...HEAD --stat=200,1000 || true)
FULL_DIFF=$(git diff origin/main...HEAD || true)

# Cap to ~30K chars to keep tokens reasonable.
# Uses pure-bash parameter expansion to avoid the `echo | head -c` pipe,
# which crashed under `set -euo pipefail` when `head` closed the pipe
# before `echo` finished (SIGPIPE -> exit 1).
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
3. Type safety regressions — \`any\`, type assertions \`as Foo\`, \`as any\`, \`@ts-ignore\`, \`@ts-expect-error\`, ignored generics. Treat EVERY \`as any\` as a likely bug — a real Stripe-refund outage shipped because \`as any\` hid an invalid enum value from tsc.
4. Schema usage diverging from prisma/schema.prisma (e.g. setting an enum value that doesn't exist, or calling a third-party API with an invalid enum/string literal).
5. Hardcoded school-y copy that should use the label utility.
6. UI changes missing accessibility basics (alt text, aria-label, keyboard nav).
7. Anything touching app/api/stripe/* or lib/orders.ts or lib/refund.ts — these require extra scrutiny.
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

# Run the reviewer model with up to 3 attempts. The `claude` call sits
# inside an `if` condition, which exempts it from `set -e` — a transient
# API failure retries instead of aborting the whole script.
REVIEW_OK=0
for attempt in 1 2 3; do
  if claude \
      --print \
      --dangerously-skip-permissions \
      --model claude-haiku-4-5 \
      "$PROMPT" > review-verdict.md 2>&1 \
     && grep -q "^## Self-Review:" review-verdict.md; then
    REVIEW_OK=1
    echo "Self-review succeeded on attempt $attempt."
    break
  fi
  echo "Self-review attempt $attempt failed or produced malformed output." >&2
  if [ "$attempt" -lt 3 ]; then
    sleep $((attempt * 10))
  fi
done

# If the reviewer never produced a valid verdict, emit a fail-safe one.
# NEEDS_FIXES (never PASS) guarantees the workflow will NOT auto-merge.
if [ "$REVIEW_OK" -ne 1 ]; then
  RAW=$(cat review-verdict.md 2>/dev/null || echo "(no output captured)")
  cat > review-verdict.md << ENDFALLBACK
## Self-Review: NEEDS_FIXES

**The automated reviewer could not produce a verdict after 3 attempts** —
a transient model/API failure or malformed output. Auto-merge is
deliberately withheld: a human must review this PR before merging it.

Raw output from the final attempt:

\`\`\`
$RAW
\`\`\`
ENDFALLBACK
fi

echo "Self-review verdict written to review-verdict.md"
