# Imladris

Imladris is a private, single-user ledger that consolidates personal media
history from Letterboxd, Hardcover, Spotify, Readwise Reader, and YouTube. The
foundation is trustworthy historical backfill and ongoing synchronization.
The desktop Library now browses all six media types with source-derived Queue
views, search, filters, pagination, and contextual inspectors. Future work
includes manual Queue management, evidence-backed LLM search, Chat, Recaps,
and possibly an iOS client.

All five initial sources have local ingestion paths: all-location Readwise
document/highlight polling, Hardcover Want to Read/Currently Reading/Read
reconciliation, Letterboxd export/RSS ingestion, Spotify podcast/song exports
and saved-library/player/recent-track polling, and manual YouTube Takeout
imports. Library has 16 sections: Books and Movies Archive/Queue, Articles
Archive/Queue/Feed, Podcasts Archive/Queue/Following, Music Tracks/Albums/Artists,
and Videos Archive/Queue/Channels. The root opens Books Archive; the legacy
History page is unmounted, while its generic media API remains available.
Connections shows each account, source coverage, incomplete imports,
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
IDs in `apps/api/wrangler.jsonc` are local placeholders. Hosted deployment uses
a separate ignored `apps/api/wrangler.production.jsonc`; generate and validate
it through the deployment runbook rather than repurposing the local config.

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
pnpm test:runtime
pnpm test:acceptance
pnpm test:coverage
```

Playwright's Chromium and WebKit browsers are installed once with
`pnpm exec playwright install chromium webkit`. Real provider credentials must never be
committed.

`pnpm check:all` runs static/unit/Python checks, a production build, Worker-runtime
tests, mocked browser regressions, and real-stack browser acceptance in sequence.
The two standalone runtime/acceptance commands each rebuild production artifacts
first. Their Miniflare instances apply every current migration to disposable D1,
use private temporary R2 and local queues, and seed all six Library families
through the real import/sync routes. Synthetic provider responses are supplied
only at the outbound boundary; all other outbound requests fail. They never load
owner credentials or the development `.wrangler` database.

`pnpm test:coverage` reports maintained TypeScript source, including files not
imported by tests, to `coverage/` (HTML, LCOV, and JSON summary). Generated routing
and UI primitives, historical design studies, declaration files, and manual provider
probes are outside this report. Python deployment tests run once through
`pnpm test:deployment`. Native iOS build/tests remain separate under
[`apps/ios`](apps/ios/README.md).

Coverage runs one test file at a time to leave headroom for instrumentation;
ordinary Vitest runs use at most two workers. Assertions and timeouts stay the same.
The percentages measure Vitest source coverage; the separate browser and compiled
Worker runtime suites do not contribute to those percentages.

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
