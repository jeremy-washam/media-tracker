# Hardcover source reconnaissance

- Status: Full Books Library ingestion and projection implemented
- Priority: Production Books Archive and source-derived Queue
- Last verified: 2026-09-20
- Upstream status: The official GraphQL API is explicitly beta and may change

## Implemented MVP behavior

The production path is implemented in the Hardcover connector and API Worker.
Manual and hourly scheduled syncs fetch Want to Read, Currently Reading, and
Read relationships in stable user-book ID order. A full reconciliation is used
for every poll because nested read-through rows do not expose a reliable update
cursor. Requests retry bounded `429` and `5xx` responses and honor
`Retry-After`.

Each exact library and edition-enrichment response is stored content-addressed
in R2 before its records are projected. Hardcover work, edition, contributor,
series, taxonomy, relationship, read, ISBN-10, ISBN-13, and ASIN facts remain
source-shaped and traceable while the visible item stays work-level. Finished
child read rows create dated occurrences; Read-status books without one receive
a single undated fallback occurrence. `read_count` never generates synthetic
rereads.

A later complete snapshot may mark a missing Hardcover relationship and its
source-shaped metadata as removed. That retirement clears Queue membership but
does not retire canonical Archive occurrences: archived books remain browsable,
searchable, inspectable, and retain History using the last observed source
projection. Format facets and display use the verified coarse mapping
`reading_format_id` 1 = Physical, 2 = Audiobook, and 4 = Ebook (with the
corresponding `reading_format` names as fallback); raw `edition_format` labels
remain preserved but do not classify items.

Live end-to-end validation on 2026-09-20 returned 1,114 relationships across 23
pages: 986 active Queue books (Want to Read plus Currently Reading), 128 Archive
books, 128 supported Archive occurrences, and 1,556 distinct projected
editions. The Books collection, detail, and History APIs were then exercised
against that local snapshot. These counts are a point-in-time sanity check, not
a fixture or durable product expectation.

## Recommendation

Use Hardcover's authenticated GraphQL API for both the initial library snapshot
and scheduled reconciliation. Treat a `user_books` row with status `Read` as an
Archive item, and use `user_book_reads` to preserve dated rereads when those rows
exist. Do not make progress or reading-journal events part of the initial
canonical model: this application treats Archive as completed.

The integration is viable for this private, backend-only application. Hardcover
documents a personal API token, read and write access to the owner's account,
filterable GraphQL queries, a 60-request-per-minute limit, and custom mutations
for user books and read-throughs. The main reliability gap is incremental sync:
`user_books.updated_at` is useful, but `user_book_reads` has no creation or update
timestamp in the current official schema. The connector should therefore combine
incremental `user_books` polling with periodic full, idempotent reconciliation of
the owner's library and read-through rows.

## Official sources

- [Getting Started with the API](https://docs.hardcover.app/api/getting-started/)
- [User Books schema](https://docs.hardcover.app/api/graphql/schemas/userbooks/)
- [Books schema](https://docs.hardcover.app/api/graphql/schemas/books/)
- [Editions schema](https://docs.hardcover.app/api/graphql/schemas/editions/)
- [Reading Journals schema](https://docs.hardcover.app/api/graphql/schemas/readingjournals/)
- [Getting Books in Your Library](https://docs.hardcover.app/api/guides/gettingallbooksinlibrary/)
- [Getting Books With a Status](https://docs.hardcover.app/api/guides/gettingbookswithstatus/)
- [Official documentation repository and current GraphQL schema](https://github.com/hardcoverapp/hardcover-docs)
- [Authenticated GraphQL endpoint](https://api.hardcover.app/v1/graphql)

The generated reference and its checked-in schema are not perfectly aligned. For
example, one official example requests `review_html`, while that field is absent
from the current checked-in `user_books` type. Every proposed field must be
validated against a small authenticated response before connector contracts are
frozen.

## Authentication and setup

1. Sign in to Hardcover and open the [Hardcover API account page](https://hardcover.app/account/api).
2. Copy the personal token into a backend-only secret. Never expose it to the
   Vite client, logs, fixtures, or Git.
3. POST GraphQL requests to `https://api.hardcover.app/v1/graphql` with JSON
   content and an `Authorization` header. The account page supplies the token
   value; the API's GraphiQL landing page describes it as a Bearer token.
4. Validate the connection with the documented `me { id username }` query.
5. Send a descriptive `User-Agent`, as Hardcover recommends.

This is a good fit for the Hono backend and CLI. The official documentation says
the API is for offline/backend use, is not allowed directly from browsers, and
does not yet offer OAuth for external applications. Tokens have broad account
authority, can access private account data, expire after one year, and reset on
January 1. The connection UI must make token renewal observable without ever
displaying the token.

## Service constraints

- API status: beta and heavily in flux.
- Rate limit: 60 requests per minute.
- Query timeout: 30 seconds.
- Maximum query depth: 3.
- Access is restricted to the owner's data, public data, and data from followed
  users.
- Several pattern operators, including `_like`, `_ilike`, and regex variants,
  are disabled.
- Documented responses include `401` for invalid/expired tokens, `403` for
  disallowed data or queries, and `429` for throttling.

The connector should use conservative page sizes, cap concurrency, honor `429`
with retry/backoff, split deep metadata queries into separate requests, and
classify annual token expiration as an actionable connection failure.

## Relevant source model

### Reading statuses

The official `user_books` reference defines these stable numeric values:

| `status_id` | Hardcover status  | Initial local treatment           |
| ----------- | ----------------- | --------------------------------- |
| 1           | Want to Read      | Queue candidate, not Archive      |
| 2           | Currently Reading | Queue, not Archive                |
| 3           | Read              | Archive                           |
| 4           | Paused            | Ignore for initial Archive import |
| 5           | Did Not Finish    | Ignore for initial Archive import |
| 6           | Ignored           | Ignore                            |

The connector should also fetch `user_book_status { id slug status }` during the
probe so a future upstream change is visible rather than silently remapped.

### `user_books`: owner's current relationship to a book

This is the primary library surface. Relevant fields in the official reference
and schema are:

- Identity and lineage: `id`, `user_id`, `book_id`, `edition_id`,
  `original_book_id`, `original_edition_id`, `merged_at`, `imported`.
- Status: `status_id`, `user_book_status`, `read_count`.
- Dates: `date_added`, `created_at`, `updated_at`, `first_read_date`,
  `last_read_date`, `first_started_reading_date`, `reviewed_at`.
- Personal data: `rating`, `has_review`, `review`, `review_raw`, `review_slate`,
  `review_has_spoilers`, `private_notes`, `starred`.
- Ownership and context: `owned`, `owned_copies`, `media_url`, `url`,
  `recommended_by`, `recommended_for`, `privacy_setting_id`.
- Relationships: `book`, `edition`, `user_book_reads`, `reading_journals`.

`rating` uses Hardcover's 0–5 scale and supports half-star values. Preserve the
original numeric value; any normalized rating is derived.

### `user_book_reads`: individual reads and rereads

This is the best available surface for distinct reading occurrences:

- `id`: read-through identifier.
- `user_book_id`: parent library entry.
- `edition_id` and `edition`: edition used for this read, when known.
- `started_at`, `paused_at`, `finished_at`: date-precision reading dates.
- `finished_at_precision`: separate precision metadata that must be preserved and
  decoded from a real response before date semantics are finalized.
- `progress`, `progress_pages`, `progress_seconds`: progress values.

Only a finished read contributes a dated Archive occurrence. Progress fields are
projected into personal History but never imply completion. A `Read` user-book
can still be archived when no dated read-through exists; that occurrence has an
unknown completion date, not a fabricated one.

Do not assume `read_count` always equals the number of `user_book_reads` rows.
Imports and older records may only preserve aggregate first/last dates. The
private probe must compare all three. If `read_count` exceeds the detailed rows,
the eventual normalizer should preserve the discrepancy rather than invent exact
dates or editions.

### `books`: title-level work

Hardcover calls the title-level record a book, with editions underneath it.
Useful fields include:

- `id`, `canonical_id`, `canonical`, `slug`, `original` lineage where available.
- `title`, `subtitle`, `description`, `headline`.
- `pages`, `audio_seconds`, `release_date`, `release_year`.
- `image`, `cached_image`, `links`.
- `contributions` and `cached_contributors` for authors and other contributors.
- `default_physical_edition_id`, `default_ebook_edition_id`,
  `default_audio_edition_id`, and `default_cover_edition_id`.
- `book_mappings` for external platform identifiers.
- `updated_at` for catalog metadata reconciliation.

Community aggregates such as `rating`, `ratings_count`, and `users_read_count`
are catalog metadata, not the owner's rating or consumption evidence.

### `editions`: format-specific identity

Relevant edition fields include:

- `id`, `canonical_id`, `book_id`, `original_book_id`.
- `title`, `subtitle`, `edition_information`, `edition_format`,
  `physical_format`, `physical_information`.
- `isbn_10`, `isbn_13`, `asin`, and their validation flags.
- `pages`, `audio_seconds`, `reading_format_id`, `reading_format { id format }`.
- `publisher`, `language`, `country`, `release_date`, `release_year`.
- `image`, `cached_image`, `contributions`, `cached_contributors`.
- `source`, `state`, `created_at`, `updated_at`.

Preserve the Hardcover book ID and edition ID independently. An audiobook,
ebook, and physical edition of the same title should not be collapsed into one
upstream identity even if the local Archive presents them as one book.

### Reviews and reading journals

The current review and rating live on `user_books`; the public schema does not
expose a revision history for them. `reviewed_at` is the review timestamp, not a
book completion date. `updated_at` is a generic relationship update and must not
be presented as the event date for a status, rating, review, or progress fact.
When no event-specific timestamp exists, the current fact is retained without a
date.

`reading_journals` exposes `id`, `book_id`, `edition_id`, `event`, `action_at`,
`created_at`, `updated_at`, `entry`, `metadata`, tags, privacy, and user. The
reference lists events such as `note`, `quote`, `status_currently_reading`,
`status_read`, `rated`, `reviewed`, and `progress_updated`, but does not specify an
exhaustive enum or payload schema. Journals may help diagnose dates or imported
status changes, but they should not be foundational to the initial Archive. Any
notes imported later remain source facts with their own provenance.

## Stable identifiers and merge behavior

Use these identifiers in descending order of authority:

1. `user_books.id` for the owner's current Hardcover relationship record.
2. `user_book_reads.id` for a distinct Hardcover read-through.
3. `books.id` for the Hardcover title/work and `editions.id` for its edition.
4. `book_mappings` as typed pairs of `platform_id`/platform name and
   `external_id`.
5. ISBN-13, ISBN-10, and ASIN as edition-level matching signals, never as the sole
   local primary key.

Slugs and titles are not stable identifiers. Hardcover supports canonical and
merged records: `books.canonical_id`, `editions.canonical_id`, and the
`original_*`/`merged_at` fields on `user_books` must be preserved. A changed
canonical target should update external-identity relationships without deleting
the original source evidence.

## Pagination and checkpoints

The GraphQL list fields use Hasura-style `where`, `order_by`, `limit`, `offset`,
and `distinct_on` arguments. Prefer keyset pagination over offsets:

```graphql
query UserBooksPage($userId: Int!, $afterId: Int!, $limit: Int!) {
  user_books(
    where: { user_id: { _eq: $userId }, id: { _gt: $afterId } }
    order_by: { id: asc }
    limit: $limit
  ) {
    id
    user_id
    book_id
    edition_id
    status_id
    date_added
    first_read_date
    last_read_date
    read_count
    rating
    reviewed_at
    created_at
    updated_at
    imported
    original_book_id
    original_edition_id
    merged_at
    book {
      id
      canonical_id
      title
      subtitle
      cached_contributors
      cached_image
      updated_at
    }
    edition {
      id
      canonical_id
      isbn_10
      isbn_13
      asin
      reading_format_id
      edition_format
      pages
      audio_seconds
      updated_at
    }
    user_book_reads(order_by: { id: asc }) {
      id
      edition_id
      started_at
      paused_at
      finished_at
      finished_at_precision
      progress
      progress_pages
      progress_seconds
    }
  }
}
```

This exact depth and field set still needs an authenticated validation because of
the documented maximum query depth. Split catalog metadata or read-throughs into
separate queries if Hardcover rejects it.

Recommended reconciliation strategy:

1. Full backfill all `user_books` in stable `id` order and store each raw page.
2. Incrementally poll `user_books` using `(updated_at, id)` with an overlap
   window. Commit the page before advancing either value.
3. Periodically run a complete ID-and-content reconciliation because
   `updated_at` is nullable and nested read-through changes may not touch it.
4. Re-fetch `user_book_reads` for relevant user-book IDs during full
   reconciliation. These rows have stable IDs but no update timestamp in the
   public schema.
5. Reconcile referenced book and edition metadata separately using their own
   `updated_at` values where useful.
6. Compare a completed full snapshot with prior source identities to detect
   upstream absence. Never physically erase local Archive history.

An ID-only cursor can safely continue an interrupted backfill, but it is not a
change cursor: existing lower-ID rows can still be edited or deleted.

## Historical completeness

Expected strengths:

- All current library relationships and their current status.
- Current rating, review, private notes, selected edition, and ownership data.
- First and last read dates plus `read_count` on `user_books`.
- Separate dated rereads when `user_book_reads` is populated.
- Explicit `Read` status even when the completion date is missing.

Known or likely gaps that must remain visible:

- The API is a current-state GraphQL surface, not a promised immutable audit log.
- Rating and review edit history is not exposed.
- A read-through can have incomplete dates or edition information.
- `read_count` may be richer than the available per-read rows, especially for
  imported history.
- `date_added` and `created_at` describe the library record, not consumption.
- `updated_at` does not guarantee a complete feed of nested changes.
- The public documentation does not define deletion tombstones, webhooks, or a
  durable server-side change cursor.

The UI and sync-run records should report these as source coverage, not pretend
that an undated or aggregate history is exact.

## Queue and write-back

Queue mirroring appears technically feasible. The checked-in official schema
exposes:

- `insert_user_book(object: UserBookCreateInput!)`
- `update_user_book(id:, object: UserBookUpdateInput!)`
- `delete_user_book(id:)`
- `insert_user_book_read`, `update_user_book_read`, `delete_user_book_read`, and
  `upsert_user_book_reads`
- reading-journal insert, update, and delete mutations

`UserBookCreateInput` includes `book_id`, optional `edition_id`, `status_id`,
`date_added`, privacy, dates, rating, review, and notes. A future local Queue can
mirror an item upstream by inserting or updating a user book to status ID 1
(`Want to Read`).

Write-back is not critical for the first milestone and should remain disabled
until read-only ingestion is trustworthy. When added, every mutation needs a
local idempotency decision, a pre-mutation snapshot, explicit conflict behavior,
and narrow UI intent. The token is not scoped, so accidental mutations carry
real account risk.

## Update and deletion behavior

- Existing library entries can be changed with `update_user_book`.
- Individual read-throughs and journal rows have corresponding update/delete
  mutations.
- `delete_user_book` returns a `UserBookDeleteType`, but the official docs do not
  promise a queryable tombstone or deletion feed.
- Hardcover catalog merges are represented by canonical/original IDs and must be
  treated differently from the owner removing a book from their library.

For ingestion, a missing source record is only considered removed after a
successful complete snapshot, not after a partial page or failed query. Record
the upstream removal locally while retaining raw payloads and prior Archive
facts.

## Private payload observation

The owner-account probe authenticated successfully. The first two manually
added records validated current-reading nesting and edition identity. After the
Goodreads and StoryGraph imports completed, a fully paginated scan returned:

- 1,115 `user_books` total;
- 1,113 rows marked imported;
- status counts: 988 Want to Read (`1`), 2 Currently Reading (`2`), and 125 Read
  (`3`);
- 110 rated rows and 5 reviewed rows;
- `read_count` values: 999 zero, 112 one, and 4 two, for 120 declared read
  occurrences;
- 114 child `user_book_reads` rows, of which 112 have `finished_at` and 2 are the
  current-reading rows without it;
- 13 Read-status books without a finished child read row;
- zero books with multiple child read rows, including all four books whose
  `read_count` is two;
- finished date range 2013-01-01 through 2026-06-14; and
- all observed `finished_at` values were date strings while
  `finished_at_precision` remained null.

This establishes an important admission rule: status `3` is the reliable proof
that a book belongs in Archive. Requiring a finished child row would silently
drop 13 read books. Conversely, child rows and `read_count` do not form a
complete reread ledger: four declared rereads are not represented by multiple
children, and the declared occurrence total exceeds finished child rows.

Preserve `read_count`, child rows, first/last-read dates, ratings, reviews, and
the raw GraphQL snapshot, but do not manufacture distinct reread occurrences
when Hardcover supplies only a count. A Read-status book without a trustworthy
date belongs in Archive with null `consumed_at`.

Other observed nullability remains significant:

- every book has numeric work and edition IDs, but canonical IDs are almost
  entirely null;
- ISBN-10 is absent for 87 editions and ISBN-13 for 59;
- edition release year is null for every row even when release date exists;
- `first_read_date` is null for every row, while `last_read_date` is present for
  only 103 rows; and
- imported raw review data is often present even when normalized review text is
  absent, so it remains private raw evidence and is never logged.

## Remaining credential-safe probe plan

No credential or real response belongs in the repository. Authentication,
pagination, imported statuses, ratings, reviews, dates, and partial reread shape
are verified. Remaining behavioral probes are optional:

1. Inspect whether child read edits change `user_books.updated_at`. Make one
   harmless change in the Hardcover UI, poll before and after, then restore it.
2. Confirm error envelopes, `429` headers, and maximum accepted query depth;
   pagination ordering and numeric encoding are already observed.
3. Determine whether newly created rereads produce multiple child rows even
   though imported rereads did not.
4. Store private raw responses only in an ignored local path during development
   and private R2 in production. Derive synthetic fixtures with replacement IDs,
   titles, people, URLs, notes, and reviews.
5. Defer mutation testing. Later, with explicit approval, use one disposable
   Want to Read entry to validate insert/update/delete and conflict behavior.

The probe report should contain counts, field-presence matrices, timestamp
precision, and semantic conclusions—not private payload values.

## Unresolved questions

1. Does every reread create a `user_book_reads` row, including records imported
   from other trackers?
2. What are the numeric meanings of `finished_at_precision`, and can started and
   finished dates have different precision?
3. Does changing a read-through, review, rating, or selected edition always bump
   `user_books.updated_at`?
4. Are `user_book_reads` rows physically deleted or replaced during edits?
5. Can a complete library snapshot observe private and imported entries with the
   same fields as the website?
6. Which page size remains reliable under the 30-second timeout and depth limit?
7. Are GraphQL cost or response-size limits enforced beyond the documented
   request rate, timeout, and depth?
8. Do `book` and `edition` canonical IDs change after merges, and how long do old
   IDs remain queryable?
9. Does deleting a user book erase its read-throughs and journals from subsequent
   queries, or is any tombstone/activity retained?
10. Is there an official webhook or supported subscription path for private user
    changes? None is documented in the reviewed official material.

## Recommended next action

The payload evidence is sufficient for the initial schema. Admit status `3` to
Archive, retain a nullable consumed date, preserve declared read counts without
inventing reread occurrences, keep status `2` outside Archive and Queue, and
defer importing status `1` into Queue until Queue behavior is implemented.

## Implementation update — 2026-09-14

The correctness review and synthetic regression suite introduced the explicit
reconciliation and recovery policies in [ADR 0010](../decisions/0010-reconciliation-and-recovery.md).
This implementation update does not represent a new private payload probe or a
new verification of upstream API capabilities. See the connector README for
current behavior; earlier reconnaissance questions remain historical evidence.
