# Movies Phase 2 surface specification

- Date: 2026-09-20
- Status: Owner-approved implementation baseline; no behavior described here is shipped
- Scope: Movies in Library, for both Archive and source-derived Queue
- Sources: Letterboxd export and RSS for personal facts; TMDB for additive catalog enrichment

## Outcome

Movies is an artwork-led Library surface that remains complete and honest without
catalog enrichment. It shows each movie once in Archive and once in Queue when
both memberships apply. Archive inspection retains every supported viewing.
Queue is the current Letterboxd watchlist observed by the most recent successful
complete export, not an inference from whether the movie was watched.

This document resolves the Phase 2 Movies choices left open by the
[Phase 1 register](../library-phase-1-decisions.md). Its requirements follow the
selected Index shell, Graphite light/dark treatment, one compact inspector, and
occurrence-aware Library behavior. It specifies product behavior and the API,
projection, and index work needed to implement it; it does not implement that
work.

The governing decisions are:

- adopt TMDB as an attributed, refreshable catalog source after the prerequisite
  credentialed probe;
- render Letterboxd history and Queue independently of TMDB;
- project the current film-level Letterboxd like relationship;
- defer Letterboxd tags and Lists because neither has a concrete initial Movies
  use that justifies its projection;
- defer regional watch-provider availability;
- keep one movie/production item rather than creating release or cut items; and
- leave ambiguous TMDB matches unenriched, with no owner-confirmation workflow in
  this delivery.

## Boundaries

### Required in this delivery

- Movies Archive and Queue collections, grid and list presentations, shared
  search, exact filters and sorts, counts, stable keyset pagination, URL state,
  selection, and inspection.
- Letterboxd watchlist acquisition and complete-snapshot reconciliation.
- Film-level current personal rating and like projection from the export,
  separate from viewing-owned ratings and reviews.
- Complete active viewing history, precise date semantics, film and Diary source
  links, and compact provenance/freshness disclosure.
- A sparse but fully usable local-only presentation when enrichment is absent.
- TMDB enrichment only after the prerequisite in this document is satisfied.
  Once enabled, the required TMDB field set is poster, current title, original
  title, original language, overview, release date, runtime, genres, directors,
  TMDB source link, and IMDb identity when supplied.

### Optional additive enrichment

These may be acquired by the same TMDB detail request and displayed when present,
but are not required for collection or inspector completeness:

- backdrop and tagline;
- up to five top-billed cast members in the inspector;
- TMDB community vote average and vote count, labeled **TMDB rating** and never
  presented as the owner's rating; and
- production countries.

Optional fields must not introduce filters or sorts in this phase. Their absence
must not produce empty sections or placeholders.

### Deferred

- Letterboxd tags and list membership, list navigation, and a general Lists
  model;
- TMDB watch-provider calls or any streaming-availability section;
- cast/crew browsing, person pages, release/cut/edition identity, trailers,
  recommendations, and similar-movie discovery;
- public Letterboxd page scraping, Letterboxd API use, and RSS poster extraction;
- manual additions, rating/like/watchlist edits, upstream write-back, match
  confirmation, or other data-correction UI;
- Chat, full scripts/subtitles, playback, Recaps, and external catalog items that
  are not in Archive or Queue.

## Provider prerequisite: credentialed TMDB probe

TMDB schema, matching, cache, or production client work must not begin until the
owner supplies a TMDB API Read Access Token or v3 application key through local
secret storage. The credential must never enter Git, fixtures, logs, or this
document.

The probe is a release gate, not a background implementation detail. It must use
the real configured credential and record only content-safe field/type/nullability
inventories and aggregate results. It must verify:

1. `GET /3/configuration`, including image base URLs and supported poster and
   backdrop sizes;
2. `GET /3/movie/{movie_id}?language=en-US&append_to_response=credits,external_ids,alternative_titles`
   for at least one RSS-supplied known TMDB movie ID;
3. `GET /3/search/movie?query=...&primary_release_year=...&language=en-US&page=1&include_adult=false`
   for a small authorized sample containing an exact unique result, no result,
   and an ambiguous title/year result;
4. actual nullable and omitted behavior for every required and optional field;
5. image URL construction, attribution/logo requirements, response-cache
   headers, practical `429` behavior, and permitted retention of response data,
   image paths, and derived projections; and
6. the application-specific acceptance rate for the conservative matching rule
   below, reported separately for direct IDs, accepted searches, ambiguous
   searches, and no-match searches.

Before the integration ships, add an ADR for refreshable provider catalog data.
It must distinguish mutable TMDB metadata and artwork from immutable Letterboxd
evidence, record acquisition and refresh times, define expiry/deletion behavior,
and preserve only provider-permitted matching provenance after expiry. The probe
may refine field nullability, request batching, refresh timing, and storage
policy. It may not weaken the rule that ambiguous results remain unmatched or
make enrichment a prerequisite for Library membership.

Do not call `/movie/{id}/watch/providers` in the probe or implementation. Current
availability is explicitly deferred.

## Source-of-truth model

The UI must keep four classes of fact distinct:

| Class                             | Authority                                            | Examples                                                                 | Mutation semantics                                                             |
| --------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| Movie identity and imported facts | Letterboxd export/RSS plus canonical ledger          | Film URI, imported title/year, Diary URI, watched day                    | Immutable observations with replayable projections                             |
| Current personal relationship     | Latest successful complete Letterboxd export         | Current/default rating, liked, watchlist membership, watchlist-added day | Replaceable current projection with retained evidence                          |
| Viewing occurrence                | Letterboxd Diary/export/RSS or watched-only evidence | Watched day, per-viewing rating, review, rewatch flag, Diary link        | One active Archive entry per trustworthy occurrence; history remains traceable |
| Current catalog display           | TMDB                                                 | Poster, synopsis, runtime, genres, directors, current title              | Refreshable additive cache; never Archive or Queue evidence                    |

The display title uses the current TMDB title when a confidently matched,
permitted, non-expired projection is available. Otherwise it uses the imported
Letterboxd title. The imported title/year remain visible in source disclosure if
they differ. A catalog refresh may change display metadata but may not rewrite a
Letterboxd observation, personal fact, membership, or occurrence.

## Collection structure and behavior

Movies opens at `/library/movies/archive`. The local tabs are **Archive** and
**Queue**. Both support **Grid** and **List**. Grid is the default for each tab.
Changing tabs preserves search, filters that exist on both tabs, view choice,
and inspector selection only if the selected movie belongs to the destination
tab. Tab-specific date filters are not translated: Archive watched-date state
and Queue added-date state are remembered independently.

Opening the inspector must not reset query state, loaded pages, or scroll. At
desktop widths where the compact inspector fits, it occupies the right side and
the grid recomputes its column count without changing order. Below that fit
threshold it becomes a modal side sheet over the collection. It remains the same
inspector and URL state in both cases.

Grid uses fixed 2:3 poster cells rather than masonry, with 16 px gaps and
`repeat(auto-fill, minmax(156px, 196px))`; unused trailing width remains empty
rather than stretching posters past 196 px. List rows have a 60 px poster and a
minimum 72 px row height. Rows and cards are one selection target; outbound
provider links are not nested in that target. The selected state, hover, and
keyboard focus use the neutral Graphite treatment and remain distinguishable in
light and dark modes. Long titles wrap to two lines in grid and one line with
ellipsis in list, with the complete title available to assistive technology and
in the inspector.

At viewport widths of 1280 CSS px and above, the inspector is a 380 px adjacent
panel. Below 1280 px it is a right side sheet, width `min(420px, 100vw)`, over
the collection. Opening either form does not change the route or query state.

### Archive grid card

The grid is intentionally sparse. Fields appear in this priority order:

1. poster or the standard missing-artwork tile;
2. display title;
3. release year, omitted when unknown;
4. director display names, one line, omitted when unavailable.

Watched date, rating, like state, and watch count remain available in list view
or the inspector rather than competing with artwork in the grid.

### Archive list row

Columns, left to right, are:

1. **Movie:** 40 x 60 poster thumbnail, display title, and release year;
2. **Director:** all directors joined in credit order, clipped after two display
   names with an accessible full value;
3. **Last watched:** the latest matching known watched day under a date filter,
   otherwise the latest known watched day, or **Date unknown**; and
4. **Your rating:** current film-level rating, or an em dash.

Director and Your rating collapse before Movie and Last watched at narrow
widths. Lifetime watch count remains available in the inspector and as the
**Most watched** sort; it is not a dedicated list column.

### Queue grid card

The Queue grid uses the same sparse presentation. Fields appear in this priority
order:

1. poster or the standard missing-artwork tile;
2. display title;
3. release year, omitted when unknown;
4. director display names, one line, omitted when unavailable.

Added date, rating, like state, and Archive overlap remain available in list
view or the inspector rather than on the grid card.

Queue never relabels the latest watch as its added date and never suppresses a
movie merely because it is also in Archive.

### Queue list row

Columns, left to right, are:

1. **Movie:** 40 x 60 poster thumbnail, display title, and release year;
2. **Director:** the same behavior as Archive;
3. **Added:** watchlist-added day or **Date unknown**; and
4. **Your rating:** current film-level rating or an em dash.

Archive overlap and runtime remain inspector facts. Director and Your rating
collapse first at narrow widths.

### View preference

`view=grid|list` is URL-addressable. If it is omitted, a stored Movies preference
is used; if no preference exists, use grid. The URL wins over storage. Changing
view does not refetch different entities, but the UI requests a page size suited
to the presentation as described under pagination.

## Current relationship versus viewing history

The interface must use these rules even when current and occurrence data appear
to conflict:

| Fact                                      | Collection use                                                                                     | Inspector use                                                         |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Current/default rating from `ratings.csv` | Card/row rating and rating filter/sort                                                             | **Your relationship > Current rating**                                |
| Per-Diary rating                          | Never substituted for current rating                                                               | On its viewing row only                                               |
| Exported review                           | Reviewed filter/indicator if any active occurrence has one                                         | Full text on its viewing row only                                     |
| Current film like from `likes/films.csv`  | Not shown or filtered in the collection                                                            | **Your relationship > Liked**                                         |
| RSS `memberLike`                          | No current-state effect in this phase                                                              | Evidence only; not displayed until semantics are verified             |
| Watchlist membership                      | Queue membership and Queue added date                                                              | **Your relationship > In Queue**                                      |
| Diary viewing                             | Archive membership, date matching, reference date, count                                           | One row in History                                                    |
| Watched-only evidence                     | Archive membership and one undated occurrence only when no Diary occurrence accounts for the movie | **Watched — date unknown** history row                                |
| Rewatch flag                              | No occurrence creation or count effect                                                             | Supporting **Marked as a rewatch** label on that occurrence when true |

An absent current rating is **Unrated**, even if an older occurrence has a
rating. An absent rating on a particular viewing remains absent even when a
current rating exists. The same principle applies to reviews. The UI must not
compose a synthetic “latest review” or move a review between occurrences.

History is ordered by known watched day descending, then stable occurrence ID;
the undated watched-only row is last. When an Archive date filter is active, the
inspector still returns the complete history. Matching occurrences receive a
small **Matches filter** marker; nonmatching occurrences remain visible.

## Inspector

The inspector has one scroll container and two tabs: **Details** and **History**.
It is fetched independently of the collection row and may open for an Archive-
only, Queue-only, or overlapping movie.

### Persistent header

The header is visible above both tabs and contains, in order:

1. poster or missing-artwork tile;
2. display title;
3. release year;
4. directors, when available;
5. runtime, when available;
6. current personal rating, labeled **Your rating**, when present;
7. a filled heart with text **Liked** when liked; and
8. membership chips for **Archive** and/or **Queue**.

Do not show empty rating stars, **Not liked**, a generic **No metadata** chip, or
raw provider IDs in the header.

### Details tab

Sections and fields are fixed in this order. A section with no applicable fields
is omitted.

1. **Overview**
   - overview/synopsis;
   - genres in TMDB order;
   - original title only when different from the display title;
   - original language using its human-readable language name when available,
     otherwise its code;
   - full release date, preserving day precision, or imported release year when
     that is the only fact;
   - optional tagline, backdrop, and production countries.
2. **Your relationship**
   - current personal rating and `5`-point scale;
   - liked state, shown only when true;
   - **In Archive**, active watch count, latest known watched day, and
     **Includes a watch with unknown date** when applicable;
   - **In Queue** and watchlist-added day when applicable;
   - **Reviewed** and review count when at least one active occurrence has an
     exported review. Review text remains in History.
3. **Credits**
   - directors, all names in source order;
   - optional top-billed cast, at most five names with character names when
     present. No **View all credits** affordance is shown in this phase.
4. **Sources**
   - **Letterboxd film** link from the film-level URI;
   - **TMDB movie** link when an accepted TMDB identity exists;
   - **IMDb** link when a valid acquired identity exists;
   - **Letterboxd history:** last successful authoritative export acquisition
     date and, when relevant, **Recent public activity also checked by RSS**;
   - **Movie metadata:** **TMDB, refreshed {date}**, **TMDB not configured**,
     **No confident TMDB match**, or **TMDB metadata unavailable**;
   - required TMDB attribution and the exact notice **This product uses the TMDB
     API but is not endorsed or certified by TMDB.** in the compact disclosure
     or an immediately reachable application-level attribution view.

Source-recorded and ingested timestamps are not primary metadata. A **Technical
provenance** disclosure under Sources may show connection label, parser version,
first/last observation times, and evidence roles for diagnosis. It must not dump
raw imported content or opaque IDs into the ordinary inspector.

### History tab

The tab label includes the lifetime active occurrence count. Each viewing row
contains, in order:

1. watched day formatted as a calendar date, or **Watched — date unknown**;
2. **Matches filter** when applicable;
3. occurrence rating as `n.n / 5`, when present;
4. **Marked as a rewatch** when source asserted;
5. complete exported review text, preserving paragraphs and line breaks, when
   present;
6. **Open Diary entry** or **Open review on Letterboxd** when a Diary/review URI
   exists; otherwise **Open film on Letterboxd**; and
7. a compact evidence disclosure with source-recorded day/instant, source
   connection, and evidence roles. It must label source-recorded time as
   **Recorded by Letterboxd**, never **Watched**.

Imported review text is plain user-authored text. Do not render it as HTML.
Outbound links must be validated and use safe external-link behavior.

History loads 25 rows initially and uses an explicit **Load older viewings**
button. The undated watched-only row is returned after all dated rows. Selecting
an occurrence is not a new route or second inspector; it expands that row in
place and updates focus within the existing History tab.

## Search

Search is scoped to the current Movies tab and all matching server-side records,
not the loaded page. It targets:

1. imported Letterboxd title;
2. current TMDB title, original title, and acquired alternative titles;
3. release year as a four-digit token;
4. director names;
5. optional projected top-cast names;
6. genre names; and
7. exported personal review text.

It does not search raw RSS HTML, raw export files, source IDs, Letterboxd list
content, unaccepted TMDB candidates, or current watch-provider availability.

Normalize case and Unicode and use D1 FTS5 with `unicode61` and diacritic
removal. Whitespace-separated terms use AND semantics. A quoted phrase remains
a phrase. The final unquoted token supports prefix matching after two
characters. Search ranking is used only when `sort=relevance`; otherwise search
is a predicate and the selected explicit sort controls order. Search snippets
may identify a review match in list view or the inspector, but grid cards do not
show review excerpts.

Empty search behaves as no search. Search text shorter than two non-whitespace
characters is accepted as a literal title substring fallback and must not issue
an invalid FTS prefix query. Search is debounced in the client, but every query
is validated and executed by the API.

## Filters

All filtering is server-side. Filter choices and counts come from accepted
projections, never raw-object parsing in a browse request. Null is a deliberate
value and is not silently included in a range.

### Archive filters

| Label        | URL/API values                                                                                                           | Source and semantics                                                                                                                                                                     |
| ------------ | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Watched date | `watched=all` (default), `watched=range` with inclusive `watchedFrom`/`watchedTo`, or `watched=unknown`                  | Active Archive occurrences. A range includes an item when any occurrence's source-asserted watched day is in range; unknown includes movies with at least one active undated occurrence. |
| Release year | inclusive `releaseYearFrom`/`releaseYearTo`; optional `releaseYearUnknown=true`                                          | Letterboxd year, refined by accepted TMDB date without destroying the imported value. Range excludes unknown unless the explicit unknown option is selected.                             |
| Your rating  | `rating=any` (default), `rated`, `unrated`, or inclusive `ratingMin`/`ratingMax` in `0.5` increments from `0.5` to `5.0` | Current film-level Letterboxd rating only.                                                                                                                                               |
| Review       | `reviewed=any` (default), `yes`, or `no`                                                                                 | Presence of exported review text on any active occurrence.                                                                                                                               |
| Runtime      | `runtime=any` (default), `under90`, `90to119`, `120to149`, or `150plus`; optional `runtimeUnknown=true`                  | Accepted TMDB runtime in minutes. Bounds are `<90`, `90–119`, `120–149`, and `>=150`. Hide the control until runtime exists for at least one movie.                                      |

`watched=range` requires at least one bound; one-sided ranges are valid. A date
range and `watched=unknown` are mutually exclusive. `releaseYearUnknown` and
`runtimeUnknown` are additive OR choices within their facet, so the user can
request a numeric range/bucket plus unknown values explicitly.

### Queue filters

| Label          | URL/API values                                                                                | Source and semantics                                                                         |
| -------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Added date     | `added=all` (default), `added=range` with inclusive `addedFrom`/`addedTo`, or `added=unknown` | Current Letterboxd watchlist membership's source-added day.                                  |
| Release year   | same as Archive                                                                               | Same field and unknown behavior as Archive.                                                  |
| Your rating    | same as Archive                                                                               | Current film-level rating; Queue and Archive overlap is allowed.                             |
| Archive status | `archive=any` (default), `yes`, or `no`                                                       | Whether at least one active Archive occurrence exists. This does not alter Queue membership. |
| Runtime        | same as Archive                                                                               | Accepted TMDB runtime projection.                                                            |

Queue does not expose Review as a first-level filter; use the Archive tab for
review-specific exploration. Neither tab filters by Liked, number of watches,
Genre, or Source. Letterboxd is the sole approved Movies relationship source,
and TMDB is enrichment rather than membership evidence.

Facet counts are calculated against the current query and all other filters,
excluding the facet whose choices they describe. This permits meaningful option
counts without filtering a facet by itself.

## Sorts

All sorts are stable, server-side, and cursor-compatible. Null primary values
sort after known values in both directions. Unless stated otherwise, ties use
normalized display title ascending and then media item ID ascending.

### Archive sorts

| Label        | `sort`           | Directions       | Default         | Primary value                                                                            |
| ------------ | ---------------- | ---------------- | --------------- | ---------------------------------------------------------------------------------------- |
| Watched date | `watchedAt`      | `desc`, `asc`    | **Yes: `desc`** | Latest matching known watched day under a date range; otherwise latest known watched day |
| Title        | `title`          | `asc`, `desc`    | No              | Normalized display title                                                                 |
| Release year | `releaseYear`    | `desc`, `asc`    | No              | Display release year                                                                     |
| Your rating  | `personalRating` | `desc`, `asc`    | No              | Current film-level rating                                                                |
| Most watched | `watchCount`     | `desc`, `asc`    | No              | Lifetime active occurrence count                                                         |
| Runtime      | `runtime`        | `asc`, `desc`    | No              | TMDB runtime minutes; hide until available                                               |
| Relevance    | `relevance`      | fixed best-first | No              | FTS rank; available only with nonempty search                                            |

For `watched=unknown`, `watchedAt` has no meaningful primary value; the API
orders by title ascending and the UI labels the selected sort **Title**. For a
date range, watch count remains lifetime count; only the reference date and the
matching count are range-relative.

### Queue sorts

| Label          | `sort`           | Directions       | Default         | Primary value                                 |
| -------------- | ---------------- | ---------------- | --------------- | --------------------------------------------- |
| Recently added | `addedAt`        | `desc`, `asc`    | **Yes: `desc`** | Watchlist-added day                           |
| Title          | `title`          | `asc`, `desc`    | No              | Normalized display title                      |
| Release year   | `releaseYear`    | `desc`, `asc`    | No              | Display release year                          |
| Your rating    | `personalRating` | `desc`, `asc`    | No              | Current film-level rating                     |
| Runtime        | `runtime`        | `asc`, `desc`    | No              | TMDB runtime minutes; hide until available    |
| Relevance      | `relevance`      | fixed best-first | No              | FTS rank; available only with nonempty search |

Sort direction is explicit in the URL as `direction=asc|desc`. Relevance omits
direction. The API rejects unsupported membership/sort combinations rather than
silently changing them.

## Counts

Counts use the same active-state, search, and filter predicates as the collection
query and are independent of the loaded page.

Archive displays:

- unfiltered tab count: unique active Archive movie items;
- filtered primary count: matching unique movies;
- filtered secondary count: matching active viewing occurrences. Under a date
  range this is occurrences in the range; under `watched=unknown` it is undated
  active occurrences; otherwise it is all active occurrences belonging to the
  matching items; and
- card/row count: lifetime watches, with matching count also shown when a date
  filter makes them differ.

Use exact nouns: **1 movie · 1 watch**, **12 movies · 15 watches**. A watched-only
movie contributes one movie and one undated watch.

Queue displays matching unique active watchlist movies. It does not use an
occurrence count. The Queue tab also exposes the number of matching items that
are also in Archive to support the Archive-status facet, but the header remains
the simpler **n movies**. Counts describe the latest successful complete export
and the UI shows **Watchlist imported {date}** near the Queue count.

The media-type navigation count is the unfiltered Archive unique-movie count.
Archive and Queue tab counts are fetched together so switching tabs does not
temporarily present a loaded-page count as a total.

## Date semantics

- Letterboxd `Watched Date` is a source-asserted calendar day. Compare inclusive
  ISO calendar days directly; do not convert them through UTC or the browser
  timezone.
- A watched-only film has `consumed_at = null`. Export `Date`, RSS `pubDate`,
  import time, and TMDB release date are not substitutes.
- Export `Date` for watched, rating, like, or review rows is source-recorded
  activity time and belongs only in evidence disclosure where useful.
- Watchlist `Date` is a source-asserted added-to-watchlist day. It may sort and
  filter Queue but must never be labeled as watched or consumed.
- RSS `pubDate` is a publication/update instant and never a viewing time.
- Letterboxd/TMDB year or release date describes the movie, not the owner's
  relationship to it.

Unknown watched dates and unknown Queue-added dates remain queryable explicit
states. Date sorts put them last. Default counts include them. A known-date range
excludes them unless the corresponding unknown option is explicitly selected.

## Artwork and enrichment fallback

Artwork resolution is deterministic:

1. use the accepted TMDB poster path and the configured size appropriate to the
   rendered pixel density;
2. otherwise use the standard local missing-movie-art tile, with the first
   meaningful title character and release year when known.

Do not use RSS `description` images, scrape Letterboxd, use unaccepted candidate
artwork, or keep showing an expired image when provider policy requires removal.
The fallback must retain the same 2:3 geometry to avoid collection reflow.

Metadata failure states are:

- **not configured:** no TMDB credential; local Movies remains fully usable;
- **pending:** enrichment has not run or a refresh is in progress; keep local
  facts visible and use the ordinary artwork fallback, not a blocking page
  skeleton;
- **unmatched:** candidate search returned no acceptable match;
- **ambiguous:** more than one acceptable candidate or conflicting evidence;
- **not found/unavailable:** an accepted ID currently has no usable TMDB result;
- **stale/error:** refresh failed; display the last permitted cache only if the
  provider policy allows it and disclose the refresh date in Sources.

Collection cards do not show technical enrichment badges. The inspector Sources
section presents **No confident TMDB match** for unmatched or ambiguous items.
No candidate chooser appears in this delivery.

## Other missing and empty states

- Null title renders **Untitled movie** as a presentation fallback only. It is
  not written back to `media_items` and does not become a matching input.
- Missing year, director, runtime, synopsis, genre, rating, review, or optional
  credit is omitted except in stable list columns, which use an em dash.
- No current rating shows no stars or zero value; it participates in **Unrated**.
- Not liked is the absence of the positive heart, not a broken-heart icon.
- An empty Archive says **No movies in Archive** and identifies Letterboxd import
  as the source path.
- An empty Queue says **No movies in Queue** and, when no authoritative export
  with watchlist coverage exists, distinguishes **Watchlist has not been
  imported** from a verified empty watchlist.
- A valid empty search/filter result says **No matching movies** and offers
  **Clear search and filters** without clearing Archive/Queue or view choice.
- A collection request failure keeps the shell and offers **Try again**. A TMDB
  failure alone never becomes a collection failure.
- A failed detail request leaves the selected item shell and row data visible,
  states **Details could not be loaded**, and offers retry. Rapid selection must
  never show the prior movie's details under the new title.
- Partial or failed Letterboxd exports must not clear Queue, likes, or ratings.
  Queue freshness continues to name the most recent successful complete export.

## Selection and URL state

The canonical routes are:

```text
/library/movies/archive
/library/movies/queue
```

The following nondefault state is represented in the query string:

```text
q
view
sort
direction
item
watched, watchedFrom, watchedTo
added, addedFrom, addedTo
releaseYearFrom, releaseYearTo, releaseYearUnknown
rating, ratingMin, ratingMax
reviewed
archive
runtime, runtimeUnknown
```

Unsupported parameters for the current tab are rejected by the API and removed
by the client when navigating between tabs. Defaults are omitted. Filter values
are canonicalized so semantically identical URLs share query/cache keys.

`item={mediaItemId}` opens the inspector. The detail endpoint may return an item
that is Queue-only; it must not require an active Archive entry. Selecting an
item pushes URL history. Closing inspection removes `item` and restores focus to
the originating card/row. Browser Back closes or reopens inspection before
leaving the collection. Refresh and copied URLs restore the query and selected
item. If a filter change excludes the selected item, close the inspector and
restore focus to the filter control that caused the change.

The inspector tab and expanded history row are ephemeral, not URL state.
Sidebar collapse, theme, and default view preference are user preferences, not
collection query parameters. The client preserves loaded pages and scroll for
the current canonical URL during inspector open/close and browser Back within
the session.

## Pagination

Collection pagination is server-side keyset pagination with an opaque cursor
bound to the normalized query, filter set, membership, sort, direction, and last
row's complete stable sort tuple. A cursor from a different query returns a
stable bad-request error rather than producing mixed results.

- Grid requests 48 movies per page.
- List requests 50 movies per page.
- The API permits `limit` from 1 through 100.
- The UI uses an explicit **Load more movies** button, not automatic infinite
  scroll. It reports **Showing n of filteredCount movies**.
- A new search, filter, sort, tab, or view page-size change discards cursors and
  starts from the first page.
- Returning from the inspector preserves the loaded page stack.
- After an import or enrichment update, invalidate the collection and restart
  pagination; this remains a live collection rather than a frozen snapshot.

The cursor tuple includes the null-rank, primary sort value, normalized title
where it is a tie-breaker, and media item ID. This preserves stable ordering for
unknown dates and identical titles. Relevance cursors include the normalized FTS
rank and ID.

History pagination is separate, 25 active occurrences per page, ordered by
known-date null-rank, watched day descending, and occurrence ID. History counts
do not depend on whether all pages are loaded.

## Required HTTP contracts

The current `GET /api/media` and `GET /api/media/:id` contracts are too small and
Archive-only. Movies requires validated Library contracts assembled by repository
or service code, not SQL or raw-object parsing in Hono routes.

### `GET /api/library/movies`

Required query parameters are the URL values defined above plus:

- `membership=archive|queue` when the route is not inferred from client routing;
- `limit`; and
- opaque `cursor`.

Each summary row returns:

```text
id, type=movie
displayTitle, importedTitle
releaseYear
poster { provider, path/url, width?, height?, attributionRequired } | null
directors [{ id?, name }]
runtimeMinutes | null
genres [{ id, name }]
personal { currentRating { value, minimum=0.5, maximum=5 } | null,
           liked, reviewed }
archive { active, lifetimeWatchCount, matchingWatchCount,
          latestKnownWatchedOn, referenceWatchedOn,
          hasUnknownWatchedDate }
queue { active, addedOn }
enrichment { provider='tmdb' | null,
             status, refreshedAt | null }
```

The response also returns:

```text
nextCursor
totalCount                 # unfiltered unique items in current membership
filteredCount              # filtered unique items
filteredOccurrenceCount    # Archive only; null for Queue
overlapCount               # Queue items also active in Archive
membershipCounts { archiveItems, archiveOccurrences, queueItems }
facets
sourceFreshness { lastCompleteExportAt, lastRssSuccessAt }
```

`facets` contains the exact value/count sets needed by the filters: date unknown,
release-year bounds and unknown, rating buckets and unrated, reviewed,
Queue/Archive overlap, runtime buckets, and runtime unknown.
Facet computation follows the self-exclusion rule above.

### `GET /api/library/movies/:id`

The detail response includes the summary shape plus:

- TMDB overview, original title/language, full release temporal value, optional
  tagline/backdrop/countries, optional TMDB rating/count, and bounded cast;
- all membership summary fields;
- review count and history count without loading every history row;
- Letterboxd film link, TMDB link, and validated IMDb link;
- imported Letterboxd title/year when they differ from display values;
- enrichment status and refresh time;
- Letterboxd export/RSS freshness; and
- compact provenance summary.

Return detail when the item has an active Archive entry or active Queue entry.
Do not create a media item or membership during a GET.

### `GET /api/library/movies/:id/history`

Query: `limit` (default 25, maximum 100), `cursor`, and the current Archive
watched-date filter solely to calculate `matchesFilter`.

Each row returns:

```text
archiveEntryId
watchedAt { value, precision='day', basis='source_asserted' } | null
sourceRecordedAt temporal | null
rating { value, minimum, maximum } | null
reviewText | null
sourceRewatch | null
matchesFilter
letterboxdLogUrl | null
letterboxdFilmUrl
connection { id, label }
evidenceSummary [{ role, parserVersion, observedAt }]
```

The endpoint returns active occurrences by default. Removed/superseded evidence
belongs in technical provenance, not the ordinary active history count.

All three endpoints must validate responses with shared Zod contracts and return
stable error codes for invalid filter combinations, cursor/query mismatch,
unsupported sort, missing item, and temporarily unavailable collection data.

## Required Letterboxd acquisition and projections

### Export parsing and reconciliation

The parser must create addressable source records for selected fields rather
than treating the ZIP as an opaque browse-time dependency:

- `watched.csv`: film identity, imported title/year, source-recorded day, and
  undated Archive admission where no Diary occurrence accounts for the film;
- `diary.csv`: Diary identity, watched day, occurrence rating, rewatch flag, and
  source-recorded day;
- `reviews.csv`: review text reconciled to its Diary identity;
- `ratings.csv`: current/default film rating, independent of occurrence rating;
- `likes/films.csv`: current film-level like;
- `watchlist.csv`: current Queue membership and source-added day; and
- deleted/orphaned Diary/review files as retained state/evidence without erasing
  local history.

Stable film URIs reconcile watched, rating, like, and watchlist rows to one movie.
Diary URIs remain occurrence identities. Exact title/year fallback inside one
export must surface ambiguity as unresolved rather than merging. Queue-only
watchlist films must create inspectable media items and global Letterboxd film
identities even when they have no Archive entry.

Every successful complete export defines complete snapshots for watchlist,
film likes, and current ratings:

- upsert rows present in the snapshot;
- retire watchlist membership absent from the newer complete snapshot;
- project like false when absent from the newer complete likes snapshot;
- clear the current rating when absent from the newer complete ratings snapshot;
- preserve the prior observations and link the new evidence for the state
  change; and
- perform no absence-based clearing after a partial, failed, unsupported-version,
  or interrupted import.

Watchlist retirement uses the newer export acquisition time as the time the app
observed removal. It does not invent a source removal day. Watching a queued
movie, an RSS absence, or a Diary import never retires Queue membership.

### RSS

RSS continues to provide recent public occurrences, edits within the finite
window, and exact TMDB identities. Keep the current rules: preserve the raw XML,
do not treat absence as deletion, prefer stable Diary identities, and use the
reviewed exact reconciliation fallback only when unambiguous.

Project `tmdb:movieId` as a global external identity. Retain `memberLike`, RSS
HTML, and poster URL as evidence only in this phase. Do not let them override the
complete-export current-like projection or become display artwork. Exported
plain-text reviews remain the review projection; RSS review parsing is deferred.

### Personal-state and Queue projections

Add queryable current projections with evidence lineage. Logical fields are:

```text
letterboxd_movie_state
  media_item_id, connection_id
  current_rating_value/minimum/maximum | null
  rating_source_record_id | null
  liked boolean
  like_source_record_id | null
  last_complete_export_raw_object_id
  updated_at

queue_entries
  id, media_item_id, connection_id
  source_membership_key
  added_at_value/precision/basis | null
  upstream_state
  first_observed_source_record_id
  last_observed_source_record_id
  retired_observed_at | null
  created_at, updated_at

queue_entry_evidence
  queue_entry_id, source_record_id
  role = membership | added_time | removal
  linked_at
```

The exact table names may follow a reviewed generic Queue ADR, but these fields,
uniqueness, and evidence semantics are required. Enforce unique
`(connection_id, source_membership_key)`. Queue membership must remain distinct
from Archive so later local intent and upstream mirroring can be added without
rewriting consumption history.

## Required TMDB matching and projections

### Match order

1. Use an already attached global `tmdb/movie_id` identity.
2. If a trustworthy IMDb identity exists, use TMDB `/find/{external_id}` and
   accept only one movie result with that exact external identity.
3. Otherwise search the imported title with the imported release year.

Search auto-acceptance is deliberately conservative. Accept only when exactly
one movie candidate has:

- resource type `movie`;
- release-date year exactly equal to the imported Letterboxd year; and
- either `title` or `original_title` exactly equal after case folding, Unicode
  normalization, punctuation/whitespace normalization, and removal of a leading
  article only when the same transformation is applied to both sides.

Do not use popularity, vote average, artwork similarity, fuzzy edit distance, or
the top search position as identity evidence. Zero accepted candidates is
`unmatched`; more than one is `ambiguous`. Neither state attaches a TMDB
external identity or any candidate metadata. A later refresh may retry, but
there is no silent fallback to the best score.

Every accepted match records method (`rss_id`, `imdb_find`, or
`exact_title_year_search`), source input, provider identity, acceptance version,
and the supporting source record or match-attempt record. The policy is an
explicit reviewable reconciliation rule; changing it requires a new version and
replay, not in-place undocumented rematching.

### Catalog projection

Keep current TMDB data outside immutable source evidence. The queryable logical
projection contains:

```text
movie_catalog_profiles
  media_item_id, provider='tmdb', provider_movie_id
  display_title, original_title, original_language
  overview, release_date, runtime_minutes
  poster_path, backdrop_path, tagline
  imdb_id
  optional vote_average/vote_count
  fetched_at, refreshed_at, expires_at | null
  status, last_safe_error | null

movie_catalog_genres
  media_item_id, provider_genre_id, name, display_order

movie_catalog_credits
  media_item_id, provider_person_id | null, name
  role = director | cast
  job_or_character | null, display_order

movie_catalog_countries
  media_item_id, country_code, name, display_order
```

Project all directors and at most ten top-billed cast members so the inspector
can show five and search can remain bounded. Alternative titles may be projected
for search only after the probe verifies the endpoint/field and retention rule;
they are not an extra visible title list.

Store the provider's poster/backdrop path and necessary image metadata rather
than treating a composed CDN URL as an identity. Validate the path before URL
construction. A removed or expired cache clears derived browse/search fields as
required without touching Letterboxd facts or membership.

## Query projection and index requirements

Browse requests must not aggregate the full ledger, unzip exports, parse XML, or
call TMDB. Maintain a rebuildable `movie_library_projection` (table or equivalent
repository-owned derived projection) with one row per movie:

```text
media_item_id
normalized_display_title
display_title, imported_title
release_year | null
director_sort_text | null
runtime_minutes | null
current_rating_value | null
liked, reviewed
archive_active, active_watch_count, latest_known_watched_on,
has_unknown_watched_date
queue_active, queue_added_on | null
poster_provider/path | null
enrichment_status, enrichment_refreshed_at | null
projection_updated_at
```

This is a disposable read model. Authoritative facts remain in ledger,
relationship, Queue, and catalog tables. Imports, Queue reconciliation,
occurrence state changes, current-rating/like changes, accepted matches, and
catalog refresh/expiry must update or rebuild affected rows transactionally with
their D1 writes.

Required indexes, expressed by leading columns and stable ID tie-breaker, are:

```text
movie_library_projection (archive_active, latest_known_watched_on DESC, media_item_id)
movie_library_projection (archive_active, normalized_display_title, media_item_id)
movie_library_projection (archive_active, release_year DESC, media_item_id)
movie_library_projection (archive_active, current_rating_value DESC, media_item_id)
movie_library_projection (archive_active, active_watch_count DESC, media_item_id)
movie_library_projection (archive_active, runtime_minutes, media_item_id)

movie_library_projection (queue_active, queue_added_on DESC, media_item_id)
movie_library_projection (queue_active, normalized_display_title, media_item_id)
movie_library_projection (queue_active, release_year DESC, media_item_id)
movie_library_projection (queue_active, current_rating_value DESC, media_item_id)
movie_library_projection (queue_active, runtime_minutes, media_item_id)

archive_entries (upstream_state, consumed_at_value, media_item_id, id)
archive_entries (media_item_id, upstream_state, consumed_at_value DESC, id)
queue_entries (connection_id, upstream_state, added_at_value DESC, media_item_id)
queue_entries (media_item_id, upstream_state)
letterboxd_movie_state (liked, media_item_id)
letterboxd_movie_state (current_rating_value, media_item_id)
movie_catalog_genres (provider_genre_id, media_item_id)
movie_catalog_credits (role, normalized_name, media_item_id)
external_identities (namespace, external_type, external_id) # existing global uniqueness remains authoritative
```

Use partial indexes for active Archive/Queue rows where D1 query plans benefit,
while retaining full evidence rows. Add a targeted review-presence index or
maintain `reviewed` in the read model; do not scan review bodies for the boolean
facet.

Create an FTS5 index keyed by media item ID over imported title, display title,
original/alternative titles, director names, bounded cast names, genre names,
and projected review text. Keep the FTS row synchronized through explicit
repository writes or tested triggers. Review changes, catalog refresh/expiry,
and title changes must update it deterministically. Search tests must verify that
expired/unaccepted catalog content is removed.

Before finalizing indexes, run `EXPLAIN QUERY PLAN` against synthetic collections
covering at least 25,000 movies and repeated histories. Archive date matching,
Queue added-date range, every sort, facet counts, and keyset continuation must
use bounded indexed work appropriate for D1. Do not add all indexes mechanically
without measuring their write and storage cost; any consolidation must still
demonstrate the specified query coverage.

## Acceptance examples

The implementation is conformant only if these cases work:

1. A movie watched in 2022 and 2025 appears once in either year's Archive
   filter. The card references the matching watch, the header count includes the
   matching occurrences, and History shows both with one marked as matching.
2. A watched-only film appears in Archive, sorts after dated films for date
   sorts, can be selected by **Watched date: Unknown**, and shows no substituted
   export or import date.
3. A movie present in both watched history and the watchlist appears once in
   each tab. Importing a watch does not remove Queue; only a later successful
   complete export that omits the watchlist row retires it.
4. A movie's current rating is 4.5 while an older viewing is rated 3.5. The
   collection and **Your relationship** show 4.5; the viewing row shows 3.5.
5. A reviewed occurrence with no current rating is searchable by review text,
   matches **Reviewed**, and remains **Unrated** for the current-rating facet.
6. A liked film shows that relationship in the inspector. A failed newer export
   cannot clear that state.
7. A Queue-only film opens the same inspector without an Archive entry. History
   shows a true empty state rather than failing the detail request.
8. A direct RSS TMDB ID enriches the existing Letterboxd movie without creating
   a second item. TMDB downtime leaves the local movie and history visible.
9. An export-only title/year search with two accepted candidates attaches no
   TMDB identity, artwork, or metadata and reports **No confident TMDB match** in
   Sources.
10. Missing poster, overview, director, runtime, rating, review, and date render
    without broken images, invented prose, or empty administrative sections.
11. Counts, facet counts, and every sort remain correct beyond the first page;
    loading page two produces no duplicate or skipped item for equal primary
    values.
12. Refreshing a deep link restores tab, query, filters, view, sort, and
    selected item; browser Back closes the inspector and restores focus and
    scroll.
13. Expiring or removing a TMDB cache removes its searchable text and artwork
    while leaving imported title/year, Letterboxd links, Archive, Queue, ratings,
    likes, reviews, and history intact.

## Implementation gate

Implementation may proceed on Letterboxd projections, Queue, local contracts,
and the sparse UI before TMDB is configured. TMDB-dependent fields, filters,
sorts, and optional sections remain hidden until the credentialed probe and
provider-storage ADR are complete. Their absence is a known prerequisite, not a
reason to block or misrepresent the local Movies surface.

When implementation begins, add synthetic fixtures for every acceptance example,
complete-snapshot removal, partial/failed export preservation, exact and
ambiguous matching, cache expiry, missing artwork, long titles/reviews, and
keyset ties. Run the repository's full validation gate only after the final code
or test change.
