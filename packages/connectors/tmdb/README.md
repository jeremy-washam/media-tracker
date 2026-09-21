# TMDB catalog connector

Status: credentialed live probe, typed client, production cache, conservative
matching, and durable refresh integration implemented.

TMDB is additive catalog metadata. Letterboxd remains authoritative for the
owner's movie history, Queue, ratings, likes, and reviews.

Add the application read token to the ignored repository-root `.env.local`:

```dotenv
TMDB_API_READ_TOKEN=replace-with-your-read-access-token
```

The local Worker loads repository-root `.env.local`. Production uses a Worker
secret with the same name.

After importing real Letterboxd data into the local D1 database, run the
aggregate-only probe from the repository root:

```sh
pnpm --filter @media-tracker/connector-tmdb probe
```

The probe sends one exact known TMDB identity and five owner title/year samples
to TMDB. It prints response shapes, field/count coverage, safe cache headers,
and candidate counts without printing titles, provider identifiers, or raw
payloads. Set `IMLADRIS_LOCAL_DB_PATH` only when the default Wrangler database
discovery does not select the intended local database.
