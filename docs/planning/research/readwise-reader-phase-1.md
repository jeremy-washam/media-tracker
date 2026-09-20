# Readwise Reader research for Library Phase 1

- Status: decision-ready source research; final list, gallery, and inspector field
  choices deliberately deferred
- Live verification: 2026-09-19
- Scope: Readwise Reader documents, document tags, Reader-created Readwise
  highlight containers, and highlights

## Purpose

This document establishes what Readwise Reader can supply to the production
Library specification. It separates upstream availability from the much smaller
projection implemented today. It does not decide which fields appear in a list
row, gallery card, or inspector.

The evidence labels used below are:

- **[LIVE]** observed in safe, read-only calls to the configured owner account on
  2026-09-19. Only field names, types, nullability, lengths, counts, and other
  aggregates were emitted; no token, title, URL, note, highlight text, or full
  document content was retained.
- **[DOC]** stated by current official Readwise documentation but not observed in
  this live account or call variant.
- **[CURRENT]** parsed into the current canonical projection or public contract.
- **[RAW]** retained exactly in private R2 when the current connector acquires the
  containing v3 page, and therefore recoverable by replay. This does not mean the
  field has a normalized column or is exposed by an API.
- **[NEW]** requires a new acquisition path, request option, source-owned model,
  or API contract. It cannot be recovered from the complete current normalized
  projection.

`[RAW]` has an important scope limit. The first implemented backfill requested
only `location=archive`; later incremental sweeps query all locations with
`updatedAfter`. The repository therefore does not yet contain a guaranteed full
snapshot of Inbox, Later, Feed, tags, highlights, or full text. A new all-location
backfill is required before Library Queue behavior can be called complete.

## Evidence and safe live calls

Primary references:

- [Reader API](https://readwise.io/reader_api)
- [Readwise API v2](https://readwise.io/api_deets)
- [Readwise custom webhooks](https://docs.readwise.io/readwise/docs/webhooks)
- [Reader library configurations](https://docs.readwise.io/reader/guides/workflows/library-configuration)
- [Saving content to Reader](https://docs.readwise.io/reader/docs/saving-content)

The same manually issued token authenticated all calls through
`Authorization: Token <token>`. The API exposes no narrower read-only scopes; the
credential also authorizes writes, so it remains a high-value Worker secret.
`GET /api/v2/auth/` returned `204`.

| Surface                   | Safe request made                                                               | Live result                     | Pagination                 |
| ------------------------- | ------------------------------------------------------------------------------- | ------------------------------- | -------------------------- |
| Reader documents          | `GET /api/v3/list/?limit=100`                                                   | 1,021 rows, 11 pages            | `nextPageCursor`           |
| Reader tags               | `GET /api/v3/tags/`                                                             | 9 tags, 1 page                  | `nextPageCursor`           |
| Reader content capability | One row per observed category with `withHtmlContent=true&withRawSourceUrl=true` | 7 category samples              | `nextPageCursor` if needed |
| Readwise export           | `GET /api/v2/export/?includeDeleted=true`                                       | 16 containers and 26 highlights | `nextPageCursor`           |
| Readwise highlights       | `GET /api/v2/highlights/?page_size=1000`                                        | 19 active highlights            | `next` page URL            |
| Readwise containers       | `GET /api/v2/books/?page_size=1000&source=reader`                               | 16 Reader containers            | `next` page URL            |

All 23 requests in the exhaustive shape sweep returned `200`, except auth's
expected `204`. No rate-limit or retry headers appeared on successful responses.
The v2 export envelope reported `count=26`: in this account it counts nested
highlights, not the 16 top-level containers. Pagination must always follow the
cursor rather than infer completion from `count` or `results.length`.

### Authentication, permissions, limits, and retries

- Reader v3 document list and tag list: **20 requests/minute/token**.
- Reader v3 list accepts `limit=1..100`; tag list has no documented page-size
  parameter.
- Readwise v2 default: **240 requests/minute/token**. Advanced Highlight LIST
  and Book LIST are restricted to **20 requests/minute/token**.
- V2 export uses `nextPageCursor`; advanced v2 lists use `page_size` (maximum
  1,000), a numeric `page`, and `next`/`previous` URLs.
- A `429` supplies `Retry-After`. Honor it, add bounded jitter, and retry the page
  without advancing the durable watermark.
- No successful live response supplied `X-RateLimit-*` metadata. Do not depend on
  remaining-quota headers.

## Current account shape

These are live aggregates, not fixtures or UI requirements.

### Category and location matrix

| Reader location | article |    pdf |     rss |  video | podcast | tweet | highlight |     Total |
| --------------- | ------: | -----: | ------: | -----: | ------: | ----: | --------: | --------: |
| `archive`       |      57 |      4 |      11 |      9 |       1 |     3 |         0 |        85 |
| `new` (Inbox)   |     105 |      6 |       8 |     19 |       0 |     1 |         0 |       139 |
| `later`         |      45 |     14 |       0 |      3 |       0 |     0 |         0 |        62 |
| `feed`          |       0 |      0 |     665 |      0 |      51 |     0 |         0 |       716 |
| `null`          |       0 |      0 |       0 |      0 |       0 |     0 |        19 |        19 |
| **Total**       | **207** | **24** | **684** | **31** |  **52** | **4** |    **19** | **1,021** |

Live categories were `article`, `highlight`, `pdf`, `podcast`, `rss`, `tweet`,
and `video`. Official v3 documentation also lists `email`, `note`, and `epub`,
none of which appeared in this account. Conversely, `podcast` appeared live but
is still omitted from the documented v3 category enum. Code must preserve unknown
categories instead of treating the documentation as exhaustive.

Documented locations are `new`, `later`, `shortlist`, `archive`, and `feed`.
`shortlist` did not appear live. All 19 rows with a null location were highlight
documents with a parent relationship.

### State and coverage observations

- Archive is not equivalent to `reading_progress=1`: 14 of 85 archived rows had
  progress 0, 43 were partial, and 28 were 1. Four archived rows had never been
  opened according to `first_opened_at`.
- No archived row had `last_moved_at == updated_at`; one had
  `last_moved_at == saved_at`. This reinforces that `updated_at` is not a
  consumption time and that `last_moved_at` remains an inference about the most
  recent move, not proof of a finished action.
- Feed is ambient subscription inventory: 621 of 716 rows had never been opened,
  651 had zero progress, and all 716 had `last_moved_at == saved_at`. Treating
  Feed as explicit Queue intent would overwhelm the owner's deliberate saves.
- 70 documents had attached tags, comprising 71 assignments. Every observed tag
  object had `type="manual"`; the separate tag vocabulary contained 9 rows.
- The account contained 178 distinct non-empty author strings, 107 distinct
  non-empty site/publication strings, and 10 distinct `source` strings. These are
  different concepts and should not be collapsed into one creator field.
- Of 1,002 populated `source_url` values, there were 996 distinct strings: six
  duplicate pairs. All 1,021 Reader URLs and document IDs were unique. A source
  URL is therefore useful matching evidence but not a unique identity.
- The v2 export contained 26 highlights, including 7 deleted rows; the advanced
  Highlight LIST returned the 19 active rows. The export is the required read
  surface for deletion-aware highlight synchronization.

## Endpoint and request contracts

### Reader v3 Document LIST

`GET https://readwise.io/api/v3/list/`

| Query              | Documented type and meaning                                   | Phase 1 relevance                                 |
| ------------------ | ------------------------------------------------------------- | ------------------------------------------------- |
| `id`               | string; exact document                                        | Targeted refresh after webhook                    |
| `updatedAfter`     | ISO 8601 instant                                              | Incremental current-state reconciliation          |
| `location`         | `new`, `later`, `shortlist`, `archive`, `feed`                | Backfill or audit one state                       |
| `category`         | documented category string                                    | Capability sampling and diagnostics               |
| `tag`              | repeat up to five times; all must match; empty means untagged | Source-side filtering, not the durable checkpoint |
| `limit`            | integer 1–100, default 100                                    | Page sizing                                       |
| `pageCursor`       | opaque string                                                 | In-run continuation only                          |
| `withHtmlContent`  | boolean                                                       | Opt-in parsed HTML acquisition                    |
| `withRawSourceUrl` | boolean                                                       | Opt-in one-hour signed source URL                 |

The live envelope was always an object with numeric `count`, nullable/string
`nextPageCursor`, and array `results`.

### Reader v3 Tag LIST

`GET https://readwise.io/api/v3/tags/` accepts only the optional opaque
`pageCursor`. Its envelope matches Document LIST. It is a vocabulary endpoint;
document attachment remains represented on each document's `tags` object.

### Readwise v2 Highlight EXPORT

`GET https://readwise.io/api/v2/export/` accepts:

- `updatedAfter`: ISO 8601 high-water filter;
- `ids`: comma-separated `user_book_id` values;
- `includeDeleted=true`: include deleted containers/highlights; and
- `pageCursor`: opaque continuation.

This is the recommended deletion-aware backup/synchronization surface. For a
container whose `source` is `reader`, official documentation defines
`external_id` as the source-system User Book reference. All 16 live containers
had `source=reader` and a 26-character `external_id`, making it a strong join
candidate to the v3 document identity. Exact equality should be asserted in an
integration test before enforcing a foreign key.

### Advanced Readwise v2 lists

`GET /api/v2/highlights/` accepts `page_size`, `page`, `book_id`, `updated__lt`,
`updated__gt`, `highlighted_at__lt`, and `highlighted_at__gt`.
`GET /api/v2/books/` accepts `page_size`, `page`, `category`, `source`,
`updated__lt`, `updated__gt`, `last_highlight_at__lt`, and
`last_highlight_at__gt`.

Both use `{count,next,previous,results}` rather than the cursor envelope. Export
is preferable for initial highlight ingestion because it groups containers and
highlights, includes deletion state, and supports cursor-based incrementals. The
advanced lists remain useful for diagnosis and targeted reads.

## Exhaustive live field inventory

Types describe all rows returned by the live calls. `empty` means an empty
string or empty collection was observed; it is distinct from null. Fields absent
from a row were not observed on the ordinary v3 sweep.

### Reader document envelope and object

| Field                | Live type/nullability                                | Availability         | Meaning and caution                                                                    |
| -------------------- | ---------------------------------------------------- | -------------------- | -------------------------------------------------------------------------------------- |
| `count`              | integer                                              | [LIVE][RAW]          | Total matches at request time; not a cursor                                            |
| `nextPageCursor`     | string or null                                       | [LIVE][RAW]          | Opaque in-run continuation                                                             |
| `results`            | array                                                | [LIVE][RAW]          | Current document snapshots                                                             |
| `id`                 | string, always present                               | [LIVE][CURRENT][RAW] | Stable connection-scoped Reader identity                                               |
| `url`                | string, always present                               | [LIVE][RAW]          | Reader reading URL; current projection uses it only when `source_url` is absent        |
| `source_url`         | string or null; 19 null                              | [LIVE][CURRENT][RAW] | Original/source URL and matching input; not unique                                     |
| `title`              | string or null; 19 null                              | [LIVE][CURRENT][RAW] | Imported title; do not synthesize missing values                                       |
| `author`             | string/null/empty; 19 null, 1 empty                  | [LIVE][CURRENT][RAW] | Display byline string, not a normalized person list                                    |
| `source`             | string, always present                               | [LIVE][RAW]          | Acquisition/import mechanism; not publication                                          |
| `site_name`          | string or null; 21 null                              | [LIVE][RAW]          | Publication/site label, separate from author and source                                |
| `category`           | string, always present                               | [LIVE][CURRENT][RAW] | Provider classification; preserve unknown values                                       |
| `location`           | string or null; 19 null                              | [LIVE][CURRENT][RAW] | Mutable current state, not transition history                                          |
| `tags`               | object, always present                               | [LIVE][RAW]          | Dictionary keyed by Reader tag key                                                     |
| `tags.<key>.name`    | string                                               | [LIVE][RAW]          | Display label                                                                          |
| `tags.<key>.type`    | string; live value `manual`                          | [LIVE][RAW]          | Tag origin/type                                                                        |
| `tags.<key>.created` | integer                                              | [LIVE][RAW]          | Source numeric tag-attachment metadata; units undocumented                             |
| `word_count`         | integer or null; 52 null                             | [LIVE][RAW]          | Provider count, absent for highlights/videos and one RSS row                           |
| `reading_time`       | string or null; 52 null                              | [LIVE][RAW]          | Human-readable estimate, not a typed duration                                          |
| `listening_time`     | string or null; 990 null                             | [LIVE][RAW]          | Present on all 31 videos in this account, not on podcasts                              |
| `reading_progress`   | number 0–1, always present                           | [LIVE][RAW]          | Mutable current progress; not Archive admission                                        |
| `created_at`         | UTC instant string, always present                   | [LIVE][RAW]          | Reader record creation                                                                 |
| `updated_at`         | UTC instant string, always present                   | [LIVE][CURRENT][RAW] | Reconciliation/source-recorded time, not consumption                                   |
| `published_date`     | date string or null; 47 null                         | [LIVE][CURRENT][RAW] | Live precision was day-only                                                            |
| `saved_at`           | UTC instant string, always present                   | [LIVE][RAW]          | Save/arrival evidence; not consumption                                                 |
| `first_opened_at`    | UTC instant string or null; 733 null                 | [LIVE][RAW]          | First observed open; not completion                                                    |
| `last_opened_at`     | UTC instant string or null; 733 null                 | [LIVE][RAW]          | Most recent observed open; not completion                                              |
| `last_moved_at`      | UTC instant string, always present                   | [LIVE][CURRENT][RAW] | Most recent move; inferred Archive occurrence time only                                |
| `notes`              | string; all 1,021 empty                              | [LIVE][RAW]          | Top-level document note; live emptiness is not an API guarantee                        |
| `summary`            | string/null/empty; 20 null, 1 empty                  | [LIVE][CURRENT][RAW] | Source/Reader summary; not AI-generated by this app                                    |
| `image_url`          | string/null/empty; 27 null, 16 empty                 | [LIVE][CURRENT][RAW] | Cover/thumbnail candidate                                                              |
| `parent_id`          | string or null; 19 populated                         | [LIVE][RAW]          | Parent document for highlight, or parent highlight for note                            |
| `content`            | string/null/empty; 16 populated                      | [LIVE][RAW]          | Highlight passage on v3 highlight rows; ordinary document rows did not carry full text |
| `html_content`       | string or empty when requested                       | [LIVE][NEW]          | Parsed HTML, opt-in; not requested or retained today                                   |
| `raw_source_url`     | signed string, empty, null, or absent when requested | [LIVE][NEW]          | Temporary capability URL; download bytes to R2 rather than retaining the URL           |

`html_content` and `raw_source_url` were probed on one row in each observed
category. Article, PDF, podcast, RSS, tweet, and video samples returned non-empty
HTML and signed S3 URLs. The highlight sample returned empty HTML and omitted the
raw-source field. This proves capability for those samples only, not complete
coverage, permanence, or licensing for every item.

Official list documentation also permits `email`, `note`, and `epub` categories
and `shortlist` location [DOC]. None was live-observed. The create/update contract
accepts `language`, but the list contract does not promise a returned `language`
field and none was observed; do not design a Library dependency around it.

### Reader Tag LIST object

| Field            | Live type      | Availability | Meaning                     |
| ---------------- | -------------- | ------------ | --------------------------- |
| `count`          | integer        | [LIVE][NEW]  | Vocabulary size             |
| `nextPageCursor` | string or null | [LIVE][NEW]  | Opaque continuation         |
| `results`        | array          | [LIVE][NEW]  | Tag vocabulary              |
| `results[].key`  | string         | [LIVE][NEW]  | Stable filter/key candidate |
| `results[].name` | string         | [LIVE][NEW]  | Display name                |

The current connector does not call Tag LIST. Attached tag objects remain
recoverable only from acquired v3 document pages.

### Readwise v2 export container

Every field below is **[LIVE][NEW]**: the production connector does not acquire
v2 export pages today.

| Field             | Live type/nullability    | Meaning and caution                                                              |
| ----------------- | ------------------------ | -------------------------------------------------------------------------------- |
| `user_book_id`    | integer                  | Readwise container identity                                                      |
| `is_deleted`      | boolean                  | Container deletion state; all 16 live containers were false                      |
| `title`           | string                   | Container title                                                                  |
| `readable_title`  | string                   | Readwise display title variant                                                   |
| `author`          | string                   | Container byline                                                                 |
| `source`          | string                   | Live value was `reader`                                                          |
| `cover_image_url` | string                   | Container artwork                                                                |
| `unique_url`      | string                   | Readwise unique/source URL representation                                        |
| `book_tags`       | array; live arrays empty | Container tag assignments                                                        |
| `category`        | string                   | Live values `articles` and `tweets`                                              |
| `document_note`   | null live                | Container-level note; docs also show string                                      |
| `summary`         | string                   | Container summary                                                                |
| `readwise_url`    | string                   | Link to Readwise review/container                                                |
| `source_url`      | string                   | Original/source URL                                                              |
| `external_id`     | string                   | Reader source-system join candidate                                              |
| `asin`            | null live                | Optional book identity; irrelevant for these Reader containers but part of shape |
| `highlights`      | array, 1–3 live          | Nested highlight snapshots, including deletions                                  |

`book_tags` elements were not present live. Official advanced Book Tag responses
document `{id: integer, name: string}` [DOC]. Treat that as documented-only until
observed on the export surface.

### Readwise v2 export highlight

Every field below is **[LIVE][NEW]**.

| Field            | Live type/nullability    | Meaning and caution                                                 |
| ---------------- | ------------------------ | ------------------------------------------------------------------- |
| `id`             | integer                  | Readwise highlight identity                                         |
| `is_deleted`     | boolean                  | Seven of 26 export rows were deleted                                |
| `text`           | string                   | Highlight passage; private full text fragment                       |
| `note`           | string; all live empty   | User annotation; empty is meaningful                                |
| `location`       | integer                  | Source-relative position                                            |
| `location_type`  | string; live `offset`    | Position unit; docs also allow page/location/none/order/time_offset |
| `color`          | string; all live empty   | Highlight color                                                     |
| `highlighted_at` | UTC instant string       | Highlight occurrence; docs allow null                               |
| `created_at`     | UTC instant string       | Readwise creation time                                              |
| `updated_at`     | UTC instant string       | Export incremental/change time                                      |
| `external_id`    | string                   | Upstream/Reader highlight reference                                 |
| `end_location`   | null live                | Optional end position                                               |
| `url`            | string live              | Highlight/Reader URL                                                |
| `book_id`        | integer                  | Parent `user_book_id`                                               |
| `tags`           | array; live arrays empty | Highlight tags                                                      |
| `is_favorite`    | boolean                  | Readwise favorite state                                             |
| `is_discard`     | boolean                  | Readwise discard state                                              |
| `readwise_url`   | string                   | Readwise deep link                                                  |

Tag elements were empty live. Official Highlight Tag responses document
`{id: integer, name: string}` [DOC].

### Advanced v2 Highlight LIST object

Every field below is **[LIVE][NEW]**. The active list returned 19 rows and, unlike
export, did not include the seven deleted highlights.

| Field            | Live type/nullability  | Difference from export                     |
| ---------------- | ---------------------- | ------------------------------------------ |
| `id`             | integer                | Same logical highlight identity            |
| `text`           | string                 | Same private passage                       |
| `note`           | string; all live empty | Export also returned string live           |
| `location`       | integer                | Same position                              |
| `location_type`  | string; live `offset`  | Same position unit                         |
| `highlighted_at` | UTC instant string     | Docs allow null                            |
| `created_at`     | UTC instant string     | Same meaning                               |
| `url`            | string                 | Same link-like field                       |
| `color`          | string; all live empty | Same color                                 |
| `updated`        | UTC instant string     | Named `updated`, not export's `updated_at` |
| `book_id`        | integer                | Parent container                           |
| `external_id`    | string                 | Upstream/Reader reference                  |
| `tags`           | array; all live empty  | Elements documented as id/name             |
| `end_location`   | null live              | Optional end position                      |
| `readwise_url`   | string                 | Readwise deep link                         |

Advanced LIST omits export's `is_deleted`, `is_favorite`, and `is_discard` in
the observed and documented shape. Do not merge the two contracts blindly.

### Advanced v2 Book LIST object (`source=reader`)

Every field below is **[LIVE][NEW]**.

| Field                             | Live type/nullability  | Meaning and caution                                                           |
| --------------------------------- | ---------------------- | ----------------------------------------------------------------------------- |
| `id`                              | integer                | Readwise container identity                                                   |
| `title`                           | string                 | Container title                                                               |
| `author`                          | string                 | Container byline                                                              |
| `category`                        | string                 | Live values `articles` and `tweets`                                           |
| `source`                          | string                 | Live value `reader`                                                           |
| `num_highlights`                  | integer                | Current active highlight count                                                |
| `last_highlight_at`               | UTC instant string     | Latest highlight time; docs allow null                                        |
| `updated`                         | UTC instant string     | Container update time                                                         |
| `cover_image_url`                 | string                 | Container artwork                                                             |
| `highlights_url`                  | string                 | Readwise review URL                                                           |
| `source_url`                      | string                 | Original/source URL                                                           |
| `asin`                            | null live              | Optional book identifier                                                      |
| `tags`                            | array; all live empty  | Container tags                                                                |
| `document_note`                   | string; all live empty | Container note                                                                |
| `resurface_weighting`             | integer live           | Readwise resurfacing preference; source-specific, unlikely common UI metadata |
| `source_syncs_all_books_together` | boolean                | Integration behavior flag; operational evidence, not media metadata           |

### Hand-sanitized representative shapes

These shapes are authored from the field inventories. Values are type markers,
not transformed personal records.

```json
{
  "count": "<integer>",
  "nextPageCursor": "<opaque-string-or-null>",
  "results": [
    {
      "id": "<reader-document-id>",
      "url": "<reader-url>",
      "source_url": "<source-url-or-null>",
      "title": "<string-or-null>",
      "author": "<string-or-null>",
      "source": "<source-kind>",
      "category": "article",
      "location": "later",
      "tags": {
        "<tag-key>": { "name": "<tag-name>", "type": "manual", "created": "<integer>" }
      },
      "site_name": "<publication-or-null>",
      "word_count": "<integer-or-null>",
      "reading_time": "<display-string-or-null>",
      "listening_time": "<display-string-or-null>",
      "created_at": "<utc-instant>",
      "updated_at": "<utc-instant>",
      "published_date": "<date-or-null>",
      "notes": "<private-string>",
      "summary": "<private-string-or-null>",
      "image_url": "<image-url-or-null>",
      "parent_id": null,
      "reading_progress": "<number-0-to-1>",
      "first_opened_at": "<utc-instant-or-null>",
      "last_opened_at": "<utc-instant-or-null>",
      "saved_at": "<utc-instant>",
      "last_moved_at": "<utc-instant>",
      "content": null
    }
  ]
}
```

```json
{
  "user_book_id": "<integer>",
  "is_deleted": false,
  "title": "<private-string>",
  "author": "<private-string>",
  "readable_title": "<private-string>",
  "source": "reader",
  "external_id": "<reader-document-id>",
  "category": "articles",
  "document_note": "<private-string-or-null>",
  "highlights": [
    {
      "id": "<integer>",
      "is_deleted": false,
      "text": "<private-highlight-text>",
      "note": "<private-note>",
      "location": "<integer>",
      "location_type": "offset",
      "highlighted_at": "<utc-instant-or-null>",
      "created_at": "<utc-instant>",
      "updated_at": "<utc-instant>",
      "external_id": "<source-highlight-id>",
      "end_location": null,
      "book_id": "<integer>",
      "tags": [],
      "is_favorite": false,
      "is_discard": false
    }
  ]
}
```

## Dates and precision

| Field                     | Live precision                         | Product interpretation                                                   |
| ------------------------- | -------------------------------------- | ------------------------------------------------------------------------ |
| `published_date`          | Day on all 974 populated rows          | Publication date, source asserted; never consumption                     |
| `created_at`              | UTC instant                            | Reader record creation                                                   |
| `saved_at`                | UTC instant                            | Save/arrival time; useful for Queue ordering                             |
| `updated_at`              | UTC instant                            | Reconciliation watermark/source-recorded time                            |
| `first_opened_at`         | UTC instant or null                    | First open evidence only                                                 |
| `last_opened_at`          | UTC instant or null                    | Last open evidence only                                                  |
| `last_moved_at`           | UTC instant                            | Most recent location move; inferred Archive time when currently archived |
| v2 `highlighted_at`       | UTC instant live; nullable by contract | Best highlight occurrence time when present                              |
| v2 `created_at`           | UTC instant                            | Readwise highlight creation                                              |
| v2 `updated_at`/`updated` | UTC instant                            | Highlight/container change watermark                                     |

Preserve original strings in raw evidence. The live account included fractional
seconds with different widths, so parsers must accept ISO 8601 rather than a
fixed string length. `published_date` is day precision even though create/update
accept a datetime. No field is a documented `finished_at`.

## What the implementation stores and drops today

### Stored and projected

The current Reader v3 client requests 15 rows per page. Initial backfill filters
to Archive; reconciliation uses the prior `updatedAfter` watermark minus a
five-minute overlap and queries every location. Every acquired response byte is
stored in private R2 before parsing, with a checksum and raw-object manifest.

The passthrough document schema validates and projects only:

- `id` -> Readwise connection-scoped `document_id` external identity;
- `category` and `location` -> Archive admission/type decision;
- `title`, `author`, `summary`, `image_url`, and `source_url`/`url` -> common
  `media_items` fields;
- `published_date` -> source-precision publication date;
- `updated_at` -> source-recorded time; and
- `last_moved_at` -> inferred consumed time for eligible current Archive rows.

Eligible current categories are `article`, `email`, `newsletter`, `pdf`, `rss`,
`video`, and `podcast`; the `newsletter` value is supported by code but is not a
documented or live-observed v3 category. Moving a known document out of Archive
marks its single current-state Archive occurrence removed. Moving it back reuses
the same occurrence key. This is a mutable projection, not a movement ledger.

### Retained but not queryable

For pages that were actually acquired, every other ordinary v3 field is [RAW]
and recoverable by replay. The D1 `source_records` row only retains the document
key, raw path, parser version, source-recorded time, disposition, and upstream
state; it does not independently retain tags, progress, notes, opened/saved
dates, site/source labels, word counts, or timing strings.

### Not acquired

The following are [NEW]:

- a complete all-location v3 backfill for Inbox, Later, Feed, and shortlist;
- Tag LIST pages and a normalized tag vocabulary/attachments;
- `withHtmlContent=true` pages and private full-text objects;
- download of raw-source bytes while signed URLs are valid;
- all Readwise v2 export, active highlight, book/container, and deletion data;
- Reader webhook bodies and transition evidence; and
- contracts/repositories for Reader details, Queue state, tags, highlights,
  notes, progress, and full text.

The current public `MediaSummary` contract exposes only canonical `id`, `type`,
and nullable `title`. The Readwise sync response exposes run/page/record/item
counts. There is no Reader-specific detail response yet.

## Product decisions and options

The recommendations below settle source semantics and acquisition priorities.
They do not settle which fields are visible in each Library presentation.

### Eligible categories and Library media type

| Reader category         | Options                              | Recommendation                                                                |
| ----------------------- | ------------------------------------ | ----------------------------------------------------------------------------- |
| `article`               | Article or generic document          | Article                                                                       |
| `pdf`                   | Article, Book, or separate PDF type  | Article for this workflow; preserve `pdf` subtype                             |
| `rss`                   | Article or Feed-only item            | Article when explicitly queued/archived; preserve RSS subtype and feed origin |
| `email` / newsletter    | Article or separate newsletter type  | Article; preserve `email`/newsletter evidence                                 |
| `video`                 | Article or video                     | Video; do not bury it in Articles merely because Reader supplied it           |
| `podcast`               | Article or podcast episode           | Podcast episode; live but undocumented category                               |
| `tweet`                 | Article or source evidence           | Source evidence only for Phase 1                                              |
| `epub`                  | Article, Book, or source evidence    | Source evidence only until book identity/edition behavior is designed         |
| `highlight` / `note`    | Standalone media or child annotation | Child evidence attached to parent; never standalone Library media             |
| unknown future category | Guess or preserve unresolved         | Preserve unresolved; do not coerce to article                                 |

This retains the accepted ledger rule: only Reader articles (including PDF,
RSS, and newsletter-style email), videos, and podcasts can become standalone
Archive items. It also prevents Reader videos and podcasts from becoming an
Articles-only silo when the Library has dedicated media types.

### Inbox, Later, Archive, Feed, and shortlist

Three plausible mappings are:

1. Treat every non-Archive location as Queue. This is simple but would add 716
   mostly unread subscription arrivals as implied user intent.
2. Treat only Inbox and Later as Queue, retain Feed separately, and ignore
   shortlist until observed. This matches the agreed Library foundation.
3. Mirror Reader's entire location taxonomy as first-class Library sections.
   This is faithful but lets one source dictate cross-media navigation.

**Recommendation:** Archive maps to canonical Archive for eligible categories;
`new` and `later` map to Queue membership with a retained source substate of
Inbox versus Later. Feed is not Queue and does not imply intent. Preserve it for
a possible Articles-specific Subscriptions/Feed section. Treat shortlist as an
optional source flag or saved view only after it is observed and its relationship
to Queue is chosen.

Queue and Archive remain independent evidence. A later upstream move must not
erase historical Archive evidence, and Archive membership must not silently
delete a still-current Queue observation without an explicit local rule.

### Archived versus read or finished

Options are to label every archived row “Read,” require progress 1, or use
Archive location as the source-specific admission signal while retaining the
uncertainty.

**Recommendation:** continue using eligible `location=archive` as completion-like
Archive admission, but never claim Reader proved full reading. Do not require
`reading_progress=1`, an open timestamp, or a `reader.document.finished` event:
the live account directly contradicts those requirements. Present provenance as
Reader Archive when relevant and keep `last_moved_at` marked inferred.

### Current state versus event history

V3 polling exposes mutable snapshots. It does not expose previous locations,
finished time, or deletion history. Webhooks document finished, archived,
move-to-Later, move-to-Inbox, shortlist, tag-update, and create notifications,
but their exact delivery, occurrence time, retry, and authentication behavior is
not verified.

**Recommendation:** Phase 1 should model Queue as current state and retain the
existing single current-state Reader Archive occurrence. Do not synthesize a
movement timeline. Start retaining raw webhook and snapshot observations when
implemented; add a source-owned transition/history model only when a concrete
Library or recap query needs it. Scheduled reconciliation remains authoritative.

### Highlights, notes, and full text

Options range from raw-only retention to eagerly normalizing and indexing every
annotation and full document.

**Recommendation:**

- acquire v2 export with `includeDeleted=true` for container/highlight identity,
  text, notes, tags, favorite/discard state, positions, and deletions;
- normalize highlights and notes into narrow Readwise-owned records linked to
  the Reader document, rather than a universal engagement event table;
- retain exact v2 pages before parsing;
- acquire `html_content` selectively for eligible items needed by detail/search,
  storing authorized bytes in private R2 with checksum and provenance;
- never persist the temporary signed `raw_source_url`; if raw-source retention is
  approved, download the bytes immediately and retain their content type,
  checksum, acquisition time, and authorization provenance; and
- distinguish absent, null, and empty notes. Live emptiness does not justify
  deleting the field from the model.

Eager full-text ingestion maximizes search quality but increases private storage,
sync cost, parsing exposure, and deletion obligations. A selective/on-demand
policy is the safer Phase 1 default; a complete encrypted/private text backfill
can be added when search requirements are explicit.

### Authors, publications, and source

**Recommendation:** retain three distinct source facts:

- `author`: the provider's byline string;
- `site_name`: publication/site display label; and
- `source`: how Reader acquired the document.

Use the author string as the provisional primary creator display value, but do
not split or deduplicate people from it yet. Keep publication and acquisition
source available for filtering and provenance. Any contributor model should be
driven by real multi-author queries rather than punctuation heuristics.

### Progress, length, and time estimates

`reading_progress` is a usable 0–1 current-state value but not a completion rule.
`word_count` is numeric. `reading_time` and `listening_time` are nullable display
strings, not typed durations; live category placement was surprising (podcasts
had `reading_time`, while videos had `listening_time`).

**Recommendation:** preserve all four as source-owned facts. If the UI needs
sorting or numeric estimates, add an explicitly derived parser with raw value,
parsed quantity/unit, parser version, and null-on-failure behavior. Do not map
the strings directly into canonical `duration_ms` without an accepted semantic
rule.

### Tags

Options are raw-only display, a source-owned many-to-many model, or canonical
cross-source tags.

**Recommendation:** acquire the complete Tag LIST and document attachments,
using Reader tag `key` as the source identity and `name` as display text. A
source-owned many-to-many model is justified if Library filtering is in Phase 1.
Do not make Reader tags canonical across sources and do not use them as media
identity. Preserve `type` and the opaque numeric `created` value until its units
are documented.

### Duplicates and canonical URLs

Options are one Library item per Reader ID, URL-based merging, or deterministic
cross-source identity extraction followed by explicit reconciliation.

**Recommendation:** Reader document ID remains the authoritative connection-
scoped identity. Preserve Reader URL and `source_url` separately. Never merge on
title, author, or normalized URL alone: duplicate source URLs exist and different
Reader documents may legitimately represent different saves or manifestations.
Later, extract authoritative provider identities such as YouTube video IDs when
the source URL unambiguously contains them, then reconcile through the canonical
identity layer with reviewable rules.

### Location changes and deletions

**Recommendation:** run a new complete all-location sweep before enabling Queue,
then use overlapped `updatedAfter` reconciliation. A transition away from Archive
updates current upstream state but retains admission evidence. Absence from a
page is never deletion proof. V2 export supplies highlight deletions; no official
v3 read endpoint supplies deleted Reader documents. Document deletion remains an
explicit coverage gap until a verified webhook/export surface exists.

### Possible Articles-specific organization

The cross-media shell should remain Library -> media type -> Archive/Queue. Within
Articles, source evidence supports these optional subdivisions without changing
the global navigation model:

- Queue: Inbox and Later source substates;
- Archive: all eligible consumed articles, with provider subtype available;
- a separate Subscriptions/Feed view if ambient RSS/newsletter browsing is later
  desired; and
- subtype filters such as web article, PDF, RSS/newsletter, without making each a
  new canonical media type.

**Recommendation:** ship Articles Archive plus Queue (Inbox and Later) first.
Preserve Feed comprehensively but keep it out of Queue; evaluate a Feed section
with realistic volume before adding it. Do not make shortlist or every Reader
location a permanent navigation element yet.

## Acquisition recommendation for Phase 1

1. Add a one-time full v3 sweep across all locations and categories. Retain exact
   pages, then reconcile by document ID.
2. Add a complete Tag LIST sweep in the same sync family when tag filtering is
   part of the Library query contract.
3. Add v2 export backfill and `updatedAfter` reconciliation with
   `includeDeleted=true`, retaining exact pages and joining Reader containers by
   verified `external_id`.
4. Add narrow source-owned projections for Reader current location, tags,
   progress/length facts, document notes, highlight containers, and highlights.
5. Add selective `withHtmlContent=true` acquisition behind an explicit private
   full-text policy. Keep signed raw-source URLs out of storage and logs.
6. Keep Archive projection rules compatible with the accepted canonical ledger;
   do not create Archive items for tweets, EPUBs, highlights, notes, or unknowns.
7. Extend product/API contracts only after the Library query and detail use cases
   are specified. This research intentionally does not select per-surface fields.

## Verification gaps and blockers

No blocker prevented the read-only Phase 1 field inventory. The following remain
unverified and must not be represented as facts:

- whether `updatedAfter` captures every location, tag, note, progress, content,
  and deletion-relevant change;
- page-cursor stability while the library mutates during a sweep;
- v3 document deletion visibility;
- webhook headers, secret verification, delivery IDs, occurrence timestamps,
  retries, ordering, and duplicate behavior;
- why the Reader API overview says highlight create/update/delete webhooks while
  the enumerated custom events currently name only highlight creation;
- exact semantics/units of attached-tag `created`;
- complete HTML and raw-source coverage by category, age, paywall, and license;
- live shapes for email, note, EPUB, shortlist, non-empty document notes, and
  non-empty v2 tag arrays;
- whether `last_moved_at` always refers to the transition into the current
  location; and
- exact create-side URL canonicalization and duplicate behavior.

Resolving webhook behavior requires a narrowly public test endpoint and changes
external account configuration, so it was outside this read-only pass. Resolving
raw-source content types requires downloading personal source bytes; this pass
verified only the presence and signed nature of sample URLs.

## Phase 1 conclusion

Readwise can support the agreed Articles Archive and Inbox/Later Queue, plus
Reader-sourced videos and podcasts in their own media types. The present
connector is sufficient only for current Archive projection and raw replay of
pages it happened to acquire. Production Library work needs a new all-location
snapshot, source-owned current-state details, v2 deletion-aware highlights, and
an explicit selective full-text policy.

The safest product interpretation is: Reader Archive is completion-like evidence,
not proof of fully reading; Inbox and Later are deliberate Queue states; Feed is
ambient subscription inventory; and mutable snapshots must not be presented as
a fabricated event history.
