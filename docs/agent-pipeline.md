# Engineering + QA agent pipeline

Two GitHub Actions workflows that let an agent chew through scoped tickets
while you spend your time on judgment and product. Both run Claude Code in
headless mode on Linux runners, which sidesteps the Windows-mount truncation
issue that plagues local edits.

## How it works

```
You open an issue
   │
   │  Add label `agent-ready`
   ▼
Engineering agent fires
   • Reads CLAUDE.md + the issue body
   • Makes changes on a branch `agent/issue-NNN`
   • Runs `npx tsc --noEmit` before pushing
   • Opens a PR, labels it `agent-pr`
   │
   ▼
Vercel auto-deploys a preview
   │
   ▼
QA agent fires (on the `agent-pr` label)
   • Re-runs typecheck + unit tests
   • Polls the PR comments for the Vercel preview URL
   • Runs scripts/smoke-test.ts against the preview
   • Reviews the diff for correctness + security + tenancy bugs
   • Posts a structured verdict as a PR comment
   │
   ▼
You read the verdict, click the preview, eyeball the change, merge.
```

The agent never merges. The agent never pushes to `main`. Every change goes
through a human review.

## One-time setup

Before this pipeline works, do these three things in the GitHub repo:

### 1. Add the API key as a repo secret

Settings → Secrets and variables → Actions → New repository secret

| Name                 | Value                                                                          |
| -------------------- | ------------------------------------------------------------------------------ |
| `ANTHROPIC_API_KEY`  | Your Anthropic API key (the same one you use for menu extraction is fine)      |

`GITHUB_TOKEN` is auto-injected by Actions — no action needed.

### 2. Lock down `main`

Settings → Branches → Branch protection rule → Branch name pattern `main`

- ✅ Require a pull request before merging
- ✅ Require approvals: 1
- ✅ Require status checks to pass before merging
  - Required check: `Engineering Agent / run` (only if it ran)
  - Required check: `QA Agent / qa` (when an `agent-pr` is the source)
- ✅ Do not allow bypassing the above settings
- ❌ Leave "Allow force pushes" off

This guarantees the agent can never accidentally push to `main`.

### 3. Create the labels

In the GitHub UI: Issues → Labels

| Label name      | Color (suggestion) | Purpose                                                                                  |
| --------------- | ------------------ | ---------------------------------------------------------------------------------------- |
| `agent-ready`   | `#1D9E75`          | Applied to an issue to dispatch the engineering agent                                    |
| `agent-pr`      | `#185FA5`          | Applied to PRs by the engineering agent; triggers the QA agent                           |
| `agent-blocked` | `#B85A30`          | Applied by you to halt the agent on a specific ticket (the workflow ignores other labels) |

## Daily flow

### Dispatching the agent

1. Open a new issue using the "Agent-ready task" template.
2. Fill in: behaviour change, files to touch, acceptance criteria, out-of-scope, blast radius.
3. **Review the issue body for clarity.** Vague tickets produce bad PRs.
4. Apply the `agent-ready` label.
5. Watch the Actions tab. The engineering agent should finish in 5-15 min.

### Reviewing the agent's PR

1. PR appears in your queue with the `agent-pr` label.
2. Vercel posts the preview URL as a comment within 60-90s.
3. QA agent finishes 3-10 min later and posts its verdict.
4. Click the Vercel preview, click around the changed surfaces.
5. Read the diff yourself for anything touching:
   - Money (`lib/orders.ts`, `app/api/stripe/*`)
   - Auth (`app/api/admin/auth/*`, `lib/admin-auth.ts`)
   - Schema (`prisma/schema.prisma`)
   - Multi-tenant scoping (any new `findMany` / `count` that filters by `restaurantId`)
6. Approve + squash-merge.

### What to do when an agent fails

The workflow comments back on the issue with the failure reason. Typical failures:

| Failure mode                            | What to do                                                                                        |
| --------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Typecheck failed                        | Re-run from the Actions tab. If it fails again, the issue body is probably under-specified.       |
| "Agent produced no file changes"        | The agent decided the task was already done or unsolvable. Read the workflow log for its reasoning. |
| Out-of-scope changes                    | Close the PR, edit the issue to add the boundary in "Out of scope", apply `agent-ready` again.    |
| QA verdict says NEEDS_FIXES or BLOCKED  | Either fix the listed items yourself, or close the PR and re-dispatch with a tighter issue body.  |

## Hard rules baked into the agent prompt

The engineering agent has been instructed to:

- Read CLAUDE.md first.
- Stay strictly within the issue's scope.
- Run typecheck before declaring done.
- **NOT** edit `prisma/schema.prisma`.
- **NOT** edit `lib/orders.ts`, `app/api/stripe/*`, or admin auth.
- Prefer `lib/location-labels.ts` over hardcoded copy.

Any ticket that requires touching the prohibited files should be done by you, not the agent.

## Cost expectations

- Engineering agent run: ~$0.20 - $2.00 in tokens (Sonnet 4.5).
- QA agent run: ~$0.10 - $0.80.
- GitHub Actions minutes: free tier covers ~2000 min/month on private repos; this pipeline uses ~5-25 min per ticket cycle.

If you find the agent is burning tokens on tasks it can't actually finish, tighten the issue templates. Vague tickets cost more because the agent reads more files before giving up.

## Killing a runaway run

- Actions tab → click the run → "Cancel workflow".
- If a PR is already open and you don't want it merged, close it.
- To stop a specific ticket from being re-picked-up, apply `agent-blocked` and remove `agent-ready`.

## Suggested first tickets

Start with low-blast-radius mechanical work to build trust in the pipeline:

1. **Genericization sweep** — "Replace remaining hardcoded 'school' / 'student' / 'kids' / 'grade' / 'parent' references in app/account, app/weekly, app/history, app/(marketing)/checkout/success with operator-aware labels via `getLabels` or `getLabelsForOperator`."
2. **Loading + empty states** — "Add proper empty states to the orders, locations, menu, and history pages when they have zero rows."
3. **Accessibility pass on customer pages** — "Add alt text, aria-label on icon-only buttons, and ensure keyboard nav through the order flow."
4. **Extract long files** — "Split components/forms/order-form.tsx (1180 lines) into smaller composable pieces: a StepperHeader, a DateStep, a StudentStep, etc."

After two weeks of clean PRs from the agent on these, you'll know whether to trust it on higher-blast-radius work.
