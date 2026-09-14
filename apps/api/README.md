# API

The Hono REST API and Cloudflare request, queue, and scheduled-event entry points. Platform bindings stay at this boundary.

`wrangler.jsonc` defines credential-free local D1, R2, Queue, Cron, and static asset
bindings. The placeholder resource IDs are suitable only for local development;
replace them with provisioned Cloudflare resources before deployment.

## Readwise MVP sync

Apply the local D1 migration, then copy `.dev.vars.example` to `.dev.vars` and
replace the placeholder with a Reader access token:

```sh
pnpm db:migrate:local
cp apps/api/.dev.vars.example apps/api/.dev.vars
pnpm dev
```

Use **Connections → Readwise Reader → Sync now**. The initial backfill retrieves the current Reader Archive; later polls retrieve
changed documents across all locations, stores each exact response page in private R2, and adds
eligible articles, PDFs, RSS items, videos, and podcasts to the local Archive.
Tweets and other ineligible rows are retained as source records but are not
shown as media.

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
Trigger. It reads the current Read shelf, stores each exact GraphQL response page
in private R2, and projects books into the Archive without manufacturing rereads
from aggregate counts. Repeating the sync reconciles the full Read shelf
idempotently.

## Spotify and YouTube

Spotify accepts Extended Streaming History ZIPs and polls saved episodes. Set
`SPOTIFY_CLIENT_ID`, `SPOTIFY_REFRESH_TOKEN`, and `TOKEN_ENCRYPTION_KEY` (base64
32-byte AES key). Apply migration 0002 before syncing. Rotated tokens are saved
encrypted before library acquisition; a short database lease serializes refreshes.
A new bootstrap refresh token replaces the previous stored authorization.

YouTube accepts manual Takeout ZIPs. Pass `connectionId` to import or continue
into an existing account, or `connectionKey` and `connectionLabel` to establish
a new account lineage. Omitted options use the legacy default account. The UI
always supplies an explicit account for continued imports. Overlapping snapshots
match by account, video, UTC timestamp, and within-snapshot multiplicity. Absence
from a later snapshot never removes a watch.

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
Resume import after reopening Connections. The queue consumer remains a scaffold.
