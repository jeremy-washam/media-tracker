# System Architecture

## Purpose

Imladris is a private, single-user ledger of media consumption. It imports
history from existing services, preserves the source evidence, and presents a
normalized view suitable for browsing and, later, evidence-backed LLM queries.

The first milestone is ingestion. Recommendations and manually managed Queue
remain deferred. Read-only source-derived Queue views are implemented in the
six-media Library. A separate SwiftUI iOS client is now planned, with development
setup next and no native implementation yet. The [native iOS plan](../planning/ios-app.md)
records backend reuse, authentication gates, and the build/test workflow.

## System shape

```text
External services and exports
  -> connector packages
  -> API, cron, or CLI ingestion entry point
  -> raw payload in private R2
  -> idempotent source projections and canonical normalization in D1
  -> rebuildable browse read models and search indexes in D1
  -> media-specific REST APIs
  -> React web client
```

Production deployment must put the web application and normal API traffic
behind Cloudflare Access. Worker-side token/owner checks and production asset
exclusion are implemented. A paused Worker and owner-only Access application are
provisioned; owner MFA/authenticated verification and private-data transfer remain
pending according to the October 13 deployment record. Missing
Access configuration denies hosted requests. Local development bypasses
authentication only for explicit loopback requests.
Hosted webhook/OAuth callback routes are deferred and will require their own
authentication when introduced.

The planned iOS client will consume the same HTTP API, including its OpenAPI 3.1
description. Its Swift networking/models are separate from TypeScript packages.
Native-compatible authentication still needs a documented and tested decision
under ADR 0005; Managed OAuth is a research candidate, not an implemented flow.

The [private deployment runbook](../planning/deployment.md) records paused
cutover configuration and a local D1/R2 snapshot/restore rehearsal. Contentless
FTS token positions are preserved. The utility does not upload data or provide
generalized replay/remote recovery.

The [storage efficiency plan](../planning/storage-efficiency-plan.md) retains one
paid D1 initially and evaluates compact references/evidence on private copies.
The local implementation makes YouTube publication clock-safe and separates
bounded maintenance from provider sync, including paused deployment. See
[ADR 0015](../decisions/0015-clock-safe-youtube-publication.md). Production
migration, remote usage measurement and controlled activation remain launch gates.

## Library requests

[Library fetching](library-fetching.md) owns the current item/summary API,
section naming, shared page size, cache/refresh lifecycle, and adaptive polling.
It supersedes the combined-response and 48-item request descriptions in the
historical per-media implementation plans.

## Package boundaries

- `apps/web`: React UI. It consumes API contracts and does not access storage.
- `apps/api`: Hono Worker, HTTP concerns, Cloudflare bindings, cron, and queues.
- `apps/cli`: explicit local backfills, imports, export, and recovery operations.
- `packages/domain`: canonical types and pure normalization rules. It must not
  import Cloudflare, database, HTTP, or UI libraries.
- `packages/db`: schema, migrations, and repositories. Cloudflare-specific
  adapters live at the edge of this package rather than in domain code.
- `packages/contracts`: Zod schemas shared by API producers and consumers.
- `packages/connectors/*`: one integration per source, including source-specific
  parsing, cursors, and identifier mapping.
- `packages/test-fixtures`: synthetic and sanitized payloads only.

## Connector contract

Connectors converge on this behavior even if a source cannot implement every
operation through an API:

```ts
interface Connector {
  validateConnection(): Promise<ConnectionStatus>
  backfill(input?: BackfillInput): AsyncIterable<RawRecord>
  reconcile(cursor?: SyncCursor): AsyncIterable<RawRecord>
  normalize(raw: RawRecord): NormalizationResult
}
```

A connector may use OAuth, API polling, webhooks, RSS, or a user-provided export.
Those differences must not leak into the canonical domain model.

## Ingestion invariants

1. Store the raw record before or atomically with registering it for parsing.
2. Do not advance a cursor until all records in the page are durably committed.
3. Give every queued operation and source record a stable idempotency key.
4. Keep parse failures and make them visible; never discard the source evidence.
5. Preserve source facts separately from generated or inferred data.
6. Represent upstream deletion or removal as state, not physical history loss.
7. Make replay from raw objects safe and deterministic for a parser version.

## Data ownership and portability

D1 is the operational database, R2 is the raw-object store, and neither defines
the domain API. The application owns its schema and forward-only migrations.
Repositories isolate SQL from business rules. The CLI will provide a documented
export of normalized records and raw-object metadata so the system can move to
Postgres and S3-compatible storage without rewriting connectors or clients.

The Videos read path follows the same ownership split: immutable Takeout records
and canonical Archive occurrences remain authoritative; generic Queue entries
carry Watch Later provenance; YouTube-owned channel/subscription observations
support exact rollups; and rebuildable video/channel projections plus FTS serve
bounded APIs. Complete snapshot markers, relationship upserts, and retirement
are ordered so a failed or missing component cannot clear prior current state.

See the accepted decisions in `docs/decisions` and the accompanying
[threat model](./threat-model.md) and
[development standards](./development-standards.md). The
[canonical ledger specification](./canonical-ledger.md) defines the logical
schema, identity rules, timestamp semantics, and source projections established
after payload reconnaissance.

## Current operational implementation

Source imports and resumable chunks run through HTTP; hourly polling runs in the
deployed scheduled handler. The queue consumer handles bounded Reader article-
content acquisition/indexing, TMDB and YouTube catalog refresh, and resumable
Spotify catalog backfill; generalized replay/recovery jobs remain deferred. Local cron
triggers are invoked manually. Generalized CLI replay,
export, and recovery remain deferred. Browser APIs provide keyset-paginated
History and sync runs, complete media counts, and all connection lineages.
Rotating Spotify tokens use an encrypted D1 credential store and refresh lease,
separate from raw source evidence. See ADR 0010 for reconciliation details.

Books is the first complete Library vertical slice. Hardcover owns source-shaped
work, edition, contributor, series, taxonomy, user-book, and read projections.
The canonical ledger continues to own cross-source identity and Archive
occurrences. `book_library_projection`, `book_identifiers`, and `book_search`
are rebuildable query models, not new sources of truth. Books Queue membership
is derived from active Hardcover statuses 1 and 2; it is not a generic editable
queue. Media-specific repositories keep these browse semantics out of route
handlers and the pure domain package.

All six Library families now have production routes, typed collection/detail/
History APIs, and rebuildable browse projections. Movies combines Letterboxd
personal state with a refreshable TMDB catalog. Podcasts combines Spotify and
eligible Reader history with saved-episode Queue and saved-show Following.
Music aggregates identified Spotify playback observations into Tracks, Albums,
and Artists without a minimum listening threshold. Videos combines immutable
Takeout watches and Watch Later with expiring public catalog metadata and
Channels rollups; there is no YouTube Following surface. The generic media API
remains available, but the legacy History screen is no longer routed. Chat,
Recaps, manual Library writes, and arbitrary catalog discovery remain deferred.

The browser query cache and bounded first-page persistence are documented in
the [web README](../../apps/web/README.md#library-loading-and-caching). They store
private Library metadata locally; D1/R2 remain authoritative.

Articles is the third complete Library vertical slice. Reader v3 documents own
current Article state; retained canonical Archive occurrences preserve history,
and generic Queue entries materialize current Inbox/Later/Shortlist membership
with source evidence. `readwise_documents`, annotation tables, and private R2
content objects retain source-specific facts. `article_library_projection`,
metadata FTS, and contentless full-text FTS are rebuildable query models. Reader
Feed is a separate current-state view and does not become Queue or the future
recommendation Feed. Exact content API responses are private raw evidence;
bounded chunk indexing promotes a manifest only after the final batch commits,
and failed or stale reservations remain recoverable.

## Library query and sync activity refinements

Music section counts use set membership rather than a correlated track scan per
album. Migration 0023 adds the album lookup and covering Music/YouTube observation
indexes; 0024 covers canonical Archive membership checks. Migration 0025 adds a
covering `(media_item_id, upstream_state, consumed_at_value)` index for per-media
Archive occurrence counts and date bounds. Without it, SQLite can choose the
0024 state/ID index for Movies counts and scan the entire active Archive once per
movie, blocking the local Worker and its background queue. The new index bounds
those lookups by media identity and state while retaining the Videos membership
index. The Videos occurrence
rollup explicitly selects its covering index so SQLite does not prefer the narrower
chronological index and fetch source rows for every aggregate. Filtering, exact
counts, distinct occurrences, unknown duration/date semantics, and keyset cursors
are unchanged. Apply these additive migrations before serving the updated API.

Video and Channel text filters compute FTS match membership once per statement,
rather than repeating a correlated FTS search for every Library row. Exact
video/channel IDs, canonical video URLs, and historical title matches remain
supported. Movie keyset pages apply the complete cursor predicate, including
null sort values, so loading subsequent Archive and Queue pages does not fail.
See the [live loading and performance verification](../planning/library-performance-acceptance.md)
for route coverage, measured timings, regression coverage, and validation results.

Connections presents durable Spotify catalog-backfill progress separately from
canonical import failures. Sync summaries include optional `catalogProgress` with
returned/unavailable counts, last activity, and the next scheduled attempt. An
unexpired lease means running; a future retry means waiting; otherwise an unfinished
job awaits a worker. This is a read-time observation, not a mutation to the recorded
run or a claim that the job failed. The durable run remains resumable. Collection
browsing and viewing Connections never start or resume provider requests.
