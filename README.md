# Imladris

Imladris is a private, single-user ledger that consolidates personal media
history from Letterboxd, Hardcover, Spotify, Readwise Reader, and YouTube. The
initial goal is trustworthy historical backfill and ongoing synchronization.
Future work includes a centralized queue, evidence-backed LLM search, and
possibly an iOS client.

All five initial sources have local ingestion paths: Readwise Archive polling,
Hardcover Read-shelf reconciliation, Letterboxd export/RSS ingestion, Spotify
podcast export/saved-episode ingestion, and manual YouTube Takeout imports.
History supports server-side media-type filtering, complete counts, and cursor
pagination. Connections shows each account, source coverage, incomplete imports,
resume controls, and recent sync attempts. This is a locally validated MVP, not a
production deployment or a completed recovery toolset.

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
pnpm db:migrate:local
cp apps/api/.dev.vars.example apps/api/.dev.vars
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
Provider credentials are required only for their respective sync actions.
Deployed Cron Triggers poll Readwise, Hardcover, Letterboxd, and Spotify hourly;
`wrangler dev --test-scheduled` exposes a manual test endpoint and does not run
an unattended hourly schedule. YouTube has no automatic history sync. The
IDs in `apps/api/wrangler.jsonc` are local placeholders and must be replaced
before remote deployment.

## Upgrading an existing local database

Back up local D1 before applying new migrations, then run `pnpm db:migrate:local`.
Migration 0002 adds encrypted rotating-token storage without changing ledger
records. Spotify also requires `TOKEN_ENCRYPTION_KEY`, a base64-encoded random
32-byte AES key, in `apps/api/.dev.vars` or Worker secrets. Keep this key with
your private backups. Replacing `SPOTIFY_REFRESH_TOKEN` with a new authorization
automatically replaces the stored grant on the next sync. Do not rotate the AES
key alone: reauthorize with a new bootstrap token at the same time so the old
ciphertext does not need to be decrypted.

Imports are retried by uploading the same ZIP. Spotify and YouTube can also
resume directly from Connections using their stored raw source. Use the existing
YouTube account card for later snapshots; a new account label creates a separate
lineage. No real source data needs to be deleted to retry an import.

## Remaining limitations

Audiobooks, generalized replay, app-wide remote export/recovery commands,
webhooks, and production Access provisioning remain deferred. Music is
implemented. Imports use HTTP requests, polling uses scheduled handlers, and
queues handle selective Reader content and catalog jobs. Deployment helpers and
a local snapshot/restore rehearsal are available; they do not provide the full
operational recovery toolset.

## Checks

Private hosting preparation, Access authentication, production asset packaging,
and the local data-transfer rehearsal are documented in the
[deployment runbook](docs/planning/deployment.md). Use `pnpm build:production`
for hosted artifacts and `pnpm deploy` only after configuring the ignored real
production target. The CLI's deployment helpers do not implement generalized
replay/export/recovery.

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
