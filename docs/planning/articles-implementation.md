# Articles end-to-end implementation plan

- Status: Implemented and owner-authorized selective bulk content acquisition
  completed 2026-09-20
- Date: 2026-09-20
- Scope: Readwise-backed Library > Articles Archive, Queue, Feed, and inspector

## Purpose

This document turns the owner-approved
[Articles Phase 2 surface specification](research/articles-phase-2-surfaces.md)
into an implementation sequence for the existing Imladris architecture. It
covers the complete path from real Reader API observations through durable
source projections, Archive and Queue reconciliation, search, HTTP contracts,
the production Index interface, operational recovery, and visual acceptance.

It is intentionally an implementation plan rather than a new product-design
round. The accepted rows, filters, sorts, Feed distinction, Details/History
inspector, and read-only boundary remain authoritative. Implementation may tune
spacing and responsive behavior against production data, but it must not add
fields or controls merely because Reader supplies them.

The existing [Readwise Phase 1 research](research/readwise-reader-phase-1.md)
already contains a credentialed live inventory from the owner account. No new
credential, provider choice, or speculative schema is required before work can
begin.

## Outcome

After this plan is complete, Articles will provide:

- Archive for retained Reader Archive admissions;
- Queue for current Reader Inbox, Later, and Shortlist relationships;
- a separate Reader Feed section for ambient subscription inventory;
- restrained and expanded list densities using the accepted Index shell;
- server-side search, filters, sorts, exact counts, and keyset pagination;
- a compact Details/History inspector with notes, active highlights, source
  state, and provenance;
- selective authorized full-text search without rendering article bodies in
  Imladris;
- source-correct behavior when a document moves between Reader locations;
- idempotent all-location backfill and overlapped incremental reconciliation;
  and
- useful degraded behavior when annotations, full text, artwork, or Reader are
  unavailable.

The implementation must remain useful with metadata alone. Highlight and
full-text acquisition enrich the surface but do not gate Archive, Queue, Feed,
or detail availability.

## Implementation result

The 2026-09-21 cross-media visual pass fixed the shared toolbar at intermediate
desktop widths and displays Reader's raw `readwise-upload-pdf` publication
slug as "PDF upload" in the row and inspector. The stored source value remains
unchanged.

The production slice implements the all-location v3 document reconciliation,
retained Archive and source-derived Queue semantics, separate Feed, tag and
deletion-aware v2 highlight projections, article-specific HTTP contracts,
server-side search/filter/sort/facets, two list densities, Details/History
inspector, durable content jobs, private R2 content storage, and contentless D1
FTS indexing described below.

The 2026-09-20 real reconciliation processed 1,021 documents across 11 pages
and projected 72 Archive, 178 Queue, and 666 Feed Articles. It also processed 16
v2 highlight containers and 26 highlights; 18 active highlights linked to 12
eligible Articles. The production UI was visually checked against this data in
both densities and with the inspector open.

The owner-authorized initial content run acquired and indexed every one of the
250 currently eligible Archive/Queue documents. Each exact v3 content response,
the extracted HTML/text objects, durable job state, staged chunk index, and
failure status remain independently inspectable. Metadata, notes, and active
highlight search still work when a later document has missing or failed text.

## Scope

### Included

- Eligible Reader categories: `article`, `pdf`, `rss`, and documented or
  observed newsletter/email variants.
- Current Reader document state across every location.
- Retained canonical Archive admission for documents ever observed in Reader
  Archive under the supported source rule.
- Source-derived Queue membership for `new`, `later`, and `shortlist`.
- Reader Feed membership for `feed` without treating it as Queue or a generated
  recommendation feed.
- Reader document metadata, tags, document notes, progress/opened state, size
  facts, timestamps, and validated links.
- Readwise v2 highlight containers and deletion-aware highlights.
- Selective parsed-HTML acquisition and private extracted-text storage for the
  initial full-text policy defined below.
- Article-specific contracts, repository, API routes, production UI, browser
  tests, migration tests, real-data replay, and visual QA.
- Explicit coverage and freshness reporting for documents, highlights, and
  full text.

### Excluded

- Reader document creation, movement, deletion, tagging, or write-back.
- A locally editable or locally authoritative Queue.
- In-app article reading or rendering full article bodies.
- AI summaries, generated tags, recommendations, community ratings, popularity,
  or a general Lists model.
- Reader videos and podcasts in Articles; they continue to route to their own
  media types.
- Tweets, EPUBs, notes, highlight-only documents, and unknown categories as
  standalone Library items.
- A fabricated Reader movement timeline or inferred reading sessions.
- Tag, annotation-presence, content-availability, Added-via, or relationship-
  overlap collection filters.
- Progress sorting.
- Reader webhooks in the initial Articles delivery. Polling and explicit full
  sweeps remain authoritative until webhook authentication and delivery behavior
  are verified separately.
- Raw-source downloads through temporary `raw_source_url` capabilities in the
  initial delivery.
- Cross-source merging by title, author, publication, or normalized URL alone.

## Accepted product behavior

### Category routing

The connector routes source records before collection projection:

| Reader category                        | Canonical result             | Article subtype | Articles sections    |
| -------------------------------------- | ---------------------------- | --------------- | -------------------- |
| `article`                              | `article` media item         | Web article     | Archive, Queue, Feed |
| `pdf`                                  | `article` media item         | PDF             | Archive, Queue, Feed |
| `rss`                                  | `article` media item         | RSS             | Archive, Queue, Feed |
| `email` or approved newsletter variant | `article` media item         | Newsletter      | Archive, Queue, Feed |
| `video`                                | `video` media item           | Not applicable  | Videos               |
| `podcast`                              | `podcast_episode` media item | Not applicable  | Podcasts             |
| `tweet`, `epub`, `highlight`, `note`   | Source evidence only         | Not applicable  | None                 |
| Unknown                                | Unresolved source record     | Not applicable  | None                 |

Unknown categories are retained, counted diagnostically, and never guessed into
Articles.

### Section membership

- **Archive** includes a canonical article when at least one retained,
  non-superseded Reader Archive occurrence exists. A later move to Inbox,
  Later, Shortlist, or Feed does not revoke that history.
- **Queue** includes current Reader documents in `new`, `later`, or `shortlist`.
  `new` is labeled Inbox. Archive and Queue may overlap.
- **Feed** includes current eligible documents in `feed`. Feed is ambient Reader
  inventory, not explicit intent and not Imladris's future recommendation Feed.

One canonical media item appears once per section. Separate Reader identities
remain separate unless an authoritative identity or explicit reconciliation rule
has merged them. If multiple current Reader identities already resolve to one
canonical item, the row uses deterministic display aggregation while the
inspector preserves every identity and current state.

For a Queue row with multiple current source relationships, choose the display
relationship by `Shortlist > Later > Inbox`, then newest `saved_at`, then Reader
document ID. Its `addedAt` is the chosen relationship's `saved_at`. Facets may
count the item in every current source state it actually has. Feed uses the
newest qualifying `saved_at` as its display arrival. These rules are defensive;
the live account currently has unique Reader document identities.

### Archive occurrence semantics

Reader v3 is a current-state snapshot, not an event log. Use one Archive
occurrence per `(connection, Reader document ID)`:

- first observation in Archive admits the occurrence;
- `last_moved_at` is the inferred consumption time while the document is
  observed in Archive;
- a later non-Archive location leaves the occurrence and its last known inferred
  date active in retained history;
- returning to Archive may update that single inferred occurrence from the new
  current snapshot, but does not manufacture a reread; and
- every earlier raw/source observation remains available as evidence.

Only explicit correction or supersession evidence may remove an occurrence from
ordinary Archive history. Reader v3 currently supplies no verified document
deletion surface, so absence alone never deletes Archive history.

### Collection presentation

Articles has one list presentation with two densities:

- **Restrained** is the default. Rows show the 4:3 thumbnail or subtype glyph,
  title, author/publication, and the section-defining state or date.
- **Expanded** adds subtype, parsed reading time, current progress, published
  date, and prior-Archive or cross-section context where specified.

Opening the inspector, changing density, or closing the inspector is
presentation state. It must preserve loaded pages, scroll, selection context,
filters, and sort. Density is remembered independently from the URL; collection
query state is URL-addressable.

The saved `/library-review.html` Articles surface is the initial visual
reference. Its client-only filter implementation and abbreviated inspector are
not production contracts; the written Phase 2 specification owns behavior.

### Search

Search is server-side and scoped to the active section and filters. Ranking is:

1. exact title;
2. title prefix;
3. other title match;
4. author and publication;
5. imported Reader summary;
6. document notes;
7. active highlight text and highlight notes; and
8. selectively acquired authorized full text.

Deleted or discarded highlights, tags, raw payloads, internal IDs, acquisition
source, and provenance timestamps are not search targets. A non-title match may
return one sanitized excerpt of at most 180 Unicode characters labeled Summary,
Note, Highlight, or Text. Full-text failure may remove an excerpt but must not
remove an otherwise valid result.

Relevance is available only for a non-empty query and becomes the implicit
default while searching. Clearing search restores the section's normal default.

### Filters

Shared filters:

- Type: Web article, PDF, RSS, Newsletter;
- Author;
- Publication;
- Published date with explicit unknown inclusion;
- Reading time: under 5, 5–15, 16–30, 31–60, over 60, unknown; and
- Progress: Not opened, Opened at 0%, In progress, 100%, Unknown.

Section-specific filters:

| Section | Filters                                                             |
| ------- | ------------------------------------------------------------------- |
| Archive | Archived date/unknown; current Reader state                         |
| Queue   | Queue state; added date/unknown; archived before/no history         |
| Feed    | arrived date/unknown; opened/not opened; archived before/no history |

Repeated values inside a facet use OR, except the UI does not expose a tag
facet. Different facets combine with AND. Author and Publication options are
searchable, section-aware facets ordered by descending result count and then
display name.

### Sorting

| Section | Default               | Additional sorts                                                                                 |
| ------- | --------------------- | ------------------------------------------------------------------------------------------------ |
| Archive | Archived date, newest | Published date, date added, title, author, publication, reading time, relevance while searching  |
| Queue   | Date added, newest    | Queue state, published date, title, author, publication, reading time, relevance while searching |
| Feed    | Arrival date, newest  | Published date, title, author, publication, reading time, relevance while searching              |

Every sort is server-side and stable. Unknown values sort last in both
directions. String tie-breakers use normalized title and canonical media-item ID.
Archive date filtering and sorting use the latest occurrence matching the active
range; without a range they use the latest retained occurrence.

### Inspector

The inspector uses the existing compact right-hand shell with Details and
History tabs.

The header contains subtype artwork/fallback, title, author/publication, every
current relationship label, and separate validated Open original and Open in
Reader links.

Details contains, in order:

1. imported Reader Summary;
2. Article facts: author, publication, published date, subtype, word count,
   Reader reading-time estimate, current progress, first opened, last opened;
3. all current Reader tags;
4. Content availability and acquisition status; and
5. Source facts, including Added via, Reader category/location, saved date,
   Reader/source links, and last successful observation.

History contains, in order:

1. complete retained Archive history;
2. current Reader state and observation time;
3. open/progress evidence as snapshots rather than reading sessions;
4. separately sourced document notes and active highlights; and
5. collapsed provenance.

Highlights paginate 20 at a time. Archive history paginates 25 at a time.
Deleted/discarded highlight counts may appear in provenance, but their text does
not appear in ordinary responses or search.

## Pre-implementation baseline assessment

This section records the repository state when the plan was approved. The
implementation result above and shipment checklist below describe current
behavior.

### Real source evidence

The 2026-09-19 credentialed probe observed 1,021 Reader documents across 11
pages:

- 85 Archive documents, including 72 eligible Articles (`57` article, `4` PDF,
  `11` RSS);
- 178 eligible Queue documents (`105` article, `6` PDF, `8` RSS in Inbox, plus
  `45` article and `14` PDF in Later);
- 665 RSS documents in Reader Feed;
- no live Shortlist or email/newsletter row, although both are supported by the
  documented contract; and
- 26 v2 export highlights across 16 containers, including 7 deleted highlights.

Feed volume makes server-side pagination mandatory and confirms why Feed cannot
be treated as Queue. The live account also proves that Archive is not equivalent
to 100% progress and that author, publication, and acquisition source are
distinct strings.

### Connector at plan start

The connector at plan start:

- validates and parses a deliberately small v3 document subset;
- requests 15 rows per page;
- performs an initial `location=archive` backfill;
- performs later all-location `updatedAfter` sweeps with a five-minute overlap;
- stores exact acquired pages in private R2 before parsing;
- creates canonical items and one Archive occurrence for eligible current
  Archive rows; and
- advances the durable cursor only after all pages complete.

It does not yet acquire a complete all-location baseline, tags, v2 highlight
exports, requested HTML, raw source bytes, or webhooks. Its current move-away
logic marks a Reader Archive occurrence removed, which conflicts with the
accepted retained-history behavior and must be repaired before the Articles
surface ships.

### Database and API at plan start

The canonical ledger already stores Reader media identities, eligible media
items, raw objects, source records, Archive occurrences, and evidence. It does
not have Reader source-owned document, tag, highlight, content-manifest, Article
browse, or Article search projections.

The generic source-derived `queue_entries` and `queue_entry_evidence` tables now
exist from the Movies implementation. They are suitable for Reader Queue if
used as a read-only provider projection rather than local authority.

The public generic media response exposes too little Article detail. Books and
Movies have established media-specific collection, detail, and history routes;
Articles should follow that architecture rather than extending the legacy
generic endpoint.

### Web application at plan start

The production Index shell, Graphite theme, collapsible navigation, responsive
workspace, Books and Movies collection patterns, URL normalization, paginated
query preservation, and compact inspectors are implemented. Articles remains a
disabled navigation item. The saved Articles review component is isolated from
production and must not be imported as the production data layer.

## Recommended architecture

```text
Reader v3 Document LIST (all locations + incremental changes)
  -> immutable raw pages in R2
  -> source_records
  -> readwise_documents current-state projection
  -> canonical items / retained Archive entries / source-derived Queue entries

Reader v3 Tag LIST + document tag snapshots
  -> immutable raw pages
  -> readwise_tags / readwise_document_tags

Readwise v2 EXPORT includeDeleted=true
  -> immutable raw pages
  -> readwise_highlight_containers / readwise_highlights

Selected v3 documents withHtmlContent=true
  -> private raw/extracted text in R2
  -> content manifest + contentless chunk index

All normalized facts
  -> article_library_projection + article_search
  -> article repository
  -> Hono REST contracts
  -> React Articles collection and inspector
```

### Ownership boundaries

- `packages/connectors/readwise` owns v3/v2 request construction, response
  schemas, temporal parsing, category/subtype normalization, reading-time
  parsing, retry hints, and source-shaped normalized records.
- `packages/domain` retains only cross-source media, temporal, identity, Archive,
  and evidence primitives. Reader location, tags, progress, highlights, and
  content manifests do not enter the pure common model.
- `packages/db` owns Reader source projections, snapshot finalization, Queue
  materialization, Article read models, search indexes, facets, keyset cursors,
  and detail/history/highlight queries.
- `apps/api` owns credentials, R2 persistence, sync orchestration, per-connection
  leases, route validation, scheduling, and safe errors.
- `packages/contracts` owns Article request/response schemas shared by API and
  web.
- `apps/web` owns URL state, query caching, collection rendering, inspector
  interaction, focus, and accessibility.

Hono routes remain thin. No browse or detail request reads or decompresses raw
R2 pages.

### Reader current state versus Archive history

`readwise_documents` is the current source snapshot. `archive_entries` is the
retained consumption ledger. They answer different questions and must not be
collapsed:

- a location observation updates `readwise_documents.current_location`;
- an Archive observation creates or refreshes one Reader occurrence;
- a later non-Archive observation never removes that occurrence;
- current Queue/Feed membership is derived from the source snapshot; and
- source-record/evidence links explain both admission and later observations.

The existing legacy removal evidence remains immutable. Replay under the new
parser restores affected Reader occurrences to the retained projection without
deleting the historical removal observation.

### Queue architecture

Use the accepted generic `queue_entries` table as a source-derived
materialization:

- `source_membership_key = reader-document:<document_id>`;
- `relationship_type = readwise_inbox | readwise_later | readwise_shortlist`;
- `added_at = saved_at` with source-asserted instant precision;
- membership evidence links to the exact current document source record; and
- an explicitly observed move to Archive or Feed retires the Queue relationship.

A successful complete all-location snapshot may also retire a Queue entry not
observed anywhere in that snapshot. It must not delete the media item or Archive
history and must not claim the Reader document itself was deleted. Failed,
partial, or incremental pages never retire membership by absence.

`readwise_documents` remains the authoritative source-state projection. The
generic Queue row exists to apply the same provenance and lifecycle rules used
by other media types; it is not a second source of truth or a locally editable
record.

### Identity and deduplication

- Reader document ID is authoritative within its connection.
- Reader URL and original `source_url` are retained separately.
- Duplicate URLs do not merge records.
- Title, author, publication, and summary never participate in automatic
  identity matching.
- An authoritative provider identity extracted from an unambiguous URL may be
  attached later through an explicit, tested rule, but that is not required for
  Articles.
- Multiple Reader connections remain isolated at the source-projection layer.
  Canonical aggregation occurs only after an accepted identity relationship.

## Database and migration plan

Use ordered forward-only migrations beginning after the current Movies
migrations. Prefer one main Articles migration, but add a follow-up migration
rather than editing it if an applied stage exposes a constraint change. Update
the Drizzle schema with each migration and test both an empty database and
upgrade from migration 0007.

### `readwise_documents`

One current row per `(connection_id, document_id)`:

- internal row ID;
- connection ID, Reader document ID, canonical media-item ID, and Reader
  external-identity ID;
- Reader URL and original source URL as separately validated strings;
- raw category and normalized Article subtype when eligible;
- current location and source upstream state;
- title, author, normalized author facet key, publication, normalized
  publication facet key, acquisition source, summary, image URL, and v3
  document note;
- word count;
- reading-time raw value, parsed minutes, and parser version;
- listening-time raw value preserved but unused by Article filters;
- reading progress plus a validity flag so invalid source values are not
  clamped;
- published temporal value/precision/basis;
- created, saved, first-opened, last-opened, last-moved, and updated instants;
- last-observed source-record ID and observation time;
- last-seen complete-snapshot run ID; and
- projection version.

Missing title remains null in storage. `Untitled article` is a presentation
fallback only.

### `readwise_projection_state`

One row per connection records operational source coverage:

- latest completed all-location document snapshot run/time/version;
- latest successful incremental watermark;
- latest complete Tag LIST run/time/version;
- latest v2 highlight backfill/reconciliation run/time/version;
- selected full-text policy and acquisition/index versions;
- current per-connection sync lease owner/expiry; and
- last projection rebuild run/time.

This is operational projection state, not user activity. Update each completion
field only after the corresponding records and read models are durable.

### Tags

Add:

- `readwise_tags`, unique by `(connection_id, tag_key)`, with current display
  name, observation lineage, and upstream state; and
- `readwise_document_tags`, unique by `(readwise_document_id, tag_key)`, with
  source type, opaque `created` value, current/removal state, source-record ID,
  and observation timestamps.

Tags are detail-only in this delivery. They do not create an Article collection
facet or search target. The normalized model still prevents future replay from
having to parse raw pages at request time.

### Highlight containers and highlights

Add:

- `readwise_highlight_containers`, unique by connection and `user_book_id`, with
  `external_id`, nullable verified Reader-document link, v2 document note,
  current deletion state, source timestamps, and lineage; and
- `readwise_highlights`, unique by connection and highlight ID, with container,
  text, note, positions and units, color, favorite/discard/deletion state,
  highlighted/created/updated times, source links, tag JSON only if the source
  remains unnormalized, and source-record lineage.

The v2 `external_id` to v3 document-ID join must be equality-verified in tests
and the real replay before attachment. Unresolved containers remain preserved
without exposing their private text on a possibly wrong item.

Ordinary queries include only non-deleted, non-discarded highlights attached to
a verified eligible Article document.

### Content manifests and chunks

Add a durable content manifest per Reader document/version:

- source document and media-item IDs;
- content kind (`reader_html` initially);
- raw and extracted R2 object keys and checksums;
- source version/updated timestamp;
- extraction version and state;
- coverage (`full` or `partial`);
- language when safely observed;
- acquisition and processing times;
- retention/use policy version; and
- safe failure class without source text or credentials.

Add relational chunk locators with manifest, ordinal, byte start/length, and
checksum. Keep extracted UTF-8 text in private R2. A contentless FTS5 index stores
search terms and chunk identity but not a second authoritative body. A winning
chunk is retrieved through its verified R2 locator to produce a bounded excerpt.

Do not persist temporary signed `raw_source_url` values.

### Article browse projection

Add `article_library_projection`, one row per canonical media item that has an
eligible Archive, Queue, or Feed relationship. It contains only queryable,
rebuildable values:

- display/imported title and normalized title;
- subtype, thumbnail, author/publication plus normalized facet keys;
- published temporal value;
- reading-time raw/minutes/parser version;
- progress, progress validity, and opened state;
- Archive membership, occurrence count, latest retained occurrence date, and
  unknown-date flag;
- current Queue membership, chosen display state, display added date, and every
  current Queue-state bit needed for facets;
- Feed membership and arrival date;
- current Reader location-state bits used by Archive filters;
- current tag and active-annotation counts for detail summaries only;
- metadata/highlight/content freshness and coverage flags; and
- projection version and refresh time.

The projection is replaced or rebuilt only after source facts are durable. It
is never treated as provenance.

### Search indexes

Use two indexes:

1. `article_search` for title, author, publication, summary, v3 document note,
   v2 container note, active highlight text, and active highlight notes; and
2. `article_content_search`, a contentless chunk index for selectively acquired
   extracted text.

Rebuilding either index is idempotent and cannot advance a Reader cursor.
Deleting/discarding an annotation or expiring content removes its searchable
row before the next successful projection version is exposed.

### Required indexes

At minimum, create access paths for:

```text
readwise_documents(connection_id, document_id) UNIQUE
readwise_documents(media_item_id, connection_id)
readwise_documents(connection_id, current_location, upstream_state, saved_at DESC, media_item_id)
readwise_documents(connection_id, subtype, current_location, media_item_id)
readwise_documents(current_location, author_key, media_item_id)
readwise_documents(current_location, publication_key, media_item_id)
readwise_documents(current_location, reading_time_minutes, media_item_id)
readwise_documents(current_location, reading_progress, media_item_id)

readwise_tags(connection_id, tag_key) UNIQUE
readwise_document_tags(readwise_document_id, tag_key) UNIQUE
readwise_document_tags(tag_key, readwise_document_id)

readwise_highlight_containers(connection_id, user_book_id) UNIQUE
readwise_highlight_containers(connection_id, external_id)
readwise_highlights(connection_id, highlight_id) UNIQUE
readwise_highlights(container_id, upstream_state, is_discard, location_type, location, highlight_id)

article_library_projection(in_archive, latest_archived_at DESC, normalized_title, media_item_id)
article_library_projection(in_queue, queue_added_at DESC, normalized_title, media_item_id)
article_library_projection(in_feed, feed_arrived_at DESC, normalized_title, media_item_id)
article_library_projection(subtype, normalized_title, media_item_id)
article_library_projection(author_key, normalized_title, media_item_id)
article_library_projection(publication_key, normalized_title, media_item_id)
article_library_projection(reading_time_minutes, normalized_title, media_item_id)
```

### Schema invariants

1. One source document row exists per connection and Reader document ID.
2. One Reader Archive occurrence exists per connection and Reader document ID.
3. Current location changes never erase retained Archive history.
4. Queue retirement by absence occurs only after a successful complete
   all-location snapshot.
5. Feed never creates Queue or Archive membership by itself.
6. A source record cannot attach private annotations to an unverified document
   join.
7. Deleted/discarded highlights never enter ordinary search or display.
8. Signed temporary URLs never enter D1, logs, fixtures, or committed docs.
9. Browse rows, counts, facets, and detail eligibility use identical category
   and relationship predicates.
10. Every projection and index is rebuildable from retained normalized/raw
    evidence.

## Readwise acquisition and reconciliation plan

### Parser and cursor versions

Introduce explicit versions for each independently replayable stream:

- `readwise-documents@5`;
- `readwise-tags@1`;
- `readwise-highlights@1`;
- `readwise-html@1`; and
- Article browse/search projection versions.

Replace the misleading durable cursor name `reader-archive` with
`reader-documents`. Do not copy the old checkpoint as proof of full coverage.
The first new run must perform a complete all-location sweep; only then may it
establish the incremental watermark and `allLocationsBackfilled=true`.

### Per-connection lease

Acquire a short database lease before a Reader document/tag/highlight sync so a
manual run and cron run cannot finalize competing snapshots. Lease acquisition
must be conditional and retryable. Expired leases may be recovered; an active
lease returns a safe conflict rather than launching overlapping writes.

### Complete all-location document sweep

1. Record a new sync run and snapshot run ID.
2. Request `GET /api/v3/list/?limit=100` without a location filter.
3. Preserve every exact response page in R2 before parsing.
4. Create addressable source records for every result, including ineligible and
   unknown categories.
5. Upsert `readwise_documents`, canonical items/identities, retained Archive
   occurrences, and explicit Queue relationships page by page.
6. Mark each observed document and relationship with the snapshot run ID.
7. After the final cursor page commits, finalize Queue and Feed absence against
   that snapshot. Mark absent source documents unknown/unobserved rather than
   claiming deletion.
8. Rebuild the Article browse and metadata search projections.
9. Commit coverage state and the incremental watermark only after every prior
   step succeeds.

If any page, normalization batch, projection rebuild, or finalization fails, the
run fails without advancing coverage or the durable watermark. A retry may reuse
content-addressed raw objects but must reprocess the incomplete snapshot.

### Incremental document reconciliation

After baseline coverage:

- request documents updated since the durable watermark minus five minutes;
- preserve and process every page;
- update current location and source facts from explicit observations;
- admit Archive history on an Archive observation;
- retire Queue membership on an explicit non-Queue observation;
- never retire a relationship merely because it is absent from an incremental
  page;
- rebuild only affected browse/search rows when practical; and
- advance the watermark to the recorded window start only after all work is
  durable.

The five-minute overlap remains acceptable from the current connector. Parser
idempotency, not timestamp exclusivity, prevents duplicates.

### Tag acquisition

Run a complete v3 Tag LIST sweep during the baseline sync family and
periodically thereafter. Document attachment truth comes from complete document
snapshots. A missing attachment is retired only when a complete observation of
that document's tag object establishes its current set.

Tag-vocabulary absence from a complete Tag LIST may retire the vocabulary row
for current display but never delete historical source evidence.

### Highlight acquisition

Use `GET /api/v2/export/?includeDeleted=true`:

- complete backfill first;
- exact raw-page retention;
- cursor pagination independent of envelope `count`;
- equality verification of Reader container `external_id` before attachment;
- explicit deletion/discard state;
- overlapped `updatedAfter` reconciliation; and
- durable highlight cursor only after normalized records and search updates
  commit.

The advanced v2 Highlight and Book lists remain diagnostic tools, not the
primary production path.

### Selective full-text policy

The recommended initial policy is:

- acquire parsed HTML for eligible items currently in Archive or Queue;
- also retain/acquire it for a Feed item that already has Archive or Queue
  history;
- do not bulk-acquire text for Feed-only inventory;
- never make text acquisition part of the document-sync transaction; and
- retry content jobs independently with bounded concurrency.

This focuses private storage and indexing on deliberate or consumed material
while keeping the 665-item ambient Feed usable through metadata. It also gives
Archive and Queue the search behavior the owner is most likely to expect.

Request a targeted document by ID with `withHtmlContent=true`. Preserve the
exact authenticated response as private raw evidence, sanitize and extract
plain text with a versioned parser, store raw/extracted bytes in R2, create the
manifest/chunk locators, then update the contentless index. Do not render the
body in the browser.

Use the existing Cloudflare Queue for idempotent content jobs rather than
holding an HTTP or cron request open across an unbounded backfill. The job key
includes connection, Reader document ID, source `updated_at`, acquisition
version, and extraction version. Enqueue only after the document projection
commits. Failed, dead-lettered, or stale reservations are recoverable on a later
sync, permanent no-content outcomes remain explicit, and 429 responses honor a
bounded `Retry-After` retry. The consumer stores the exact v3 response before
parsing, stages at most 12 index chunks per invocation, and promotes a manifest
to ready only after the last chunk is durable. Local tests use an explicit
consumer harness; the collection API never performs acquisition inline.

If the source returns empty or unavailable content, record Metadata only or
Highlights only rather than treating the document sync as failed. Raw-source
downloads remain deferred until retention and content-type behavior are needed.

### Legacy Archive repair

The existing connector marked Reader Archive occurrences removed when it later
observed a non-Archive location. Repair this safely during the first all-location
replay:

- scope only to `readwise_archive_state` occurrences with Reader admission
  evidence;
- restore retained status without deleting the old removal evidence;
- keep the last supported inferred Archive date;
- never reactivate an explicitly superseded/corrected occurrence from another
  source; and
- add a regression for Archive -> Later, Archive -> Feed, and Archive -> Later
  -> Archive sequences.

Document the historical interpretation in source provenance so the legacy
removal link is not misrepresented as a verified Reader deletion.

### Real-data replay

Before exposing production Articles routes, replay the retained owner pages or
run the new all-location sync into an isolated D1/R2 environment. Record only
aggregate, content-safe results:

- rows and eligible rows by category/location;
- Archive, Queue, Feed, and overlap counts;
- null/invalid counts for every displayed/filterable field;
- reading-time parser success by raw pattern;
- verified and unresolved v2/v3 container joins;
- active/deleted/discarded highlight counts;
- full-text eligibility/acquisition counts and failure classes;
- duplicate Reader/source URLs without their values; and
- replay idempotency hashes/counts.

Do not commit the real pages, titles, URLs, notes, highlights, or extracted text.

## Contracts and API plan

Create `packages/contracts/src/articles.ts` and export it from the package root.
Keep Article routes media-specific, matching Books and Movies.

### Collection endpoint

```text
GET /api/library/articles
```

Validated query fields:

```text
section=archive|queue|feed
q
sort
direction=asc|desc
type=article|pdf|rss|newsletter              repeated
author=<facet-key>                           repeated
publication=<facet-key>                      repeated
publishedFrom / publishedTo / publishedUnknown
readingTime=under5|5to15|16to30|31to60|over60|unknown repeated
progress=notOpened|openedZero|inProgress|complete|unknown repeated
archivedFrom / archivedTo / archivedUnknown
currentState=archive|inbox|later|shortlist|feed|unknown repeated
queueState=inbox|later|shortlist              repeated
addedFrom / addedTo / addedUnknown
arrivedFrom / arrivedTo / arrivedUnknown
opened=opened|notOpened                       repeated
history=archived|notArchived                  repeated
limit=1..100
cursor=<opaque-versioned-cursor>
```

Reject incompatible section-only fields at the HTTP boundary. The web route
normalizer removes them when switching sections. Date/range input drafts remain
local until valid and never send an intentionally invalid API request.

Response:

```ts
type ArticleCollectionResponse = {
  data: ArticleCollectionRow[]
  nextCursor: string | null
  sectionCounts: { archive: number; queue: number; feed: number }
  totalCount: number
  filteredCount: number
  occurrenceCount: number | null
  facets: ArticleFacets
  capabilities: {
    fullTextSearch: boolean
    highlights: boolean
  }
  coverage: {
    allLocationsBackfilled: boolean
    highlightsBackfilled: boolean
    fullTextPolicy: 'archive_queue' | 'disabled'
    lastSuccessfulSyncAt: string | null
  }
}
```

Rows contain only the accepted list fields. They never include full notes,
highlight sets, HTML, full text, raw payloads, temporary URLs, or provenance
diagnostics.

### Detail endpoint

```text
GET /api/library/articles/{mediaItemId}
```

Return common metadata plus a typed Article block containing:

- subtype and source category;
- author, publication, acquisition source, summary, thumbnail;
- publication, saved, opened, moved, changed, and observation timestamps with
  their correct labels/precision;
- word count and raw/parsed reading time;
- progress/opened display state and validity;
- every current relationship and source document identity summary;
- current tags;
- separate v3 and v2 document notes;
- active/deleted/discarded highlight counts;
- content availability, manifest freshness, and safe failure state;
- validated original and Reader links;
- coverage/freshness; and
- first history and highlight pages when doing so does not duplicate large
  payloads.

Eligibility requires Archive, Queue, or Feed membership. A Queue-only or
Feed-only article is fully inspectable.

### History endpoint

```text
GET /api/library/articles/{mediaItemId}/history?limit=25&cursor=...
```

Return retained Reader Archive occurrences newest first, with exact temporal
value/precision/basis, admission source, current/superseded disposition,
matching-date-filter flag when the normalized filter context is supplied, and a
safe evidence summary. Current Reader state and open/progress snapshots belong
in detail, not fabricated as occurrence rows.

### Highlights endpoint

```text
GET /api/library/articles/{mediaItemId}/highlights?limit=20&cursor=...
```

Return active, non-discarded highlights in comparable source-position order,
then highlighted time and stable ID. Each result may include passage text,
attached note, favorite state, highlighted time, a human-readable location only
for recognized units, and validated Reader link. The response never returns
deleted/discarded private text.

### Facets

Return section-aware options/counts for Type, Author, Publication, Reading time,
Progress, and applicable state/history filters. Author and Publication facet
search may use a small server endpoint or a bounded query parameter on the same
collection route. Facet counts apply every active filter except their own facet.

Tags are returned in detail but are not a collection facet.

### Cursor design

Collection cursors are opaque, versioned, and signed or integrity-checked. Bind
them to normalized section, filters, search, sort, direction, owner timezone,
and projection version. Include:

- sort null rank;
- normalized sort value;
- normalized title tie-breaker;
- media-item ID; and
- relevance rank when applicable.

History and highlight cursors have independent versions and query hashes.
Mismatched or stale cursors return `BAD_REQUEST`; the client refreshes from the
first page after a successful sync or projection-version change.

### Query invariants

- Rows, counts, facets, and detail eligibility use the same category and
  relationship predicates.
- Search candidates are intersected with section and filters before pagination.
- Archive ranges use `EXISTS` across retained occurrences; the latest matching
  occurrence drives row display and sort.
- Null date/numeric values sort last in both directions.
- Queue and Feed current state is connection-scoped.
- One canonical item is returned once per section.
- Counts cover the complete server-side result, never only loaded pages.
- A browse request performs no R2 reads. Only a winning authorized full-text
  excerpt may cause a bounded R2 range read.

## Web implementation plan

### Routing and navigation

Enable Articles in the production media navigation and add:

```text
/library/articles/archive
/library/articles/queue
/library/articles/feed
```

The workspace breadcrumb displays Library / Articles. The three routes share
one page component and normalized search schema.

### URL state

Encode the accepted search, sort, filter, and `item` state in the URL. Repeat
multi-value parameters in stable sorted order and omit defaults. Invalid values
are removed through normalized URL replacement rather than producing an API
error screen.

The route module must:

- clear incompatible section-only filters and their dependent bounds;
- normalize sort and direction together when switching sections;
- allow Relevance only with search;
- keep incomplete text/date/year-like filter drafts out of collection requests;
- exclude `item` and `density` from the collection cache key; and
- preserve the active section's independent state when navigating among
  Archive, Queue, and Feed.

### Query cache and loaded pages

Use TanStack Query infinite queries keyed only by normalized collection inputs.
Do not key collection pages by selected item, inspector tab, density, sidebar
state, or layout width.

Opening/closing the inspector, changing density, switching inspector tabs, and
sidebar collapse preserve every loaded page. Changing section/search/filter/
sort starts the appropriate section-specific query chain. Deduplicate live-page
overlap by media-item ID while preserving server order.

Invalidate section counts and first pages after a successful Reader sync or
projection replay. Keep cached rows visible during background refresh failure.

### Collection page

Build a production Articles feature rather than importing the review artifact.
Reuse the shell's established toolbar, filter panel, loading/error/empty states,
and compact inspector framing where they fit. Keep Article row markup and styles
media-specific.

Required behavior:

- Archive/Queue/Feed switcher with complete unfiltered counts;
- debounced server search;
- restrained/expanded density toggle;
- filter button with active count;
- section-valid sort control;
- exact result and occurrence counts;
- 50-row pages and explicit Load more;
- quiet subtype glyph on missing/broken images;
- bounded titles and metadata without inaccessible hover-only text; and
- no row action toolbar.

### Inspector behavior

Selection lives in `item`. Opening pushes browser history; Back closes before
leaving the collection; Forward reopens. Close removes only `item` and returns
focus to the triggering row when present.

Detail, history, and highlight requests use separate query keys and abort or
ignore stale responses during rapid selection. A selected item filtered out of
the current results remains open with `Not in current results`. A direct item URL
works without loading the row's page first.

The inspector uses safe plain-text rendering for imported summary, notes, and
highlights. No imported HTML is injected. External links use a new browsing
context with `noopener,noreferrer`.

### Density and responsive behavior

Restrained density is the canonical narrow presentation. Expanded density may
collapse lower-priority metadata as width decreases but must retain title and
section-defining state. On narrow screens the inspector uses the existing sheet
behavior and preserves the collection beneath it.

Remember density per media type in local storage. Do not put it in the API query
or reset it across sections.

### Accessibility

- Rows are keyboard-operable with a visible focus ring distinct from selection.
- Section and inspector tabs expose correct selected state and labeling.
- Thumbnail images are decorative when title text supplies identity.
- Progress exposes a factual accessible label.
- Filter panels and facet searches are labeled and closable by keyboard.
- Focus returns predictably after inspector close and filter actions.
- Loading, refresh failure, empty state, and inline inspector errors are
  announced without replacing still-usable content.
- Reduced-motion preferences apply to inspector and filter transitions.

## Suggested code organization

```text
packages/connectors/readwise/src/
  client.ts
  documents.ts
  highlights.ts
  *.test.ts

packages/contracts/src/
  articles.ts
  articles.test.ts

packages/db/src/
  articles-repository.ts
  articles-repository.test.ts

packages/db/migrations/
  0008_articles_library.sql
  0009_article_content_search_map.sql
  0010_article_content_jobs.sql
  0011_article_current_availability.sql
  0012_article_content_reliability.sql
  0013_article_content_attempts.sql

apps/api/src/
  readwise-sync.ts
  readwise-sync.test.ts
  readwise-content.ts
  readwise-content.test.ts
  app.ts
  app.test.ts

apps/web/src/features/articles/
  articles-api.ts
  articles-route-search.ts
  articles-route-search.test.ts
  articles-collection-page.tsx
  article-row.tsx
  article-filters.tsx
  article-inspector.tsx
  article-history.tsx
  article-highlights.tsx
```

Keep files cohesive rather than treating this exact split as mandatory. Do not
extract a universal media renderer merely because Books, Movies, and Articles
all have a toolbar and inspector.

## Delivery sequence

Each stage should be independently testable and reviewable.

### Stage 0: Baseline and replay proof

1. Record current migration, parser, cursor, and Reader aggregate state.
2. Confirm the ignored real-data/raw-page source is available without printing
   personal content.
3. Replay current Reader evidence into an isolated D1/R2 environment.
4. Measure legacy removed Reader Archive occurrences and current location
   overlaps.
5. Save only content-safe aggregate baselines in documentation.

Exit criterion: migration and replay inputs are understood before schema or
normalization changes.

### Stage 1: Contracts, migration, and source schemas

1. Add Article Zod request/response contracts and focused contract tests.
2. Add migration 0008 and Drizzle definitions for Reader documents, projection
   state, tags, highlights, content manifests/chunks, browse projection, and
   search indexes.
3. Add v3 full document/tag and v2 export schemas based on the live inventory.
4. Add category, temporal, reading-time, progress-validity, and URL
   normalization tests.
5. Test empty and upgrade migrations.

Exit criterion: schema and boundary types express the approved surface without
requiring the UI or live sync.

### Stage 2: All-location Reader document projection

1. Add the per-connection lease and new document cursor.
2. Implement 100-row all-location baseline acquisition with exact page
   retention.
3. Persist all source categories and current Reader facts.
4. Create eligible Queue-only and Feed-only canonical identities/items without
   Archive entries.
5. Materialize source-derived Queue membership.
6. Implement retained Archive semantics and repair legacy moved-out entries.
7. Finalize snapshot absence only after every page succeeds.
8. Add failure/retry, overlap, and parser-version replay tests.

Exit criterion: isolated replay produces correct Archive, Queue, Feed, overlap,
and coverage counts and is idempotent.

### Stage 3: Tags and deletion-aware highlights

1. Add complete Tag LIST acquisition and attachment reconciliation.
2. Add v2 export backfill with `includeDeleted=true`.
3. Verify v2/v3 identity joins and preserve unresolved containers.
4. Project document notes and active highlights.
5. Reconcile highlight deletions/discards and update metadata search.
6. Add independent checkpoints and failure/retry tests.

Exit criterion: all current inspector annotations are queryable without parsing
raw pages, and deleted/discarded text cannot appear.

### Stage 4: Article repository and API

1. Build/rebuild `article_library_projection` and metadata/annotation FTS.
2. Implement all section predicates, filters, facets, sorts, counts, and cursors.
3. Implement collection, detail, history, and highlight endpoints.
4. Validate every response with Article contracts.
5. Cover multi-page pagination, null ordering, cursor mismatch, overlap, and
   section isolation.

Exit criterion: the full approved surface is accessible through fixture-backed
REST APIs without full-text acquisition.

### Stage 5: Articles production UI

1. Enable Articles navigation and routes.
2. Implement normalized URL state and per-section remembered query state.
3. Build restrained/expanded row rendering from the review artifact and written
   contract.
4. Implement server-side filters, sorts, counts, search, and pagination.
5. Preserve loaded pages and scroll across inspector/density/sidebar changes.
6. Add empty, partial-coverage, cached-refresh, initial-error, and missing-image
   states.

Exit criterion: Archive, Queue, and Feed are usable against real projected data
with production shell behavior and no inspector dependency.

### Stage 6: Inspector, History, and highlights

1. Implement Details and History tabs.
2. Add source-correct links, summary, Article facts, tags, content status, and
   source facts.
3. Add retained Archive history and current Reader snapshot separately.
4. Paginate active highlights and preserve their notes/order.
5. Implement Back/Forward, focus restoration, direct links, stale request
   protection, and filtered-out selection behavior.

Exit criterion: every supported personal Reader fact is reachable through the
approved inspector with correct source/date semantics.

### Stage 7: Selective full-text acquisition and search

1. Add independent Archive/Queue content acquisition jobs.
2. Implement the idempotent Cloudflare Queue producer/consumer and local test
   harness.
3. Persist raw authenticated pages and extracted text privately in R2.
4. Add manifests, chunk locators, contentless FTS, safe excerpts, and expiry/
   deletion cleanup.
5. Merge content results into Article relevance ranking without changing
   membership.
6. Display Full text, Partial text, Highlights only, Metadata only, and safe
   error states.
7. Verify Feed-only documents are not bulk-acquired.

Exit criterion: authorized text improves search while source outage, missing
text, or extraction failure leaves Articles fully usable.

### Stage 8: Hardening and acceptance

1. Replay identical and changed all-location snapshots.
2. Exercise interrupted pages, projection failure, cursor retry, and stale
   lease recovery.
3. Run complete checks, build, browser tests, and fresh/upgrade migrations.
4. Test the owner timezone boundaries and more-than-one-page collections.
5. Visually inspect both themes, all three sections, both densities, open/closed
   sidebar, open/closed inspector, and narrow sheet mode using bounded real
   owner data.
6. Review the cumulative implementation independently before commit.

Exit criterion: every checklist item below is supported by automated or recorded
manual evidence and no known correctness defect remains.

## Test strategy

### Connector and sync

- All eligible/ineligible/unknown category routing.
- Ordinary, missing, null, empty, and malformed field shapes.
- Full snapshot and incremental cursor pagination.
- Repeated cursors, 429/Retry-After, malformed successful response, and network
  failure.
- Raw storage before parsing.
- No checkpoint advancement after later-page, finalization, projection, tag,
  or highlight failure.
- Same-page replay and parser-version replay.
- Archive -> Later/Feed/Inbox/Shortlist and return-to-Archive behavior.
- Queue retirement on explicit movement and complete-snapshot absence only.
- Multi-connection isolation.
- Tag rename, attachment removal, and incomplete observation behavior.
- Verified/unresolved highlight container joins.
- Highlight deletion/discard and idempotent updates.
- Selective HTML acquisition success, empty content, extraction failure, and
  retry.
- Recovery after enqueue failure, transient failure, dead-lettering, and stale
  reservations; permanent no-content failures do not loop.
- Exact raw content-response retention before parsing, staged multi-invocation
  indexing, and atomic ready-manifest promotion.

### Database and repository

- One row per section despite multiple occurrences/identities.
- Independent Archive, Queue, and Feed overlaps.
- Every filter, repeated-value rule, facet, and section restriction.
- Archive `EXISTS` matching and latest-matching display occurrence.
- Progress distinctions: unopened zero, opened zero, partial, complete, missing,
  invalid.
- Reading-time bucket boundaries and unparseable values.
- Null-last ascending and descending sorts.
- Stable keyset pagination beyond 50 rows for every default sort.
- Cursor/query/projection-version mismatch rejection.
- Literal escaping for FTS fallbacks and special characters.
- Exact complete counts independent of loaded pages.
- Deleted/discarded annotations absent from detail and search.
- Full-text expiry/removal removes searchability before exposure.

### Contracts and API

- Valid response parsing for all endpoints and field states.
- Incompatible section filters and invalid bounds return stable `BAD_REQUEST`.
- Ineligible/unknown IDs return `NOT_FOUND` without failing the collection.
- Queue-only and Feed-only detail eligibility.
- No raw HTML, signed URLs, deleted text, or raw payload content in responses.
- Safe internal errors without credentials, private text, or stack traces.

### Web and browser

- Navigation among Archive, Queue, and Feed with independent remembered state.
- Search debounce and Relevance default/normalization.
- Typing incomplete date/filter values never flashes API errors.
- Loaded-page preservation across item open/close, tab, density, and sidebar
  changes.
- Section changes clear incompatible sort direction and filters.
- Direct item links and Back/Forward.
- Focus restoration and keyboard navigation.
- Stale detail/highlight response protection.
- Selected item filtered out while inspector remains open.
- Load-more deduplication and sync invalidation.
- Missing/broken image fallback.
- Cached refresh failure versus initial failure.
- Narrow sheet mode and reduced motion.

### Visual QA matrix

Review at minimum:

- Graphite light and dark;
- Archive, Queue, and Feed;
- restrained and expanded density;
- default, search excerpt, active filters, empty, loading, and error states;
- missing title, artwork, author, publication, dates, reading time, and progress;
- long title/byline/summary/note/highlight;
- inspector Details and History;
- many tags and more than 20 highlights;
- sidebar expanded/collapsed; and
- adjacent desktop inspector and narrow-screen sheet.

## Performance budgets and guardrails

- Reader v3 pages use the documented maximum of 100 for backfill efficiency.
- Collection page size is 50; API maximum is 100.
- Highlights page size is 20; Archive history page size is 25.
- No collection request performs per-row SQL. Non-search collection requests
  perform no R2 reads. Full-text search may perform at most one bounded R2 range
  read for each returned Text excerpt, with a strict per-response cap and
  parallelism limit; additional matching rows remain valid without an excerpt.
- Facets and counts use indexed server queries, not client scans.
- Feed does not preload all 665+ rows.
- Search debounces requests and aborts superseded fetches.
- Detail payloads exclude full highlight sets and article bodies.
- Full-text extraction runs outside the document-sync transaction with bounded
  concurrency and provider-aware throttling.
- R2 excerpt retrieval is bounded to the winning authorized chunk and never
  fetches a complete article body for a collection response.
- Projection rebuilds expose a new version only after complete success.

Measure real-data query plans and response times before declaring acceptance.
Do not invent a hard latency number without the deployment environment; record
the observed baseline and regressions instead.

## Rollout and recovery

- Apply the migration to an isolated copy and run the all-location replay before
  touching the active local database.
- Preserve current raw objects and legacy evidence; never rewrite an applied
  migration or delete a mistaken historical observation.
- Keep the previous generic media browsing paths functional until Articles
  acceptance completes.
- A failed baseline leaves `allLocationsBackfilled=false` and the current
  surface usable with an explicit coverage warning.
- A failed incremental run leaves the prior cursor and browse projection active.
- A failed highlight or content run does not roll back document relationships.
- Rebuild commands must support Reader source projections, Article browse
  projection, metadata search, and content search independently.
- Before remote migration/deployment, create the normal D1 recovery point/export
  and verify R2 access.

## Documentation updates required at shipment

- `docs/sources/readwise.md`: exact production all-location, tag, highlight,
  HTML, retry, and coverage behavior.
- `docs/architecture/README.md`: Articles read-model and operational status.
- `docs/architecture/canonical-ledger.md`: retained Reader Archive behavior and
  source-derived Queue mapping.
- `docs/planning/implementation-plan.md`: Articles shipped status and remaining
  Reader webhook/raw-source limitations.
- `docs/planning/library-implementation.md`: Articles delivery status.
- `docs/planning/library-phase-2-surfaces.md`: status only; do not rewrite owner-
  approved product history.
- `packages/connectors/readwise/README.md`: authentication, full/incremental
  sync, highlights, selective content, deletion gaps, and replay.
- `apps/api/README.md` and environment examples if operational commands change.

Add a new ADR only if implementation changes an accepted durable decision, such
as making Queue locally authoritative, treating Feed as Queue, or persisting
raw-source capabilities. The source-specific tables and read model described
here fit existing ADRs 0007–0011.

## Owner input

No decision blocks Stages 0–6. The accepted product specification, live Reader
probe, existing token, Index shell, and source-derived Queue ADR are sufficient.

This plan makes three implementation recommendations that do not alter the
approved visible product:

1. Use generic `queue_entries` as a provenance-bearing source-derived
   materialization while keeping `readwise_documents` authoritative for current
   Reader state.
2. Initially acquire parsed full text for Archive and Queue, plus Feed items that
   overlap those relationships; exclude Feed-only bulk acquisition.
3. Defer Reader webhooks and temporary raw-source downloads until their remaining
   authentication, delivery, retention, and content-type questions are needed.

If the owner accepts this plan, these recommendations are accepted for the
initial Articles implementation. They can be revisited without changing the
visible row/filter/sort contract.

## End-to-end acceptance checklist

- [x] A complete all-location Reader sweep has succeeded against real owner data.
- [x] Archive, Queue, and Feed counts match isolated real-data aggregates.
- [x] Eligible and ineligible categories route correctly.
- [x] A document moved away from Archive remains in retained Archive history.
- [x] Inbox, Later, and Shortlist form one Queue with correct substates.
- [x] Feed remains independent from Queue and recommendations.
- [x] Rows, counts, facets, and detail eligibility share predicates.
- [x] Every approved filter and sort is implemented; rejected filters/sorts are
      absent.
- [x] Null dates and numbers display honestly and sort last.
- [x] Search covers approved metadata, notes, active highlights, and authorized
      text with bounded labeled excerpts.
- [x] Deleted/discarded highlights never display or search.
- [x] Full-text absence/failure does not block Articles.
- [x] Inspector Details and History expose every approved fact without invented
      activity.
- [x] Collection pages survive inspector, density, and sidebar presentation
      changes.
- [x] Back/Forward, direct links, focus restoration, and stale response handling
      work.
- [x] Replaying identical source data is idempotent.
- [x] Failed pages/projections do not advance cursors or coverage.
- [x] Fresh and upgrade migrations pass.
- [x] `pnpm check`, `pnpm build`, and `pnpm test:e2e` pass after the final edit.
- [x] Light/dark and desktop/narrow visual QA is complete with bounded real data.
- [x] An independent final review finds no unresolved correctness issue.
- [x] Owning documentation is updated before commit.

## Ready-to-copy implementation brief

> Implement the accepted Articles plan in
> `docs/planning/articles-implementation.md`. Read `AGENTS.md` and every linked
> product, architecture, source, design, and surface document first. Build the
> complete Readwise-backed Articles vertical slice: all-location current-state
> projection, retained Archive history, source-derived Inbox/Later/Shortlist
> Queue, separate Reader Feed, tags, deletion-aware v2 highlights, server-side
> collection/detail/history/highlight APIs, restrained/expanded production UI,
> and selective Archive/Queue full-text search. Preserve raw evidence, source
> date semantics, connection isolation, and cursor atomicity. Do not add Reader
> writes, Feed-to-Queue conflation, fabricated movement history, article-body
> rendering, rejected filters/sorts, or fuzzy identity matching. Use real owner
> data only in ignored or isolated environments and commit only aggregate
> findings and synthetic fixtures. Run the full required validation and perform
> visual QA before handoff.
