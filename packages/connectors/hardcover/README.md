# Hardcover connector

Status: official reconnaissance and full private-library probe complete after
Goodreads and StoryGraph import.

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

The complete private scan returned 1,115 books: 988 Want to Read, 2 Currently
Reading, and 125 Read. It observed 110 ratings, 5 reviews, 120 declared read
occurrences, and 112 finished child read rows. Thirteen Read-status books have no
finished child row, and four `read_count = 2` books do not expose multiple child
rows. Status is therefore the reliable Archive admission signal; child read rows
and `read_count` are optional source evidence rather than a complete occurrence
ledger.
