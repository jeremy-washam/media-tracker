# Readwise connector

Status: all-location Reader document sync, v2 highlight sync, and Article
normalization are implemented. Webhooks and raw-source downloads remain
deferred.

This package owns Reader document backfill, incremental reconciliation, v2
highlight parsing, and source-specific normalization. See the
[Readwise source reconnaissance](../../../docs/sources/readwise.md) for the
current capability assessment, field inventory, unknowns, and probe plan.

The first run fetches every current Reader document at 100 records per page.
Later runs request documents updated since the last durable watermark, with a
five-minute overlap; a complete snapshot is repeated at least every 24 hours.
Only approved media categories become Library items. Exact response pages are
retained before normalization, and the API Worker advances the watermark only
after every page and projection has committed. Manual and scheduled entry
points share this behavior.

The same reconciliation imports deletion-aware v2 highlight containers. The
API package separately acquires parsed HTML for eligible Archive/Queue documents
through durable, throttled jobs; it does not use temporary raw-source URLs. It
stores each exact authenticated response before parsing, honors bounded
`Retry-After` retries, recovers failed or stale reservations, and promotes a
content manifest only after its bounded chunk batches are indexed.

Copy `.env.example` to `.env.local`, add `READWISE_TOKEN`, then run from the
repository root:

```sh
pnpm --filter @media-tracker/connector-readwise probe
```

The probe validates auth and prints field/type summaries and aggregate
category/location counts. It does not print document content, titles, IDs, URLs,
or the token.
