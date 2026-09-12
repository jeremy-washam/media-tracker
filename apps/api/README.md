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

Use **Connections → Readwise Reader → Sync now**. The Worker retrieves only the
current Reader Archive, stores each exact response page in private R2, and adds
eligible articles, PDFs, RSS items, videos, and podcasts to the local Archive.
Tweets and other ineligible rows are retained as source records but are not
shown as media.

## Letterboxd export import

With the local app running, open **Connections → Letterboxd → Import ZIP** and
select the account-export ZIP exactly as downloaded from Letterboxd. The Worker
stores the ZIP in private R2 and projects watched films and distinct Diary
viewings into Archive. Reimporting the exact same ZIP is a no-op.
