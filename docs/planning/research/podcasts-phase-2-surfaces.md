# Podcasts Phase 2 surface specification

> Current presentation (reviewed 2026-10-12): the [UI foundation](../../design/ui-foundation.md) and [shadcn audit](../shadcn-ui-audit.md) supersede conflicting layout, density, typography, rating, and control details below. This is the retained September surface contract; the per-media implementation plan records delivered behavior and remaining hardening.

> October 12 follow-up: linked show details are available for Library episodes even without a current follow or separate catalog record. Use stored episode-backed names/counts and leave unavailable catalog fields unknown. See [follow-up results](../ui-polish-followup.md).

- Date: 2026-09-20
- Status: Historical owner-approved baseline; initial production implementation delivered locally
- Scope: Podcast Archive, Spotify saved-episode Queue, and Spotify show-level
  Following only
- Source of truth: the accepted Phase 1 decision register, the 2026-09-19
  authenticated Spotify field inventory, Reader category-routing decisions,
  and the canonical ledger

## Outcome

Podcasts has three collection modes with different item types and semantics:

1. **Archive** — one row per canonical podcast episode with supported positive
   consumption evidence from Spotify or an eligible Reader Archive record;
2. **Queue** — one row per currently saved Spotify episode with a usable episode
   identity, an explicit zero playback position, and no positive playback
   evidence anywhere; and
3. **Following** — one card per currently saved Spotify show.

Archive and Queue browse episodes. Following browses shows. Saving a show never
adds its episode catalog to Queue, and an episode does not need to belong to a
followed show to appear in Archive or Queue. A saved episode that later gains
positive playback leaves Queue even when it remains saved in Spotify. Its saved
relationship remains visible in the inspector.

Archive and Queue use a compact episode list. Following uses a compact square-art
grid. There is no list/grid toggle. Episode title, show context, dates, duration,
progress evidence, and observed listening time need more horizontal structure
than an episode grid; show artwork usefully leads the separate Following view.

The compact inspector can inspect either an episode or a show without replacing
the collection. Both variants use **Details** and **History** tabs. Opening,
closing, or changing it must not reset mode, query, filters, sort, loaded pages,
or scroll position.

## Governing decisions and evidence boundary

This specification applies accepted decisions `X1-B`, `X2-B`, `X3-B`,
`X4-recommended`, `X5-recommended`, `A2-B`, `P1-B`, `P2-A`, `P3-B`, `P4-A`,
and `P5-B`.

The following rules are fixed:

- Any positive Spotify podcast playback evidence admits the episode to Archive.
  Completion is not required.
- Queue requires a usable Spotify episode identity, current saved membership
  with an explicit zero position, and no positive evidence in any retained
  Spotify source.
- `fully_played=true` is positive evidence even when position is zero. A
  historical positive export segment, earlier positive resume observation, or
  positive current-player observation defeats a later zero.
- Null or missing position is not zero. An unavailable saved row without usable
  identity is unresolved evidence, not a Queue item or placeholder episode.
- Current-player polling is enabled when the endpoint and scope are available,
  but it is supplemental. Positive progress can admit an episode; it cannot
  create a consumption timestamp or establish complete history.
- Extended Streaming History remains the lifetime and periodic reconciliation
  fallback. Saved snapshots remain authoritative for current episode/show saves.
- Spotify segments have no trustworthy session ID. Do not infer listening
  sessions, relistens, or “times played.”
- Removed, restricted, or unavailable episodes retain identity, Archive history,
  source assertions, and provenance.
- Reader podcast records enter Podcast Archive only through the accepted Reader
  routing and Archive rules. Reader Inbox, Later, Shortlist, and Feed do not
  populate Podcast Queue or Following.
- Authoritative provider identities govern merging. A Reader record joins a
  Spotify episode only with an authoritative episode identity. Title/show-name
  similarity alone never merges items.

No collection or detail request may parse R2, open the export ZIP, or call
Spotify. Every field, predicate, aggregate, and count comes from a validated D1
projection. Provider calls occur only in connector/sync work.

### Delivery labels

- **Required local** — needed for the initial surface and retained independently
  of expiring Spotify catalog content.
- **Required relationship acquisition** — a current Spotify snapshot or player
  observation needed for Queue, Following, or approved polling. Individual
  records may still be null or unavailable.
- **Optional Spotify enrichment** — refreshable Web API catalog content. It is
  displayed only while policy permits and never controls retained history.
- **Deferred** — deliberately not acquired or shown initially.

## Collection composition

### Episode rows: Archive and Queue

Each row has: (1) 3.5–4rem square artwork, (2) flexible identity/context,
(3) duration or observed-time summary, (4) mode-specific date, and (5) a compact
availability label only when not currently known available. At narrower desktop
widths, columns 3 and 4 stack beneath identity rather than disappearing. Title
may use two lines; show and metadata lines use one accessible ellipsized line.
Do not add playback controls, waveform animation, progress rings, or row actions.

Artwork fallback order is:

1. current Spotify episode image;
2. current Spotify show image attached by exact show identity;
3. Reader image from the eligible source record;
4. retained historical Spotify image only while policy permits display; then
5. a local neutral podcast placeholder.

Spotify artwork must carry catalog acquisition/expiry state, visible Spotify
attribution, and a Spotify link. Expired or deletion-required artwork falls
through; it is never copied into a permanent local artwork fact.

### Following cards

Following uses square show cards approximately 10–11rem wide. Each contains show
artwork, show name (two lines), publisher when available, **Saved in Spotify**
date, and current catalog episode count when available. Cards do not display an
invented unplayed count, newest episode, recommendation badge, listening
progress, or “up to date” state. The product does not scan every followed-show
catalog merely to fill this collection.

### Common display identity

- Episode identity is the canonical media item anchored by authoritative
  external identity; the primary Spotify identity is `spotify:episode:{id}`.
- Show identity is a separate source-owned entity anchored by
  `spotify:show:{id}`. It is not a `podcast_episode` media item.
- Episode title prefers current permitted catalog metadata, then newest non-null
  owner-export/Reader assertion. **Untitled episode** is UI-only.
- Show name follows the same current-catalog then historical-assertion rule.
  **Show unavailable** is UI-only.
- An export show-name without show ID remains a historical assertion. It can be
  searched/sorted, but cannot create/merge a show, power a show facet, or imply
  Following.

## Archive

Archive presents one episode once even with many Spotify segments, both Spotify
and Reader evidence, or multiple admitting source records.

### Archive row fields, in priority order

1. Episode/show artwork. **Optional Spotify enrichment**, with Reader/local
   fallback required.
2. Episode title. **Required local.**
3. Show name. **Required local when supplied by a source.**
4. Activity line from the latest evidence matching activity-date and evidence
   filters; otherwise latest dated supported activity overall:
   - **Playback observed Sep 12, 2026** for a positive Spotify export segment;
   - **Reader Archive Sep 12, 2026** for an eligible Reader occurrence; or
   - **Playback detected · date unavailable** for undated API/player evidence.
5. Spotify observed time: selected-range positive export milliseconds under an
   activity range, otherwise lifetime. Label **Hh Mm observed** and omit when no
   positive export duration exists. **Required local.**
6. Episode duration as **Hh Mm episode**. **Optional Spotify enrichment.**
7. **Restricted**, **Unavailable**, or **Availability unknown** only when not
   currently known available. **Optional Spotify enrichment.**

Rows omit segment count, `fully_played`, resume position, explicit/language,
description, saved state, and Following state. They never say “played N times.”

### Archive activity-date semantics

The filter is labeled **Activity date**, not Completion date.

- Positive export segments match source-asserted UTC `ts`.
- Eligible Reader occurrences match their complete temporal value and preserve
  precision and asserted/inferred basis.
- Undated API/player admission matches only **Date unavailable**.
- Inclusive calendar ranges convert boundaries through the owner timezone for
  instants. Date-only Reader values compare without UTC conversion.
- Any matching positive segment or Reader occurrence includes the episode. This
  does not promote segments to sessions or relistens.
- Row date and activity sort use matching dated evidence, not necessarily the
  latest lifetime evidence.
- Saved, publication, player-state, observation, acquisition, source-recorded,
  and ingestion times never substitute for missing activity time.

### Archive filters

All filters are server-side. Values within a facet use OR; facets combine with
AND. Membership and activity date are evaluated before distinct-item grouping.

| Label         | Exact values                                                     | Source and match rule                                                                                               |
| ------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Activity date | Any time; Custom range; Date unavailable                         | Positive export `ts`, eligible Reader occurrence, or undated positive API/player admission. Range excludes unknown. |
| Show          | Exact Spotify show identities; Show identity unavailable         | Exact identity only. Unknown includes episodes with a show-name assertion but no show ID.                           |
| Following     | Followed show; Show not followed; Show identity unavailable      | Current saved-show membership; it never changes episode membership.                                                 |
| Published     | Any date; Custom range; Date unavailable                         | Episode publication temporal value. A year/month interval matches an intersecting range.                            |
| Duration      | Under 30 min; 30–59 min; 1–2 hr; Over 2 hr; Duration unavailable | `<30`, `30..<60`, `60..120`, `>120`; exactly 120 is in `1–2 hr`.                                                    |

Show facet values are ordered by descending filtered count then normalized name,
and searchable after ten values. Counts apply all other facets but exclude their
own. Selected retired values remain visible as unavailable and clearable.

### Archive sorts

| Label          | Directions         | Key                                                                | Default                     |
| -------------- | ------------------ | ------------------------------------------------------------------ | --------------------------- |
| Activity date  | Newest / Oldest    | latest/earliest dated evidence satisfying the activity-date filter | Newest when search is empty |
| Observed time  | Most / Least       | range-matching positive export ms, or lifetime without range       | No                          |
| Published date | Newest / Oldest    | publication temporal value                                         | No                          |
| Duration       | Shortest / Longest | duration milliseconds                                              | No                          |
| Title          | A–Z / Z–A          | normalized episode title                                           | No                          |
| Show           | A–Z / Z–A          | normalized show display string                                     | No                          |
| Relevance      | Best match         | search score                                                       | Default only with search    |

Unknown values sort last in both directions. Normalized title and media-item ID
are stable ties. Non-activity sorts still display the latest matching activity.

### Archive counts

The navigation badge is the unfiltered distinct episode count. The filtered
header is **N episodes · Hh Mm observed on Spotify**; omit the suffix when the
current result has no positive export milliseconds. The time sum includes
ambiguous source duplicates because Spotify has no event ID and the ledger does
not silently discard them.

The API also returns distinct episodes, canonical relationships by source,
matching positive segment count, matching observed milliseconds, undated-only
episodes, unfiltered total, and unfiltered source totals. Segment count is
labeled **playback observations**, never plays or listens.

## Queue

Queue is exactly:

```text
usable Spotify episode identity
AND latest saved membership is active
AND latest saved resume position is explicitly 0
AND fully_played is not true
AND no retained positive export, saved/lookup progress, current-player
    progress, or other approved positive evidence exists
```

Reader state and saved-show membership cannot create Queue. A zero-duration
export segment is insufficient; explicit zero comes from current saved-episode
playback state.

### Queue row fields, in priority order

1. Episode/show artwork. **Optional Spotify enrichment.**
2. Episode title. **Required relationship acquisition when supplied.**
3. Show name. **Required relationship acquisition when supplied.**
4. **Saved in Spotify** `added_at`, or **Saved date unavailable**. **Required.**
5. Publication date with precision. **Optional enrichment.**
6. Episode duration. **Optional enrichment.**
7. Non-available availability label. **Optional enrichment.**

Queue never displays `0%`, **Unplayed**, or **Not started**. Explicit zero is an
evidence condition, not a universal claim. Details disclose the observation.

### Queue filters and sorts

| Filter     | Exact values and source                                           |
| ---------- | ----------------------------------------------------------------- |
| Saved date | Any time; Custom range; Date unavailable over saved `added_at`.   |
| Show       | Exact Spotify show identities; Show identity unavailable.         |
| Following  | Followed show; Show not followed; Show identity unavailable.      |
| Published  | Any date; Custom range; Date unavailable.                         |
| Duration   | Under 30 min; 30–59 min; 1–2 hr; Over 2 hr; Duration unavailable. |

| Sort           | Directions         | Default                     |
| -------------- | ------------------ | --------------------------- |
| Saved date     | Newest / Oldest    | Newest when search is empty |
| Published date | Newest / Oldest    | No                          |
| Duration       | Shortest / Longest | No                          |
| Title          | A–Z / Z–A          | No                          |
| Show           | A–Z / Z–A          | No                          |
| Relevance      | Best match         | Default only with search    |

Unknown values sort last; normalized title and media-item ID are ties. Queue has
no source filter because its source is necessarily Spotify saved episodes. The
badge is unfiltered valid Queue episodes; header is filtered distinct episodes.
Unresolved saved rows are excluded from both.

## Following

Following is exactly active Spotify saved-show membership. The product view is
called Following, but source `added_at` is labeled **Saved in Spotify**, not
“followed since.” Saving a show never queues its episodes. Removing one retires
Following only after a complete scan and never removes episodes or history.

### Following card fields, filters, and sorts

Cards show: artwork, show name, publisher, **Saved in Spotify** date,
`total_episodes` as **N episodes**, and a non-available availability label.
Identity/date are required relationship acquisition; other catalog fields are
optional enrichment.

| Filter           | Exact values and source                                                                   |
| ---------------- | ----------------------------------------------------------------------------------------- |
| Saved date       | Any time; Custom range; Date unavailable over saved-show `added_at`.                      |
| Publisher        | Current publisher strings; Publisher unavailable.                                         |
| Language         | Current source language strings; Language unavailable; OR across arrays.                  |
| Library episodes | Has Archive episodes; Has Queue episodes; No Library episodes, using exact show identity. |

| Sort          | Directions      | Default                     |
| ------------- | --------------- | --------------------------- |
| Saved date    | Newest / Oldest | Newest when search is empty |
| Show          | A–Z / Z–A       | No                          |
| Publisher     | A–Z / Z–A       | No                          |
| Episode count | Most / Least    | No                          |
| Relevance     | Best match      | Default only with search    |

Unknown values sort last; normalized show name and show-projection ID are ties.
Badge is unfiltered active shows; header is filtered shows.

## Search

Search is server-side, scoped to mode and filters, case-insensitive, and
Unicode-normalized. Multiple tokens use AND; the final token supports prefix
matching.

Archive and Queue rank episode title, current show name, retained export/Reader
episode title, retained export/Reader show name, then current publisher attached
through exact show identity. Following ranks show name then publisher. Spotify
and Reader descriptions, raw HTML, playback reasons, internal IDs, provenance,
and raw payloads are not collection search targets. This avoids turning expiring
Spotify descriptions into a permanent full-text corpus.

Placeholders are **Search episodes or shows** and **Search followed shows**.
With a query, **Relevance** becomes default. Clearing it restores the mode's
ordinary default unless the user explicitly selected another sort.

## Dates, progress, observed time, and availability

### Date meanings

| Display concept      | Source                        | Exact treatment                                                      |
| -------------------- | ----------------------------- | -------------------------------------------------------------------- |
| Playback activity    | positive export `ts`          | UTC source-asserted segment-end instant; not session end/completion. |
| Reader Archive       | eligible canonical occurrence | Preserve precision and asserted/inferred basis.                      |
| Saved episode/show   | `added_at`                    | UTC relationship instant; never consumption.                         |
| Published            | `release_date` plus precision | Preserve year/month/day; never fill missing parts.                   |
| Player state changed | player `timestamp`            | Provenance only, not consumption.                                    |
| Progress observed    | local observation time        | When mutable state was seen; provenance only.                        |
| Ingested             | local ingestion time          | Operational provenance only.                                         |

### Progress rules

Store each saved-episode, episode-lookup, show-scan, and current-player progress
observation with channel and observation time. Detail may summarize the newest,
but a later zero never overwrites positive history.

The inspector's current Spotify state uses this order:

1. `fully_played=true`: **Marked fully played in Spotify**;
2. positive position: **Resume position Hh Mm**, or **Hh Mm of Hh Mm** when
   duration is known, with a neutral derived percentage;
3. explicit zero: **Resume position 0:00**;
4. null/missing: **Resume position unavailable**.

It separately says **Observed [date/time]**. Derive a percentage only with a
positive duration and defensible position; never label it completion. A player
observation can be newest, but device, volume, repeat, shuffle, context, and
private-session facts are neither projected for UI nor displayed.

### Observed-time rules

- Observed time sums positive owner-export `ms_played` rows only.
- Resume position and player `progress_ms` are positions, not duration.
- Zero-duration segments remain evidence but add no time and do not admit.
- Ambiguous duplicate rows remain separate until a measured deterministic
  reconciliation rule proves otherwise.
- Period totals include positive segments whose `ts` is in the owner-timezone
  range.
- Segment count means **playback observations**, not plays, sessions, or
  completions.
- Total observed time can exceed episode duration. Never cap it or divide it by
  duration to invent completion/play counts.

### Availability states

- `available` — current non-expired lookup says playable in configured market
  with no active restriction;
- `restricted` — current object supplies a restriction or explicit non-playable
  restriction; this is an episode state because the verified show shape has no
  equivalent restriction field;
- `unavailable` — exact lookup returns a durable not-found/unavailable result
  under refresh policy;
- `unknown` — no lookup, unusable null row, expired cache, transient failure, or
  ambiguous market state.

Provider failure never changes a known item to Unavailable. Restriction reasons
are open values and appear only as safe factual detail. History and assertions
remain when availability changes.

## Episode inspector

The fixed header contains artwork, episode title, show name, independent chips
for **Archive**, **Queue**, **Saved episode**, and **Followed show**, plus
validated **Open in Spotify** and **Open in Reader** links. `Saved episode` can
coexist with Archive though Queue cannot. There are no playback, mark-played,
save/remove, follow/unfollow, Queue-write, download, preview, or AI actions.

### Episode Details tab

Sections appear in this order and are omitted when empty.

1. **Listening** — Archive sources; lifetime positive Spotify observed time and
   observation count; first/latest dated positive segment; current resume or
   fully-played state and observed time; saved-episode state/date; and **History
   since the last Spotify export may be incomplete** with the last export date.
   If only API/player evidence exists, say **Playback detected; observed
   duration and activity date unavailable**. Never say plays/listens.
2. **Episode** — safe description, publication date/precision, duration,
   explicit flag, languages, externally hosted state when true, and current
   availability/restriction/check time. These are optional refreshable Spotify
   enrichment; missing values are omitted. Audio preview is deferred.
3. **Show** — exact show name/art, publisher, safe description, languages/media
   type, explicit/external-hosting flags, catalog episode count, Following
   state/date, and links to exact-show Archive/Queue filters. Omit without an
   authoritative show identity; historical show-name text stays in Source.
4. **Reader** — for eligible Reader relationships: current location, original
   and Reader links, author/publication when useful, and retained Archive
   temporal value/basis. Reader Queue-like locations are explicitly not Podcast
   Queue.
5. **Source** — collapsed Spotify episode/show identities, connection and
   `best_effort` coverage, last saved snapshot/player poll/export import,
   catalog acquisition/expiry, validated links/attribution, differing historical
   assertions, and upstream/retired identity state.

Source excludes raw-object keys, ULIDs, platform/IP/country/private-session
facts, devices, and tokens.

### Episode History tab

History starts with:

- **Hh Mm observed across N playback observations** when export duration exists;
- **First observed [date] · Latest observed [date]** when segments are dated;
- **Playback detected; activity date unavailable** for API/player-only admission;
  and
- a separate row for every retained eligible Reader Archive occurrence.

Then show newest-first supported relationships:

1. **Spotify playback** — one relationship summary with first/latest positive
   segment, total observed time, observation count, and **Matches current
   filters** when applicable; never one row per inferred listen.
2. **Reader Archive** — occurrence date, precision, basis, source, and match.
3. **Current Spotify state** — saved membership, latest progress observation,
   and availability, separate from dated history.

An optional collapsed **Playback observations** technical disclosure may expose
raw export observations 25 at a time with only `ts`, `ms_played`, safe start/end
reason, skipped flag, and evidence source. It never groups sessions or shows
platform, IP, country, offline/private flags, raw paths, or indexes. The initial
surface is complete without this disclosure.

A final optional collapsed **Provenance** UI may show safe admission/evidence
summaries, parser versions, observation channels, supersession/removal evidence,
and latest sync. Underlying lineage/API support remains required. Observed or
ingested time is never relabeled as consumption.

## Show inspector

The header has show art, name, publisher, **Following**, and **Open in Spotify**.
There are no follow/unfollow or playback actions.

### Show Details tab

1. **Following** — current state, **Saved in Spotify** date, last complete
   snapshot, and current/retired state.
2. **About** — safe description, publisher, languages, media type,
   explicit/external-hosted flags, permitted copyright text, and catalog episode
   count.
3. **In your Library** — distinct Archive/Queue episode counts joined by exact
   show identity, with filtered links. Never claim unheard catalog count.
4. **Availability** — current available/unavailable/unknown state and check time.
5. **Source** — show identity/link, attribution, connection, relationship
   snapshot, catalog acquisition/expiry, and upstream state.

### Show History tab

Show saved date, first/latest successful observations and active state; explicit
removal only when a complete snapshot retired the relationship; and optional
collapsed safe provenance. Do not list the full episode catalog, fabricate a
follow start before `added_at`, or turn catalog episodes into history. A removed
show can remain inspectable from an episode.

## Current-player polling and UI implications

When endpoint and scope are available, hourly Spotify reconciliation and
explicit **Sync now** poll current playback. Store a successful body before
normalization. `204` is a successful empty observation, not proof nothing was
played.

Only item type, usable episode identity, progress, player state-change timestamp,
play/pause state, and local observation time enter the Podcast projection.
Device, volume, shuffle/repeat, actions, private state, and context are excluded.

For a usable episode with `progress_ms > 0`:

- reconcile its single Spotify Archive relationship;
- exclude it from Queue even if another current observation is zero;
- do not manufacture `consumed_at` from player/poll time;
- leave observed-time totals unchanged; and
- invalidate counts and first Archive/Queue pages after commit.

Library never shows **Now playing**, live animation, notifications, or inferred
sessions. A selected Queue episode moved to Archive keeps its inspector open as
**Not in current results**. Missed polls are expected; coverage and last-export
date explain the gap.

Missing scope, `204`, transient failure, expired auth, or outage never clears
history or saved membership. Player failure can degrade that capability while a
saved-library scan commits; Connections reports the partial failure.

## Empty, missing, unavailable, and error states

| Condition               | Required presentation                                                        |
| ----------------------- | ---------------------------------------------------------------------------- |
| Archive empty           | **No podcast episodes in Archive.**                                          |
| Queue empty             | **No saved podcast episodes are currently queued.**                          |
| Following empty         | **No followed podcast shows.**                                               |
| No matches              | **No podcasts match these filters.** with **Clear filters**; preserve query. |
| Missing title           | **Untitled episode** as UI-only fallback.                                    |
| Missing show            | Omit line; use **Show unavailable** only when absence matters.               |
| Missing artwork         | Local placeholder; never borrow expired art.                                 |
| Missing activity date   | **Playback detected · date unavailable**; Any/Unknown only.                  |
| Missing saved date      | **Saved date unavailable**; never substitute observed/ingested.              |
| Missing duration        | Omit and match Duration unavailable.                                         |
| Null saved-row identity | No card; preserve unresolved evidence and aggregate coverage.                |
| Restricted/unavailable  | Keep row/history, show state, disable absent/invalid links.                  |
| Cache expired           | Render local facts/art fallback; **Spotify details need refresh** in Source. |
| Partial/failed snapshot | Retain Queue/Following; coverage warning and Connections link.               |
| Export old/missing      | Data usable; explain possible history gap with last export date.             |
| Collection failed       | **Podcasts could not be loaded** with Retry/Connections.                     |
| Detail failed           | **Podcast details could not be loaded** with Retry/Close.                    |

Return `unresolvedSavedEpisodeCount`. If nonzero, Queue may say **N saved Spotify
rows could not be identified** with a Connections link; these never inflate the
count. If filters remove selection, keep inspector open as **Not in current
results**; close returns focus to trigger or results heading.

## URL, selection, and remembered state

Canonical routes are:

```text
/library/podcasts/archive
/library/podcasts/queue
/library/podcasts/following
```

URL query state is:

```text
q
sort
dir
activityMode / activityFrom / activityTo
savedMode / savedFrom / savedTo
show
following
publishedMode / publishedFrom / publishedTo
duration
publisher
language
libraryEpisodes
item
```

Activity applies only to Archive; saved date to Queue/Following. Other
parameters are accepted only where their filter tables name them. Incompatible
parameters are removed by URL normalization and rejected if sent to the API.
Multi-values repeat in stable sorted order; defaults are omitted.

Selection is typed:

```text
item=episode:<canonical-media-item-id>
item=show:<podcast-show-projection-id>
```

Archive/Queue accept episodes; Following accepts shows. An episode can link to a
show selection with a return history entry. Invalid/ineligible IDs render inline
not-found state without discarding the collection.

Opening pushes history; closing removes only `item` with Back-equivalent
behavior. Back/Forward restores mode, query, filters, sort, selection, loaded
pages, scroll anchor, and inspector scroll. A direct link loads first collection
page and detail independently. Loaded cursors/raw offsets are session-history,
not URL state. Modes remember independent state. Appearance/sidebar preference
is separate. Rapid selection cancels/ignores stale responses.

## Pagination and consistency

- Archive/Queue request 50 rows per page; Following requests 48 cards.
- Collection API permits `limit=1..100`.
- Episode relationship history requests 20, maximum 50.
- Optional raw observations request 25, maximum 100.
- Use server-side keyset pagination with opaque versioned cursors bound to mode,
  normalized filters, search, sort, direction, and owner timezone.
- Collection cursors contain null rank, sort value, normalized title/show tie,
  and stable ID; relevance also contains rank.
- Observation cursors contain source `ts`, stable raw/source order, and ID so
  same-second/byte-identical rows remain distinct.
- Cursor/query mismatch returns `BAD_REQUEST`.
- Counts/facets cover the whole predicate, not loaded pages.
- Query/filter/sort change clears pages. A committed sync invalidates page chain
  and refetches first page/counts.
- No snapshot isolation is promised across live pages. Client deduplicates by
  canonical episode ID or show-projection ID and offers Refresh after sync.

The UI may prefetch one page but never auto-download all Archive rows, show
catalogs, or playback observations.

## API contract requirements

Add typed Podcast contracts to `packages/contracts`. Hono stays thin;
repository/service code owns predicates, aggregates, facets, and cursors. Do not
overload summary-only `GET /api/media` with source details.

### `GET /api/library/podcasts`

Query fields:

```text
mode=archive|queue|following
q=<string>
limit=<1..100>
cursor=<opaque>
sort=<mode-specific enum>
dir=asc|desc

activityMode=any|range|unknown                 (Archive)
activityFrom=YYYY-MM-DD
activityTo=YYYY-MM-DD
savedMode=any|range|unknown                    (Queue/Following)
savedFrom=YYYY-MM-DD
savedTo=YYYY-MM-DD

show=<Spotify show identity>|unknown           (Archive/Queue; repeatable)
following=followed|not_followed|unknown        (Archive/Queue; repeatable)
publishedMode=any|range|unknown                (Archive/Queue)
publishedFrom=YYYY-MM-DD
publishedTo=YYYY-MM-DD
duration=under_30|30_59|60_120|over_120|unknown (Archive/Queue; repeatable)
publisher=<normalized value>|unknown           (Following; repeatable)
language=<source value>|unknown                (Following; repeatable)
libraryEpisodes=archive|queue|none             (Following; repeatable)
```

Validate date pairs, repeat limits, mode compatibility, cursor binding, and
owner timezone. Reject incompatible direct parameters rather than ignoring them.

Response:

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
    matchingPositiveSegments: number
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
  memberships: { archive: boolean; queue: boolean; savedEpisode: boolean }
  publishedAt: TemporalValue | null
  durationMs: number | null
  explicit: boolean | null
  availability: 'available' | 'unavailable' | 'unknown'
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
  explicit: boolean | null
  availability: 'available' | 'restricted' | 'unavailable' | 'unknown'
  libraryCounts: { archiveEpisodes: number; queueEpisodes: number }
}
```

Collection responses exclude descriptions/HTML, source-record arrays, raw
observations, device facts, raw payloads, and signed URLs.

### Detail and child endpoints

Add:

```text
GET /api/library/podcasts/episodes/:mediaItemId
GET /api/library/podcasts/episodes/:mediaItemId/history?limit=20&cursor=...
GET /api/library/podcasts/episodes/:mediaItemId/observations?limit=25&cursor=...
GET /api/library/podcasts/shows/:showId
GET /api/library/podcasts/shows/:showId/history?limit=20&cursor=...
```

Episode detail returns every inspector field, memberships, current progress,
lifetime summary, coverage, availability/refresh state, validated links, and
first history page. It resolves Archive, Queue-only, and retained unavailable
episodes; active Archive is not required.

History always returns complete supported relationships, not only matches.
Optional collection filter context only computes `matchesCurrentFilters`.
Spotify playback is one aggregated relationship row. The observations endpoint
is needed only if the optional disclosure ships and returns only approved safe
fields with bounded pages.

Show detail returns current/retained saved relationship, refreshable fields,
availability, attribution, and exact-identity Library counts. It resolves shows
referenced by episodes even after Following retirement. Show history returns
membership observations/removal, not episode catalog.

All responses are Zod-validated. Stable errors distinguish invalid query,
ineligible/not found, expired enrichment unavailable, coverage degradation, and
internal failure.

## Required acquisition and projections

### Required local history and identity

1. Project every podcast export row into source-owned playback observations with
   exact episode identity, `ts`, `ms_played`, safe reason/skip facts,
   raw/source-record lineage, and parser version. Platform, IP, country,
   offline, and private-session facts remain protected raw evidence.
2. Keep one canonical Spotify Archive relationship per episode and monotonic
   latest positive date. Preserve all observations; create no sessions/relistens.
3. Maintain replay-safe episode aggregates for first/latest positive segment,
   count, and observed ms. Arbitrary ranges still query indexed observations.
4. Retain export and Reader title/show assertions separately from mutable
   catalog projection.
5. Route eligible Reader Podcast Archive through authoritative identity and keep
   its occurrences/source state independently queryable.

### Required relationship acquisition

1. Complete `GET /me/episodes` snapshots with raw pages before validation;
   project active save, `added_at`, usable episode/show identity, exact
   zero/positive/null progress, `fully_played`, observed time, and unresolved
   state.
2. Complete `GET /me/shows` snapshots; project save, `added_at`, show identity,
   and last complete snapshot.
3. Poll `GET /me/player` when scope is available; preserve raw successful body
   and minimal episode progress. A `204` updates capability/last-poll only.
4. Retire membership only after every account-scoped snapshot page commits and
   parses. Partial/failed scans retire nothing.
5. Compute Queue from the union of every positive Spotify evidence channel,
   transactionally with saved/progress/playback writes.

### Optional Spotify enrichment

- exact-ID lookup for export-only episodes;
- current episode description, artwork, duration, publication precision,
  explicit/language/hosting/playability/restriction, and embedded show;
- show artwork, description, publisher, language/media flags, copyright,
  episode count, and availability; and
- selected show-episode scans only to improve positive-playback discovery. They
  never create Queue from zero rows and are not required for Following.

Use a provider-specific refreshable cache with acquisition, expiry, deletion,
market, outcome, and source link. Local items render without it. Failure/expiry
cannot erase history or assertions.

### Deferred

- audio/preview playback or download;
- full followed-show catalog and unheard/unplayed calculations;
- inferred sessions/relistens/completion history/“times played”;
- recommendations, ratings, reviews, notes, transcripts, generated summaries,
  embeddings, and LLM use of Spotify content;
- manual Queue edits, save/follow writes, conflict resolution, and mirroring;
- device/context/private/location/platform UI; and
- Spotify audiobooks in Podcasts.

## Storage model requirements

Final SQL names may differ, but these must be separate queryable projections,
not JSON parsed by handlers:

1. **Episode identity/assertions** — canonical media item, episode URI/ID,
   retained export/Reader assertions, and identity retirement.
2. **Spotify show** — show ID/URI, current permitted catalog fields, sort keys,
   availability, cache acquisition/expiry, and source link. Historical names
   remain assertions.
3. **Episode-show relationship** — exact identities and observation lineage;
   mutable embedded show data cannot destroy prior links.
4. **Saved-episode membership** — current account-scoped row per episode with
   added time, active/removed state, latest complete snapshot, and source record.
5. **Saved-show membership** — current account-scoped row per show with the same
   relationship state and lineage.
6. **Progress observations** — saved/lookup/show-scan/player channel, episode,
   fully-played, position, optional player timestamp, observed time, source
   record, and disposition.
7. **Playback observations** — every export segment with episode, source instant,
   milliseconds, safe reason/skip, connection, lineage, and positive/zero class.
8. **Listening aggregate** — connection/episode lifetime count/time/first/latest
   plus `has_any_positive_evidence`, updated idempotently. It is an accelerator,
   not source truth.
9. **Reader podcast link** — eligible Reader document/occurrence, canonical item,
   authoritative identity resolution, and current Reader state.
10. **Podcast search projection** — episode/show title assertions and current
    publisher only. Cache expiry/removal deletes expired catalog terms while
    owner-export/Reader terms remain.

Raw API catalog bodies subject to deletion/expiry are not immutable owner-export
evidence. Replay of old API pages cannot restore catalog cache after policy says
it expired/deleted. The provider-cache ADR approved in Phase 1 is required
before this acquisition ships.

## Required indexes and query invariants

Add or verify equivalent indexes:

```text
spotify_episode_identities(episode_uri) UNIQUE
spotify_episode_identities(media_item_id, retired_at)

spotify_shows(show_uri) UNIQUE
spotify_shows(name_sort, id)
spotify_shows(availability, name_sort, id)
spotify_shows(cache_expires_at, cache_state)

spotify_episode_shows(media_item_id, show_id, upstream_state) UNIQUE
spotify_episode_shows(show_id, media_item_id)

spotify_saved_episodes(connection_id, episode_uri) UNIQUE
spotify_saved_episodes(connection_id, upstream_state, added_at DESC, media_item_id)
spotify_saved_episodes(connection_id, upstream_state, explicit_zero, media_item_id)

spotify_saved_shows(connection_id, show_id) UNIQUE
spotify_saved_shows(connection_id, upstream_state, added_at DESC, show_id)

spotify_progress_observations(connection_id, episode_uri, observed_at DESC, id)
spotify_progress_observations(episode_uri, positive_evidence, observed_at DESC, id)

spotify_playback_observations(source_record_id) UNIQUE
spotify_playback_observations(connection_id, episode_uri, source_ts DESC, id)
spotify_playback_observations(episode_uri, positive, source_ts DESC, id)

podcast_listening_aggregates(connection_id, episode_uri) UNIQUE
podcast_listening_aggregates(latest_positive_at DESC, media_item_id)
podcast_listening_aggregates(total_observed_ms DESC, media_item_id)

archive_entries(media_item_id, connection_id, upstream_state)
archive_entries(connection_id, consumed_at_value DESC, media_item_id, id)
```

Also index normalized episode title, show name, publisher, publication date,
and duration with stable IDs as ties, plus D1 FTS5 (or equivalent) for approved
search fields.

Queries must satisfy:

1. One episode per mode despite Spotify/Reader/many observations.
2. Queue is an account-scoped anti-join against every positive Spotify channel;
   later zero never wins.
3. Following is account-scoped saved-show state, never derived episode state.
4. Activity ranges use `EXISTS` over positive observations/Reader occurrences;
   display/sort date comes from the filtered set.
5. Observed totals use the same activity-date predicate as rows/counts.
6. Counts, facets, rows, and cursors share eligibility/membership logic.
7. Every keyset sort has explicit null rank; unknown is last both directions.
8. Exact show identity governs facets, Following joins, and show counts; text
   never becomes a join.
9. Complete account snapshots alone retire membership.
10. Detail/history never decompress exports or parse raw pages.
11. Cache failure/expiry cannot hide history or restore deleted content.
12. Replay produces identical membership, positive flag, aggregate, count, and
    cursor order.

Check query plans at realistic sizes for default modes, every sort, activity-date
filters, Queue anti-join, and exact-show counts. Never load all IDs/observations
into application memory for pagination.

## Spotify attribution, retention, and AI restrictions

Spotify API metadata/artwork is governed provider content, not unrestricted
permanent ledger data.

- Every display using Spotify API metadata/artwork includes visible Spotify
  attribution and a working Spotify link under current design guidelines.
  Artwork is not impermissibly cropped, altered, or downloaded.
- Catalog objects carry acquisition, refresh, expiry, deletion, and market
  state. Remove/refresh under provider policy and fall back to export/Reader/
  local facts.
- Owner Extended Streaming History remains immutable private evidence but is
  separate from expiring API catalog payloads and remains source-attributed.
- Never download Spotify audio. Preview/audio URLs are not exposed initially.
- Spotify API descriptions, artwork, catalog metadata, and playback state are
  excluded from LLM prompts, embeddings, training, generated summaries, and AI
  retrieval. Deterministic Library display/filter/search uses only the permitted
  current projection.
- Future Chat/Recaps must enforce provider-aware field exclusion rather than
  assume every Podcast field is authorized AI context.
- Sensitive export/player fields remain raw and out of ordinary UI/analytics.

Exact cache duration/deletion mechanics require the Phase 1 provider-specific
ADR. This contract does not weaken later stricter provider policy.

## Validation criteria for later implementation

Implementation is complete only after tests prove:

1. valid saved explicit-zero/no-positive episode appears in Queue;
2. historical positive export excludes a current-zero saved episode;
3. positive progress, `fully_played=true`, and player progress each admit Archive
   and exclude Queue without fabricating date;
4. null/unavailable rows stay unresolved without cards;
5. saved show appears once in Following and never expands into Queue;
6. complete-snapshot removal retires membership without deleting history, while
   partial/failed scans retire nothing;
7. Reader podcast merges only by identity or remains separate and never creates
   Podcast Queue;
8. many segments create one row, exact range/lifetime totals, and no session
   count;
9. older ranges match older observations and mark History despite later data;
10. timezone boundaries, Reader precision/basis, publication precision, saved
    dates, and unknown dates follow this contract;
11. available/restricted/unavailable/expired/transient/unknown states preserve
    local history;
12. player `204`, missing scope, failure, and stale poll neither create nor clear
    history, and no Now Playing UI appears;
13. cache expiry/deletion removes governed art/metadata/search terms without
    removing history or restoring stale content on replay;
14. every filter, facet count, sort, null order, aggregate, and keyset cursor is
    correct beyond one page;
15. episode/show deep links, Back/Forward, focus/scroll/page restoration, stale
    response protection, and Not in current results preserve state;
16. missing title/show/art/duration/date/progress/publisher/language/description/
    show identity use specified neutral states; and
17. Graphite light/dark remains legible with sidebar expanded/collapsed and each
    inspector open/closed.

The later implementation must run required checks after its final code/test
edit. This baseline changes documentation only and does not authorize connector
calls, schema changes, shared-document edits, or code implementation.
