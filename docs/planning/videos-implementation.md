# Videos end-to-end implementation plan

- Status: Takeout-backed Archive, Queue, Channels, inspectors, production UI,
  and refreshable public metadata integration implemented; OAuth Following removed
  from scope; full local backfill completed; final visual acceptance remains
- Date: 2026-09-21
- Scope: YouTube-backed Library > Videos Archive, Watch Later Queue, Channels,
  and video/channel inspectors

## Purpose

This document turns the owner-approved
[Videos Phase 2 surface specification](research/videos-phase-2-surfaces.md)
into an execution plan for the current Imladris architecture. It covers the
complete path from retained Google Takeout ZIPs through source projections,
canonical watch occurrences, Watch Later Queue, channel rollups, refreshable
YouTube catalog metadata, current subscriptions, typed APIs, and the production
Index interface.

This is an implementation plan, not another product-design round. Archive,
Queue, Channels, list/grid density, filters, sorts, counts, and inspector
ownership are already settled. Implementation may tune spacing and responsive
behavior against production data, but it must not add upload feeds, likes,
playlists, popularity statistics, transcript search, or playback merely because
YouTube exposes adjacent capabilities.

The central correctness boundary is:

```text
owner Takeout evidence is immutable and authoritative for watches and Watch Later
public YouTube API data is an expiring, replaceable catalog cache
imported subscription rows remain retained evidence but have no product surface
neither layer may manufacture facts owned by the other
```

## Outcome

After this plan is complete, Videos will provide:

- Archive with one row per exact YouTube video identity and every supported
  account-scoped `Watched` occurrence;
- Queue from active Watch Later membership in the latest successful complete
  snapshot for each Takeout lineage;
- Channels as a stable-identity rollup over Archive and Queue activity, sorted
  by personal views by default;
- compact 16:9 list and grid modes for Archive and Queue, with list as the
  default;
- server-side search, filters, sorts, exact counts, facets, and keyset
  pagination at the observed 20,000-plus-video scale;
- video inspectors with Details, Watch history, and Channel tabs;
- channel inspectors with Details and bounded Library tabs;
- current title, channel, artwork, duration, publication, category,
  availability, and live facts from a policy-compliant Data API cache;
- historical titles, channel labels, links, products, and occurrence times from
  immutable Takeout evidence;
- useful local-only behavior when a key, grant, API result, thumbnail, channel
  identity, or current catalog record is missing; and
- replay-safe import, snapshot retirement, metadata expiry, failure recovery,
  observability, browser coverage, and real-data visual acceptance.

Takeout-only work did not wait for Google credentials. The implementation ships
an honest Archive, Queue, Channels rollup, and retained subscription evidence.
The accepted product surface requires public Data API enrichment but no OAuth.

### Implemented local slice

The credential-free delivery is now implemented through migrations 0016–0018
and parser `youtube-takeout@5`. It parses and records component completeness for
watch history, Watch Later, playlist index, and subscriptions; projects exact
watch/channel observations; maintains source-derived Queue and Following
relationships only from complete snapshots; and exposes Archive, Queue,
Channels, video History, and bounded channel Library APIs and UI.

Collection requests use server-side filters, counts, stable generation-bound
keyset cursors, and presentation-independent query keys. Opening an inspector
or changing list/grid layout therefore retains loaded collection pages. D1
snapshot finalization stages bounded idempotent membership batches, then
atomically advances a freshness-ordered component head, activates the complete
snapshot, retires absences, and records completion. Failed, malformed, partial,
or older snapshots cannot change visible Queue or Following state. Overlapping
Takeouts may contribute multiple evidence observations to one canonical watch,
but collection counts and History count that occurrence once.

Both retained owner Takeouts were replayed through the local HTTP API. Persisted
aggregate validation produced 23,865 supported watch observations, 20,227
Archive videos, 110 active Watch Later relationships, 134 active subscription
relationships, and eight complete component records across the two lineages.
The 45 global Archive/Queue overlaps include cross-lineage identity convergence;
the earlier probe's 41 figure counted same-lineage overlap only. Owner content
remains ignored and is not committed.

The restricted YouTube Data API key and credentialed probe are complete.
Migration 0019, the typed client, durable refresh jobs, cache-backed projections,
and metadata UI activation implement Stages 5–6. OAuth and current Following were
explicitly removed from product scope; imported subscription snapshots remain
retained evidence only.

The full local Data API backfill completed on 2026-09-21. It checked all 20,292
Library video identities: 18,723 have current public profiles and 1,569 were
omitted by a successful exact-ID response and are therefore currently marked
unavailable. The cache also holds 7,925 current channel profiles and 32 US
category rows; the activity-derived Channels projection contains 7,964 exact
channel identities. The final projection and both FTS indexes contain every
Library video, while Archive and Watch Later counts remain 20,227 and 110.

The real run also verified durable cursor continuation after worker reloads and
recovered two integrity edge cases without refetching completed records: a
provider `fetch` binding incompatibility and a current video whose referenced
channel was omitted from `channels.list`. Projection rebuild now materializes a
minimal channel identity from current video profiles before applying the
foreign-keyed read model.

## Scope

### Included

- Existing timestamped `Watched` activity with usable video identity.
- Repeated watches, same-video/same-instant multiplicity, and separate owner
  account lineages.
- Watch Later playlist identity, current membership, source-added instants,
  complete-snapshot retirement, and Queue-only videos.
- Exact channel identities from validated `/channel/{id}` Takeout links and
  Data API resources.
- Retention and replay of Takeout subscription snapshots as internal evidence only.
- Current public video/channel metadata for known Library identities only.
- Current lookup availability and reliable live/upcoming/recorded-live facts.
- Video and channel browse/search projections, FTS, facets, counts, and cursors.
- Archive, Queue, Channels, video detail/history, channel detail, and bounded
  channel-Library APIs.
- Production Videos routes and navigation in the existing Index/Graphite shell.
- Full synthetic regression, migration, build, browser, performance, replay,
  and visual validation.

### Excluded

- Likes, dislikes, ratings, Liked videos, and arbitrary playlists.
- A general Lists product.
- Google Data Portability and automatic Watch History/Watch Later acquisition.
- Local Queue editing, upstream write-back, or mirroring into a playlist.
- Followed-channel uploads, upload discovery, notifications, WebSub, new/unread
  counts, and arbitrary channel catalogs.
- `search.list`, recommendations, related videos, trending data, and inspection
  of videos outside the imported Library.
- Embedded playback, app-level watch tracking, comments, and live chat.
- Captions/transcripts, full-text indexing, summaries, embeddings, and AI use.
- Mutable public view, like, comment, subscriber, or upload statistics.
- Heuristic Shorts or premiere classification.
- Reclassifying YouTube Music watches as Songs.
- Public-page scraping or copying YouTube thumbnail bytes into immutable R2.

## Accepted product behavior

These decisions come from the approved Phase 1 and Phase 2 specifications and
should not be reopened unless real API behavior proves a contradiction.

### Local views and membership

- Videos has exactly three views: Archive, Queue, and Channels.
- Archive contains one video per global YouTube video ID with at least one
  supported watch occurrence.
- Queue contains one video per global ID with at least one active account-scoped
  Watch Later relationship.
- Archive and Queue are independent. Watching a video never removes Watch Later
  membership, and a later Queue import never creates a watch.
- Channels includes every stable channel identity represented by an Archive or
  Queue video. Subscription evidence does not add channels.
- A global video or channel appears once in a collection, while its watches and
  Queue memberships, dates, and freshness remain connection-scoped and inspectable.

### Watch occurrences

- Every exact `Watched` card with a usable video identity and parsed timestamp
  is a supported Archive occurrence.
- Every occurrence remains visible in Watch history, including rewatches and
  watches from separate owner accounts.
- Same-video/same-UTC-instant multiplicity is reconciled within a connection by
  occurrence rank as established by ADR 0010. The rule retains the maximum
  observed multiplicity; it is not an upstream event ID.
- A changed timestamp is a different occurrence. Absence from a later history
  export is not deletion evidence.
- Watched-date, Account, and other occurrence-owned predicates must match the
  same occurrence.
- The collection reference occurrence is the latest occurrence satisfying the
  active occurrence filters, or the latest overall occurrence without such
  filters. Watch history always returns every supported occurrence.
- Takeout timestamps remain source-asserted instants with the original raw
  timezone representation available in evidence. The app does not reinterpret
  a literal historical `PDT` token from calendar rules.

### Watch Later Queue

- Queue authority is `Watch later-videos.csv` from a complete, supported
  same-connection Takeout snapshot.
- Each row supplies the global video ID and playlist-added instant. It does not
  supply title, channel, artwork, availability, position, or removal time.
- A complete newer snapshot may retire an absent same-connection relationship
  only after every relevant member is parsed and committed successfully.
- A missing member, unsupported headers, invalid ZIP, interrupted import,
  failed finalization, history-only export, or another connection never retires
  the last successful Queue state.
- An empty but valid Watch Later file establishes an empty snapshot. A missing
  file establishes no coverage and must produce different UI copy.
- Queue-only IDs create inspectable video items and exact global identities even
  when no title or API result is available.
- Takeout has no source removal time. Record only the app's retirement
  observation time and preserve all membership evidence.

### Channels

- Channel grouping requires a stable exact channel ID.
- A Takeout URL identifies a channel only when it is a validated YouTube
  `/channel/{id}` path. A title, handle, custom URL, or fuzzy similarity never
  establishes or merges channel identity.
- Videos with only a historical channel label remain in Archive/Queue but do
  not enter Channels or exact Channel facets until identity is available.
- Channels defaults to Most viewed using personal supported watch occurrences,
  not YouTube's public view count.
- Takeout subscriptions are retained snapshot facts with no observed subscribed
  date. They do not affect this product surface.

### Current and historical metadata

Collection display values resolve in this order:

1. unexpired, policy-permitted Data API video/channel projection;
2. most recently observed nonempty Takeout assertion tied to the exact identity;
3. presentation-only fallback such as **Untitled video** or **Channel
   unavailable**.

Presentation fallbacks are never persisted or searched. Current metadata may
change or expire. Watch-history rows preserve what the Takeout card said and
show historical title/channel differences only when they differ from the
current display.

Public enrichment is additive. Missing credentials, quota exhaustion, API
failure, removal, privacy, regional restriction, or cache expiry must never
remove Archive/Queue history or prevent detail access.

### Availability and formats

- Availability states are `not_configured`, `pending`, `available`,
  `unavailable`, `stale`, and `error`.
- `available` means the requested ID appeared in a successful current
  `videos.list` response. It is not a universal playability promise.
- `unavailable` means that exact requested ID was absent from a successful
  response at a known check time. Do not guess deleted, private, restricted, or
  removed.
- A failed batch updates no requested ID to unavailable.
- Live, Upcoming, and Recorded live come only from exact current API fields.
  Premiere is not inferred from live metadata.
- YouTube Music comes only from an exact retained product/hostname observation
  and remains canonical type `video`.
- Shorts and Premiere filters remain unavailable until a reliable explicit
  source and reviewed projection rule exist.

### Collection presentation

- Archive and Queue support compact 16:9 list and grid layouts.
- List is the default because Archive exceeds 20,000 unique videos.
- Archive shows thumbnail, title, channel, latest matching watch, matching/
  lifetime watch count, Queue overlap, and list-only Duration/Published where
  space permits.
- Queue shows thumbnail, title, channel, Added to Watch Later, account count,
  Archive overlap/watch count, and list-only Duration/Published where space
  permits.
- Channels uses one channel list only. Rows show image/title, distinct Archive
  video count, personal watch count, latest watch, and active Queue video count.
- Cards have no autoplay, hover playback, progress, inline action toolbar, or
  transcript excerpt.

### Search, filters, and sorts

Search, filters, counts, facets, sorts, and pagination operate server-side over
the complete matching collection.

Archive/Queue search includes current and historical video titles; current and
historical channel titles; permitted current channel custom URL; permitted
current description, category, and tags; and exact parsed YouTube video ID/URL.
Channels search includes current/historical channel title, permitted custom URL
and description, and exact channel ID. It excludes uploads, comments,
playlists, likes, transcripts, search history, expired provider data, and raw
ZIP text.

Shared video filters are:

- Account;
- exact Channel identity, including an explicit unknown option;
- Published date/unknown;
- Duration buckets/unknown;
- Availability;
- exact source-backed Format; and
- Category when current metadata coverage exists.

Archive adds Watched date/unknown, Watches once/rewatched, and Queue status.
Queue adds Added-to-Watch-Later date/unknown and Archive status. Channels has no
initial filter.

Sorts are:

| View     | Default                      | Additional sorts                                  |
| -------- | ---------------------------- | ------------------------------------------------- |
| Archive  | Recently watched, descending | Title, Channel, Most watched, Published, Duration |
| Queue    | Recently added, descending   | Title, Channel, Published, Duration               |
| Channels | Most viewed, descending      | Channel A-Z, Recently watched, Most queued        |

Relevance is available only with nonempty search. Unknown primary values sort
after known values in both directions. Sort tuples end with normalized display
title/channel and stable media/channel ID. Unsupported view/sort combinations
are rejected by the API and normalized out by the client.

### Inspectors

The video inspector has Details, Watch history, and Channel tabs. Details owns
current catalog facts, relationship summaries, availability, source links,
freshness, and compact provenance. Watch history owns every supported watch and
historical display differences. Channel owns current channel facts and bounded
Library-only lists of recently watched and queued
videos; it never loads arbitrary uploads.

The channel inspector has Details and Library tabs. Details owns current channel
facts, source links, freshness, and compact provenance. Library shows only Archive or Queue videos already in Imladris for
the exact channel, paginated independently.

## Verified baseline and current gaps

### Real source evidence

The content-redacted 2026-09-19 probe of the two ignored owner Takeouts found:

- 23,865 identified supported watch occurrences;
- 20,227 distinct global video identities;
- 3,506 repeated watches beyond unique identities within their respective
  lineages;
- 19 watched cards without usable identity and 85 non-watch cards;
- 110 Watch Later rows, all with identity and source-added instant;
- 41 same-lineage Archive/Queue overlaps; and
- 134 retained subscription rows across the two snapshots.

The two Takeouts remain distinct connections. They share some video identities
but supply no evidence that their owner account/channel lineages are the same.
These aggregates are migration/replay checks, not fixtures, product constants,
or permission to commit owner data.

### Connector and import service

The current `youtube-takeout@3` path:

- stores the exact ZIP in private R2;
- parses watch-history HTML and Watch Later item CSV;
- writes one source record per activity card or Watch Later row;
- admits only exact timestamped `Watched` cards with usable identity;
- normalizes in durable chunks of at most 100 records;
- shares global video identities while preserving connection-scoped watches;
- reconciles overlapping watches with the ADR 0010 occurrence-rank rule;
- resumes from the stored object with a durable cursor; and
- never removes history from later snapshot absence.

It does not yet:

- project Watch Later into Queue or create Queue-only video items;
- select or parse `playlists.csv` or `subscriptions.csv`;
- project exact channel IDs or historical per-watch display assertions;
- distinguish missing, invalid, empty, and complete Watch Later/subscription
  coverage for snapshot finalization;
- atomically finalize Queue/subscription retirement after all import chunks;
- build video/channel browse projections or search; or
- acquire public catalog metadata or current subscriptions.

The existing import reports Watch Later rows as ignored. Its connection
`coverage=complete` means the uploaded snapshot processed, not that YouTube
history is continuously current.

### Database and API

The canonical ledger already owns global YouTube video identities and 23,000+
Archive occurrences. The generic source-derived `queue_entries` and
`queue_entry_evidence` tables are available from ADR 0011 and are the correct
provenance-bearing substrate for Watch Later.

There are no YouTube source-owned watch/channel/subscription projections,
provider catalog tables, Videos read models, video/channel FTS indexes, or
video-specific repository. The generic media contract exposes only ID, type,
and title and cannot express Queue-only detail, occurrence-aware filters,
channel rollups, freshness, or bounded History.

The implemented local slice uses 0016 for the Takeout model, 0017–0018 for
snapshot safety, and 0019 for provider catalog caches and projection fields.
Never edit or reuse an applied migration.

### Web application

The production Index shell, Graphite theme, collapsible navigation, responsive
inspector, URL normalization, TanStack Query page preservation, and Videos
routes/API hooks are implemented.

The saved `videos-surface-review.tsx` artifact is a visual reference only. It
uses bounded sample data and client filtering/sorting. Production must follow
the written surface contract, server semantics, typed APIs, and real imported
data rather than copy its local-state data layer.

### Provider configuration

The owner configured a restricted YouTube Data API key and the content-redacted
live probe exercised `videos.list`, `channels.list`, and `videoCategories.list`.
The Worker reads `YOUTUBE_API_KEY`; local development loads it from ignored
repository-root `.env.local`. OAuth is not required or implemented.

## Architecture

```text
Google Takeout ZIP
  -> immutable private R2 object
  -> versioned activity / Watch Later / playlist / subscription source records
  -> source-owned YouTube observations
  -> canonical video identities + Archive occurrences
  -> source-derived Watch Later Queue + subscription relationships
                                      \
YouTube Data API -> expiring catalog cache -> video/channel/category profiles
                                      /
        rebuildable video/channel projections + FTS
          -> Videos repository and typed Hono routes
          -> TanStack Query hooks
          -> URL-driven Archive / Queue / Channels + inspectors
```

### Ownership boundaries

- Exact Takeout bytes in private R2 and their `source_records` are immutable
  owner evidence.
- The canonical ledger owns global video identity and supported watch
  occurrences.
- Generic Queue entries own current source-derived Watch Later membership and
  its evidence; they are not locally editable intent.
- YouTube source tables own historical display assertions, component snapshot
  coverage, exact channel relationships, and current subscriptions.
- Provider catalog tables are an expiring, replaceable cache. They are not raw
  owner evidence and do not enter indefinite R2 retention.
- Rebuildable video/channel projections and FTS exist only to serve bounded
  queries.
- `packages/connectors/youtube` owns Takeout/Data API schemas, parsing,
  normalization, retry hints, and safe provider errors.
- `packages/db` owns snapshot finalization, projections, search, facets,
  aggregate semantics, cursors, and repositories.
- `apps/api` owns secrets, provider requests, durable jobs,
  scheduled/manual orchestration, quota budgets, and safe errors.
- `packages/contracts` owns validated Videos HTTP boundaries.
- `apps/web` owns URL state, query caching, presentation preferences,
  inspectors, focus, and accessibility.

Browse and detail requests never unzip R2, scan raw evidence, or call Google.
Hono handlers remain thin. Cloudflare/D1/HTTP dependencies do not
enter `packages/domain`.

### Architecture record

[ADR 0012](../decisions/0012-refreshable-provider-catalog-cache.md) records the
refreshable-provider cache decision, including:

- provider API data versus immutable owner-evidence boundaries;
- acquisition, checked, expiry, refresh, and deletion times;
- what response data may remain after policy expiry;
- deterministic removal of expired provider fields from browse and FTS;
- thumbnail URL handling and required attribution;
- safe request/outcome provenance;
- stale/error behavior and local-evidence fallback; and
- a strict exclusion of YouTube API content from transcripts/AI processing in
  this delivery.

This ADR refines storage behavior without changing Archive admission or making
Queue local authority.

## Identity and reconciliation model

### Video identity

- Use the exact validated YouTube video ID as a global external identity with
  namespace `youtube` and type `video_id`.
- A re-upload is a different identity even when title/channel match.
- Queue-only, Archive-only, and overlapping observations converge on the same
  exact global identity.
- Titles, URLs without a validated ID, thumbnails, channel labels, and fuzzy
  similarity never identify or merge videos.

### Channel identity

- Store stable YouTube channel IDs in a source-owned `youtube_channels` entity;
  channels are creator/grouping entities, not canonical media items.
- Parse Takeout identity only from a validated `/channel/{id}` URL.
- Data API `snippet.channelId` and `channel.id` are authoritative exact IDs
  within their response contracts.
- Handles/custom URLs remain display/lookup metadata and never merge channels.
- Current and historical names can change independently while the stable ID
  remains fixed.

### Account lineage

- Keep each known Takeout lineage as a separate `connections` row with a stable,
  non-secret owner label.
- Shared videos, channel titles, subscription overlap, filenames, or email
  evidence never merge lineages.
- Catalog API-key access is public metadata only and has no account binding.

### Snapshot completeness

Track component completeness separately for each raw Takeout:

```text
watch_history: missing | invalid | complete
watch_later_items: missing | invalid | complete
playlist_index: missing | invalid | complete
subscriptions: missing | invalid | complete
```

The overall ZIP can process successfully while one optional component is
missing. Only a component marked complete may finalize current state for that
relationship. A component is complete only after the expected member is found,
its supported header/schema parses fully, every record and projection write is
durable, and finalization commits. Store member name, row/card counts, parser
version, raw object, completed sync run, and finalized time.

Watch history remains append/reconcile-only because its absence is not deletion
proof. Watch Later and subscriptions are current snapshots and may retire absent
same-connection relationships only from their own newer complete component.

## Database and migration plan

Use several small forward-only migrations rather than coupling Takeout delivery
to unverified provider fields.

### Migration 0016: Takeout-backed Videos Library

Add source-owned tables with responsibilities equivalent to:

#### `youtube_takeout_components`

- connection and raw object;
- component kind;
- member path and parser version;
- status: missing, invalid, processing, complete, or failed;
- expected/processed record count;
- completed/finalized sync run and timestamps; and
- safe error classification.

Unique `(raw_object_id, component_kind)`. Finalization is idempotent and can be
retried independently from byte acquisition.

#### `youtube_watch_observations`

One row per normalized watch source record:

- source record, Archive entry, connection, media item, and video ID;
- historical title and validated source video URL;
- historical channel label, raw channel URL, and exact channel ID when valid;
- product (`youtube` or `youtube_music`), ad marker, and raw timestamp string;
- occurrence rank, parser/projection version, and observed time.

The canonical Archive entry remains the authority for normalized consumed time.
This table owns queryable historical display facts and product facets. It must
not collapse multiple cards onto one row or overwrite earlier observations.

#### `youtube_channels` and observation links

Add one source-owned channel row per exact channel ID plus historical assertion
links from watch and subscription source records. Preserve labels/URLs by
observation so a rename does not rewrite history. Do not create rows for labels
without exact ID.

#### Watch Later projections

Use existing `queue_entries` and `queue_entry_evidence`:

```text
relationship_type = youtube_watch_later
source_membership_key = watch-later:<video_id>
added_at = Playlist Video Creation Timestamp
added_at_precision = instant
added_at_basis = source_asserted
```

The uniqueness is connection-scoped. Queue-only rows create/reuse canonical
video items and global identities. Link the Watch Later source record as
`membership` and, when valid, `added_time`. A newer complete snapshot marks
absent entries removed, sets `retired_observed_at`, and appends removal evidence
from a snapshot-finalization record; it never deletes prior rows.

Project playlist-level facts such as playlist ID, visibility, ordering policy,
create/update time, and source record separately. Those fields never become an
item's added date.

#### Takeout subscriptions

Add `youtube_channel_subscriptions` with:

- connection and exact channel ID;
- provider subscription ID nullable for Takeout;
- subscribed-at value/source nullable;
- current source and upstream state;
- first/last observed and retired-observed times;
- last complete snapshot, source/projection version; and
- created/updated times.

Unique `(connection_id, channel_id)`. Add evidence rows linking Takeout source
records for membership/removal. A complete newer same-connection subscription
component may retire absent relationships; other components cannot.

#### Takeout browse projections

Add initial rebuildable `video_library_projection` and
`video_channel_projection` tables. Before catalog enrichment they resolve title
and channel from current exact Takeout assertions and carry nullable catalog
fields. Add ordinary indexes for Archive/Queue default ordering, title/channel,
watch count, Queue added time, channel aggregates, exact identity joins, and
occurrence-aware Account/date queries.

Add two rebuildable FTS5 indexes:

- video FTS keyed by media item ID over retained Takeout video titles and exact-
  identity channel labels; and
- channel FTS keyed by channel ID over retained historical titles.

The FTS tables are disposable infrastructure and must have deterministic rebuild
commands because D1 exports do not preserve virtual tables.

### Migration 0019: Refreshable Data API cache

The 2026-09-21 credentialed probe confirmed the fields below and normal omission
behavior. The logical tables are:

#### `youtube_video_catalog_profiles`

- media item and exact video ID;
- current title, description, exact channel ID/title;
- publication instant, duration, category ID;
- caption flag, definition, projection, privacy, embeddable, and region
  restriction fields selected by the accepted surface;
- live broadcast state and scheduled/actual start/end instants;
- fetched/check/expiry times;
- lookup state and last safe error time/class; and
- profile version/selected response parts.

#### `youtube_video_thumbnails`

- media item, source variant, URL, width, height, fetched and expiry times.

Select the best current permitted URL at projection time. Never copy the image
into immutable raw storage.

#### `youtube_channel_catalog_profiles`

- exact channel ID;
- current title, description, custom URL, creation time, country when useful;
- permitted thumbnail fields;
- fetched/check/expiry times, lookup state, and safe error; and
- profile/version information.

#### `youtube_categories`

- category ID, region/locale scope, name, fetched and expiry times.

#### Fetch outcome and durable job tables

Persist bounded request/outcome provenance:

- job ID/type/state, attempt count, reservation/lease, retry time, and safe
  terminal/transient error;
- requested-ID hash/set reference, selected parts, requested/returned counts,
  fetched/expiry times, and quota-unit estimate;
- one requested item outcome proving returned versus omitted; and
- no tokens, key, URLs containing secrets, response bodies, or content-bearing
  logs.

Only a successful request can change requested IDs to available/unavailable.
Commit its requested/returned outcomes, profile rows, thumbnails, affected read
models, and FTS updates atomically where D1 is authoritative.

### No OAuth migration

The previously proposed OAuth account-binding migration is retired. The public
metadata integration uses an API key; imported Takeout subscription tables stay
unchanged as retained source evidence.

### Projection tables

At full delivery, `video_library_projection` contains one row per global video:

- media item/video ID and display-title source;
- normalized/display title;
- exact channel ID or historical label fallback;
- normalized channel title;
- permitted thumbnail URL/dimensions/expiry;
- publication, duration, category, and source-backed format flags;
- availability/check state;
- metadata state/refreshed/expiry;
- Archive active, active watch count/account count, latest watch;
- Queue active, relationship/account counts, latest added time; and
- projection version/update time.

`video_channel_projection` contains one row per exact active Library channel:

- channel ID, normalized/display title, custom URL, permitted thumbnail;
- metadata state/refreshed/expiry;
- Library active;
- distinct Archive video count, personal watch count, latest watch;
- active Queue video count; and
- projection version/update time.

Authoritative state remains in the ledger, Queue, YouTube relationship, and
catalog tables. Import finalization, occurrence reconciliation, Queue/
subscription retirement, channel identity attachment, catalog refresh/expiry,
and availability outcomes update affected projection/FTS rows transactionally.

### Required indexes

At minimum, verify indexed plans for:

```text
video_library_projection (archive_active, latest_known_watched_at DESC, media_item_id)
video_library_projection (archive_active, normalized_display_title, media_item_id)
video_library_projection (archive_active, normalized_channel_title, media_item_id)
video_library_projection (archive_active, active_watch_count DESC, media_item_id)
video_library_projection (archive_active, published_at DESC, media_item_id)
video_library_projection (archive_active, duration_ms, media_item_id)

video_library_projection (queue_active, latest_known_queue_added_at DESC, media_item_id)
video_library_projection (queue_active, normalized_display_title, media_item_id)
video_library_projection (queue_active, normalized_channel_title, media_item_id)
video_library_projection (queue_active, published_at DESC, media_item_id)
video_library_projection (queue_active, duration_ms, media_item_id)

video_channel_projection (library_active, watch_occurrence_count DESC, channel_id)
video_channel_projection (library_active, latest_watched_at DESC, channel_id)
video_channel_projection (library_active, queue_video_count DESC, channel_id)
video_channel_projection (library_active, normalized_display_title, channel_id)
video_channel_projection (library_active, following_active, watch_occurrence_count DESC, channel_id)

archive_entries (connection_id, upstream_state, consumed_at_value DESC, media_item_id, id)
queue_entries (connection_id, upstream_state, added_at_value DESC, media_item_id, id)
youtube_channel_subscriptions (connection_id, upstream_state, channel_id)
youtube_channel_subscriptions (channel_id, upstream_state)
youtube_watch_observations (channel_id, archive_entry_id)
youtube_video_catalog_profiles (channel_id, media_item_id)
youtube_video_catalog_profiles (category_id, media_item_id)
```

Use partial active indexes when D1 plans prove beneficial. Occurrence-aware and
relationship-aware filtering must query the authoritative indexed rows, not
only aggregate latest values in a read model.

### Schema invariants

- Replaying one raw object/parser version creates no duplicate source records,
  identities, watches, Queue entries, subscriptions, or evidence.
- Parser-version replay may add corrected projections while retaining older
  source records/evidence.
- Every imported watch has admission evidence and one queryable historical
  observation.
- Queue and subscription retirement requires a newer complete component for the
  same connection.
- Archive absence is never deletion proof.
- Queue/subscription retirement never deletes history or source evidence.
- Queue-only items remain inspectable.
- A source label without exact channel ID never enters the channel rollup.
- Failed provider fetches do not update availability or erase a valid cache.
- Expired provider fields leave browse/search deterministically and fall back to
  retained Takeout facts.
- Current provider metadata never overwrites historical Takeout assertions.
- Every source temporal value retains value, precision, and basis; unknown
  remains null.

## Takeout acquisition and replay plan

### Parser version 5

Bump to `youtube-takeout@5` because normalization semantics, strict snapshot
validation, and selected ZIP members change. Extend ZIP selection to:

- watch-history HTML;
- Watch Later item CSV;
- playlist-index CSV; and
- subscriptions CSV.

Parse each member independently with explicit supported-header validation. The
parser result must include member presence and completeness, not represent a
missing Watch Later file as an empty playlist. Preserve unknown extra columns
and unsupported member variants as invalid/unresolved evidence rather than
silently discarding the whole ZIP.

Normalize exact channel IDs from channel URLs using one tested helper. Preserve
the raw URL and label even when identity validation fails. Continue strict host
validation for video URLs and exact `Watched` action admission.

### Durable chunking and finalization

The import remains resumable and bounded. Replace a single flat-offset concept
with a versioned checkpoint that records member/parser position and component
state, or preserve the flat order only if the checkpoint can prove equivalent
component completeness.

For every chunk:

1. load and verify the stored ZIP checksum;
2. parse deterministically under parser v5;
3. write source records, source-owned projections, identities, watches, Queue
   candidates, subscriptions, and evidence atomically with the next checkpoint;
4. rebuild only affected video/channel projection and FTS rows; and
5. leave all prior active current-state relationships untouched on failure.

After the final chunk, perform one idempotent finalization transaction per
complete component:

- activate/refresh every observed Watch Later membership;
- retire only absent prior Watch Later entries for that connection;
- activate/refresh every observed Takeout subscription;
- retire only absent prior Takeout subscription relationships;
- rebuild affected projections/FTS;
- mark component and raw object complete; and
- commit the cursor/run success.

If D1 batch limits require multiple finalization chunks, persist a separate
finalization checkpoint and do not expose a partially retired generation as the
new active snapshot. Use generation IDs/current-generation selection or a
staging table so membership switches atomically after the final batch.

### Replay and legacy repair

- Reuploading or explicitly replaying retained ZIP bytes under parser v5 must
  process them even when parser v3 previously succeeded.
- Reuse existing global video identities and Archive occurrences according to
  ADR 0010.
- Add historical watch projections and exact channel links without replacing
  the canonical occurrence.
- Convert v3 ignored Watch Later source evidence into active Queue entries.
- Project retained playlist/subscription members that v3 never selected from
  the ZIP.
- Never invent a source record for a member absent from the actual raw object.
- Retain v3 source records and evidence. A rebuild is correction through new
  versioned projection, not destructive rewrite.

### Account labels and coverage

Require unique, stable, non-secret owner labels in Connections before accepting
new multi-lineage imports. Existing labels can remain unless they are default/
ambiguous. The API and UI expose labels, never emails or private Google account
identifiers.

Connections should separately report:

- latest successful watch-history import;
- latest successful Watch Later snapshot;
- latest successful subscription import/refresh;
- latest public metadata refresh;
- incomplete import/finalization checkpoints; and
- manual Takeout coverage rather than implying continuous sync.

## Data API integration plan

### Credentialed probe before schema freeze

The owner must configure a restricted backend API key outside Git. The probe
uses real configured APIs and prints only field names, types, omissions,
aggregate counts, cache headers, quota observations, and safe error classes.
It must never print private titles, descriptions, IDs, channels, URLs, or the
key.

Probe:

1. `videos.list?part=snippet,contentDetails,status,liveStreamingDetails` for a
   redacted sample containing ordinary, upcoming, live when safely available,
   completed-live, known Library, and intentionally omitted IDs;
2. actual optionality for title, description, channel, thumbnail variants,
   publication, ISO duration, category, caption flag, definition, projection,
   privacy/embeddable/region restriction, and live fields;
3. request-size-bounded ID batches beginning at 50, without calling 50 a
   documented provider maximum;
4. `channels.list?part=id,snippet&id=...` for exact retained/returned channel
   IDs and missing-channel behavior;
5. `videoCategories.list?part=snippet` for the app's region/locale;
6. response cache headers, required attribution, safe retry/`429` behavior,
   quota reporting, and current developer-policy expiry/deletion rules; and
7. one successful response with at least one requested ID omitted from `items`
   to validate per-ID unavailable outcomes.

Update the source/catalog reports with the redacted results. The probe may
narrow fields, parts, batch size, TTL, or UI capabilities. It may not make
enrichment a membership requirement or overwrite owner evidence.

### Typed client

Add a connector client with:

- Zod validation at the provider boundary;
- explicit requested IDs and selected parts;
- response-to-request reconciliation;
- parsed ISO-8601 duration with original value available during validation;
- safe URL and thumbnail validation;
- timeout/abort support;
- quota and request IDs when safely available;
- retry classification for `429`, `5xx`, network, auth, quota, and terminal
  schema errors; and
- no content-bearing logs.

Do not use `search.list`; exact known IDs are sufficient and materially cheaper
and safer.

### Durable catalog jobs

Use the existing Cloudflare Queue with a persisted job/reservation table rather
than putting an unbounded ID list in a message. Messages carry only stable job
ID and idempotency key. A worker claims one bounded ID batch, fetches, commits
the result, and queues the next batch until the job is complete.

Requirements:

- deterministic idempotency per profile version and requested-ID batch;
- at most the live-probed safe batch size, initially 50;
- missing/oldest profiles first, prioritizing newly imported and visible IDs;
- separate video, channel, and category job types;
- bounded concurrent requests and per-run quota budget;
- `Retry-After` support with a bounded scheduled retry;
- exponential backoff plus jitter for transient failures;
- explicit quota-exhausted pause until the next safe window;
- stale reservation recovery and dead-letter recovery;
- failed batch leaves every prior profile/outcome intact; and
- current job state visible through Connections/sync activity.

At the current 20,227 IDs, 50-ID video batches require roughly 405 one-unit
requests. Channel/category work adds requests but no `search.list` calls. Treat
the provider's actual project quota and rate behavior from the probe as the
budget authority. Reserve headroom for manual/detail refreshes and do not spin
on quota failures.

### Refresh and expiry

- Record `fetched_at`, `checked_at`, and `expires_at` for every profile/outcome.
- Refresh missing and oldest entries before provider-policy expiry.
- If refresh cannot complete before expiry, remove prohibited provider fields,
  thumbnails, categories, and FTS text and immediately fall back to retained
  Takeout assertions.
- Retain only the safe request/outcome provenance allowed by the new ADR.
- Mark an ID unavailable only from successful requested-versus-returned
  comparison.
- A later successful return restores available and current profile state.
- Profile/FTS/read-model updates become visible atomically.
- Catalog refresh never changes Archive, Queue, watch time, or Following.

## OAuth and Following

No OAuth flow or Following surface is planned. The public catalog fields used by
Videos require only the restricted backend API key. Existing Takeout subscription
rows remain retained, replayable source evidence and do not affect Channels.

## Read models, repository, and search

Create `SqlVideosRepository` with one normalized predicate builder shared by
rows, counts, facets, reference occurrences/relationships, and cursors.

### Video collection predicates

Archive membership is an active YouTube watch occurrence. Account, Watched
range, and YouTube Music occurrence predicates are correlated through one
`EXISTS` branch so separate watches cannot satisfy different parts of the
filter. Reference watch uses the latest matching row.

Queue membership is an active `youtube_watch_later` entry. Account and Added
range are correlated through one Queue relationship. Reference added time uses
the latest matching active relationship.

Shared current catalog predicates operate on unexpired cache fields. Unknown
published/duration values match only explicit unknown options. Exact channel
identity distinguishes `unknown` rather than grouping labels. Availability
`unchecked` includes never checked, not configured, pending, and stale without a
current permitted outcome.

### Channels aggregates

Channels membership requires at least one Archive/Queue video with exact
channel identity. Compute and project:

- distinct active Archive videos;
- supported active watch occurrences;
- latest known active watch instant;
- distinct active Queue videos; and
- active Queue video count.

Multi-account occurrences and relationships contribute to counts without
duplicating the channel row. Multi-account video Queue relationships count the
video once in `queueVideoCount` and separately in relationship counts where
named.

### Search

Maintain separate video and channel FTS5 indexes with `unicode61` and diacritic
removal. Index retained historical text permanently and current API text only
while policy permits it. Exact recognized video ID/URL or channel ID bypasses
FTS and resolves through exact indexes.

For ordinary text:

- normalize Unicode whitespace;
- use AND semantics;
- preserve quoted phrases;
- allow final-token prefix after two characters; and
- use a safely escaped bounded title substring fallback for shorter input.

List-only description/tag matches may return one bounded sanitized excerpt.
Grid cards and Channels do not show excerpts. Provider lookup/expiry failure may
remove an excerpt but must not remove an otherwise valid Takeout-title result.

### Facets and counts

Facet counts apply search/current filters and omit only their own predicate.
Account and channel labels/values are exact IDs plus non-secret display labels.
Obsolete deep-linked values stay visible as unavailable until cleared; they do
not broaden the query.

Responses return exact complete counts, not loaded-page counts:

- Archive: unique videos and matching supported watches;
- Queue: unique videos plus relationship/overlap counts for state/facets;
- Channels: exact activity-derived channel count;
- navigation: unfiltered Archive/Queue/Channels and occurrence/relationship
  counts.

### Cursor design

Use opaque versioned cursors bound to normalized view, query, filters, sort,
direction, limit, projection generation, and the last row's complete stable
tuple. Reject malformed/query-mismatched/stale-generation cursors with a stable
`BAD_REQUEST` rather than returning corrupted continuation.

Primary null rank keeps unknowns last in both directions. Video ties use
normalized title, normalized channel, and media item ID. Channel ties use
normalized channel title and channel ID. Relevance includes rank plus stable ID.

Page sizes:

- Archive/Queue list: 50;
- Archive/Queue grid: 48;
- Channels list: 50;
- Watch history: 25;
- channel Library: 25; and
- API maximum: 100.

Use explicit Load more. No offset pagination and no unbounded browser result.

## Contracts and HTTP APIs

Add a cohesive `packages/contracts/src/videos.ts`, export it from the package,
and validate both requests and responses.

### `GET /api/library/videos`

Query accepts:

- `view=archive|queue|channels`;
- normalized `q`;
- `viewMode=list|grid` only if page size differs; presentation otherwise stays
  out of the server query;
- all approved view-compatible filters;
- `sort`, `direction`, `limit`, and opaque `cursor`.

Prefer routing layout to choose 48 versus 50 while keeping selected item and
layout out of the query cache identity where the loaded server page is
compatible. If different page sizes require different caches, preserve each
layout's loaded stack independently.

Archive/Queue rows return the approved compact identity, catalog summary,
formats/availability/cache state, Archive summary, Queue summary, and optional
bounded excerpt. Channel rows return identity/current display, activity
aggregates, and cache state.

The envelope returns next cursor, filtered counts, membership counts, overlap
counts, facets, projection generation, and per-connection freshness for history,
Watch Later, subscriptions, and metadata. Never return private account IDs,
tokens, raw source content, or provider cache beyond the visible contract.

### `GET /api/library/videos/:id`

Return video summary plus permitted description/thumbnails, category,
availability/status/live facts, every active Queue relationship, Archive
summary, stable channel identity, historical-difference summary,
validated source links, metadata/snapshot freshness, capability states, and
collapsed provenance. Return History count without all History rows.

Authorize by active Archive or Queue membership. A Queue-only video succeeds.

### `GET /api/library/videos/:id/history`

Accept limit/cursor and the active Archive Watched/Account/YouTube Music filters
only to compute `matchesFilter`. Return newest-first active occurrences plus an
undated tail if future valid undated evidence exists. Each row contains exact
connection label, historical display facts, product, validated link, and compact
evidence summary. It never reparses R2.

### `GET /api/library/video-channels/:id`

Return exact channel identity/current permitted metadata, cache/freshness,
Archive/Queue aggregates, latest watch, validated source links, and compact
provenance. It succeeds only for a channel attached to an active Archive/Queue
video.

### `GET /api/library/video-channels/:id/videos`

Accept `membership=archive|queue`, limit, and cursor. Return the corresponding
compact video subset ordered by recently watched/recently added. It never calls
`search.list`, uploads playlists, or arbitrary discovery.

### Operational routes

Extend the existing Takeout import/continue responses with component coverage,
Queue/subscription projections, and finalization progress. Add authenticated
backend operations for:

- start/resume catalog backfill;
- refresh selected/stale metadata;
- rebuild Video projections/FTS from stored authorities.

Provider-mutating GET routes are prohibited. Every operational route returns
safe machine error codes and redacted messages.

## Web implementation plan

### Routing and navigation

Enable Videos in the existing media navigation and add:

```text
/library/videos/archive
/library/videos/queue
/library/videos/channels
```

`/library/videos` redirects to Archive. Add one centralized Videos route-search
schema. URL state includes query, compatible filters/sort/direction, selected
`item` or `channel`, and nondefault layout when product routing needs it.
`item` and `channel` are mutually exclusive.

Switching Archive/Queue preserves compatible query/filter/sort/layout state and
drops incompatible parameters and direction. Channels retains its own search,
sort, loaded pages, selection, and scroll. Browser Back closes
or reopens inspection before leaving the collection.

### Collection query preservation

Build collection query keys only from normalized server query parameters.
Exclude selected item, inspector tab, sidebar state, theme, and compatible
presentation-only layout. Opening/closing an inspector, switching its tab,
collapsing the sidebar, or resizing into sheet mode preserves loaded collection
pages and scroll.

Changing search, server filters, sort, page size, route membership, or
projection generation discards incompatible cursors. Catalog refresh/import
invalidation restarts affected live pagination rather than appending across
generations.

### Archive and Queue UI

Implement media-specific video rows/cards from the approved review artifact and
written contract:

- fixed 144 x 81 list thumbnail and 16:9 grid slot;
- two-line title and one-line channel;
- stable missing/broken image fallback;
- duration and reliable live overlays without collision;
- compact membership date/count/overlap copy;
- responsive movement of Published then Duration into the identity cell;
- explicit Load more and Showing n of N; and
- no client filtering over partial pages.

Grid cards remain between 240 and 300 CSS px, use fixed aspect ratio, and do not
stretch into masonry. External images use explicit dimensions, lazy loading,
referrer policy where appropriate, and a non-jumping fallback.

### Channels UI

Render the approved 64-pixel-image channel rows. Default to Most viewed. Do not
display uploads, public counts, unread/new state,
or channels with no Library activity. Missing exact identity never creates a
synthetic group.

### Inspector behavior

Fetch video detail, video History, channel detail, and channel Library
independently. Abort or ignore stale results during rapid selection. Direct
selection links work without loading the row's page first.

At 1280 CSS px and above use the 400-pixel adjacent panel. Below that use the
existing accessible right sheet at `min(440px, 100vw)`. Closing restores focus
to the originating row/card when mounted, otherwise to the results heading.
Switching video-to-channel inspection keeps the underlying collection pages and
scroll.

Imported descriptions render as plain sanitized text. External links are
validated HTTP(S), use a new browsing context, and set `noopener,noreferrer`.
No imported/embed HTML is injected.

### Empty, missing, and degraded states

Implement distinct factual states:

- no Archive versus no matching Archive results;
- verified empty Queue versus Watch Later not imported;
- no activity-derived channels versus no matching channels;
- missing title/channel identity/artwork/catalog fields;
- unavailable versus unchecked versus stale/error metadata;
- cached refresh failure versus initial collection failure;
- partial/failed Takeout snapshot retaining prior Queue state;
- selected item/channel detail failure with summary preserved; and
- Data API not configured without hiding local evidence.

Avoid decorative copy, guessed reasons, zero placeholders, or one generic empty
state for semantically different coverage.

### Accessibility

- Rows/cards are real buttons or links with discernible video/channel names.
- Selection, focus, hover, and availability are not communicated by
  color alone.
- Layout, section, inspector tabs, filters, and sorts expose selected state.
- Icon-only controls have accessible names.
- Image alternatives do not redundantly repeat adjacent titles.
- History and relationship counts use correct singular/plural announcements.
- Adjacent/sheet inspectors preserve keyboard order, trap focus only when
  modal, and restore focus on close.
- Loading/error updates use appropriate live regions without replacing usable
  cached content.
- Reduced-motion preferences apply to panel transitions.

## Suggested code organization

Exact filenames may vary, but responsibilities should remain separated.

```text
packages/connectors/youtube/src/
  takeout.ts
  takeout.test.ts
  data-api.ts
  data-api.test.ts
  oauth.ts
  oauth.test.ts

packages/contracts/src/
  videos.ts
  videos.test.ts

packages/db/src/
  videos-repository.ts
  videos-repository.test.ts

packages/db/migrations/
  0016_videos_takeout_library.sql
  0017_videos_snapshot_safety.sql
  0018_videos_snapshot_head_backfill.sql
  0019_youtube_catalog_cache.sql
  0020_youtube_oauth_subscriptions.sql

apps/api/src/
  youtube-import.ts
  youtube-import.test.ts
  youtube-catalog.ts
  youtube-catalog.test.ts
  youtube-oauth.ts
  youtube-oauth.test.ts
  videos-routes.ts

apps/web/src/features/videos/
  videos-api.ts
  videos-route-search.ts
  videos-route-search.test.ts
  videos-collection-page.tsx
  video-list.tsx
  video-grid.tsx
  channels-list.tsx
  videos-filters.tsx
  video-inspector.tsx
  video-history.tsx
  channel-inspector.tsx
```

Do not extract a universal media card, filter schema, or inspector merely
because several Library types share shell primitives.

## Delivery sequence

Each stage is independently reviewable. Credential-gated work should not block
the Takeout-backed vertical slice.

### Stage 0: Baseline, credentials, and acceptance cases

Work:

1. Record current migration head, parser version, connection labels, import
   checkpoints, and aggregate Archive/Watch Later/subscription evidence.
2. Confirm retained ignored Takeouts remain available without printing content.
3. Replay parser v3 into an isolated D1/R2 environment and record safe counts.
4. Turn the approved surface examples into named automated acceptance cases.
5. Check for a Data API key by variable name only.
6. Capture the Videos review artifact and current production shell in both
   themes for later comparison.

Exit criteria:

- Real replay inputs and recovery path are understood.
- Separate account lineages and non-secret labels are known or the exact label
  question is isolated for the owner.
- Credential availability is reported precisely.
- No private source value, ID, raw member, or credential enters Git/log output.

### Stage 1: Contracts and Takeout migration skeleton

Work:

1. Add Videos collection/detail/history/channel Zod contracts and request
   validation tests.
2. Add migration 0016, Drizzle definitions, and an empty Videos repository.
3. Add component-snapshot, historical watch, channel, subscription, browse,
   FTS, and index structures.
4. Add migration tests for an empty database and upgrade from all migrations
   through the actual preceding migration, expected to be the Music-reserved 0015.
5. Add route-search parsing/normalization tests before UI implementation.

Exit criteria:

- Empty and upgraded databases return valid empty Videos responses.
- FTS/read models rebuild from ordinary tables.
- Invalid view/filter/sort/cursor combinations fail with stable errors.

### Stage 2: Parser v5 and complete Takeout projection

Work:

1. Extend member selection and strict schemas for playlist/subscription files.
2. Add exact channel-ID parsing and queryable historical watch observations.
3. Convert Watch Later rows into generic Queue membership/evidence and create
   Queue-only video identities/items.
4. Project Takeout subscriptions and channel assertions.
5. Implement component-level completeness and atomic generation finalization.
6. Preserve bounded chunking, safe retry, cursor atomicity, and raw-before-parse.
7. Replay retained pre-v5 raw ZIPs under v5 in an isolated environment.

Exit criteria:

- Real safe aggregate counts reconcile: watches, distinct videos, Watch Later,
  Queue overlap, subscriptions, stable channels, and unresolved reasons.
- Replaying the same ZIP produces no duplicates or relationship churn.
- A newer complete snapshot retires only same-connection Queue/subscriptions.
- Every partial/failure/missing-member case preserves prior active state.
- Queue-only IDs are inspectable without catalog metadata.

### Stage 3: Takeout-backed repository and APIs

Work:

1. Build/rebuild video/channel projections and FTS from local evidence.
2. Implement Archive/Queue/Channels rows, exact counts, facets, sorts, and
   query-bound cursors.
3. Implement correlated occurrence/relationship predicates and reference rows.
4. Implement video detail, paginated watch History, channel detail, and bounded
   channel Library endpoints.
5. Validate links, historical/current fallback ordering, and missing-data copy.
6. Measure query plans at or above observed scale.

Exit criteria:

- The approved local-only surface is available through typed HTTP contracts.
- All browse/detail requests are D1-only and bounded.
- Cursor traversal has no duplicates/omissions under stable data.
- 20,227-video/23,865-watch synthetic plans use intended indexes.

### Stage 4: Takeout-backed production UI

Work:

1. Enable Videos navigation and routes.
2. Implement Archive/Queue list and grid, Channels list, server controls, exact
   counts, and Load more.
3. Add video/channel inspectors with paginated History/Library.
4. Implement local-only fallback, Queue coverage, subscription as-of, and
   missing-channel-identity states.
5. Preserve loaded pages/scroll across inspector/layout/sidebar changes.
6. Add browser coverage for direct links, Back/Forward, normalization, rapid
   selection, and focus restoration.

Exit criteria:

- The owner can browse all retained video history, Watch Later, and activity-
  derived Channels without a Google credential.
- Imported subscription evidence remains internal and is not presented as a live product surface.
- Real-data visual review finds no obvious density, overflow, layout-shift,
  layering, focus, or contrast defects.

### Stage 5: Credentialed Data API probe and cache ADR

Work:

1. [x] Configure the restricted backend key.
2. [x] Run the content-redacted live probe above.
3. [x] Update source/catalog documentation with observed shapes and constraints.
4. [x] Add and accept the refreshable-provider-cache ADR.
5. [x] Finalize migration 0019 and typed provider client from observed data.

Exit criteria:

- Persisted fields, batch size, expiry/deletion behavior, attribution, and retry
  policy are based on real project responses.
- Omitted-ID and failed-batch behavior are proven separately.
- No API response or thumbnail is placed in indefinite immutable evidence.

### Stage 6: Metadata backfill, refresh, and UI activation

Work:

1. [x] Add durable video/channel/category catalog jobs and Queue consumer handling.
2. [x] Backfill exact known video IDs in bounded batches.
3. [x] Fetch channel/category metadata only for Library needs.
4. [x] Merge current catalog facts into projections/FTS with deterministic expiry.
5. [x] Enable metadata-dependent fields, filters, sorts, excerpts, artwork, live
       state, and availability only when supported.
6. Exercise stale reservation, retry, quota pause, expiry, and cache deletion.

Exit criteria:

- Confirmed current metadata improves browsing without changing membership.
- A full current backfill can resume after interruption and stays within the
  measured quota budget.
- Failed/expired enrichment leaves all local Library evidence usable.
- Only successful omitted-ID outcomes mark unavailable.

### Stage 7: Retired OAuth scope

The owner decided not to ship YouTube Following. OAuth, grant storage, account
binding, current-subscription reconciliation, and Following UI are therefore not
implementation requirements. Retained Takeout subscription records remain
source evidence and are not deleted.

### Stage 8: Hardening and acceptance

Work:

1. Replay identical, overlapping, changed, and malformed Takeouts.
2. Exercise complete/partial/missing Watch Later and subscription components.
3. Exercise provider backfill, expiry, omission, auth failure, quota failure,
   and stale reservation recovery.
4. [x] Run fresh and upgrade migration chains.
5. [x] Run all repository checks, builds, and relevant browser tests after the
       final edit.
6. Visually inspect both themes; Archive/Queue list/grid; Channels; adjacent/
   sheet inspectors; and missing/unavailable/stale/long-content states using
   bounded ignored real data.
7. Run an independent final code review and fix every confirmed issue.
8. Update owning source, architecture, connector, UI, and planning documents.

Exit criterion: every acceptance checklist item below is supported by automated
or recorded manual evidence, and no known correctness issue remains.

## Test strategy

### Connector and Takeout import

- Exact Watched versus non-watch actions.
- YouTube/YouTube Music supported URLs and rejected host/path variants.
- Removed/unavailable card with and without retained identity.
- Parsed and malformed raw timestamp with exact raw value preserved.
- Channel-ID path, handle/custom URL, missing link, and malicious URL.
- Repeated watches and same-video/same-instant rank multiplicity.
- Overlapping later export reusing occurrences without collapsing real repeats.
- Changed timestamp creating a distinct occurrence.
- Separate connections sharing one global video.
- Watch Later: present-empty, present-populated, missing, bad header, bad row,
  duplicate ID, missing ID, and invalid timestamp.
- Playlist index matched, absent, ambiguous, and malformed.
- Subscriptions: complete, empty, missing, duplicate channel, bad header, and no
  subscribed date.
- Chunk failure before/after raw persistence, source writes, and finalization.
- Reupload/replay under same and newer parser versions.
- Finalization retry and generation switch under D1 batch limits.
- Complete snapshot retirement versus every non-authoritative absence case.

### Data API

- Valid/optional/null/malformed video, channel, and category
  responses based on redacted live shapes.
- Returned and omitted IDs in one successful batch.
- Failed batch preserving availability/profile state.
- Ordinary, upcoming, current-live, and completed-live values.
- ISO duration parsing, missing duration, thumbnail variants, and unsafe URLs.
- `429`/Retry-After, quota exhausted, `5xx`, timeout, invalid key, revoked
  consent, malformed JSON, and schema drift.
- Cache refresh, expiry, deletion, and Takeout fallback.
- Job idempotency, duplicate delivery, lease expiry, dead-letter recovery, and
  partial backfill resume.

### Database and repository

- One Archive row per video with all occurrences retained.
- Independent Archive/Queue overlaps and multi-account memberships.
- Correlated Watched/Account/YouTube Music predicates.
- Correlated Added/Account predicates.
- Latest matching versus lifetime count/reference behavior.
- Channel rollups excluding label-only and zero-activity followed channels.
- Multi-account aggregate distinctness.
- Every approved filter, facet self-exclusion, sort, null-last rule, and view
  restriction.
- FTS current/historical field ranking, exact ID/URL resolution, short-query
  fallback, and expired-text removal.
- Exact complete counts independent of pages.
- Query-bound cursors with duplicate sort tuples and stale generation.
- Video Queue-only detail and channel detail authorization.
- History/channel Library keyset pagination.
- Projection/FTS rebuild equivalence after deletion.

### Contracts and API

- Request/response schema round trips for all availability/cache/coverage states.
- Reversed/missing date bounds and incompatible filters return `BAD_REQUEST`.
- Item/channel selection mismatch and not-found states.
- Unsafe outbound URLs are absent.
- No raw HTML, ZIP text, provider response, secret, private account identifier,
  or expired API data reaches a response.
- Operational errors are safe and machine-readable.

### Web and browser

- Archive/Queue compatible-state preservation and Channels independent state.
- Search Relevance default and clearing/normalization.
- List/grid page preservation, including separate page-size caches if required.
- Open/close/switch inspector without collection refetch/reset.
- Direct video and channel deep links outside the loaded first page.
- Browser Back/Forward and focus restoration.
- Rapid video/video and video/channel selection without stale detail painting.
- Selected result excluded by a filter.
- Load-more deduplication and projection-generation invalidation.
- Missing/broken image, untitled/unavailable video, label-only channel, and
  unconfigured/stale/error metadata.
- Empty verified Queue versus no Queue coverage.
- Keyboard-only operation, screen-reader labels, reduced motion, and narrow
  sheet behavior.

### Visual QA matrix

Review at minimum:

- Graphite light and dark;
- Archive and Queue list/grid;
- Channels;
- default, search excerpt, active filters, loading, no result, initial error,
  and cached-refresh failure;
- missing title, thumbnail, channel identity, duration, publication, category,
  and description;
- unavailable, unchecked, stale, and error availability;
- ordinary, live, upcoming, recorded live, and YouTube Music facts;
- one watch, many watches, same-video multi-account, Queue overlap, and many
  Queue/subscription relationships;
- long title/channel/description and 25-plus watch History;
- sidebar expanded/collapsed; and
- adjacent desktop inspector and narrow-screen sheet.

## Performance and quota guardrails

- Collection pages return at most 50 list/channel rows or 48 grid cards.
- History and channel Library return 25 rows by default and no more than 100.
- No browse/detail request calls Google, reads R2, parses ZIPs, or performs per-
  row SQL.
- Default/filtered collection paths use indexed keyset queries, never offsets.
- Generate synthetic performance data at least as large as 20,227 videos,
  23,865 watches, 110 Queue rows, two account lineages, and realistic channel/
  subscription coverage.
- Run `EXPLAIN QUERY PLAN` for every default sort, occurrence-aware filter,
  Queue range, channel aggregate, facet, keyset continuation, and FTS path.
- Record measured local and deployed baselines before setting latency regression
  thresholds; do not invent a target unsupported by the environment.
- External thumbnails use fixed slots, lazy loading, and no R2 copy.
- Search input is debounced and superseded requests are cancelled.
- Provider jobs use bounded ID batches, concurrency, attempts, queue messages,
  and safe retry delays.
- The initial full video pass is expected to be about 405 one-unit requests at
  50 IDs per batch, but the live project's quota/limits govern execution.
- Reserve quota headroom and pause predictably rather than retrying until daily
  exhaustion.
- Public metadata is refreshed or deleted before the policy deadline confirmed
  by the credentialed probe.

## Observability and failure handling

### Import observability

Record safe counts and states for:

- component presence/status and parser version;
- cards/rows processed by type and disposition;
- videos, watches, channels, Queue memberships, subscriptions, and evidence;
- Queue/subscription active/retired counts by connection;
- unresolved reason counts;
- chunk/finalization offset and generation;
- projection/FTS rows updated; and
- last complete history/Watch Later/subscription snapshot per connection.

Do not log titles, channels, video IDs, URLs, raw timestamps, ZIP member content,
or account identifiers.

### Catalog observability

Record:

- job type/state, requested/returned/omitted aggregate count, attempts, quota
  estimate, and safe error class;
- profiles refreshed, expired, purged, available/unavailable, and failed;
- channel/category cache counts and expiry window;
- projection generation/freshness.

Structured logs include request/sync/job IDs and redact query/body/credential
content. Provider error bodies are not passed to the client.

### Failure semantics

- Raw-store failure creates no parse/projection claim.
- Parse/projection failure retains exact raw evidence and prior current state.
- Cursor/finalization advances only with covered durable writes.
- Partial current-state snapshots retire nothing.
- Provider request failure preserves previous permitted cache and availability.
- Cache expiry removes prohibited provider fields but never local evidence.
- Collection API failure preserves shell/query and supports retry.
- Enrichment failure alone is not a collection failure.

## Rollout and recovery

1. Recheck the repository migration head, then apply the Videos Takeout
   migration, expected to be 0016, and deploy parser/API code without enabling Videos
   navigation.
2. Replay retained Takeouts into an isolated copy and reconcile safe aggregate
   counts.
3. Apply parser v5 to active local state; verify Queue/subscriptions/projections
   before enabling local-only Videos.
4. Enable Archive/Queue/Channels and inspectors together.
5. After owner key input and live probe, accept the cache ADR and apply the
   Videos Data API cache migration, expected to be 0019.
6. Run resumable metadata backfill; activate dependent fields only after their
   contracts are populated correctly.
7. Run final acceptance, independent review, documentation updates, deployment
   migration/recovery point, and smoke tests.

Recovery uses forward fixes, projection/FTS rebuild, or replay from retained
Takeouts. Never recover by deleting raw objects, source records, identities,
watches, Queue evidence, or subscription evidence. If provider cache behavior
is wrong, disable refresh and purge/rebuild only expiring provider projections.

## Documentation updates required at shipment

- `docs/sources/youtube.md`: parser v5, Watch Later/subscription component
  coverage, exact channel projection, real API probe, current limitations, and
  replay behavior.
- `docs/sources/catalogs.md`: live Data API field/retention/quota/attribution
  observations.
- `docs/architecture/README.md`: Videos source/read-model/cache operational path.
- `docs/architecture/canonical-ledger.md`: implemented YouTube Queue and current
  source projections without changing occurrence semantics.
- `docs/decisions/README.md`: refreshable provider-cache ADR.
- `docs/planning/implementation-plan.md`: Videos shipment and remaining manual
  history limitation.
- `docs/planning/library-implementation.md`: Videos stage status and measured
  aggregate results.
- `docs/planning/library-phase-2-surfaces.md`: status only; do not rewrite
  accepted product behavior unless owner acceptance changes it.
- `docs/design/ui-foundation.md`: only genuinely shared interaction behavior
  proven by Videos.
- `packages/connectors/youtube/README.md`: authentication, import, Queue,
  subscription, metadata, replay, deletion, rate/quota, and policy behavior.
- `apps/api/README.md` and environment/deployment examples for the API key,
  catalog jobs, and recovery commands.

## Owner input and decisions

No unresolved product, layout, framework, database, state-management, or
source-semantics decision blocks the Takeout-backed Stages 0–4. Continue with
React/Vite, TanStack Router/Query, Hono/OpenAPI, Zod, D1/R2, Cloudflare Queues,
TypeScript, Base UI, the Index shell, Graphite theme, canonical ledger, and
source-derived Queue.

Two external inputs are required for the complete accepted surface:

1. **Restricted YouTube Data API key.** Configure it as a backend secret and
   authorize the content-redacted live probe before Stage 5. Recommendation:
   do this after the local-only surface is usable, so the provider gate cannot
   stall Takeout correctness.
   One conditional clarification may be needed during Stage 0: if the two existing
   connections still use ambiguous/default labels, ask the owner for stable,
   non-secret display labels. Do not ask for email addresses or infer labels from
   private export contents.

No transcript/caption permission is requested. Public metadata access does not
authorize transcript download, and transcripts are not part of this Library
delivery.

## End-to-end acceptance checklist

- [x] Parser v5 safely reads supported watch, Watch Later, playlist, and
      subscription members and distinguishes missing/invalid/complete coverage.
- [x] Identical and parser-version replays are idempotent.
- [x] All supported watches and same-timestamp multiplicity reconcile without
      cross-account merging.
- [x] Archive/Queue remain independent, including real overlap.
- [x] Queue matches the latest successful complete same-connection Watch Later
      snapshot and retains all membership history.
- [x] Queue-only videos are inspectable without metadata.
- [x] Complete subscription snapshots retain their evidence; the product exposes no Following state.
- [x] Stable channels group only exact IDs; label-only videos remain visible but
      ungrouped.
- [x] Archive, Queue, and Channels use approved rows/cards, fields, counts,
      filters, sorts, and defaults.
- [x] Every search/filter/sort/facet/count executes server-side over the complete
      matching set.
- [x] Correlated occurrence/relationship filters cannot be satisfied by
      different rows.
- [x] All inspector History/Library lists are bounded and paginated.
- [x] Current metadata and historical Takeout assertions remain separate.
- [x] The credentialed real Data API probe backs persisted fields, batching,
      expiry, attribution, quota, and omission behavior.
- [x] Successful omitted-ID responses alone mark unavailable; failures preserve
      prior state.
- [x] Expired provider data leaves browse/FTS and falls back to Takeout without
      losing history.
- [x] No OAuth grant is required; losing the API key leaves local Archive/Queue/Channels usable.
- [x] Opening/closing/switching inspectors and layouts preserves loaded pages and
      scroll.
- [x] Direct links, Back/Forward, focus restoration, rapid selection, and narrow
      sheet mode work.
- [x] Query plans and pagination are validated at or above observed scale.
- [x] Fresh and upgrade migrations pass.
- [x] `pnpm check`, `pnpm build`, relevant `pnpm test:e2e`, and migration checks
      pass after the final edit.
- [ ] Both themes and responsive modes receive real-data visual QA with obvious
      defects fixed.
- [ ] An independent final review finds no unresolved correctness issue.
- [x] No credential, raw export, provider response, or unsanitized owner fixture
      is committed.
- [x] Owning documentation is updated before commit.

## Ready-to-copy implementation brief

> Implement Videos end to end using
> `docs/planning/videos-implementation.md` and the owner-approved
> `docs/planning/research/videos-phase-2-surfaces.md`. Preserve exact Takeout
> bytes, source records, channel/account lineage, ADR 0010 occurrence ranks,
> source date semantics, and independent Archive/Watch Later membership. First
> deliver the credential-independent parser-v5, Watch Later Queue,
> Takeout-backed subscriptions, video/channel projections, typed APIs, and
> Archive/Queue/Channels UI. Then require a restricted backend API key, hit the
> real YouTube Data API with a content-redacted probe, accept the refreshable-
> cache ADR, and implement bounded expiring metadata jobs. Do not add OAuth or a
> YouTube Following surface. Never use title matching for
> identity, infer missing removals, scrape pages, fetch arbitrary uploads, infer
> Shorts/Premiere, download transcripts, or let provider failure hide local
> history. Use real owner data only in ignored/isolated environments, commit only
> aggregate findings and synthetic fixtures, run the complete validation matrix,
> visually inspect the final artifact, and fix every confirmed independent-
> review finding before handoff.
