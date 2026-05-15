---
name: Agent-ready task
about: A scoped task with clear acceptance criteria, ready for the engineering agent
title: "[agent] "
labels: []
assignees: []
---

<!--
Tickets opened with this template are NOT auto-picked-up. To dispatch the
engineering agent, apply the `agent-ready` label after reviewing the body
below. The agent will create a branch, make the changes, and open a PR.
-->

## What needs to change

<!-- One paragraph describing the user-visible behaviour change or refactor.
     Avoid abstractions — describe what the user (operator or customer) will
     see differently after this lands. -->

## Files most likely to touch

<!-- List the 1-5 files the agent should focus on. If you don't know, write
     "agent may discover". For multi-file refactors of a single concept
     (e.g. "complete the school-vs-office terminology pass"), list the
     specific concept rather than every file. -->

## Acceptance criteria

<!-- Concrete, testable. Every item should be verifiable by reading the diff
     or clicking around the Vercel preview. Bad: "make it better." Good:
     "the order success page has a 'Reorder weekly' button that creates a
     new weekly plan with the same items." -->

- [ ] 

## Out of scope

<!-- Anything the agent should NOT touch. If this is a refactor, list the
     adjacent code that should stay as-is. Helps prevent scope creep. -->

## Blast radius

<!-- low | medium | high. Anything touching orders, payments, auth, or
     schema is `high` and requires careful human review of the PR. -->

low / medium / high
