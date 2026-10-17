# API

The Hono REST API and Cloudflare request, queue, and scheduled-event entry points. Platform bindings stay at this boundary.

`wrangler.jsonc` defines credential-free local D1, R2, Queue, Cron, and static asset
bindings. The placeholder resource IDs are suitable only for local development;
hosted resource IDs belong in the separate production configuration.

Production uses a separate ignored `wrangler.production.jsonc` and the app-only
`apps/web/dist-production` bundle. All requests pass through Access JWT/owner
verification; only explicit local loopback requests can bypass authentication.
The first deployment has sync, imports, cron, and queue processing paused until
data transfer is verified. Follow the [deployment runbook](../../docs/planning/deployment.md)
for target generation, account activation, backups, secrets, and cutover.

## Readwise MVP sync

Apply the local D1 migration, then copy `.dev.vars.example` to `.dev.vars` and
replace the placeholder with a Reader access token:

```sh
pnpm db:migrate:local
cp apps/api/.dev.vars.example apps/api/.dev.vars
pnpm dev
```

Use **Connections → Readwise Reader → Sync now**. The initial backfill retrieves
all current Reader locations; later polls use an overlapped update watermark and
a daily complete reconciliation. Each exact v3 page and v2 highlight-export
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
without exposing a partially indexed manifest.

## Letterboxd export import

With the local app running, open **Connections → Letterboxd → Import ZIP** and
select the account-export ZIP exactly as downloaded from Letterboxd. The Worker
stores the ZIP in private R2 and projects watched films and distinct Diary
viewings into Archive. Reimporting a successfully processed ZIP under the same parser is a no-op;
failed imports retry from preserved raw evidence.

Set `LETTERBOXD_USERNAME` in `.dev.vars` to enable the public RSS connection.
Use **Sync now** on the Letterboxd connection for a manual poll. The Worker also
polls once per hour through its Cron Trigger, preserves every exact RSS response,
and reconciles recent entries to the export using provider identities or exact
title/year and viewing-date matches. Feed entries that cannot be reconciled are
retained as unresolved; disappearance from the finite feed never deletes local
history.

## Hardcover sync

Set `HARDCOVER_TOKEN` in `.dev.vars`, then use **Connections → Hardcover → Sync
now** for the initial import. The same sync runs hourly through the Worker Cron
Trigger. It reconciles Want to Read, Currently Reading, and Read relationships,
stores each exact library and edition GraphQL response in private R2, and
projects work-level Books with distinct edition identities. Finished child read
rows create Archive occurrences; Read-status books without one receive an
undated fallback. Active statuses 1 and 2 independently determine Books Queue.
Aggregate read counts never manufacture rereads. Missing source relationships
retire only after a complete snapshot; retained Archive history stays available.

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
Set `CATALOG_AUTO_REFRESH=true` only after approving full-Library provider
disclosure and automatic refresh; it defaults off.

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
