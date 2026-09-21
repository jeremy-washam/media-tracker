# Library implementation handoff

- Date: 2026-09-19
- Status: In progress; Step 1 through the initial Podcasts and Music production slices are implemented
- Intended implementer: Sol agent
- Scope: Production Library, including Archive, source-derived Queue, and item inspection

## Outcome

Replace the operational History screen with the agreed Library experience using
real imported data. Use the Index shell, collapsible sidebar, one compact
inspector, shadcn/ui with Base UI, and the published tweakcn Graphite theme in
light and dark modes. Preserve the theme specimen and structural studies for
future comparison.

The Library is read-only to the user: browse, search, filter, sort, and inspect.
Connector ingestion, reconciliation, metadata acquisition, and storage changes
are part of this implementation. Adding items manually, editing ratings/status,
upstream writes, and in-app reading/playback are not. Chat, artifacts, Recaps,
recommendations, and inspection of arbitrary external catalog items are separate
projects. Keep the shell and inspector reusable without implementing those
surfaces or routing production navigation to synthetic demos.

Build the whole Library through the stages below. Books is the first complete
slice, not a reason to call the overall task finished. Songs remain in scope,
but require their own consumption specification and presentation.

## Read first

Start with [AGENTS.md](../../AGENTS.md), then:

- [UI foundation](../design/ui-foundation.md) for agreed structure and behavior.
- [Component specimen](../../apps/web/src/specimen/README.md) for the selected
  Graphite application and reproducible preview links.
- [Architecture](../architecture/README.md),
  [canonical ledger](../architecture/canonical-ledger.md), and
  [decisions](../decisions/README.md) for storage and evidence invariants.
- [Source reports](../sources/README.md), especially the relevant report before
  modifying each connector.
- [Media inspector proposal](media-inspector.md) for existing data gaps and
  potential enrichment. Its Chat/full-text work is outside this handoff.

This document records the owner's newer Queue requirements below. They take
precedence over older proposals that mention only Reader Later, defer Queue to
a future milestone, or treat all media types identically. Architectural ADRs
remain authoritative; add a superseding ADR if an implementation changes an
accepted decision.

## Starting point and gaps

The ledger and source imports already exist. This is not a frontend-only task,
and not all illustrative metadata in the specimen is currently available.

| Area        | Current state                                                                                                                                                      | Work needed                                                                  |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| Library API | Books has rich list/detail/History contracts; other media remain generic                                                                                           | Repeat the media-specific API pattern for the remaining types                |
| Books       | Full Hardcover library, Books read model/search, Archive/Queue, and UI shipped                                                                                     | Iterate on production feedback without weakening source/provenance semantics |
| Movies      | Archive/Queue API and UI shipped from Letterboxd export/RSS data                                                                                                   | Add TMDB catalog enrichment after a credentialed live probe                  |
| Articles    | Archive/Queue/Feed API and list UI ship with all-location Reader sync, annotations, and 250 eligible documents acquired/indexed under the selective-content policy | Iterate on production feedback without weakening provenance                  |
| Podcasts    | Archive/Queue/Following, export replay, live saved-state/player reconciliation, Reader Archive routing, APIs, filters, inspectors, and UI are implemented          | Complete the explicit hardening list in the Podcasts implementation plan     |
| Videos      | Takeout supplies identities, titles/channels where present, and watch evidence                                                                                     | Watch Later membership projection and additional public metadata acquisition |
| Songs       | All identified export rows plus Recently Played feed Tracks/Albums/Artists APIs, filters, inspectors, UI, and bounded exact-ID catalog enrichment                  | Complete the explicit hardening list in the Music implementation plan        |

Verify this inventory against code before editing; other work may have advanced.
Relevant entry points are `packages/contracts/src/index.ts`,
`packages/db/src/repository.ts`, `apps/api/src/app.ts`, source connectors and sync
services, `apps/web/src/pages/history-page.tsx`, and the shared UI components.

## Step 1: Specify each media type, including Queue membership

Produce a concrete field and behavior matrix before building the screens.
For each type, identify the list fields, inspector sections, available ratings,
history meaning, default sorting, relevant filters, and missing-data behavior.
Label each field as stored/projected, recoverable from retained evidence,
requiring acquisition, or unavailable. Distinguish required initial display
fields from optional enrichment; do not silently substitute fabricated values.

Step 1 is split into two review gates. The live-source field inventories and
product choices are captured in the
[Phase 1 decision register](library-phase-1-decisions.md) and its linked source
reports. Resolve those product choices first; then produce the exact per-surface
field, filter, and sort matrix before implementation begins. The consolidated
[Phase 2 surface specification](library-phase-2-surfaces.md) and its linked
media-specific contracts contain the owner-approved implementation baseline.

### Owner-specified Queue rules

| Media    | Membership rule                                       | Implementation interpretation and evidence                                                                                                                                                                   |
| -------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Movies   | Letterboxd watchlist                                  | Import explicit watchlist membership from the available export. Historical watches do not independently cancel an explicit watchlist entry.                                                                  |
| Articles | Readwise Inbox, Later, and Shortlist; not Archive     | Map all three upstream locations to Queue. Feed remains a separate Articles section; do not include unrelated Reader categories automatically.                                                               |
| Books    | Hardcover Want to Read and Currently Reading          | Import both statuses explicitly and keep them in Queue until a supported completed read exists. Paused, Did Not Finish, and other statuses do not become Queue by inference.                                 |
| Podcasts | Spotify library minus podcasts with playback activity | At item level, use saved episodes and exclude any episode with known positive playback evidence, whether from historical export or ongoing observations. Completion is not required for exclusion.           |
| Videos   | YouTube watchlist                                     | Interpret this as **Watch Later**, consistent with the existing Takeout research. Record this assumption; if the owner means another playlist, resolve its identity before implementing that source mapping. |
| Songs    | No Queue                                              | Do not show an empty or disabled Queue tab for Songs. Saved/liked tracks are not Queue membership.                                                                                                           |

For podcasts, the recommended item-level interpretation is saved episodes, not
every episode of every followed show. Specify this explicitly in the matrix;
ask the owner if they intend followed shows to expand into episode membership.
The transient Spotify playback queue is unrelated. A zero resume position does
not override positive historical playback. Null/unavailable progress and missing
history are not proof of no playback: preserve uncertainty and document how
unresolved episodes are presented instead of silently calling them unplayed.

Treat Queue and Archive as independent memberships where the source supports
both. A historical watch/read remains history when the item is queued again.
Apply the explicit podcast playback exclusion rather than a universal
"Archive wins" rule. Reader's current location determines its Queue membership;
it must not erase previously retained consumption evidence.

Define source-added dates separately from consumed dates. Queue may sort/filter
by date added where supported; do not relabel that date as consumption or use
ingestion time as a substitute. Define unknown-date ordering and count semantics.

Queue reconciliation must distinguish a complete snapshot, an incremental
update, a partial import, and a failed fetch. Retire absent source membership
only when the evidence establishes removal. Scope reconciliation to the
appropriate account/source; one YouTube account must not clear another's Queue.
Retain provenance and history. Show export-based membership as last observed,
without promising live synchronization that the connector cannot provide.

This version derives membership from the sources above. Future local edits and
upstream write-back need their own conflict rules; do not build them now. Keep
membership storage distinct from consumption and capable of future local intent.

### Songs need a separate specification

Songs have far more unique items and far more listening activity. Do not copy
the Books layout or load every playback into the browser.

- Use the accepted source-specific qualification rule: identified export song
  rows qualify at `ms_played >= 30_000`; identified Recently Played API events
  qualify immediately because the API omits duration/skip evidence. Preserve
  zero-duration/skipped/partial rows and keep a source observation distinct from
  a counted normalized occurrence.
- Preserve raw activity regardless of whether it qualifies for displayed
  aggregates. Document any normalization or deduplication without collapsing
  genuine repeat plays or conflating distinct recordings by title.
- Recommend a dense track list with title, artist, album where known, last
  played, and supported listening aggregates. Avoid fabricated ratings and
  large repeated artwork. Final fields must follow the actual export inventory.
- Show one item in the collection, with paginated listening history in the
  inspector. Period filters match activity; distinguish lifetime and selected
  period totals. Label playback time as observed listening time, not track
  duration multiplied by an assumed number of completed listens.
- Specify server-side aggregation, stable pagination, suitable indexes, and
  bounded rendering. Consider virtualization based on measured needs; the
  collection and inspector must never require downloading the full history.

Settle consequential unresolved membership/counting semantics with the owner
using concrete examples. Continue independent Library work while those answers
are pending. Routine component and layout decisions do not require approval.

**Exit criterion:** A checked-in per-media matrix and implementable membership
rules, with unresolved questions isolated rather than hidden in code.

## Step 2: Deliver Books end to end

Implement the shared foundation through a real Books Archive and Queue:

1. Extend Hardcover acquisition and projections for the selected display fields
   and Want to Read. Verify the real schema and retain work/edition distinctions.
   Fetch metadata for consumed editions when needed, not only the current edition.
2. Add forward-only migrations, domain rules, repositories, and validated API
   contracts. Queue-only items must be inspectable: the current detail lookup
   requires an active Archive entry and must be extended appropriately.
3. Implement server-side search, date/rating filters and agreed sorting across
   the entire matching collection. Counts and pagination must use the same
   predicates; filtering only the loaded client page is not acceptable.
4. Move the approved shell and Graphite treatment into production shared styles
   and components. Keep tokens centralized so a future theme change is practical.
   Preserve access to working Connections/import flows.
5. Implement one inspector with Details and History as the starting arrangement.
   Books History owns personal activity; Details owns catalog facts and source
   disclosure.
   Fetch detail on selection, handle rapid selection safely, and paginate long
   histories rather than decompressing raw exports in a browse request.
6. Put media type, Archive/Queue, filters, sort, and selected item in navigable
   URL state. Browser Back, closing inspection, and sidebar collapse must
   preserve the user's place. Restore focus on close; persist appearance and
   sidebar preference independently of collection filters.

Books collection display, occurrence-scoped filters, and date sorting use the
latest supported read when more than one exists. Keep all supported history in
the inspector. Preserve unknown, partial, and inferred date semantics and
specify timezone boundaries. A declared read count is not evidence for
additional dated read rows. Define which personal rating appears in a row when
source-level and occurrence-level values differ.

**Exit criterion:** Books is usable with real data in both themes, including
repeated reads, missing covers/dates/ratings, Queue-only books, and long content.

**Implemented 2026-09-20:** The production Index shell, Graphite light/dark
tokens, responsive inspector, Books Archive and Queue, URL-backed collection
state, real-data Hardcover snapshot, source projections, FTS search, filters,
sorts, keyset pagination, detail, and History are in place. Real validation
reconciled 1,114 relationships into 128 Archive books and 986 Queue books.

## Step 3: Extend across the remaining media types

Deliver Movies, Articles, Podcasts, Songs, then Videos using the Step 1 matrix.
Include each type's Queue ingestion and UI in its slice; do not defer all Queue
work until the end. Songs omit Queue entirely.

The first slice in this step is specified in the
[Movies end-to-end implementation plan](movies-implementation.md). It separates
the immediately implementable Letterboxd Archive/Queue work from the
credential-gated TMDB live probe and enrichment stages.

**Implemented 2026-09-20:** Movies Archive and watchlist-derived Queue now ship
through movie-specific collection, detail, and History APIs with server-side
search, filters, sorts, exact counts, keyset pagination, grid/list layouts, and
real-data missing-catalog states. An isolated real replay produced 371 active
Archive movies, 402 viewing occurrences, 309 Queue movies, and three overlaps.
TMDB artwork and metadata remain gated on the required owner credential and live
probe.

The next slice is specified in the
[Articles end-to-end implementation plan](articles-implementation.md). It uses
the existing credentialed Reader inventory to add retained Archive history,
source-derived Inbox/Later/Shortlist Queue, a separate Reader Feed, annotations,
and selective authorized text search without requiring another provider.

**Implemented 2026-09-20:** Articles now ships all-location Reader document
reconciliation, retained Archive history, source-derived Inbox/Later/Shortlist
Queue, separate Feed, deletion-aware v2 highlights, server-side collection and
inspector APIs, two list densities, and selective full-text acquisition/indexing
plumbing. The real reconciliation produced 72 Archive, 178 Queue, and 666 Feed
items. The owner-authorized initial selective acquisition indexed all 250
currently eligible Archive/Queue documents; metadata, notes, and highlight
search continue to work independently when text is unavailable.

The three remaining slices now have coordinated execution plans:

- [Podcasts](podcasts-implementation.md) owns the next source/read-model
  foundation, saved-episode Queue, Following, and best-effort player polling.
- [Music](music-implementation.md) follows immediately with no-threshold song
  admission and high-volume Tracks/Albums/Artists rollups over the shared
  Spotify parser and cache-policy foundation.
- [Videos](videos-implementation.md) completes the sequence with Takeout-backed
  Archive, Watch Later Queue, Channels, and credential-gated catalog/Following
  stages.

The plans reserve migrations in that order and require an implementation-time
head check. The Spotify plans share one classified export/parser foundation and
one provider-cache policy boundary rather than creating competing versions.

Expose stored facts first, project useful retained evidence next, then acquire
missing metadata. Use the inspector research to choose the smallest extensions:
Hardcover for books, Reader for articles, TMDB as the movie candidate, Spotify
episode lookup, and YouTube public metadata. Verify current provider capabilities,
credentials, matching, attribution, and retention requirements before adoption.
Document new storage boundaries in an ADR where necessary. Exact IDs are
preferred; ambiguous catalog matches must not silently attach unrelated artwork.

Local Library facts must render independently of enrichment. Provider errors,
removed items, or absent credentials should leave useful history and source
links. Record missing prerequisites precisely and continue unaffected work;
do not mark unimplemented acquisition as completed. Full texts, transcripts,
embeddings, and external-item Chat resolution are not Library prerequisites.

Use compact rows and images where suitable for Articles, episode/show context
for Podcasts, video/channel context for Videos, and the separate Songs treatment.
Keep consistent selection/search patterns without forcing identical metadata
or controls across types. Ratings only appear where meaningful and available.

**Exit criterion:** Each category uses real records, its specified membership
rules, supported metadata, and a complete available-history inspector.

## Step 4: Validate the complete Library

Validate against realistic collection sizes and synthetic edge cases, not just
the specimen's handful of items. Inspect both Graphite modes with expanded and
collapsed navigation and open/closed inspection for every media category.
Check loading, empty, no-results, partial coverage, and error states. Avoid
decorative copy and technical provenance clutter in the collection.

Required behavioral coverage:

- Every Queue rule, transitions/removals, Archive overlap, partial reconciliation,
  account isolation, and idempotent replay of exports/snapshots.
- Podcast historical playback overriding a current zero position; unavailable
  progress not silently classified as untouched.
- Songs' qualifying activity, duplicate imports, period aggregates, and large
  histories without unbounded fetches or rendering.
- Date filters matching older occurrences, complete inspector history under a
  filter, source date precision, missing dates, and timezone boundaries.
- Correct totals and stable pagination under all supported filters/sorts.
- Keyboard navigation, focus restoration, browser Back, refresh/deep links,
  preserved scroll position, and stale detail-request handling.
- Safe imported markup/outbound links, unavailable enrichment, missing artwork,
  long titles/reviews, and accessible selected/focus states.

Run `pnpm check`, `pnpm build`, and relevant `pnpm test:e2e` coverage. When storage
changes, verify migrations against an empty local database and an upgrade path
using synthetic fixtures; use existing migration scripts and report exactly what
ran. Do not claim visual review based only on tests or DOM inspection.

Update owning architecture/source/UI documents as behavior ships. Deliver a
summary of implemented functionality, measured remaining data gaps, unresolved
external prerequisites, validation results, and how to open the production
Library. Preserve `/design.html` and `/specimen.html` as reference artifacts.

## Suggested prompt for the implementation agent

> Implement the production Library using
> `docs/planning/library-implementation.md`. Start with Step 1's per-media field
> and membership specification, using the source reports and actual connector
> contracts. Follow the owner's Queue rules and treat Songs as a distinct,
> high-volume listening experience without Queue. Then deliver the Books slice
> and remaining categories through the validation criteria. Use Index and
> Graphite light/dark with shadcn/Base UI. Do not implement Chat or Recaps, and
> do not mistake mock metadata for imported data. Raise concrete semantic or
> credential blockers while continuing independent work.
