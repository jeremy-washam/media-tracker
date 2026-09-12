# Media Tracker Implementation Plan

Last updated: 2026-09-12

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
- Canonical Archive ledger with source-specific evidence
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

Build a minimal desktop shell with:

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

## 5. Phase 2: Payload reconnaissance and canonical Archive ledger

### Source-reconnaissance gate

Do not finalize the D1 schema around documentation examples alone. For each
source, first:

1. document the official API, export, feed, and webhook surfaces;
2. inventory published response fields and date semantics;
3. run a credential-safe private probe that emits shapes and aggregates rather
   than personal content;
4. create synthetic fixtures for the observed variants; and
5. compare all source reports before choosing canonical fields.

Reconnaissance and private shape probes are complete for Readwise, Spotify,
Hardcover, Letterboxd, and YouTube. Their reports in `docs/sources` are now the
evidence base for the smallest common Archive model.

### Core tables

```text
sources
connections
sync_runs
sync_cursors
raw_objects
source_records

media_items
external_identities
archive_entries
archive_entry_evidence
```

Add contributor, relation, document, highlight, or typed-extension tables only
when observed source payloads require them. Do not pre-build a universal event
system.

### Media items

Support these initial types:

```text
article
video
podcast_episode
movie
book
song
```

Do not force every media type into identical metadata. Common fields belong on
`media_items`; specialized fields can use typed extension tables or structured
attributes after their need is demonstrated by payloads. For this owner's
workflow, Reader PDFs, RSS items, and newsletter-style emails use the article
type. Reader EPUBs, tweets, personal notes, highlight-only documents, and other
ineligible categories remain source evidence without becoming standalone
Archive media.

### External identities

Store multiple source identities per item:

```text
namespace
external_type
external_id
scope
canonical_url
first_observed_source_record_id
last_observed_source_record_id
```

Examples include Letterboxd film IDs, TMDB IDs, Spotify episode URIs, YouTube
video IDs, Readwise document IDs, Hardcover edition/work IDs, and ISBNs. Unique
constraints should prevent duplicate source identities.

### Archive entries

Archive is the canonical history of consumed media. Admission follows a
documented source-specific rule: completion-like evidence for films, books, and
eligible archived Reader media; any positive Spotify podcast playback; and a
timestamped YouTube `Watched` activity with a usable video identity. One media
item may have multiple Archive entries when the source provides trustworthy
evidence of repeated consumption.

```text
media_item_id
connection_id
consumed_identity_id
source_occurrence_key
admission_reason
consumed_at
consumed_at_precision
consumed_at_basis
source_recorded_at
source_rating
review_text
upstream_state
```

`consumed_at` may be null when a source proves Archive admission but provides no
trustworthy date. Preserve date-only versus instant precision and never replace
a missing consumption date with a save, publication, source-recorded, or
ingestion timestamp.

The initial model does not track progress, started, paused, skipped, abandoned,
or other universal engagement events. Preserve relevant upstream values in raw
evidence and source-owned records. Ratings, reviews, likes, tags, Readwise
highlights, and Spotify play segments may enrich Archive or future search, but
they do not require a broad event vocabulary.

Each raw payload is parsed into addressable `source_records`. Link those records
to Archive occurrences through `archive_entry_evidence`, including an evidence
role such as admission, occurrence time, rating, review, or removal. This lets a
later overlapping export or RSS observation support the same occurrence without
duplicating history or replacing its only provenance link. See the
[canonical ledger specification](../architecture/canonical-ledger.md).

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

### Queue boundary

Queue is explicit future intent and remains separate from Archive. Do not add a
Queue table to the initial ingestion schema merely to reserve its shape; design
it from concrete Queue behavior later. Source-owned Queue evidence such as
Watch Later, Want to Read, and saved episodes remains preserved in raw input.

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
- Normalize eligible archived articles (including PDFs, RSS items, and
  newsletter-style emails), videos, and podcasts and their trustworthy metadata. Preserve
  highlights, notes, tags, source progress, and timestamps for later source-owned
  detail/search support without adding universal progress events.
- Preserve EPUBs, tweets, personal notes, highlight-only documents, and other
  ineligible Reader categories as source evidence without projecting them into
  standalone Archive items.
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
- Completion date when known, plus explicit unknown/inferred precision
- Tags
- Filters and sorting

Detail page:

- Source metadata
- Source details and timestamps
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
- The UI accurately reflects Archive membership and date uncertainty.

Readwise is the first production connector, but official research and private
payload probes for other connectors may proceed in parallel. Do not productionize
multiple connectors against an unproven raw-object and Archive schema.

## 7. Phase 4: Hardcover

- Authenticate with the Hardcover API token.
- Import Read books, editions, ratings, reviews, and read dates. Preserve source
  progress only in raw/source-owned evidence.
- Preserve Hardcover work and edition identities separately.
- Treat Hardcover's Read status as sufficient Archive admission even when an
  imported book has no dated child read.
- Map finished rereads to separate Archive entries only when Hardcover exposes
  distinct child read rows. Preserve `read_count`, but do not invent dated or
  separate reread events when the import did not retain them.
- Poll `user_books.updated_at` with overlap and periodically run a full
  idempotent reconciliation because `user_book_reads` has no update timestamp.

Do not collapse:

- Book work versus edition
- Physical, ebook, and audiobook formats
- Read status versus a dated completion
- Multiple finished rereads

Acceptance gate: Hardcover history repeatedly reconciles without duplicates,
preserves the source's declared read count, and represents only the reread
events for which Hardcover supplies distinct evidence.

## 8. Phase 5: Letterboxd

### Historical import

Build a local CLI importer:

```text
pnpm media import letterboxd ./letterboxd-export.zip
```

Parse watched films, diary entries, ratings, reviews, likes, tags, and watchlist
entries. Preserve the original ZIP in R2. A watched-only film belongs in Archive
with an unknown consumption date; each Diary viewing is a distinct Archive
entry.

### Ongoing sync

- Poll the profile RSS feed.
- Import recent public diary entries and reviews.
- Record the RSS item identifier and payload.
- Reconcile overlapping entries because feeds may reorder or update.
- Periodically request another export to recover old edits, private records,
  watched-only films, and deletions that RSS cannot represent.

Letterboxd's published policy excludes personal/LLM projects from API access.
RSS will not provide a perfect account mirror, so the UI must show the date of
the last authoritative export separately from the last RSS poll.

Acceptance gate: export backfill and RSS updates merge into the same film
identities without duplicate Archive entries.

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

Preserve tracks, podcast episodes, playback timestamps, milliseconds played,
skip/end evidence, offline/private-session fields, and Spotify URIs. Any positive
podcast playback admits the episode to Archive; use the real export to reconcile
missing episodes, dates, and repeated-listen patterns.

### Song synchronization

- Poll recently played tracks every few minutes.
- Use `played_at` plus Spotify track ID as the initial idempotency basis, then
  validate collisions against real data.
- Preserve repeated listens as separate source plays.
- Avoid treating every short play as a completed listen without evidence.

### Podcast synchronization

- Reconcile saved episodes, saved shows, and resume-point observations as
  best-effort discovery.
- Treat any positive podcast playback as Archive membership. A saved episode
  with zero observed playback is a Queue candidate; unavailable or null playback
  evidence remains unresolved rather than being guessed into either state.
- Preserve `fully_played`, resume position, and individual playback segments as
  source evidence without requiring completion for Archive admission.
- Re-import Extended Streaming History periodically to close gaps because the
  recently-played endpoint explicitly excludes podcasts.

Acceptance gate: song playback is reliable; podcast status clearly communicates its confidence and limitations.

## 10. Phase 7: YouTube

### Historical import

Use manual Google Takeout archives for the first version. This does not require
a Google Cloud project, OAuth consent flow, billing, or restricted scopes.
Preserve each source archive independently in R2 and make overlapping reimports
idempotent without collapsing separate views of the same video.

### Watch-history normalization

Import only timestamped `Watched` activities with a usable video identity into
Archive. Preserve unidentified watched cards as source evidence but do not show
them as Archive items. Preserve video IDs or URLs, timestamps, channel
information, product, and the original activity card. Keep non-watch activity
out of Archive and do not inspect unrelated Takeout history such as searches
unless a future feature needs it.

Parse Watch Later separately as future Queue evidence. Queue and Archive are
independent, so a video may legitimately appear in both.

### Metadata enrichment

Use the ordinary YouTube Data API later to enrich known video IDs with current
title, channel, duration, description, thumbnail, publication date, and
availability state. Preserve original historical titles when supplied because
videos may later change or disappear. An API key is sufficient for public video
metadata; no OAuth is required for the initial import.

Automated watch-history sync remains an explicit limitation. Repeated manual
Takeout imports are the initial reconciliation path. Reconsider the Data
Portability API only if its verification and export cadence become practical for
this personal application.

Acceptance gate: one-time Takeout history import is replayable and idempotent;
later Takeout snapshots reconcile without losing distinct watch events; and the
UI clearly reports that continuous YouTube history sync is unavailable.

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

Keep Queue conceptually separate from Archive and preserve upstream intent
signals during ingestion without projecting them into canonical Queue rows yet.
When Queue implementation begins, design its states, local ownership, removal
history, priority, notes, and upstream-mirroring behavior together rather than
precommitting to placeholder columns now.

The current ingestion schema must not make Queue difficult to add: media items
and external identities are shared foundations, while source evidence remains
replayable. Upstream Queue synchronization remains outside ingestion v1.

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
- Archive projection and date precision
- Source-specific Archive admission rules

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

The initial private reconnaissance inputs are complete: Readwise and Hardcover
tokens, Spotify development-mode OAuth, Spotify Extended Streaming History, a
Letterboxd export and public RSS feed, and two Google Takeout archives have all
been probed through content-safe local tooling.

Request additional credentials or exports only for an implemented connector
step. No new Google credential is needed for initial YouTube ingestion; add a
Google Cloud API key only when public metadata enrichment is implemented. A
future export is needed to measure Spotify or YouTube cross-export
reconciliation behavior.

Secrets should be entered into local or Cloudflare secret storage, not pasted into chat or committed to Git.

## 17. Completion definition for ingestion v1

The ingestion milestone is complete when:

- Readwise and Hardcover histories are fully backfilled and continuously synchronized.
- Letterboxd history is backfilled and new RSS-visible activity is synchronized.
- Spotify lifetime history is imported, songs synchronize automatically, and podcast limitations are visible.
- YouTube watch history is imported from Takeout, later snapshots can be
  reconciled, and the lack of seamless incremental sync is visible.
- All connectors are idempotent and replayable.
- The application provides useful history browsing, filtering, and provenance.
- Connection health and failures are visible.
- Raw data and normalized data can be exported.
- No LLM or upstream service is required to access the owner's own history.

## 18. Immediate implementation sequence

The workspace, React/Hono scaffold, five source probes, and canonical ledger
specification are complete. The next three reviewable changes should be:

1. Implement D1 repositories plus the R2 raw-object/replay framework.
2. Build the fixture-backed Readwise vertical slice, including a local backfill
   and incremental reconciliation.
3. Reuse those proven boundaries for the other connectors, beginning with the
   already-validated historical export importers.

This sequence tests the data assumptions before migrations make them expensive
to change, while allowing independent source research and probe preparation to
proceed in parallel.
