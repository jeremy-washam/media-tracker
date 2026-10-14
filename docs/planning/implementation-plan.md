# Imladris Implementation Plan

Last updated: 2026-10-13

Sections 3–15 include the longer-term roadmap, not a checklist of shipped
features. Section 18 records the ingestion MVP and its September 14 follow-ups.
Section 20 records the subsequent interface decisions and next design work.
Section 21 tracks the shared Spotify catalog refresh follow-up.
The [Library implementation handoff](library-implementation.md) specifies the
next production UI delivery, including source-derived Queue and Songs.
The [Podcasts](podcasts-implementation.md) and
[Music](music-implementation.md) plans now record their initial production
implementations, the first 2026-09-21 hardening pass, and the remaining
explicit work. The
[Videos](videos-implementation.md) plan records the shipped Takeout-backed
Archive, Watch Later Queue, Channels, and UI plus the credential-gated Data API
and OAuth stages.
The [AI Chat proposal](ai-chat-plan.md) details a proposed multi-provider query
layer, model-access options, and delivery sequence; it is not shipped behavior.

## Current checkout status (2026-10-13)

The initial Library implementations for all six media types are present across
16 routed sections, with Connections as the seventeenth production route. The
root opens Books Archive. Source-derived Queue, Reader Feed, Podcast Following,
Music Tracks/Albums/Artists, and Video Channels are implemented; manual Queue
management, Chat, Recaps, Settings, and generalized replay/export/recovery remain
deferred. TMDB/YouTube catalog caches and shared Spotify exact-ID backfill are
implemented. The [UI foundation](../design/ui-foundation.md) owns the subsequent
list defaults, expanded Article rows, shadcn controls, branding, and motion.
The [Music implementation](music-implementation.md) supersedes earlier
30-second/excluded-observation proposals with immediate song counting.

Private Access checks, usage limiters, production packaging, deployment helpers,
and local snapshot/restore rehearsal are in the checkout. Empty hosted storage,
queues, and an owner-only Access application are provisioned. The paused Worker
is published against empty storage. Private data transfer and authenticated
hosted validation remain pending, along with the launch gates in the
[deployment runbook](deployment.md) and
[storage efficiency plan](storage-efficiency-plan.md). The
[documentation audit](documentation-audit.md) records the code/live-app comparison.
Historical milestone sections below retain their original delivery context;
their deferrals do not override this current status.

The owner has requested a separate native iOS experience, with Library first and
genuine native Apple controls. The [iOS plan and workflow](ios-app.md) captures
the October 13 research, future navigation, authentication/distribution questions,
and simulator/physical-phone testing. Development setup and a small installed
app/test proof are next; no native project or authentication change exists yet.
Disposable mobile studies do not establish an approved interface.

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
pnpm db:migrate:local
pnpm db:migrate:remote
pnpm build:production
pnpm deployment:snapshot
pnpm deploy
```

There is no root `db:generate` script. Migrations are ordered SQL files; local
and remote application use the scripts above. Follow the private deployment
runbook before running remote migration or deployment commands.

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
- Run hourly through deployed Cron Triggers; local cron execution is manual.

### Webhooks (deferred)

Eventually support document creation, finishing, archiving, moves to Later or Inbox, shortlisting, tag updates, and highlight creation.

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

Implementation status: initial Read-shelf polling is implemented and validated locally; broader deletion and recovery behavior remains deferred.
The full Read-shelf connector, raw-page retention, canonical projection, manual
sync, hourly scheduled sync, and media-type browsing filter are implemented. An
initial import and repeated reconciliation each returned 127 Read books and 127
supported occurrences without canonical duplicates; the combined scheduled
handler also completed successfully.

- Authenticate with the Hardcover API token.
- Import Read books, editions, ratings, reviews, and read dates. Preserve source
  progress only in raw/source-owned evidence.
- Preserve Hardcover work and edition identities separately.
- Treat Hardcover's Read status as sufficient Archive admission even when an
  imported book has no dated child read.
- Map finished rereads to separate Archive entries only when Hardcover exposes
  distinct child read rows. Preserve `read_count`, but do not invent dated or
  separate reread events when the import did not retain them.
- Perform a full Read-shelf reconciliation each hour because `user_book_reads`
  has no update timestamp. Incremental optimization remains future work.

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

The current importer uses Connections or the HTTP API. A future CLI may use:

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

- Use the local PKCE probe to obtain the initial grant; hosted OAuth onboarding remains deferred.
- Persist rotating refresh tokens encrypted with AES-GCM in D1.
- Refresh access tokens automatically.
- Reauthorization deadline tracking remains deferred; failed attempts appear in sync activity.
- Keep client secrets in Worker secrets.

### Historical backfill

The current importer accepts ZIPs through Connections or HTTP. A future CLI may use:

```text
pnpm media import spotify ./spotify-extended-history/
```

Preserve tracks, podcast episodes, playback timestamps, milliseconds played,
skip/end evidence, offline/private-session fields, and Spotify URIs. Any positive
podcast playback admits the episode to Archive; use the real export to reconcile
missing episodes, dates, and repeated-listen patterns.

### Song synchronization (deferred)

Song and audiobook records remain in the raw export. They do not enter Archive
and there is no recently-played song poller in the current MVP. Admission rules
must be approved before adding either projection.

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

Acceptance gate: podcast export and saved-episode observations reconcile to one
occurrence per episode, retaining the latest known playback timestamp. The UI
communicates saved-library discovery limits; songs and audiobooks are deferred.

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

The [storage efficiency plan](storage-efficiency-plan.md) adds the owner's
October 12 priority: $5/month is acceptable; reduce amplification and measure
usage rather than force Free. The isolated local implementation adds scoped D1
usage reporting, independent bounded maintenance, clock-safe YouTube publication
and compact evidence references. Remote validation and activation remain pending.
It recommends one paid D1 initially, copy-rehearsed
compact references/evidence layouts, cache maintenance while ingestion is paused,
and bounded job budgets. Further database splits and historical interpretation
archival require demonstrated benefits and explicit recovery boundaries. This
contains merged code and forward migrations. The local ledger was backed up and
migrated through 0029 on October 13; hosted migration remains pending and
retention policy is unchanged.

The [private deployment runbook](deployment.md) records the October 12
preparation: Worker-side owner authentication, an app-only production bundle,
guarded production configuration, paused cutover, and a local D1/R2 transfer and
restore rehearsal. Account activation, remote transfer, hosted verification,
and production sync cutover remain pending. The local database requires Workers
Paid at its current size. This preparation is not a deployed application.

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
- Spotify lifetime podcast history is imported, saved-episode playback state synchronizes automatically, and its discovery limitations are visible. Songs and audiobooks remain deferred.
- YouTube watch history is imported from Takeout, later snapshots can be
  reconciled, and the lack of seamless incremental sync is visible.
- All connectors are idempotent and replayable.
- The application provides useful history browsing, filtering, and provenance.
- Connection health and failures are visible.
- Raw data and normalized data can be exported.
- No LLM or upstream service is required to access the owner's own history.

## 18. Immediate implementation sequence

The workspace, React/Hono scaffold, canonical ledger, and all five initial
source connectors are implemented and validated locally against the owner data.
On deployment, Readwise and Hardcover poll hourly; Letterboxd combines its full export
with hourly RSS; Spotify combines its full podcast history export with hourly
saved-episode reconciliation; and YouTube accepts resumable Takeout imports for
separate account lineages. Large Spotify and YouTube imports are processed in
bounded, durable chunks rather than one oversized Worker invocation.

The ingestion follow-ups identified on September 14 were:

1. Improve media cards and detail views with the canonical metadata already in
   the ledger. Complete counts, server-side media-type filters, cursor pagination,
   account-specific connection status, coverage notes, incomplete-import resume
   controls, and persisted sync activity are implemented.
2. Add provenance inspection, richer metadata, and search to the browsing UI.
3. Add periodic export reminders and broader replay/export/recovery tooling.
   Generalized replay/export/recovery remain unimplemented. The CLI now has
   guarded deployment helpers and the queue processes Reader content plus
   TMDB/YouTube/Spotify catalog jobs; neither is a generalized recovery path.

The MVP retains exact raw pages and respects idempotency and cursor safety, but
defers generalized replay infrastructure, multipart upload orchestration, and
advanced recovery automation.

This sequence tests the data assumptions before migrations make them expensive
to change, while allowing independent source research and probe preparation to
proceed in parallel.

## 19. Correctness review fixes

The September 14 review added failed-Letterboxd retry support, bidirectional
RSS/export matching, stable RSS date edits, YouTube overlapping-snapshot
reconciliation, monotonic Spotify playback dates, encrypted refresh-token
rotation, removal of superseded Hardcover fallbacks, read-specific editions,
explicit rating/review clearing, and preservation of malformed successful API
responses before parsing. See ADR 0010 for the reconciliation policy and its
limits. These paths are covered with synthetic regression tests; no new private
provider probes were run for this change.

## 20. Next interface design and delivery

The owner selected **Index** after reviewing seven browser-based layout studies.
The initial product interface includes Chat, Library, and Recaps. Its scope is
broader than the first ingestion milestone; earlier deferrals of LLM/Queue UI
apply to that milestone, not a prohibition on this next interface.

The [desktop UI foundation](../design/ui-foundation.md) owns the shared shell.
The owner-approved
[Library Phase 2 surface specification](library-phase-2-surfaces.md) and its
linked per-media contracts now own Library fields, layouts, filters, sorts, and
inspector behavior. Production delivery should:

1. Refine Index with a collapsible global sidebar and a single compact inspector,
   preserving context when either opens or closes. Surface interiors may differ.
2. Use the saved `/library-review.html` artifact and local ignored real-data
   sample as the initial visual reference, then tune density against production
   data without silently changing the approved field contract.
3. Implement Library behavior in priority order: Books, Movies, Articles,
   Podcasts, Songs, YouTube videos. Preserve one item with multiple occurrences
   and the per-media occurrence semantics in the approved contracts. The
   [Movies implementation plan](movies-implementation.md) records the shipped
   Letterboxd vertical slice plus implemented TMDB enrichment and local backfill. The
   [Articles implementation plan](articles-implementation.md) records the
   shipped Readwise-backed Archive, Queue, Feed, annotation, and selective-text
   vertical slice. The coordinated remaining plans cover
   [Podcasts](podcasts-implementation.md),
   [Music](music-implementation.md), and
   [Videos](videos-implementation.md) in that implementation order.
4. Specify Chat history/artifact flows and interactive visualization behavior;
   consult the separate catalog reconnaissance for references outside Library.
5. Specify browsable monthly/yearly Recaps and their relationship to shared
   visualizations. A generic visualization builder is not a prerequisite.

Do not infer approval for global workspace tabs, a permanent two-pane Library,
or a Chat reference pane from the existence of a prototype. Optional borrowing
from the studies requires further design discussion. No production rollout or
new schema/provider choice is approved merely by selecting Index.

The `/design.html` studies and `/library-review.html` artifact are separate from
the operational client. The former uses synthetic illustrative data; the latter
loads a bounded owner-data sample from an ignored local file and has a safe
missing-fixture state. Neither artifact marks production services as shipped.
Lists, the future cross-media Feed, and Explorations remain outside the initial
interface; the Reader-specific Articles Feed is explicitly in scope.

## 21. Shared Spotify catalog follow-up

- [ ] Add scheduled, rate-aware refresh of exact-ID Spotify track, album, artist,
      episode, and show metadata and artwork. Replace stale display/search data,
      handle upstream unavailability, and remove superseded Spotify API content
      (including retained raw catalog snapshots) without deleting the owner's
      independent listening history or source identities. Set and document a
      finite cache lifecycle when implementing this; Spotify does not publish a
      numeric cache lifetime, but its Developer Terms require temporary caching
      and prohibit indefinite storage of Spotify Content. Refresh alone does
      not resolve the interim retention risk in ADR 0014.
