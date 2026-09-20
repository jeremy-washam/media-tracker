# Hardcover connector

Status: production full-library sync implemented and verified with the real API.

This package owns book-history backfill, scheduled full reconciliation, edition
and reread identity, and source-specific parsing. See the
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

The current production query fetches Want to Read, Currently Reading, and Read
relationships. A 2026-09-20 verification returned 1,114 relationships: 986
Queue books and 128 Archive books, with 1,556 projected editions. Counts can
change with the account and are not committed as fixtures.

The API Worker retains every exact GraphQL library and edition response,
projects one work-level media item per Hardcover book, keeps work, edition,
ISBN, and ASIN identities distinct, and creates separate Archive occurrences
only for finished child read rows. A Read book without such a row receives one
undated fallback occurrence. Queue is derived from active status 1 or 2 and is
independent from Archive. Full reconciliation retires missing source rows only
after a complete snapshot and advances the cursor only after projections and
the Books read model are durable.

The connector pages with a conservative size of 50, fetches exact consumed
editions missing from the embedded relationship payload, and retries bounded
rate-limit/server failures while honoring `Retry-After`. The observed API can
encode `finished_at_precision` as a number or string; both remain accepted and
preserved in raw evidence.

Parser v3 registers each finished read's edition ID independently, even when it
differs from the user-book's current edition. A newly supplied finished read
retires the undated fallback from the active projection while retaining its
original admission and linking the superseding observation. Full snapshots can
clear ratings and reviews explicitly. Raw response bytes are stored before
JSON/schema validation, including malformed pages.
