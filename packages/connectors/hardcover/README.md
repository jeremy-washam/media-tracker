# Hardcover connector

Status: full-library ingestion has been verified with the real API. The October
hosted reconciliation was interrupted. The resumable Worker implementation below
is deployed with migrations through 0034, and its October 29 controlled hosted
snapshot completed 23 pages and 1,112 books without failed records.

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

## Resumable hosted reconciliation (2026-10-29)

Research: Hardcover's [API guide](https://docs.hardcover.app/api/getting-started/)
documents backend-only tokens, HTTP 401/403/429 behavior, 60 requests/minute, and
30-second query timeouts. Cloudflare's [Worker limits](https://developers.cloudflare.com/workers/platform/limits/)
apply per invocation. An entire personal library should not depend on one Worker
surviving thousands of individual normalization writes.

`syncHardcover(bindings, {maxPages: 1})` commits at most one 50-book library page
per invocation and returns the normal totals plus `continuation: true` when more
pages remain. Its default retains the full scan for explicit local calls. The
queue/scheduler must continue hosted snapshots and apply its shared lease and
finite retry policy; reading a Library never resumes a provider job.

The hosted scheduler checks eligibility hourly. A new snapshot shares one
allocation per source per UTC day and at least 23 hours between allocations;
manual hosted actions use the same admission. Checkpoint continuations retain
that allocation and snapshot rather than starting a new full daily scan.

Migration **0032** adds `hardcover_sync_progress`, separate from completed sync
cursors. It stores the same snapshot/run ID, parser version, next keyset ID,
committed-page totals, observed edition IDs, and scan/completion markers. Only
same-connection Hardcover runs may own this progress. Page progress advances
after canonical records and typed projections are durable. Raw acquisition keys
include an attempt ID so crash recovery retains both responses; canonical books,
editions, and Archive identities remain idempotent. Durable run-evidence counts
are recounted after retry rather than trusting pre-crash in-memory totals.

Missing rows are retired and Books browse models rebuilt only after the final
page. The ordinary `library-books` cursor remains a completed-snapshot watermark;
its database trigger still rejects running jobs. A failure after the last page
can retry finalization without fetching all pages again. If the convenience
progress completion marker fails after the completed cursor commits, the cursor
wins and the next daily snapshot starts a new run. A scheduler detects resumable
work by comparing progress run ID with that completed cursor, not by the marker
alone. A lost continuation enqueue is recoverable from this durable progress.

Malformed/non-advancing pages stop the scan. HTTP failures retain safe status and
retry timing; arbitrary GraphQL messages remain private raw evidence, never log
or activity text. A fresh complete snapshot can observe changes missed by an
interrupted keyset scan. This API is mutable current state, not a transactional
provider snapshot or a complete historical change feed.

The October run stopped after 900 books; retained evidence does not establish the
platform cause. The protected failed response was inspected only for aggregate
shape. No private database copy, production write, source activation, or token
change was made during implementation. Migrations through 0034 are now deployed;
the October 29 controlled hosted run subsequently completed all 23 pages and
1,112 books without failed records. Its completed cursor was recorded at
`2026-10-29T23:04:25.695Z`. This verifies a complete hosted continuation chain;
continued scheduled operation remains subject to the shared daily admission and
operating monitor.
