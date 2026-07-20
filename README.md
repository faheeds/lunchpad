# LunchPad

LunchPad is a multi-tenant SaaS platform for school lunch and office catering
operators. Restaurant owners sign up, configure their menu and delivery
schedule, and customers order online — each tenant gets its own subdomain at
`*.lunchpad.us`.

## Where to look next

- **[CLAUDE.md](./CLAUDE.md)** — full agent + architecture context (tech stack,
  multi-tenancy, lane rules, environment variables, common patterns).
- **[docs/mobile-api-contract.md](./docs/mobile-api-contract.md)** — source of
  truth for the `/api/mobile/native/*` surface consumed by the iOS app.
- **[docs/agent-pipeline.md](./docs/agent-pipeline.md)** — CI agent pipeline
  (dev / QA lane orchestration, sign-off rules).
