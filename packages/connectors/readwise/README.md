# Readwise connector

Status: official API and private read-only schema probes complete. Webhook and
raw-source behavior remain unverified.

This package will own Reader document backfill, incremental reconciliation,
webhook validation, queue mirroring, and source-specific normalization. See the
[Readwise source reconnaissance](../../../docs/sources/readwise.md) for the
current capability assessment, field inventory, unknowns, and probe plan.

Copy `.env.example` to `.env.local`, add `READWISE_TOKEN`, then run from the
repository root:

```sh
pnpm --filter @media-tracker/connector-readwise probe
```

The probe validates auth and prints field/type summaries and aggregate
category/location counts. It does not print document content, titles, IDs, URLs,
or the token.
