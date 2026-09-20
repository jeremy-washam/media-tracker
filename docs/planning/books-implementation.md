# Books end-to-end implementation plan

Status: Approved for implementation
Last updated: 2026-09-20

## Purpose

Books is the first production Library vertical slice. Shipping it means more than
adding a Books page: it establishes the production application shell, Library
navigation, URL-state conventions, inspector behavior, source-specific read
models, and API patterns that later media types will reuse.

This plan turns the accepted Books surface specification and the approved Index
layout into an implementation sequence. It deliberately keeps Hardcover as the
source of imported personal state and preserves the canonical ledger's
replayability and provenance guarantees.

## Outcome

At completion, the application will have:

- The production Index shell: persistent left navigation, a primary workspace,
  and a responsive right inspector.
- A functional Library > Books area with Archive and Queue collections.
- Grid and Readwise-style list layouts using the accepted information density.
- URL-backed search, filtering, sorting, layout, and selection state.
- A Books inspector with separate Details and History tabs.
- A full Hardcover snapshot that projects all fields needed by the Books
  collection and inspector into D1.
- Books-specific API contracts, repositories, pagination, and search.
- Existing Connections functionality moved into the new shell without losing
  any connector or import behavior.
- Stable extension points for later Articles, Movies, Podcasts, Music, and
  Videos implementations.

## Scope

### Included

- Full production application shell and theme foundation.
- Library navigation and Books routes.
- Hardcover acquisition for Want to Read, Currently Reading, and Read books.
- Hardcover work, edition, contributor, series, taxonomy, community, and
  personal-history projections required by the approved surfaces.
- Books Archive and Queue read APIs.
- Books detail and history APIs.
- Search, filters, sorts, pagination, loading, empty, error, and degraded states.
- Desktop behavior and a usable narrow-screen fallback.
- Accessibility, automated tests, migration/replay validation, and visual QA.
- Documentation updates for shipped behavior.

### Excluded

- Writing status, rating, review, progress, or Queue changes back to Hardcover.
- A locally authoritative Queue.
- Books recommendations, discovery, or social/community interaction.
- Full implementations of Chat, Recaps, or non-Books media libraries.
- A mobile-specific information architecture or native mobile application.
- Renaming the product.

## Accepted product behavior

These decisions are already settled and should not be reopened during
implementation unless validation exposes a genuine contradiction.

### Collections

- Books has exactly two collection views: Archive and Queue.
- There is no All view and no Reading view.
- Hardcover Want to Read and Currently Reading both remain in Queue until the
  book is completed.
- Queue membership and Archive membership are independent. Completing a book
  does not imply that an upstream Queue/status record has disappeared.
- A book can therefore be present in both Archive and Queue if the source data
  says so.

### Occurrences

- Every supported read occurrence is retained in History.
- Collection-level occurrence fields, filters, and sorts use the latest
  supported read occurrence.
- Older occurrences never satisfy collection predicates in place of the latest
  occurrence.
- Unsupported or incomplete occurrences remain available as source evidence but
  do not silently become dated Archive events.

### Grid and list

- Grid is the default layout.
- A grid card contains cover, title, and author only.
- The Readwise-style list may additionally show series and publication year.
- Archive rows may show latest finished date and personal rating.
- Queue rows may show the date added to Hardcover.
- Information that does not fit comfortably belongs in the inspector, not in a
  denser card.

### Search, filters, and sorting

- Search includes title, subtitle, author/contributor names, series, ISBN-10,
  ISBN-13, and ASIN when available.
- Shared filters: Format, Series, and Genre.
- Archive filters: Finished date, Published date, and Personal rating.
- Queue filters: Added to Hardcover date and Published date.
- Archive sorts are Recently read (default, descending), Earliest read, Title,
  Author, Personal rating, and Published.
- Queue sorts are Added to Hardcover (default, newest first), Title, Author, and
  Published.
- Unknown sort values follow known values in either direction. Normalized title
  and canonical media item ID provide stable final tie-breakers.
- Format means the format of the latest supported read in Archive. Queue format
  uses the current selected edition when known.
- The Archive header reports filtered distinct works and their supported-read
  count. Queue reports filtered distinct active works and no read count.

### Inspector

- Details owns bibliographic and source facts: Overview, Series, Contributors,
  Selected edition, Hardcover community metadata, and Source.
- History owns all personal activity: current status, collection memberships,
  date added, rating, review, progress, and every read occurrence.
- “Your book” is not used as a section name.

### Canonical URLs

- `/library/books/archive`
- `/library/books/queue`
- Search, filters, sort, direction, layout, and selected item are encoded in
  validated query parameters.
- A reload or shared URL reproduces the same collection state and selection.

## Current-state assessment

### Web application

The production web app still uses the original top-header History scaffold. It
has only `/` and `/connections`, generic media rows, and component-local filter
state. The approved Index shell and Books surfaces exist as design-review
artifacts, not production routes.

The design artifacts are useful visual references, but they must not be copied
wholesale into production. In particular, the Books prototype owns search,
layout, selection, and sample data in local component state. Production state
belongs in the router and server query cache.

### API and database

The current public media contract exposes only a generic ID, type, and title.
The database has the canonical ledger and credential tables, but no Books read
model, source-owned Queue projection, relationship tables, or search index.

The generic `/api/media` endpoint is not sufficient for the Books surface. It
uses Archive entries as its browse source, so it cannot express source-derived
Queue membership or Books-specific facets.

### Hardcover ingestion

The current Hardcover GraphQL query fetches only Read books and a narrow subset
of work, edition, and child-read fields. It does not acquire authors, covers,
descriptions, pages, series, genres, Queue statuses, progress, or date added.

Live reconnaissance confirmed that the upstream API exposes the fields needed
for the accepted Books design. The observed account snapshot contained 1,114
user-book relationships: 984 Want to Read, 2 Currently Reading, and 128 Read.
Those values are a migration sanity check, not a permanent test fixture or a
hard-coded product expectation.

## Recommended architecture

```text
Hardcover GraphQL
  -> immutable raw response objects in R2
  -> source-shaped Hardcover projections in D1
  -> canonical identities and Archive occurrences
  -> rebuildable Books collection read model and search index
  -> Books repositories and Hono routes
  -> typed contracts
  -> TanStack Query hooks
  -> URL-driven Books collection and inspector
```

### Ownership boundaries

- R2 raw objects are the replayable source evidence.
- Source-shaped Hardcover tables own imported relationship and catalog facts.
- The canonical ledger owns cross-source identity and consumption occurrences.
- A rebuildable Books read model optimizes browsing, filtering, sorting, and
  inspector summaries; it is not a second source of truth.
- The Books API owns Books-specific query semantics.
- TanStack Router owns navigable UI state.
- TanStack Query owns server state, caching, cancellation, and retries.
- React component state is limited to ephemeral presentation behavior such as an
  open popover or keyboard focus.

### Queue architecture

Do not add a generic `queue_entries` row merely to mirror Hardcover. Books Queue
membership is derived from the current source-owned `hardcover_user_books`
relationship where `status_id IN (1, 2)`.

This preserves source truth and keeps the future decision about a locally
editable, cross-source Queue separate. Adding local Queue writes later would
require its own product decision and architecture record.

### Read model

Add one rebuildable Books collection row per canonical book work. It should
contain only denormalized fields needed to render or order collection results,
including:

- Canonical media item ID and Hardcover work ID.
- Display title, subtitle, normalized title, primary author display, and cover.
- Publication date/year and current/default edition references.
- Current Hardcover status and date added.
- Queue membership flag.
- Archive membership flag.
- Personal rating.
- Latest supported read ID, finish timestamp/date, precision, and consumed
  edition/format.
- Aggregate read count and the timestamps needed for stable default ordering.
- Projection version and source freshness metadata.

Relationship filters such as contributor, series, genre, and identifier should
remain normalized in link/index tables. Avoid serializing filterable lists into
JSON columns.

The read model must be reproducible from the source projections and canonical
ledger. Include a repository command that rebuilds it without another network
call.

## Database and migration plan

Add a forward-only migration after the existing ledger and credential
migrations. Final names may follow repository conventions, but the schema needs
the following responsibilities.

### Source-owned Hardcover projections

#### `hardcover_user_books`

One row per upstream user-book relationship:

- Connection ID and upstream user-book ID.
- Canonical media item ID and Hardcover work ID.
- Current selected edition ID when present.
- Status ID and status label if supplied.
- Date added and source precision.
- Read count, personal rating, review, spoiler flag, and progress fields.
- Upstream updated timestamp.
- Last source-record reference.
- First observed, last observed, last-seen sync run, and retired timestamps.

#### `hardcover_user_book_reads`

One row per child read occurrence:

- Upstream read ID and parent user-book ID.
- Canonical Archive entry ID when the occurrence is supported.
- Consumed edition ID.
- Started, paused, resumed, and finished values when available.
- Raw source precision values.
- Progress/pages/seconds and source update metadata when available.
- Last source-record reference and snapshot lifecycle fields.

#### `hardcover_book_works`

Source catalog fields used by Books Details and collections:

- Work identity, title, subtitle, description, release date and precision.
- Page count, audio duration, primary/default edition references.
- Cover/image source fields.
- Community rating and rating-count fields.
- Slug/URL fields required to link back to Hardcover.
- Last source-record and projection timestamps.

#### `hardcover_book_editions`

- Edition identity and parent work.
- Title/subtitle, language, release date, pages, audio duration.
- ISBN-10, ISBN-13, ASIN, and other available identifiers.
- `reading_format_id` plus the upstream raw format label.
- Publisher, edition information, cover/image, and source URL fields.
- Last source-record and projection timestamps.

Treat `reading_format_id` as the canonical imported format classification. Keep
the raw format label for provenance because reconnaissance found it noisier.

#### Contributors, series, and taxonomy

Normalize reusable entities and links:

- Hardcover contributors/authors.
- Work- and edition-contributor role links.
- Series and work-series membership, including position where supplied.
- Taxonomy terms and work-term membership for the accepted Genre filter and
  optional community descriptors.

Contributor roles must distinguish author from translator, narrator, editor,
illustrator, and other available roles instead of flattening every name into an
author string.

### Books browse and search structures

- A rebuildable `book_library_projection` as described above.
- A normalized identifier lookup table for exact ISBN/ASIN matches.
- An FTS5 virtual table for title, subtitle, contributor, and series search.
- Ordinary indexes for collection membership, status, dates, rating, format,
  normalized title, foreign keys, and common join predicates.

D1 supports FTS5, but its export workflow does not export virtual tables. Treat
the FTS table as disposable infrastructure: keep its source columns in ordinary
tables and provide an explicit rebuild command. Use `EXPLAIN QUERY PLAN` to
verify the main collection queries before declaring the API complete.

### Schema invariants

- Upstream IDs are unique within their connection/source scope.
- Every source projection links to its immutable source record.
- A child read can map to at most one canonical Archive occurrence.
- Only fully supported completed occurrences produce dated Archive entries.
- Source status does not delete Archive history.
- Retiring a source relationship marks it inactive; it does not erase raw or
  canonical history.
- Projection rebuilds are deterministic and idempotent.

## Hardcover acquisition plan

### Split the acquisition into bounded queries

Do not replace the current query with one deeply nested request. Use staged,
bounded acquisition so failures, response sizes, and retries remain legible:

1. Page through all `user_books` statuses needed by Library, including child
   reads and lightweight work/current-edition identities.
2. Fetch work/catalog relationships in batches: contributions, series,
   community fields, cached tags/taxonomy, and default edition references.
3. Fetch the exact editions referenced by current selection, supported reads,
   and work defaults in batches.
4. Persist each raw response before parsing or projecting it.

Start with the page and batch sizes already shown safe in reconnaissance, then
measure Worker execution time and GraphQL response sizes. Limits belong in the
connector, not the route handler.

### Snapshot lifecycle

Use an explicit sync-run ID and mark-and-retire reconciliation:

1. Start a full Hardcover snapshot run without retiring prior rows.
2. Fetch and store each raw response object.
3. Validate and upsert every observed source entity with `last_seen_run_id`.
4. Create or update canonical identities and supported occurrences
   idempotently.
5. Build or update the Books read model and search documents.
6. Only after every page and enrichment batch succeeds, retire active
   source-owned rows not seen in the completed run.
7. Advance the connection sync cursor and record success only after finalization
   commits.

A failed or partial run retires nothing and advances no cursor. Its raw objects
remain available for diagnosis and replay.

### Parser and replay versioning

- Introduce a new parser/projection version for the expanded payload.
- Keep previous raw objects readable by the old-version parser path.
- Make replay explicit about whether the raw object contains enough fields for
  the new projection.
- Existing narrow raw pages cannot synthesize fields that were never selected;
  the initial Books rollout therefore requires one successful live full
  snapshot.
- Preserve ADR 0010's Archive fallback behavior for malformed or missing child
  read history.

### Sync observability

Record or return:

- Pages and enrichment batches fetched.
- Raw objects persisted.
- User books by status.
- Works, editions, contributors, series, and terms projected.
- Supported and unsupported read occurrences.
- Rows retired after complete reconciliation.
- Read-model and FTS rows rebuilt.
- Warnings grouped by reason rather than one unbounded list.

## Contracts and API plan

Keep the generic media endpoint for existing callers, but do not overload it
with Books-only fields or semantics.

### Collection endpoint

`GET /api/library/books`

Required request fields:

- `collection=archive|queue`
- `q`
- Repeated or encoded `format`, `series`, and `genre` values.
- Archive finished-date and rating bounds.
- Queue added-date bounds.
- Publication-date bounds.
- `sort`, `direction`, `layout`, and opaque `cursor` where applicable.
- A server-enforced page size with a default of 48.

Required response fields:

- Compact collection items containing exactly what grid/list rendering needs.
- An opaque next cursor.
- Total or collection counts only where they can be returned cheaply and
  consistently.
- Available facets with counts based on the active collection and query policy.
- Applied normalized query state when useful for debugging.
- Source freshness/degraded metadata sufficient for a non-alarming UI notice.

Do not emit inspector-only prose, full relationship arrays, or every occurrence
on this endpoint.

### Detail endpoint

`GET /api/library/books/:mediaItemId`

Return the complete Details-tab model:

- Work overview and cover.
- Primary and secondary contributors with roles.
- Series membership.
- Selected/current edition and identifiers.
- Default edition fallback where relevant.
- Hardcover community facts and taxonomy that were actually projected.
- Source link, upstream identity, and freshness.
- Compact personal summary needed for badges or tab labels, without duplicating
  the entire History response.

### History endpoint

`GET /api/library/books/:mediaItemId/history`

Return a reverse-chronological event/occurrence model with keyset pagination,
default page size 20:

- Status and collection membership facts.
- Date added.
- Personal rating and review.
- Progress facts.
- Every supported and explainable read occurrence.
- Source precision and provenance needed to label uncertain dates honestly.

The UI should not infer event ordering from display strings.

### Facets

Prefer facets in the collection response or a collection-adjacent endpoint that
shares the exact same normalized predicate builder. Facet counts and result
membership must never drift because two routes implemented filters differently.

For a selected facet, compute counts with that facet's own predicate omitted and
all other active predicates retained. This lets the user understand the effect
of changing a multi-select filter without producing misleading zero-only lists.

### Cursor design

Cursors are opaque, versioned, and signed or otherwise tamper-evident enough to
reject malformed state. Bind each cursor to a normalized query/filter/sort
fingerprint.

The cursor tuple includes:

- Null rank where the sort can be absent.
- Primary sort value.
- Normalized title as a deterministic secondary key.
- Canonical media item ID as the final unique key.

Relevance search includes its rank in the tuple. Reject a cursor reused with a
different collection or filter set instead of returning unpredictable results.

### Search behavior

- Normalize case, surrounding whitespace, and identifier punctuation.
- Exact normalized ISBN/ASIN matches outrank text search.
- FTS searches title, subtitle, contributor names, and series.
- Author names are explicitly searchable; “contributors” is a data-model term,
  not a reduction in user-facing author search.
- Empty search returns the collection's selected default order.
- Document ranking/tie-breaking in tests so results remain stable across query
  refactors.

## Production application layout plan

### Shell responsibility

Replace the top-header scaffold with a full-height shell containing:

- A collapsible global left sidebar.
- A route-owned central workspace.
- An optional inspector region on wide screens.
- A sheet/drawer presentation for the same inspector content on narrower
  screens.
- A consistent place for connection health and appearance controls.

The shell owns structure, navigation, responsive regions, theme, and persistent
sidebar preference. It does not own Books query state or selected-book data.

### Sidebar

The accepted information architecture is:

- Chat
- Library
  - Books
  - Articles
  - Movies
  - Podcasts
  - Music
  - Videos
- Recaps
- Connections and Settings/appearance in the secondary area

Use the approved Index visual hierarchy. Keep the production name “Media
Tracker”; the mock label “Margin” was not a naming decision.

Recommended collapse behavior is a 64-pixel icon rail, not a completely hidden
sidebar. Persist the preference locally and preserve active route context. On a
narrow screen, use an overlay drawer instead of shrinking the workspace to an
unusable width.

### Workspace

The Books workspace contains:

- Breadcrumb/title area.
- Archive and Queue collection tabs.
- Search.
- Filter and sort controls.
- Grid/list toggle.
- Results region with incremental loading.
- Empty, no-match, initial-sync, stale, and recoverable-error states.

Changing collection routes preserves compatible state such as layout and search
but drops filters that are invalid for the destination collection. This policy
must be implemented as a single route-normalization function and covered by
tests.

### Inspector

- Opening a book sets `item=<mediaItemId>` in the URL.
- The selected card/row remains visually selected.
- On wide screens, the inspector occupies the right region without covering the
  collection.
- On narrower screens, it becomes an accessible modal sheet.
- Back closes or restores selection according to browser history.
- A deep link loads the selected item even if it is not in the first collection
  page.
- Details and History tabs keep their own scroll positions while the same item
  remains selected.
- Closing the inspector returns focus to the invoking row/card when possible.

### Theme and shared components

- Promote the approved Graphite preset into production light and dark tokens.
- Preserve system preference on first visit and an explicit user override after
  selection.
- Keep shadcn-style shared components in `apps/web/src/components/ui` and use
  Base UI composition rather than Radix-specific `asChild` patterns.
- Add only the primitives the shell and Books need, likely tooltip, popover,
  checkbox, tabs, select/menu, dialog/sheet, separator, and skeleton.
- Do not add another global state library or styling framework.
- Keep the specimen and design-review routes/artifacts available for comparison;
  production must use extracted shared primitives rather than import mock data.

### Responsive baseline

The product remains desktop-first, but the shell must not fail on a phone-sized
viewport:

- Wide: sidebar, workspace, and adjacent inspector.
- Medium: icon rail or compact sidebar, workspace, inspector sheet.
- Narrow: menu-triggered sidebar drawer, single-column Books list/grid,
  inspector sheet.

This is a functional fallback, not a separate mobile product design.

### Accessibility baseline

- Every icon-only control has an accessible name and tooltip where helpful.
- Sidebar, tabs, list/grid toggle, filters, sheets, and menus are keyboard
  operable.
- Focus is trapped in modal drawers and restored on close.
- Active navigation and selected results are exposed semantically, not by color
  alone.
- Cover images use useful alt text; decorative fallbacks do not repeat titles.
- Rating and date precision are announced in understandable language.
- Loading does not replace the entire workspace or cause large layout jumps.

## Frontend data and state plan

### Router

Add validated route-search schemas for each Books collection. Invalid or legacy
query parameters normalize to the canonical URL. The route layer owns:

- Collection.
- Search text.
- Filters.
- Sort and direction.
- Layout.
- Selected media item.

Avoid a second context/store mirroring these values.

### Query cache

Use TanStack Query infinite queries for collection pages and normal queries for
detail and History. Query keys include the complete normalized server query.

- Keep the prior page visible while a compatible filter request loads.
- Cancel or ignore stale responses when search/filter state changes.
- Prefetch detail on intentional hover/focus where it does not create a request
  storm.
- Cache one selected book independently of collection membership.
- Do not synthesize filters client-side over a partial result page.

### Rendering model

Use one normalized collection item view model for both grid and list. Grid and
list decide presentation, not data acquisition. This prevents the two layouts
from drifting in search, membership, or sort semantics.

Cover fallbacks must be deterministic, visually quiet, and size-stable. External
image failure must not collapse card dimensions.

## Suggested code organization

Exact filenames may adjust during implementation, but responsibilities should
remain separated.

```text
apps/web/src/
  components/
    app-shell.tsx
    app-sidebar.tsx
    workspace-header.tsx
    inspector-shell.tsx
    ui/...
  features/books/
    books-route-search.ts
    books-api.ts
    books-queries.ts
    books-collection-page.tsx
    books-toolbar.tsx
    books-grid.tsx
    books-list.tsx
    book-inspector.tsx
    book-details.tsx
    book-history.tsx
  pages/
    connections-page.tsx

apps/api/src/
  books-routes.ts
  books-service.ts

packages/contracts/src/
  library/books.ts

packages/db/src/
  books-repository.ts
  books-projection.ts
  migrations/0003_*.sql

packages/connectors/hardcover/src/
  client.ts
  parser.ts
  projection.ts
```

Keep Hono handlers thin, Books query behavior in the repository/service layer,
and source behavior in the Hardcover connector. Do not put D1 or HTTP types into
the domain package.

## Delivery sequence

The sequence is intentionally vertical enough to expose integration mistakes
early, while keeping each stage reviewable.

### Stage 0: Lock decisions and baselines

Work:

- Verify that the resolved owner decisions below are reflected in acceptance
  cases and implementation tasks.
- Capture current screenshots of production and the approved Books artifact.
- Record a read-only live Hardcover count snapshot for migration comparison.
- Convert the accepted Books surface specification into named acceptance cases.
- Confirm there are no unrelated local changes before implementation begins.

Exit criteria:

- Every open owner decision has a recorded answer.
- Expected routes, navigation behavior, and release scope are unambiguous.
- The implementation baseline is reproducible.

### Stage 1: Contracts and schema skeleton

Work:

- Define Books request/response schemas and enums first.
- Add the forward-only source projection, relationship, read-model, identifier,
  and FTS migration.
- Add repository interfaces and empty-state implementations.
- Add migration and contract tests.

Exit criteria:

- An empty upgraded database can serve valid empty Books responses.
- A database upgraded from the current schema retains all existing ledger and
  credential data.
- FTS can be rebuilt from ordinary relational tables.

### Stage 2: Expanded Hardcover snapshot

Work:

- Implement paginated all-status user-book acquisition.
- Add bounded work and edition enrichment queries.
- Persist every raw response before parsing.
- Project user books, reads, works, editions, contributors, series, and terms.
- Reconcile only after a complete run.
- Populate canonical identities and Archive occurrences idempotently.
- Build the Books read model and FTS documents.

Exit criteria:

- A real full sync represents Want to Read, Currently Reading, and Read.
- Re-running the same snapshot produces no duplicates or semantic changes.
- Failure after any intermediate page/batch retires no prior active rows and
  advances no cursor.
- The live account's resulting counts reconcile with the source response, with
  explainable warnings for unsupported occurrences.

### Stage 3: Books repository and API

Work:

- Implement a single normalized predicate builder.
- Implement Archive and Queue membership, all approved filters, and exact sort
  semantics.
- Add FTS and exact identifier search.
- Add facets and versioned keyset cursors.
- Add detail and paginated History reads.
- Publish the routes through OpenAPI and connect them to typed contracts.

Exit criteria:

- Repository tests cover the full filter/sort matrix and occurrence rules.
- Cursor traversal has no duplicates or omissions under stable data.
- Query plans use intended indexes for representative Archive, Queue, author,
  ISBN, and filtered-sort queries.
- No browse/detail request calls Hardcover or reads/parses R2.

### Stage 4: Production shell and routing

Work:

- Promote Graphite tokens and theme persistence.
- Replace the top-header scaffold with the sidebar/workspace/inspector shell.
- Add canonical Library/Books routes and root redirect behavior.
- Move Connections into the shell without changing its operations.
- Add responsive sidebar and inspector regions.
- Establish reusable navigation, toolbar, and empty/error-state primitives.

Exit criteria:

- Direct navigation, reload, back, and forward work for every production route.
- Sidebar collapse and theme preferences survive reload.
- Connections import, sync, and connection-status behavior still works.
- The shell is keyboard usable at wide and narrow widths.

### Stage 5: Books collection UI

Work:

- Connect Archive and Queue to the collection API.
- Implement search, filters, sort, direction, and layout in URL state.
- Implement grid and Readwise-style list with the accepted density.
- Add incremental pagination and result/facet counts where supported.
- Implement loading, empty, no-match, initial-sync, stale, and partial-error
  states.

Exit criteria:

- Every control changes the URL and can be restored by reload.
- Grid and list show the same result set in the same order.
- Authors are searchable and publication date filters work.
- Queue includes both Want to Read and Currently Reading source statuses.
- Archive occurrence fields always use the latest supported read.

### Stage 6: Inspector and History

Work:

- Add URL-backed selection.
- Implement Details sections from the detail contract.
- Implement paginated History with all personal activity and occurrences.
- Add wide adjacent and narrow sheet modes.
- Implement selection/focus restoration and deep-link loading.

Exit criteria:

- Opening or closing a book is navigable with browser history.
- The inspector works for an item not present in the loaded collection page.
- Personal facts appear in History, not duplicate ad hoc Details sections.
- Multiple reads display separately and in deterministic order.

### Stage 7: Replay, reconciliation, and operational hardening

Work:

- Exercise full replay and read-model/FTS rebuild paths.
- Test source removals, status changes, changed editions, duplicate deliveries,
  malformed child reads, and partial snapshot failure.
- Add freshness and degraded-state reporting.
- Confirm sync runtime, D1 query cost, pagination latency, and index use with the
  real account scale.

Exit criteria:

- Projection can be rebuilt without network access when raw payloads contain the
  required versioned fields.
- A new full snapshot can repair projection drift.
- No source reconciliation path deletes historical evidence.
- Operational failures are diagnosable from sync results and logs.

### Stage 8: End-to-end and visual acceptance

Work:

- Add Playwright coverage for shell navigation, Books state, inspector, theme,
  keyboard behavior, and responsive layouts.
- Compare production against the approved artifact in light and dark themes.
- Review representative covers, missing images, long titles, multiple authors,
  missing dates, series, multiple reads, ratings, reviews, and long histories.
- Run the complete repository validation gate after the final edit.

Exit criteria:

- `pnpm check` passes after the final code/test change.
- Relevant builds, migrations, and end-to-end suites pass.
- Visual review at wide, medium, and narrow widths finds no obvious overflow,
  clipping, layering, focus, or contrast defects.
- Product acceptance cases pass against a real synced account without shipping
  that account data as fixtures.

## Test strategy

### Connector and sync

- Sanitized fixtures for each relevant Hardcover status and relationship shape.
- Multiple reads, no child reads, malformed child reads, and partial dates.
- Work/current/default/consumed edition disagreement.
- Contributor roles, multiple series, missing covers, and identifier variants.
- Duplicate page delivery and repeated complete snapshot.
- Failure before raw persistence, after raw persistence, during projection, and
  before final retirement.
- Source relationship removed or status changed between complete snapshots.

### Database and repository

- Empty migration and upgrade from the current migration set.
- Foreign-key, uniqueness, and lifecycle invariants.
- Deterministic projection and FTS rebuild.
- Queue/Archive overlap.
- Latest-occurrence filter and sort behavior.
- Null ordering and complete sort tie-breaks.
- Every supported filter alone and in representative combinations.
- Facet counts with self-predicate omission.
- Exact ISBN/ASIN and text/author/series search.
- Keyset page boundaries in both directions where supported.

### API contracts

- Query normalization and invalid values.
- Cursor/query mismatch rejection.
- Stable serialization of dates and precision.
- Empty, not found, stale, and degraded responses.
- OpenAPI response validation for collection, detail, and History.

### Web

- Route-search parse/serialize round trips.
- Archive-to-Queue state normalization.
- Grid/list parity.
- Loading and stale-response cancellation.
- Deep-linked selected item.
- Inspector focus restoration and keyboard operation.
- Theme and sidebar persistence.
- Connections regression coverage inside the new shell.

### Visual QA matrix

- Light and dark theme.
- Wide desktop, compact desktop/tablet, and phone-sized fallback.
- Grid and list.
- Archive and Queue.
- Inspector closed, adjacent, and sheet.
- Empty, loading, error, stale, no-cover, long-copy, and dense-history cases.

## Performance budgets and guardrails

Initial budgets should be measured locally and in the deployed Worker, then
recorded in tests or operational docs where stable:

- Collection endpoints should query D1 only and avoid per-row follow-up queries.
- First collection response returns no more than 48 items.
- History returns no more than 20 entries by default.
- Inspector detail is one bounded request plus paginated History.
- Facet computation must share predicates and use indexes; if combined facet
  latency is unacceptable, split it into a cacheable endpoint rather than
  weakening semantics.
- Search indexes are updated transactionally with their source projection or
  rebuilt explicitly; they must not drift silently.
- External cover images use fixed dimensions, lazy loading, and non-jumping
  fallbacks.

Do not set an arbitrary latency claim before measuring representative local and
remote D1 behavior. Record the measured baseline during Stage 7 and use it to
set regression thresholds.

## Rollout and recovery

1. Deploy the additive migration and backwards-compatible API code.
2. Run the first expanded Hardcover full snapshot and verify projection counts.
3. Validate Books APIs directly before enabling the production route.
4. Enable the new shell and Books route together so navigation never points to a
   half-implemented surface.
5. Keep the existing canonical ledger and raw objects intact throughout.

If the new read model is wrong, disable the Books route or rebuild the projection
and FTS tables. Do not roll back by deleting raw records, identities, Archive
entries, or source projections. Schema changes are forward-only; corrections
ship as a new migration.

## Documentation updates required at shipment

- Update `docs/sources/hardcover.md` with the new query shapes, status coverage,
  projection tables, pagination, reconciliation, and payload examples.
- Update `docs/planning/research/books-phase-2-surfaces.md` only if product
  acceptance changes a surface decision.
- Update `docs/planning/library-implementation.md` with completed stages and any
  cross-media conventions established by Books.
- Update `docs/design/ui-foundation.md` with final sidebar collapse, responsive
  inspector, and theme persistence behavior.
- Update the architecture overview with the source-projection/read-model path.
- Add an ADR only if implementation changes an accepted durable boundary, such
  as introducing locally authoritative Queue state. The plan as written does
  not require a new ADR.

## Resolved owner decisions

Accepted on 2026-09-20:

1. Show the full accepted navigation. Chat, Recaps, and non-Books media
   destinations are visibly disabled with accessible “Not available yet” help
   until implemented. Library > Books and Connections are functional.
2. Collapse the desktop sidebar to a persistent 64-pixel icon rail and save the
   preference locally. Use an overlay drawer at narrow widths.

No framework, hosting, database, or state-management choice requires owner
input for this implementation.

## Decisions that do not need owner input

- Continue with React/Vite, TanStack Router, TanStack Query, Hono/OpenAPI, Zod,
  D1/R2, Drizzle, TypeScript, Base UI, and the existing styling approach.
- Use source-owned Hardcover relationship tables rather than a generic Queue
  table.
- Use Books-specific contracts and repositories rather than expanding the
  generic media summary into a union of every media type.
- Use D1 FTS5 plus exact identifier indexes, with an explicit rebuild path.
- Use keyset pagination and URL-backed collection state.
- Redirect `/` to `/library/books/archive` and retire the old generic History
  page; media Archive views and per-item History replace it.
- Include the accepted Genre filter and available Hardcover community facts in
  the initial slice. An enrichment failure degrades only those facts, not
  Archive or Queue.
- Continue to use “Media Tracker” in production. “Margin” remains mock content,
  not a naming decision.
- Keep the design artifacts as references and extract production components
  deliberately.
- Preserve all raw source data, provenance, and canonical history.

## End-to-end acceptance checklist

- [ ] `/` resolves to the approved primary destination.
- [ ] The new shell works in light/dark and wide/narrow layouts.
- [ ] Sidebar collapse, theme, and URL-backed Books state survive reload.
- [ ] Connections still works inside the new shell.
- [ ] Books exposes only Archive and Queue.
- [ ] Queue includes source statuses Want to Read and Currently Reading.
- [ ] Archive and Queue can overlap.
- [ ] Grid and list use the accepted information density.
- [ ] Search finds titles, authors, series, ISBNs, and ASINs.
- [ ] Every approved filter and sort is implemented server-side.
- [ ] Publication-date filters exist in Archive and Queue.
- [ ] Collection occurrence semantics use the latest supported read.
- [ ] Details contains bibliographic/source facts.
- [ ] History contains all personal activity and every read occurrence.
- [ ] Deep-linked inspector selection works outside the loaded first page.
- [ ] No browse request calls Hardcover or parses R2.
- [ ] A failed partial snapshot retires nothing and advances no cursor.
- [ ] Repeated sync and replay are idempotent.
- [ ] Read model and FTS can be rebuilt.
- [ ] Real-account counts reconcile with the successful source snapshot.
- [ ] No real account data or credentials are committed as fixtures.
- [ ] Final migrations, builds, end-to-end tests, and `pnpm check` pass after the
      last edit.

## Ready-to-copy implementation brief

> Implement `docs/planning/books-implementation.md` as the first production
> Library vertical slice. Preserve the canonical ledger, raw-source provenance, idempotent
> connector writes, and cursor-finalization rules. Add source-owned Hardcover
> projections and a rebuildable Books read model/search index; do not introduce
> a locally authoritative generic Queue. Build Books-specific typed APIs for the
> collection, detail, and History surfaces. Promote the approved Index shell and
> Graphite theme into production, move Connections into it, and make all Books
> state URL-backed. Treat the approved Books surface spec as normative for
> density, filters, sorts, occurrence semantics, and inspector ownership. Work
> through the stages in order, satisfy each exit criterion, update owning docs,
> and run the complete validation gate after the final edit. Do not commit real
> account data or credentials.
