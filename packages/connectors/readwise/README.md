# Readwise connector

Status: official API and private read-only schema probes complete. The initial
Reader Archive import and incremental polling are implemented; webhooks and
raw-source downloads remain deferred.

This package will own Reader document backfill, incremental reconciliation,
webhook validation, queue mirroring, and source-specific normalization. See the
[Readwise source reconnaissance](../../../docs/sources/readwise.md) for the
current capability assessment, field inventory, unknowns, and probe plan.

The first run fetches paginated Archive documents. Later runs request documents
updated since the last durable watermark, with a five-minute overlap, across all
locations so Archive additions and removals are both observed. Only the approved
media categories are normalized. Exact response pages are retained before
normalization, and the API Worker advances the watermark only after every page
has been committed. Manual and scheduled entry points share this behavior.

Copy `.env.example` to `.env.local`, add `READWISE_TOKEN`, then run from the
repository root:

```sh
pnpm --filter @media-tracker/connector-readwise probe
```

The probe validates auth and prints field/type summaries and aggregate
category/location counts. It does not print document content, titles, IDs, URLs,
or the token.
