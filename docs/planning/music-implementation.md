# Music / Songs end-to-end implementation plan

- Date: 2026-09-20
- Status: Initial production implementation complete; remaining hardening is listed below
- Scope: Spotify-backed Songs Library vertical slice, including Tracks, Albums, Artists, ingestion, replay, browsing, and inspection
- Primary sources: owner-provided Spotify Extended Streaming History plus the authorized Spotify Web API

## Current catalog-backfill decision (2026-09-21)

The accepted interim retention decision is [ADR 0014](../decisions/0014-spotify-catalog-retention-interim.md):
Spotify API catalog responses and projected metadata are retained indefinitely
for this private deployment at the owner's request, with a documented terms
risk. Earlier cache-expiry language below describes the original proposal, not
the current implementation. Exact-ID track and episode backfill is a shared,
bounded queue job; it does not alter owner listening evidence.

## Purpose

Implement Music immediately after Podcasts and before Videos so the two Spotify
slices can share their ingestion and provider-policy foundation, without treating a high-volume listening archive like
Books, Movies, or Articles. This plan covers the entire path from preserved
Spotify evidence through replay-safe normalized playback observations,
canonical song membership, server-side aggregates, bounded APIs, and the
production Tracks, Albums, Artists, and inspector surfaces.

The implementation must remain trustworthy at the observed scale: 152,231 song
rows across 33,225 Spotify track identities in the probed Extended Streaming
History export. It must not load the export or complete listening history into
the browser, merge recordings by title, manufacture completed listens, or infer
duration for API-only activity.

This plan incorporates the owner's accepted immediate-admission rule. It
supersedes the provisional 30-second qualification language in the earlier
Music research and consolidated Library specification:

- every identified, non-conflicting Spotify song history row is a counted
  playback observation immediately, including a zero-duration or skipped row;
- every identified Recently Played API event is counted immediately;
- source-reported milliseconds contribute to observed time exactly as reported;
- an API-only event contributes no observed time; and
- unresolved, ambiguous, podcast, and audiobook records remain preserved but do
  not become song activity.

There is deliberately no minimum listening threshold. The UI says **playback
observations** and **observed time**, not completed listens, full plays, or times
played.

## Implementation status (2026-09-21)

The current change set ships the usable end-to-end Music slice: every identified
song export row is projected without a playback threshold, Recently Played is
polled and deduplicated, canonical Archive evidence is retained, exact track
aggregates drive Tracks/Albums/Artists, and bounded collection/detail/history
APIs power production routes and inspectors. Period and source predicates scope
the displayed counts and observed time to the same occurrences. The UI exposes
period, source, playback-count, metadata, explicit, and album-type filters plus
the accepted section-specific sorts and directions.

Live sync also performs one exact-ID batch of up to 50 older tracks per run.
Each `/tracks` response is preserved byte-for-byte before projection, missing
catalog objects become explicit unavailable state, and the batch gradually
fills Albums and Artists without making a normal sync unbounded. Recent-API-only
activity is counted while remaining honest about missing observed duration; a
mixed aggregate reports how many observations lack duration.

The 2026-09-21 pass added value/keyset collection and History cursors, ranked
FTS for Tracks, a durable Recently Played checkpoint with possible-gap
diagnostics, complete Track/Album/Artist History tabs, exact inspector
cross-links, focus restoration, and matching-period versus lifetime facts for
items opened from the current collection. Artists now default to the accepted
dense list layout. A checkpoint regression verifies cursors are written only
after their parent sync run succeeds.
Tracks now has counted, searchable Artist and Album facet pickers; Albums has
the same Artist picker. Options use exact Spotify identities, self-exclude their
own selected values, page across the full filtered result, and remain URL-backed.

The following hardening still remains beyond the current slice:

- finish operational recovery of the durable exact-ID catalog backfill and add
  scheduled, rate-aware refresh of Spotify track, album, and artist metadata;
- add explicit export/API overlap diagnostics and virtualize long Track/Artist
  stacks;
- replace or remove superseded Spotify API metadata, artwork, search terms, and
  raw catalog snapshots under a documented finite cache lifecycle, while
  preserving owner history and source identities. Refresh by itself would not
  resolve the interim retention risk recorded in ADR 0014.

These follow-ups do not change the shipped admission rule: all supported song
observations count immediately, API-only observations never fabricate duration,
and Albums/Artists require exact Spotify identities.

## Outcome

At completion, `/library/songs` redirects to a production Music workspace with
three source-backed views:

1. **Tracks** — one dense row per Spotify track URI with at least one supported
   playback observation;
2. **Albums** — release rollups for heard tracks that have an exact Spotify album
   identity; and
3. **Artists** — credit rollups for heard tracks that have exact Spotify artist
   identities.

The slice provides:

- complete replay-safe projection of every classified song row in an imported
  Extended Streaming History archive;
- best-effort incremental Recently Played polling with a durable checkpoint and
  explicit gap disclosure;
- one canonical song item per original Spotify track URI and one active Archive
  membership per connection and track, backed by source evidence;
- a separate normalized occurrence layer for counts, period filtering, observed
  time, reconciliation, and paginated History;
- exact-identity, expiring Spotify catalog metadata sufficient to resolve album
  and artist groupings where the current provider grant permits it;
- server-side search, filters, sorts, facets, counts, selected-period and lifetime
  aggregates, and opaque keyset cursors;
- a virtualized dense Tracks table, compact Albums grid, virtualized Artists
  list, and compact Details/History inspector;
- honest missing-metadata, incomplete-import, overlap, poll-gap, and provider-
  unavailable states; and
- deterministic replay and recovery from retained raw evidence without deleting
  the existing podcast projection.

Music has no Queue tab, no disabled Queue control, and no Queue count. Saved
tracks, saved albums, followed artists, Spotify top items, and provider
popularity do not define membership in this slice.

## Scope

### Included

- Reparse existing and future Extended Streaming History ZIPs so every song row,
  not only a row count, receives immutable source-record and source-owned
  observation projections.
- Preserve all supported export song facts needed for replay and inspection:
  track URI, timestamp, milliseconds, title, album-artist text, album text,
  skipped state, start/end reasons, and context where permitted.
- Classify podcast, song, audiobook/chapter, ambiguous, and unidentified records
  with explicit precedence and keep non-song evidence out of Music.
- Admit every identified song observation immediately, with no duration or skip
  threshold.
- Poll `GET /me/player/recently-played` on explicit Sync and scheduled
  reconciliation, preserving exact response bytes before validation.
- Deduplicate overlapping recent polls without collapsing same-snapshot
  multiplicity.
- Keep export/API reconciliation separate, deterministic, versioned, and
  reversible; disclose potential overlap until a rule is proven from real
  overlapping evidence.
- Add song-specific D1 projections, FTS, aggregates, indexes, repositories,
  contracts, Hono routes, route-state parsers, API hooks, UI components, and
  regression tests.
- Add an exact-ID Spotify metadata cache with source links, acquisition/expiry
  state, availability, and provider-policy enforcement.
- Expose Tracks, Albums, Artists, detail, History, and searchable large-filter
  option endpoints.
- Reuse the production Index shell, Graphite themes, compact inspector, URL
  state, browser history, query caching, and page-preservation conventions.
- Update source, architecture, UI, planning, and operational documentation when
  behavior ships.

### Excluded

- A Songs Queue or interpreting saved/liked tracks as future intent.
- Saved-track and saved-album filters or badges in the first slice.
- Followed-artist acquisition or reauthorization for `user-follow-read`.
- Spotify top tracks/artists, popularity, followers, genre affinity, or public
  trend data.
- Automatic ISRC merges, title/artist merges, cross-release recording merges,
  or MusicBrainz matching.
- MusicBrainz and Cover Art Archive enrichment. They remain the recommended
  portable future catalog layer, not a hidden fallback in this delivery.
- Lyrics, audio, previews, waveform analysis, embeddings, audio-feature APIs,
  playback controls, scrobbling, ratings, reviews, edits, manual corrections,
  or upstream writes.
- Inferring listening sessions, completions, relistens, or one full play by
  dividing observed milliseconds by track duration.
- Projecting Spotify audiobook/chapter records into Music, Podcasts, or Books.
- Sending Spotify API content, artwork, or derived catalog text to an LLM or
  embedding service.
- Chat, Recaps, recommendations, or external-catalog inspection.

## Accepted product behavior

### Membership and terminology

Tracks membership is source-observation based:

- an Extended Streaming History row belongs to Music when it has a valid
  `spotify:track:{id}` identity and no conflicting episode, audiobook, or chapter
  identity;
- that row counts immediately regardless of `ms_played`, `skipped`, or
  `reason_end`;
- an identified Recently Played item counts immediately when its page commits;
- a track remains in Music while at least one active normalized playback
  occurrence supports it; and
- the absence of a track from Recently Played is never removal evidence.

Use these labels consistently:

- **playback observation** — a normalized counted unit supported by one or more
  source observations;
- **observed time** — the exact sum of export `ms_played` for counted occurrences
  with export evidence;
- **without duration** — a counted API-only occurrence whose duration is not
  supplied by the endpoint; and
- **possible overlap** — export and API observations that may describe the same
  activity but have not been deterministically reconciled.

Do not use **qualifying playback**, **completed listen**, **full play**, **played
in full**, or **times played**. Earlier threshold-based specifications must be
updated at shipment so the repository has one consistent product rule.

### Archive projection

Music has no visible Archive tab, but each admitted track still participates in
the canonical Archive ledger for cross-media history:

- create one active Archive entry per Spotify connection and original track URI;
- use the canonical `spotify_positive_playback` admission reason; exact
  export/API origin remains on the linked source record and
  `spotify_song_observations.source_kind`;
- use a stable source occurrence key such as `track:{spotifyTrackUri}`;
- link the first supported observation as admission evidence;
- link later observations that advance the reference instant as occurrence-time
  evidence without turning every segment into another Archive entry;
- set the Archive consumed instant to the latest dated supported occurrence and
  move it only forward;
- leave the Archive consumed instant unknown when the only supported evidence is
  undated; and
- never substitute import, poll, or ingestion time for a source playback time.

The source-owned occurrence tables, not Archive entries, own detailed counts,
duration, skipped state, period matching, and History.

### Source classification precedence

Apply this order to every Extended Streaming History row:

1. audiobook or chapter identity -> deferred audiobook evidence;
2. episode identity -> podcast evidence;
3. valid track identity -> song observation;
4. conflicting media identities -> ambiguous evidence; and
5. no usable identity -> unresolved evidence.

Never create a song item from title, artist, album, ISRC, URL text, or fuzzy
similarity. A valid Spotify track identity is mandatory.

### Track identity

One `media_items(type='song')` row represents one original Spotify track URI.
The global external identity is `spotify / track_uri /
spotify:track:{id}`.

- Preserve the original identity even if Spotify returns a playable replacement.
- Store `linked_from` as an explicit relation; do not rewrite history to the
  replacement.
- Treat ISRC as matching evidence, not a merge key.
- Treat album URI as a release/container identity, not a recording identity.
- Treat artist URI as a credited creator identity, not a listening occurrence.
- Preserve ordered track-artist credits separately from album-artist credits.
- Keep current catalog text separate from historical export text.

### Playback observations and normalized occurrences

Keep three concepts distinct:

1. A **source observation** is one addressable item in a raw export member or API
   page. It is immutable, even when byte-identical to another item.
2. A **normalized playback occurrence** is counted once and may have multiple
   source observations after deterministic reconciliation.
3. A **track Archive membership** says the track has supported activity. It is
   not a per-play event.

Within an export member, raw object + member name + array index is its immutable
observation identity. Exact duplicate rows and same-second rows remain distinct.

For overlapping Recently Played polls, assign duplicate ordinals within a
snapshot for identical `(track URI, played_at)` pairs. Across polls, retain the
maximum observed multiplicity for `(connection, track URI, played_at,
duplicateOrdinal)` while preserving every acquired page item as source evidence.

Do not merge export and API activity by track alone, day, title, or a fuzzy time
window. Export `ts` is a whole-second segment-end instant; API `played_at` has
millisecond precision and no duration. Until an actually overlapping owner
export proves a deterministic rule, count both and disclose possible overlap.

When a later measured rule is accepted, it must be versioned and replayable. A
reconciled occurrence counts once, retains both evidence links, and uses export
milliseconds once. Reconciliation may change counts only through an explicit
projection version and rebuild; it never deletes raw evidence.

### Aggregates

Every Track, Album, and Artist row returns server-computed `period` and
`lifetime` aggregates:

```text
playbackCount
exportBackedPlaybackCount
apiOnlyPlaybackCount
reconciledPlaybackCount
playbacksWithObservedDuration
observedMs
firstPlayedAt
latestPlayedAt
```

`period` applies active date, source, and account predicates. `lifetime` ignores
only the date bounds while retaining account and source predicates. With All
time selected, render one aggregate instead of duplicate equal values.

`observedMs`:

- sums export-reported milliseconds once per normalized occurrence;
- includes zero as a valid source-reported value;
- never uses catalog duration to estimate listening;
- never assigns duration to API-only occurrences; and
- never includes unresolved or non-song rows.

Album and Artist aggregates roll up only exact accepted identities. A
multi-artist occurrence contributes once to each credited Artist row, so Artist
row totals are intentionally non-additive. Whole-view totals deduplicate the
underlying tracks and occurrences instead of summing Artist rows.

### Shared controls and date semantics

Songs navigation contains **Tracks**, **Albums**, and **Artists**. Compatible
search, period, source, and account controls survive view changes. Incompatible
album, artist, explicit, metadata, or album-type controls are removed from the
URL, along with an incompatible sort and direction, rather than silently
ignored.

The period control has:

- All time (default);
- This year;
- Last 12 months; and
- Custom range with one or both inclusive calendar-date bounds.

Resolve presets and inclusive calendar bounds in the browser's current IANA
timezone, include that timezone in normalized URL/API state, convert each local
calendar interval to `[start, next-day-start)` UTC once at the API boundary, and
query stored UTC instants. Validate reversed ranges and invalid IANA zones.

An occurrence-scoped period/source/account filter matches any supported
occurrence. The row's reference date is the latest matching occurrence. The
inspector still exposes complete retained History and marks the entries that
match current collection predicates.

### Tracks surface

Tracks is a dense, semantic, virtualized table/list with a sticky header. It has
no grid toggle. Default ordering is Recently played, newest first.

Each desktop row shows, in order:

1. optional 32-pixel square album art, title, and compact Explicit marker when
   known true;
2. ordered track artists;
3. album;
4. selected-period playback-observation count, plus lifetime when filtered;
5. selected-period observed time, plus lifetime and duration-coverage note when
   filtered;
6. latest matching playback instant; and
7. an attributed Spotify link when current Spotify metadata or artwork is used.

At narrower widths, keep Track, Playbacks, and Last played visible; stack Artist
and Album under Track; move Observed time into secondary text. Use fixed artwork
dimensions and a neutral local placeholder without downloading provider art.

Display text fallback order is:

1. valid, unexpired exact-ID Spotify cache;
2. latest non-null owner-export text; then
3. factual UI fallbacks: Untitled track, Artist unavailable, Album unavailable.

Search targets:

- current and imported track titles;
- exact credited artist names and imported album-artist text;
- current and imported album names;
- ISRC; and
- exact Spotify track URI or ID.

Search does not include raw reasons, platform, country, IP address, user agent,
device, private-session state, popularity, or raw JSON. Exact identifiers bypass
FTS tokenization. Quoted phrases remain phrases; whitespace terms use AND;
prefix matching begins on the final unquoted token after two characters.

Tracks filters:

| Filter          | Choices                                                        | Semantics                                                          |
| --------------- | -------------------------------------------------------------- | ------------------------------------------------------------------ |
| Period          | All time, This year, Last 12 months, Custom                    | Any occurrence in the resolved interval                            |
| Activity source | All, Extended Streaming History, Recently Played               | Reconciled occurrences match either selected source but count once |
| Spotify account | All or one/more connections                                    | Hidden with one connection; OR within the facet                    |
| Playback count  | Any, Once, 2–9, 10–49, 50+                                     | Selected-period count, or lifetime for All time                    |
| Metadata        | Any, Current Spotify details, Export details only, Unavailable | Describes current display projection                               |
| Artist          | One/more exact Spotify artist identities                       | Requires accepted exact credit                                     |
| Album           | One/more exact Spotify album identities                        | Requires accepted exact relation                                   |
| Explicit        | Any, Explicit, Not explicit, Unknown                           | Uses valid exact-ID metadata; unknown differs from false           |

Tracks sorts:

| Label              | API key         | Directions       | Default/tie behavior                  |
| ------------------ | --------------- | ---------------- | ------------------------------------- |
| Recently played    | `playedAt`      | asc, desc        | default desc; latest matching instant |
| Track              | `title`         | asc, desc        | normalized display title              |
| Artist             | `artist`        | asc, desc        | normalized ordered credit string      |
| Album              | `album`         | asc, desc        | normalized display album              |
| Most playbacks     | `playbackCount` | asc, desc        | selected-period/lifetime count        |
| Most observed time | `observedTime`  | asc, desc        | selected-period/lifetime milliseconds |
| Relevance          | `relevance`     | fixed best-first | nonempty search only                  |

Unknown values sort last in either direction. Stable ties use normalized title,
Spotify track URI, then media item ID.

### Albums surface

An Album row exists only for an exact Spotify album URI connected to a Track
that matches current occurrence predicates. Export album text alone never
creates or merges an Album. Unresolved tracks remain usable in Tracks and appear
in coverage counts.

Albums uses a compact square-art grid with no list toggle. Default ordering is
Most playbacks, descending. Each card shows:

1. valid album artwork or neutral local square;
2. album title;
3. ordered album artists;
4. unique tracks heard;
5. selected-period playback observations and observed time; and
6. latest matching playback date.

Searches current/imported album title on exactly linked tracks, exact album-
artist names, and exact Spotify album URI/ID. Filters include the common period,
source, account, playback-count, metadata, and exact Artist facets plus Album
type: Album, Single, Compilation, Other, Unknown.

Album sorts are Most playbacks (default), Recently played, Album, Artist, Tracks
heard, Observed time, Released, and Relevance. Stable ties use normalized album
title then internal Album projection ID. Release dates preserve source precision.

### Artists surface

An Artist row exists only for an exact Spotify artist URI credited on a matching
Track. Imported name-only text is searchable on Tracks but never creates or
merges an Artist.

Artists uses a dense, semantic, virtualized list with no image-grid dependency.
Default ordering is Most playbacks, descending. Each row shows:

1. artist name;
2. unique tracks heard;
3. exact releases heard;
4. selected-period playback observations;
5. selected-period observed time and duration coverage; and
6. latest matching playback date.

Searches exact artist names and Spotify artist URI/ID. Filters include period,
source, account, playback count, and metadata. There is no Followed, Genre, or
Popularity filter.

Artist sorts are Most playbacks (default), Recently played, Artist, Tracks
heard, Releases heard, Observed time, and Relevance. Stable ties use normalized
artist name then internal Artist projection ID.

### Counts and coverage

Counts describe the complete matching query, never only loaded pages:

- Tracks: **N tracks · M playback observations · H observed**.
- Albums: **N albums · T tracks heard · M playback observations · H observed**.
- Artists: **N artists · T tracks heard · M playback observations · H observed**.

When matching observations lack duration, add **K playback observations have no
observed duration**. A zero-duration export observation has known duration and
does not belong in that K count.

One compact coverage disclosure near the header includes:

- latest complete export import and its covered-through instant;
- last successful Recently Played poll and durable checkpoint;
- incomplete or failed imports;
- tracks awaiting exact Album identity;
- tracks awaiting exact Artist identity;
- current catalog-cache coverage and expiry state;
- possible recent-activity gap; and
- possible export/API overlap.

Do not imply continuous completeness between a bounded recent window and manual
exports.

### Inspector

Use the shared compact right-side inspector with Details and History tabs.
Tracks are canonical media items; Albums and Artists are aggregate projections
that use the same inspector shell without becoming media items.

Track header:

- small valid album artwork;
- current/imported title;
- ordered credited artists;
- album name; and
- attributed Open in Spotify link when provider content is displayed.

Track Details sections, omitting empty sections:

1. **Listening** — period/lifetime observation counts, observed time,
   duration-bearing counts, first/latest playback, export-backed/API-only/
   reconciled counts.
2. **Track** — duration, explicit state, track/disc number, release date and
   precision, ISRC, original Spotify identity, relinked identity and current
   availability.
3. **Album** — exact Album facts and a link that opens Album inspection.
4. **Artists** — ordered exact credits; name-only fallback text is not linked.
5. **Source** — differing historical text, source links, cache freshness/expiry,
   connection labels, export/poll coverage, overlap state, reconciliation
   version, and collapsed provenance.

Album Details contains Listening, Album, the first ten Tracks heard by active
period playback count, and Source. **View all tracks** navigates to Tracks with
the exact Album filter.

Artist Details contains Listening, first ten Top tracks, first ten Releases
heard, and Source. **View all tracks** navigates with the exact Artist filter;
selecting a release opens Album inspection.

History is newest first and keyset-paginated. Track rows show:

- source playback instant in the active timezone;
- `Export · Nm Ns observed`, including `0s observed`, or
  `Recent API · duration unavailable`;
- source set and reconciled state;
- skipped state when explicitly true;
- Matches current period when applicable; and
- an expandable disclosure for start/end reasons, historical title facts,
  evidence count, and compact provenance.

Album and Artist History adds Track and ordered Artists. History defaults to all
supported occurrences even under a period filter; a Current period only toggle
narrows it. There is no threshold-based Excluded observations mode. A technical
**Unresolved evidence** count may link to Connections diagnostics, but records
without a track identity cannot appear in a Track/Album/Artist inspector.

Do not display IP address, country, platform, user agent, device, incognito/
private-session state, username, raw authorization data, or raw JSON.

## Current implementation assessment

### What exists

- The canonical ledger, raw R2 evidence, D1 connections, sync runs, cursors,
  source records, media items, identities, Archive entries, and evidence links
  are implemented.
- The Spotify export endpoint stores the original ZIP content-addressed in R2,
  uses durable HTTP continuations, and processes at most 100 podcast segments per
  request.
- The export parser recognizes song rows, but currently only increments
  `songRows`; it does not return or project the song observations.
- The derived R2 manifest is podcast-only and the import cursor's `totalRecords`
  is the podcast segment count, not the complete audio-history record count.
- At this plan's baseline, the export parser/version is
  `spotify-extended-history@3`. Podcasts is scheduled first and may advance the
  parser and derived-manifest design before Music starts.
- Saved-episode synchronization, encrypted rotating credentials, refresh lease,
  complete snapshot cursor, and raw-page-before-parse behavior are implemented.
- The current Spotify Web API client only supports saved episodes in production.
- The authenticated research probe verified Recently Played, saved tracks,
  saved albums, track/album/artist object shapes, multiple artist credits, ISRC,
  exact album identities, and relinking evidence.
- Domain type `song` already exists, but the admission-reason enum has no
  song-specific value.
- The database has no song observation, normalized occurrence, Album, Artist,
  credit, cache, aggregate, or song-search projection.
- Contracts and Hono routes have no Music-specific collection/detail/history
  API.
- The production sidebar shows Music as unavailable; the router has no Music
  route.
- The saved review artifact contains a Music mock, but production must use real
  projected data and preserve the artifact separately.

### Gaps to close

1. Existing raw ZIPs need a parser-version replay that projects all song rows
   without disturbing podcast evidence.
2. The importer must process the complete classified record stream, not build a
   podcast-only in-memory manifest.
3. Later overlapping lifetime exports need an explicit generation/reconciliation
   gate before they can double active aggregates.
4. Recently Played polling, checkpointing, page preservation, and gap state are
   not implemented.
5. Exact track metadata acquisition needs a production policy, provider-capability
   recheck, throttling, expiry, and resumption path.
6. Album and Artist rollups require exact current identities and cannot be built
   safely from export names alone.
7. Queries must aggregate over 150k+ observations and 33k+ tracks with stable
   keyset pagination and no application-memory scan.

## Recommended architecture

```text
Owner Extended Streaming History ZIP
  -> exact ZIP in private R2
  -> streamed member parser and immutable source records
  -> spotify_song_observations
  -> spotify_song_occurrences + occurrence evidence
  -> media_items / external_identities / one Archive membership per track
  -> lifetime aggregates + exact Album/Artist rollups + FTS

Authorized Recently Played pages
  -> exact response bytes in private R2
  -> source records + observations
  -> overlap-safe recent occurrences
  -> same track/archive/aggregate projections

Authorized exact-ID catalog responses
  -> provider-policy cache with expiry
  -> track display + exact Album/Artist/credit projections
  -> attributed Music APIs
  -> production React views and inspector
```

### Ownership boundaries

`packages/connectors/spotify` owns:

- permissive validation and classification of Spotify export/API payloads;
- track URI parsing, source field preservation, recent snapshot duplicate
  ordinals, and provider error/retry helpers;
- no SQL, Hono, React, or Cloudflare binding logic.

`packages/domain` owns:

- the new source-specific song Archive admission reason and pure shared temporal
  or identity types only;
- no provider payload schemas or aggregation SQL.

`packages/db` owns:

- song observations, occurrences, evidence, read models, cache metadata,
  aggregates, FTS, query predicates, facets, keyset cursors, and rebuilds;
- no network calls or React state.

`apps/api` owns:

- R2 acquisition, Worker bindings, sync orchestration, leases, bounded import/
  replay continuations, Spotify request scheduling, cache expiry, Hono routing,
  and stable errors;
- route handlers delegate browse SQL and provider normalization.

`packages/contracts` owns:

- all Music request/response schemas and inferred client types.

`apps/web` owns:

- route parsing, normalized URL state, query keys, loaded-page preservation,
  virtualization, responsive presentation, inspector interaction, and
  accessibility;
- no playback aggregation or source-reconciliation decisions.

### Architectural decisions to record

Podcasts is scheduled to establish the shared Spotify provider-cache ADR. Before
shipping Music catalog storage, review and extend that ADR for Track, Album,
Artist, artwork, relinking, Recently Played, expiry, derived-cache deletion,
replay, attribution/link, unavailable-item, and enforceable no-AI-use behavior.
Do not create a duplicate Music-only cache ADR. Owner export evidence remains
immutable R2 data and must be clearly separated from expiring Spotify API
content.

Update the canonical-ledger and Spotify connector documentation to record the
no-threshold song rule and the one-membership-plus-source-occurrences shape. Add
a focused companion or superseding song-admission ADR only if architecture
review shows that the existing source-specific admission decisions do not
already accommodate this extension. The accepted plan is sufficient product
direction; this is documentation of the technical consequence, not a new owner
decision.

## Database and migration plan

The accepted implementation order reserves `0014` for Podcasts.
`0015_songs_library.sql` is therefore the expected Music migration before the
Videos reservations at `0016` through `0018`. Recheck the actual migration tail immediately before creating
it and use the next available forward-only number if parallel work changed the
sequence.

### `spotify_song_observations`

One row per immutable source observation:

```text
id primary key
connection_id -> connections
source_record_id -> source_records unique
track_media_item_id -> media_items nullable for unresolved evidence
surface extended_history | recently_played
spotify_track_uri nullable
spotify_track_id nullable
occurred_at nullable UTC instant
timestamp_precision instant | unknown
ms_played nullable nonnegative
skipped nullable boolean
reason_start nullable
reason_end nullable
context_uri nullable
imported_title nullable
imported_album_artist nullable
imported_album nullable
snapshot_key nullable
duplicate_ordinal nonnegative
classification song | podcast | audiobook | ambiguous | unresolved
disposition counted | unresolved | non_song
normalization_version
created_at
```

Sensitive export fields stay only in protected raw evidence. The browse
projection must not copy username, IP, country, platform, user agent, offline
device data, or private-session state.

Required constraints:

- unique `source_record_id`;
- counted rows require valid track media item, URI, and classified song;
- export rows have non-null `ms_played`; recent rows have null `ms_played`;
- milliseconds are never negative after validation;
- duplicate ordinal is nonnegative; and
- source observation replay is idempotent for raw object, parser version, and
  record path.

### `spotify_song_occurrences`

One normalized counted unit:

```text
id primary key
connection_id -> connections
track_media_item_id -> media_items
representative_occurred_at nullable
observed_ms nullable nonnegative
has_export_evidence boolean
has_recent_api_evidence boolean
reconciled boolean
reconciliation_version nullable
created_at
updated_at
```

An export-only occurrence stores exact `ms_played`, including zero. An API-only
occurrence stores null observed duration. A reconciled occurrence uses the
export duration once.

### `spotify_song_occurrence_evidence`

Many observations may support one occurrence after reconciliation:

```text
occurrence_id -> spotify_song_occurrences
observation_id -> spotify_song_observations unique
role primary | corroboration
linked_at
primary key (occurrence_id, observation_id)
```

An observation belongs to at most one counted occurrence. Reconciliation runs
transactionally replace a versioned occurrence projection without changing
source observations.

### Track display projection

`spotify_song_tracks` contains one row per canonical song media item:

```text
media_item_id primary key
spotify_track_uri unique
spotify_track_id unique
imported_title nullable
imported_album_artist nullable
imported_album nullable
catalog_cache_id nullable
display_title
normalized_title
duration_ms nullable
explicit nullable
track_number nullable
disc_number nullable
release_value/precision nullable
isrc nullable
spotify_url nullable
availability current | unavailable | unchecked | expired
catalog_state current | export_only | unavailable | expired
source_refreshed_at
projection_version
```

Keep historical imported text in the observation layer; these fallback columns
represent the latest deterministic non-null imported values and remain
rebuildable.

### Exact Album and Artist projections

Create source-owned grouping tables rather than media items:

- `spotify_song_albums`: internal ID, exact Spotify album URI/ID, title,
  normalized title, type, release temporal value, total tracks, art reference,
  Spotify URL, cache/freshness/availability state;
- `spotify_song_artists`: internal ID, exact Spotify artist URI/ID, name,
  normalized name, optional art reference, Spotify URL, cache/freshness state;
- `spotify_song_track_album`: current exact relation, source cache ID,
  observed/expiry fields;
- `spotify_song_track_artists`: ordered track credits with unique
  `(track, ordinal)` and reverse Artist indexes;
- `spotify_song_album_artists`: ordered album credits separate from track
  credits; and
- `spotify_song_relinks`: original track identity, playable replacement
  identity, source cache, first/last observation.

Name-only export text never populates an Album/Artist entity. Expiring catalog
content can be removed or marked expired without removing the track, imported
text, occurrences, Archive membership, or aggregates.

### Provider cache and acquisition state

Add provider-specific cache metadata, either in general reusable catalog tables
or explicit Spotify tables, with:

```text
provider identity
raw object reference
fetched_at
expires_at/deletion_due_at
availability state
source link
attribution required
allowed use class
last success/error/retry_after
projection version
```

Cache expiry must remove every derived Spotify API field and image URL that is
no longer permitted. Replay of immutable export data must not resurrect expired
API content.

Track enrichment jobs need a stable identity, status, reservation/lease,
attempts, next eligible time, and error class. Use the existing queue only if
the operation schema and retry lifecycle are generalized cleanly; otherwise use
a bounded resumable sync table. Do not enqueue tens of thousands of messages in
one request.

### Lifetime aggregates

`spotify_song_track_aggregates` is a rebuildable read model keyed by track:

```text
playback_count
export_backed_count
api_only_count
reconciled_count
duration_bearing_count
observed_ms
first_played_at
latest_played_at
aggregate_generation
updated_at
```

Album and Artist aggregate tables may materialize the default lifetime sorts.
They remain projections and are fully rebuildable from occurrences plus current
exact relations. A new import cannot expose occurrence rows with old aggregates:
update affected rows atomically per chunk or publish a complete new aggregate
generation.

Selected-period aggregates query indexed occurrences server-side. If later
rollup buckets are necessary, store UTC boundaries and timezone/version data and
prove exact equality at DST and custom-range boundaries.

### Search indexes

Create FTS5 projections for:

- Track current/imported title, exact credits, imported artist text, current/
  imported album, ISRC, track URI/ID;
- Album title, exactly linked imported album text, exact album artists, URI/ID;
- Artist exact name and URI/ID.

Use contentless FTS plus explicit mapping if it follows the Articles pattern.
Update search transactionally with a projection generation. Exact identity
lookups bypass FTS.

### Required indexes

At minimum:

- observation by unique source record;
- recent multiplicity by connection, track, instant, ordinal;
- occurrence evidence in both directions;
- occurrences by connection/instant/id and track/instant/id;
- source evidence flags plus instant for source filtering;
- Archive membership by connection/track occurrence key;
- lifetime Track aggregate indexes for latest activity, count, observed time,
  normalized title/artist/album, with media item ID final tie-breaker;
- exact Spotify track URI/ID and ISRC;
- Track-Album unique/reverse indexes;
- Track-Artist unique ordinal/reverse indexes;
- Album/Artist aggregate indexes for every supported default and optional sort;
- cache expiry and unavailable state; and
- FTS map/index paths for all three views.

### Schema invariants

- No threshold column or hidden duration rule determines admission.
- Every identified supported export/API observation is preserved and counted
  once before cross-surface reconciliation.
- Every occurrence has at least one evidence link.
- Every Archive song entry has admission evidence.
- Replaying one raw object/parser version is idempotent.
- Same-second and byte-identical export rows remain distinct.
- Cross-export and export/API reconciliation never runs without a named,
  versioned rule.
- Provider cache expiry never removes owner export evidence or listening
  aggregates.
- Album/Artist rows require exact identities; normalized names never create or
  merge them.
- Current cache facts and historical source text remain separate.
- Aggregate, count, facet, and row queries share one active-occurrence predicate.

## Spotify acquisition, replay, and reconciliation plan

### Parser version and derived manifest

Advance the then-current Spotify export parser because song normalization
changes materially. At this plan's baseline that parser is
`spotify-extended-history@3`, but Podcasts is scheduled first and is expected to
change the shared parser/manifest. Music must build on and advance the parser and
manifest version that exists after Podcasts rather than assume a direct
`@3` -> Music transition. The Music version must return a classified row stream,
not only podcast segments plus a song count.

Replace the podcast-only derived manifest with a versioned complete member
manifest that retains only safe normalized parsing inputs and raw record paths.
The original ZIP remains the evidence source. Avoid creating one enormous JSON
manifest that must be decoded in every continuation; prefer one small index plus
per-member or bounded derived chunks in R2.

Existing podcast logic must continue to produce the same supported Archive
results. Tests compare the old podcast projection to replay under the new parser
before activation.

### Initial and resumed export import

1. Hash and store the ZIP content-addressed in private R2 before parsing.
2. Register the raw object and sync run.
3. Stream safe Extended Streaming History members and classify every row.
4. Persist versioned derived chunks and their checksums.
5. Process bounded chunks of no more than the measured D1/Worker-safe statement
   count; 100 observations is the current ceiling, not a promise that one song
   costs one statement.
6. In one transaction, write source records, observations, identities, media
   items, occurrences, occurrence evidence, Archive membership/evidence,
   affected lifetime aggregates, and the committed continuation.
7. Advance the cursor only after all writes commit.
8. On completion, atomically mark the raw object/parser generation processed and
   publish the aggregate/search generation.

The response and Connections progress must distinguish total classified rows,
song observations, podcast segments, audiobook evidence, unresolved rows,
created occurrences, tracks, and remaining offsets.

Closing the browser may pause an HTTP-driven import; a persisted continuation
must resume without rereading already committed members or inflating counts.

### Replay of the owner's retained export

Run the new parser against an isolated database/R2 namespace first. Compare:

- complete source row count against the probe total;
- song, podcast, audiobook, ambiguous, and unidentified counts;
- distinct valid track identities;
- sum of exact song `ms_played`;
- same-second and byte-identical multiplicity;
- existing podcast Archive identities/latest dates before and after replay; and
- idempotent second replay.

Do not hard-code the observed private counts into product tests. Record aggregate
verification in the implementation report without committing personal rows.

### Later lifetime exports

The same ZIP hash is a no-op only after the current parser generation completed
successfully. A failed/partial import is resumable.

A later different lifetime export is not automatically additive because it may
repeat the entire history without stable upstream event IDs. Preserve the raw
ZIP and observations, compare it with the active generation, and activate it
only after a versioned overlap rule is proven. Until then:

- keep the prior complete aggregate generation live;
- show New export awaiting playback reconciliation;
- do not double counts; and
- make the pending import retryable and diagnosable.

### Recently Played polling

Add a connector client for `GET /me/player/recently-played`:

- request at most 50 items per page;
- use a durable millisecond `after` checkpoint;
- acquire enough bounded overlap to assign duplicate ordinals safely;
- preserve the exact successful response bytes in private R2 before parsing;
- validate missing/nullable 2026 fields permissively;
- process every identified Track object and its embedded Album/Artists metadata
  under provider-cache policy;
- advance the checkpoint only after every page observation, occurrence,
  aggregate, cache projection, and raw status commits;
- honor `429 Retry-After`, bound retries, and classify auth, quota, transient,
  schema, and permanent item errors;
- do not advance on partial or failed polls; and
- set `possibleRecentGap=true` after an outage can exceed the endpoint's bounded
  recoverable window, until a later export covers it.

Recently Played excludes podcasts; keep it independent of saved-episode
reconciliation even if an explicit Sync invokes both.

Scheduled behavior:

- the existing hourly scheduled handler may orchestrate saved episodes and
  recent tracks sequentially under separate cursors/runs so one failure does not
  hide the other;
- serialize write-heavy Spotify operations per connection with a lease;
- never allow a metadata refresh to block committing playback evidence; and
- Connections reports each component's latest success, failure, and coverage.

### Catalog metadata acquisition

Recently Played supplies complete Track/Album/Artist objects for its bounded
window and should seed cache projections immediately. Historical export-only
tracks need exact-ID enrichment.

Before freezing the production client, rerun a credentialed, content-redacted
capability probe for the exact single-track endpoint with this app's current
development-mode status. Verify response nullability, relinking, unavailable
IDs, restriction/market behavior, attribution fields, `429` shape, and actual
quota behavior. Spotify's 2026 endpoint rules changed; documentation alone is
not enough.

Then:

- enrich exact original track IDs only; never search by title for automatic
  attachment;
- process a bounded resumable queue ordered by recent/lifetime relevance, while
  Tracks remains usable from export text;
- persist response bytes only for the approved cache lifetime;
- record unavailable/restricted outcomes and retry policy;
- refresh before expiry where practical and remove expired derived content;
- preserve `linked_from` separately;
- use provider image URLs directly at allowed sizes and never download artwork;
- visibly attribute every row/card/inspector using current Spotify content; and
- make partial Album/Artist coverage explicit rather than inventing name groups.

The current saved-track/saved-album snapshots may provide already-authorized
exact metadata in future, but this implementation must not import saved state
merely to accelerate rollups unless the cache ADR explicitly permits the use and
the snapshot remains semantically separate from membership.

### Deletion and unavailable behavior

- Extended Streaming History evidence is owner-provided immutable evidence and
  is never removed because a catalog lookup fails.
- Recently Played absence is not deletion.
- A provider unavailable/restricted response marks catalog state and retires
  prohibited cached content under policy; it does not remove Track membership.
- Expired Album/Artist relations derived solely from provider content disappear
  from current rollups only if policy requires it. Their prior identity and
  provenance remain minimally represented as the ADR permits; playback remains
  visible in Tracks with imported fallback text.
- Replay cannot resurrect deleted/expired provider content from an old API raw
  object.

## Contracts and API plan

Create `packages/contracts/src/songs.ts`, export it through the package index,
and validate both requests and responses.

### Shared query

```text
q?: string
period: all | year | last12months | range
from?: YYYY-MM-DD
to?: YYYY-MM-DD
timeZone: IANA zone
source?: export | recent_api       repeatable
account?: connection id           repeatable
playbackCount?: any | once | 2to9 | 10to49 | 50plus
metadata?: any | current | export_only | unavailable
sort
direction
limit 1..100
cursor?: opaque string
```

A custom range needs at least one bound. Reject reversed dates, invalid zones,
unknown connection IDs, relevance without search, and view-incompatible filters
or sorts.

### Collection endpoints

```text
GET /api/library/songs/tracks
GET /api/library/songs/albums
GET /api/library/songs/artists
```

Tracks adds repeatable exact `artist`, exact `album`, and `explicit` filters.
Albums adds exact `artist` and `albumType`. Artists adds no view-specific facet.

Track row contract:

```text
mediaItemId
spotifyTrack { id, uri, url }
displayTitle
importedTitle | null
artists[] { artistId | null, name, spotifyUri | null, order }
album { albumId | null, name, spotifyUri | null } | null
artwork { url, width?, height?, provider='spotify', expiresAt,
          attributionRequired=true } | null
durationMs | null
explicit | null
catalogState current | export_only | unavailable | expired
periodAggregate
lifetimeAggregate
referencePlayedAt | null
```

Album and Artist rows return stable internal projection IDs, exact Spotify
identity/link, current permitted display fields, metadata state, period/lifetime
aggregates, and their unique heard-track/release counts.

Every collection response returns:

```text
data
nextCursor
counts {
  songsTracksLifetime
  songsAlbumsResolvedLifetime
  songsArtistsResolvedLifetime
  filteredItems
  filteredUniqueTracks
  filteredPlaybackObservations
  filteredObservedMs
  filteredDurationBearingObservations
  filteredObservationsWithoutDuration
  tracksAwaitingAlbumIdentity
  tracksAwaitingArtistIdentity
}
smallFacets { sources, accounts, playbackCountBuckets,
              metadataStates, explicitStates?, albumTypes? }
coverage {
  lastCompleteExportImportedAt
  exportCoveredThrough
  lastRecentPollAt
  recentCheckpoint
  importState
  reconciliationState
  metadataCoverage
  possibleOverlap
  possibleRecentGap
}
resolvedPeriod { fromUtc, toExclusiveUtc, timeZone }
```

Rows, counts, facets, and aggregates use exactly the same active-occurrence and
view-identity predicates.

### Large filter options

```text
GET /api/library/songs/filter-options
```

Accept `view=tracks|albums`, `facet=artist|album`, all compatible filters except
the requested facet, optional option search, `limit <= 50`, and cursor. Return
stable identity, display label, self-excluding match count, selected/current
state, and next cursor. Never preload thousands of identities or emit name-only
pseudo-identities.

### Detail endpoints

```text
GET /api/library/songs/tracks/:mediaItemId
GET /api/library/songs/albums/:albumId
GET /api/library/songs/artists/:artistId
```

Accept active period/source/account context so Details aggregates match the
collection. Return the summary, all inspector facts, period/lifetime aggregates,
source/cache/coverage state, bounded top tracks/releases, total History count,
the first 50 History rows, and `historyNextCursor`.

A Track resolves even when catalog metadata is expired/unavailable. Album or
Artist returns 404 only when the exact grouping projection does not exist; GET
never creates a grouping.

### History endpoints

```text
GET /api/library/songs/tracks/:mediaItemId/history
GET /api/library/songs/albums/:albumId/history
GET /api/library/songs/artists/:artistId/history
```

Query fields:

```text
onlyMatchingPeriod=true|false
period/from/to/timeZone
source=export|recent_api             repeatable
account=<connection id>             repeatable
limit=1..100                         default 50
cursor
```

Rows return occurrence ID, representative instant, Track display/identity,
observed milliseconds or null, explicit skipped state or null, source set,
reconciled flag/version, evidence count, historical title facts,
`matchesCurrentPeriod`, and compact provenance. There is no threshold or
qualification field.

### Cursor design

Use signed or integrity-checked opaque versioned cursors bound to:

- endpoint/view;
- normalized search;
- resolved UTC period and timezone;
- every filter;
- sort and direction;
- schema/projection version; and
- complete stable sort tuple.

Reusing a cursor with another query returns `BAD_REQUEST`. A write invalidates
the loaded-page stack and restarts at page one; these are live queries, not
snapshot pagination.

### Repository query requirements

Create a dedicated `SongsRepository`. It should provide:

- list Tracks/Albums/Artists;
- exact counts and small facets using shared predicate builders;
- searchable exact Artist/Album filter options;
- Track/Album/Artist detail;
- Track/Album/Artist History;
- cache and coverage summaries;
- projection rebuild and generation publication; and
- explain-plan helpers used by performance tests.

Do not append Songs conditionals to the generic ledger repository or perform
aggregation in Hono handlers.

## Web implementation plan

### Routes and navigation

Add:

```text
/library/songs/tracks
/library/songs/albums
/library/songs/artists
```

Redirect `/library/songs` to Tracks. Enable Music in the shared sidebar and
breadcrumb without changing the disabled Podcasts/Videos state owned by their
parallel slices.

Canonical URL state:

```text
q
period=all|year|last12months|range
from
to
timeZone
source repeatable
account repeatable
playbackCount
metadata
artist repeatable                 Tracks/Albums
album repeatable                  Tracks
explicit                         Tracks
albumType                        Albums
sort
direction
item                             Track inspector
albumItem                        Album inspector
artistItem                       Artist inspector
```

Selection parameters are mutually exclusive. Presentation preferences such as
column widths, sidebar collapse, theme, and compact responsive choices remain
outside collection request keys.

### Query keys and page preservation

Collection query keys contain only normalized API-affecting state. They exclude
selected inspector item, inspector tab, sidebar state, column widths, and other
presentation state.

Use infinite-query page stacks with explicit Load more actions:

- Tracks: 100 rows per page;
- Albums: 48 cards per page;
- Artists: 100 rows per page;
- History: 50 rows per page; and
- filter options: at most 50 per page.

Opening/closing the inspector, changing its tab, or resizing columns must retain
loaded collection pages and scroll. Switching Music views retains only
compatible normalized state and uses each view's own cached page stack.

Back/Forward restores filters, sort, selection, loaded pages while cached, and a
stable scroll anchor. Refresh loads the first page and selected detail
independently. Deep-linked detail does not depend on the item appearing on page
one.

### Virtualization and interaction

- Virtualize the currently loaded Tracks and Artists stacks from the first
  release.
- Preserve semantic table/list accessibility despite virtualization.
- Use roving keyboard selection or equivalent predictable row navigation.
- Measure expanded/stacked row height rather than assuming a fixed height at
  narrow widths.
- Keep Albums bounded by explicit 48-card pages; measure before virtualizing.
- Virtualize loaded History rows if the stack grows beyond one page.
- Never automatically walk all pages.

Selecting a row/card pushes the appropriate URL selection. Closing uses
Back-equivalent behavior and restores focus to the trigger when present,
otherwise the results heading. Rapid selection aborts or ignores stale detail
responses.

### Loading and error states

| Condition                           | Presentation                                                         |
| ----------------------------------- | -------------------------------------------------------------------- |
| No supported activity               | `No song activity imported yet` plus Connections link                |
| No filter results                   | `No tracks/albums/artists match these filters` with clear action     |
| Export-only metadata                | Render imported identity/text and aggregates; omit exact group links |
| Missing art                         | Fixed neutral square; no layout shift                                |
| Expired metadata                    | Remove expired fields/art and explain state in Source                |
| Unavailable track                   | Preserve activity and mark Unavailable on Spotify in Details         |
| Incomplete import                   | Totals include processed records only; show progress                 |
| Later export pending reconciliation | Keep prior active generation and disclose pending import             |
| Failed/partial recent poll          | Keep existing activity/checkpoint and disclose possible gap          |
| Collection failure                  | Preserve shell/controls and show Songs could not be loaded + Retry   |
| Detail/History failure              | Preserve selection/collection and show local Retry/Close             |
| Selected object filtered out        | Keep inspector and show Not in current results                       |

Provider failures never hide owner-supported playback history.

### Accessibility and responsive behavior

- Use visible labels for every control and text alternatives for album art.
- Preserve focus rings and selected/focus distinctions in both Graphite modes.
- Make attributed Spotify links separate keyboard targets from row selection.
- Expose full truncated title/artist/album and exact playback instant to
  assistive technology.
- Announce result-count and loading changes without announcing every virtual row.
- Keep the adjacent desktop inspector at the accepted compact width; use the
  existing narrow-screen sheet behavior.
- Verify sidebar expanded/collapsed, inspector open/closed, long multi-artist
  credits, missing art, and high counts at compact desktop widths.

## Suggested code organization

```text
packages/domain/src/model.ts
  add source-specific song Archive admission reason

packages/connectors/spotify/src/
  ingest.ts                  complete export row classification
  recently-played.ts         page schemas and normalization
  tracks.ts                  Track/Album/Artist provider schemas
  retry.ts                   Spotify retry and Retry-After rules

packages/db/migrations/
  0015_songs_library.sql     expected after Podcasts; recheck before creation

packages/db/src/
  schema.ts
  songs-repository.ts
  songs-repository.test.ts

packages/contracts/src/
  songs.ts
  songs.test.ts
  index.ts

apps/api/src/
  spotify-import.ts          generalized complete-history continuations
  spotify-recent-sync.ts     recent playback polling/checkpoint
  spotify-catalog.ts         exact-ID cache acquisition/expiry
  spotify-sync.ts            per-component orchestration
  app.ts                     thin Music routes

apps/web/src/features/songs/
  songs-api.ts
  songs-route-search.ts
  songs-route-search.test.ts
  songs-collection-page.tsx
  tracks-table.tsx
  albums-grid.tsx
  artists-list.tsx
  songs-inspector.tsx
  songs-virtual-list.tsx
```

Exact file boundaries may follow adjacent features, but do not combine provider
acquisition, SQL aggregation, route handling, and React rendering in one module.

## Delivery sequence

### Stage 0: Lock baseline and policy

Tasks:

- record the immediate no-threshold playback rule in this plan and implementation
  tests;
- inventory current local migration/version state and Spotify raw imports;
- snapshot aggregate-only current podcast and source counts;
- review and extend the shared Spotify cache/attribution/no-AI ADR established by
  Podcasts;
- update Archive admission documentation for songs, adding a focused ADR only if
  architecture review requires one;
- rerun the content-redacted exact-track capability probe; and
- create sanitized large-scale fixtures with zero-duration, skipped, duplicate,
  multi-artist, relinked, unavailable, and API-only examples.

Exit criteria:

- no unresolved product semantics;
- provider cache rules are documented;
- capability gaps are operationally explicit; and
- existing podcast behavior has a regression baseline.

### Stage 1: Contracts and additive schema

Tasks:

- add the domain admission reason;
- add Music contracts and request validation;
- add forward-only song observation/occurrence/evidence, Track, Album, Artist,
  credit, cache, aggregate, FTS, and acquisition-state tables;
- add all constraints and indexes; and
- add migration tests from empty and current schema.

Exit criteria:

- migrations apply cleanly on empty and upgraded synthetic databases;
- contract examples round-trip; and
- no production route is enabled yet.

### Stage 2: Complete export parsing and replay

Tasks:

- bump the parser version;
- stream/classify every history row;
- create complete safe derived chunks;
- write source observations and counted occurrences in bounded commits;
- create track identity/media/archive membership/evidence;
- preserve existing podcast projection exactly;
- build affected lifetime aggregates and FTS; and
- expose continuation progress and failures.

Exit criteria:

- isolated real-data replay matches aggregate probe invariants;
- all identified song rows count, including zero and skipped rows;
- raw-object replay is idempotent;
- same-second and exact duplicate rows remain distinct; and
- the second replay changes no counts.

### Stage 3: Recently Played acquisition

Tasks:

- implement raw-page-first polling, duplicate ordinals, durable checkpoint,
  retry/rate-limit behavior, and possible-gap state;
- seed exact catalog cache from embedded Track objects;
- update occurrences, Archive membership, aggregates, and FTS atomically; and
- integrate explicit and scheduled Spotify sync reporting.

Exit criteria:

- overlapping polls do not recount the same bounded window;
- two identical events in one page retain multiplicity;
- API-only events count immediately with no invented duration;
- failures do not advance the checkpoint; and
- saved-episode sync remains independent and green.

### Stage 4: Repository and collection APIs

Tasks:

- implement shared predicates, period resolution, counts, facets, search, sorts,
  stable keyset cursors, and exact option search;
- implement Tracks, Albums, Artists, detail, and History endpoints;
- validate every response through contracts; and
- add query-plan/performance tests at realistic scale.

Exit criteria:

- counts/rows/facets agree for all tested combinations;
- period and lifetime aggregates remain distinct;
- no endpoint reads R2 or parses exports;
- no browse request performs per-row SQL; and
- cursors reject query mismatches.

### Stage 5: Catalog enrichment and rollups

Tasks:

- implement bounded exact-ID acquisition and cache expiry;
- preserve relinks and ordered track/album Artist credits;
- materialize exact Album/Artist relations and default aggregate sorts;
- expose unresolved coverage; and
- verify attribution/link behavior.

Exit criteria:

- Tracks remains complete using export fallbacks during failures;
- exact Album/Artist coverage improves without name merges;
- expired/unavailable cache removes no activity;
- provider content cannot enter AI retrieval; and
- rollup totals equal base-occurrence queries.

### Stage 6: Production Music UI

Tasks:

- enable sidebar/routes;
- implement normalized URL state and compatible view switching;
- build virtualized Tracks/Artists and paged Albums;
- add controls, counts, coverage disclosure, loading/empty/error states;
- preserve loaded pages independently from selection and presentation; and
- add attributed source links.

Exit criteria:

- real projected data renders in all three views;
- no unbounded browser activity load exists;
- Back/Forward, refresh, inspector open/close, and view switching preserve
  expected context; and
- keyboard navigation works through virtualized lists.

### Stage 7: Inspector and History

Tasks:

- implement Track/Album/Artist Details;
- add keyset-paginated, optionally period-matching History;
- implement exact Album/Artist cross-navigation and View all Tracks links;
- add source/cache/reconciliation disclosure; and
- protect against stale rapid-selection responses.

Exit criteria:

- complete retained history is reachable without one unbounded response;
- zero-duration, API-only, skipped, reconciled, and multi-evidence rows are
  represented factually;
- source-sensitive fields never leak; and
- Album/Artist inspection never creates canonical media items.

### Stage 8: Hardening and acceptance

Tasks:

- run all validation below after final edits;
- visually inspect real and synthetic edge states in both themes and responsive
  layouts;
- measure D1 query plans/response times at observed scale;
- exercise interrupted import, poll failure, auth expiry, rate limit, cache
  expiry, and projection rebuild;
- request an independent correctness review and fix accepted findings; and
- update all owning documentation and implementation status.

Exit criteria:

- every acceptance item is evidenced;
- no unresolved high-severity review finding remains;
- validation results are reported exactly; and
- remote deployment/migration remains a separate explicit owner action unless
  requested.

## Test strategy

### Connector and import

- classify song/podcast/audiobook/ambiguous/unidentified rows in precedence
  order;
- preserve all export song fields used by projection;
- count identified 0ms, sub-30-second, skipped, and long rows equally as
  observations while summing exact milliseconds;
- reject malformed track URIs without title-based recovery;
- preserve exact duplicate and same-second export rows;
- replay the same raw object/parser idempotently;
- resume after every bounded chunk boundary;
- retain prior successful processing when a later chunk fails;
- keep podcast Archive output stable under the new complete parser;
- ensure later exports await reconciliation instead of doubling live totals.

### Recently Played and catalog

- response bytes are stored before schema validation;
- overlapping polls retain maximum duplicate multiplicity;
- same-page duplicate pairs remain separate;
- API event admits Track/Archive immediately with null duration;
- `after` checkpoint advances only after complete commit;
- partial page, 401/403, 429, quota, 5xx, malformed response, and R2/D1 failures
  preserve the checkpoint and expose safe errors;
- Retry-After is honored within a bounded worker-safe policy;
- track object nullability and missing 2026 fields are accepted safely;
- exact lookup never falls back to title search;
- linked-from identity remains separate;
- cache expiry removes derived provider content but not export evidence;
- unavailable/restricted metadata leaves the Track browseable;
- provider content is rejected by any future AI-eligible retrieval boundary.

### Database and repository

- every occurrence has evidence and every Archive membership has admission
  evidence;
- latest Archive consumed instant moves forward only;
- unknown source instant remains null;
- multi-account activity remains separately filterable;
- date presets and custom ranges handle DST and inclusive end dates;
- source/account/period predicates produce correct period and lifetime values;
- zero-duration export rows count as duration-bearing with 0ms;
- API-only rows count without duration;
- a reconciled pair counts and sums duration once;
- possible overlap remains separately counted/disclosed until reconciled;
- multi-artist occurrences contribute once to each Artist but once to whole-view
  totals;
- exact Album/Artist IDs group correctly; same-name different IDs remain apart;
- imported names alone create no Album/Artist;
- FTS and exact identifier search return expected results;
- all sort directions place unknown values last and use deterministic ties;
- facets self-exclude and share all other predicates;
- counts match complete result sets across pagination;
- altered/tampered/query-mismatched cursors fail;
- detail and History work after metadata expiry;
- projection rebuild is deterministic and generation-atomic.

### Contracts and API

- valid queries parse and normalized defaults are stable;
- incompatible filters/sorts fail rather than disappear;
- range requires a bound; reversed date and invalid timezone fail;
- relevance requires search;
- page limits are bounded;
- all success and error responses validate;
- Track/Album/Artist 404 semantics are distinct and stable;
- no technical error includes raw payload, token, private title history, or
  provider credentials.

### Web and browser

- route parser normalizes compatible state on every view switch;
- Archive/Queue never appears for Music;
- selection/layout state is excluded from collection query keys;
- multiple loaded pages survive inspector open/close and presentation changes;
- switching views restores cached view pages where valid;
- Back/Forward and refresh restore normalized URL and selection;
- deep-linked detail loads without collection membership on page one;
- virtualized row keyboard navigation, focus restoration, and assistive labels
  work;
- rapid selection never renders stale detail under a new header;
- loading, empty, no-results, partial-coverage, provider-expired, error, and retry
  states are covered;
- Spotify attribution and outbound link validation are present only when
  required/current;
- screenshots cover long titles, many artists, missing art, very large counts,
  zero observed time, API-only duration gaps, and inspector open/closed.

### Migration and operational validation

- apply the full migration chain to an empty temporary database;
- apply the new migration to a synthetic copy at the current schema;
- run a bounded interrupted/resumed export import;
- run a full isolated retained-export replay and repeat replay;
- run a synthetic later-export reconciliation hold;
- run a successful and failed recent poll with fake credentials/responses;
- expire a cache generation and verify owner activity remains;
- rebuild occurrence, aggregate, grouping, and FTS projections independently.

## Performance budgets and guardrails

- Never parse the Spotify ZIP, derived manifest, or raw API page in a browse,
  detail, count, facet, or History request.
- Collection endpoints perform D1-only bounded queries and no per-row follow-up
  SQL.
- First and subsequent pages are capped at 100 Tracks/Artists or 48 Albums.
- History defaults to 50 and never exceeds 100.
- Large identity facets use searched option pagination capped at 50.
- The browser never downloads all 33k Tracks or 152k+ observations.
- Tracks and Artists virtualize all loaded pages; Albums remains DOM-bounded by
  explicit page size.
- Explicit Load more is the only path through collection and History pages;
  optional prefetch is limited to one next page.
- Selected-period aggregation and counts execute server-side with indexed
  predicates.
- Provider enrichment concurrency and retry are bounded; playback ingestion
  cannot wait on catalog enrichment.
- An import chunk stays below D1 statement/parameter and Worker CPU/memory limits
  based on measured write amplification, not the legacy 100-record assumption.
- Full rebuilds publish by generation and never expose half-updated aggregates or
  FTS.
- Image URLs use fixed dimensions and lazy loading without binary mirroring.

Use `EXPLAIN QUERY PLAN` against at least 35,000 synthetic Tracks and 160,000
observations for every default sort, combined source/date/account filter,
playback bucket, exact Album+Artist filter, search, detail History, and facet
option path. Measure local and deployed D1 before setting latency thresholds; do
not invent an unevidenced millisecond target.

## Observability and failure handling

Connections and sync runs must expose separately:

- Extended Streaming History import status, parser version, processed/total
  records, active generation, covered-through instant, and pending later export;
- Recently Played last attempt/success, checkpoint, acquired/count records,
  possible gap, and auth/rate-limit state;
- catalog enrichment attempted/resolved/unavailable/expired counts, queue depth,
  next retry, and provider quota state; and
- aggregate/search generation and rebuild status.

Safe error classes include authentication/reauthorization, rate limit/quota,
transient provider, malformed payload, raw storage, database commit, cache
expiry, reconciliation required, and internal validation. User-facing messages
stay actionable and never include raw content, tokens, IDs that reveal private
account information unnecessarily, or source payload excerpts.

Failure rules:

- raw acquisition can succeed while parsing fails; retain both statuses;
- a failed import chunk keeps the last committed continuation and active
  aggregate generation;
- a failed recent poll keeps its previous checkpoint;
- a failed catalog request never fails playback ingestion;
- a stale job reservation becomes retryable after its lease;
- every terminal failure remains visible with a safe retry path;
- authentication expiry sets `reauthorization_required` without deleting
  history; and
- no failure infers source removal or erases evidence.

## Rollout and recovery

1. Land additive domain/contracts/schema/API support with Music routes disabled.
2. Apply migrations to an isolated database and replay retained export evidence.
3. Compare aggregate invariants and idempotent replay before updating the active
   local projection.
4. Enable Track APIs and export-text UI first; they must not wait for catalog
   completion.
5. Enable Recently Played polling and verify checkpoint/gap behavior.
6. Enable exact metadata acquisition and publish Album/Artist rollups as coverage
   arrives.
7. Enable the production sidebar/routes only after direct API and browser
   acceptance.

Recovery is forward-only:

- disable Music routes or the current read-model generation if queries are
  incorrect;
- rebuild observations only from source records/raw objects under a new parser;
- rebuild occurrences/aggregates/search independently from observations;
- rebuild Album/Artist groupings from permitted current cache plus exact
  relations;
- keep prior complete generation active during failed rebuilds; and
- never recover by deleting owner ZIPs, source records, Archive evidence, or
  another media type's projections.

Before any remote migration or deployment, create the normal D1 recovery point,
verify R2 bindings and cache policy, and obtain the owner's explicit deployment
request. Local implementation does not imply production deployment.

## Documentation updates required at shipment

- `docs/sources/spotify.md`: production song parsing, no-threshold admission,
  recent polling, metadata capability probe, checkpoints, overlap/gap behavior,
  cache/attribution policy, and measured real aggregate results.
- `packages/connectors/spotify/README.md`: remove the statement that songs await
  a rule; document the complete parser and operational commands.
- `docs/architecture/README.md`: Music source projections, read models, and
  operational status.
- `docs/architecture/canonical-ledger.md`: song Archive membership plus detailed
  source-owned occurrences and timestamps.
- `docs/decisions/README.md` and the shared Spotify provider-cache ADR: extend
  the Podcasts decision for Music; add a separate song-admission ADR only if the
  existing source-specific decisions cannot represent the new rule cleanly.
- `docs/planning/library-phase-1-decisions.md`: replace provisional threshold
  language with the owner's accepted no-threshold immediate-admission rule.
- `docs/planning/library-phase-2-surfaces.md` and
  `docs/planning/research/music-phase-2-surfaces.md`: replace qualifying/
  30-second/excluded language, counts, History, and tests with playback-
  observation semantics.
- `docs/planning/library-implementation.md`: mark Music stage and measured gaps.
- `docs/planning/implementation-plan.md`: update Library progress.
- `docs/design/ui-foundation.md`: document production dense Music and
  virtualization conventions if they establish reusable UI behavior.
- `apps/api/README.md`, `apps/web/README.md`, and package READMEs: routes,
  commands, bindings, provider setup, and recovery behavior.

## Validation commands and evidence

After the final edit, run and report exactly:

```sh
pnpm check
pnpm build
pnpm test:e2e
```

Also run:

- full empty-database migration chain;
- current-schema upgrade migration;
- isolated real export replay and identical replay;
- relevant connector, repository, contract, API, and route-search tests;
- realistic-scale query-plan fixture;
- visual review in Graphite light/dark with expanded/collapsed sidebar and
  inspector open/closed; and
- independent code review followed by regression fixes and rerun validation.

Do not call a skipped script passed. Do not call visual review complete from DOM
inspection alone. Keep personal exports, payloads, tokens, and unsanitized
fixtures ignored and out of commits.

## Owner input and remaining gates

No product decision is required before implementation. The owner has already
settled the consequential behavior:

- Songs has no Queue;
- Tracks, Albums, and Artists are the Music views;
- identified playback activity is admitted immediately;
- there is no listening-duration threshold;
- every supported segment remains preserved; and
- Albums/Artists are exact-identity activity rollups, not saved/followed claims.

The following are implementation gates, not owner questions:

1. **Spotify exact-track capability recheck.** The current app/grant must prove
   the post-2026 endpoint behavior before catalog acquisition ships. Failure
   reduces Album/Artist coverage but does not block Tracks.
2. **Shared provider-cache ADR extension.** Extend the Spotify cache decision
   created for Podcasts with Music-specific Track/Album/Artist, relinking,
   artwork, Recently Played, retention, deletion, attribution, and no-AI rules
   before Music API catalog payloads become production state.
3. **Cross-source overlap rule.** Export/API observations remain separately
   counted and explicitly disclosed until a real overlapping export supports a
   deterministic reconciliation rule.
4. **Later lifetime-export overlap.** A second distinct owner export must be
   held from the active generation until overlap reconciliation is measured.

If any gate cannot be completed, ship the honest subset rather than asking the
owner to choose invented semantics: full export-backed Tracks remains valuable,
while current metadata and exact Album/Artist rollups can disclose partial
coverage.

## End-to-end acceptance checklist

- [ ] Every identified non-conflicting export song row is projected and counted,
      including 0ms, short, skipped, duplicate, and same-second rows.
- [ ] Every identified Recently Played event is admitted immediately and adds no
      invented observed duration.
- [ ] No duration threshold exists in schema, connector, repository, contract,
      copy, filters, or tests.
- [ ] Podcasts and audiobook/chapter rows do not leak into Music.
- [ ] Raw evidence is stored before parsing and replay is idempotent.
- [ ] One canonical song item exists per original Spotify track URI.
- [ ] One active Archive membership exists per connection/track with admission
      evidence and monotonic latest source time.
- [ ] Detailed occurrences remain source-owned and keyset-paginated.
- [ ] Overlapping recent polls do not inflate counts; same-page multiplicity is
      preserved.
- [ ] Possible export/API overlap and possible poll gaps are visible.
- [ ] A later lifetime export cannot silently double the active projection.
- [ ] Tracks, Albums, and Artists render from server-side queries over real
      projections.
- [ ] Name-only metadata never creates or merges Album/Artist identities.
- [ ] Multi-artist rollups and whole-view totals have correct non-additive
      semantics.
- [ ] Period/lifetime counts and observed time use the same occurrence predicates
      as rows and facets.
- [ ] Counts remain independent of loaded pages.
- [ ] Search, every filter/sort direction, unknown values, and exact identifiers
      have regression coverage.
- [ ] Cursors bind to complete normalized queries and reject mismatch/tampering.
- [ ] Browser requests and rendering are bounded at realistic scale.
- [ ] Loaded pages survive inspection, layout/presentation changes, and browser
      navigation.
- [ ] Track/Album/Artist inspection and full paginated History are available.
- [ ] Provider expiry/unavailability removes no owner playback evidence.
- [ ] Attribution/link and no-AI provider boundaries are enforced.
- [ ] Incomplete import, poll failure, auth expiry, quota, cache expiry, empty,
      no-results, and retry states are usable.
- [ ] Sensitive raw source fields never reach browse APIs or UI.
- [ ] Existing Spotify podcast tests and behavior remain green.
- [ ] Empty and upgrade migrations, realistic-scale query plans, check, build,
      E2E, and visual QA pass after final edits.
- [ ] Owning documentation reflects shipped behavior and measured limitations.
- [ ] An independent final review has no unresolved correctness finding.

## Ready-to-copy implementation brief

> Implement `docs/planning/music-implementation.md` end to end. Begin by extending
> the shared Spotify cache/attribution/no-AI ADR created for Podcasts and recording
> the song-specific Archive admission rule in the owning architecture docs,
> adding a focused ADR only if the existing decisions cannot represent it.
> Reparse retained Extended Streaming History evidence so every identified,
> non-conflicting song row is preserved and counted immediately—there is no
> duration threshold, including for zero-duration or skipped rows. Add best-effort
> Recently Played polling with raw-page-first storage, overlap-safe checkpoints,
> and no invented duration. Keep one canonical song item/Archive membership per
> original Spotify track URI and detailed source-owned occurrences for counts,
> observed time, period filtering, and keyset-paginated History. Build exact-
> identity, expiring Spotify metadata and Album/Artist rollups without title/name
> merges, and let export-backed Tracks work when enrichment is unavailable.
> Implement bounded server-side Tracks, Albums, Artists, detail, History, facets,
> search, sorts, aggregates, opaque cursors, virtualized production UI, URL state,
> loaded-page preservation, attribution, and failure/coverage disclosures. Keep
> Songs Queue, saved/followed relationships, MusicBrainz, lyrics/audio, AI use,
> and remote deployment out of scope. Preserve all raw evidence and existing
> podcast behavior. Use sanitized fixtures, validate at observed scale, run the
> full migration/check/build/E2E/visual matrix after final edits, request an
> independent review, fix accepted findings, and report exact results and
> remaining external limitations.
