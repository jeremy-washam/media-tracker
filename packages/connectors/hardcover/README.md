# Hardcover connector

Status: official reconnaissance plus authentication/current-reading probes
complete. Goodreads and StoryGraph historical imports are pending, so Read,
reread, rating, and review shapes remain to be verified.

This package will own book-history backfill, scheduled reconciliation, edition
and reread identity, and source-specific normalization. See the
[Hardcover source reconnaissance](../../../docs/sources/hardcover.md) for the
current capability assessment, field inventory, limitations, and probe plan.

Copy `.env.example` to `.env.local`, add `HARDCOVER_TOKEN`, then run from the
repository root:

```sh
pnpm --filter @media-tracker/connector-hardcover probe
```

The probe validates auth and prints only field/type summaries plus status and
read-through aggregates. It does not print book titles, notes, reviews, IDs, or
the token.
