# Hardcover connector

Status: official reconnaissance and full private-library probe complete after
Goodreads and StoryGraph import.

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

The complete private scan returned 1,115 books: 988 Want to Read, 2 Currently
Reading, and 125 Read. It observed 110 ratings, 5 reviews, 120 declared read
occurrences, and 112 finished child read rows. Thirteen Read-status books have no
finished child row, and four `read_count = 2` books do not expose multiple child
rows. Status is therefore the reliable Archive admission signal; child read rows
and `read_count` are optional source evidence rather than a complete occurrence
ledger.

The production connector fetches only Read-status user books in stable ID order.
The API Worker retains every exact GraphQL page, projects one work-level media
item per Hardcover book, keeps work, edition, ISBN, and ASIN identities distinct,
and creates separate Archive occurrences only for finished child read rows. A
Read book without such a row receives one undated fallback occurrence. Manual
and hourly scheduled syncs currently perform a complete idempotent reconciliation
because this small private library fits comfortably within Hardcover's published
rate limit and nested read rows do not expose a reliable change timestamp.

The 2026-09-12 live validation imported 127 Read books in two pages. Repeating
the reconciliation retained exactly 127 work-level book items and 127 supported
Archive occurrences. The observed API can encode `finished_at_precision` as a
number or string; both remain accepted and preserved in the raw page.

Parser v2 registers each finished read's edition ID independently, even when it
differs from the user-book's current edition. A newly supplied finished read
retires the undated fallback from the active projection while retaining its
original admission and linking the superseding observation. Full snapshots can
clear ratings and reviews explicitly. Raw response bytes are stored before
JSON/schema validation, including malformed pages.
