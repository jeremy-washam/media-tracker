# Articles Phase 2 surface specification

> Current presentation (reviewed 2026-10-12): the [UI foundation](../../design/ui-foundation.md) and [shadcn audit](../shadcn-ui-audit.md) supersede conflicting layout, density, typography, rating, and control details below. This is the retained September surface contract; the per-media implementation plan records delivered behavior and remaining hardening.

- Status: Historical owner-approved baseline; initial production implementation delivered locally
- Date: 2026-09-20
- Scope: Production Library > Articles Archive, Queue, and Feed

## Outcome

Articles uses one row-based collection and the shared compact inspector. Its
default row is deliberately restrained, with an optional expanded density for
readers who want more context without opening the inspector.
It has three peer sections:

1. **Archive** — canonical article consumption history supported by Reader
   Archive evidence.
2. **Queue** — current Reader Inbox, Later, and Shortlist membership.
3. **Feed** — current ambient Reader Feed inventory.

Feed is a Reader-specific Articles section. It is not Queue and is not the
future cross-media recommendation Feed described in the long-term vision.
Shortlist is part of Queue, not a fourth section. Reader videos and podcasts
appear in their own Library media types. Tweets, EPUBs, notes, highlight-only
documents, and unknown categories remain source evidence and never become
standalone Articles rows.

This specification treats the Phase 1 recommendations as approved, including
source-owned tags and annotations, selective full-text acquisition, independent
Archive and Queue relationships, and distinct author/publication/acquisition
source fields. It incorporates the owner's overrides that Shortlist belongs in
Queue and Reader Feed is a separate Articles section.

The surface is read-only. It does not add, move, archive, shortlist, tag, or
delete Reader documents. It does not provide in-app reading, AI summaries,
recommendations, community scores, or a general Lists model.

## Source eligibility and relationship rules

### Category routing

| Reader category                         | Library projection       | Article subtype label | Included locations                         |
| --------------------------------------- | ------------------------ | --------------------- | ------------------------------------------ |
| `article`                               | Article                  | Web article           | Archive, Queue, Feed                       |
| `pdf`                                   | Article                  | PDF                   | Archive, Queue, Feed                       |
| `rss`                                   | Article                  | RSS                   | Archive, Queue, Feed                       |
| `email` or observed newsletter variant  | Article                  | Newsletter            | Archive, Queue, Feed                       |
| `video`                                 | Video                    | Not applicable        | Routed to Videos                           |
| `podcast`                               | Podcast episode          | Not applicable        | Routed to Podcasts                         |
| `tweet`, `epub`, `highlight`, or `note` | Source evidence only     | Not applicable        | No standalone Library item                 |
| Unknown category                        | Unresolved source record | Not applicable        | No guessed media type or collection member |

The original Reader category remains available in provenance even when the UI
uses a friendlier subtype label. `newsletter` is accepted only as a preserved
source value already supported by the connector; it is not assumed to be an
exhaustive official category.

### Section membership

| Section | Inclusion rule                                                                                            | Exclusion and overlap behavior                                                                                                                                                                                                 |
| ------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Archive | The canonical article item has at least one retained, non-superseded Reader Archive admission occurrence. | `reading_progress`, open timestamps, and current Reader location do not revoke prior consumption. An item moved back to Inbox, Later, Shortlist, or Feed remains in Archive and may also appear in that current-state section. |
| Queue   | An eligible Reader article document's current location is `new`, `later`, or `shortlist`.                 | `new` is displayed as Inbox. Feed is never included. Prior Archive membership does not remove Queue membership.                                                                                                                |
| Feed    | An eligible Reader article document's current location is `feed`.                                         | Feed does not imply explicit intent, consumption, or a recommendation. Reader videos and podcasts in Feed are routed to their own media types.                                                                                 |

One canonical media item appears once within a section. Section counts are
independent: an article previously archived and currently in Later contributes
once to Archive and once to Queue. When more than one Reader identity is ever
reconciled to one canonical item, memberships and history are aggregated by
canonical item without discarding either identity's provenance.

A current location change is a source-state update, not a fabricated transition
event. Polling does not establish when the move happened, and absence from an
incomplete page is not removal evidence. The UI never renders a location-change
timeline from snapshots.

## Shared collection composition

### Mode and density

Articles has one collection mode: a list. There is no grid/gallery toggle in
the initial surface. The density control offers **Restrained** and **Expanded**;
Restrained is the default and is the canonical small-screen presentation.

- Restrained rows are 72 px minimum height with a 64 x 48 px, 4:3 thumbnail
  slot. They show only the thumbnail, title, author/publication, and the
  section-specific state or primary date.
- Expanded rows add subtype, reading time, current progress, published date,
  and an `Archived before` marker when relevant.
- A search result with a match excerpt may grow to 96 px in either density.
- Titles use at most two lines. All secondary metadata uses one line and
  truncates without changing the accessible name.
- Opening the inspector narrows the list but does not change it into cards,
  discard columns, reset scroll, or alter density.
- Missing artwork uses a quiet subtype glyph in the same slot. It does not use
  generated artwork, initials, gradients, or a repeated generic illustration.
- The selected row uses the restrained Graphite selection treatment. A visible
  focus ring is independent of selection.
- Rows have no action toolbar. The row opens the inspector; source actions live
  in the inspector.

The list header contains, in order: section switcher, search, filter button with
active-filter count, sort control, result count, and the collection. Archive,
Queue, and Feed preserve separate filter, sort, loaded-page, selection, and
scroll state during the session.

### Common row fields and priority

Fields are retained in this priority order as width decreases:

1. Thumbnail or subtype fallback.
2. Title.
3. Author and publication.
4. Section-specific state and primary date.
5. Subtype.
6. Reading time.
7. Current progress.
8. Published date or secondary relationship marker.

Title and section-specific state never disappear. Lower-priority values move
into the title metadata line before being omitted. They do not become a hidden
hover-only source of information.

The restrained title block is:

- title;
- `author · publication` when both exist, otherwise the one available value.

The expanded metadata line adds subtype, reading time, progress, and the
section-appropriate secondary relationship marker. Tags are intentionally not
shown in collection rows.

Author and publication remain unsplit source strings. A byline is not parsed
into people, and neither label links to a creator page in this phase.

### Archive row

In Expanded density, an Archive row adds:

1. reading time, when parsed;
2. current Reader progress, when available;
3. the latest matching Archive occurrence date, or the latest overall
   occurrence when no date filter is active; and
4. `In Queue` or `In Feed` only when that current Reader relationship also
   exists.

The date is labeled `Archived`, not `Read` or `Finished`. An inferred date is
rendered as `Archived Sep 14, 2026 · inferred`; an unknown date is `Archive date
unknown`. The row does not show ingestion time, source-recorded time, or Reader
`updated_at` as a substitute.

### Queue row

In Expanded density, a Queue row adds:

1. a source-state label: `Inbox`, `Later`, or `Shortlist`;
2. reading time, when parsed;
3. current Reader progress, when available;
4. `Added` plus `saved_at`, when known; and
5. `Archived before` when retained Archive history exists.

Inbox, Later, and Shortlist form one collection. They are filters, not nested
tabs and not separate counts in the global sidebar. `saved_at` is the date added
to Reader, not the date moved into the current Queue state. The UI does not label
`last_moved_at` as a Queue-state date.

### Feed row

In Expanded density, a Feed row adds:

1. reading time, when parsed;
2. current Reader progress/opened state;
3. `Arrived` plus `saved_at`, when known;
4. published date, when known; and
5. `Archived before` when retained Archive history exists.

The section switcher label is `Feed`; its accessible description is `Reader
subscription feed`. The empty state and inspector also name Reader explicitly
so this inventory cannot be mistaken for a generated recommendation feed.

## Field behavior

### Dates

- Archive's primary date is the canonical occurrence's `consumed_at`. Reader
  `last_moved_at` remains marked `inferred`.
- Queue's and Feed's arrival date is Reader `saved_at`.
- `published_date` is publication metadata and remains day precision.
- `created_at`, `updated_at`, first/last-opened times, source-recorded time, and
  ingestion time never substitute for a missing Archive, arrival, or publication
  date.
- Day-precision values display without timezone conversion. Instants display in
  the configured owner timezone; the initial timezone is
  `America/Los_Angeles`.
- A date range is inclusive in the UI. Day values compare as calendar days.
  Instant values use `[start at 00:00, day after end at 00:00)` in the owner
  timezone, converted to UTC for querying.
- Archive date filtering matches any retained, non-superseded occurrence. The
  row date and date sort use the latest occurrence inside the selected range.
  The inspector still shows complete history and marks matching occurrences.
- Unknown dates are included when no date filter is active. A range excludes
  them unless `Include unknown dates` is selected. Unknown dates always sort
  last in both directions.

### Progress and opened state

Reader `reading_progress` is a mutable source snapshot, not Archive admission
and not a completion claim. Display it as a rounded whole percentage with an
accessible progress label:

| Evidence                                            | Display                                               |
| --------------------------------------------------- | ----------------------------------------------------- |
| `first_opened_at` is null and progress is exactly 0 | Not opened                                            |
| Opened and progress is exactly 0                    | Opened · 0%                                           |
| Progress is greater than 0 and less than 1          | `N%`                                                  |
| Progress is exactly 1                               | 100%                                                  |
| Missing or invalid progress                         | Omit in rows; `Progress unavailable` in the inspector |

Values outside 0–1 are retained as invalid source evidence and are not clamped
into a valid persisted value. No state is labeled Read, Finished, or Completed
from progress alone.

The Progress filter uses `Not opened`, `Opened at 0%`, `In progress`, `100%`,
and `Unknown`. Multiple values use OR semantics.

### Reading time and word count

Preserve `reading_time` exactly and derive nullable whole minutes with a
versioned parser. The parser may accept only explicitly tested hour/minute forms;
unrecognized strings remain raw and produce no numeric value.

- Rows show normalized minutes, for example `12 min` or `1 hr 20 min`.
- Numeric filtering and sorting use only parsed minutes.
- Unparsed values are omitted from rows, shown verbatim under `Reader estimate`
  in the inspector, and sort with unknown values.
- Word count appears in the inspector, not ordinary rows.
- `listening_time` remains source evidence for Article records but is not used
  as an Article reading-time fallback.
- No estimate is written into canonical `duration_ms` without a separate
  accepted semantic rule.

### Tags

Tags are Reader-owned facts, not canonical cross-source tags.

- Rows show at most two tag names, ordered case-insensitively by display name,
  followed by `+N`.
- The inspector shows all current tags in the same order.
- Tag filters use the Reader tag key as identity and the current tag name as the
  label. Selecting multiple tags means the document must contain every selected
  tag.
- Renames update display text without changing saved filter identity. Deleted
  attachments disappear from current filters but remain traceable in source
  evidence.
- Tag `type` and the undocumented numeric `created` value appear only in
  provenance diagnostics, not the normal inspector.

### Author, publication, and acquisition source

The three source concepts remain distinct:

- `author` is the byline string and appears in rows, Details, search, filtering,
  and sorting;
- `site_name` is labeled `Publication` and appears in rows, Details, search,
  filtering, and sorting; and
- Reader `source` is labeled `Added via`. It appears in the inspector's Source
  section but is omitted from collection rows and filters.

Facet identity uses a whitespace-trimmed, Unicode-normalized, case-folded key;
the most recently observed non-empty source spelling is the display label. This
normalization groups filters only. It does not establish a creator or
publication entity and cannot merge media items.

Articles exposes no community rating, popularity, clap, read count, or ranking
field. No empty rating control or community-data placeholder appears, and there
is no rating filter or sort.

### Summary, notes, highlights, and full text

- Reader `summary` is displayed in Details as `Summary`. It is source/imported
  text, not an AI summary. Imported markup is sanitized and rendered as plain
  text in this compact inspector.
- A non-empty v3 document note and a non-empty v2 container `document_note` are
  displayed as separately sourced notes if both exist. They are not silently
  concatenated or allowed to overwrite one another.
- Active highlights come from deletion-aware v2 export records. Each highlight
  displays passage text, its attached note when non-empty, highlighted date when
  known, favorite state when true, and a human-readable location only when the
  location unit is meaningful.
- Discarded or deleted highlights do not appear in the ordinary highlight list
  or search. Their counts and last-observed state remain available in collapsed
  provenance.
- Highlights are ordered by source position when comparable, then by
  `highlighted_at`, then stable highlight ID. Mixed or missing location units
  fall back to date and ID; the UI does not pretend those positions are
  comparable.
- The inspector loads the first 20 active highlights and uses an explicit `Load
more highlights` action with keyset pagination.
- Authorized full text is acquired selectively. Metadata, Queue, Feed, and the
  inspector work without it. The inspector reports one of `Full text`, `Partial
text`, `Highlights only`, or `Metadata only`, with acquisition source and date.
- Full article bodies are not rendered in this phase. Acquired text participates
  in search and can supply a bounded search excerpt. `Open original` and `Open
in Reader` remain the reading actions.
- Temporary `raw_source_url` values are never returned to the browser or stored.
  If raw content is approved for acquisition, bytes are copied to private R2
  while authorized and represented by a durable manifest.

## Inspector specification

The shared compact inspector has **Details** and **History** tabs. It fetches by
canonical media-item ID and remains open across collection pagination. Empty
sections are omitted rather than rendered as blank administrative blocks.

### Inspector header

The fixed header contains, in order:

1. thumbnail or subtype fallback;
2. subtype label;
3. title, using `Untitled article` only as a presentation fallback;
4. author and publication;
5. current relationship chips (`Archived`, `Inbox`, `Later`, `Shortlist`, or
   `Reader Feed`) without implying exclusivity; and
6. `Open original` and `Open in Reader` actions when each validated URL exists.

Outbound links open in a new browser context with safe link attributes. Reader
and original URLs remain separate even when one is missing. There are no edit,
remove, archive, queue, playback, or `Ask about this` controls in this delivery.

### Details tab

Sections appear in this order:

1. **Summary** — imported Reader summary, when non-empty.
2. **Article** — author, publication, published date with precision, subtype,
   word count, Reader reading-time estimate, current progress/opened label, first
   opened, and last opened. Missing values are omitted except progress, whose
   unavailable state is explicit.
3. **Tags** — all current Reader tags.
4. **Content** — availability (`Full text`, `Partial text`, `Highlights only`,
   or `Metadata only`), acquisition source/date, extraction status, and a factual
   error state if acquisition failed.
5. **Source** — original link, Reader link, `Added via`, Reader category,
   current Reader location, date added, and last successful source observation.

`updated_at` is labeled `Last changed in Reader`; it is not shown as reading
activity. `last_moved_at` appears here only as a raw source fact when needed to
explain an inferred Archive date.

### History tab

Sections appear in this order:

1. **Archive history** — every retained, non-superseded canonical occurrence,
   newest first. Each row shows the date and precision, asserted/inferred basis,
   admitting source, and `Matches current date filter` when applicable. Reader
   uses the factual label `Reader Archive` rather than `Finished reading`.
2. **Current Reader state** — current location and the instant at which that
   snapshot was last observed. Queue membership is explained as Inbox, Later,
   or Shortlist; Feed is labeled ambient inventory. The UI does not invent the
   time of a move.
3. **Open evidence** — first opened, last opened, and current progress as source
   snapshots, not a list of reading sessions.
4. **Notes and highlights** — document notes and active highlights, in source
   order where available, with their exact source named. Highlight notes remain
   attached to their highlight. Deleted or discarded highlights are omitted.
5. **Provenance** — collapsed by default. It contains connection label, Reader
   document identity, external identities, source-recorded time, latest sync
   run, admission reason, content/highlight source records, and explicit
   supersession/removal evidence.

Source-recorded and ingested timestamps never appear in the Archive history list
as consumption dates. A current move away from Reader Archive is disclosed in
Current Reader state and does not erase the prior Archive occurrence.

## Search

Search is server-side, scoped to the active section and its current filters. It
is Unicode-normalized and case-insensitive. It targets, in ranking order:

1. title;
2. author;
3. publication;
4. imported summary;
5. document notes;
6. active highlight text and highlight notes; and
7. acquired, permitted full text.

Reader acquisition source, internal IDs, provenance timestamps, and raw payloads
are not free-text targets. Exact title matches rank above title prefixes, which
rank above other metadata and content matches.

When a query matches only summary, note, highlight, or full text, the row may
show one sanitized excerpt of at most 180 Unicode characters. It is prefixed
`Summary`, `Note`, `Highlight`, or `Text`, with query terms emphasized. The
excerpt does not replace the title or become a generated summary. Full-text
excerpts are loaded only from authorized retained content. A result may still
appear without an excerpt if its matching content is temporarily unavailable.

With a non-empty search, the default sort is **Relevance**. Ties use the active
section's ordinary default sort and canonical item ID. Choosing another sort is
sticky for that section until the user selects Relevance or clears the search.

## Filters

All filters run on the server across the entire matching collection. Facet
options and counts use current normalized projections, never raw-object parsing.
Repeated values within a facet use the semantics stated below; different facets
always combine with AND.

### Shared filters

| Label        | Values and source                                                                                   | Semantics                                                                                |
| ------------ | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Type         | Web article (`article`), PDF (`pdf`), RSS (`rss`), Newsletter (`email`/approved newsletter variant) | Multi-select OR; only eligible Article categories appear.                                |
| Author       | Normalized non-empty Reader `author`; `Unknown author` when present                                 | Multi-select OR. Unknown matches null/empty only.                                        |
| Publication  | Normalized non-empty `site_name`; `Unknown publication` when present                                | Multi-select OR.                                                                         |
| Published    | Inclusive from/to calendar dates plus `Include unknown dates`                                       | Uses `published_date`, never saved or consumed time.                                     |
| Reading time | Under 5 min, 5–15 min, 16–30 min, 31–60 min, Over 60 min, Unknown                                   | Multi-select OR over parsed whole minutes. Boundary values belong to exactly one bucket. |
| Progress     | Not opened, Opened at 0%, In progress, 100%, Unknown                                                | Multi-select OR using the progress rules above.                                          |

Author and Publication facet lists are searchable and ordered by descending
current section count, then display name. Their count is computed after applying
the section and every other active filter, but before applying their own facet.
Zero-count values are omitted unless already selected.

### Archive-only filters

| Label                | Values and source                                                  | Semantics                                                                                     |
| -------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Archived             | Inclusive from/to date plus `Include unknown dates`                | Matches any retained occurrence; latest matching occurrence drives row date and sort.         |
| Current Reader state | Archive, Inbox, Later, Shortlist, Reader Feed, Unavailable/unknown | Multi-select OR over the current Reader document snapshot; it does not alter Archive history. |

### Queue-only filters

| Label       | Values and source                                               | Semantics                                                                    |
| ----------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Queue state | Inbox (`new`), Later, Shortlist                                 | Multi-select OR; all three are selected implicitly when the filter is unset. |
| Added       | Inclusive `saved_at` from/to dates plus `Include unknown dates` | Date added to Reader, not moved-to-state time.                               |
| History     | Archived before, No Archive history                             | Multi-select OR over retained Archive occurrences.                           |

### Feed-only filters

| Label   | Values and source                                               | Semantics                                                      |
| ------- | --------------------------------------------------------------- | -------------------------------------------------------------- |
| Arrived | Inclusive `saved_at` from/to dates plus `Include unknown dates` | Reader Feed arrival/save date.                                 |
| Opened  | Not opened, Opened                                              | `first_opened_at` null versus non-null; it is not read/unread. |
| History | Archived before, No Archive history                             | Multi-select OR over retained Archive occurrences.             |

Filter chips use the labels above. `Clear all` resets filters but leaves section,
search, sort, selection, and sidebar state unchanged.

## Sorting

All sorts are server-side and stable. Null values sort last for both directions.
String sorts use the same normalized key as their facet, followed by normalized
title and canonical item ID. Date and numeric sorts use normalized title and ID
as ties.

### Archive sorts

| Sort                 | Directions                     | Default                                |
| -------------------- | ------------------------------ | -------------------------------------- |
| Archived date        | Newest first / Oldest first    | Newest first when search is empty      |
| Published date       | Newest first / Oldest first    | No                                     |
| Date added to Reader | Newest first / Oldest first    | No                                     |
| Title                | A–Z / Z–A                      | No                                     |
| Author               | A–Z / Z–A                      | No                                     |
| Publication          | A–Z / Z–A                      | No                                     |
| Reading time         | Shortest first / Longest first | No                                     |
| Relevance            | Best match                     | Default only while search is non-empty |

Archive date sorting under an active Archive date filter uses the latest
matching occurrence. Without that filter it uses the latest retained occurrence.

### Queue sorts

| Sort           | Directions                                    | Default                                |
| -------------- | --------------------------------------------- | -------------------------------------- |
| Date added     | Newest first / Oldest first                   | Newest first when search is empty      |
| Queue state    | Shortlist–Later–Inbox / Inbox–Later–Shortlist | No                                     |
| Published date | Newest first / Oldest first                   | No                                     |
| Title          | A–Z / Z–A                                     | No                                     |
| Author         | A–Z / Z–A                                     | No                                     |
| Publication    | A–Z / Z–A                                     | No                                     |
| Reading time   | Shortest first / Longest first                | No                                     |
| Relevance      | Best match                                    | Default only while search is non-empty |

The Queue-state order expresses organization only; it does not create a priority
or recommendation score.

### Feed sorts

| Sort           | Directions                     | Default                                |
| -------------- | ------------------------------ | -------------------------------------- |
| Arrival date   | Newest first / Oldest first    | Newest first when search is empty      |
| Published date | Newest first / Oldest first    | No                                     |
| Title          | A–Z / Z–A                      | No                                     |
| Author         | A–Z / Z–A                      | No                                     |
| Publication    | A–Z / Z–A                      | No                                     |
| Reading time   | Shortest first / Longest first | No                                     |
| Relevance      | Best match                     | Default only while search is non-empty |

## Counts

The section switcher shows unfiltered unique-item counts for Archive, Queue, and
Feed. The collection header shows `N articles` or `N of M articles` after search
or filters. Counts use the same eligibility, relationship, and current-state
predicates as the rows.

- Archive also returns `occurrenceCount`. Display `N articles · M archive
entries` only when `M` differs from `N`.
- Queue returns Inbox, Later, and Shortlist facet counts. These appear inside
  the Queue-state filter, not as three navigation tabs.
- Feed counts only eligible Article items currently in Reader Feed.
- Cross-section overlap is intentional and is not deduplicated across section
  counts.
- Deleted/discarded annotations do not affect visible annotation counts.
- Counts cover the complete server-side result, not loaded pages.

After a successful sync or replay, invalidate counts and the first page. The UI
does not pretend cursor pagination is a frozen snapshot while source data
changes.

## Empty, missing, unavailable, and error states

### Collection states

| State                                        | Primary text                       | Secondary text/action                                                                  |
| -------------------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------- |
| Archive has no eligible items                | `No archived articles.`            | `Reader Archive items appear here after a successful sync.`                            |
| Queue has no eligible items                  | `No queued articles.`              | `Reader Inbox, Later, and Shortlist items appear here.`                                |
| Feed has no eligible items                   | `No Reader Feed articles.`         | `Feed is ambient subscription inventory, not Queue.`                                   |
| Search/filter has no matches                 | `No articles match these filters.` | `Clear filters` action; preserve the query until the user clears it.                   |
| Required all-location backfill is incomplete | `Reader coverage is incomplete.`   | Show the last successful sync and link to Connections. Existing results remain usable. |
| Refresh fails with cached data               | `Articles could not be refreshed.` | Keep cached rows and expose Retry.                                                     |
| Initial request fails                        | `Articles could not be loaded.`    | Retry and Connections actions.                                                         |

### Field states

- Missing title displays `Untitled article` in UI only. It is not persisted,
  indexed as a source title, or used for identity.
- Missing author or publication is omitted from rows. The inspector labels the
  missing field only when its absence is relevant to an active filter or source
  diagnostic.
- Missing publication, Archive, or arrival dates display an explicit unknown
  label where that date is the section's primary fact.
- Missing or broken artwork falls back to the subtype glyph without repeatedly
  retrying during the same session.
- An explicit source deletion/unavailability may display `Unavailable in
Reader`. Absence from a page or failed fetch is never enough to claim this.
- Failed full-text acquisition displays `Text unavailable` with the last safe
  failure class. It does not hide metadata, notes, or highlights.
- Invalid imported URLs are rendered as text in provenance, never clickable.
- Long titles, summaries, notes, and highlight text wrap in the inspector; the
  collection remains bounded to the row rules above.

## URL, selection, focus, and remembered state

Canonical routes are:

```text
/library/articles/archive
/library/articles/queue
/library/articles/feed
```

The following state is encoded in query parameters:

```text
q
sort
dir
type
author
publication
publishedFrom
publishedTo
publishedUnknown
readingTime
progress
archivedFrom / archivedTo / archivedUnknown
currentState
queueState / addedFrom / addedTo / addedUnknown / history
arrivedFrom / arrivedTo / arrivedUnknown / opened
item
```

Multi-value parameters repeat and are serialized in stable sorted order. Default
values are omitted. Invalid values are ignored with the URL replaced by its
normalized form; they do not produce a server error page. `item` is the
canonical media-item ID and opens the shared inspector.

Opening an item pushes a browser-history entry. Closing the inspector removes
only `item`, returns focus to the triggering row when it still exists, and
preserves filters, sort, loaded pages, and scroll. Back closes the inspector
before leaving the collection. Forward reopens it. A direct item link loads the
inspector even when the item is not on the first page.

If a filter change removes the selected item from results, the inspector remains
open and says `Not in current results`; closing it returns focus to the
collection heading. Rapid selection cancels or ignores stale detail responses.
An unknown/ineligible ID yields an inline not-found inspector state without
discarding the collection.

Loaded-page cursors and scroll offsets are session-history state, not durable URL
parameters. The three sections remember their own state while navigating within
Library. Appearance and sidebar-collapse preferences remain separate from all
collection state.

## Pagination

- Collection requests use keyset pagination with 50 rows per page; the API
  permits 1–100.
- The UI loads the first page automatically and provides an explicit `Load more`
  action. It does not download all Feed rows or rely on client-only filtering.
- Cursors are opaque, versioned, and bound to section, normalized filters,
  search, sort, direction, and owner timezone. Reusing a cursor with a different
  query returns `BAD_REQUEST` rather than a plausible wrong page.
- Every cursor contains the sort null-rank, normalized sort value, normalized
  title tie-breaker, and canonical item ID. Relevance cursors also contain the
  rank value.
- Changing search, filters, sort, or direction clears loaded pages and requests
  a new first page. A sync invalidates the page chain.
- The API may return duplicates or gaps only if the live collection changes
  between pages; the client deduplicates by canonical item ID and offers Refresh
  after a sync. It does not claim snapshot isolation.
- Inspector highlights use separate 20-row keyset pages. Archive history uses
  25-row pages if an item exceeds the first 25 occurrences.

## API contract requirements

### Collection endpoint

Add:

```text
GET /api/library/articles
```

Required query fields mirror the normalized URL state and add `section`,
`limit`, and opaque `cursor`. The route validates all enums, date ranges, numeric
bounds, repeated-value limits, and cursor/query compatibility. Hono remains a
thin contract boundary; repository/service code owns predicates, facet counts,
and cursor construction.

The response contains:

```ts
type ArticleCollectionResponse = {
  data: ArticleCollectionRow[]
  nextCursor: string | null
  sectionCounts: { archive: number; queue: number; feed: number }
  totalCount: number
  filteredCount: number
  occurrenceCount: number | null
  facets: ArticleFacets
  coverage: {
    allLocationsBackfilled: boolean
    highlightsBackfilled: boolean
    fullTextPolicy: 'selective' | 'disabled'
    lastSuccessfulSyncAt: string | null
  }
}
```

Each `ArticleCollectionRow` returns exactly the fields needed by the row:

```ts
type ArticleCollectionRow = {
  id: string
  title: string | null
  subtype: 'article' | 'pdf' | 'rss' | 'newsletter'
  imageUrl: string | null
  author: string | null
  publication: string | null
  publishedAt: TemporalValue | null
  readingTime: { raw: string; minutes: number | null } | null
  progress: number | null
  firstOpenedAt: string | null
  archive: {
    occurrenceCount: number
    displayOccurrence: TemporalValue | null
    currentDateFilterMatch: boolean
  } | null
  queue: { state: 'inbox' | 'later' | 'shortlist'; addedAt: string | null } | null
  feed: { arrivedAt: string | null } | null
  searchMatch: { kind: 'summary' | 'note' | 'highlight' | 'text'; excerpt: string } | null
}
```

The collection response never returns raw HTML, full highlight sets, full text,
raw payloads, or temporary signed URLs. Tags, annotation content, and content
availability remain detail-only facts.

### Detail and child endpoints

Extend the shared item detail route so Queue-only and Feed-only items are
inspectable:

```text
GET /api/media/:id
GET /api/media/:id/history?limit=25&cursor=...
GET /api/media/:id/highlights?limit=20&cursor=...
```

`GET /api/media/:id` returns common item metadata plus a typed `article` block
containing every field named in the inspector specification, current
memberships, annotation totals, content manifest status, validated source links,
coverage/freshness, and the first history/highlight page. Detail lookup requires
an eligible Library relationship (Archive, Queue, or Feed), not an active
Archive entry.

History returns canonical occurrences with complete temporal value/precision/
basis, source label, admission reason, current/superseded status, matching-date
flag, and a safe evidence summary. Highlights return only active,
non-discarded display records. Deleted/discarded totals are available in detail
provenance but their private text is not returned by the ordinary endpoint.

All responses are Zod-validated. Stable error codes distinguish invalid query,
not found/ineligible item, temporarily unavailable content, and internal errors.

## Acquisition and normalized projections

No browse request parses R2 payloads. Phase 2 requires the following durable,
queryable projections before the surface is complete.

### Reader documents

Add a source-owned `readwise_documents` projection with one current row per
`(connection_id, document_id)` and these fields:

- canonical `media_item_id` and Reader external-identity ID;
- Reader URL and original source URL;
- original category and normalized Article subtype;
- current location and explicit current upstream state;
- author, `site_name`, acquisition `source`, summary, image URL, and document
  note;
- word count, reading-time raw value, nullable derived minutes and parser
  version, listening-time raw value, and reading progress;
- published, created, saved, first-opened, last-opened, last-moved, and source
  updated temporal values with their known semantics;
- last-observed source-record ID and observation instant.

Run a complete, exact-page-retained v3 sweep across all locations before Queue
or Feed is called complete. Incremental `updatedAfter` reconciliation remains
overlapped and cursor-safe. Eligible Queue-only and Feed-only documents create
or attach to canonical media items and external identities without creating
Archive entries. Category routing occurs before section projection.

Current location lives in this source-owned projection. Do not introduce a
local-authoritative `queue_entries` row merely to mirror Reader state in this
read-only phase. Keep the projection compatible with a later local Queue model.

A move away from Reader Archive updates `readwise_documents.current_location`
but must not make the previously admitted consumption disappear from the
Archive collection. The current implementation's `upstream_state='active'`
predicate is therefore insufficient for this surface. Replay/migration must
distinguish a source location change from a true invalidation or supersession of
the canonical occurrence. Only explicit correction/supersession may exclude an
occurrence from the retained Archive history query.

### Tags

Add:

- `readwise_tags`, unique by `(connection_id, tag_key)`, with current name; and
- `readwise_document_tags`, unique by `(reader_document_id, tag_key)`, retaining
  source type, opaque source `created` value, active/removal state, and source
  record lineage.

Acquire the complete Tag LIST and reconcile attachments from full document
snapshots. An absent attachment is retired only from a complete document
observation that establishes the current tag set.

### Highlight containers and highlights

Acquire exact v2 export pages with `includeDeleted=true`. Add:

- `readwise_highlight_containers`, keyed by connection and `user_book_id`, with
  the verified Reader `external_id` join, container note, current deletion
  state, source timestamps, and lineage; and
- `readwise_highlights`, keyed by connection and highlight ID, with container,
  external ID, text, note, position/end position and type, color,
  highlighted/created/updated times, favorite/discard/deletion state, tags, and
  source-record lineage.

Verify the v2 `external_id` to v3 document-ID equality in integration tests
before enforcing the join. Until verified, retain unresolved containers without
attaching their private annotations to a possibly wrong item. V3 highlight and
note documents remain child source evidence; they are not duplicate standalone
Library media.

### Full-text manifests

Add a D1 content manifest linked to the exact Reader document/manifestation and
private R2 objects for authorized source bytes and extracted text. The manifest
records content kind, checksum, source version, language when known, coverage
(`full` or `partial`), acquisition and extraction versions/times, retention/use
policy, and processing/failure state.

Full text is selective and independently retryable. It never blocks document,
tag, highlight, Queue, Feed, or Archive commits. Signed source URLs are transient
capabilities and are never persisted. Generated summaries are not part of this
projection.

### Search projections

Maintain two D1 FTS5 indexes transactionally or through replay-safe explicit
indexing state:

1. an Article metadata/annotation index for title, author, publication, tag
   names, summary, active document notes, active highlight text, and active
   highlight notes; and
2. a contentless full-text chunk index keyed to authorized extracted-text R2
   objects and stable chunk locators.

The canonical full-text body remains in R2. The contentless index stores search
terms and chunk identity, not a second authoritative article body. Search
excerpt retrieval reads only the winning authorized chunk through its manifest
and bounded locator. Deletion, discard, content expiry, or permission change
removes the corresponding searchable row before the next query can return it.

Every index row records the source projection version. Index rebuild is a
supported replay operation and cannot advance the Reader sync cursor ahead of
the normalized facts it indexes.

## Required indexes and query invariants

Add or verify equivalent indexes for these access paths; names are illustrative
but the column order and predicates are requirements:

```text
readwise_documents(connection_id, document_id) UNIQUE
readwise_documents(media_item_id, connection_id)
readwise_documents(connection_id, current_location, upstream_state, saved_at DESC, media_item_id)
readwise_documents(connection_id, subtype, current_location, media_item_id)
readwise_documents(current_location, published_at_value DESC, media_item_id)
readwise_documents(current_location, author_key, media_item_id)
readwise_documents(current_location, publication_key, media_item_id)
readwise_documents(current_location, acquisition_source_key, media_item_id)
readwise_documents(current_location, reading_time_minutes, media_item_id)
readwise_documents(current_location, reading_progress, media_item_id)

readwise_tags(connection_id, tag_key) UNIQUE
readwise_document_tags(reader_document_id, tag_key) UNIQUE
readwise_document_tags(tag_key, reader_document_id)

readwise_highlight_containers(connection_id, user_book_id) UNIQUE
readwise_highlight_containers(connection_id, external_id)
readwise_highlights(connection_id, highlight_id) UNIQUE
readwise_highlights(container_id, upstream_state, is_discard, location_type, location, highlight_id)

archive_entries(upstream_state, consumed_at_value DESC, media_item_id, id)
archive_entries(media_item_id, consumed_at_value DESC, id)
```

If the retained-history fix introduces an explicit occurrence disposition or
supersession field, both Archive indexes use that predicate instead of treating
all `removed` Reader entries as non-history.

Repository queries must satisfy all of these invariants:

1. Eligibility and section predicates are identical for rows, counts, and
   facets.
2. One canonical media item appears once per section even with multiple source
   identities or Archive occurrences.
3. Archive date ranges use `EXISTS` over occurrences; display/sort date uses the
   maximum matching value, not an arbitrary joined row.
4. Queue and Feed predicates are connection-scoped current state. One connection
   cannot retire or reclassify another's membership.
5. Unknown dates and numeric values have an explicit null-rank in every keyset
   sort.
6. Search result IDs are intersected with the active section and filters before
   pagination and counts.
7. Facet counts do not depend on the currently loaded page.
8. Detail, highlights, and history never decompress a raw API page at request
   time.
9. Safe local metadata renders when full text, annotation sync, artwork, or the
   source service is unavailable.
10. Replaying the same pages produces the same memberships, annotation state,
    search index, counts, and cursor order.

## Validation criteria for later implementation

This document does not implement the surface. Implementation is complete only
after tests cover:

- Archive, Inbox, Later, Shortlist, and Feed routing for every eligible and
  ineligible category;
- an archived item subsequently in each current-state section without lost
  history;
- all approved filters and sorts, null ordering, counts, and keyset cursors
  against more than one page;
- inferred and unknown Archive dates, owner-timezone boundaries, and matching
  an older occurrence;
- progress 0 unopened versus opened, partial, 100%, missing, and invalid values;
- parseable and unparseable reading-time strings;
- missing title, author, publication, image, dates, tags, annotations, and text;
- tag rename/removal, highlight deletion/discard, unresolved v2/v3 joins, and
  selective full-text failure;
- metadata, annotation, and full-text search with safe bounded excerpts;
- direct links, Back/Forward, focus restoration, stale detail responses, and a
  selected item removed by filters;
- Queue/Feed account isolation, complete versus partial snapshots, and
  idempotent replay; and
- Restrained and Expanded density at desktop and narrow widths; and
- Graphite light/dark with sidebar and inspector both open and closed.

The later implementation must run the repository's required checks after its
final code or test change. This baseline changes documentation only.
