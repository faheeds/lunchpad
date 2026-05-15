#!/usr/bin/env bash
# QA agent runner. Invoked by .github/workflows/qa-agent.yml with results
# from typecheck / tests / smoke + Vercel preview URL in env. Writes
# qa-verdict.md which the workflow then posts as a PR comment.

set -euo pipefail

# Pull the PR diff so the agent can review what changed.
DIFF=$(git diff origin/main...HEAD --stat=200,1000)
FULL_DIFF=$(git diff origin/main...HEAD)

# Cap the diff size to keep tokens reasonable. Full diff goes up to ~30K chars.
if [ "$(echo "$FULL_DIFF" | wc -c)" -gt 30000 ]; then
  FULL_DIFF=$(echo "$FULL_DIFF" | head -c 30000)
  FULL_DIFF="$FULL_DIFF

[truncated — diff is larger than 30k chars; QA reviewed top portion only]"
fi

PROMPT=$(cat <<EOF
You are the LunchPad QA agent. You are reviewing a pull request that was opened by the engineering agent.

PR title: ${PR_TITLE}
PR body:  ${PR_BODY}

Automated check results:
- TypeScript compile:  ${TSC_RESULT}
- Unit tests:          ${TESTS_RESULT}
- Smoke test preview:  ${SMOKE_RESULT:-skip}
- Vercel preview URL:  ${PREVIEW_URL:-not-available}

Diff stat:
$DIFF

Full diff (may be truncated):
$FULL_DIFF

Your job: review the diff for correctness, propose a verdict, and produce a comment for the PR.

Look specifically for:
1. Obvious correctness bugs: missing await, wrong arg order, off-by-one, missing null checks.
2. Security regressions: anything that bypasses tenant scoping, exposes secrets, weakens auth, adds SQL injection surfaces.
3. Multi-tenant data leaks: any new Prisma query that doesn't filter by restaurantId where it should.
4. Schema usage that diverges from prisma/schema.prisma.
5. Hardcoded school-y copy that should use the label utility.
6. UI changes that lack accessibility basics (alt text, aria-label, keyboard nav).
7. Anything touching app/api/stripe/* or lib/orders.ts — these need extra scrutiny.

Write your verdict to qa-verdict.md as Markdown with this exact shape:

## QA Verdict: <PASS | NEEDS_FIXES | BLOCKED>

**TypeScript:** <pass/fail emoji + one-line note>
**Tests:** <pass/fail/skip + one-line note>
**Smoke:** <pass/fail/skip + one-line note + preview URL if available>

### Diff review
<bullet list of findings — each bullet is one specific finding with the file+line, or "no issues found in <area>" if clean>

### Recommendation
<one paragraph: should this merge as-is, merge with the listed nits fixed, or be sent back to the engineering agent for rework?>

Be terse. Avoid praise. Skip preamble. Do not invent findings if you don't see any — say "no issues found" and move on.
EOF
)

claude \
  --print \
  --dangerously-skip-permissions \
  --model claude-haiku-4-5 \
  "$PROMPT" > qa-verdict.md 2>&1

# Defensive: if the agent didn't produce the marker, fall back to a stub.
if ! grep -q "QA Verdict" qa-verdict.md; then
  cat > qa-verdict.md << ENDFALLBACK
## QA Verdict: NEEDS_FIXES

QA agent did not produce a structured verdict. Raw output:

\`\`\`
$(cat qa-verdict.md)
\`\`\`

Please review manually.
ENDFALLBACK
fi

echo "QA verdict written to qa-verdict.md"
