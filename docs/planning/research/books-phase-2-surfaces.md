# Books Phase 2 surface specification

- Date: 2026-09-20
- Status: Owner-approved implementation contract; no behavior described here is shipped
- Scope: Books Archive and Hardcover Queue surfaces only
- Source of truth: the accepted Phase 1 decision register, the 2026-09-19
  authenticated Hardcover field inventory, and the canonical ledger

## Outcome

Books uses one work-level item across two local views:

1. **Archive** for Hardcover Read relationships;
2. **Queue** for current Want to Read and Currently Reading relationships until
   completion.

Archive and Queue remain independent when the upstream relationships support
both. There is no All or Reading view and no Reading badge.

Archive and Queue both support a sparse cover grid and a Readwise-style compact
list. Grid is the default; the list carries denser date, publication, and rating
context. The list/grid choice persists per Books view.

The shared compact inspector has **Details** and **History** tabs. It is the only
book-detail level. Opening it must not replace the collection, reset its query,
or create a separate full-page book route.

## Governing decisions and evidence boundary

This specification applies the approved Phase 1 choices `X1-B`, `X2-B`,
`X3-B`, `X4-recommended`, `X5-recommended`, `B1-A`, `B2-C`, `B3-B`, `B4-B`,
and `B6-B`. It resolves the previously deferred `B5` field-placement decision.

The verified Hardcover evidence is sufficient for the choices below:

- A full authenticated snapshot returned work, current-edition, child-read,
  contributor, series, cached taxonomy, personal-rating, community-rating,
  progress, ownership, and journal shapes.
- The owner library contained 984 Want to Read, two Currently Reading, and 128
  Read relationships on 2026-09-19. Queue therefore needs bounded server-side
  queries rather than a client-only projection.
- Work description, pages, image, community rating, and release fields are
  common but nullable. Current-edition identifiers are common; format strings
  are noisy, while `reading_format_id` and `reading_format.format` are the
  reliable coarse format source.
- Finished child reads are date-only and can name a consumed edition. A declared
  `read_count` can exceed the number of child reads, so it is not an occurrence
  generator.
- The current production connector does not request most of these fields.
  Exact retained Read-page bytes cannot recover unselected GraphQL fields.

No browse or detail request may call Hardcover or parse R2. Every displayed,
searched, filtered, or sorted fact must already have a validated D1 projection.

### Delivery labels

The field matrices use these labels:

- **Required**: required for the complete initial Books slice. A missing value
  on an individual record is allowed, but the acquisition and projection path
  must exist.
- **Optional enrichment**: supported by the contract and shown only when a
  refreshable value exists. Its failure never hides a local item or blocks the
  Books slice.
- **Deferred**: deliberately neither acquired for display nor shown initially.

## Shared collection behavior

### Layout and density

- Archive and Queue use an artwork-led grid with a 2:3 cover area, an
  approximately 9–10rem card width, and enough columns to use the workspace.
  Each grid card contains only cover, title, and primary author display. Titles
  may occupy two lines; author text is single-line and ellipsized with the full
  value available to assistive technology and hover.
- The list uses one row per work with a small 2:3 thumbnail and Book/author,
  optional Series, Published, and view-context columns. The Archive context is
  latest-read date plus personal rating; Queue context is the source-added date.
  The Series column is omitted for the whole result set when no row has series
  metadata.
- Artwork supplies the dominant color. Status, rating, and format use neutral
  text or small neutral marks. Do not place multiple colored badges or action
  toolbars on cards.
- Clicking anywhere on a card or row selects it. Source links and inspector
  controls remain separate keyboard targets.

### Work identity and artwork

One card represents one Hardcover work regardless of edition count. Collection
artwork is stable across filters and uses this order:

1. work `cached_image`/work image;
2. the role-labeled default-cover edition image;
3. the current selected edition image; and
4. a local neutral book-shaped placeholder.

A filtered Archive result does not swap its collection cover to the consumed
edition. The latest supported read names and, when useful, shows its consumed
edition in History. The selected-edition and consumed-edition images
retain their roles in the detail projection so a future correction does not
turn a fallback into an imported fact.

### Contributor display

Compact identity uses work-level primary authors only:

- one author: full name;
- two authors: both names joined with “and”;
- more than two: first two names followed by “+N”; and
- no verified author: the UI-only phrase **Author unavailable**.

The database retains ordered contributor identities and roles. Narrators,
translators, editors, illustrators, afterword authors, and cover artists never
become the work's primary-author string. They appear in the inspector under the
work or exact edition to which Hardcover attached them.

### Search

The Books search box is scoped to the active Books view and searches the whole
matching server-side collection, not loaded pages. Its placeholder is **Search
title, author, series, or ISBN**.

Search targets, in priority order, are:

1. work title and subtitle;
2. work-level author and other contributor names;
3. edition-level contributor names, including narrators and translators;
4. series names; and
5. normalized ISBN-13, ISBN-10, and ASIN values from every known edition.

Text matching is case-insensitive and Unicode-aware. Multiple text tokens use
AND semantics; prefix matching applies to the final token. Identifier matching
also compares a version with spaces and hyphens removed. Description, personal
review, community tags, content warnings, and raw source text are not search
targets, so a result never appears for invisible or sensitive prose.

### Shared facets

The following facets can appear in both views:

| Filter | Exact options                                                    | Source and match rule                                                                                                                                                                                            |
| ------ | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Format | Any; Physical; Ebook; Audiobook; Edition unknown                 | Normalized `reading_format` only. Archive uses the latest supported read's consumed edition. Queue uses the current selected edition. “Edition unknown” includes a missing edition or missing normalized format. |
| Series | Any; one or more projected series; Not in a series               | Exact Hardcover series identity. Selecting multiple series uses OR within the facet and AND across facets.                                                                                                       |
| Genre  | Any; one or more normalized community genre terms; No genre data | Hardcover cached `Genre` terms only. Multiple genres use OR within the facet and AND across facets. The control is labeled **Genre**, with source disclosure in the inspector.                                   |

Facet values are server-provided, alphabetized, searchable after ten values,
and include counts after applying the other active predicates while excluding
their own facet. A facet control is hidden when its projection has no values
and there is no active URL value for it. An obsolete deep-linked value remains
visible as unavailable and can be cleared; it must not silently broaden the
query.

## Archive

### Card fields, in priority order

1. Work cover using the shared fallback order. **Required.**
2. Work title, with subtitle omitted from the card. **Required.**
3. Primary work author display. **Required.**

The grid card does not show date, format, rating, series, status, description,
community metadata, ISBN, publisher, or read-count discrepancy. In list view,
the context column uses the latest supported read's finished date and the
relationship-level personal rating when present.

Date text is **Read Sep 12, 2026**, **Read 2026** for lower precision if later
sources provide it, or **Read — date unavailable**. Hardcover child dates are
currently day precision and render without timezone conversion. A format suffix
is factual, for example **· Audiobook**. It is omitted when the consumed edition
is unknown; a default or current edition is never borrowed into this line.

### Archive-only filters

| Filter          | Exact options                                              | Semantics                                                                                                                                                       |
| --------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Finished        | Any time; Custom range; Date unavailable                   | An inclusive date-only range matches the latest supported read. “Date unavailable” matches when that reference read is undated. A range excludes unknown dates. |
| Published       | Any time; Custom range; Date unavailable                   | Work release temporal value with retained precision.                                                                                                            |
| Personal rating | Any rating; Rated; Unrated; At least 0.5, 1.0, 1.5, …, 5.0 | Relationship-level `user_books.rating`. A source value of `0` is still rated and is returned by “Rated,” but it does not satisfy a positive minimum.            |

Format and Finished both use the latest supported read. Older reads never become
the collection reference merely to satisfy a combination of filters; they
remain available in History. Series, Genre, Published, rating, and search apply
at work/relationship level.

### Archive sorts

| Label           | Direction            | Key                                  | Default |
| --------------- | -------------------- | ------------------------------------ | ------- |
| Recently read   | Descending           | latest supported read                | Yes     |
| Earliest read   | Ascending            | latest supported read                | No      |
| Title           | A–Z or Z–A           | normalized work title                | No      |
| Author          | A–Z or Z–A           | normalized first primary-author name | No      |
| Personal rating | High–low or low–high | relationship rating                  | No      |
| Published       | Newest or oldest     | work release date/year               | No      |

Unknown sort values always follow known values in both directions. Title and
media-item ID are final stable tie-breakers. Under Title, Author, Rating, or
Published sorts, the list still displays the latest supported read.

### Archive counts

The view header shows **N books · M supported reads**. `N` is the distinct work
count after all filters. `M` is the lifetime count of active supported Archive
occurrences for those works. It includes evidence-backed undated fallbacks and
never expands to Hardcover's declared `read_count`.

The navigation badge is the unfiltered distinct Archive work count. A work
that is also in Queue is independently counted in each view.

## Queue

Queue contains active Hardcover Want to Read (`status_id = 1`) and Currently
Reading (`status_id = 2`) relationships. Both express unfinished intent in this
product; no separate Reading surface or badge is shown. A supported completed
read moves the relationship into Archive when a successful source snapshot
reports it as Read.

### Card fields, in priority order

1. Work cover using the shared fallback order. **Required.**
2. Work title. **Required.**
3. Primary work author display. **Required.**

`date_added` appears only in list view as **Added to Hardcover**; it may predate
the current status transition. Queue cards do not show format, progress,
personal/community ratings, or the upstream status.

### Queue-only filter

| Filter             | Exact options                            | Semantics                                                                                                         |
| ------------------ | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Added to Hardcover | Any time; Custom range; Date unavailable | Inclusive comparison against source `user_books.date_added`. It is a relationship date, never a consumption date. |
| Published          | Any time; Custom range; Date unavailable | Work release temporal value with retained precision.                                                              |

Queue also supports the shared Format, Series, and Genre facets.

### Queue sorts

| Label              | Direction        | Key                                  | Default |
| ------------------ | ---------------- | ------------------------------------ | ------- |
| Added to Hardcover | Newest or oldest | `date_added`                         | Newest  |
| Title              | A–Z or Z–A       | normalized work title                | No      |
| Author             | A–Z or Z–A       | normalized first primary-author name | No      |
| Published          | Newest or oldest | work release date/year               | No      |

Unknown sort values remain last. The view header and navigation badge each show
distinct active Queue work counts; the header count applies current
filters. Queue never shows a read-occurrence count.

## Inspector

The inspector is approximately 24–28rem wide, independently scrollable, and
keeps the collection visible. Its header remains above the tabs and contains:

1. stable work artwork;
2. work title and subtitle;
3. primary authors; and
4. factual product membership labels only when useful: **Archive** and
   **Queue**. Multiple labels may coexist.

Missing labels do not imply negative history. The header has no edit, playback,
rating, add-to-queue, or overflow action in this read-only delivery.

### Details tab

Sections appear in this order and are omitted when every field in the section
is absent.

#### 1. Overview

- description;
- original work release date/year with retained precision;
- work page count or work audio duration, labeled **Work metadata** so it is not
  confused with an edition; and
- source-backed work type only if Hardcover later exposes a stable, useful
  label. Numeric literary/category IDs are never shown.

Headline, alternative titles, recommendation caches, similar-book IDs, and raw
catalog links are not shown initially.

#### 2. Series

Series is Hardcover's source-provided sequence metadata: a named sequence and
the work's exact position within it. Show every series link, not only
`featured_book_series`, and omit the section when none exists. Use the featured
link only to order the section first. A series name may link to the current Books
query with that exact series filter; it does not create a separate series page.

#### 3. Contributors

List work contributors grouped as Authors, then named Hardcover roles in source
order. Do not display personal demographic fields, locations, popularity
counts, bios, or external author identifiers in this initial inspector.

#### 4. Selected edition

This is `user_books.edition_id`, explicitly labeled **Selected edition** rather
than **Edition read**. Fields appear in this order:

1. normalized format;
2. edition title/information when it differs from the work;
3. edition pages or audio duration;
4. publisher;
5. edition release date;
6. language, then country;
7. ISBN-13, ISBN-10, and ASIN; and
8. edition-specific contributors grouped by role.

Blank/noisy `edition_format` values are not displayed as format. The raw value
may be retained for provenance, but coarse presentation uses the verified
`reading_format` relationship. ISBN validity fields govern whether an ISBN is
presented as valid; invalid values stay in source evidence.

#### 5. Hardcover community

This section resolves the Phase 1 community/taxonomy question:

- **Community rating** and `ratings_count` are optional enrichment and appear
  together as **Hardcover community: X/5 · N ratings**. They never appear on a
  card or drive a filter or sort.
- **Genres** are optional enrichment, appear as source-labeled terms, and power
  the Genre facet.
- **Moods** and **Pace** are optional enrichment shown here only. They do not
  drive initial filters or search.
- **Content warnings** are optional enrichment behind a collapsed **Show
  Hardcover community content warnings** disclosure. Do not show vote counts,
  spoiler ratios, or warnings on collection cards.
- cached **Group** and generic **Tag** categories are deferred. Raw community
  taggings, user IDs, mappings, and voting details are not acquired for UI.
- ratings distribution, users/readers, reviews, activities, journals, lists,
  prompts, and edition-user counts are deferred.

All fields in this section are mutable catalog/community metadata with an
acquisition timestamp. They are never labeled as the owner's genres, moods,
warnings, or rating.

#### 6. Source

The final collapsed section contains:

- link to the Hardcover work when a validated canonical URL can be constructed
  or acquired;
- Hardcover work ID and current user-book relationship ID;
- last successful relationship snapshot time;
- catalog/community metadata acquisition time when present;
- source coverage or stale/unavailable enrichment state; and
- current upstream state plus any retained merge/canonical identity note.

Edition IDs, ISBNs, and ASINs stay in Selected edition or a History edition
disclosure rather than becoming a provenance dump here. Raw-object keys,
internal ULIDs, parser paths, and ingestion timestamps are available to
diagnostics but not shown in the ordinary inspector.

### History tab

History owns all personal activity rather than a separate **Your book** Details
section. It starts with current/source status, product memberships, **Added to
Hardcover**, personal rating/review, and interpretable progress/started date when
present. These relationship-level facts appear once and are not copied onto
individual read occurrences.

It then provides a factual read summary:

- when declared and supported counts agree: **N supported read(s)**;
- when Hardcover declares more reads than have individual child rows:
  **Hardcover reports N reads; M have individual records**; and
- for a Read relationship with only the fallback occurrence: **Read status is
  available, but Hardcover did not provide an individual read record**.

The list then shows active supported history newest first, with unknown dates
last. Each occurrence includes, in order:

1. **Finished** date or **Finished date unavailable**;
2. **Started** date when present;
3. consumed-edition normalized format and title/information when the child row
   supplies an edition identity;
4. an expandable edition disclosure with cover, pages/duration, publisher,
   release date, language/country, ISBN/ASIN, and edition contributors; and
5. a neutral **Matches current filters** marker when that occurrence caused the
   selected Archive row to match.

An undated fallback never borrows the current or a default edition; it says
**Edition not identified**. A default-cover or format-default edition is never
presented as consumed.

If an active child read exists, its started date and interpretable progress
appear as personal activity without creating a Reading view or badge. It is not
counted as an Archive occurrence until the accepted Hardcover admission rule
does so. Paused or removed child observations remain provenance, not ordinary
active history.

Superseded undated fallbacks and removed observations do not inflate visible
counts. The Source section can disclose that retained evidence exists; the
initial inspector does not add an administrative “all raw states” timeline.

History is keyset-paginated 20 rows at a time with **Load older history**. The
first page may be included with detail, but subsequent pages use a dedicated
endpoint. Reading journals, journal text, private notes, and quote/note activity
are deferred: current live evidence is sparse, journals require a separate
private scope, and they duplicate many current relationship facts. Their
absence must not create an empty Notes section.

## Date and rating rules

### Dates

- Hardcover child `started_at` and `finished_at` are date-only facts. Compare
  ISO calendar dates inclusively and render in the user's locale without UTC
  conversion.
- Preserve the raw `finished_at_precision` integer/string but do not map its
  observed value `1` to a named precision until Hardcover documents it or a
  controlled UI probe verifies it.
- `date_added` is only **Added to Hardcover**.
- `created_at`, `updated_at`, `reviewed_at`, journal `action_at`, source-recorded
  time, and ingestion time never substitute for a missing read/start date.
- Archive occurrence-scoped filters and the Recently/Earliest sort use the
  latest supported read. Older reads remain in History and never replace the
  reference read merely to satisfy a filter.

### Ratings

- Personal rating is the current `user_books.rating`, retained on its original
  0–5 scale including half steps. It is work-relationship data, not an
  occurrence rating.
- A non-null source value of `0` is preserved and displayed as `0/5`; `null`
  alone means unrated.
- Community rating is a separately labeled work-catalog aggregate. It never
  fills a missing personal rating, and personal rating never fills community
  rating.
- No rating is converted to a percentage. Neutral stars may visualize a value
  only when the numeric `X/5` remains accessible.

## Required acquisition and optional enrichment

### Required for the initial Books slice

1. Complete, replay-safe owner `user_books` snapshots covering at least status
   IDs 1, 2, and 3, with status, current edition, `date_added`, `read_count`,
   rating, normalized review/spoiler state, current progress fields, and child
   reads.
2. Work title, subtitle, description, release date/year, work pages/audio
   duration, work image, and enough catalog timestamp/identity data to refresh
   safely.
3. Structured work contributors with stable author and role identities.
4. Current selected-edition detail and every child-read consumed edition,
   fetched by exact ID. Include reading format, image, pages/audio duration,
   publisher, release date, language, country, valid ISBNs/ASIN, and edition
   contributors.
5. Default-cover edition identity and image for the explicit artwork fallback.
   Physical/ebook/audio default identities may be retained, but are not needed
   for collection or history claims.
6. Every work-series membership needed by display, search, and the Series facet.
7. Source-owned relationship and read projections for status, declared count,
   progress, dates, and edition role. These facts must not be reconstructed by
   reparsing canonical occurrences at request time.

### Optional enrichment

- work community rating plus rating count;
- cached community Genre, Mood, Pace, and Content Warning categories; and
- a validated Hardcover work URL if the API supplies or the connector can
  construct one from a verified slug contract.

Optional enrichment is acquired in refreshable catalog snapshots with source
and fetched time. It can disappear or become stale without removing the local
item. Genre filtering is available only when genre enrichment has been
projected; a provider failure leaves search and the required facets usable.

### Deferred

- raw community taggings and mapping/debug rows;
- ownership UI (all 1,114 observed rows were false/zero), while retaining the
  source fact if it is already acquired;
- reading journals, journal entry text, private notes, quotes, and activity
  timelines;
- community distribution and popularity counters beyond rating count;
- alternative titles, recommendation/similar-book caches, prompts, lists, and
  social relationships; and
- manual edits, write-back, local Queue mutation, and edition switching.

## Missing, stale, and empty states

| Condition                                         | Required presentation                                                                                                                                  |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Missing work title                                | Display **Untitled book** as a UI fallback; never persist it as source title.                                                                          |
| Missing cover                                     | Use the neutral local placeholder; do not borrow an unrelated edition or external image.                                                               |
| Missing author                                    | Display **Author unavailable** in collection identity; omit an empty Contributors section.                                                             |
| Missing read date                                 | Display **Read — date unavailable** and include only in Any time or Date unavailable.                                                                  |
| Missing consumed edition                          | Display **Edition not identified** on that occurrence.                                                                                                 |
| Missing selected edition                          | Omit Selected edition and match “Edition unknown” for Queue format filtering.                                                                          |
| Missing description/rating/series/category/review | Omit that field or section; do not display empty labels, zero ratings, or “No description.”                                                            |
| Catalog/community refresh failed                  | Continue rendering required local relationship and history facts; disclose **Hardcover details unavailable** or stale acquisition time only in Source. |
| Work removed/merged upstream                      | Preserve Archive and evidence. Retire Queue membership only after a successful complete snapshot; show canonical/merge note in Source.                 |
| Partial or failed snapshot                        | Do not infer membership removal. Existing projections remain visible and Connections reports the degraded sync.                                        |
| Empty view                                        | **No books in Archive** or **No books in Queue**. No decorative explanation.                                                                           |
| No filtered results                               | **No books match these filters** with a single **Clear filters** action.                                                                               |
| Collection request failed                         | Keep the shell and controls, show **Books could not be loaded**, and provide Retry.                                                                    |
| Detail request failed                             | Keep selection and collection context, show **Book details could not be loaded**, and provide Retry/Close.                                             |

If filters change while an inspected item no longer matches, keep the inspector
open and show **Not in current results**. Closing it returns focus to its prior
trigger when that trigger still exists; otherwise focus returns to the results
heading.

## URL, selection, and navigation state

The canonical routes are:

```text
/library/books/archive
/library/books/queue
```

The following state is URL-addressable:

- `q`;
- view-appropriate date mode and inclusive `from`/`to` values;
- publication-date mode and inclusive bounds;
- repeated `format`, `series`, and `genre` values;
- Archive personal-rating state/minimum;
- `layout=grid|list`, `sort`, and `direction`; and
- selected `item=<media-item-id>`.

Unknown or invalid query values produce a safe validation error and a clearable
control; they are not silently interpreted as another filter. Opening an item
pushes `item` into browser history. Closing it removes `item` with Back-equivalent
behavior. Back/Forward restores view, query, filters, sort, selection, scroll
anchor, and already loaded pages for that history entry.

Appearance and sidebar-collapse preference are persisted independently and are
not Library URL parameters. Opaque collection/history cursors and raw scroll
offsets are session navigation state rather than shareable URL state. Refreshing
a deep link loads the first collection page and the selected item directly;
selection must not depend on that item being present in the first page.

Rapid selection cancels or ignores stale detail responses. A response for book
A must never render under book B's selected header.

## Pagination and consistency

- Archive and Queue request 48 works initially and per **Load more** action.
- History requests 20 rows initially and per **Load older history** action.
- All collection and history pagination is server-side keyset pagination with
  an opaque, versioned cursor containing the active sort tuple and stable ID.
- Counts and facets use the exact predicates applied to the result set and
  describe the whole match, not loaded pages.
- Unknown values sort last before the stable title/ID tie-breaker.
- Refresh after a write/sync starts again from the first page. The API does not
  promise a frozen snapshot across pages; cursors are replay-safe positions in
  a live collection.

The UI may prefetch the next page, but it does not auto-fetch an unbounded
collection. Loading, end-of-results, and retry states remain explicit and
keyboard accessible.

## API contract

Do not overload the current Archive-only `GET /api/media` response with raw
Hardcover details. Add Books Library contracts whose schemas live in
`packages/contracts` and whose routes remain thin.

### `GET /api/library/books`

Required query fields:

```text
view=archive|queue
q=<string>
limit=<1..60>
cursor=<opaque>
dateMode=any|range|unknown
from=YYYY-MM-DD
to=YYYY-MM-DD
publishedMode=any|range|unknown
publishedFrom=YYYY-MM-DD
publishedTo=YYYY-MM-DD
format=physical|ebook|audiobook|unknown        (repeatable)
series=<Hardcover series identity>             (repeatable)
genre=<normalized Hardcover genre identity>    (repeatable)
ratingState=any|rated|unrated                   (Archive only)
ratingMin=0.5|1|1.5|...|5                      (Archive only)
sort=<view-specific enum>
direction=asc|desc
```

For Archive, `dateMode` means the latest supported read's finished date. For
Queue, it means Added to Hardcover. Reject incompatible parameters instead of
ignoring them.

The response contains:

```text
data[]
  mediaItemId, title, subtitle
  cover { url, sourceRole } | null
  primaryAuthors[] { id, name }
  memberships { archive, queue }
  contextDate { kind, value, precision, basis } | null
  contextualFormat | null
  publicationDate { value, precision } | null
  seriesSummary { name, position } | null
  personalRating { value, minimum: 0, maximum: 5 } | null
nextCursor
counts { archiveItems, queueItems, filteredItems, supportedReads }
facets { formats[], series[], genres[] }
```

`supportedReads` is nullable outside Archive. Facet entries contain stable
identity, label, and count. Cover `sourceRole` is internal contract metadata for
traceability; the card does not print it.

### `GET /api/library/books/:mediaItemId`

This endpoint resolves work details for an Archive or Queue-only item. It
returns:

- header identity and resolved artwork role;
- both product membership booleans and the source Hardcover status for History;
- personal relationship facts, declared read count, and current progress;
- work overview;
- ordered work contributors;
- all series memberships;
- current selected edition and role-labeled edition detail;
- optional community snapshot with acquisition time;
- source link, coverage, last relationship snapshot, catalog freshness, and
  merge/current upstream state; and
- the first History page plus `historyNextCursor`.

A missing active Archive entry must not produce `404` for a valid Queue
item. Return `404` only when no active or retained Books projection exists for
that media item.

### `GET /api/library/books/:mediaItemId/history`

Required query fields are `limit` (maximum 50), `cursor`, and optional Archive
occurrence filter context (`dateMode`, `from`, `to`, repeated `format`) used only
to mark `matchesCurrentFilters`. The endpoint always returns complete active
history, not only matching history.

Each row returns read identity, active/fallback kind, started/finished temporal
values, consumed-edition detail, progress for the current child read when
applicable, and `matchesCurrentFilters`. Removed/superseded evidence is excluded
from ordinary rows and counts.

## Projection and storage requirements

The implementation may choose final SQL names, but it must provide these
separate, queryable projections rather than JSON blobs parsed in API handlers:

1. **Hardcover relationship projection** — one current row per connection and
   `user_book_id`, linking the work media item and current edition identity;
   status, `date_added`, `read_count`, rating/review/spoiler state, active/removed
   state, and last complete snapshot.
2. **Hardcover child-read projection** — one row per stable child-read ID with
   relationship, Archive entry when admitted, consumed edition identity,
   started/paused/finished day values, raw finished-precision value, progress
   fields, and upstream state.
3. **Book work catalog projection** — work description, image role, pages/audio,
   release temporal value, and source catalog update/acquisition time. Common
   canonical fields may be reused, but source-specific roles and freshness must
   remain recoverable.
4. **Book edition projection** — exact edition identity and work, normalized
   reading format plus raw display evidence, bibliographic fields, image,
   contributors, acquisition time, and validity state for identifiers.
5. **Edition-role projection** — current selected, default cover, default
   physical, default ebook, and default audio roles. Consumed edition remains on
   the occurrence/read and is not another mutable work default.
6. **Contributor projection** — stable Hardcover author/contribution identities,
   work-or-edition target, role, primary flag, and source order.
7. **Series projection** — stable series and work membership, exact numeric
   position, featured/compilation flags, details, and source order.
8. **Optional community snapshot projection** — only the approved rating/count
   and normalized Genre/Mood/Pace/Content Warning terms, with source and fetched
   time. Do not copy all mutable Hardcover counters into immutable evidence.
9. **Books search projection** — D1 FTS5 columns for title, subtitle,
   contributors, and series, plus normalized indexed identifier values for ISBN
   and ASIN lookup. Application-owned refresh must be transactionally consistent
   with the relational projections.

Queue membership changes are source current state. Retire it only
after a successful complete account snapshot establishes absence or changed
status. Never cascade their retirement into Archive deletion. All writes remain
idempotent and retain source-record lineage.

### Required indexes

At minimum, add indexes that support the exact keyset and facet paths:

- active Hardcover relationship by `(connection_id, status_id,
date_added DESC, media_item_id)`;
- work relationship by `(media_item_id, upstream_state)`;
- Archive occurrence browse by `(upstream_state, consumed_at_value DESC,
media_item_id, id)` and child read by `(user_book_id, finished_at DESC, id)`;
- personal rating by `(status_id, rating_value DESC, media_item_id)`;
- normalized work title and primary-author sort keys with `media_item_id` as the
  final tie-breaker;
- work release date/year with `media_item_id`;
- edition by `(media_item_id, normalized_format, external_identity_id)`;
- edition role unique on `(media_item_id, role)` where a role is singular;
- contributor by target and source order, plus author identity for search
  refresh;
- series membership unique on `(media_item_id, series_id, position)` and a
  reverse `(series_id, media_item_id)` facet index;
- taxonomy membership unique on `(media_item_id, category, term_id)` and a
  reverse `(category, term_id, media_item_id)` facet index; and
- FTS5 plus a B-tree normalized identifier index for ISBN/ASIN exact/prefix
  lookup.

Query plans for default Archive/Queue grid and list layouts, every sort, and
combined date+format occurrence filters must be checked against realistic collection
sizes. Filtering may not load IDs into application memory and paginate them
there.

## Acceptance examples

The implementation fixtures and browser coverage must demonstrate:

1. a Read work with two child reads in different formats appears once; its
   latest supported read alone drives collection date/format display and
   filters, while both reads remain in History;
2. a work with `read_count = 2` and one child row says **Hardcover reports 2
   reads; 1 has an individual record** without creating another occurrence;
3. a Read work with no child row appears with an unknown date and unknown
   consumed edition;
4. a work can appear in Archive and Queue simultaneously and is counted once in
   each;
5. a Currently Reading work appears in Queue without a Reading badge and keeps
   its progress/status activity in History;
6. current, consumed, work-cover, and default-cover editions remain distinct;
7. multiple primary authors truncate only in the collection, while all work and
   edition roles appear correctly in Details;
8. missing title, cover, author, date, rating, description, edition, series, and
   community data each use the specified neutral behavior;
9. optional community enrichment can fail or expire without hiding the book;
10. counts, facets, and keyset pagination remain correct under every supported
    filter and sort;
11. opening, closing, Back/Forward, refresh/deep-link selection, focus return,
    scroll restoration, and stale-request protection preserve collection state;
    and
12. a partial or failed Hardcover snapshot never clears Queue membership.

This document specifies the Books surface only. It does not authorize code,
schema changes, provider calls, shared-document edits, or implementation of the
remaining media types.
