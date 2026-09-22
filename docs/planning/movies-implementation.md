# Movies end-to-end implementation plan

Status: Letterboxd slice, refreshable TMDB enrichment, and full local catalog
backfill implemented; real-data visual acceptance complete; final UX iteration remains
Last updated: 2026-09-21

The evidence-aware follow-up backfill resolved all seven local export/RSS
identity collisions and matched Letterboxd-logged series through separate TMDB
TV identities without changing their Library section. The current local
projection has 673 items: 669 matched, zero ambiguous, and four unmatched;
Archive has 371 and Queue has 309. The revised acceptance rule is recorded in
[ADR 0013](../decisions/0013-tmdb-letterboxd-match-evidence.md). The four
remaining unmatched entries need item-level review rather than a generic
search-score fallback. The owner has chosen to leave those four unmatched for
now; this hardening pass does not attempt to force a match.

## Purpose

Movies is the second production Library vertical slice. It should prove that the
Books foundation can support another media type without turning the shared shell
or canonical ledger into a lowest-common-denominator model.

This plan converts the approved Movies surface contract into a sequenced build.
It treats Letterboxd as the authority for personal history and current
relationships, TMDB as replaceable catalog enrichment, and the Movies browse
projection as rebuildable application data.

## Outcome

At completion, Imladris will have:

- Library > Movies with Archive and Queue routes.
- A poster grid and compact list using the approved information density.
- Server-side search, filters, sorts, exact counts, and keyset pagination.
- A Movies inspector with Details and History tabs.
- Complete Letterboxd export projection for watched state, Diary occurrences,
  reviews, current ratings, likes, and watchlist membership.
- Hourly RSS additions reconciled with export history without duplicating
  viewings.
- TMDB-backed posters and catalog facts where a conservative match is known.
- Explicit unmatched, ambiguous, missing, and stale-enrichment states.
- A reusable source-derived Queue substrate for later Articles, Podcasts, and
  Videos, without adding local Queue editing or write-back.

## Scope

### Included

- Letterboxd Archive and watchlist-derived Queue browsing.
- Complete-snapshot reconciliation of current Letterboxd relationships.
- Preservation of all supported viewings, reviews, ratings, likes, source links,
  and source dates.
- A versioned parser and replay path for the retained account export.
- Conservative TMDB identity resolution and current catalog caching.
- Movie collection, detail, History, and facet APIs.
- Grid/list layouts, inspector behavior, URL state, missing-data states, and
  responsive behavior in the existing production shell.
- Empty-database and upgrade migrations, replay tests, browser coverage,
  performance checks, and visual QA with real imported data.

### Excluded

- Editing the Letterboxd watchlist, ratings, likes, reviews, or Diary.
- A locally editable Queue or automatic Letterboxd write-back.
- Scraping Letterboxd pages.
- Letterboxd lists or tags.
- Genre, liked, rewatch, source, or evidence filters.
- Watch-provider availability, trailers, recommendations, person pages, release
  calendars, or arbitrary catalog discovery.
- OMDb integration.
- Chat, Recaps, embeddings, or natural-language search.
- Storing TMDB artwork bytes in R2 unless a later policy decision explicitly
  requires and permits it.

## Accepted product behavior

These choices come from the owner-approved Movies contract and should not be
reopened during implementation unless real source behavior contradicts them.

### Collections

- Movies has exactly two views: Archive and Queue.
- Archive contains each distinct movie with at least one active Letterboxd
  watched-state or Diary occurrence.
- Queue contains the latest successfully imported Letterboxd watchlist.
- Archive and Queue are independent. A movie explicitly present in a complete
  watchlist snapshot remains in Queue even when it also has viewing history.
- Queue is export-derived and therefore labeled by its last successful snapshot;
  RSS is not evidence of watchlist membership or removal.
- A queue-only movie is a first-class inspectable Library item.

### Occurrences and personal state

- Every Diary row represents a distinct supported viewing occurrence.
- A watched-only film receives one undated watched-state occurrence only when no
  Diary occurrence already accounts for the watched fact.
- The Letterboxd export `Date` is a source activity date, not a watched date.
- Per-Diary rating and review remain attached to that occurrence.
- Current film rating and liked state are film-level relationships and remain
  separate from occurrence facts.
- Collection occurrence filters may match any supported viewing. When several
  viewings match, row/card context and occurrence-dependent sorting use the
  latest matching viewing. Without an occurrence filter, they use the latest
  supported viewing.
- History always returns all supported viewings, including those outside the
  active collection filter.

### Grid and list

- Grid is the default layout.
- A grid card contains poster, title, release year, and director names only.
- Archive list columns are Movie, Director, Last watched, and Your rating.
- Queue list columns are Movie, Director, Added, and Your rating.
- Dense facts such as runtime, genres, overview, cast, like state, full review,
  and source evidence belong in the inspector.
- Poster cards use a fixed 2:3 image region so missing or slow artwork never
  causes layout shift.

### Search

Search covers, when available:

- Letterboxd/imported title;
- TMDB current title, original title, and alternative titles;
- release year;
- directors;
- the projected top cast;
- genres; and
- imported review text.

Use SQLite FTS with `unicode61`. Escape user input safely. If a very short query
cannot produce a useful FTS term, use a bounded literal fallback rather than
silently returning no results.

### Filters

Archive supports:

- watched date: any, inclusive range, or date unavailable;
- release year: inclusive range or unavailable;
- current personal rating: rated, unrated, or an inclusive minimum/maximum
  range;
- reviewed: reviewed or not reviewed; and
- runtime: approved buckets or unavailable.

Queue supports:

- added date: any, inclusive range, or unavailable;
- release year: inclusive range or unavailable;
- current personal rating: rated, unrated, or an inclusive minimum/maximum
  range;
- Archive status: in Archive or not in Archive; and
- runtime: approved buckets or unavailable.

No first release should expose liked, watch count, rewatched, genre, source, or
evidence filters.

### Sorting

Archive supports:

- Watched date, descending by default;
- Title;
- Release year;
- Your rating;
- Most watched;
- Runtime; and
- Relevance when search is present.

Queue supports:

- Added, descending by default;
- Title;
- Release year;
- Your rating;
- Runtime; and
- Relevance when search is present.

Unknown values sort after known values in either direction. Normalized title and
canonical media item ID are stable final tie-breakers. Relevance is valid only
with a nonempty search. Changing collection clears an incompatible sort and its
direction while retaining compatible query state.

### Inspector

Details owns catalog and source facts:

- poster and optional backdrop;
- current title, original title when different, and release date/year;
- directors and projected top cast;
- overview and tagline when present;
- runtime, genres, original language, and production countries;
- TMDB community rating with vote count, visually distinct from the owner's
  rating;
- Letterboxd, TMDB, and IMDb links when known; and
- source/enrichment freshness and missing-data disclosure.

History owns personal activity:

- current Archive and Queue memberships;
- current Letterboxd rating and liked state;
- watchlist-added date when supplied;
- every supported viewing, newest first;
- each viewing's watched date or explicit unavailable date, rating, rewatch flag,
  review, and source link; and
- collapsed technical provenance when useful for diagnosis.

Empty sections are omitted. Current TMDB metadata never overwrites immutable
historical Letterboxd assertions.

### Canonical URLs

- `/library/movies/archive`
- `/library/movies/queue`

Validated URL search parameters own query, filters, sort, direction, view, and
selected movie. Appearance, sidebar state, loaded-page cache, and scroll are not
encoded as collection predicates.

## Current implementation assessment

### Implemented through Stage 5

- The export parser builds its film universe from watched, ratings, likes, and
  watchlist files, so Queue-only movies are first-class canonical items.
- A generic evidence-backed source Queue, Letterboxd current-state/viewing
  projections, Movies browse projection, and FTS index are implemented.
- Complete exports reconcile absent watchlist, liked, and current-rating state
  only after the replacement snapshot is durably written. Archive history is
  retained.
- Archive and Queue collection APIs provide server-side search, approved
  filters/sorts, exact counts, query-bound keyset cursors, queue-only detail,
  and paginated History.
- Production Movies routes provide grid/list layouts, URL-backed state,
  presentation-independent page caching, responsive inspection, and explicit
  Letterboxd-only fallbacks.
- Nested RSS entities are normalized, and replay reconciliation merges an
  exact unambiguous legacy title/year duplicate only when one proven
  RSS-created occurrence and one active same-day occurrence evidenced by a
  Diary row in the current complete export and the same connection form the
  repair witness. Evidence remains append-only; removed,
  cross-connection, and multiple-occurrence cases are not auto-merged.
- Changed RSS feeds rebuild Movies viewing and browse/search projections before
  cursor advancement, so RSS-only additions, watch counts, corrected latest
  dates, and History links appear without waiting for another export.
- Focused repository, connector, API, route-state, and browser regressions cover
  these behaviors. Real-data visual QA covered both collections, both layouts,
  and the Details/History inspector.

### Implemented TMDB enrichment

- The credentialed live probe, refreshable-cache ADR, typed bearer-token client,
  conservative exact-ID/IMDb/title-year matcher, migration 0019, bounded durable
  jobs, normalized profiles/relationships, projection activation, and source
  disclosure are implemented.
- Provider failure or ambiguity preserves the complete Letterboxd-only experience.
- The full local backfill completed on 2026-09-21. The current 680-item Movies
  projection contains 615 conservative matches, 31 ambiguous outcomes, and 34
  unmatched outcomes. Seven ambiguous rows are explicit local identity
  collisions: a previously assigned TMDB identity is never attached to a second
  local movie, and the colliding row receives no TMDB profile.
- The same post-backfill projection retained 374 active Archive movies and 309
  active Queue movies. Catalog refresh did not mutate Letterboxd membership.

The retained real export previously measured 363 watched films, 211 Diary
occurrences across 180 films, 183 watched-only films, 355 current ratings, 288
liked films, and 309 watchlist entries. These are sanity-check baselines, not
fixtures or product constants. Re-measure them during implementation because a
new export may differ.

An isolated parser-v6 replay against the copied real local state on 2026-09-20
processed 670 unioned film identities and produced 371 active Archive movies,
402 active viewing occurrences, 309 Queue movies, and three Archive/Queue
overlaps. Three legacy RSS/export duplicates were retired into their canonical
same-day occurrence while retaining source evidence.

## Recommended architecture

```text
Letterboxd export + RSS
  -> immutable raw objects and source records
  -> source-owned movie relationships and occurrence metadata
  -> canonical movie identities and Archive occurrences
  -> source-derived Queue entries with evidence
                                      \
TMDB API -> refreshable catalog cache -> conservative identity matches
                                      /
                rebuildable Movies read model + FTS
                  -> Movies repository and Hono routes
                  -> shared contracts and query hooks
                  -> URL-driven collection and inspector
```

### Ownership boundaries

- R2 raw objects and `source_records` retain replayable source evidence.
- Letterboxd projections own current imported relationships and
  source-specific occurrence fields.
- The canonical ledger owns stable media identity and consumption occurrences.
- Queue rows own current source-derived membership, not consumption.
- TMDB tables are a replaceable, refreshable provider cache with explicit
  matching provenance.
- The Movies read model is rebuildable from those authorities and exists for
  fast browsing only.
- The Movies API defines movie-specific filter, count, sort, cursor, and History
  semantics.
- TanStack Router owns navigable state; TanStack Query owns server results and
  loaded pages; React owns only ephemeral presentation state.

### Queue architecture decision

Add a narrow generic source-derived Queue substrate now rather than another
media-specific boolean. Movies, Articles, Podcasts, and Videos all have approved
source-derived Queue rules, so the durable common concept is membership evidence,
not a universal media projection.

`queue_entries` should contain:

- stable entry ID;
- canonical media item ID;
- connection ID;
- source membership key;
- source relationship type;
- source-added value, precision, and basis when known;
- current upstream state;
- first and last observed times;
- removal time when established by a complete snapshot;
- projection/parser version; and
- created/updated timestamps.

`queue_entry_evidence` should link each membership to source records with the
roles `membership`, `added_time`, and `removal`. Enforce uniqueness by connection
and source membership key. A complete source snapshot may retire an absent
active entry for that connection; partial imports, RSS, failed imports, and
another account may not.

This is not a locally authoritative Queue and does not supersede the canonical
ledger's deferred local-intent decision. Record the implementation in a new ADR
that explicitly leaves manual membership, conflict resolution, and upstream
write-back deferred.

### Movie read model

Create one rebuildable projection row per canonical movie with fields needed for
collection display and ordering:

- media item ID and primary Letterboxd film identity;
- imported title, display title, original title, normalized title, and release
  year/date/precision;
- poster and optional backdrop paths/URLs;
- director display string, runtime, and original language;
- current Letterboxd rating and liked state;
- Archive and Queue flags plus Queue-added date;
- total active viewing count;
- latest active viewing ID/date/precision;
- latest matching viewing values supplied by the query when an occurrence filter
  is active;
- review-presence flag;
- TMDB match status and catalog freshness; and
- projection version and last rebuild time.

Keep directors, cast, genres, countries, alternative titles, and searchable
review text normalized or in dedicated FTS content. Do not use JSON blobs for
filterable relationships. The read model must be rebuildable without network
access.

## Database and migration plan

Use forward-only migrations and keep the Drizzle schema synchronized.

### Letterboxd source projections

Add source-owned tables sufficient to answer current-state and History questions
without reparsing raw ZIPs at request time:

1. `letterboxd_movie_state`
   - connection and canonical media item;
   - Letterboxd film URI;
   - imported title and year;
   - current rating plus source-record link;
   - liked state plus source-record link;
   - last complete snapshot ID and observation time;
   - independent upstream states for watched, rating, and like relationships.
2. `letterboxd_movie_viewings`
   - canonical Archive entry and Diary URI when present;
   - rewatch flag;
   - Letterboxd log/review URL;
   - occurrence source-record links and projection version.

Do not duplicate canonical watched date, occurrence rating, or review text as a
second authority. If denormalized for query performance, make the canonical
ledger the rebuild input and test exact agreement.

### Queue and evidence

Add the generic Queue tables described above. For Letterboxd, the source
membership key is the stable film URI. Queue-added date comes from the
watchlist row's `Date` and retains its observed precision and basis. Queue-only
rows must create/reuse the same global Letterboxd film identity as watched rows.

### TMDB matching and cache

After the live probe, add provider-specific current tables rather than treating
TMDB responses as immutable owner evidence:

- `tmdb_movie_matches`: media item, TMDB ID, match method, matcher version,
  confidence/status, source inputs, review status, and timestamps;
- `tmdb_movie_profiles`: titles, overview, tagline, release value/precision,
  runtime, language, poster/backdrop paths, vote values, fetched/expiry times,
  response version, and availability status;
- normalized alternative-title, credit, genre, and country link tables; and
- a small attempt/error record so unmatched and ambiguous items are observable
  and are not retried continuously.

Exact RSS TMDB IDs are authoritative provider identities. Otherwise match in
this order:

1. existing exact TMDB movie identity;
2. exact IMDb identity through TMDB `/find`;
3. normalized exact title and release-year candidate search.

Never auto-match on fuzzy similarity or popularity alone. Zero candidates become
`unmatched`; multiple plausible exact candidates become `ambiguous`. Both remain
usable from Letterboxd data.

### Search and indexes

Add a contentless or external-content FTS5 table maintained by the projection
rebuild transaction. Index title variants, directors, projected cast, genres,
and review text. Add ordinary indexes for:

- Archive latest watched ordering;
- Queue added ordering;
- release date/year;
- current rating;
- runtime;
- review presence;
- Archive/Queue overlap;
- active view count; and
- TMDB refresh eligibility and match status.

Use `EXPLAIN QUERY PLAN` against a generated 25,000-movie projection for every
supported default sort and representative filter combination.

### Required invariants

- One complete export replay never creates duplicate identities, Queue entries,
  source records, or viewing occurrences.
- Queue-only, watched-only, and both-membership movies converge on one canonical
  Letterboxd film identity.
- A complete successful export may retire absent current watchlist/rating/like
  relationships; a partial or failed import cannot.
- Retiring Queue or current personal state never retires Archive history.
- Export and RSS observations of the same Diary occurrence reconcile in either
  arrival order.
- Rewatch flags, occurrence ratings, and reviews remain on their original
  occurrence.
- Current film rating and occurrence rating can differ without either replacing
  the other.
- TMDB refresh or match changes never delete Letterboxd evidence.
- Every imported date retains value, precision, and basis; missing dates remain
  missing.

## Letterboxd ingestion plan

### Parser version

Bump the export parser version. Build the film universe from the union of
`watched.csv`, `ratings.csv`, `likes/films.csv`, and `watchlist.csv`, keyed first
by stable film URI. Join Diary and review rows through their distinct entry URI
and exact unambiguous `Name + Year` export bridge. Preserve unresolved and
ambiguous rows as source records instead of assigning them to a guessed film.

The parser output should expose:

- film identity, imported title, year, and film URI;
- watched relationship and source activity date;
- current rating and its record;
- liked relationship and its record;
- watchlist relationship and added date;
- Diary occurrence identity, watched date, rating, rewatch flag, and record;
- review text and record; and
- deleted/orphaned evidence classified separately.

### Complete-snapshot lifecycle

Within one successful import:

1. Save or reuse the raw ZIP and start processing without advancing any current
   state.
2. Parse and validate required files and all relationship records.
3. Upsert source records, film identities, media items, occurrences, current
   state, Queue entries, and evidence idempotently.
4. Mark active snapshot members as observed.
5. Only after every required write succeeds, retire absent watchlist
   memberships and clear absent likes and current ratings in the same connection
   scope. Absence from `watched.csv` does not delete Archive history.
6. Rebuild affected movie projection/FTS rows.
7. Mark the raw object processed and finish the sync run.

If any step fails, retain the raw object and error, leave the prior successful
current projection intact, and permit replay with the same bytes and parser
version rules from ADR 0010.

### RSS behavior

Continue storing the complete small feed and reconciling its Diary/review
observations. Exact RSS `tmdb:movieId` values should enqueue catalog refresh for
that movie. RSS `memberLike` may update evidence visible as a recent observation,
but only a complete export establishes removal from the current liked snapshot.
RSS absence never removes a Queue entry, rating, like, or Archive occurrence.

### Real-data replay

Add an operator command or service path that can reprocess a retained export raw
object with the new parser version. Prefer replaying the retained owner ZIP over
requiring a new upload. If the retained object is unavailable in a target
environment, request a fresh Letterboxd export rather than substituting synthetic
data for acceptance testing.

## TMDB acquisition plan

### Credentialed live probe gate

Before writing the TMDB schema, matcher, or production client, use a real owner
credential against the real API and save a sanitized field/behavior report.
Probe:

- one known recent RSS TMDB movie ID;
- detail with appended credits, external IDs, images, and alternative titles;
- a small exact title/year sample from the owner's historical export;
- at least one no-match and one ambiguous-match candidate;
- nullability and language behavior;
- image configuration and URL construction;
- attribution requirements;
- response cache headers, `429` behavior, and retry headers; and
- current storage/refresh terms.

Record fields and aggregate outcomes, not the credential or unsanitized response
payloads. Update `docs/sources/catalogs.md` with the observed contract. Add an ADR
for refreshable catalog cache, matching confidence, retention, and attribution
before production persistence.

### Client and refresh behavior

- Keep the credential server-side in Worker secrets.
- Batch work through bounded, idempotent jobs rather than enriching during a
  collection request.
- Respect `429` and retry headers with jittered backoff and a concurrency cap.
- Fetch by exact TMDB ID before any search.
- Use `append_to_response` only for subresources verified by the probe.
- Store provider paths and configuration separately; do not hard-code one image
  base URL forever.
- Refresh current catalog data on a documented interval and expose stale data
  while refresh is unavailable.
- Do not let a TMDB outage block Letterboxd imports or local browsing.

### Degraded operation

Before TMDB is configured, show the Letterboxd title, year, personal data, source
links, and history. Use a stable 2:3 poster fallback and hide controls whose only
possible values depend on unavailable catalog data, such as runtime. Do not show
zero runtime, empty genre chips, or invented directors.

## Contracts and API plan

Create movie-specific Zod contracts in `packages/contracts`; do not broaden the
generic media endpoint.

### Collection endpoint

`GET /api/library/movies`

Parameters:

- `collection=archive|queue`;
- `q`;
- collection-compatible date modes/ranges;
- release-year mode/range;
- rating mode/minimum;
- reviewed state for Archive;
- Archive-overlap state for Queue;
- runtime bucket;
- sort and direction;
- opaque cursor; and
- limit, restricted to approved bounds.

The response contains:

- projected collection rows;
- exact filtered movie count;
- Archive response only: exact supported viewing count for filtered movies;
- independent total Archive and Queue counts for navigation;
- facets with explicit unavailable counts;
- next cursor;
- result freshness and enrichment coverage summary; and
- normalized query state when useful to the client.

Grid and list requests both use 48 rows. Layout is presentation state and is not
part of the request or query key. Opening/closing the inspector or switching
layout preserves the same loaded pages and collection position.

### Detail endpoint

`GET /api/library/movies/:mediaItemId`

Return collection memberships, personal current state, Letterboxd identity and
source links, current catalog fields, directors, projected cast, genres,
countries, alternative titles as needed for display/search diagnostics, catalog
match/freshness status, and capability/missing-data flags. Authorize detail by
active Archive or Queue membership, not Archive alone.

### History endpoint

`GET /api/library/movies/:mediaItemId/history`

Use keyset pagination with a default of 25 occurrences. Return newest first with
an explicit undated tail. Each item carries its stable occurrence ID, watched
value/precision/basis, rating, review, rewatch flag, source link, upstream state,
and whether it matched the active occurrence filter when the caller supplies the
same filter context.

### Cursor design

Sign or encode the normalized query fingerprint with the complete ordering tuple.
A cursor is valid only for the collection, filters, search, sort, direction,
limit, and projection version that created it. Reject mismatches instead of
returning a subtly corrupted page.

### Query semantics

- Apply all predicates and sorts in SQL across the complete collection.
- Archive occurrence predicates must be satisfiable by one occurrence; the
  collection display uses the latest matching occurrence.
- Counts and facets use the same base predicate as rows.
- Inclusive date/year filters compare source precision without fabricating a
  full date.
- Search defaults to relevance; an explicit compatible sort may override it.
- Sanitize and validate every outbound URL before returning it.

## Web implementation plan

### Routing and navigation

Enable Movies in the existing Library sidebar and add Archive/Queue subnavigation.
Parse and normalize movie route search centrally. Preserve compatible shared
state when switching collections and strip collection-specific filters/sorts.
Make `/library/movies` redirect to Archive with a canonical URL.

### Collection page

Reuse shell, toolbar, layout-toggle, loading, empty, error, and inspector
primitives from Books where their semantics genuinely match. Implement
movie-specific cards, rows, filters, sort labels, counts, and missing artwork.

The grid should use `repeat(auto-fill, minmax(...))` within the approved
156–196px card range, 16px gaps, fixed poster ratio, and clamped metadata. The
list should use 60px-wide posters and approximately 72px rows, with column
collapse on narrower widths before resorting to horizontal scrolling.

### State and page preservation

Build the collection query key from normalized server query parameters only.
Never include selected item, inspector tab, sidebar state, or raw URL search.
Opening a movie, closing it, switching grid/list, browsing browser Back/Forward,
or resizing into the sheet inspector must preserve loaded pages, scroll,
filters, and collection position.

Store the selected `item` in URL state. Fetch detail and History independently.
Cancel or ignore stale detail responses during rapid selection. Closing restores
focus to the selected card/row when it remains mounted, otherwise to the results
heading.

### Inspector behavior

Use the shared adjacent inspector at wide desktop widths and sheet treatment at
narrower widths. Poster/backdrop presentation must not push personal activity
below an unusable fold. Long reviews expand deliberately. History paginates
without downloading the entire viewing ledger.

### Missing and partial data

- Missing poster: stable, accessible 2:3 title fallback.
- Missing release year/director/runtime: omit the field or say unavailable where
  the filter/detail context requires an explicit value.
- Unmatched TMDB item: local data remains fully usable; inspector explains that
  catalog details are unavailable.
- Ambiguous match: never display one candidate's artwork as though confirmed.
- Stale provider cache: display last known catalog facts with subdued freshness
  disclosure and retry outside the render path.
- Queue snapshot older than RSS history: show its last observed freshness; do not
  claim it is live.

### Accessibility

- Cards/rows are real buttons or links with discernible movie names.
- Layout, filters, sort, collection tabs, and inspector tabs expose selected
  state programmatically.
- Poster alternatives do not duplicate visible text unnecessarily.
- Keyboard navigation and focus restoration work in adjacent and sheet modes.
- Ratings are announced as `your rating` versus `TMDB rating`.
- Color is never the only signal for selection, match status, or missing data.

## Suggested code organization

```text
packages/contracts/src/movies.ts
packages/db/src/movies-repository.ts
packages/db/src/movies-repository.test.ts
packages/connectors/letterboxd/src/export.ts
packages/connectors/letterboxd/src/export.test.ts
packages/connectors/tmdb/
  src/client.ts
  src/contracts.ts
  src/index.ts
  src/matching.ts
  src/*.test.ts
apps/api/src/movies-routes.ts
apps/api/src/movie-catalog-sync.ts
apps/api/src/movie-catalog-sync.test.ts
apps/web/src/features/movies/
  movies-api.ts
  movies-collection-page.tsx
  movies-route-search.ts
  movies-route-search.test.ts
  movies.css
apps/web/e2e/movies.spec.ts
```

Shared primitives should stay under `apps/web/src/components/ui` only when both
Books and Movies use the same behavior. Do not generalize media-specific cards,
filter schemas, or inspectors prematurely.

## Delivery sequence

Each stage should be independently reviewable. Do not wait for TMDB credentials
to finish Letterboxd-only work.

### Stage 0: Baseline and operational proof

1. Re-run the retained export inspector and record fresh aggregate counts.
2. Confirm a retained raw export can be replayed in local development.
3. Capture current Archive/RSS reconciliation tests and database counts.
4. Confirm whether a TMDB credential is available without printing it.
5. Save before screenshots of Books, Connections, and the Movies reference mock
   in both themes.

Exit criterion: the real-data baseline, credential state, and recovery path are
known; no source bytes or credentials enter Git.

### Stage 1: Queue decision, contracts, and migration skeleton

1. Add the source-derived Queue ADR.
2. Add Queue, Letterboxd movie-state/viewing, and Movies read-model migrations.
3. Update Drizzle schema and migration validation fixtures.
4. Add movie collection/detail/history contracts and route-search normalization
   tests.
5. Add empty repositories/routes behind no production navigation.

Exit criterion: empty and upgraded databases migrate cleanly; invariants and
contracts are executable.

### Stage 2: Complete Letterboxd export projection

1. Implement the new export parser over the union of film-level files.
2. Normalize watchlist, likes, current ratings, rewatch metadata, and Queue-only
   films.
3. Implement complete-snapshot reconciliation and evidence links.
4. Add retained-raw replay support and bump parser version.
5. Rebuild affected movie projections transactionally.
6. Run synthetic edge cases and the ignored owner export; compare fresh counts
   with the source report and explain every difference.

Exit criterion: Archive and Queue memberships plus all current personal state are
correct from real Letterboxd data, without TMDB.

### Stage 3: Movies repository and API

1. Implement collection SQL, FTS, facets, exact counts, sorts, and query-bound
   cursors.
2. Implement queue-only detail access and paginated History.
3. Test latest-matching-occurrence semantics, unknown dates, overlap, current
   versus occurrence ratings, and stable pagination.
4. Add API integration tests for validation, empty states, degraded enrichment,
   and unsafe outbound URLs.
5. Measure representative query plans and execution time.

Exit criterion: the complete approved Movies contract works through HTTP using
Letterboxd-only data.

### Stage 4: Letterboxd-only Movies UI

1. Enable Movies navigation and routes.
2. Implement real-data grid/list, Archive/Queue switching, search, available
   filters/sorts, and exact counts.
3. Hide runtime-only controls until enrichment coverage exists.
4. Add loading, no-results, empty, failed, missing-poster, and stale-export
   states.
5. Add browser tests for URL round trips, compatible-state normalization,
   loaded-page/scroll preservation, and queue-only inspection.

Exit criterion: the owner can browse and inspect the complete real Letterboxd
library without TMDB configured.

### Stage 5: Inspector and History completion

1. Implement movie Details and History with independent queries.
2. Show current membership and personal state separately from viewing events.
3. Paginate long histories and preserve occurrence ratings/reviews.
4. Verify rapid selection, close focus, browser Back, narrow sheet mode, and long
   content.

Exit criterion: every supported personal movie fact is reachable through the
approved inspector with correct date and source semantics.

### Stage 6: TMDB live probe and architecture record

1. [x] Obtain/configure the owner credential.
2. [x] Run the required real API probes and matching sample.
3. [x] Update catalog reconnaissance with exact observed fields and constraints.
4. [x] Finalize and accept the catalog-cache/matching ADR.
5. Adjust only the provider-specific migration draft if the probe contradicts
   it; do not distort Letterboxd or generic Queue tables.

Exit criterion: persisted TMDB fields, refresh policy, attribution, and matching
rules are based on real responses rather than documentation alone.

### Stage 7: TMDB matching and enrichment

1. [x] Implement the typed client, secret configuration, rate limiting, and error
       taxonomy.
2. [x] Attach exact RSS TMDB identities.
3. [x] Run conservative title/year matching for remaining movies and retain
       unmatched/ambiguous states.
4. [x] Populate profiles and normalized relationships, then rebuild projections/FTS.
5. [x] Enable poster, director, cast, genre, runtime, and catalog-dependent UI only
       from confirmed matches.
6. [x] Add required TMDB attribution in the inspector/source disclosure.

Exit criterion: enrichment improves confirmed movies, never misrepresents an
ambiguous candidate, and provider failure leaves local browsing intact.

### Stage 8: Hardening and acceptance

1. [x] Run empty and upgrade migration checks.
2. Replay identical and changed exports; verify current-state retirements and
   immutable history.
3. [x] Run full checks, builds, browser tests, and performance tests after the final
       edit.
4. Visually inspect both themes, both layouts, both collections, adjacent/sheet
   inspectors, and missing/stale/ambiguous states using the real owner sample.
5. Fix obvious overflow, layout shift, contrast, focus, and density problems.
6. [x] Update owning source, architecture, UI, and planning documents with shipped
       behavior and measured enrichment coverage.

Exit criterion: all acceptance checks below pass and the implementation is
recoverable from retained raw evidence.

## Test strategy

### Connector and reconciliation

- Queue-only, watched-only, and overlap films.
- Duplicate title/year with different film URIs.
- Diary URI distinct from film URI.
- Multiple viewings on the same day and genuine rewatches.
- Export before RSS and RSS before export.
- Rating/review edits and current rating distinct from occurrence rating.
- Complete snapshot removes watchlist/like/rating state without deleting Archive.
- Partial/failed snapshot preserves prior current state.
- Another connection cannot clear membership.
- Parser replay is idempotent and a parser-version bump reprocesses retained raw
  bytes.

### Database and repository

- Every filter/sort, including unknown buckets and null-last ordering.
- One-occurrence satisfaction of combined Archive occurrence predicates.
- Latest matching occurrence display and all-history detail.
- Exact distinct-movie and viewing counts under filters.
- Search across title variants, directors, cast, genres, and review text.
- Relevance default and invalid-sort normalization.
- Query-bound keyset cursors with duplicate sort values.
- Queue-only detail authorization and Archive/Queue overlap.
- Rebuild equivalence before and after projection deletion.

### TMDB

- Exact ID, IMDb find, single exact title/year, no match, and ambiguous match.
- Movie versus TV namespace separation.
- Null fields, missing images, localized titles, and alternative titles.
- `429`, retry headers, transient failure, malformed response, and stale-cache
  fallback.
- Refresh never mutates historical Letterboxd fields.

### Web and browser

- Deep link and reload reproduce collection state and selection.
- Switching collection drops incompatible filters/sort direction.
- Opening/closing inspector and changing inspector tabs preserve loaded pages and
  scroll.
- Switching grid/list and returning restores each cached layout position.
- Rapid selection never paints stale details.
- Missing poster, unmatched catalog, ambiguous match, stale cache, and failed
  enrichment remain usable.
- Keyboard-only navigation, focus restoration, accessible ratings, and mobile
  sheet behavior.
- Long titles, many directors, long review text, and many History pages.

## Performance budgets and guardrails

- Collection requests return at most 48 items in either layout.
- History returns at most 25 events per request.
- No browse request parses raw exports or calls TMDB.
- No UI path downloads every movie or every viewing.
- Collection SQL uses indexed keyset pagination, never offset pagination.
- Default collection queries should complete within 100 ms locally at 25,000
  projected movies after warm-up; record measurements and query plans.
- Search/filter interaction is debounced and prior requests are cancelled.
- Images use lazy loading, explicit dimensions, and provider-supported sizes.
- Catalog refresh concurrency and retry volume are bounded independently from
  user-facing API traffic.

## Rollout and recovery

- Migrations are additive and forward-only.
- Keep Movies navigation disabled until Letterboxd projection, repository, and
  empty/error UI are ready together.
- Ship the Letterboxd-only slice even if TMDB is not configured; gate only
  enrichment-dependent fields and controls.
- Retain old parser evidence and raw objects. Recovery is projection rebuild or
  raw replay, not manual row editing.
- If a new export parser fails after acquisition, leave the last successful
  current-state projection active and expose the failed sync in Connections.
- If TMDB matching quality is unacceptable, disable automatic search matching,
  retain exact IDs, and rebuild catalog projections without touching history.
- Do not deploy secrets through client environment variables or commit them.

## Documentation updates required at shipment

- `docs/sources/letterboxd.md`: parser/current-state/Queue implementation and
  fresh real aggregate verification.
- `docs/sources/catalogs.md`: credentialed TMDB response, matching, image,
  attribution, rate-limit, and retention observations.
- `docs/architecture/canonical-ledger.md`: implemented source-derived Queue
  relationship and its boundary from future local intent.
- `docs/decisions/README.md`: source-derived Queue ADR and catalog-cache ADR.
- `docs/design/ui-foundation.md`: only shared shell/inspector behavior proven by
  Movies; keep movie-specific design in the Movies contract.
- `docs/planning/library-implementation.md`: mark Movies shipped with measured
  counts and remaining gaps.
- `docs/planning/library-phase-2-surfaces.md`: update status without rewriting
  accepted product history.
- Connector/package READMEs and environment examples for TMDB setup.

## Owner input

No unresolved product, layout, or architecture choice blocks Stages 0–5. The
approved Movies contract is specific enough, and the generic source-derived
Queue plus replaceable TMDB cache are engineering decisions recorded through
ADRs.

One external prerequisite is required for Stage 6: configure a TMDB API Read
Access Token or v3 API key for the backend so the required live probe can use the
real API. The credential must not be pasted into this document or committed. If
the retained Letterboxd export is unavailable in the eventual target
environment, a fresh owner export will also be needed for real-data acceptance;
the current local checkout already contains a retained ignored export.

## End-to-end acceptance checklist

- [x] Archive and Queue render real Letterboxd records in grid and list.
- [x] Real import counts reconcile with the fresh source inventory.
- [x] Queue exactly matches the latest successful complete watchlist snapshot.
- [x] A watched movie may remain queued when the snapshot says so.
- [x] Complete-snapshot removal changes current state without deleting history.
- [x] Watched-only and every Diary occurrence retain correct date semantics.
- [x] Current and occurrence rating/review/like facts are not conflated.
- [x] Search, every approved filter/sort, counts, and cursors are server-side and
      covered by focused tests.
- [x] Queue-only movies open in the inspector.
- [x] Inspector History returns all occurrences with bounded pagination.
- [x] Selection, inspector, and layout changes preserve loaded pages.
- [x] Collection switching normalizes incompatible query state.
- [x] Missing TMDB configuration never hides local facts.
- [x] TMDB fields and matching rules are backed by a credentialed live probe.
- [x] TMDB attribution and refresh/retention rules are implemented.
- [x] Empty and upgrade migrations pass.
- [x] `pnpm check`, build, relevant end-to-end tests, and migration checks pass
      after the final edit.
- [x] Both themes and responsive inspector modes receive visual QA with real
      data, and obvious defects are fixed.
- [x] No credential, raw export, or unsanitized owner fixture is committed.

## Ready-to-copy implementation brief

> Implement Movies end to end using `docs/planning/movies-implementation.md` and
> the owner-approved `docs/planning/research/movies-phase-2-surfaces.md`. Preserve
> all canonical-ledger and ADR invariants. First deliver the Letterboxd-only
> Archive/Queue slice from the retained real export, including source-derived
> Queue evidence, complete-snapshot reconciliation, movie-specific APIs,
> grid/list UI, and paginated inspector History. Do not block this work on TMDB.
> Before implementing TMDB persistence or matching, require a backend credential,
> hit the real API, document its actual payload and constraints, and add the
> catalog-cache ADR. Match only through exact IDs or conservative exact
> title/year evidence; preserve unmatched and ambiguous states. Use real data for
> visual acceptance without committing raw exports or credentials. Run the full
> validation matrix after the final edit and report exact results and remaining
> limitations.
