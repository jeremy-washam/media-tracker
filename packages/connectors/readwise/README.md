# Readwise connector

Status: official API and private read-only schema probes complete. The initial
manual Reader Archive import is implemented; incremental sync, webhooks, and
raw-source downloads remain deferred.

This package will own Reader document backfill, incremental reconciliation,
webhook validation, queue mirroring, and source-specific normalization. See the
[Readwise source reconnaissance](../../../docs/sources/readwise.md) for the
current capability assessment, field inventory, unknowns, and probe plan.

The MVP connector currently fetches paginated Archive documents and normalizes
only the approved media categories. The API Worker owns persistence and the
manual sync endpoint.

Copy `.env.example` to `.env.local`, add `READWISE_TOKEN`, then run from the
repository root:

```sh
pnpm --filter @media-tracker/connector-readwise probe
```

The probe validates auth and prints field/type summaries and aggregate
category/location counts. It does not print document content, titles, IDs, URLs,
or the token.
