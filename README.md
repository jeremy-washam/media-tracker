# Media Tracker

Media Tracker is a private, single-user ledger that consolidates personal media
history from Letterboxd, Hardcover, Spotify, Readwise Reader, and YouTube. The
initial goal is trustworthy historical backfill and ongoing synchronization.
Future work includes a centralized queue, evidence-backed LLM search, and
possibly an iOS client.

The project is currently in its architecture and application-scaffolding phase.

## Architecture

- React and Vite web client
- Hono REST API on Cloudflare Workers
- D1 for normalized relational data
- Private R2 for raw imports and authorized full text
- Cloudflare Queues and Cron Triggers for synchronization
- TypeScript, Drizzle, Zod, pnpm, ESLint, Prettier, Vitest, and Playwright

Application behavior is API-first so a future client does not depend on the web
implementation. Domain and connector packages remain independent of Cloudflare
to keep a later migration practical.

## Repository

```text
apps/
  web/                 React/Vite application
  api/                 Hono Cloudflare Worker
  cli/                 backfill, export, and recovery commands
packages/
  domain/              canonical models and normalization
  db/                  schema, migrations, and repositories
  contracts/           shared Zod contracts
  connectors/          source integrations
  test-fixtures/        synthetic connector fixtures
docs/                  product, architecture, decisions, and planning
```

## Local setup

Requirements: Node.js 24 or newer and pnpm 11 or newer.

```sh
pnpm install
pnpm check
```

The working development server will be added during the application-scaffold
phase. Real provider credentials are not required for the local scaffold and
must never be committed.

## Documentation

- [Documentation index](docs/README.md)
- [Product context](docs/product/context.md)
- [Implementation plan](docs/planning/implementation-plan.md)
- [Architecture](docs/architecture/README.md)
- [Architecture decisions](docs/decisions/README.md)
- [Threat model](docs/architecture/threat-model.md)
- [Agent instructions](AGENTS.md)
