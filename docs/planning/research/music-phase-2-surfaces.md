# Music / Songs Phase 2 surface specification

> Presentation update (2026-10-04): [UI polish](../ui-polish.md) supersedes conflicting layout, density, typography, rating, and control details below. Source semantics remain unchanged.

- Date: 2026-09-20
- Status: Owner-approved implementation baseline; no behavior described here is shipped
- Scope: Spotify-backed Songs Tracks, Albums, and Artists surfaces only
- Source of truth: the accepted Library Phase 1 decision register, the
  2026-09-19 authenticated Spotify field inventory, the canonical ledger, and
  the catalog reconnaissance

## Outcome

Songs is a playback-history experience with three local views:

1. **Tracks** — one dense row per Spotify track URI with qualifying playback;
2. **Albums** — release rollups over qualifying playback for tracks with an
   exact Spotify album identity; and
3. **Artists** — creator rollups over qualifying playback for tracks with exact
   Spotify artist identities.

There is no Songs Queue and no Archive/Queue switch. Saved tracks, saved albums,
followed artists, and Spotify top items are not Songs membership. Saved state may
later become a filter or relationship marker, but its acquisition and display
are deferred until the playback collection, aggregation, and reconciliation
paths work at realistic scale.

Tracks is the authoritative item view. Albums and Artists are history-derived
groupings, not canonical media items and not claims that an album was heard in
full, saved, or that an artist was followed. A track with several artist credits
contributes its playback to every exactly identified credited artist, so artist
row totals are intentionally non-additive.

The collection uses a 30-second export threshold: an Extended Streaming History
song row qualifies when `ms_played >= 30_000`. A Recently Played API event
qualifies immediately even though it has no duration or skip evidence. This is
an explicit source-specific exception, not evidence of a completed play. Every
source observation is preserved whether it qualifies or not.

The UI uses the noun **qualifying playback**. It does not label source rows,
normalized occurrences, or aggregate counts as completed listens, full plays,
or times played. **Observed time** is the sum of source-reported duration from
qualified export evidence only. A qualifying API-only occurrence increases the
playback count but contributes zero to observed time until export evidence is
deterministically reconciled to it.

## Governing decisions and delivery boundary

This specification applies accepted choices `X1-B`, `X2-B`, `X3-B`,
`X4-recommended`, `X5-recommended`, `S1-A`, `S2-B`, `S3-A`, `S4-B`, `S5-A`,
`S6-B`, and `S7-B`.

Required for the complete Songs slice:

- replay-safe projection of every identified song row from Extended Streaming
  History;
- best-effort Recently Played polling with a durable committed checkpoint;
- one song media item per original Spotify track URI;
- qualification, reconciliation, lifetime aggregates, selected-period
  aggregates, bounded history, and stable pagination;
- dense Tracks, history-derived Albums, history-derived Artists, and their
  compact inspectors; and
- exact-identity Spotify catalog enrichment sufficient to resolve ordered
  artist and album identities where provider policy permits it.

Explicitly deferred:

- saved-track and saved-album snapshots, filters, and markers;
- followed-artist state and the missing `user-follow-read` reauthorization;
- provider top tracks/artists, popularity, followers, and genre-affinity data;
- MusicBrainz matching, cross-release recording merges, and automatic ISRC
  merges;
- lyrics, audio, previews, playback controls, scrobbling, ratings, reviews,
  manual corrections, and upstream writes; and
- Spotify audiobook/chapter projection. Audiobook observations remain separate
  source evidence pending a Books-domain identity and admission decision.

No collection, detail, count, facet, or history request may parse the Spotify
ZIP, read an entire raw API page set, or download the owner's full export. Every
field used by these surfaces must have a validated, indexed projection.

## Source classification, identity, and membership

### Song observation classification

Classify one Extended Streaming History row as a song only when it has a usable
`spotify_track_uri` and does not carry a conflicting episode, audiobook, or
chapter identity. Use this precedence:

1. audiobook or chapter identity -> deferred audiobook evidence;
2. episode identity -> podcast evidence;
3. track identity -> song evidence; and
4. no usable identity or conflicting identities -> unresolved evidence.

Never create a song item from title, artist, album text, ISRC, or a URL without a
validated Spotify track identity. Unresolved rows remain source records.

### Track identity

One `media_items(type='song')` row represents one original Spotify track URI.
The global external identity is `spotify / track_uri / spotify:track:{id}`.

- Do not merge track URIs by title, artist, normalized text, ISRC, album, or
  duration.
- Preserve ISRC as matching evidence only.
- Preserve `linked_from` as an explicit relationship between the imported
  identity and Spotify's currently playable replacement. Relinking never
  rewrites historical evidence or silently changes the item's primary identity.
- Album URI identifies a release/container, not the recording.
- Artist URI identifies a credited artist, not a listening occurrence.
- Ordered track artist credits and album artist credits remain separate arrays.

Current display metadata may differ from historical export text. A valid,
unexpired exact-ID catalog cache supplies current title, ordered artists, album,
art, duration, explicit flag, track/disc numbers, release date, and ISRC. The
original title, album-artist text, album text, and track URI remain immutable
source observations and are disclosed in Source when they differ.

### Qualification and Songs membership

Each normalized playback occurrence has one of these exact qualification
bases:

| Basis                        | Qualifies | Rule                                                                                       |
| ---------------------------- | --------- | ------------------------------------------------------------------------------------------ |
| `export_at_least_30_seconds` | Yes       | Identified song row with `ms_played >= 30_000`. `skipped` does not override the threshold. |
| `recent_api_exception`       | Yes       | Identified Recently Played event. Duration and skip state are unavailable.                 |
| `export_under_30_seconds`    | No        | Identified song row with `0 < ms_played < 30_000`.                                         |
| `export_zero_duration`       | No        | Identified song row with `ms_played = 0`.                                                  |
| `unresolved_identity`        | No        | No usable, unambiguous track identity.                                                     |

A track belongs in Songs while it has at least one active qualifying normalized
playback occurrence. The canonical ledger receives one active Archive entry per
connection and track URI with admission reason
`spotify_song_qualified_playback`. That entry represents Songs membership, not
one listen. Its consumed instant is the latest qualifying occurrence and moves
forward monotonically. Source-owned playback projections, not Archive entries,
provide activity counts, period matching, and history.

An Archive admission link points to the first qualifying evidence; later
evidence that advances the latest consumed instant is linked with occurrence-
time provenance. Every observation remains independently traceable through the
source-owned projection even when it does not add an Archive evidence link.

## Playback observations, normalized occurrences, and reconciliation

### Three distinct records

Keep these concepts separate:

1. A **source observation** is one addressable row in one export member or one
   item in one acquired API page. It is immutable and never discarded merely
   because its content is identical to another row.
2. A **normalized playback occurrence** is the unit used once in counts. It has
   one or more evidence observations only when a deterministic reconciliation
   rule links them.
3. A **qualifying playback** is a normalized occurrence whose qualification
   basis is one of the two qualifying bases above. It is not a completed listen.

Source-local replay idempotency and cross-source reconciliation are independent.
Reprocessing the same raw object and parser version creates no new source
observation or normalized occurrence.

### Export observations

Within one ZIP, the durable observation identity is raw object, member name,
and array index. Preserve exact duplicate rows and same-second rows. The first
complete export can establish the initial playback projection.

For a later different lifetime export, retain every observation. Match repeated
observations only with a versioned rule validated against an actually
overlapping owner export. A permissible rule may use normalized full-row facts
plus a duplicate ordinal, but this document does not approve an unmeasured rule.
Until that validation exists, a new export may be stored and inspected but must
not silently double the active aggregate projection. Connections reports the
import as awaiting reconciliation rather than successful Songs aggregation.

### Recently Played observations

One poll snapshot may contain identical track-URI and `played_at` pairs. Build a
snapshot-local ordinal for every identical pair. Across overlapping polls, the
normalized projection retains the maximum observed multiplicity for
`(connection, track URI, played_at, duplicate ordinal)`, while every acquired
page item remains source evidence. This prevents ordinary overlap polling from
recounting the same bounded recent window and still preserves two identical
events observed in one snapshot.

This is not a claim of upstream uniqueness. Two polls could contain different,
indistinguishable real events. The source evidence remains replayable so the
projection can be revised.

### Export/API reconciliation

Do not merge an export row and a Recently Played event using title, track URI
alone, same calendar day, or an arbitrary time window. Export `ts` is a
whole-second segment-end instant; API `played_at` was observed with milliseconds
and does not include played duration. The current probe has no overlapping
export/API window that proves a cross-surface key.

When a measured overlap supports a deterministic, versioned rule, link both
observations to one normalized occurrence. That occurrence:

- is counted once;
- retains both evidence links and both original timestamps;
- uses export `ms_played` once for observed time;
- is `export_at_least_30_seconds` when the export row qualifies;
- remains qualified by `recent_api_exception` when its matched export row is
  below 30 seconds; and
- is marked `reconciled=true` for source disclosure.

Until such a rule exists, API events qualify immediately and remain API-only.
If a later export overlaps them without deterministic reconciliation, preserve
both occurrences and show **Recent activity may overlap this export** in the
collection coverage disclosure and inspector Source section. Totals may change
after a later parser/reconciliation version; the UI must not hide this
uncertainty or perform a fuzzy client-side merge.

## Aggregate semantics

Every Track, Album, and Artist row receives two server-computed aggregates:

```text
period
  qualifyingPlaybackCount
  exportBackedPlaybackCount
  apiOnlyPlaybackCount
  reconciledPlaybackCount
  playbacksWithObservedDuration
  observedMs
  firstPlayedAt
  latestPlayedAt

lifetime
  same fields
```

`period` uses the active played-date and playback-source predicates. `lifetime`
ignores only the played-date range; it continues to honor the selected account
and playback-source predicates. With All time selected, the two aggregates are
equal and the UI renders one value rather than duplicate labels.

`qualifyingPlaybackCount` counts normalized occurrences once.
`exportBackedPlaybackCount` includes reconciled occurrences with export
evidence. `apiOnlyPlaybackCount` has no export evidence.
`playbacksWithObservedDuration` is the number of counted occurrences that
contribute source duration. `observedMs` sums qualifying export duration once
per normalized occurrence. It never uses track duration, estimates API-event
duration, divides duration into assumed plays, or includes excluded rows.

Album and artist aggregates roll up only tracks connected through exact
identities. Album rows additionally return unique qualifying tracks. Artist rows
return unique qualifying tracks and exact releases. One multi-artist occurrence
is counted once in each credited artist's aggregate but once in whole-view
counts.

The server computes selected-period and lifetime values. The browser never
downloads activity and groups it locally.

## Shared collection controls

Songs navigation contains **Tracks**, **Albums**, and **Artists**, with no Queue
tab, disabled Queue control, or Queue count. Switching views preserves compatible
search, period, source, and account filters. It removes incompatible album,
artist, explicit, metadata, or album-type filters rather than silently ignoring
them.

The period control has these exact choices:

- **All time** (default);
- **This year**;
- **Last 12 months**; and
- **Custom range** with one or both inclusive calendar-date bounds.

Presets resolve to explicit `from`/`to` values in the owner's configured IANA
timezone. The normalized URL and API request include the timezone. A calendar
date maps to `[local day start, next local day start)` and is converted to UTC
for querying, preserving daylight-saving boundaries. `ts` and `played_at` remain
stored UTC instants.

Common occurrence filters:

| Filter          | Exact choices                                                          | Semantics                                                                                                                                           |
| --------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Activity source | All activity; Extended Streaming History; Recently Played API          | Matches occurrences with evidence from the chosen source. A reconciled occurrence matches either source but is counted once when both are selected. |
| Spotify account | All accounts; one or more connection labels                            | Hidden when only one connection exists. OR within the facet, AND with other filters.                                                                |
| Playback count  | Any; Once; 2–9; 10–49; 50+                                             | Uses `period.qualifyingPlaybackCount`, or lifetime when All time is selected.                                                                       |
| Metadata        | Any; Current Spotify details; Export details only; Details unavailable | Describes the display projection. An expired catalog cache is not current Spotify details.                                                          |

All filters are server-side. Multiple values within Artist, Album, Account, or
Source use OR; different facets use AND. Facet counts apply the current query
and every other filter while excluding their own facet. Unknown or expired
values never silently satisfy a known-value filter.

Artist and Album option sets can contain thousands of values. They use a
server-searchable option endpoint and never preload the complete facet into the
browser. Selected obsolete identities remain visible as unavailable and can be
cleared.

## Tracks

### Layout and row fields

Tracks uses a single dense, sticky-header table/list. There is no grid toggle.
Each desktop row is approximately 48 pixels high and contains, in order:

1. **Track** — optional 32-pixel square album image, title, and a compact
   **Explicit** text marker when known true;
2. **Artist** — ordered track artist credits, not album-artist fallback when
   exact track credits exist;
3. **Album** — current exact album name when available, otherwise the latest
   imported album text;
4. **Playbacks** — selected-period qualifying count; when a period is active,
   lifetime count appears as secondary text;
5. **Observed time** — selected-period duration; when a period is active,
   lifetime duration appears as secondary text. When the playback count exceeds
   duration-bearing occurrences, append **+N without duration** in accessible
   secondary text; and
6. **Last played** — latest matching qualifying instant, rendered in the
   owner's timezone with the exact instant available to assistive technology;
   and
7. **Spotify source link** — a compact, visibly attributed link when any
   displayed metadata or artwork comes from the Web API. It is a separate
   keyboard target and does not replace row selection.

At narrower desktop widths, Track remains first; Artist and Album stack beneath
it; Playbacks and Last played remain visible; Observed time moves into the
secondary row. No value is replaced by an icon-only mystery column. Title and
album may use two and one lines respectively; all other compact text is one line
with accessible full values.

Artwork is optional and subordinate to identity. Use a neutral local square
placeholder only when needed to maintain alignment. Do not repeat large album
art, download Spotify art, crop it contrary to provider policy, or let missing
art increase row height.

Display text fallback order is valid unexpired exact-ID Spotify metadata,
latest non-null owner-export text, then **Untitled track**, **Artist
unavailable**, or **Album unavailable** as UI-only phrases.

### Tracks search

Placeholder: **Search tracks, artists, albums, ISRC, or Spotify URI**.

Search targets are:

1. current and imported track titles;
2. exact credited artist names plus imported album-artist text;
3. current and imported album names;
4. ISRC; and
5. exact Spotify track URI or parsed track ID.

It does not search raw reasons, platform, country, IP address, private-session
state, provider popularity, or raw JSON. Matching is case-insensitive and
Unicode-aware. Whitespace-separated terms use AND semantics; a quoted phrase
remains a phrase; the final unquoted token supports prefix matching after two
characters. Exact identifiers bypass tokenization. Relevance is a sort only when
the query is nonempty.

### Tracks filters

Tracks supports every common filter plus:

| Filter   | Exact choices                               | Semantics                                                                                    |
| -------- | ------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Artist   | One or more exact Spotify artist identities | Requires an accepted track-artist relationship. Export-only artist text does not satisfy it. |
| Album    | One or more exact Spotify album identities  | Requires an accepted track-album relationship. Export-only album text does not satisfy it.   |
| Explicit | Any; Explicit; Not explicit; Unknown        | Uses current valid exact-ID metadata. Unknown is separate from false.                        |

There is no Saved/Liked filter in the initial Songs surface.

### Tracks sorts

| Label              | `sort`          | Directions       | Default    | Primary value                                                  |
| ------------------ | --------------- | ---------------- | ---------- | -------------------------------------------------------------- |
| Recently played    | `playedAt`      | `desc`, `asc`    | **`desc`** | latest/earliest matching qualifying instant                    |
| Track              | `title`         | `asc`, `desc`    | No         | normalized display title                                       |
| Artist             | `artist`        | `asc`, `desc`    | No         | normalized first credited artist, then remaining credit string |
| Album              | `album`         | `asc`, `desc`    | No         | normalized display album                                       |
| Most playbacks     | `playbackCount` | `desc`, `asc`    | No         | period qualifying count, or lifetime under All time            |
| Most observed time | `observedTime`  | `desc`, `asc`    | No         | period observed milliseconds, or lifetime under All time       |
| Relevance          | `relevance`     | fixed best-first | No         | normalized FTS rank; query required                            |

Unknown values sort last in both directions. Stable ties use normalized title,
Spotify track URI, then media item ID. Under title/artist/album sorting, row
aggregates and Last played still describe the active occurrence predicates.

## Albums

### Membership and layout

An Album row exists only for an exact Spotify album URI connected to at least
one track with matching qualifying playback. Export album text alone is not an
album identity and is never grouped by normalized name. Tracks without an exact
album identity remain fully available in Tracks and contribute to the disclosed
**tracks awaiting album identity** count.

Albums uses a compact square-art grid with approximately 9–10rem cards and no
list/grid toggle. Each card shows, in order:

1. current unexpired Spotify album artwork or a neutral local square;
2. album title;
3. ordered album artist names;
4. **N tracks heard** using exact linked tracks with qualifying playback;
5. selected-period qualifying playback count and observed time; and
6. latest matching playback date.

When API metadata or artwork is present, each card also includes a compact,
visibly attributed Spotify source link separate from the card-selection target.

If a period is active, lifetime playback count and time appear in the inspector,
not as a third dense card line. Do not display Saved, Followed, Spotify
popularity, community genre, or a claim such as “album played.”

### Albums search, filters, and sorts

Placeholder: **Search albums or artists**. Search current album title, imported
title retained on exactly linked tracks, ordered exact album-artist names, and
exact Spotify album URI/ID. Do not return an album solely because one track title
matches.

Albums supports common filters and an exact Artist facet. It also supports:

| Filter     | Choices                                         | Semantics                                              |
| ---------- | ----------------------------------------------- | ------------------------------------------------------ |
| Album type | Any; Album; Single; Compilation; Other; Unknown | Normalized current `album_type`; unknown is not Other. |

Sorts are:

| Label           | `sort`          | Directions       | Default    | Primary value                                |
| --------------- | --------------- | ---------------- | ---------- | -------------------------------------------- |
| Most playbacks  | `playbackCount` | `desc`, `asc`    | **`desc`** | period/lifetime qualifying playback count    |
| Recently played | `playedAt`      | `desc`, `asc`    | No         | latest/earliest matching qualifying instant  |
| Album           | `title`         | `asc`, `desc`    | No         | normalized album title                       |
| Artist          | `artist`        | `asc`, `desc`    | No         | normalized first album artist                |
| Tracks heard    | `trackCount`    | `desc`, `asc`    | No         | unique qualifying tracks in period/lifetime  |
| Observed time   | `observedTime`  | `desc`, `asc`    | No         | period/lifetime observed milliseconds        |
| Released        | `releasedAt`    | `desc`, `asc`    | No         | current release date with retained precision |
| Relevance       | `relevance`     | fixed best-first | No         | FTS rank; query required                     |

Stable ties use normalized album title then internal album projection ID.

## Artists

### Membership and layout

An Artist row exists only for an exact Spotify artist URI credited on at least
one track with matching qualifying playback. Imported artist text alone is not
an artist identity and is never merged by name. Tracks lacking exact artist
identity contribute to **tracks awaiting artist identity**.

Artists uses a dense 48-pixel list, not an image grid. Track metadata supplies
identity and name but does not require an artist-image lookup. Each row shows:

1. artist name;
2. unique tracks heard;
3. exact releases heard;
4. selected-period qualifying playbacks;
5. selected-period observed time, including the duration-coverage disclosure;
   and
6. latest matching playback date.

When the row uses API metadata, it includes a compact, visibly attributed
Spotify source link as a separate keyboard target.

An occurrence on a multi-artist track contributes to every credited artist.
This is stated once below the Artists count; individual rows do not repeat a
badge.

### Artists search, filters, and sorts

Placeholder: **Search artists or Spotify URI**. Search exact credited artist
names and Spotify artist URI/ID. Imported name-only text remains searchable in
Tracks but does not create an Artist result.

Artists supports common period, source, account, playback-count, and metadata
filters. It has no Followed, Genre, or Popularity filter.

Sorts are:

| Label           | `sort`          | Directions       | Default    | Primary value                               |
| --------------- | --------------- | ---------------- | ---------- | ------------------------------------------- |
| Most playbacks  | `playbackCount` | `desc`, `asc`    | **`desc`** | period/lifetime qualifying playback count   |
| Recently played | `playedAt`      | `desc`, `asc`    | No         | latest/earliest matching qualifying instant |
| Artist          | `name`          | `asc`, `desc`    | No         | normalized artist name                      |
| Tracks heard    | `trackCount`    | `desc`, `asc`    | No         | unique qualifying tracks in period/lifetime |
| Releases heard  | `albumCount`    | `desc`, `asc`    | No         | unique exact releases in period/lifetime    |
| Observed time   | `observedTime`  | `desc`, `asc`    | No         | period/lifetime observed milliseconds       |
| Relevance       | `relevance`     | fixed best-first | No         | FTS rank; query required                    |

Stable ties use normalized artist name then internal artist projection ID.

## Counts and coverage presentation

All counts describe the entire matching query, not loaded pages.

The Songs navigation badge is the unfiltered lifetime count of distinct tracks
with at least one active qualifying playback. View badges additionally return
resolved lifetime album and artist counts; unresolved text-only groups never
inflate them.

Tracks header:

```text
N tracks · M qualifying playbacks · H observed
```

Albums header:

```text
N albums · T tracks heard · M qualifying playbacks · H observed
```

Artists header:

```text
N artists · T tracks heard · M qualifying playbacks · H observed
```

Use singular nouns correctly. `H observed` uses a localized hours/minutes
duration. When any matching occurrence lacks duration, add the factual secondary
line **K qualifying playbacks have no observed duration**. On Artists, whole-view
track and playback counts deduplicate underlying tracks/occurrences rather than
summing artist rows.

Coverage appears near the header as one compact disclosure, not a badge on every
row. It includes:

- latest complete Extended Streaming History import and its final covered
  instant;
- last successful Recently Played poll and durable checkpoint;
- whether import processing is incomplete;
- number of qualifying tracks awaiting exact album identity;
- number awaiting exact artist identity; and
- **Recent activity may overlap this export** when cross-surface overlap is
  unresolved.

Do not imply continuous completeness. A missed Recently Played window remains a
gap until a later export.

## Inspector

The single compact inspector remains approximately 24–28rem wide,
independently scrollable, and does not replace the collection. It has **Details**
and **History** tabs. Album and Artist inspectors use the same panel and are
aggregate projections, not new media-item detail routes.

### Track inspector

Persistent header:

1. small square album artwork when valid;
2. current track title, falling back to imported title;
3. ordered credited artists;
4. album name when available; and
5. visibly attributed **Open in Spotify** link when API metadata or art is used.

There is no play button, rating, save, Queue, edit, or overflow action.

Details sections, in exact order, omitting an empty section:

1. **Listening** — selected-period qualifying playbacks, lifetime qualifying
   playbacks, period/lifetime observed time, period/lifetime duration-bearing
   count, first qualifying playback, latest qualifying playback, export-backed
   count, API-only count, and reconciled count. Under All time, collapse equal
   period/lifetime values into one line.
2. **Track** — duration, explicit state when known, disc and track number,
   current release date with precision, ISRC, original Spotify track URI, and
   relinked/currently playable identity when present. ISRC is labeled as an
   identifier, never a merge claim.
3. **Album** — exact album title, ordered album artists, album type, release date
   with precision, total catalog tracks, and a link that opens the Album
   inspector. Omit when no exact album identity exists.
4. **Artists** — every ordered exact track artist identity. Each link opens the
   Artist inspector; imported name-only fallback text is shown but not linked.
5. **Source** — imported title/album/artist text when different, source links,
   catalog acquisition/expiry state, latest export/poll coverage, connection
   label, reconciliation version/state, and concise provenance summary.

### Album inspector

Persistent header shows square art, album title, ordered album artists, release
year/date when known, and attributed Spotify link.

Details sections:

1. **Listening** — period/lifetime qualifying playbacks, observed time,
   duration coverage, unique tracks heard, first playback, and latest playback.
2. **Album** — album type, release date and precision, total catalog tracks, and
   ordered album artists. Do not show label/copyright unless a later approved
   acquisition supplies them.
3. **Tracks heard** — the first ten exact linked tracks sorted by period
   playback count, each with period/lifetime count and observed time. **View all
   tracks** navigates to Tracks with the exact album filter.
4. **Source** — exact album identity, attribution/link, metadata freshness,
   number of qualifying export-only tracks not assigned to this or any album,
   coverage, and reconciliation disclosure.

### Artist inspector

Persistent header shows artist name and attributed Spotify link. An artist image
is optional enrichment, never required to avoid a placeholder-heavy list.

Details sections:

1. **Listening** — period/lifetime qualifying playbacks, observed time,
   duration coverage, unique tracks, exact releases, first playback, and latest
   playback.
2. **Top tracks** — first ten credited tracks by period playback count, with
   period/lifetime count and observed time. **View all tracks** navigates to
   Tracks with the exact artist filter.
3. **Releases heard** — first ten exact releases by period playback count, with
   unique tracks heard and observed time. Selecting one opens Album inspection.
4. **Source** — artist identity, attribution/link, metadata freshness, credit
   semantics, tracks still awaiting exact artist identity, coverage, and
   reconciliation disclosure.

### History tab

Track History rows contain:

1. source-asserted playback instant in the owner's timezone;
2. **Export · Nm Ns observed** or **Recent API · duration unavailable**;
3. qualification label: **30-second rule** or **Recent API exception**;
4. skipped state when the export explicitly says true;
5. **Matches current period** when applicable; and
6. an expandable disclosure for reason start/end, source-recorded title facts,
   source evidence count, and reconciliation state.

Album and Artist History rows add track title and ordered artists. They retain
the same occurrence semantics.

History defaults to all qualifying occurrences, newest first, even under a
collection period filter; matching rows are marked. A **Current period only**
toggle narrows the endpoint. A second exact mode, **Excluded observations**,
shows export rows under 30 seconds or at zero duration, labeled **Under 30
seconds** or **Zero duration**. Excluded observations never inflate qualifying
counts. Unresolved-identity observations cannot be attached to a track, album,
or artist inspector and remain available only through technical provenance.

Do not display IP address, country, platform, private-session/incognito state,
device fields, or raw export/API JSON. Offline and shuffle evidence remain
retained but are also omitted from the initial ordinary inspector because they
do not explain qualification.

## Missing, empty, partial, and error states

| Condition                               | Required presentation                                                                                                                     |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| No Songs projection exists              | **No song history imported** with a link to Connections; do not show a fake empty Queue.                                                  |
| Import exists but no row meets the rule | **No tracks meet the 30-second playback rule**. Recent API activity can still add tracks immediately.                                     |
| Tracks filters return none              | **No tracks match these filters** with **Clear filters**.                                                                                 |
| Albums have no exact identities         | **No albums with verified identities** and the count of qualifying tracks still available in Tracks.                                      |
| Artists have no exact identities        | **No artists with verified identities** and the count of qualifying tracks still available in Tracks.                                     |
| Missing title/artist/album              | Use the UI-only fallbacks defined above; never persist them as imported facts.                                                            |
| Missing artwork                         | Use the local neutral square; never borrow art through title matching.                                                                    |
| Expired/missing API metadata            | Render owner-export identity/text and playback aggregates; omit expired Spotify content and disclose details state in Source.             |
| Spotify item unavailable/restricted     | Preserve track identity and history, mark **Unavailable on Spotify** in Details, and retain prior permitted source facts.                 |
| Incomplete chunked import               | Show **Spotify import incomplete · totals include processed records only** and keep the last complete aggregate snapshot distinguishable. |
| Partial/failed poll                     | Keep existing activity; do not advance the cursor. Coverage reports the failure and possible gap.                                         |
| Later export awaiting reconciliation    | Preserve the raw import, keep the prior active aggregate projection, and show **New export awaiting playback reconciliation**.            |
| Collection request fails                | Keep shell and controls; show **Songs could not be loaded** with Retry.                                                                   |
| Detail/history request fails            | Keep selection and collection; show **Details could not be loaded** or **History could not be loaded** with Retry/Close.                  |

If active filters exclude an inspected object, keep the inspector open and show
**Not in current results**. Provider failure never removes a locally supported
playback item.

## URL, selection, and remembered state

Canonical routes:

```text
/library/songs/tracks
/library/songs/albums
/library/songs/artists
```

URL-addressable query state:

```text
q
period=all|year|last12months|range
from=YYYY-MM-DD
to=YYYY-MM-DD
timeZone=<IANA zone>
source=export|recent_api              repeatable
account=<connection id>              repeatable
playbackCount=any|once|2to9|10to49|50plus
metadata=any|current|export_only|unavailable
artist=<internal exact artist id>    repeatable, Tracks/Albums
album=<internal exact album id>      repeatable, Tracks
explicit=any|yes|no|unknown          Tracks
albumType=any|album|single|compilation|other|unknown   Albums
sort
direction=asc|desc
item=<media item id>                 Track selection
albumItem=<internal album id>        Album selection
artistItem=<internal artist id>      Artist selection
```

The three selection parameters are mutually exclusive. Invalid combinations
return a stable validation error and remain clearable; they are not silently
reinterpreted. Defaults are omitted except `timeZone` when necessary to make a
shared date range unambiguous.

Selecting a row/card pushes the appropriate selection into browser history.
Closing inspection removes it with Back-equivalent behavior and restores focus
to its trigger when present, otherwise to the results heading. Back/Forward
restores view, filters, sort, selection, loaded-page stack, and scroll anchor.
Refreshing a deep link loads the first collection page and selected detail
independently; selection never depends on the selected object appearing on that
page.

Inspector tab, expanded history row, and History mode are ephemeral. Sidebar
collapse, theme, and table column widths are user preferences, not Library URL
state. Rapid selection cancels or ignores stale requests so one object's detail
never renders under another header.

## Pagination and virtualization

- Tracks requests 100 rows initially and per explicit **Load more tracks**.
- Albums requests 48 cards initially and per **Load more albums**.
- Artists requests 100 rows initially and per **Load more artists**.
- Inspector history requests 50 rows initially and per **Load older activity**.
- Filter-option search requests at most 50 values per page.
- Public endpoint limits are `1..100`; no UI request asks for an unbounded page.

All collection, history, and large-option pagination is server-side keyset
pagination. Opaque versioned cursors are bound to the normalized query, source,
period, filters, sort, direction, and complete stable sort tuple. Reusing a
cursor under another query returns `BAD_REQUEST`.

Tracks and Artists virtualize the currently loaded row stack from the first
release. Inspector history also virtualizes loaded rows. Virtualization must
preserve semantic row/list accessibility, roving keyboard selection, focus on
open/close, and measured variable height for expanded disclosures. Albums does
not initially virtualize because explicit 48-card pages bound the DOM; measure
before adding it.

Pagination is explicit, not infinite scroll. The UI may prefetch one next page
but never automatically walks the collection or history. It reports **Showing N
of M tracks/albums/artists**. After import, poll, or enrichment mutation, restart
from page one. These are live queries, not frozen snapshots across pages.

## HTTP contract requirements

Do not overload the current summary-only `/api/media` contract. Add validated
Songs contracts in `packages/contracts`; Hono handlers remain thin and delegate
SQL, aggregation, and provider rules to repositories/services.

### Collection endpoints

```text
GET /api/library/songs/tracks
GET /api/library/songs/albums
GET /api/library/songs/artists
```

They accept the compatible URL fields above plus `limit` and `cursor`. A custom
range requires at least one bound. The API validates IANA timezone input,
converts calendar bounds once, and echoes resolved UTC boundaries. Unsupported
view/filter/sort combinations are rejected, not ignored.

Track summary rows return:

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
catalogState=current|export_only|unavailable|expired
periodAggregate
lifetimeAggregate
referencePlayedAt
```

Album rows return internal album ID, Spotify identity/link, title, ordered album
artists, art, album type, release temporal value, total catalog tracks, unique
tracks heard, period/lifetime aggregates, and metadata state. Artist rows return
internal artist ID, Spotify identity/link, name, optional valid art,
period/lifetime unique tracks and albums, aggregates, and metadata state.

Every collection response returns:

```text
data
nextCursor
counts {
  songsTracksLifetime,
  songsAlbumsResolvedLifetime,
  songsArtistsResolvedLifetime,
  filteredItems,
  filteredUniqueTracks,
  filteredQualifyingPlaybacks,
  filteredObservedMs,
  filteredPlaybacksWithObservedDuration,
  tracksAwaitingAlbumIdentity,
  tracksAwaitingArtistIdentity
}
smallFacets { sources, accounts, playbackCountBuckets, metadataStates,
              explicitStates?, albumTypes? }
coverage {
  lastCompleteExportImportedAt,
  exportCoveredThrough,
  lastRecentPollAt,
  recentCheckpoint,
  importState,
  reconciliationState,
  possibleOverlap,
  possibleRecentGap
}
resolvedPeriod { fromUtc, toExclusiveUtc, timeZone }
```

Counts and rows use the same qualification, reconciliation, active-state,
search, and filter predicates.

### Large filter options

```text
GET /api/library/songs/filter-options
```

Required query fields are `view=tracks|albums`,
`facet=artist|album`, the current compatible filters excluding that facet,
optional option-search `q`, `limit <= 50`, and cursor. It returns stable
identity, display label, self-excluding match count, selected/current state, and
next cursor. It never returns name-only pseudo-identities.

### Detail endpoints

```text
GET /api/library/songs/tracks/:mediaItemId
GET /api/library/songs/albums/:albumId
GET /api/library/songs/artists/:artistId
```

Each detail response contains its collection summary, every inspector field,
period/lifetime aggregates, source/coverage/freshness disclosure, bounded top
tracks/releases where applicable, total qualifying/excluded history counts, and
the first 50 qualifying History rows plus `historyNextCursor`.

A track detail resolves retained playback history even when current Spotify
metadata is expired or unavailable. Album/artist detail returns `404` only when
the exact grouping identity has no retained projection; it never creates a
grouping during GET.

### History endpoints

```text
GET /api/library/songs/tracks/:mediaItemId/history
GET /api/library/songs/albums/:albumId/history
GET /api/library/songs/artists/:artistId/history
```

Query fields:

```text
mode=qualifying|excluded
onlyMatchingPeriod=true|false
period/from/to/timeZone
source=export|recent_api             repeatable
account=<connection id>             repeatable
limit=1..100                         default 50
cursor
```

Qualifying rows return normalized occurrence ID, representative occurred
instant, track identity/display fields, qualification basis, observed
milliseconds or null, explicit skipped state or null, evidence source set,
reconciled flag, evidence count, source-recorded title facts for the expandable
disclosure, `matchesCurrentPeriod`, and a compact provenance summary. Excluded
rows return the source observation identity and exact exclusion basis; they are
not normalized counted occurrences.

All responses are Zod-validated and use stable errors for invalid combinations,
cursor/query mismatch, missing projections, and temporarily unavailable data.

## Acquisition and projection requirements

Final SQL names may differ, but these distinct queryable concepts are required.

### 1. Song source observations

Extend the Spotify export parser to register every song row as a `source_record`
with raw object/member/index identity, parser version, source timestamp, track
URI when usable, disposition, and upstream state. Process in bounded durable
chunks and commit continuation state only after each chunk's raw/source/
normalized writes succeed.

Create a source-owned song-observation projection with one row per source record:

```text
id, connection_id, source_record_id, track_media_item_id | null
surface=extended_history|recently_played
occurred_at, source_timestamp_resolution
ms_played | null, skipped | null, reason_start | null, reason_end | null
context_uri | null
qualification_basis, qualifies
snapshot_key, duplicate_ordinal
normalization_version
```

Keep sensitive IP, country, platform, device, and incognito/private-session data
only in protected raw evidence. Do not copy them into the browse projection.

### 2. Normalized playback occurrences

Store one counted unit with:

```text
id, connection_id, track_media_item_id
representative_occurred_at
qualification_basis, qualifies=true
observed_ms | null
has_export_evidence, has_recent_api_evidence, reconciled
reconciliation_version | null
created_at, updated_at
```

Link observations many-to-one through a unique occurrence-evidence table. An
observation belongs to at most one normalized occurrence. Excluded observations
remain queryable without a qualifying occurrence. Every reconciliation rewrite
is deterministic, versioned, transactional, and replayable from immutable
evidence.

### 3. Track and grouping projections

Provide:

- one song media item and global track identity per original Spotify track URI;
- track display projection retaining imported fallback text separately from
  current cache fields;
- exact album entity and album identity projection;
- exact artist entity and artist identity projection;
- one current track-to-album relation with its source/freshness;
- ordered track-artist credits and separate ordered album-artist credits; and
- explicit relink relationships preserving original and replacement tracks.

Album/artist entities are grouping projections, not `media_items`, Archive
entries, or membership records.

### 4. Server aggregates

Maintain rebuildable lifetime track aggregates transactionally from normalized
occurrences. Album and artist lifetime aggregates may be materialized from track
relations for the default sorts, but they must be fully rebuildable and must not
become evidence.

Selected-period queries aggregate indexed normalized occurrences server-side.
They may use derived rollup tables only if boundary instants remain exact in the
requested timezone and replay tests prove equality with base-occurrence queries.
Never persist a local-calendar bucket without the timezone/version needed to
rebuild it.

An import/reconciliation transaction cannot expose new occurrence rows with old
materialized totals. Either update the affected aggregates atomically or publish
a new aggregate generation after the complete chunk/generation succeeds.

### 5. Recently Played acquisition

Poll `GET /me/player/recently-played` with at most 50 rows per page and a durable
`after` checkpoint. Store successful response bytes before validation under the
approved retention design. Collect the bounded overlap snapshot needed to assign
duplicate ordinals. Advance the checkpoint only after every acquired page and
normalized occurrence commits. Honor `429 Retry-After`; a failed/partial poll
does not advance or infer absence.

The endpoint is best-effort and excludes podcasts. Downtime beyond its bounded
window sets `possibleRecentGap=true` until a later export covers the interval.

### 6. Catalog metadata cache

Exact-ID Spotify track lookup or metadata already embedded in a permitted recent
response may populate a provider-specific refreshable cache. The cache records
provider, external identity, fetched time, expiry/deletion deadline, availability
state, source link, attribution requirements, and allowed-use class. Derived
track/album/artist rows and image URLs expire with their source cache.

Do not store Spotify images as downloaded binaries. Do not use search-result
title/artist similarity to attach metadata. MusicBrainz and Cover Art Archive
remain separate future enrichment, not a fallback that silently changes
identity.

## Required indexes and query invariants

At minimum, support these paths with indexes or equivalent materialized sort
projections:

- song observation unique by `source_record_id`;
- export replay lookup by `(raw_object_id, parser_version, record_path)` through
  existing source-record constraints;
- recent snapshot multiplicity by `(connection_id, track_media_item_id,
occurred_at, duplicate_ordinal)`;
- occurrence evidence unique by `(occurrence_id, observation_id)` and reverse by
  observation;
- qualifying occurrences by `(connection_id, representative_occurred_at DESC,
id DESC)`;
- track history by `(track_media_item_id, representative_occurred_at DESC, id
DESC)`;
- source filtering by `(has_export_evidence, has_recent_api_evidence,
representative_occurred_at DESC)` or an equivalent indexed evidence join;
- excluded observations by `(track_media_item_id, occurred_at DESC, id DESC)`;
- lifetime track aggregates indexed separately by latest playback, qualifying
  count, observed milliseconds, normalized title, normalized artist, and
  normalized album, with media item ID as final tie-breaker;
- track-album unique relation plus reverse `(album_id, track_media_item_id)`;
- ordered track-artist credit unique by track and ordinal plus reverse
  `(artist_id, track_media_item_id)`;
- album and artist materialized sort keys for playback count, observed time,
  latest playback, unique track count, and normalized display name;
- catalog-cache expiry/availability by provider identity;
- FTS5 projections for the exact search targets; and
- exact normalized indexes for Spotify URI/ID and ISRC lookup.

Every default view, sort, source/date filter, combined artist+album filter,
playback-count bucket, detail history, and facet-option query must be checked
with `EXPLAIN QUERY PLAN` against a synthetic collection at least as large as the
observed 33,225 track identities and 152,231 song rows. Queries may not load all
matching IDs or occurrences into application memory and paginate there.

Counts, rows, facets, and period/lifetime aggregates must share one qualification
and reconciliation predicate implementation. A qualifying occurrence cannot
appear in a count but disappear from the corresponding row aggregate, or vice
versa.

## Spotify attribution, retention, and AI boundary

Spotify Web API metadata and artwork are not immutable ledger evidence. Before
the first catalog or Recently Played integration ships, add an ADR that defines:

- which API response bytes may be retained and for how long;
- expiry/deletion of raw cache payloads and every derived copy;
- minimal identity, playback, and provenance facts that may remain;
- replay behavior that cannot resurrect expired/deleted Spotify Content;
- visible Spotify attribution and required links;
- unavailable/restricted-item handling; and
- separation from owner-provided export evidence.

Every display using live Spotify API metadata or art shows visible Spotify
attribution and an item link. Artwork remains unmodified except for provider-
permitted responsive sizing. The app stores metadata/links, never audio.

Mark Spotify API content and derived text/art as ineligible for Chat prompts,
embeddings, model training, or other AI/ML ingestion. Future Chat and Recaps must
enforce provider-aware field exclusion at retrieval time, not rely on prompt
instructions. Listening aggregates from owner-provided export evidence remain
private and source-attributed; broader analytical or AI use requires a separate
policy review. This Songs UI specification does not authorize it.

## Validation criteria for later implementation

Fixtures and browser coverage must demonstrate:

1. 29,999ms export rows remain excluded, 30,000ms rows qualify, and skipped
   30,000ms rows still qualify while retaining `skipped=true`;
2. a Recently Played event immediately creates membership and a count with no
   invented duration;
3. a deterministically reconciled API/export pair counts once and uses export
   duration once; an unresolved possible overlap remains separate and disclosed;
4. identical export rows remain separate observations, while replay of the same
   raw object/parser is idempotent;
5. overlapping recent polls preserve maximum duplicate multiplicity without
   recounting the same window;
6. one track appears once with thousands of bounded history rows, and period
   filtering uses any qualifying occurrence;
7. selected-period and lifetime counts/times remain distinct and correct under
   every source/date combination;
8. an exact multi-artist track contributes once to each credited Artist row but
   once to whole-view totals;
9. name-only album/artist text never creates or merges a grouping; unresolved
   coverage is disclosed while Tracks remains usable;
10. expired or unavailable Spotify metadata removes no playback history and
    leaks no expired API content into UI or AI retrieval;
11. saved tracks/albums, followed artists, top items, and audiobooks do not
    affect Songs membership or appear as accidental filters;
12. counts, facets, keyset pagination, and virtualized keyboard navigation stay
    correct at realistic observed scale;
13. no browse/inspect request parses R2, downloads a ZIP, returns an unbounded
    history, or exposes sensitive platform/IP/private-session fields;
14. Back/Forward, refresh/deep links, focus return, scroll restoration, sidebar
    collapse, rapid selection, and stale-request protection preserve context;
15. partial imports and failed polls retain prior complete state and never
    advance a checkpoint or report false completeness; and
16. light/dark Graphite layouts remain dense and legible with long titles,
    multiple artists, missing metadata/art, API-only duration gaps, and open or
    closed inspection.

This document specifies the Music / Songs surface only. It does not authorize
code, migrations, provider calls, credential changes, an attribution/retention
ADR, shared-document edits, or implementation of other media types.
