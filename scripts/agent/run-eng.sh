#!/usr/bin/env bash
# Engineering agent runner. Invoked by .github/workflows/eng-agent.yml
# with ISSUE_TITLE, ISSUE_BODY, ISSUE_NUMBER, ANTHROPIC_API_KEY in env.

set -euo pipefail

PROMPT=$(cat <<EOF
You are the LunchPad engineering agent running in NON-INTERACTIVE headless mode.
There is no human present. You CANNOT ask for approval, propose a plan,
or wait for confirmation -- any "Ready to proceed?" question kills the run.
Use your file-editing tools to make the actual code changes directly.
The workflow will verify your output by running tsc afterwards.

You are the LunchPad engineering agent. You have been assigned issue #${ISSUE_NUMBER}.

Issue title: ${ISSUE_TITLE}

Issue body:
${ISSUE_BODY}

Your context:
- This repo is a Next.js 15 / TypeScript / Prisma / Tailwind multi-tenant SaaS. Read CLAUDE.md first for the architectural rules.
- You are running in CI on a Linux machine. File I/O is reliable — no Windows-mount truncation.
- The current branch is already created and checked out. Make changes, save files, but do NOT commit or push — the workflow handles that.

Hard rules:
1. Read CLAUDE.md before making any changes.
2. Stay within the scope of the issue. Do not opportunistically refactor adjacent code.
3. Run \`npx tsc --noEmit\` before declaring done; fix any errors you introduced.
4. Do not edit prisma/schema.prisma. Schema changes require a human-supervised migration.
5. Do not edit lib/orders.ts, app/api/stripe/*, or anything under app/api/admin/auth/ — payment + auth code requires human review at the design level, not just the diff level.
6. Prefer the existing label utility (lib/location-labels.ts) over hardcoded copy.
7. If the issue cannot be solved within these rules, exit with a clear explanation rather than producing a half-solution.

Acceptance criteria are inside the issue body. The PR title will match the issue title; you do not need to compose it.

Begin.
EOF
)

echo "----- ENG AGENT PROMPT -----"
echo "$PROMPT"
echo "----- END PROMPT -----"

# Run Claude Code in headless mode. --print outputs the assistant's final
# message and exits; --dangerously-skip-permissions is required in CI where
# we can't approve tool calls interactively (the runner is ephemeral and
# isolated anyway).
claude \
  --print \
  --dangerously-skip-permissions \
  --model claude-haiku-4-5 \
  "$PROMPT"

# Sanity: make sure SOMETHING changed.
if git diff --quiet && [ -z "$(git status --porcelain)" ]; then
  echo "Agent produced no file changes."
  exit 1
fi

echo "Agent finished. Files changed:"
git status --porcelain
