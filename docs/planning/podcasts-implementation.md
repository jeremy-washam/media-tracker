# Podcasts end-to-end implementation plan

- Status: Initial production implementation complete; remaining hardening is listed below
- Date: 2026-09-20
- Scope: Spotify- and Reader-backed Library > Podcasts Archive, Queue, Following,
  episode/show inspectors, and best-effort current-player evidence

Current presentation (reviewed 2026-10-12) follows the
[UI foundation](../design/ui-foundation.md). Archive and Queue use rows; Following
supports list/grid with shared saved and explicit URL preferences. The
pre-implementation assessment and delivery stages below are September snapshots,
not the current route inventory. Hosted deployment remains pending.

The catalog-expiry design language retained later in this historical plan is
superseded for the private deployment by [ADR 0014](../decisions/0014-spotify-catalog-retention-interim.md).
The owner chose indefinite Spotify API catalog retention despite the documented
terms risk. The current exact-ID backfill runs as a bounded, resumable queue job.

## Purpose

This document turns the owner-approved
[Podcasts Phase 2 surface specification](research/podcasts-phase-2-surfaces.md)
into an execution-ready plan for the existing Imladris architecture. It covers
the complete path from Spotify Extended Streaming History, saved-library and
current-player observations, and eligible Reader records through durable source
projections, Archive and Queue reconciliation, search, REST contracts, the
production Index interface, recovery, and visual acceptance.

It is an implementation plan, not a new product-design round. The accepted
Archive, Queue, Following, row/card fields, filters, sorts, Details/History
inspector, and read-only boundary remain authoritative. Implementation may tune
spacing and responsive behavior against production data, but it must not expose
extra Spotify fields merely because the API returns them.

The plan is based on the credentialed 2026-09-19 Spotify inventory, the retained
owner Extended Streaming History aggregates, the current connector and schema,
and the shipped Books, Movies, and Articles patterns. A fresh provider-policy
and endpoint smoke check is still required immediately before implementation
because Spotify access and retention rules are time-sensitive.

## Implementation status (2026-09-21)

The current change set ships the usable end-to-end Podcasts slice: replay-safe
Extended Streaming History projection, live saved-episode and saved-show
snapshots, current-player polling, Archive/Queue/Following projections,
Reader-Archive inclusion, bounded collection/detail/history APIs, URL-backed
filters and sorts, production routes, inspectors, and browser regression
coverage. Optional Spotify reads have independent failure boundaries and expose
partial failures without discarding retained state. Exact Spotify show IDs are
normalized across episodes and Following so show filters and rollups join
correctly.

Reader podcast records appear in Archive and retain Reader history. An exact
Spotify episode URL merges onto an already-known Spotify episode during a
Reader sync; a Reader-first record is repaired on the next Reader sync after the
Spotify identity becomes known.

The 2026-09-21 hardening pass added query-bound value/keyset pagination,
ranked FTS for episode search, independent durable saved-show/player checkpoints,
full Details/History tabs, show cross-links, focus restoration, and visible
checkpoint coverage when a saved-library scan has not completed. A regression
test caught and fixed a first implementation of the checkpoints that tried to
commit them while their sync run was still running; optional cursors now commit
only after the parent run succeeds. Publication display preserves year/month
precision rather than inventing a day.
The same pass now exposes counted, searchable, self-excluding Show facets for
Archive/Queue and Publisher/Language facets for Following. Their multi-select
choices are URL-backed and their options are paginated over the full matching
collection, not just loaded rows. The existing Following and Library-episodes
predicates remain available alongside them.

The following hardening still remains beyond the current slice:

- add scheduled, rate-aware episode/show metadata refresh and
  provider-availability transitions, replacing or removing superseded Spotify
  API content under a documented finite cache lifecycle without removing owner
  listening evidence; and
- finish bounded show-observation diagnostics, virtualized long lists, richer
  export/player coverage banners, and provider-policy retention/attribution
  enforcement. Following search remains a small-set LIKE query; episode search
  uses ranked FTS.

These are explicit follow-ups, not silently claimed shipped behavior. The raw
evidence, canonical membership, Queue rule, real collection routes, and current
product-visible fields are implemented now.

## Outcome

After this plan is complete, Podcasts will provide:

- Archive with one row per canonical episode admitted by any positive Spotify
  playback evidence or an eligible Reader Archive occurrence;
- Queue with current saved Spotify episodes that have a usable identity,
  explicit zero resume position, and no positive Spotify evidence anywhere;
- Following with one card per currently saved Spotify show, without expanding
  its catalog into Queue;
- compact episode rows and a square-art Following grid in the production Index
  shell;
- server-side search, exact filters/facets, mode-specific sorts, complete counts,
  aggregate observed time, and keyset pagination;
- episode and show inspectors with separate Details and History tabs;
- lifetime and selected-range observed listening totals derived only from
  positive export segments, never inferred sessions or play counts;
- hourly and explicit-sync saved-episode, saved-show, and current-player
  reconciliation with independent failure boundaries;
- best-effort current-player admission without a fabricated consumption date or
  observed duration;
- retained Reader Podcast Archive relationships, merged with Spotify episodes
  only when an authoritative Spotify episode identity is present;
- refreshable, attributed Spotify episode/show metadata that can expire without
  hiding local history;
- idempotent replay of exports and API pages, complete-snapshot retirement, and
  observable partial failures; and
- useful degraded behavior when Spotify authorization, catalog metadata,
  artwork, playback polling, or a recent export is unavailable.

The Podcast Library must remain useful from retained titles, show assertions,
relationships, and history alone. Catalog enrichment improves presentation but
does not control Archive membership or erase evidence when it expires.

## Scope

### Included

- Every identified podcast segment in imported Spotify Extended Streaming
  History, including zero-duration observations and ambiguous duplicate rows.
- One Spotify Archive relationship per episode URI when any retained evidence
  is positive.
- Complete saved-episode snapshots from `GET /me/episodes`, including active
  membership, saved date, positive/zero/null progress, `fully_played`, usable or
  unresolved identity, and observation lineage.
- Complete saved-show snapshots from `GET /me/shows`, including current
  Following membership and saved date.
- `GET /me/player` polling during hourly reconciliation and explicit Sync now
  when the grant permits it.
- Exact-ID episode and show enrichment needed for approved optional fields,
  performed asynchronously and governed by an expiring provider cache.
- Reader documents whose category is Podcast and whose location supplies an
  eligible Reader Archive occurrence.
- An exact, validated Spotify episode URL/URI crosswalk from Reader when one is
  present; otherwise independent Reader identity.
- Generic source-derived `queue_entries` as a provenance-bearing read model for
  the accepted Spotify Queue rule.
- Source-owned saved-state, progress, playback, show, cache, and aggregate
  projections in D1.
- Podcast-specific collection, episode detail/history, show detail/history, and
  optional bounded observation APIs.
- Production Archive, Queue, and Following routes with URL-backed query state,
  compact inspector, loading/degraded/error states, and Spotify attribution.
- Connection coverage, current-player capability, unresolved-row count, last
  export, and last successful snapshot/poll status.
- Replay, parser-version migration, fresh/upgrade migration coverage, query-plan
  checks, browser tests, and visual QA using synthetic fixtures plus bounded
  ignored owner data.

### Excluded

- Podcast playback, previews, downloads, or a Now Playing surface.
- Mark played/unplayed, save/remove episode, follow/unfollow show, manual Queue
  editing, Spotify write-back, or local/upstream conflict resolution.
- Treating every episode of a followed show as Queue.
- Full followed-show catalog ingestion solely to compute unheard counts, newest
  episodes, or “up to date” status.
- Inferring listening sessions, completions, relistens, or “times played” from
  Spotify segments.
- Podcast ratings, reviews, notes, generated summaries, recommendations,
  embeddings, or Chat use of Spotify API content.
- Podcast transcript acquisition. Publisher RSS `podcast:transcript`, Taddy,
  and other transcript paths remain a separate content project.
- Podcast Index, Taddy, Apple, or title-based cross-catalog matching in this
  slice. Spotify-native identities are sufficient for the current collection;
  public-feed matching requires its own measured, reviewable crosswalk.
- Spotify audiobook export rows with explicit audiobook/chapter identities.
  Their retained rows remain outside Podcasts pending a Books-domain identity
  and admission decision. This does not cover audiobook-shaped objects that
  Spotify itself returns from `/me/shows` without a media-kind discriminator;
  those remain exact saved-show assertions in Following rather than being
  removed by an unverified heuristic.
- Songs, recently played tracks, saved tracks/albums, and followed artists.
- Provider-device, IP, country, platform, private-session, playback context,
  volume, shuffle/repeat, and other sensitive or irrelevant fields in ordinary
  projections or UI.
- A generalized replay/export CLI, recommendations, Recaps, Chat, or mobile UI.

## Accepted product behavior

### Collections and membership

Podcasts has exactly three local views:

1. **Archive** — one canonical episode per row. An episode qualifies when any
   Spotify export segment has `ms_played > 0`, any retained saved/lookup/show-
   scan progress is positive, `fully_played=true`, current-player progress is
   positive, or an eligible Reader document supplies an Archive occurrence.
2. **Queue** — one saved Spotify episode per row when its identity is usable,
   its latest saved-library observation is active and explicitly zero, it is not
   marked fully played, and no positive Spotify evidence exists in any retained
   channel.
3. **Following** — one active saved Spotify show per card.

Archive and Queue browse episodes. Following browses shows. Archive and the
saved-episode relationship may overlap, but Archive and Queue cannot overlap
under the accepted positive-evidence rule. Following is independent from both.

A later zero never reverses positive history. Null/missing position is not zero.
An unavailable saved row with no usable identity remains an unresolved source
observation and contributes only to coverage diagnostics. Removing a saved
episode or show retires the current relationship only after a successful complete
account-scoped snapshot; it never deletes Archive history or raw evidence.

Reader Inbox, Later, Shortlist, and Feed do not populate Podcast Queue or
Following. Reader Archive can admit a Podcast episode independently of Spotify.

### Spotify listening semantics

- A positive export segment is source-supported playback activity. Its `ts` is
  a segment-end instant, not an episode completion or session boundary.
- Positive resume state, `fully_played=true`, and positive current-player
  progress establish consumption but do not supply a consumption timestamp.
- Resume/current-player position is a position, not observed listening time.
- Observed listening time sums positive owner-export `ms_played` only.
- Zero-duration rows remain retained evidence but add no observed time and do not
  admit an episode.
- Duplicate-looking source rows remain distinct until measured overlapping
  exports establish a deterministic reconciliation rule.
- One Spotify Archive occurrence exists per episode and uses the latest positive
  export timestamp monotonically. API-only admission stays undated.
- Reader Archive occurrences remain separate supported relationships in History.
- No segment count is labeled as plays, listens, or relistens.

### Collection presentation

Archive and Queue use compact rows only; there is no grid/list toggle. Each row
uses 3.5–4rem square artwork, a flexible title/show column, a duration or
observed-time column, a mode-specific date, and a quiet availability state only
when relevant. At narrower desktop widths, secondary columns stack beneath the
identity instead of disappearing.

Archive rows show, in order:

1. permitted episode/show artwork with Reader/local fallback;
2. episode title;
3. show name;
4. latest activity matching the active activity-date predicate, otherwise the
   latest supported activity overall;
5. selected-range or lifetime Spotify observed time;
6. episode duration; and
7. Restricted, Unavailable, or Availability unknown when applicable.

Queue rows show artwork, episode title, show name, **Saved in Spotify** date,
publication date, duration, and non-available state. They never display 0%,
Unplayed, or Not started.

Following uses approximately 10–11rem square show cards with artwork, show name,
publisher, **Saved in Spotify** date, catalog episode count, and non-available
state. It never displays an invented unheard count, newest episode, progress, or
“up to date” state.

Artwork fallback is current permitted Spotify episode art, current permitted
exact-show art, Reader art, permitted retained historical art, then a local
neutral placeholder. Expired governed art is not displayed. Spotify art and
metadata include visible attribution and a working Spotify link.

### Search

Search is server-side, case-insensitive, Unicode-normalized, token-AND, and
final-token prefix capable.

- Archive/Queue rank episode title, current show name, retained export/Reader
  episode title, retained export/Reader show name, then current publisher joined
  through exact show identity.
- Following ranks show name, then publisher.
- Descriptions, raw HTML, playback reasons, internal IDs, raw payloads, and
  provenance are not collection search targets.
- Relevance is the default only while a nonempty search is active. Clearing
  search restores the mode default unless another valid sort was explicitly
  selected.

Placeholders are **Search episodes or shows** and **Search followed shows**.

### Filters

All predicates, facet values, and counts are server-side over the complete
matching collection. Values within a facet use OR; facets combine with AND.

| View      | Filters                                                                       |
| --------- | ----------------------------------------------------------------------------- |
| Archive   | Activity date/unknown; Show; Following state; Published; Duration             |
| Queue     | Saved date/unknown; Show; Following state; Published; Duration                |
| Following | Saved date/unknown; Publisher; Language; Library episodes: Archive/Queue/none |

Activity date matches any qualifying positive export segment or Reader Archive
occurrence. Undated API/player admission matches only Date unavailable. Row date
and activity sort are selected from the matching evidence set; inspection still
returns complete history.

Published year/month/day values are intervals. A filter range matches when the
source interval intersects it; storage never fabricates missing month/day.
Owner-timezone boundaries apply to instants. Unknown values are explicit and
sort last in both directions.

Duration buckets are Under 30 min, 30–59 min, 1–2 hr, Over 2 hr, and Duration
unavailable. Exactly 120 minutes remains in 1–2 hr.

The Show facet uses exact Spotify show identity. A historical show-name assertion
without show ID belongs under Show identity unavailable and never powers a join.
Facet counts apply every active predicate except their own facet. Selected
retired facet values remain visible and clearable.

### Sorting

| View      | Default              | Additional sorts                                |
| --------- | -------------------- | ----------------------------------------------- |
| Archive   | Activity date—newest | Observed time, Published, Duration, Title, Show |
| Queue     | Saved date—newest    | Published, Duration, Title, Show                |
| Following | Saved date—newest    | Show, Publisher, Episode count                  |

Every sortable field supports the directions accepted by the surface contract:
Newest/Oldest for dates, Most/Least for observed time and episode count,
Shortest/Longest for duration, and A–Z/Z–A for text. Normalized title/show and
stable item ID are deterministic ties. Relevance has only Best match.

### Counts

- Mode badges are unfiltered distinct counts: Archive episodes, valid Queue
  episodes, and active saved shows.
- Archive filtered headers show **N episodes · Hh Mm observed on Spotify** when
  matching positive export duration exists.
- Archive responses also retain supported relationship count, positive playback
  observation count, observed milliseconds, undated-only episode count, and
  source totals.
- Queue and Following headers show filtered item counts.
- `unresolvedSavedEpisodeCount` is separate from Queue count and may link to
  Connections.
- Counts, rows, facets, and aggregate time use the same predicates.

### Episode inspector

The fixed header contains artwork, title, show name, independent Archive, Queue,
Saved episode, and Followed show relationships, plus validated Spotify/Reader
links. It has no playback or write controls.

Details sections appear in this order and are omitted when empty:

1. **Listening** — Archive sources, lifetime Spotify observed time and playback
   observation count, first/latest dated positive segment, current resume or
   fully-played state and observation time, saved membership/date, and export
   coverage warning.
2. **Episode** — safe refreshable description, publication date/precision,
   duration, explicit flag, languages, externally hosted state, and current
   availability/restriction/check time.
3. **Show** — exact show identity and refreshable metadata, Following state/date,
   and exact-show Archive/Queue links.
4. **Reader** — current Reader relationship, links, useful source metadata, and
   retained Archive temporal value/basis.
5. **Source** — collapsed identities, connection/coverage, last snapshots/poll/
   export, catalog expiry state, attribution, and historical assertions.

History begins with the Spotify aggregate summary and then returns one Spotify
playback relationship, each Reader Archive occurrence, and current Spotify state
as distinct concepts. It never emits inferred sessions. The initial product
defers the optional raw playback-observation disclosure; the bounded endpoint
may ship behind the collapsed technical disclosure later without changing the
ordinary History contract.

### Show inspector

The header contains show artwork, name, publisher, Following, and a validated
Spotify link. Details contains Following, About, In your Library, Availability,
and Source. Library counts join only by exact show identity. History shows saved
date, first/latest successful observations, active/removed state, and safe
provenance; it never lists the full catalog.

### Canonical URLs and preserved state

```text
/library/podcasts/archive
/library/podcasts/queue
/library/podcasts/following
```

The URL carries accepted query/filter/sort state plus typed selection:

```text
item=episode:<canonical-media-item-id>
item=show:<podcast-show-projection-id>
```

Opening inspection pushes history. Closing removes only `item`, so Back closes
before leaving the collection and Forward reopens. Query state, loaded pages,
selection, collection scroll, and inspector scroll survive Back/Forward and
presentation-only changes. Mode-specific query state is remembered
independently. Sidebar/appearance preferences remain outside Library query state.

## Pre-implementation assessment

### Verified owner-source evidence

The retained 2026-09-19 research established:

- Extended Streaming History contained 6,416 podcast segments for 2,600 episode
  identities; 5,921 positive segments admitted 2,443 unique episodes and totaled
  1,543.6 source-reported hours, including ambiguous source duplicates.
- The latest connector README records 111 saved rows: 32 with positive current
  state, 41 with explicit zero, and 38 unresolved/unavailable. The immediately
  preceding live inventory had 110 rows and proved three apparent current-zero
  episodes had positive export history. Stage 0 must remeasure the current
  snapshot rather than freeze either count as product truth.
- Forty saved shows were returned during the field inventory.
- Spotify's saved-shows response identifies every returned object as a `show`
  and provides no media-kind discriminator. The real response includes some
  commercial audiobook-shaped entries (for example, descriptions naming an
  author and narrator) with canonical `/show/` URLs. Following therefore keeps
  those exact saved-show assertions instead of guessing from titles or
  descriptions; separating them requires a future authoritative crosswalk or
  an explicit heuristic product rule.
- A real `GET /me/player` call succeeded with `204 No Content`, proving endpoint
  and scope availability without proving an active payload shape on that call.
- The export has no trustworthy session ID, and exact duplicate rows cannot be
  safely discarded.
- The current grant already includes `user-library-read`,
  `user-read-playback-position`, and `user-read-playback-state`.

These aggregates are evidence for shape and scale, not committed fixtures.

### Current Spotify connector and sync

Implemented now:

- Extended Streaming History ZIP retention in private R2;
- bounded 100-segment resumable import using a derived podcast manifest;
- `spotify-extended-history@3` normalization;
- one canonical Spotify episode item and Archive occurrence per positive episode;
- monotonic latest positive Archive date;
- exact saved-episode API page retention before parsing;
- `spotify-saved-episodes@1` pagination and positive/zero/null classification;
- Archive admission from positive resume or `fully_played` state;
- encrypted rotating refresh tokens with a short database refresh lease;
- hourly and explicit saved-episode sync; and
- safe sync/import responses and operational logs.

Missing or insufficient for the approved surface:

- export playback rows are source records but not queryable playback observations;
  observed time, segment ranges, safe reasons, and per-episode aggregates cannot
  be served without replay;
- saved zero candidates are counted but not persisted as Queue relationships;
- saved membership, progress observations, and snapshot-removal state are not
  queryable;
- saved shows and Following are not acquired;
- current playback is not polled;
- API positive history is not retained as an observation sequence, so a later
  zero can lose detail even though Archive remains;
- API catalog metadata is written directly into canonical `media_items` without
  a provider-specific expiry/deletion boundary;
- source records use non-deterministic IDs during saved scans, which is not a
  sufficient parser-replay identity;
- one saved-episode page is committed and normalized row-by-row, but no complete
  snapshot finalization retires absent membership safely;
- authorization issue/deadline state and `invalid_grant ->
reauthorization_required` are not implemented; and
- optional exact-ID catalog enrichment has no durable job, retry, cache, or
  attribution lifecycle.

### Current database and API

The canonical ledger already supplies media items, global Spotify episode
identities, source records, Archive entries/evidence, sync runs/cursors, generic
Queue entries/evidence, and encrypted connection credentials. It does not yet
have Spotify podcast source projections, shows, playback/progress observations,
listening aggregates, a Podcast read model/search index, Podcast contracts, or
Podcast Library routes.

The existing generic `GET /api/media` is intentionally summary-only. Podcast
details, facets, coverage, and history need media-specific endpoints like the
shipped Books, Movies, and Articles slices.

Migration 0013 is current at plan time. Under the accepted implementation order
of Podcasts, then Music, then Videos, migration **0014 is reserved for the
Podcasts foundation**. Recheck the migration directory immediately before
implementation in case earlier prerequisite work changed the sequence, but do
not let the later Music or Videos slices claim 0014 or implement their migrations
concurrently with this slice.

### Current web application

The production shell, Graphite light/dark tokens, responsive compact inspector,
URL-backed Library routing, TanStack Query pagination patterns, and shared error/
empty/loading conventions are shipped. Books, Movies, and Articles are enabled;
Podcasts is still disabled navigation.

The saved Podcast review artifact supplies production guidance but is not a
component library. Production should reuse shell primitives and accepted visual
rules while implementing Podcast-specific rows, Following cards, filters, and
episode/show inspectors.

## Recommended architecture

Use the established pipeline:

```text
Spotify export / saved episodes / saved shows / current player / Reader
  -> exact raw evidence or policy-bounded acquisition record
  -> deterministic source records
  -> source-owned podcast projections
  -> canonical identities + Archive / generic Queue materialization
  -> rebuildable Podcast collection/search read models
  -> media-specific REST contracts
  -> React Podcast collection and inspector
```

No collection/detail request calls Spotify, reads an export ZIP, parses raw R2
pages, or reconstructs aggregates in application memory.

### Ownership boundaries

- `packages/connectors/spotify` owns schemas, pagination, rate-limit semantics,
  export parsing, saved/player normalization, and provider error classification.
- `packages/connectors/readwise` owns Reader category and exact URL/identity
  extraction rules.
- `packages/domain` retains only pure cross-source types and normalization rules;
  do not add Cloudflare, SQL, Hono, or React dependencies.
- `packages/db` owns Spotify podcast source projections, Queue materialization,
  Podcast read models, SQL predicates, facets, cursors, and rebuilds.
- `apps/api` owns orchestration, D1/R2/Queue bindings, token lifecycle, REST,
  cron/manual sync, structured logs, and provider-cache cleanup scheduling.
- `packages/contracts` owns Podcast request/response and queue-message schemas.
- `apps/web` owns route normalization, query caching, rows/cards, filters,
  inspector state, safe links, and attribution presentation.

Hono handlers remain thin: validate, call a service/repository, validate the
response, and translate typed errors.

### Truth layers

Keep these concepts separate:

1. **Immutable owner evidence** — Extended Streaming History ZIPs, their exact
   segment positions, and Reader raw pages/source records.
2. **Current personal relationships** — saved episode/show snapshots, progress
   observations, player observations, and their complete-snapshot lifecycle.
3. **Canonical ledger** — episode items/identities and supported Archive
   occurrences/evidence.
4. **Source-derived Queue** — rebuildable current product membership derived
   from active saved state plus a global positive-evidence anti-join.
5. **Governed Spotify catalog cache** — refreshable descriptive metadata and
   artwork that can expire/delete independently.
6. **Podcast read model** — rebuildable collection/search/facet accelerators.

None may overwrite another. In particular, expired catalog content cannot erase
owner history, and a Queue projection cannot become evidence that an episode was
never played.

### Queue architecture

Use generic `queue_entries` and `queue_entry_evidence` for the visible Queue,
with one membership key per connection and Spotify episode URI, for example:

```text
sourceMembershipKey = spotify:saved-episode:<episode-uri>
relationshipType    = spotify_saved_episode_unplayed
```

The source-owned saved-episode row remains authoritative for active save,
`added_at`, and latest zero/null/positive state. Queue materialization is active
only when the full accepted predicate is true. Positive export/progress/player
evidence retires the Queue projection while leaving saved membership active.
Complete-snapshot absence retires both saved state and Queue; partial/failed
scans retire neither. The evidence link identifies whether qualification changed
because of saved membership, positive playback, or complete-snapshot removal.

This fits ADR 0011: Queue remains read-only, source-derived, connection-scoped,
and distinct from Archive. No new local desired-state model is added.

### Episode, show, and Reader identity

- `spotify:episode:{id}` is a global episode identity.
- `spotify:show:{id}` is a source-owned show identity, not a media item.
- A saved/export episode joins a show only through exact embedded show ID/URI.
- Export show-name text without a show ID remains an assertion, never a join key.
- A Reader document retains its connection-scoped `document_id` identity.
- Extract a Spotify episode identity from Reader only when a validated URL is
  exactly an `open.spotify.com/episode/{id}` form or an explicit Spotify episode
  URI. Reject userinfo, lookalike hosts, non-episode paths, malformed IDs, and
  tracking text.
- When that authoritative identity already exists, attach the Reader identity
  and occurrence to the same media item. Otherwise keep the Reader item separate.
- Repair existing split Reader/Spotify items only under that exact rule. Reassign
  identities/occurrences without deleting source records or evidence; never
  merge by title, show name, description, or artwork.

One canonical episode may therefore have one Spotify relationship and multiple
Reader Archive occurrences. Collection grouping is by media item; History keeps
each supported relationship.

### Spotify catalog cache decision

Before new enrichment ships, add the next ADR defining a narrow exception to
immutable raw retention for governed Web API catalog content:

- owner export and minimal personal relationship facts remain durable evidence;
- full Spotify Web API catalog bodies are retained only for the documented
  operational refresh/retry window, then deleted or tombstoned under a versioned
  policy;
- durable fields outside the cache are restricted to identifiers, personal
  saved/progress/playback facts, source timestamps, checksums, outcomes, and
  provenance permitted by current policy;
- descriptive metadata/artwork lives in episode/show cache rows with acquisition,
  market, expiry, deletion, and outcome state;
- cache expiry removes governed descriptions, artwork, search terms, and display
  fields atomically before exposing the new projection version;
- replaying an old API page cannot resurrect expired/deleted catalog content;
- every Spotify display provides attribution and a validated item link; and
- Spotify API content is excluded from LLM prompts, embeddings, training,
  generated summaries, and AI retrieval.

Stage 0 must reverify the current Spotify Terms, Developer Policy, design rules,
app quota mode, endpoint access, and whether a numeric cache limit exists. Use
the strictest current requirement rather than inventing permanent rights. This
is an architecture/compliance record, not a new visible product choice.

This ADR and its cache/job/cleanup boundary are shared Spotify infrastructure.
Podcasts introduces them first; the later Music implementation must reuse and,
where track/album/artist requirements demand it, explicitly extend the same
policy and primitives. Music must not create a competing Spotify cache, expiry
policy, attribution implementation, or AI-exclusion boundary.

## Database and migration plan

Reserve `0014_podcasts_library.sql` as the forward-only Podcasts foundation under
the accepted Podcasts -> Music -> Videos implementation order. Recheck the
actual last applied and checked-in migration immediately before coding; if an
earlier prerequisite has legitimately changed the sequence, reconcile the plan
and filenames before any migration is applied. Add a follow-up migration instead
of editing 0014 once applied. Update Drizzle in the same change. Test an empty
database and upgrade from the actual preceding schema.

### `spotify_podcast_episodes`

One durable source-owned row per global Spotify episode URI:

- row ID, media-item ID, external-identity ID, parsed Spotify episode ID/URI;
- latest retained owner-export title and show-name assertions plus normalized
  sort/search values;
- current exact show-link ID when known;
- canonical Spotify link derived and validated from identity;
- first/last observation source-record IDs and instants;
- active/retired identity state; and
- projection/parser version.

This table contains durable owner assertions and identity, not governed
description/artwork copied from the Web API.

### `spotify_podcast_shows` and episode-show links

`spotify_podcast_shows` stores stable show ID/URI, canonical source link,
first/last observation lineage, active/retired identity state, and projection
version. `spotify_episode_shows` stores exact episode/show relationship,
observation lineage, first/last observed time, and upstream state.

Mutable embedded metadata never destroys a prior exact link. A later changed
show association is represented as retirement plus a new link, not title-based
rewriting.

### Saved episode and saved show state

`spotify_saved_episodes` has one row per `(connection_id, episode_uri)`:

- canonical media item and episode identity;
- active/removed/unknown membership;
- `added_at` as an instant, never consumption;
- latest resume value class (`positive`, `zero`, `null`) and raw milliseconds;
- latest `fully_played` value;
- latest observation time/source record;
- first observation, last active observation, removal observation;
- last complete snapshot run/version; and
- unresolved/catalog-availability disposition.

Unusable null-identity rows cannot use this key. Preserve them in source records
and projection-state unresolved counts; optionally add a separate bounded
`spotify_unresolved_saved_episodes` diagnostic table keyed by source record if
Connections needs row-level recovery.

`spotify_saved_shows` has one row per `(connection_id, show_id)` with equivalent
membership, added time, observation, retirement, snapshot, and lineage fields.

### Progress observations

`spotify_episode_progress_observations` preserves every accepted saved-episode,
episode-lookup, show-scan, and current-player observation:

- deterministic observation ID and source record;
- connection, episode URI/media item, and channel;
- position milliseconds and exact zero/null/positive classification;
- nullable `fully_played`;
- nullable player state-change timestamp;
- local observed time;
- positive-evidence boolean and safe disposition; and
- parser version.

Observation time is provenance, not consumption. Device/context fields remain
raw and are not projected.

### Playback observations and aggregates

`spotify_podcast_playback_observations` stores every export podcast segment:

- deterministic ID from raw object, member path/index, and parser version;
- source-record ID, connection, episode URI/media item when identified;
- source `ts` instant;
- exact nonnegative `ms_played`;
- positive/zero classification;
- safe open `reason_start` and `reason_end` strings;
- nullable skipped flag;
- raw member/path/index lineage; and
- parser version.

Do not project platform, IP, country, user agent, offline/private state, or
account identifiers into this table.

`podcast_listening_aggregates` is one row per `(connection_id, episode_uri)` and
contains positive observation count, summed observed milliseconds, first/latest
dated positive segment, undated-positive state, any-positive-evidence, and
projection version. It is an accelerator only; replay rebuilds it from
observations. Arbitrary activity ranges still query indexed observations.

### Reader Podcast projection

Add `readwise_podcast_documents`, one current row per Reader connection/document
whose source category is Podcast:

- Reader document/media/external identity IDs;
- optional exact linked Spotify episode identity;
- current Reader location/state;
- title, creator/publication/show assertions, image and validated URLs;
- published and retained Archive temporal values with precision/basis;
- source-record, observation, complete-snapshot, and projection versions; and
- active/removed state.

Only eligible Reader Archive state creates/retains a Podcast Archive occurrence.
Other locations remain current source facts and never create Podcast Queue.

### Spotify catalog caches and jobs

Add separate episode and show cache rows with:

- provider identity and configured market;
- safe descriptive fields approved by current policy;
- artwork URL/dimensions where supplied, never copied image bytes;
- acquisition, refresh, expiry, deletion, and last-check times;
- state: `pending`, `current`, `not_found`, `restricted`, `transient_error`,
  `expired`, or `deleted`;
- response/content checksum and ephemeral raw-object reference while retained;
- source link and attribution version; and
- policy/parser version.

Add a durable enrichment job table or equivalent reservation fields with a
stable idempotency key, attempts, next-eligible time, last safe failure class,
and completion state. A crash, queue-send failure, dead letter, or stale
reservation must be recoverable by a later producer pass.

### Podcast projection and search

Add `podcast_library_projection`, one row per canonical episode with any current
Archive, Queue, saved-episode, or retained inspectable Podcast relationship. It
contains only queryable/rebuildable values:

- display/imported title and normalized title;
- display show name and normalized name;
- exact show ID/identity when known and current followed-state tri-value;
- artwork source/cache expiry reference;
- publication temporal value and precision;
- duration and availability state;
- Archive membership, supported relationship count, Reader count, latest dated
  activity, and undated-activity flag;
- lifetime Spotify observed milliseconds/count/first/latest;
- current Queue membership and saved date;
- current saved-episode membership;
- current catalog/cache coverage; and
- projection version/refresh time.

Following queries can use saved-show state plus current show cache directly or a
small `podcast_show_projection`; choose the latter if it materially simplifies
stable pagination/facet counts. It must remain rebuildable.

Create FTS5 indexes for the accepted search fields only. Keep durable export and
Reader assertion terms in a durable index. Put governed current title/show/
publisher terms in a cache-aware index or tagged rows so expiry removes them
without removing durable terms.

### Projection state

`spotify_podcast_projection_state` records, per connection:

- latest complete saved-episode snapshot run/time/version;
- latest complete saved-show snapshot run/time/version;
- latest player poll time/result/capability;
- latest complete Extended Streaming History import time/hash/parser;
- unresolved saved-row count;
- current catalog policy/version and refresh state;
- current parser/read-model versions; and
- a short sync lease owner/expiry distinct from the token-refresh lease.

This state supports coverage/UI and prevents overlapping full reconciliations.

### Required indexes

At minimum, provide equivalent access paths for:

```text
spotify_podcast_episodes(episode_uri) UNIQUE
spotify_podcast_episodes(media_item_id, upstream_state)
spotify_podcast_shows(show_uri) UNIQUE
spotify_episode_shows(media_item_id, show_id, upstream_state) UNIQUE
spotify_episode_shows(show_id, media_item_id)

spotify_saved_episodes(connection_id, episode_uri) UNIQUE
spotify_saved_episodes(connection_id, upstream_state, added_at DESC, media_item_id)
spotify_saved_episodes(connection_id, upstream_state, resume_class, media_item_id)
spotify_saved_shows(connection_id, show_id) UNIQUE
spotify_saved_shows(connection_id, upstream_state, added_at DESC, show_id)

spotify_episode_progress_observations(source_record_id) UNIQUE
spotify_episode_progress_observations(connection_id, episode_uri, observed_at DESC, id)
spotify_episode_progress_observations(episode_uri, positive_evidence, observed_at DESC, id)

spotify_podcast_playback_observations(source_record_id) UNIQUE
spotify_podcast_playback_observations(connection_id, episode_uri, source_ts DESC, id)
spotify_podcast_playback_observations(episode_uri, positive, source_ts DESC, id)

podcast_listening_aggregates(connection_id, episode_uri) UNIQUE
podcast_listening_aggregates(latest_positive_at DESC, media_item_id)
podcast_listening_aggregates(total_observed_ms DESC, media_item_id)

readwise_podcast_documents(connection_id, document_id) UNIQUE
readwise_podcast_documents(media_item_id, upstream_state)

podcast_library_projection(in_archive, latest_activity_at DESC, normalized_title, media_item_id)
podcast_library_projection(in_queue, queue_saved_at DESC, normalized_title, media_item_id)
podcast_library_projection(show_id, in_archive, media_item_id)
podcast_library_projection(total_observed_ms DESC, normalized_title, media_item_id)

spotify_episode_catalog_cache(cache_expires_at, cache_state)
spotify_show_catalog_cache(cache_expires_at, cache_state)
spotify_catalog_jobs(state, next_eligible_at, id)
```

Also index publication/date precision, duration, publisher, language, Following,
availability, and normalized stable sort fields used by predicates/cursors.

### Schema invariants

1. One global Spotify episode identity maps to one canonical media item.
2. One Spotify Archive occurrence exists per connection and episode URI.
3. Every export segment remains a distinct source record and playback
   observation, including zero and duplicate-looking rows.
4. Replay of the same raw object/parser/path creates no duplicate observation,
   identity, Archive evidence, aggregate, or Queue row.
5. A later positive date can advance but an older replay cannot move the Spotify
   Archive date backward.
6. Any positive Spotify evidence keeps Queue inactive even after later zero.
7. Null progress never qualifies Queue.
8. Complete account-scoped snapshots alone retire saved episode/show state.
9. A saved-show relationship never creates episode Queue membership.
10. Reader merges require authoritative episode identity; text similarity never
    merges.
11. Catalog cache expiry/removal cannot retire identity, Archive, saved state,
    Queue evidence, or owner assertions.
12. Old raw catalog pages cannot restore expired/deleted governed fields.
13. Rows, counts, facets, observed totals, and cursors share exact eligibility
    predicates.
14. Every read model and search index is rebuildable from permitted normalized
    evidence and current caches.

## Acquisition and reconciliation plan

### Parser and cursor versions

Advance the export parser from `spotify-extended-history@3` because it must now
project every playback observation, not only source records plus the latest
episode. Advance the saved-episode parser from `spotify-saved-episodes@1` because
membership/progress/current cache semantics change. Give saved shows, player,
Reader Podcast routing, catalog cache, and Podcast read model independent
versions.

The export parser and derived manifest should become a reusable classified-row
foundation for Spotify media. Parse each source row once into a versioned union
such as Podcast, Song, Audiobook, or Unidentified with common raw member/path
lineage and class-specific safe fields. This Podcast slice persists only Podcast
observations into Podcast tables; it does not implement Song admission,
aggregation, or UI. The later Music slice should consume or extend the same
versioned parser/manifest contract instead of reopening the ZIP through a second
incompatible parser.

Parser version changes trigger deterministic replay/rebuild; they never reuse a
cursor to claim new semantics were already processed.

### Extended Streaming History replay

1. Preserve the original ZIP and checksum as immutable owner evidence.
2. Parse each history member in stable member-name order into the shared
   classified-row union and retain raw member path/index for every class.
3. Create deterministic source-record and playback-observation IDs from raw
   identity, parser version, and record path.
4. Project every Podcast row, not only positive/latest rows.
5. Attach identified positive observations to the one Spotify Archive entry and
   add evidence links without duplicating the occurrence.
6. Update lifetime aggregate and monotonic latest positive date in the same D1
   commit as each bounded chunk.
7. Keep the maximum chunk size within measured D1 statement/CPU limits; begin
   with the existing 100 and lower only if production measurement requires it.
8. Commit cursor progress only with the chunk's observations, aggregates,
   canonical changes, and evidence.
9. Mark the raw object processed only after every chunk and final projection
   rebuild succeeds.
10. Preserve zero/unidentified/song/audiobook classifications without admitting
    them to Podcasts.

The derived R2 manifest may remain a resume accelerator, but D1 observations are
the browse source. Version/checksum it, retain the class discriminator and
reusable safe class-specific fields needed by the later Music parser, and rebuild
it from the retained ZIP when absent or incompatible. This does not authorize
Song projection during Podcasts implementation.

### Saved-episode complete snapshots

1. Acquire each 50-row page and retain exact successful bytes under the
   provider-cache policy before parsing.
2. Parse null/unavailable variants without assuming documented required fields.
3. Create deterministic source records and progress observations for every row.
4. Upsert usable saved membership and `added_at`; preserve unresolved rows and
   count them separately.
5. Reconcile positive state to Archive and Queue anti-join immediately.
6. Do not retire an absent saved row until every page committed and a
   transaction finalizes the complete snapshot.
7. Finalization marks missing membership removed, updates Queue, creates safe
   removal evidence, records snapshot coverage, and rebuilds affected read-model
   rows atomically.
8. Empty first page with total zero is a valid complete snapshot. Empty later
   page before reported completion, repeated offset/next, malformed success,
   401/403, 429, or network failure leaves prior membership active.
9. Advance the saved-episode cursor only after finalization.

The snapshot is authoritative for current saves, not for lifetime listening.

### Saved-show complete snapshots

Use the same raw-before-parse and complete-snapshot lifecycle for
`GET /me/shows`. Persist active membership and saved date independently from the
show catalog cache. Only a complete scan retires Following. Removing a show does
not change its episodes, Archive, Queue, or retained exact show links.

Do not scan every saved show's episode catalog in the baseline. Targeted scans
may later improve positive-progress discovery, but they never create Queue from
zero rows and require the same observation/caching rules.

### Current-player polling

Hourly Podcast reconciliation and explicit Sync now call `GET /me/player` after
credential refresh when `user-read-playback-state` is available.

- Store a successful body under the current provider policy before parsing.
- A `204` is a successful empty poll: update last-poll/capability only.
- Ignore tracks and unsupported item types for Podcast membership while retaining
  the safe poll outcome.
- For an identified episode with `progress_ms > 0`, persist a player progress
  observation, admit/reconcile its Spotify Archive relationship, and retire
  Queue if present.
- Never use poll time or player `timestamp` as `consumed_at`.
- Never add `progress_ms` to observed listening time.
- Zero, pause state, missing item, 204, missing scope, stale state, or transient
  failure never clears history or Queue by itself.
- Device and context fields do not enter the Podcast projection.

Player failure is a partial capability failure. A successful saved-episode/show
snapshot may still commit. Connections and collection coverage report the player
state independently.

### Sync orchestration, leases, and retries

Replace the narrow `syncSpotifySavedEpisodes` orchestration with a Podcast sync
service that obtains one access token and runs saved episodes, saved shows, and
player polling as independently committable suboperations under one
connection-scoped sync lease.

- Each complete snapshot has its own durable checkpoint/freshness fields.
- A run is `partially_succeeded` when one suboperation commits and another fails.
- Never roll back a complete saved-episode snapshot because the optional player
  poll failed.
- Never report overall success when a required snapshot failed.
- Prevent cron and Sync now from overlapping beyond token refresh.
- On 401/`invalid_grant`, classify authorization separately, set the connection
  to `reauthorization_required` when appropriate, and stop futile retries.
- Honor `Retry-After`. Short waits may retry with bounded jitter; long waits
  persist retry eligibility and defer rather than holding a Worker invocation.
- Cap attempts, preserve safe failure class/status, and never log response bodies,
  tokens, IDs beyond safe opaque local IDs, or private media text.

Track `authorized_at` and expected reauthorization deadline for the next grant.
For the existing bootstrap token, display deadline unavailable until a known
authorization event occurs; do not invent its issue time.

### Reader Podcast routing and repair

Extend the all-location Reader projection without disturbing Articles:

1. Persist Podcast-category current rows in `readwise_podcast_documents`.
2. Retain eligible Reader Archive occurrences after later movement, consistent
   with canonical Reader semantics.
3. Parse exact Spotify episode identity only from the validated URL rule.
4. Reuse an existing Spotify media item or create it before the Reader item when
   identity is authoritative.
5. Repair already-split items in an isolated replay, retaining both identities,
   Archive entries, and evidence.
6. Keep Reader-only Podcast media separate when no authoritative match exists.
7. Do not project Reader Inbox/Later/Shortlist/Feed to Podcast Queue/Following.
8. A failed Reader sync cannot retire Spotify relationships; source lineages are
   independent.

### Catalog enrichment

Enrichment is exact-ID and asynchronous:

1. Seed jobs for export-only episodes, active saved episodes, exact shows, and
   stale/expired caches.
2. Prefer metadata embedded in saved episode/show pages when the cache policy
   permits, then exact `GET /episodes/{id}` for missing/stale episode fields.
3. Avoid removed batch endpoints; process bounded jobs sequentially and honor
   app-specific quota behavior.
4. Store acquisition/check/expiry/outcome state and update the governed search
   terms/read model only after a complete cache-row commit.
5. `404` or a verified durable unavailability result changes catalog state, not
   identity/history. Transient errors remain unknown.
6. Cleanup expires governed fields and artwork before a projection version that
   omits them becomes visible.
7. A stale queue reservation, enqueue failure, dead letter, or retry exhaustion
   remains recoverable from the durable job table.
8. Never block collection APIs or sync cursor advancement on optional enrichment.

Spotify-to-RSS or Podcast Index matching is not part of this job.

### Real-data replay

Before updating the active local database:

1. Apply migrations to an isolated D1 database.
2. Replay the retained Extended Streaming History and current saved snapshots
   without printing titles, URIs, descriptions, or raw rows.
3. Record only safe aggregate counts: playback rows, positive rows, distinct
   Archive episodes, observed milliseconds, Queue candidates, unresolved saved
   rows, followed shows, Reader-only episodes, exact Reader/Spotify merges,
   cache outcomes, and replay duplicates.
4. Compare the existing 2,443 positive-export episode baseline and current
   saved/show observations, explaining legitimate drift.
5. Replay identical evidence again and prove stable counts, aggregates, Queue,
   identities, and cursor order.
6. Simulate an older export after a newer one and prove dates never regress.
7. Promote only after isolated results and query plans are credible.

Real payloads, exports, tokens, titles, IDs, and URLs remain ignored/private.
Only synthetic fixtures and safe aggregates may be committed.

## Contracts and API plan

Create `packages/contracts/src/podcasts.ts`, export it from the package root, and
add focused request/response tests.

### Collection endpoint

```text
GET /api/library/podcasts
```

Validated query fields:

```text
mode=archive|queue|following
q=<string>
limit=<1..100>
cursor=<opaque>
sort=<mode-specific enum>
dir=asc|desc

activityMode=any|range|unknown
activityFrom=YYYY-MM-DD
activityTo=YYYY-MM-DD
savedMode=any|range|unknown
savedFrom=YYYY-MM-DD
savedTo=YYYY-MM-DD

show=<spotify-show-id>|unknown                         repeated
following=followed|not_followed|unknown                repeated
publishedMode=any|range|unknown
publishedFrom=YYYY-MM-DD
publishedTo=YYYY-MM-DD
duration=under_30|30_59|60_120|over_120|unknown       repeated
publisher=<facet-key>|unknown                          repeated
language=<source-value>|unknown                        repeated
libraryEpisodes=archive|queue|none                     repeated
```

Reject incompatible mode-only parameters at the HTTP boundary. Validate range
ordering, repeat limits, owner timezone, search/relevance dependency, sort/
direction pairing, and cursor binding. The web route normalizer removes stale
incompatible state during mode changes; direct invalid API requests still return
stable `BAD_REQUEST`.

Response shape:

```ts
type PodcastCollectionResponse = {
  data: Array<PodcastEpisodeRow | PodcastShowRow>
  nextCursor: string | null
  modeCounts: {
    archiveEpisodes: number
    queueEpisodes: number
    followedShows: number
  }
  filteredCount: number
  archiveTotals: null | {
    supportedRelationships: number
    matchingPositiveObservations: number
    matchingObservedMs: number
    undatedEpisodeCount: number
    bySource: { spotify: number; readwise: number }
  }
  facets: PodcastFacets
  coverage: {
    automaticHistory: 'best_effort'
    lastSavedEpisodeSnapshotAt: string | null
    lastSavedShowSnapshotAt: string | null
    lastPlayerPollAt: string | null
    playerPolling: 'enabled' | 'scope_missing' | 'reauthorization_required' | 'unavailable'
    lastExtendedHistoryImportAt: string | null
    unresolvedSavedEpisodeCount: number
    catalogRefreshState: 'current' | 'partial' | 'unavailable'
  }
}
```

Episode rows contain only collection needs:

```ts
type PodcastEpisodeRow = {
  kind: 'episode'
  mediaItemId: string
  title: string | null
  artwork: null | {
    url: string
    source: 'spotify_episode' | 'spotify_show' | 'readwise'
    expiresAt: string | null
  }
  show: null | {
    showId: string | null
    spotifyIdentity: string | null
    name: string | null
    followed: boolean | null
  }
  memberships: {
    archive: boolean
    queue: boolean
    savedEpisode: boolean
  }
  publishedAt: TemporalValue | null
  durationMs: number | null
  availability: 'available' | 'restricted' | 'unavailable' | 'unknown'
  displayActivity: null | {
    kind: 'spotify_export' | 'spotify_undated' | 'readwise'
    temporal: TemporalValue | null
  }
  spotifyHistory: null | {
    lifetimeObservedMs: number
    matchingObservedMs: number
    lifetimePositiveObservationCount: number
    matchingPositiveObservationCount: number
    firstPositiveAt: string | null
    latestPositiveAt: string | null
  }
  queue: null | { savedAt: string | null; zeroObservedAt: string }
}
```

Show rows:

```ts
type PodcastShowRow = {
  kind: 'show'
  showId: string
  spotifyIdentity: string
  name: string | null
  artwork: null | { url: string; expiresAt: string | null }
  publisher: string | null
  savedAt: string | null
  totalEpisodes: number | null
  languages: string[]
  availability: 'available' | 'unavailable' | 'unknown'
  libraryCounts: { archiveEpisodes: number; queueEpisodes: number }
}
```

Collection responses exclude descriptions, raw HTML, full source-record arrays,
devices, raw payloads, R2 keys, and temporary/signed URLs.

### Episode detail and history

```text
GET /api/library/podcasts/episodes/:mediaItemId
GET /api/library/podcasts/episodes/:mediaItemId/history?limit=20&cursor=...
```

Episode detail returns:

- collection identity/artwork/memberships;
- Listening summary and current Spotify state with its observation time;
- Episode and exact Show metadata while cache-current;
- every current/retained Reader relationship;
- validated source links and attribution;
- current availability/cache/coverage state;
- safe provenance summaries; and
- optionally the first History page only if it does not duplicate a large
  payload.

It resolves Archive, Queue-only, active-saved-only, Reader-only, and retained
unavailable episodes; active Archive is not required.

History returns complete supported relationships, not only the collection
filter match. Spotify playback is one aggregate relationship row. Reader
occurrences are distinct. Current saved/progress/availability state is factual
current state, not a dated playback event. Optional normalized filter context
may compute `matchesCurrentFilters` without changing returned history.

Defer the ordinary UI for raw observations, but define and test the bounded
endpoint now only if implementation needs it for provenance:

```text
GET /api/library/podcasts/episodes/:mediaItemId/observations?limit=25&cursor=...
```

It returns only `ts`, `msPlayed`, safe start/end reason, skipped, and evidence
source, never sensitive export fields.

### Show detail and history

```text
GET /api/library/podcasts/shows/:showId
GET /api/library/podcasts/shows/:showId/history?limit=20&cursor=...
```

Show detail returns saved relationship, refreshable metadata, availability,
attribution, exact-identity Archive/Queue counts, and source coverage. It can
resolve a show referenced by retained episodes after Following retirement.

Show History returns membership observations and complete-snapshot removal, not
episode catalog rows.

### Facets and cursor design

Facet responses are mode-aware. Show, Publisher, and Language return bounded
values/counts with separate facet search when cardinality exceeds the inline
limit. A facet's counts apply all active filters except itself.

Collection cursors are opaque, versioned, and integrity-checked. Bind them to
normalized mode, filters, search, sort, direction, owner timezone, and projection
version. Include null rank, sort value, normalized title/show tie, stable ID,
and relevance rank when applicable.

History and observation cursors have independent versions/query hashes.
Observation order uses source `ts`, raw source order, and stable ID so same-second
and byte-identical rows remain distinct. Cursor/query/projection mismatch returns
`BAD_REQUEST`; the client refreshes from page one after committed sync.

### Repository query invariants

- One episode appears once per mode despite multiple connections, identities,
  Reader occurrences, and playback observations.
- Queue is a connection-scoped saved-state predicate plus anti-join against every
  positive Spotify evidence channel.
- Following is current saved-show state only.
- Activity date uses `EXISTS` across matching positive observations and Reader
  occurrences; row display/sort date comes from that matching set.
- Observed totals use exactly the same activity predicate as rows/counts.
- Exact show identity governs facets, Following joins, and show counts.
- Unknown dates/numbers sort last both directions.
- Search candidates intersect mode and filters before pagination.
- Counts/facets cover the whole result, never only loaded pages.
- Collection/detail queries perform no R2 read and no provider call.
- Expired cache terms are not searchable or displayable.

### Stable errors

Use the existing safe API envelope and distinguish:

- `BAD_REQUEST` for invalid query/range/cursor/mode parameters;
- `NOT_FOUND` for ineligible episode/show IDs;
- `STALE_CURSOR` only if the existing API convention adopts it, otherwise
  `BAD_REQUEST` with a stable message;
- `COVERAGE_DEGRADED` only as response coverage, not a fatal collection error;
- `SPOTIFY_REAUTHORIZATION_REQUIRED` for explicit sync operations; and
- `INTERNAL_ERROR` without provider response text, credentials, private titles,
  raw content, or stack traces.

### Operational sync and queue contracts

Keep the existing explicit operations and evolve their validated responses:

```text
POST /api/connections/spotify/sync
POST /api/connections/spotify/import
POST /api/connections/spotify/import/:importId/continue
```

Podcast sync returns one overall run plus independent suboperation outcomes so a
player failure is not hidden inside a successful saved-library scan:

```ts
type SpotifyPodcastSyncResponse = {
  syncRunId: string
  status: 'succeeded' | 'partially_succeeded'
  refreshTokenRotated: boolean
  savedEpisodes: {
    status: 'succeeded' | 'failed'
    pages: number
    rows: number
    queueEpisodes: number
    unresolvedRows: number
    completedSnapshotAt: string | null
  }
  savedShows: {
    status: 'succeeded' | 'failed'
    pages: number
    rows: number
    completedSnapshotAt: string | null
  }
  player: {
    status:
      | 'observed_episode'
      | 'empty'
      | 'non_episode'
      | 'scope_missing'
      | 'reauthorization_required'
      | 'failed'
    admittedEpisode: boolean
    polledAt: string | null
  }
  archiveEpisodes: number
  queueEpisodes: number
  followedShows: number
}
```

Do not return titles, Spotify IDs, progress values, or provider error bodies in
the operational response. An entirely failed required saved-library operation
uses the safe API error envelope rather than pretending a useful snapshot
completed. Import/continuation retain resumable offsets and add projected
playback-observation/aggregate counts without changing the upload size boundary.

Extend `SyncJobSchema` with narrowly validated Spotify operations such as
`refresh_spotify_episode`, `refresh_spotify_show`, and
`expire_spotify_catalog`. Each requires source `spotify`, the applicable local
identity, and a stable idempotency key. Queue consumers validate before acting,
ack terminal policy/not-found outcomes, retry only classified transient errors,
and persist failure state before retry/dead-letter.

## Web implementation plan

### Routing and navigation

Enable Podcasts in production navigation and add the three canonical routes.
The workspace breadcrumb displays Library / Podcasts. Routes share one page with
mode-specific rows/cards, query schema, and inspector selection union.

### URL normalization and remembered mode state

Create a Podcast route-search module that:

- parses only accepted scalar/repeated values;
- removes Archive activity fields outside Archive;
- removes saved-date fields outside Queue/Following;
- removes episode-only facets outside Archive/Queue;
- removes show-only facets outside Following;
- clears incompatible sort and direction together;
- allows Relevance only with nonempty search;
- rejects reversed date ranges before issuing a request;
- accepts `episode:` selection only in Archive/Queue and `show:` in Following,
  while preserving a deliberate inspector cross-link with a return history
  entry;
- excludes `item` and inspector tab from collection query keys; and
- preserves independent normalized query state for each mode.

Incomplete date/filter drafts stay local until valid. Defaults are omitted from
the URL; repeated values serialize in stable sorted order.

### Query cache and loaded-page preservation

Use TanStack infinite queries keyed only by normalized collection inputs. Do not
include selected item, inspector tab, sidebar state, layout width, focus target,
or scroll position.

Archive/Queue load 50 rows; Following loads 48 cards. Explicit Load more remains
the baseline. Deduplicate overlapping live pages by canonical media-item or show
projection ID while preserving server order. Opening/closing/changing inspector
tabs or sidebar state preserves every loaded page and scroll position.

A committed Podcast sync invalidates mode counts and first pages. Keep cached
content visible during background refresh failure and offer Refresh when a live
page chain may have shifted.

### Collection UI

Build a production feature from the accepted review artifact rather than
importing it. Required behavior:

- Archive/Queue/Following tabs with unfiltered counts;
- debounced server search and correct placeholder;
- mode-valid filter panel and active-filter count;
- mode-valid sort/direction control;
- filtered count and Archive observed-time summary;
- compact episode rows and Following card grid;
- local artwork fallback and provider attribution;
- explicit Load more;
- coverage notice for best-effort automatic history/last export;
- unresolved saved-row notice linked to Connections;
- no row action toolbar, playback control, progress ring, or hidden hover-only
  identity; and
- exact empty/no-results/initial-error/cached-refresh states from the accepted
  surface specification.

### Inspector behavior

Selection lives in typed `item`. Detail/history use separate abortable query
keys. Rapid selection cancels or ignores stale results. A direct item URL loads
detail independently from the first collection page.

If sync/filtering removes the selected item from current results, keep inspection
open with **Not in current results**. Closing returns focus to its trigger when
present or to the results heading. Episode-to-show and exact-show filtered links
push navigable history without discarding prior mode state.

Render imported descriptions as sanitized/plain safe text; never inject raw
HTML. Validate external links, open them in a new context with
`noopener,noreferrer`, and disable missing/invalid links. Source/provenance stays
collapsed and secondary.

### Responsive and accessibility baseline

- Preserve the production adjacent desktop inspector and narrow-screen sheet.
- Episode identity and mode-defining date/state remain visible as columns stack.
- Cards/rows and tabs are keyboard operable with focus distinct from selection.
- Artwork is decorative when adjacent text names the item; fallback icons have
  useful labels only when needed.
- Availability, progress, and observed-time labels remain factual and available
  to assistive technology.
- Filter dialogs, facet search, tabs, errors, and loading changes are correctly
  labeled/announced.
- Focus restores after close/filter actions.
- Reduced-motion preference applies to inspector/filter transitions.
- Graphite light/dark retains contrast for quiet availability and attribution
  text.

## Suggested code organization

```text
packages/connectors/spotify/src/
  saved-episodes.ts
  saved-shows.ts
  current-player.ts
  catalog.ts
  ingest.ts
  retry.ts
  *.test.ts

packages/connectors/readwise/src/
  documents.ts
  documents.test.ts

packages/contracts/src/
  podcasts.ts
  podcasts.test.ts

packages/db/src/
  podcasts-repository.ts
  podcasts-repository.test.ts

packages/db/migrations/
  0014_podcasts_library.sql
  # reserved for Podcasts; use a later follow-up if an applied constraint changes

apps/api/src/
  spotify-podcasts-sync.ts
  spotify-podcasts-sync.test.ts
  spotify-catalog.ts
  spotify-catalog.test.ts
  spotify-import.ts
  spotify-import.test.ts
  app.ts
  app.test.ts

apps/web/src/features/podcasts/
  podcasts-api.ts
  podcasts-route-search.ts
  podcasts-route-search.test.ts
  podcasts-collection-page.tsx
  podcast-episode-row.tsx
  podcast-show-card.tsx
  podcast-filters.tsx
  podcast-inspector.tsx
  podcast-history.tsx
```

Keep files cohesive rather than treating this exact split as mandatory. Do not
extract a universal media renderer merely because other slices share a toolbar
and inspector.

## Delivery sequence

Each stage is independently reviewable and has an explicit exit criterion.

### Stage 0: Baseline, endpoint smoke check, and cache ADR

1. Record current migration, Spotify parser/cursor, connection, export import,
   saved snapshot, and canonical aggregate state.
2. Run credential-safe reads for saved episodes, saved shows, and current player,
   emitting only shapes/aggregates and safe capability results.
3. Reverify current Spotify terms, policy, design/attribution rules, app quota
   mode, endpoint availability, scopes, token expiration behavior, and
   development-mode batch limitations.
4. Write the provider-cache ADR described above before persisting new governed
   catalog fields.
5. Replay current evidence into an isolated D1/R2 environment and capture safe
   baseline counts/query scale.

Exit criterion: current source capabilities, policy boundary, real-data scale,
and upgrade starting point are explicit without exposing private data.

### Stage 1: Contracts, migration, and source schemas

1. Add Podcast Zod query/row/detail/history/facet/coverage contracts and tests.
2. Add forward-only schema for all source projections, cache/job state,
   aggregates, read models, FTS, and projection state.
3. Add connector schemas for saved shows, player body/204, expanded saved episode
   fields, catalog responses, and open-ended restriction/error variants.
4. Add exact Spotify identity/URL, temporal, duration, availability, and safe
   link normalization tests.
5. Test migrations from empty and from 0013 (or the actual preceding migration).

Exit criterion: storage and boundaries express the accepted surface without UI
or live provider dependence.

### Stage 2: Playback observations and export replay

1. Advance the export parser and project every Podcast segment.
2. Produce the shared, versioned Podcast/Song/Audiobook/Unidentified manifest,
   while writing only Podcast observations in this slice.
3. Build idempotent aggregates and canonical Archive evidence in bounded chunks.
4. Preserve monotonic dates, duplicate-looking rows, zero rows, and unresolved
   classifications.
5. Rebuild Podcast identity/assertion and read-model rows.
6. Prove resume/retry at every chunk boundary and parser-version replay, and
   contract-test that later Music ingestion can read the shared classified rows
   without reparsing raw ZIP members.

Exit criterion: the complete retained export is queryable in D1 with stable
Archive/aggregate results and no request-time ZIP parsing.

### Stage 3: Saved relationships, Queue, Following, and player polling

1. Implement saved-episode and saved-show full snapshots with independent
   checkpoints and complete-snapshot finalization.
2. Persist progress observations and unresolved counts.
3. Materialize/retire generic Queue using the global positive-evidence anti-join.
4. Implement current-player body/204 polling and capability states.
5. Add sync lease, partial-success handling, rate-limit retry/defer behavior,
   authorization classification, and safe logs.
6. Update hourly cron and explicit Sync now orchestration.

Exit criterion: Archive, Queue, and Following source relationships reconcile
idempotently, and every failure mode preserves the last valid state.

### Stage 4: Reader routing and authoritative identity repair

1. Add Reader Podcast current projection and exact Spotify URL extraction.
2. Reconcile exact identities to existing Spotify episodes.
3. Repair existing exact split items in isolated replay.
4. Preserve Reader-only items and every Reader Archive occurrence.
5. Prove Reader non-Archive locations never create Podcast Queue.

Exit criterion: cross-source collection grouping is authoritative, replayable,
and never title-based.

### Stage 5: Podcast repository and REST API

1. Build/rebuild episode/show read models and permitted search indexes.
2. Implement all mode predicates, exact facets, aggregates, sorts, counts, and
   versioned keyset cursors.
3. Implement collection, episode detail/history, show detail/history, and only
   the bounded observation endpoint selected for shipment.
4. Validate every response through shared contracts.
5. Check query plans for default modes, every sort, activity ranges, Queue
   anti-join, show counts, and more than one page.

Exit criterion: the complete accepted local surface works through fixture-backed
REST without enrichment or web UI.

### Stage 6: Production collection UI

1. Enable Podcasts navigation and routes.
2. Implement normalized URL state and independent remembered mode state.
3. Build compact episode rows and Following cards from the written contract.
4. Implement server search, filters, sorts, counts, facets, coverage, and
   pagination.
5. Preserve loaded pages/scroll across inspector/sidebar/presentation changes.
6. Add empty, missing, partial-coverage, cached-refresh, and initial-error states.

Exit criterion: all three modes are usable with retained local facts and no
inspector or catalog-enrichment dependency.

### Stage 7: Episode/show inspectors and History

1. Implement typed episode/show Details and History inspectors.
2. Add source-correct Listening, Episode, Show, Reader, Following, About,
   Library, Availability, and Source sections.
3. Paginate supported history; keep Spotify playback as one relationship.
4. Implement direct links, Back/Forward, cross-links, focus/scroll restoration,
   filtered-out selection, and stale-response protection.
5. Keep raw observation disclosure deferred unless the bounded technical view
   materially helps acceptance debugging.

Exit criterion: every approved personal relationship/fact is reachable without
invented sessions, completion, or activity dates.

### Stage 8: Catalog enrichment and expiry lifecycle

1. Add durable exact-ID enrichment jobs and queue-message union.
2. Consume embedded saved metadata under policy and enqueue missing exact
   episode/show lookups.
3. Implement bounded sequential fetching, Retry-After, stale reservation,
   dead-letter, and recovery behavior.
4. Apply attribution, links, configured market, expiry/deletion, availability,
   and cache-aware search/read-model updates.
5. Prove cache expiry removes governed fields/terms/art without hiding history.
6. Measure coverage without making completion contingent on 100% enrichment.

Exit criterion: current permitted metadata improves rows/inspectors while expiry,
provider outage, or unavailable items cleanly fall back to local evidence.

### Stage 9: Hardening and acceptance

1. Replay identical, older, and changed exports/snapshots.
2. Exercise later-page failure, malformed success, 204, missing scope, 401/403,
   429, queue failure, stale lease/reservation, and cache cleanup.
3. Run full checks, build, browser tests, and fresh/upgrade migrations after the
   final code/test edit.
4. Test owner-timezone boundaries, partial publication precision, null-last
   sorts, all facets, and multi-page collections.
5. Visually inspect both themes, all modes, missing/long data, sidebar states,
   inspector variants, and narrow sheet mode using bounded owner data.
6. Request an independent cumulative review and fix every confirmed issue before
   commit.

Exit criterion: every acceptance item below has automated or recorded manual
evidence and no unresolved correctness defect remains.

## Test strategy

### Connector, sync, and replay

- Export ordinary, zero, positive, null, malformed timestamp, missing URI,
  song, audiobook, ambiguous, same-second, and byte-identical rows.
- Raw ZIP/member/path identity and deterministic parser replay.
- Interrupted chunk resume without aggregate/evidence duplication.
- Older import after newer import does not regress activity date.
- Saved episode usable positive/zero/null and all-null unavailable variants.
- `fully_played=true` with zero still positive.
- Historical positive plus current zero excludes Queue.
- Positive earlier progress plus later zero remains Archive/not Queue.
- Saved membership removal after complete snapshot only.
- Empty complete snapshot, empty premature page, repeated offset, malformed
  success, later-page failure, and finalization failure.
- Saved-show add/remove and no episode expansion.
- Player positive episode, zero, track, unsupported item, malformed body, 204,
  missing scope, transient error, expired auth, and stale poll.
- Player progress admits undated Archive but does not add observed time/date.
- Independent suboperation commit and accurate partially-succeeded run.
- Rate-limit Retry-After and long-delay deferral.
- Token rotation before pages, refresh lease, sync lease, known/unknown auth
  deadline, and `invalid_grant` classification.
- Catalog success, restriction, durable not found, transient failure, expiry,
  cleanup, retry, queue-send failure, stale reservation, and dead letter.
- Old catalog raw replay cannot restore deleted/expired cache.
- Safe logs contain no token, description, title, URI, payload, device, IP, or
  private source fact.

### Reader and identity

- Podcast category Archive versus Inbox/Later/Shortlist/Feed routing.
- Exact Spotify URL from Reader URL and source URL.
- Lookalike host, userinfo, query-only ID, wrong path/type, malformed ID, and
  title/show similarity rejected.
- Reader-before-Spotify and Spotify-before-Reader converge to one item only with
  authoritative identity.
- Existing split repair preserves both identities, occurrences, and evidence.
- Reader-only Podcast remains inspectable and does not acquire fake show/follow
  state.
- Multi-connection isolation and complete-snapshot absence behavior.

### Database and repository

- One collection row despite many segments, progress observations, connections,
  and Reader occurrences.
- Queue predicate across every positive evidence channel.
- Following independent of episodes.
- Every filter, repeated-value rule, mode restriction, and self-excluding facet.
- Activity `EXISTS` matching and latest/earliest matching display date.
- Selected-range versus lifetime observed totals.
- Publication year/month/day interval intersection.
- Duration bucket boundaries including exactly 120 minutes.
- Following tri-state and show-identity-unavailable behavior.
- Exact-show Library episode counts.
- Unknown/null last in ascending and descending sorts.
- Stable keyset pagination beyond one page for every sort and relevance.
- Cursor/query/timezone/projection mismatch rejection.
- FTS escaping, Unicode normalization, token AND, and prefix final token.
- Durable terms survive cache expiry; governed terms do not.
- Counts, rows, facets, and aggregate totals share predicates.
- Detail eligibility for Archive, Queue-only, active saved-only, Reader-only, and
  retained unavailable episodes/shows.
- No request-time R2/provider access.

### Contracts and API

- Valid row/detail/history/facet/coverage parsing for every nullable state.
- Incompatible mode filters/sorts and reversed ranges return `BAD_REQUEST`.
- Typed selection and ineligible/not-found IDs.
- Page sizes and cursor maximums.
- History contains complete relationships, not collection-filter truncation.
- Observation response excludes sensitive fields.
- Collection response excludes descriptions/raw/provenance arrays.
- Safe sync errors distinguish credentials/reauthorization/rate limit without
  exposing provider response bodies.

### Web and browser

- Navigation among Archive, Queue, Following with independent state.
- Search debounce, Relevance default, and clearing behavior.
- Incomplete date drafts never flash API errors.
- Sort and dependent direction normalize together on mode changes.
- Loaded-page preservation across item open/close, inspector tab, sidebar, and
  responsive layout changes.
- Direct episode/show links and Back/Forward.
- Episode/show cross-links preserve a return history entry.
- Focus restoration and keyboard navigation.
- Stale detail/history response protection.
- Selected item filtered out while inspector remains open.
- Load-more deduplication and post-sync invalidation.
- Broken/expired artwork fallback and Spotify attribution/link.
- Cached refresh failure versus initial failure.
- No Now Playing/playback controls when player polling is active.
- Narrow sheet mode and reduced motion.

### Visual QA matrix

Review at minimum:

- Graphite light and dark;
- Archive, Queue, and Following;
- default, searched, filtered, loading, empty, no-results, degraded, and error
  states;
- missing title, show, artwork, activity date, saved date, duration, publication,
  publisher, language, progress, description, and show identity;
- restricted, unavailable, unknown, and expired catalog states;
- long title/show/publisher/description and large observed-time values;
- Archive rows with Reader-only, Spotify-only, and both source relationships;
- Queue row whose saved state remains after Archive admission;
- Following card with zero exact-identity Library episodes;
- episode and show Details/History tabs;
- sidebar expanded/collapsed, inspector open/closed; and
- adjacent desktop inspector and narrow-screen sheet.

## Performance budgets and guardrails

- Spotify offset pages use the documented maximum 50.
- Export normalization begins at the proven maximum 100 observations per
  invocation and is remeasured against D1 statement/CPU limits.
- Archive/Queue page size is 50; Following is 48; API maximum is 100.
- Relationship History page size is 20, maximum 50. Optional raw observations
  are 25, maximum 100.
- No collection request performs per-row SQL, R2 reads, ZIP parsing, provider
  calls, or loads all IDs/observations into Worker memory.
- Facets/counts/totals use indexed server queries.
- Following never downloads full show catalogs merely to render cards.
- Catalog jobs are bounded and sequential enough for the current unpublished
  rate limit; they honor Retry-After and do not hold a request open for backlog.
- Search debounces and aborts superseded requests.
- Detail excludes complete raw observation sets and catalog episode lists.
- FTS and projection versions become visible only after complete successful
  rebuild/cleanup.
- Client prefetches at most one next page and never auto-downloads all history.
- Query plans must avoid full playback-observation scans for default Archive,
  Queue anti-join, Following, observed-time sort, and exact-show counts.

Measure isolated owner-data query plans and response times before acceptance.
Record observed baselines/regressions rather than inventing latency targets
without the deployment environment.

## Observability and failure handling

Connections and collection coverage expose:

- connected/degraded/reauthorization-required state;
- last attempted and successful Podcast sync;
- last complete saved-episode and saved-show snapshots;
- last player poll and capability/result;
- last complete Extended Streaming History import and parser;
- unresolved saved-row count;
- catalog current/partial/unavailable state and backlog/failures;
- per-suboperation safe counts and failure class; and
- best-effort automatic-history coverage warning.

Structured logs include request/sync-run IDs, operation, page/chunk number,
counts, duration, retry/defer decision, cache outcome, and safe error class. They
exclude tokens, authorization headers, personal titles/descriptions, Spotify
IDs/URIs when unnecessary, raw payloads, device/context, and sensitive export
facts.

Failure behavior:

- saved snapshot failure preserves prior membership/Queue and cursor;
- show snapshot failure preserves prior Following;
- player failure degrades only player capability;
- export chunk failure preserves its last durable checkpoint and raw ZIP;
- cache failure/expiry falls back to durable assertions and local artwork;
- projection rebuild failure leaves the previous version active;
- enqueue/dead-letter/stale reservation remains recoverable from durable jobs;
- `invalid_grant` stops retry loops and requests reauthorization;
- provider outage never marks an item durably unavailable without a verified
  provider outcome; and
- partial sync is never reported as complete success.

## Rollout and recovery

- Apply migration and replay to an isolated copy first.
- Preserve all existing raw objects, source records, identities, and Archive
  evidence; never edit an applied migration or delete historical evidence to
  simplify projection repair.
- Keep generic media browsing and Connections import/resume functional until
  Podcast acceptance completes.
- Rebuild operations must independently support export observations/aggregates,
  saved relationships/Queue, Reader Podcast links, browse projection, durable
  search, governed cache/search, and cache cleanup.
- A failed baseline exposes explicit incomplete coverage and never retires
  existing saved relationships.
- Keep the last valid projection version until replacement is complete.
- Before remote migration/deployment, create the normal D1 recovery point/export,
  verify R2 access and policy cleanup, apply migrations, deploy, smoke test all
  modes/details, and verify cron/queue observability.
- Remote deployment/migration remains a separately authorized operational step;
  local implementation and validation do not imply it occurred.

## Documentation updates required at shipment

- `docs/sources/spotify.md`: current saved-show/player/catalog production
  behavior, exact retry/coverage/cache policy, and remaining sync gaps.
- `packages/connectors/spotify/README.md`: parser versions, complete snapshots,
  Queue/Following/player semantics, auth lifecycle, rate limits, enrichment,
  deletion, and replay.
- `docs/architecture/README.md`: Podcast read model and operational status.
- `docs/architecture/canonical-ledger.md`: queryable Spotify observations,
  source-derived Queue rule, Reader identity crosswalk, and cache boundary.
- `docs/decisions/README.md` plus the new provider-cache ADR.
- `docs/planning/implementation-plan.md`: Podcasts shipped status and remaining
  export/manual-history limitation.
- `docs/planning/library-implementation.md`: Podcasts delivery status.
- `docs/planning/library-phase-2-surfaces.md`: status only; do not rewrite
  owner-approved product history.
- `apps/api/README.md`, environment examples, and deployment docs for any new
  queue/cron/cache cleanup behavior.
- OpenAPI output if generated/committed by the repository workflow.

## Owner input

No product or architecture decision currently blocks implementation. The owner
has already selected Following, saved-episode Queue, aggregate rather than
session/relisten History, current-player polling when available, and retention
of unavailable episodes.

This plan makes the following implementation recommendations within those
decisions:

1. Use generic `queue_entries` as the provenance-bearing read model while
   source-owned saved/progress/playback rows remain authoritative.
2. Defer the optional raw playback-observation UI, while preserving/querying the
   normalized observations and leaving a bounded endpoint available if needed.
3. Use exact-ID Spotify enrichment only; do not add Podcast Index/Taddy/RSS
   matching to this slice.
4. Ship the core local surface before optional catalog coverage is complete.
5. Record the current token's reauthorization deadline as unknown until the next
   known authorization rather than inventing a date.
6. The interim provider-retention decision is recorded in
   [ADR 0014](../decisions/0014-spotify-catalog-retention-interim.md). It records
   the owner's indefinite-retention preference and the known policy risk; it
   does not claim compliance. Music shares this boundary.

If the owner accepts this plan, these recommendations are accepted for the
initial Podcasts implementation. A fresh provider-policy check can force a
stricter cache or display boundary; it cannot silently weaken owner-history
provenance or broaden Spotify content use.

## End-to-end acceptance checklist

- [ ] Current Spotify saved-episode, saved-show, and player endpoints/scopes are
      smoke-checked without exposing private content.
- [x] The provider-retention ADR records the owner's choice and the verified
      Spotify policy conflict without claiming compliance.
- [ ] Every retained export Podcast segment is queryable with stable lineage.
- [ ] Export replay is idempotent, resumable, and monotonic for latest activity.
- [ ] Archive admits every approved positive Spotify/Reader source and no zero-
      only Spotify episode.
- [ ] Queue requires active usable saved identity, explicit zero, and no positive
      Spotify evidence anywhere.
- [ ] Null/unavailable saved rows remain unresolved and do not inflate Queue.
- [ ] Complete snapshots alone retire saved episode/show relationships.
- [ ] Following shows each active saved show once and never expands into Queue.
- [ ] Current-player positive progress admits undated Archive, removes Queue,
      and adds neither timestamp nor observed duration.
- [ ] Player 204/missing scope/failure clears no history or membership.
- [ ] Reader merges use authoritative Spotify episode identity only.
- [ ] One episode appears once per collection while History retains complete
      supported relationships.
- [ ] Activity filters/totals use matching observations and owner-timezone
      boundaries.
- [ ] Every approved filter, facet, sort, null order, count, and cursor works
      beyond one page.
- [ ] Search covers exactly the approved durable/current fields.
- [ ] Cache expiry/deletion removes governed display/search content without
      removing history, identity, Queue evidence, or owner assertions.
- [ ] Episode and show Details/History expose every approved fact without
      inferred sessions/completions/relistens.
- [ ] No Now Playing, playback, Queue-write, or follow/save controls appear.
- [ ] Collection pages survive inspector/sidebar/presentation changes.
- [ ] Back/Forward, direct typed links, focus/scroll restoration, cross-links,
      and stale response handling work.
- [ ] Failed snapshots/projections/jobs do not advance cursors or claim success.
- [ ] Fresh and upgrade migrations pass.
- [ ] `pnpm check`, `pnpm build`, and `pnpm test:e2e` pass after the final edit.
- [ ] Light/dark and desktop/narrow visual QA is complete with bounded owner
      data and synthetic edge cases.
- [ ] An independent final review finds no unresolved correctness issue.
- [ ] Owning documentation is updated before commit.

## Ready-to-copy implementation brief

> Implement the accepted Podcasts plan in
> `docs/planning/podcasts-implementation.md`. Read `AGENTS.md` and every linked
> product, architecture, source, decision, design, and surface document first.
> Build the complete Spotify/Reader-backed Podcast vertical slice: queryable
> Extended Streaming History observations and aggregates, one Spotify Archive
> relationship per episode, saved-episode Queue with a global positive-evidence
> anti-join, saved-show Following, best-effort current-player admission, exact
> Reader/Spotify identity reconciliation, owner-approved interim catalog
> caching, server-side collection/detail/history APIs, compact episode rows,
> show cards, and typed episode/show inspectors. Preserve raw owner evidence,
> source date precision, account isolation, complete-snapshot retirement,
> idempotent replay, and cursor atomicity. Do not infer sessions/relistens,
> expand followed shows into Queue, treat null progress as zero, manufacture
> activity dates, merge by text, expose sensitive playback/device fields, or use
> Spotify API content for AI. Use real owner data only in ignored/isolated
> environments and commit only safe aggregates plus synthetic fixtures. Run the
> full required validation, visual QA, and independent review before handoff.
