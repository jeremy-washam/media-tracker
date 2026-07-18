# Media Tracker Implementation Plan

Last updated: 2026-07-18

## 1. Product and architectural boundaries

These are fixed unless explicitly revisited:

- Single-user, private application.
- React and Vite frontend; no Next.js.
- Hono REST API on Cloudflare Workers.
- Cloudflare D1 for normalized relational data.
- Cloudflare R2 for raw exports, API snapshots, and authorized full text.
- Cloudflare Queues and Cron Triggers for synchronization.
- Cloudflare Access for initial web authentication.
- TypeScript throughout, with Drizzle and Zod.
- API-first design so a future iOS client can use the same backend.
- No recommendations, LLM integration, or queue interface in the first ingestion milestone.
- Preserve enough provenance and source material to support those features later.

## 2. Repository structure

Use a small pnpm workspace:

```text
apps/
  web/                 React/Vite application
  api/                 Hono Cloudflare Worker
  cli/                 local backfill and recovery commands

packages/
  domain/              canonical models and normalization rules
  db/                  Drizzle schema, migrations, repositories
  contracts/           Zod API request/response schemas
  connectors/
    readwise/
    hardcover/
    letterboxd/
    spotify/
    youtube/
  test-fixtures/        sanitized source payloads and exports

docs/
  architecture/
  decisions/
```

Essential commands:

```text
pnpm dev
pnpm build
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
pnpm db:generate
pnpm db:migrate:local
pnpm db:migrate:remote
pnpm deploy
```

## 3. Phase 0: Architecture decisions and safeguards

Before implementation, record concise architectural decisions covering:

- Cloudflare-native deployment
- React/Vite instead of Next.js
- Event-based media ledger
- Raw-source preservation
- Idempotent connector processing
- D1/R2 storage boundary
- Single-user authentication
- Database portability strategy

Define the connector interface:

```ts
interface Connector {
  validateConnection(): Promise<ConnectionStatus>
  backfill(input?: BackfillInput): AsyncIterable<RawRecord>
  reconcile(cursor?: SyncCursor): AsyncIterable<RawRecord>
  normalize(raw: RawRecord): NormalizationResult
}
```

Define operational principles:

- Never advance a sync cursor before its records are committed.
- Never discard a raw source record merely because parsing failed.
- Every queue message must have an idempotency key.
- Generated data must never overwrite imported source facts.
- Secrets must never appear in logs, fixtures, or Git.
- Source deletions should be represented, not silently erase local history.

Deliverable: documented decisions and stable package boundaries.

## 4. Phase 1: Application scaffold

### Frontend

Build a minimal responsive shell with:

- Navigation
- History placeholder
- Connections placeholder
- Sync-status indicator
- Error and empty states

Use:

- React
- Vite
- TanStack Router
- TanStack Query
- Tailwind CSS
- shadcn/ui where useful

### API

Create the Hono Worker with:

```text
GET /api/health
GET /api/media
GET /api/media/:id
GET /api/connections
GET /api/sync-runs
```

Add:

- Zod request and response validation
- Consistent error format
- Request IDs
- Structured, redacted logging
- OpenAPI generation
- Cloudflare environment bindings

### Local infrastructure

Configure local simulations for:

- D1
- R2
- Queues
- Cron handlers
- Static assets

Deliverable: `pnpm dev` starts a working local web app and API without requiring real credentials.

## 5. Phase 2: Canonical media ledger

### Core tables

```text
sources
connections
sync_runs
sync_cursors
raw_objects

media_items
external_identities
contributors
media_contributors
media_relations

events
documents
highlights
queue_entries
```

### Media items

Support:

```text
article
video
podcast_episode
movie
book
song
```

Do not force every media type into identical metadata. Common fields belong on `media_items`; specialized fields can use typed extension tables or structured attributes.

### External identities

Store multiple source identities per item:

```text
source
external_type
external_id
canonical_url
metadata
```

Examples include Letterboxd film IDs, TMDB IDs, Spotify episode URIs, YouTube video IDs, Readwise document IDs, Hardcover edition/work IDs, and ISBNs. Unique constraints should prevent duplicate source identities.

### Events

Initial event vocabulary:

```text
saved
queued
started
progressed
completed
abandoned
skipped
rated
reviewed
liked
highlighted
removed
```

Each event should distinguish:

```text
occurred_at       when the activity happened
recorded_at       when the source recorded it
ingested_at       when this app received it
```

Also preserve:

- Original source value
- Original rating scale
- Normalized rating, if calculated
- Progress amount and unit
- Source event ID
- Raw-object reference
- Parser version

### Raw objects

Every import page, webhook, RSS response, and export file gets:

- R2 location
- SHA-256 checksum
- Source
- Content type
- Acquisition timestamp
- Parser version
- Parsing status
- Error details when parsing fails

### Derived state

Current state should be calculated from events and optionally cached. Examples include currently reading, completed, last progress, current rating, and queued. The event history remains authoritative.

Deliverable: migrations, repository methods, seed fixtures, and replay-safe persistence tests.

## 6. Phase 3: Readwise vertical slice

Readwise is the architecture-validation connector.

### Connection

- Accept a token through local/deployment secrets.
- Validate it using Readwise's auth endpoint.
- Show connection state without exposing the token.
- Record validation failures and last successful use.

### Full backfill

- Fetch every Reader document using cursor pagination.
- Save every response page in R2.
- Normalize documents, highlights, notes, tags, progress, and timestamps.
- Support articles, PDFs, EPUBs, videos, RSS items, emails, and notes without misclassifying them as all being articles.
- Track a complete sync run with counts and errors.

### Incremental reconciliation

- Store the last successful `updatedAfter` watermark.
- Include an overlap window to protect against timestamp boundary issues.
- Upsert changed documents.
- Advance the watermark only after successful processing.
- Run nightly.

### Webhooks

Support document creation, finishing, archiving, moves to Later or Inbox, shortlisting, tag updates, and highlight creation.

Webhook flow:

```text
validate secret
-> hash payload
-> save raw payload
-> enqueue
-> return success
-> normalize asynchronously
```

### Readwise UI

Connections page:

- Connection status
- Last successful sync
- Last webhook
- Records imported
- Errors requiring attention
- Manual Sync now action

History page:

- Document list
- Title, author, source, and type
- Saved, opened, and completed dates
- Progress
- Tags
- Filters and sorting

Detail page:

- Source metadata
- Event timeline
- Notes and highlights
- Provenance
- Link back to Reader

### Acceptance gate

Readwise is complete when:

- Full history imports successfully.
- Repeating the import creates no duplicates.
- Incremental reconciliation detects changes.
- Webhooks update records promptly.
- A failed page or webhook can be replayed.
- Every normalized item traces back to raw input.
- The UI accurately reflects completion and progress.

No other connector begins until this gate passes.

## 7. Phase 4: Hardcover

- Authenticate with the Hardcover API token.
- Import books, editions, statuses, ratings, reviews, read dates, and progress.
- Preserve Hardcover work and edition identities separately.
- Map rereads to separate completion events.
- Add scheduled reconciliation.
- Determine whether source modification timestamps permit incremental polling; otherwise use idempotent reconciliation.

Do not collapse:

- Book work versus edition
- Physical, ebook, and audiobook formats
- Multiple reading sessions
- Read status versus a dated completion
- DNF versus ordinary abandonment

Acceptance gate: Hardcover history repeatedly reconciles without duplicates and represents rereads correctly.

## 8. Phase 5: Letterboxd

### Historical import

Build a local CLI importer:

```text
pnpm media import letterboxd ./letterboxd-export.zip
```

Parse watched films, diary entries, ratings, reviews, likes, tags, watchlist entries, and relevant lists. Preserve the original ZIP in R2.

### Ongoing sync

- Poll the profile RSS feed.
- Import new diary entries, reviews, and lists.
- Record the RSS item identifier and payload.
- Reconcile overlapping entries because feeds may reorder or update.

RSS will not provide a perfect account mirror. The UI must show that Letterboxd sync is partial rather than implying complete coverage.

Acceptance gate: export backfill and RSS updates merge into the same film identities without duplicate watch events.

## 9. Phase 6: Spotify

### OAuth

- Add Authorization Code flow.
- Encrypt refresh tokens in D1.
- Refresh access tokens automatically.
- Surface the six-month reauthorization deadline.
- Keep client secrets in Worker secrets.

### Historical backfill

CLI import:

```text
pnpm media import spotify ./spotify-extended-history/
```

Normalize tracks, podcast episodes, playback timestamps, milliseconds played, skip indicators, offline/private-session fields when present, and Spotify URIs and metadata.

### Song synchronization

- Poll recently played tracks every few minutes.
- Use `played_at` plus Spotify track ID as the primary idempotency basis.
- Preserve repeated listens as separate events.
- Avoid treating every short play as a completed listen without evidence.

### Podcast synchronization

- Poll currently playing with episode support.
- Record progress snapshots.
- Reconcile saved episodes and their resume points.
- Derive completion only when evidence crosses a configurable threshold.
- Mark inferred events explicitly as inferred.

Acceptance gate: song playback is reliable; podcast status clearly communicates its confidence and limitations.

## 10. Phase 7: YouTube

### Google setup

This phase requires:

- Google Cloud project
- Billing enabled
- Data Portability API enabled
- OAuth consent configuration
- Redirect URI
- Restricted YouTube activity scope
- Personal-use/unverified application setup

### Portability workflow

Implement a persisted state machine:

```text
authorization obtained
-> export initiated
-> job ID stored
-> status polled
-> signed archive URLs received
-> archives streamed to R2
-> parsing jobs queued
-> records normalized
-> next permitted export scheduled
```

Never wait synchronously for an archive.

### Watch-history normalization

Import video IDs or URLs, watch timestamps, channel information, activity details, and the distinction between search and watch activity. Do not treat a watch-history entry as proof that the video was completed.

### Metadata enrichment

Use the ordinary YouTube Data API to enrich known video IDs with current title, channel, duration, description, thumbnail, publication date, and availability state. Preserve original historical titles when supplied because videos may later change or disappear.

Acceptance gate: one-time history import plus daily incremental sync works and survives delayed Google archive jobs.

## 11. Search readiness

Implement useful non-LLM search during ingestion work:

- Title
- Creator
- Source
- Media type
- Date ranges
- Ratings
- Completion status
- Notes
- Highlights
- Readwise text where authorized

Use D1 FTS5 initially.

Create a retrieval boundary:

```ts
interface SearchRepository {
  searchText(query: string, filters: SearchFilters): Promise<SearchHit[]>
  getEvidence(ids: string[]): Promise<Evidence[]>
}
```

Do not add embeddings yet. When LLM search begins, add chunking and vector retrieval behind this boundary without changing the media ledger.

## 12. Queue readiness

Create the local queue model now:

```text
queue_entries
  media_item_id
  state
  priority
  added_at
  desired_by
  notes
```

Possible states:

```text
queued
in_progress
completed
removed
```

Reserve fields for upstream mirroring:

```text
source
external_id
sync_state
last_sync_attempt
sync_error
```

Do not implement upstream queue synchronization during ingestion work. The first goal is to avoid a future schema redesign.

## 13. Security and privacy

Before production deployment:

- Put private routes behind Cloudflare Access.
- Permit only the owner's identity.
- Require MFA through the identity provider.
- Encrypt rotating OAuth tokens with AES-GCM.
- Keep the encryption key in Worker secrets.
- Never log authorization headers or tokens.
- Keep R2 private.
- Validate OAuth state and webhook secrets.
- Apply restrictive CORS and security headers.
- Add connector revocation and data-deletion controls.
- Document which data is stored from every service.
- Provide a complete app export.

The app should be recoverable without turning Cloudflare into the only copy of the data.

## 14. Testing strategy

### Unit tests

- Source normalizers
- Rating conversions
- Timestamp handling
- Identity matching
- Event derivation
- Completion heuristics

### Fixture tests

Maintain sanitized representative payloads for pagination, missing fields, deleted or unavailable media, rereads, duplicate webhook delivery, updated ratings, partial progress, and malformed exports.

### Integration tests

Against local D1, R2, and Queues:

- Full sync
- Incremental sync
- Cursor recovery
- Raw-object persistence
- Queue retries
- Idempotent replay
- Migration correctness

### End-to-end tests

Using Playwright:

- Open the application.
- View connection health.
- Trigger a fixture-backed sync.
- Browse imported media.
- Filter history.
- Inspect provenance.
- Recover from a simulated connector failure.

The most important invariant is:

```text
Importing the same source data twice produces the same final database state.
```

## 15. Deployment and operations

### Production resources

- One Worker with React assets and Hono API
- One D1 database
- One R2 bucket
- Main ingestion queue
- Dead-letter queue
- Cron triggers
- Cloudflare Access application
- Worker secrets

### Deployment procedure

```text
test
-> build
-> validate migrations
-> create D1 recovery bookmark/export
-> apply migrations
-> deploy Worker and assets
-> run smoke tests
```

### Operational UI

Connections should report:

- Connected or disconnected
- Last successful sync
- Last attempted sync
- Current cursor
- Imported record count
- Failed record count
- Reauthorization deadline
- Coverage level: complete, partial, or best-effort

### Recovery

- Use D1 Time Travel for recent mistakes.
- Export D1 to R2 regularly for longer retention.
- Retain raw source imports.
- Add CLI commands to replay one object, one sync run, or an entire source.

## 16. Credential and user-input checkpoints

Credentials should be requested only when required:

1. No credentials for scaffold and schema work.
2. Readwise token when the connector is ready.
3. Hardcover token after Readwise acceptance.
4. Letterboxd username and export ZIP for its phase.
5. Spotify developer credentials and export directory.
6. Google Cloud OAuth configuration during YouTube work.

Secrets should be entered into local or Cloudflare secret storage, not pasted into chat or committed to Git.

## 17. Completion definition for ingestion v1

The ingestion milestone is complete when:

- Readwise and Hardcover histories are fully backfilled and continuously synchronized.
- Letterboxd history is backfilled and new RSS-visible activity is synchronized.
- Spotify lifetime history is imported, songs synchronize automatically, and podcast limitations are visible.
- YouTube watch history is imported and incrementally refreshed through Data Portability.
- All connectors are idempotent and replayable.
- The application provides useful history browsing, filtering, and provenance.
- Connection health and failures are visible.
- Raw data and normalized data can be exported.
- No LLM or upstream service is required to access the owner's own history.

## 18. Immediate implementation sequence

The first six reviewable changes should be:

1. Architecture records and pnpm workspace scaffold
2. React/Hono local application with Cloudflare bindings
3. Canonical D1 schema and repository layer
4. R2 raw-object store and replay framework
5. Fixture-backed Readwise backfill
6. Readwise history UI, reconciliation, and webhooks

This sequence proves the most consequential choices before investing in the harder integrations.
