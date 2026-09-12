# Media Tracker

Media Tracker is a private, single-user ledger that consolidates personal media
history from Letterboxd, Hardcover, Spotify, Readwise Reader, and YouTube. The
initial goal is trustworthy historical backfill and ongoing synchronization.
Future work includes a centralized queue, evidence-backed LLM search, and
possibly an iOS client.

The application scaffold, source-payload reconnaissance, and canonical ledger
semantics are complete. The next phase is D1/R2 replay-safe persistence.

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
pnpm dev
```

Open `http://127.0.0.1:5173`. The command starts:

- the Vite web client on port 5173; and
- the Hono Worker with local Cloudflare bindings on port 8787.

Useful local endpoints:

- `http://127.0.0.1:8787/api/health`
- `http://127.0.0.1:8787/api/openapi.json`
- `http://127.0.0.1:8787/__scheduled?cron=0+*+*+*+*` for a local cron trigger

No Cloudflare account or provider credentials are required for local
development. Wrangler simulates D1, R2, Queues, Cron, and static asset bindings.
The IDs in `apps/api/wrangler.jsonc` are local placeholders and must be replaced
before remote deployment.

## Checks

```sh
pnpm check
pnpm build
pnpm test:e2e
```

Playwright's Chromium browser is installed once with
`pnpm exec playwright install chromium`. Real provider credentials must never be
committed.

## Documentation

- [Documentation index](docs/README.md)
- [Product context](docs/product/context.md)
- [Long-term vision](docs/product/long-term-vision.md)
- [Desktop UI foundation](docs/design/ui-foundation.md)
- [Implementation plan](docs/planning/implementation-plan.md)
- [Architecture](docs/architecture/README.md)
- [Canonical ledger](docs/architecture/canonical-ledger.md)
- [Architecture decisions](docs/decisions/README.md)
- [Threat model](docs/architecture/threat-model.md)
- [Agent instructions](AGENTS.md)
