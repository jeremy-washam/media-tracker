# API

The Hono REST API and Cloudflare request, queue, and scheduled-event entry points. Platform bindings stay at this boundary.

`wrangler.jsonc` defines credential-free local D1, R2, Queue, Cron, and static asset
bindings. The placeholder resource IDs are suitable only for local development;
hosted resource IDs belong in the separate production configuration.

Production uses a separate ignored `wrangler.production.jsonc` and the app-only
`apps/web/dist-production` bundle. All requests pass through Access JWT/owner
verification; only explicit local loopback requests can bypass authentication.
The initial transfer and owner Access/MFA checks are complete. Normal hosted
operation uses bounded source admission, recurring catalog/content work and a
persistent emergency pause. The[deployment closeout](../../docs/planning/deployment-closeout.md)
records live activation separately from incomplete provider acceptance; the
[deployment runbook](../../docs/planning/deployment.md) retains cutover evidence.
The dedicated CI service identity can only GET health and six queryless summary
endpoints. All other routes require the owner. See[hosted import limits](../../docs/planning/hosted-imports.md)
before uploading archives.

## Readwise MVP sync

Apply the local D1 migration, then copy `.dev.vars.example` to `.dev.vars` and
replace the placeholder with a Reader access token:

```sh
pnpm db:migrate:local
cp apps/api/.dev.vars.example apps/api/.dev.vars
pnpm dev
```

Use **Connections → Readwise Reader → Sync now**. The initial backfill retrieves
all current Reader locations; later polls use an overlapped update watermark,
with a complete reconciliation due when the prior full scan is 24 hours old.
Each exact v3 page and v2 highlight-export
page is stored in private R2 before projection. Eligible articles, PDFs, RSS
items, and newsletters project into Articles Archive, Queue, or Feed according
to current and retained source state. Eligible videos and podcasts continue to
project into their media types. Tweets and other ineligible rows remain source
evidence only.

Articles are available from `/api/library/articles`, with detail, History, and
highlight subroutes under `/api/library/articles/{id}`. Full-text acquisition is
handled by durable `acquire_article_content` queue messages and is restricted to
Archive/Queue documents; metadata sync and browsing remain useful when content
is unavailable. Exact content responses are retained before parsing, indexing
is staged in bounded queue invocations, and failed or stale jobs are recoverable
without exposing a partially indexed manifest. Indexing resumes manifests marked failed
by an earlier queue delivery, verifies that every expected chunk and search row
exists before publication, and does not promote stale source versions.

## Letterboxd export import

With the local app running, open **Connections → Letterboxd → Import ZIP** and
select the account-export ZIP exactly as downloaded from Letterboxd. The Worker
stores the ZIP in private R2 and projects watched films and distinct Diary
viewings into Archive. Reimporting a successfully processed ZIP under the same parser is a no-op;
failed imports retry from preserved raw evidence.

Set `LETTERBOXD_USERNAME` in `.dev.vars` to enable the public RSS connection.
Use **Sync now** on the Letterboxd connection for a manual poll. The hourly Cron
Trigger checks eligibility for the shared hosted daily allocation. Admitted
polls preserve every exact RSS response,
and reconcile recent entries to the export using provider identities or exact
title/year and viewing-date matches. Feed entries that cannot be reconciled are
retained as unresolved; disappearance from the finite feed never deletes local
history.

## Hardcover sync

Set `HARDCOVER_TOKEN` in `.dev.vars`, then use **Connections → Hardcover → Sync
now** for the initial import. The hourly Cron Trigger checks eligibility for a
hosted daily snapshot. Each hosted invocation commits at most one 50-book page;
continuations retain the snapshot identity and committed checkpoint. It
reconciles Want to Read, Currently Reading, and Read relationships,
stores each exact library and edition GraphQL response in private R2, and
projects work-level Books with distinct edition identities. Finished child read
rows create Archive occurrences; Read-status books without one receive an
undated fallback. Active statuses 1 and 2 independently determine Books Queue.
Aggregate read counts never manufacture rereads. Missing source relationships
retire only after a complete snapshot; retained Archive history stays available.

Manual and scheduled hosted source syncs share one new allocation per source per
UTC day and a 23-hour minimum interval. Hardcover continuations and finite
recovery attempts retain that allocation; local explicit syncs do not use the
hosted admission policy. Migrations through 0034 are deployed. Hardcover's
controlled hosted snapshot completed across 23 pages and 1,112 books without
failed records. Spotify HTTP 403 still requires provider-specific live acceptance;
configured recurring work alone does not establish success.

## Spotify and YouTube

Spotify accepts Extended Streaming History ZIPs and polls saved episodes. Set
`SPOTIFY_CLIENT_ID`, `SPOTIFY_REFRESH_TOKEN`, and `TOKEN_ENCRYPTION_KEY` (base64
32-byte AES key). Apply migration 0002 before syncing. Rotated tokens are saved
encrypted before library acquisition; a short database lease serializes refreshes.
A new bootstrap refresh token replaces the previous stored authorization.

The current Spotify path imports both podcast segments and identified song
rows, and also polls saved shows, current-player episode progress, and Recently
Played tracks. Optional reads preserve prior state when they fail and report
partial coverage. Music counts every identified, non-conflicting song row,
including zero-duration/skipped rows; API-only track events have unknown observed
time. Audiobooks remain outside the Library. The saved-episode probe's two-scope
grant alone does not cover player/recent-track reads; see the Spotify source
report for the separate read scopes.

For exact-ID track and episode metadata, `POST /api/catalogs/spotify/sync`
starts or resumes a bounded background backfill. `GET
/api/catalogs/spotify/jobs/{jobId}` reports counts, remaining backlog, and
retry state. It preserves API response bytes in private R2 before projection;
Spotify metadata does not create listening evidence. The private deployment
currently retains catalog responses indefinitely at the owner's request, with
the Spotify terms risk recorded in ADR 0014.

YouTube accepts manual Takeout ZIPs. Pass `connectionId` to import or continue
into an existing account, or `connectionKey` and `connectionLabel` to establish
a new account lineage. Omitted options use the legacy default account. The UI
always supplies an explicit account for continued imports. Overlapping snapshots
match by account, video, UTC timestamp, and within-snapshot multiplicity. Absence
from a later snapshot never removes a watch.

Set `TMDB_API_READ_TOKEN` and `YOUTUBE_API_KEY` in ignored repository-root
`.env.local` to enable
the refreshable movie and video catalog caches. Manual refreshes are available
at `POST /api/catalogs/tmdb/sync` and
`POST /api/catalogs/youtube/sync`. Browse requests never call either provider.
Set `CATALOG_AUTO_REFRESH=true` for recurring bounded TMDB/YouTube work and
`SPOTIFY_CATALOG_ENABLED=true` for exact-ID Spotify metadata refresh. The hourly
scheduler resumes durable cursors and creates at most one terminal catalog job
per provider/day when candidates are due. Provider cooldowns persist across
queue retries. `ARTICLE_CONTENT_ENABLED=true` enables bounded article acquisition
and indexing; maintenance has a separate explicitly enabled 5-minute schedule.
All hosted background work requires the operating monitor and shares its pause
gate. Exact-job TMDB grants and expiring source grants are retired. See
[catalog operations](../../docs/planning/catalog-operations.md) and
[source sync](../../docs/planning/source-sync-rollout.md) for finite limits.

`OPERATING_MONITOR_ENABLED=true` runs the independent 10-minute native-usage
monitor. Its account-scoped `OPERATING_API_TOKEN` needs Analytics Read, D1 Read,
and Queues Edit; `CLOUDFLARE_ACCOUNT_ID` and `SYNC_QUEUE_ID` must match the target.
Owner-only `GET /api/operations` exposes safe monitor state without D1. A sticky
pause or stale/missing state stops database/API work and scheduling; authenticated
health remains available for diagnosis. The native queue is paused without
purging. See[ADR 0021](../../docs/decisions/0021-bounded-production-operations.md).

## Browsing and operations

- `GET /api/media?limit=100&type=book&cursor=...` returns at most 100 items,
  a continuation cursor, complete counts by type, and total/filtered counts.
  Consumption dates sort descending; unknown dates sort last. Pagination is a
  live view, so refresh from the first page after importing or syncing.
- `GET /api/connections` returns every account, plus placeholders for unconfigured
  sources, coverage, last attempt/success/export timestamps, and incomplete imports.
- `GET /api/sync-runs?limit=20&cursor=...` returns real persisted attempts with
  counts and redacted failures. Each successful import chunk is a separate run;
  the connection's incomplete-import list records overall progress until completion.
- Spotify/YouTube `POST /api/connections/{source}/import/{importId}/continue`
  resumes a stored import; include the YouTube `connectionId` on every request.

Imports are HTTP-driven and stop when the browser stops requesting chunks. Use
Resume import after reopening Connections. The queue consumer handles selective
Reader content acquisition/indexing, TMDB and YouTube catalog refresh, and
resumable Spotify catalog backfill. Generalized replay/export/recovery jobs
remain deferred.

## Database usage and cache maintenance

Requests and jobs report aggregate D1 rows read/written when native result
metadata is available. `unmeasuredStatements` identifies missing coverage,
including native `first()` calls; elapsed time is wall time rather than CPU.
Observers are per request/job and never mutate shared Worker bindings. Reports
omit SQL, parameters, private titles and payloads and use route templates.

After applying migration 0026, YouTube source projections and published provider
overlays remain separate. Every browse/detail/search request checks one current
clock, so expired fields fall back to retained owner evidence even when sync and
cleanup are paused. Refresh staging remains invisible until successful job
publication.

Set `MAINTENANCE_ENABLED=true` and attach only `*/5 * * * *` to enable bounded
local cache deletion. This invocation makes no provider calls, including when
`SYNC_ENABLED=true`. It removes at most 1,000 logical cache/bookkeeping rows per
run, with additional FTS/index/state writes. Cleanup starts two days before
expiry to leave headroom and can reduce enrichment early. Both maintenance and
provider work default off in the production template. Follow the deployment
runbook's import, freshness, backlog and usage gates before activation.

Scheduled provider work reports separate aggregate usage scopes for each history
sync and catalog job. Each operation receives cloned bindings; reports run in
`finally`, including failed operations. Queue messages and HTTP requests retain
their independent scopes. Available D1 metadata remains partial because native
`first()` does not return it.

## Library reads

All collection routes use `section` and the shared 50-item default. Collection
responses contain `data` and `nextCursor`; the sibling `/summary` endpoint
contains counts, facets, and source status and accepts only search/filter state.
See [Library fetching](../../docs/architecture/library-fetching.md) for the
current contracts, which supersede older combined-response descriptions.

## Ingestion reliability and tests

Spotify preserves successful optional API response bytes before JSON/schema
validation, including saved shows, current player, recent tracks, and opportunistic
track metadata. Player observations reuse existing canonical identities and
Archive occurrence IDs. A completed saved-episode scan can commit its watermark
while optional operations fail; its durable run is `partially_succeeded`, records
the failed operations and committed record counts, and leaves the connection
`degraded` until a complete subsequent sync succeeds. Optional checkpoint failures
are included in the durable result.

Catalog consumers fence publication and progress with the attempt token acquired
from the durable job lease. A stale attempt cannot publish or mutate a replacement
attempt. Spotify catalog terminal state and its sync-run summary commit together
in the same fenced transaction; a failed transaction leaves both retryable.
Transient provider transport, database, and continuation enqueue failures
retain retryable work; explicit permanent provider errors and invalid provider
schemas terminate the job. Continuation retries follow the persisted cursor rather
than recounting an already committed batch. Provider Retry-After delays and active
lease delays survive the Worker queue dispatch boundary. A failed scheduled
catalog dispatch does not suppress the remaining scheduled providers.

The API suites use synthetic provider responses and isolated SQLite databases
with the complete ordered migrations. They exercise nonempty HTTP collections,
details and history for all six media families; queue acknowledgment/retry and
catalog continuations; raw preservation and credential rotation; and staged
Readwise acquisition/indexing with chunk, database, object-storage, and queue
failures. Tests never require provider credentials or application data. Run a
focused API suite from the repository root with:

```sh
pnpm exec vitest run apps/api/src --maxWorkers=1
```
