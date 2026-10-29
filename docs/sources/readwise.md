# Readwise Reader Source Reconnaissance

- Status: production all-location documents and v2 highlights implemented;
  webhook/raw-source probes pending
- Last reviewed: 2026-09-20
- Coverage assessment: strong for current library state and queue mirroring; partial
  for historical consumption timestamps and deletions

## Purpose

This document records what Readwise's official public interfaces can provide to
the personal media ledger. It is intentionally based on published contracts,
not assumptions derived from the current Reader UI. The owner-account schema
probe is recorded below; webhook delivery and raw-source behavior remain to be
verified during implementation.

Official references:

- [Reader API](https://readwise.io/reader_api)
- [Readwise API](https://readwise.io/api_deets)
- [Readwise webhooks](https://docs.readwise.io/readwise/docs/webhooks)
- [Reader library configurations](https://docs.readwise.io/reader/guides/workflows/library-configuration)
- [Saving content to Reader](https://docs.readwise.io/reader/docs/saving-content)

## Source surfaces

### Reader Document API v3

The Reader API is the primary source for saved documents and their current
state:

| Operation       | Endpoint                               | Relevance                           |
| --------------- | -------------------------------------- | ----------------------------------- |
| Validate token  | `GET /api/v2/auth/`                    | Connection health                   |
| Create document | `POST /api/v3/save/`                   | Future Queue mirroring              |
| List documents  | `GET /api/v3/list/`                    | Full backfill and reconciliation    |
| Update document | `PATCH /api/v3/update/{document_id}/`  | Future Queue mirroring              |
| Bulk update     | `PATCH /api/v3/bulk_update/`           | Efficient Queue reconciliation      |
| Delete document | `DELETE /api/v3/delete/{document_id}/` | Available, but not needed initially |
| List tags       | `GET /api/v3/tags/`                    | Tag vocabulary and filtering        |

The list endpoint covers articles, emails, RSS entries, highlights, notes,
PDFs, EPUBs, tweets, and videos. Highlights and notes also appear as documents;
their `parent_id` links them to a parent document or highlight. The connector
must not normalize every top-level result as an article.

### Readwise API v2

Reader-created highlights also flow into the original Readwise data model. Its
`GET /api/v2/export/` endpoint can export all books/documents and highlights,
supports incremental `updatedAfter` filtering, and can include deletions with
`includeDeleted=true`. When a record's `source` is `reader`, the export's
`external_id` identifies the corresponding Reader object.

This is a complementary surface, not a replacement for the Reader Document API:

- Reader v3 owns document location, document metadata, notes, content, and
  reading timestamps.
- Readwise v2 has the clearest documented historical highlight and highlight
  deletion contract.

Highlights are not required to establish the first Archive import, but the
source shapes should be probed together so future evidence-backed search does
not require a disruptive remapping.

### Custom webhooks

Readwise account settings can send document and highlight events to a custom
HTTPS endpoint. Relevant documented Reader events are:

- `reader.any_document.created`
- `reader.feed_document.created`
- `reader.non_feed_document.created`
- `reader.document.tags_updated`
- `reader.document.finished`
- `reader.document.archived`
- `reader.document.moved_to_later`
- `reader.document.moved_to_inbox`
- `reader.document.shortlisted`
- `readwise.highlight.created`

The three creation events overlap in purpose. The connector should subscribe to
the broad `reader.any_document.created` event unless a probe shows that using
the feed/non-feed variants is necessary.

Webhooks should be treated as low-latency change notifications, not the sole
source of truth. Scheduled reconciliation remains necessary because the public
documentation does not define delivery order, retries, a delivery identifier,
or complete deletion coverage.

## Authentication and setup

For this personal application, a manually generated access token is sufficient.
The token is sent as:

```http
Authorization: Token <token>
```

The same token authenticates the Reader v3 and Readwise v2 APIs. A successful
`GET https://readwise.io/api/v2/auth/` returns `204` and is the appropriate
connection-validation request.

No credential is needed during schema reconnaissance. When a live probe is
approved, the owner should obtain the token from Readwise's access-token page
and enter it directly into ignored local secret storage. It must never be pasted
into chat, written to a fixture, logged, or committed.

Custom webhooks are configured in Readwise account settings. Readwise requires
the endpoint to pass a test request before the webhook can be created. The docs
say each webhook receives a generated 32-character secret and show that secret
inside the POST body. They also refer to “signature verification,” but do not
document a signature header or signing algorithm. The implementation must not
invent an HMAC scheme; the exact verification behavior must be confirmed during
the private webhook probe. The eventual webhook route will be a narrow public
Cloudflare Worker route outside Cloudflare Access.

## Historical data available

A request to the Reader list endpoint without filters returns documents from all
time, using cursor pagination. A backfill can retrieve:

- The complete currently-visible Reader document set
- Current library location and category
- Reader and original source URLs
- Title, author, source/site, summary, image, notes, and tags
- Published, saved, created, updated, opened, and last-moved timestamps
- Current reading progress and estimated reading/listening length
- Parent relationships for document-shaped highlights and notes
- Parsed HTML when `withHtmlContent=true`
- A temporary raw-source download URL when `withRawSourceUrl=true` and the
  source is distributable

The raw-source URL is documented as valid for one hour and may be empty for
non-distributable documents. It is sensitive, temporary evidence and must not be
logged. If the connector elects to retain the raw source, it must download it to
private R2 while the URL is valid and preserve its content type and checksum.
The default first probe should not download it.

The document API is a current-state snapshot, not an audit log. It does not
expose past location transitions or a historical “finished at” field. It also
does not document a way to include deleted Reader documents. The separate
Readwise highlight export can include deleted highlight records but does not
solve Reader document deletion history.

## Incremental synchronization and webhooks

The Reader list endpoint accepts `updatedAfter=<ISO 8601 instant>`. The official
example recommends a full initial export followed by requests for documents
updated since the previous pull. The connector should use this as a reconciliation
watermark, with a small overlap window so equality, clock, and retry boundaries
cannot drop a record.

Recommended flow:

1. Record the reconciliation window start before requesting the first page.
2. Request all pages with the prior durable `updatedAfter` watermark minus an
   overlap window.
3. Preserve every raw response page before normalizing it.
4. Upsert documents idempotently by Reader document `id`.
5. Commit all pages and normalized results.
6. Only then advance the durable checkpoint to the recorded window start.

Webhooks can trigger a prompt targeted refresh using the document `id`. The raw
webhook must be stored before processing, and duplicate deliveries must be safe.
Because the example payload has no delivery ID, an initial idempotency key can
combine the webhook type, entity ID, relevant source update timestamp, and a
hash of the exact body. This remains provisional until real payloads are seen.

The scheduled `updatedAfter` sweep is authoritative for creates, metadata edits,
tags, and movements. A periodic full enumeration may also be useful, but absent
IDs must not be interpreted as deletions until Reader's deletion behavior is
verified.

## Identifiers

| Identifier                       | Meaning                                                   | Proposed use                                            |
| -------------------------------- | --------------------------------------------------------- | ------------------------------------------------------- |
| Reader document `id`             | Stable Reader document identifier                         | Primary source identity                                 |
| Reader document `url`            | Reader-internal reading URL                               | Link back to Reader, not canonical media identity       |
| `source_url`                     | Original or source-specific URL                           | Candidate canonical URL and cross-source matching input |
| `parent_id`                      | Parent document/highlight ID                              | Preserve document hierarchy                             |
| Readwise `user_book_id`          | Readwise document/book container ID                       | Highlight-container source identity                     |
| Readwise export `external_id`    | Source-system reference; Reader link when `source=reader` | Join v2 highlight export to Reader where verified       |
| Readwise highlight `id`          | Readwise highlight identifier                             | Highlight source identity                               |
| Readwise highlight `external_id` | Upstream highlight reference when present                 | Preserve, but do not assume globally unique             |
| Tag `key`                        | Reader tag lookup/filter key                              | Stable source tag identity candidate                    |

`source_url` is useful for cross-source matching, especially for YouTube videos,
but URL normalization can be lossy and must not replace the Reader document ID.
The create endpoint calls `url` unique and returns `200` when a document already
exists, but exact canonicalization and duplicate behavior require a private
probe.

## Date meanings

The API states that returned dates are UTC unless otherwise noted. Preserve the
original strings and source precision during ingestion.

| Field                            | Published meaning or safe interpretation          | Canonical caution                                                                  |
| -------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `published_date`                 | When the source document was published            | Examples are date-only although create accepts an ISO datetime; preserve precision |
| `saved_at`                       | When the document was saved to Reader             | Good saved/queue evidence, not consumption time                                    |
| `created_at`                     | Reader record creation timestamp                  | Relationship to `saved_at` is undocumented                                         |
| `updated_at`                     | Latest Reader record update                       | Reconciliation signal, not a user activity time                                    |
| `first_opened_at`                | First time Reader recorded the document as opened | Opening is not completion                                                          |
| `last_opened_at`                 | Most recent Reader-recorded open                  | Opening is not completion                                                          |
| `last_moved_at`                  | Latest location movement                          | Chosen inferred consumption time for eligible archived media                       |
| Webhook receipt time             | When Imladris received an event                   | Ingestion time only unless the payload supplies a confirmed event time             |
| Highlight `highlighted_at`       | When the highlight was taken                      | May be absent according to the Readwise API                                        |
| Highlight `created_at`           | Readwise highlight creation time                  | Not necessarily the highlight occurrence time                                      |
| Highlight `updated_at`/`updated` | Latest highlight update                           | Incremental synchronization signal                                                 |

No list field is documented as the time a document was completed.

## Archive semantics

For this application, the owner has explicitly chosen a two-part admission rule:
the document must be in Reader Archive and represent an article, video, or
podcast. PDFs, RSS items, and newsletter-style emails count as articles. EPUBs,
tweets, personal notes, highlight-only documents, and other categories remain
preserved source evidence without becoming standalone Archive items.

Official Reader workflow documentation generally describes Archive as the
destination after finishing an item. It also documents moving an already-read
web article directly to Archive for posterity. This supports using current
`location=archive` as the historical Archive inclusion rule.

There are still important limits:

- `location` is current state, not a historical event stream.
- The API exposes no `finished_at` field.
- `last_moved_at` is used as an inferred consumption date for an eligible,
  currently archived item. Preserve the inference marker because Reader does not
  identify the particular location transition.
- `first_opened_at`, `last_opened_at`, and `reading_progress` must not be used to
  exclude archived items or manufacture completion events.
- `reader.document.finished` and `reader.document.archived` are distinct webhook
  types. For future changes, preserve the exact event type rather than collapsing
  the webhook evidence, even if both project into local Archive.

Archive membership is the canonical consumption state; it does not need a
separate completion field or fake progress history.

## Pagination and checkpoints

The Reader document list supports `limit` values from 1 through 100 and returns
`nextPageCursor`. The tag list and Readwise highlight export use the same
`nextPageCursor` pattern. A page cursor is only a continuation token within one
sweep; it is not the long-lived incremental checkpoint.

The durable synchronization checkpoint is the `updatedAfter` watermark. During
an active run, store enough run state to retry the current page safely, but do
not advance the durable watermark until every page in the window is preserved
and committed.

The private probe must determine whether a page cursor remains valid when records
change during pagination. Connector correctness must not depend on cursors being
durable across long pauses.

## Rate limits

Published per-token limits are:

| Endpoint                              | Limit                                            |
| ------------------------------------- | ------------------------------------------------ |
| Reader document create                | 50 requests/minute                               |
| Reader document list                  | 20 requests/minute                               |
| Reader document update                | 50 requests/minute                               |
| Reader bulk update                    | 20 requests/minute; at most 50 documents/request |
| Reader document delete                | 20 requests/minute                               |
| Reader tag list                       | 20 requests/minute                               |
| Readwise API default                  | 240 requests/minute                              |
| Readwise Highlight LIST and Book LIST | 20 requests/minute                               |

The Readwise highlight-export section does not publish its own override, so the
documented 240-request default appears to apply. The private probe should still
capture response headers rather than relying on that inference.

A `429 Too Many Requests` response includes `Retry-After`. The connector should
honor that value, add bounded jitter, and expose rate-limit delays rather than
reporting a sync failure prematurely.

## Queue and write-back capability

Reader's `later` location is a practical upstream mirror for the future local
Queue:

- Create a new document with `location: "later"`.
- Move an existing document with `PATCH` and `location: "later"`.
- Reconcile current upstream queue state with `GET /api/v3/list/?location=later`.
- Move up to 50 documents per bulk-update request.

The API warns that an unsupported location can be replaced by the user's default
location. A write must therefore be followed by a read or later reconciliation;
success status alone is not proof that the requested queue state stuck.

`shortlist` is accepted by the list filter but is omitted from the documented
create and update location values. Treat it as read-only until a live probe or
Readwise documentation establishes write support.

Moving a document to `archive` is supported, but the update API has no documented
“finished” field. Setting `seen=true` only controls opened timestamps. Queue
write-back should initially stop at add/move-to-Later and should not pretend it
can reproduce Reader's finished action.

Tags can be replaced by update, but the operation replaces the entire tag list
and can overwrite concurrent changes. Delete is also supported, but local queue
removal must not delete Reader documents. The local Queue remains authoritative;
conflict and removal semantics belong to the later queue-sync design.

## Representative response-field inventory

This inventory comes from official examples and query documentation. Fields are
provisional until they have been observed across the owner's categories.

### Reader list envelope

| Field            | Expected shape                   |
| ---------------- | -------------------------------- |
| `count`          | Number                           |
| `nextPageCursor` | String or null                   |
| `results`        | Array of Reader document objects |

### Reader document

| Group          | Fields                                                                                                         |
| -------------- | -------------------------------------------------------------------------------------------------------------- |
| Identity/links | `id`, `url`, `source_url`, optional `raw_source_url`, `parent_id`                                              |
| Description    | `title`, `author`, `source`, `site_name`, `summary`, `image_url`, `notes`                                      |
| Classification | `category`, `location`, `tags`                                                                                 |
| Size/content   | `word_count`, `reading_time`, `listening_time`, `reading_progress`, optional `html_content`                    |
| Dates          | `created_at`, `updated_at`, `published_date`, `saved_at`, `first_opened_at`, `last_opened_at`, `last_moved_at` |

Official webhook examples add `event_type`, `secret`, and a `content` field to a
document-shaped payload. Do not assume webhook and list objects have identical
schemas.

### Readwise highlight export

The export envelope has `count`, `nextPageCursor`, and `results`. Each result can
include `user_book_id`, `is_deleted`, title/author/source/category fields,
`source_url`, `external_id`, tags, note, and an embedded `highlights` array.
Representative highlight fields include `id`, `is_deleted`, `text`, `note`,
`location`, `location_type`, `highlighted_at`, `created_at`, `updated_at`,
`external_id`, `end_location`, `url`, `book_id`, tags, favorite/discard flags,
and `readwise_url`.

### Tags

The tag-list response returns tag `key` and display `name`. Reader document
examples represent attached tags as an object keyed by tag key, with nested name,
type, and created metadata. The probe must confirm this shape for manual and
generated tags.

## Production connector behavior

The implemented connector uses `GET /api/v3/list/` without a location filter.
The first run, and a reconciliation run at least every 24 hours, enumerates the
complete current document set at 100 records per page. Intervening runs use an
`updatedAfter` watermark with a five-minute overlap. Every exact response page
is stored in private R2 before parsing, and the durable cursor advances only
after the source records and rebuilt projection commit successfully.

Reader documents are authoritative for current Inbox, Later, Shortlist, Feed,
and other Reader state. Generic `queue_entries` are a read-only, provenance-
bearing projection for current Inbox, Later, and Shortlist membership. Moving a
document out of those locations retires that Queue relationship; moving it out
of Archive does not erase an already admitted Archive occurrence.

Each document response supplies its attached tag dictionary. The connector
stores that vocabulary and each document/tag relationship while processing the
document page; the independent tag-list endpoint is not required for the
approved user-visible surface because tags are inspector facts, not a
collection facet.

Every document reconciliation also reads the v2 export with
`includeDeleted=true`. A container links to a Reader document only when
`source=reader` and its `external_id` exactly matches the Reader document ID.
Deleted or discarded highlight text is not retained in normalized highlight or
search rows; deletion/discard state and raw evidence remain available.

Parsed HTML acquisition is implemented as a separate durable queue path for
Archive and Queue documents. A job requests one exact document with
`withHtmlContent=true`, stores the returned HTML plus extracted plain text in
private R2, and indexes bounded chunks in contentless D1 FTS. Feed-only items
are excluded. The ordinary document sync does not request article bodies, so a
failed or absent content job cannot remove metadata results. Temporary
`raw_source_url` downloads remain out of scope.

## Private payload observation

A read-only owner-account probe on 2026-07-18 authenticated successfully and
confirmed:

- `768` current Reader documents overall;
- `67` Archive documents: `43` articles, `10` RSS items, `7` videos, `3` PDFs,
  `3` tweets, and `1` podcast;
- `63` Later documents: `46` articles, `14` PDFs, and `3` videos;
- `last_moved_at` was present on every Archive document, spanning
  `2025-12-25` through `2026-07-01`, while three Archive documents had never
  been opened according to `first_opened_at`;
- `last_moved_at` and `updated_at` were distinct on every probed Archive row,
  reinforcing that update time must not be used as completion time;
- `podcast` is a real Reader category in this account even though earlier
  published category lists omitted it;
- `reading_time` and `listening_time` arrive as nullable strings, while
  `word_count` is a nullable number and `reading_progress` is a number;
- tags are a dictionary keyed by the tag value, whose child object contains
  `name`, `type`, and numeric `created` fields;
- requesting `withHtmlContent=true` returned non-null `html_content` for all ten
  sampled Archive documents; and
- Readwise v2 returned `17` highlights across `10` Reader-linked containers,
  including one deleted highlight. All ten containers had `source=reader` plus
  an `external_id` join candidate.

The v2 envelope's `count` was `17` while `results` contained ten containers, so
its count represents highlights rather than top-level result rows in this
sample. Pagination code must use `nextPageCursor`, not infer completion from the
count/results relationship.

Under the owner's workflow, eligible category plus Archive location is
sufficient admission evidence. Of the 67 observed Archive documents, 64 have an
eligible category: 43 articles, 10 RSS items, 7 videos, 3 PDFs, and 1 podcast.
The 3 tweets remain source evidence only. `last_moved_at` is available as an
inferred consumption timestamp for all current Archive items, but the API still
does not prove which location transition that timestamp represents. Preserve it
as inferred rather than an exact finished-at fact.

A complete production-shape reconciliation on 2026-09-20 observed 1,021
documents across 11 pages. The resulting eligible Article sections contained
72 retained Archive items, 178 current Queue items, and 666 Feed items. Queue
contained 45 articles and 14 PDFs in Later plus 105 articles, 6 PDFs, and 8 RSS
items in Inbox; no eligible item overlapped Archive and Queue or Archive and
Feed at that instant. Two documents had a null location, which the connector
preserves as unknown rather than rejecting or guessing.

The same run observed 16 v2 highlight containers and 26 highlights. Fifteen
containers joined exactly to Reader documents. Nineteen highlights were active
and seven were deleted; 18 active highlights projected onto 12 eligible
Articles. One active highlight remained unlinked because the export did not
provide a verified Reader-document match. A ten-document HTML sample continued
to return content for all ten requests. These are dated account observations,
not permanent product assumptions.

## Remaining private probe plan

The completed probe covered auth, field/type/nullability summaries, Archive and
Later samples, HTML availability, and the v2 highlight join. Remaining work:

1. Request `withRawSourceUrl=true` for a minimal sample but do not download it.
   Record whether a URL is present, its host, expiry behavior, and content-type
   expectations without retaining the signed query string.
2. Verify page-cursor behavior during a complete paginated sweep while records
   may be changing.
3. Create synthetic fixtures by hand from the field matrix; never sanitize a
   real payload merely by replacing obvious names.
4. Later, after a public Worker endpoint exists, send Readwise's test webhook to
   it and inspect raw headers, body shape, secret verification, and retry behavior.
5. Test whether a deleted Reader document is visible to polling or any webhook.

## Unknowns to resolve

- Whether `last_moved_at` reliably captures the transition into the current
  Archive location and whether “finish” changes the same timestamp; this does
  not block its approved use as an explicitly inferred consumption time
- Whether `reader.document.finished` carries an event occurrence timestamp in
  real payloads or only the document snapshot
- Whether `updatedAfter` captures every location, tag, note, content, and progress
  change expected from the UI
- Whether deleted Reader documents can be detected through polling or an
  undocumented/documented-later webhook
- Webhook delivery IDs, retry policy, ordering, timeout, duplicate behavior, and
  the exact secret/signature verification mechanism
- The apparent difference between the webhook overview's mention of highlight
  create/update/delete and the current event list, which names only
  `readwise.highlight.created`
- How stable page cursors are while the library changes during a sweep
- Whether HTML and raw source are available for paywalled articles, PDFs, EPUBs,
  emails, videos, and older imports
- Exact URL canonicalization and duplicate behavior for create requests
- Whether `shortlist` can be written despite being omitted from documented create
  and update values
- The owner's actual Reader library configuration and how often documents move
  between locations after entering Archive

## Recommended next action

Use the shipped all-location reconciliation, completed owner-authorized initial
selective-content run, and Articles surface as the operational baseline. The
initial run acquired and indexed all 250 currently eligible Archive/Queue
documents. Later syncs enqueue only new, changed, failed-recoverable, or
provenance-incomplete eligible content. Webhook delivery and temporary
raw-source downloads remain deferred until their authentication, delivery, and
retention behavior is needed and can be probed directly.

## Hosted article-content processing, October 29, 2026

The ordinary hourly scheduler can reserve at most 20 eligible current Archive
or Queue article targets per call, paced at ten acquisitions per minute. The
repository enforces three acquisition attempts per source version and excludes
completed, permanently unavailable, non-text, or oversized content. New source
versions remain eligible without discarding older source evidence. Duplicate
completed/exhausted queue deliveries do not fetch again; queued old-version
acquisitions cannot fetch the current document under an old version's key.
Responses are capped at 8 MiB per delivery, HTML/extracted index objects at
4 MiB, and indexing continues in 12-chunk batches with current-version publication
checks. Full Reader Feed acquisition remains excluded.

The [Reader API](https://readwise.io/reader_api), rechecked October 29, documents
20 list requests/minute per token, exact `id` filtering, `withHtmlContent=true`,
and 429 `Retry-After`. Existing short in-process retries remain bounded; longer
backoff returns to queue recovery. See the
[catalog/content operations policy](../planning/catalog-operations.md) for
activation, emergency-stop integration and acceptance checks.
