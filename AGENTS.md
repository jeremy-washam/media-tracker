# Repository Instructions

This file is the entrypoint for coding agents working in this repository. Keep
it concise and follow its links instead of duplicating detailed documentation.

## Read before changing code

1. Read [the product context](docs/product/context.md) for the product's purpose
   and durable constraints.
2. Read [the architecture overview](docs/architecture/README.md) and
   [development standards](docs/architecture/development-standards.md) before
   making technical decisions.
3. Read [the implementation plan](docs/planning/implementation-plan.md) when
   choosing or sequencing work.
4. Consult [the ADR index](docs/decisions/README.md) before revisiting an accepted
   architectural choice.
5. Read [the desktop UI foundation](docs/design/ui-foundation.md) before changing
   interface structure or visual design.
6. Read [the long-term vision](docs/product/long-term-vision.md) before designing
   Topics, Feed, Explore, recaps, recommendations, or LLM features.

## Non-negotiable product boundaries

- This is a private, personal, single-user application; do not add SaaS,
  multi-tenant, public-registration, or team abstractions.
- The frontend is React with Vite, not Next.js.
- The backend is an API-first Hono service on Cloudflare Workers.
- Preserve raw source records, provenance, external identities, and distinct
  event timestamps. Imported facts must remain traceable and replayable.
- Connector writes and queue processing must be idempotent. Never advance a sync
  cursor before its records are durably committed.
- Keep domain and connector logic independent of Cloudflare so storage and
  runtime migration remain practical.
- Never commit credentials, real account exports, or unsanitized fixtures.

## Repository boundaries

- `apps/web`: React/Vite browser client
- `apps/api`: Hono Worker, HTTP, cron, queue, and Cloudflare bindings
- `apps/cli`: backfill, replay, export, and recovery commands
- `packages/domain`: pure canonical models and normalization rules
- `packages/db`: schema, migrations, repositories, and storage adapters
- `packages/contracts`: shared Zod boundary contracts
- `packages/connectors/*`: source-specific integration behavior
- `packages/test-fixtures`: synthetic and sanitized test data

Do not import platform, database, HTTP, or UI libraries into `packages/domain`.
Keep route handlers thin and put source behavior in connectors and persistence in
repositories.

## Required checks

Use pnpm from the repository root. Before handing off a code or configuration
change, run:

```sh
pnpm check
```

Also run relevant build, end-to-end, and migration checks once those commands
exist. Do not claim a check passed when its package script is absent or skipped.

## Documentation maintenance

Update the owning document when behavior or a durable decision changes. Add a
new ADR to supersede an accepted decision rather than rewriting its history.
Keep package READMEs focused on package-specific setup and behavior.
