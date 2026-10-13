# Videos Phase 2 surface specification

> Current presentation (reviewed 2026-10-12): the [UI foundation](../../design/ui-foundation.md) and [shadcn audit](../shadcn-ui-audit.md) supersede conflicting layout, density, typography, rating, and control details below. This is the retained September surface contract; the per-media implementation plan records delivered behavior and remaining hardening.

> October 12 follow-up: channel filtering searches and pages the existing Channels collection so every named Library channel is reachable. Its selector now composes shadcn Select; the earlier native-selector result is recorded in [follow-up results](../ui-polish-followup.md).

- Date: 2026-09-20
- Status: Historical owner-approved baseline; production implementation shipped.
  The 2026-09-21 owner decision removes OAuth, current subscriptions, and every
  Following marker/filter/relationship from the Videos product surface. Any
  older Following language below is superseded; imported subscription rows remain
  retained source evidence only.
- Scope: Library > Videos Archive, Watch Later Queue, and Channels activity rollup
- Sources: owner-supplied Google Takeout for history and Watch Later; YouTube
  Data API for refreshable public metadata

## Outcome

Videos has three independent local views:

1. **Archive** contains one video per global YouTube video identity and every
   supported, connection-scoped `Watched` occurrence.
2. **Queue** contains current Watch Later membership from the latest successful
   complete Takeout snapshot for each connection.
3. **Channels** contains one rollup for every stable channel represented by a
   video in Archive or Queue.

Archive and Queue do not imply one another. Watching a video never removes it
from Queue. A channel enters Channels through owner activity already in Archive
or Queue. A video or channel shared by two owner accounts appears
once in its collection, while every account-scoped occurrence or relationship
remains separate and inspectable.

Archive and Queue support a compact thumbnail list and a video grid. List is the
default because the Archive currently contains more than 20,000 videos and the
date, channel, duration, and repeat-watch context are useful while scanning.
Channels is a channel list only; it is not an uploads feed. The shared compact
inspector has video and channel variants without introducing full-page detail
routes.

Current metadata is additive. When an unexpired YouTube Data API projection is
available, it supplies the default title, channel, thumbnail, description,
publication time, duration, category, and availability/live facts. Immutable
Takeout observations retain the title, channel label/link, watch instant,
product host, Watch Later added instant, and subscription snapshot that existed
at import time. Expired, unavailable, or unconfigured enrichment never hides
local history or relationships.

This specification applies Phase 1 choices `X1-B`, `X2-B`, `X3-B`,
`X4-recommended`, `X5-recommended`, `V1-B`, `V2-C`, `V3-B`, `V4-B`, `V5-B`,
and `V6-recommended`.

## Boundaries

### Required in this delivery

- Archive, Queue, and Channels collections; exact fields, search, filters,
  sorts, counts, keyset pagination, URL state, selection, and inspectors.
- Watch Later projection from Takeout with source-added instants, complete-
  snapshot reconciliation, independent membership per connection, and
  inspectable Queue-only video items.
- Stable channel identity from exact Takeout channel-ID URLs and Data API
  resources; title matching never establishes channel identity.
- Subscription projection from Takeout and, after the OAuth prerequisite, full
  current reconciliation through `subscriptions.list?mine=true`.
- Every supported watch occurrence, including rewatches and same-video,
  same-time multiplicity preserved by the ADR 0010 occurrence-rank rule.
- An attributed, refreshable YouTube Data API cache after the credentialed probe
  below, kept separate from immutable Takeout evidence.
- Explicit current-versus-historical title and channel behavior, lookup
  availability, live-state behavior, account-lineage disclosure, and source
  freshness.
- Useful local-only rendering when no API key, OAuth grant, current result,
  artwork, title, channel, duration, or description is available.

### Deferred

- Likes, dislikes, per-video ratings, Liked videos, and arbitrary playlists.
  They remain possible relationship/List features, never Archive or Queue
  evidence.
- Google Data Portability, automated Watch History, automated Watch Later,
  upstream writes, local Queue editing, and mirroring to a YouTube playlist.
- A followed-channel uploads feed, new-upload counts, notifications, WebSub,
  recommendations, related videos, trending data, and discovery outside the
  owner's Library.
- Transcript or caption download, full-text indexing, embedded playback,
  app-level watch tracking, comments, live chat, and owner-upload management.
- Mutable popularity statistics such as view, like, comment, and subscriber
  counts.
- A Shorts or premiere classification based on URL, title, aspect ratio,
  duration, or live-state heuristics. Those labels become available only when a
  credentialed source supplies a reliable explicit fact and a reviewed
  projection rule exists.
- Reclassifying YouTube Music watches as Songs. `youtube_music` remains a
  source-backed Videos facet unless an authoritative recording identity and
  reviewed cross-media merge rule are added.

## Provider prerequisites

### Credentialed public Data API probe

Public metadata integration is gated on the owner supplying a restricted Google
API key through secret storage. The key must be limited to the deployed service
and YouTube Data API and must never enter Git, fixtures, logs, raw evidence, or
this document.

Before catalog schema, batch size, refresh cadence, or production field
optionality is frozen, run a content-redacted probe with the real configured
key. It must record field names, types, omissions/nullability, aggregate
outcomes, quota usage, and policy observations only. It must verify:

1. `videos.list` with
   `part=snippet,contentDetails,status,liveStreamingDetails` for a small sample
   containing an ordinary public video, an upcoming live event, a currently live
   event when safely available, a completed live video, and known IDs from the
   owner's Library with content-bearing values redacted;
2. a successful batch containing at least one ID omitted from `items`, proving
   the requested-ID-versus-returned-ID availability path without claiming why
   the ID is absent;
3. actual optionality for titles, descriptions, channel fields, thumbnails,
   publication instants, ISO-8601 duration, category, caption flag, projection,
   definition, region restriction, privacy/embeddable state, and live details;
4. request-size-bounded ID batches beginning at 50, including the provider's
   practical request-size limit and partial-return behavior; 50 is an
   implementation starting point, not a documented endpoint guarantee;
5. `channels.list?part=id,snippet&id=...` for exact channel IDs from the video
   responses and retained Takeout links, including missing-channel behavior;
6. `videoCategories.list?part=snippet` for the region/configuration used by the
   app and stable category-ID/name projection;
7. response cache headers, retry and `429` behavior, quota reporting, thumbnail
   URL handling, required YouTube attribution/link behavior, and the current API
   Services data-storage policy; and
8. refresh or deletion of public API data within the policy limit. The current
   planning assumption is no later than 30 calendar days, but the probe must
   confirm the rule that governs the configured project before shipping.

The probe may narrow nullable fields, request parts, batch size, thumbnail
handling, refresh timing, or safe error states. It may not make enrichment a
membership requirement, infer a deletion reason from an omitted ID, overwrite
Takeout history, or invent Shorts/premiere facts.

Before production integration ships, add an ADR for refreshable provider data.
It must define the separate cache/storage boundary, acquisition and expiry
times, permitted stale behavior, deletion on expiry, attribution, secret
handling, and which request/outcome provenance may remain after response data
expires.

### OAuth prerequisite for the Following filter

Following state may be backfilled from a successfully parsed complete Takeout
`subscriptions.csv` snapshot. That state must be labeled **Subscriptions
imported {date}** and must not be described as continuously current. Current
reconciliation requires a Google OAuth client and a separate read-only grant for
each explicitly selected YouTube channel/account lineage.

The OAuth implementation must satisfy all of these requirements before it can
claim current Following state:

1. Request only `https://www.googleapis.com/auth/youtube.readonly`. Do not
   request write, upload, or Data Portability scopes. Service accounts are not
   supported.
2. Store client secrets outside Git and store refresh/access tokens using the
   repository's protected rotating-credential boundary. Never store tokens in
   raw evidence, logs, URLs, or browser-readable state.
3. Call `channels.list?part=id,snippet,contentDetails&mine=true` immediately
   after authorization. Present every returned channel/Brand Account candidate
   for explicit owner selection. Reject an empty or ambiguous automatic bind.
4. Bind the grant to the chosen stable channel ID and one existing or newly
   owner-labeled YouTube connection. Shared watched IDs, subscription overlap,
   email, filename, or similar channel titles must never merge lineages.
5. Call
   `subscriptions.list?part=id,snippet,contentDetails&mine=true&maxResults=50`
   through every `nextPageToken`. Only a fully successful traversal is a
   complete snapshot that may retire absent relationships.
6. Persist the subscription resource ID, followed channel ID, source `publishedAt`
   relationship instant when present, current channel label/thumbnail fields,
   acquisition time, and evidence/outcome provenance. The source instant is
   **Subscribed**, never a watch or video publication date.
7. On expired/revoked consent, partial pagination, quota failure, parser failure,
   or channel mismatch, retain the last successful relationships and show the
   connection as stale or requiring reconnection. Do not clear the last known
   Following relationships.
8. Keep ordinary YouTube OAuth and any future Data Portability grant in separate
   authorization/storage boundaries.

OAuth does not provide Watch History or Watch Later. Enabling it must not change
the Takeout authority for Archive or Queue.

## Source-of-truth and identity model

| Fact class              | Authority                                                                                                 | Semantics                                                                                                           |
| ----------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Video identity          | Global YouTube video ID from a validated YouTube/YouTube Music URL, Watch Later row, or Data API resource | One canonical video item per exact ID. A re-upload is a different item.                                             |
| Watch occurrence        | Timestamped exact `Watched` card in a specific Takeout connection                                         | Immutable Archive evidence; one occurrence per trustworthy card after same-lineage snapshot reconciliation.         |
| Queue membership        | Watch Later member row in the latest successful complete Takeout snapshot for a connection                | Current source Queue relationship with source-added instant; independent of Archive.                                |
| Channel identity        | Exact channel ID from a Takeout `/channel/{id}` link or Data API resource                                 | Stable creator/grouping identity. Channel title or custom URL alone never identifies or merges a channel.           |
| Following relationship  | Subscription row in a complete Takeout or OAuth snapshot for a connection                                 | Current account-scoped relationship. It does not imply any video membership.                                        |
| Historical display fact | Takeout watch/subscription/playlist observation                                                           | Immutable title, channel label/link, product, and temporal facts as observed.                                       |
| Current display fact    | Unexpired Data API video/channel projection                                                               | Refreshable title, channel, artwork, description, duration, publication, category, availability, and live metadata. |

Separate Takeout lineages remain separate `connections`. Each requires a stable,
non-secret owner label. A video or channel identity can be global while watches,
Queue entries, Following relationships, import freshness, and OAuth grants stay
connection-scoped. A later OAuth grant links to a Takeout lineage only through
explicit owner selection plus stable channel evidence; it is never inferred.

## Collection structure and modes

Canonical routes are:

```text
/library/videos/archive
/library/videos/queue
/library/videos/channels
```

Archive and Queue support `view=list|grid`; list is the default when neither the
URL nor a stored Videos preference supplies a choice. Channels always uses its
channel list and rejects `view`. Switching between Archive and Queue preserves
shared search, filters, sort only when supported, view, scroll, and selection if
the selected video belongs to the destination. Channels preserves its own
query, sort, filters, pagination, selection, and scroll.

At viewport widths of 1280 CSS px and above, the inspector is a 400 px adjacent
panel. Below 1280 px it is a right side sheet of `min(440px, 100vw)`. Both are
the same URL-addressed inspector. Opening or closing it does not reset the
collection, loaded pages, or scroll.

### Video list

Archive and Queue list rows have a minimum height of 96 px and a 144 x 81 px
16:9 thumbnail slot. The slot never changes aspect ratio. Columns are:

1. **Video:** thumbnail/fallback, title, reliable live/format marker, and
   availability marker only when unavailable;
2. **Channel:** current channel name or historical fallback;
3. **Duration:** source duration or an em dash;
4. **Published:** source publication date or an em dash; and
5. the membership columns defined below.

At narrower desktop widths, Published then Duration move into the Video cell.
Channel and the membership-defining date/count remain visible. Titles use at
most two lines; channel and metadata lines use one. Full values remain available
to assistive technology and in the inspector.

### Video grid

The grid uses fixed 16:9 thumbnails with `repeat(auto-fill, minmax(240px,
300px))` and 16 px gaps. Cards do not stretch past 300 px. Each card contains a
thumbnail/fallback, two-line title, one-line channel, a section-specific line,
and at most one compact overlap/count line. Duration sits over the bottom-right
of the thumbnail when known. Reliable **Live**, **Upcoming**, or **Recorded
live** markers sit separately and never replace duration.

There is no masonry, autoplay preview, hover playback, progress bar, inline
action toolbar, or transcript excerpt. A card/row is one selection target;
outbound links and controls are separate keyboard targets. Selection, hover,
and focus use restrained Graphite states that remain distinct in both themes.

### Channels list

Channels uses one row per stable channel identity represented by at least one
Archive or Queue video. It is deduplicated across videos, occurrences, Queue
relationships, and owner accounts. Rows have a 64 px square channel thumbnail
slot and a minimum height of 80 px. Columns are:

1. **Channel:** current title, historical fallback, and thumbnail/fallback;
2. **Following:** a restrained marker only when at least one current Following
   relationship exists;
3. **Watched videos:** distinct Archive video count;
4. **Views:** lifetime supported watch-occurrence count;
5. **Last watched:** latest active watch instant, or **Date unavailable**; and
6. **Queue:** active Watch Later video count from the channel.

The row does not show upload count, new items, latest upload, subscriber count,
notification setting, or a false unread state. Selecting it opens the channel
inspector.

## Archive

### Fields

Archive's grid card shows, in order:

1. thumbnail or standard video fallback;
2. display title;
3. display channel;
4. latest matching watch instant under a watched-date/Account filter, otherwise
   the latest overall watch instant;
5. `N watches` when lifetime occurrence count is greater than one, or `M of N
watches` when occurrence filters match only part of the lifetime history; and
6. **In Queue** when at least one active Watch Later relationship exists.

Archive list membership columns are **Last watched**, **Watches**, and **Queue**.
Last watched uses the same reference occurrence as the grid. Watches shows the
matching occurrence count under occurrence filters and lifetime count otherwise.
Queue shows **Queued** or an em dash.

A watch instant renders in the configured owner timezone as **Watched Sep 20,
2026, 3:14 PM**. Every current Takeout occurrence is instant precision. If a
future admitted occurrence has unknown time, render **Watch date unavailable**;
never substitute export acquisition, source-recorded, publication, or ingestion
time.

### Occurrence behavior

One video appears once. Every active occurrence remains in History, including
rewatches from the same account and watches of the same video from different
accounts. Date and Account filters are occurrence predicates: when both are
active, at least one same occurrence must satisfy both. The reference date is
the latest satisfying occurrence. Lifetime count remains lifetime; matching
count is filter-relative.

Absence from a later history export is not deletion proof. Changed timestamps
are distinct occurrences. Same video/UTC-instant cards use connection-scoped
occurrence rank so the maximum observed multiplicity is retained without
collapsing genuine repeated cards.

## Queue

Queue is exactly active Watch Later membership from complete Takeout snapshots.
Its grid card shows, in order:

1. thumbnail or standard video fallback;
2. display title;
3. display channel;
4. **Added to Watch Later {date and time}**, using the latest source-added
   instant across the active relationships included by the Account filter, or
   **Added date unavailable**;
5. `N accounts` when more than one active Watch Later relationship matches; and
6. **Also in Archive** plus lifetime watch count when nonzero.

Queue list membership columns are **Added**, **Accounts**, and **Archive**. Added
uses the same reference membership as the grid. Archive shows `N watches` or an
em dash. The Watch Later source instant is never labeled queued locally,
watched, published, recorded, or imported.

Each connection has its own membership and added instant. When a video is active
in multiple accounts, unfiltered ordering uses the latest known added instant;
an Account filter uses the latest instant among only matching relationships. The
inspector lists every active relationship and its date separately.

A complete later same-connection snapshot retires an absent membership while
preserving all prior evidence. A partial/failed import, unsupported ZIP, missing
Watch Later member, interrupted parse, another account's snapshot, watching the
video, or ordinary history absence never retires it. Takeout supplies no source
removal instant; record only when the app observed retirement.

## Channels

Channels is an activity rollup. A stable channel is included when at least one
video with that exact channel identity is active in Archive or Queue. A followed
channel with no Library activity is not injected into this view. Videos whose
source provides only a channel label remain visible in Archive or Queue but are
excluded from Channels until an exact channel identity is available.

One stable channel appears once across all videos and accounts. Its aggregates
are the distinct watched-video count, lifetime supported watch-occurrence count,
latest active watch instant, and active Watch Later video count. Default order
is **Most viewed**, using the personal watch-occurrence count rather than the
provider's public channel view count.

Following is an optional current relationship on that rollup. The **Following
only** filter keeps channels with at least one active subscription relationship.
A Takeout relationship may have no source-created instant; OAuth
`subscription.snippet.publishedAt` may provide one. The inspector lists each
active relationship separately, and a refresh/import never fabricates a missing
instant from acquisition time.

Channels never fetches, enumerates, or displays arbitrary uploads. Takeout-backed
Following state displays **Subscriptions imported {date}**; OAuth-backed state
displays **Subscriptions refreshed {date}**. A failed OAuth refresh retains the
last successful projection and discloses **Following refresh failed** in the
inspector/source status, not on every row.

## Current and historical metadata

Display values use this deterministic order:

1. an unexpired, permitted Data API video/channel projection;
2. the most recently observed nonempty Takeout title/channel label associated
   with the exact identity;
3. a presentation-only fallback.

Current metadata may change. Each History row preserves the title and channel
label/link observed on that watch card. When either differs from current display,
the row shows **Recorded as {historical title}** and/or **Channel recorded as
{historical channel}**. It does not repeat identical values.

The refreshable projection never overwrites a source observation or becomes
watch, Queue, or Following evidence. Once provider policy requires cached data
to expire or be deleted, collection/search projections remove those current
facts and immediately fall back to retained owner evidence. Metadata refreshes
must update affected browse and search rows atomically.

### Artwork

Select the best permitted thumbnail that meets the rendered pixel density,
preferring 16:9 candidates and never assuming `maxres`, `standard`, `fhd`,
`qhd`, or `uhd` exists. Store the provider URL and dimensions only as allowed by
the cache policy; do not copy YouTube images into immutable R2 evidence.

Missing video artwork uses a quiet 16:9 local tile with a video glyph. Missing
channel artwork uses a quiet square channel glyph. Do not generate gradients,
initial artwork, scrape watch pages, use embed HTML, or retain an expired URL
contrary to policy. Fixed slots prevent layout reflow.

### Availability and live behavior

Video lookup state is one of:

```text
not_configured | pending | available | unavailable | stale | error
```

- **available** means the ID appeared in a successful current `videos.list`
  response. It does not promise regional playability for every context.
- **unavailable** means the requested ID was absent from a successful response at
  `checkedAt`. The UI says **Unavailable on YouTube when checked {date}**. It
  does not guess deleted, private, region-blocked, age-restricted, or removed.
- **stale** means no policy-compliant current result exists but a prior outcome
  or local evidence remains. Expired provider fields are not displayed when the
  policy requires deletion.
- **error** means a request failed. A failed batch is not unavailability for any
  requested ID.

Unavailable videos retain Archive, Queue, title/channel history, source links,
and History. An unavailable Queue-only ID with no historical title renders
**Unavailable video**. A video with no title and no unavailability evidence
renders **Untitled video**. These are UI fallbacks, never persisted facts or
search terms. Unidentified unavailable watch cards remain unresolved source
evidence and do not create items.

Reliable live state uses only current API facts:

- `liveBroadcastContent=live` with applicable live details: **Live**;
- `liveBroadcastContent=upcoming`: **Upcoming**, with scheduled start when
  returned;
- actual start/end evidence for a completed stream: **Recorded live**, with the
  actual interval when returned; and
- otherwise no live label.

An upcoming/live duration may be absent or change. Do not calculate a final
duration from schedule. `concurrentViewers` is not retained as a Library fact.
Premiere is not inferred from live fields. Watching a live or recorded-live
video still creates the same ordinary Archive occurrence.

Format facets are multi-valued and source-backed: **Live now**, **Upcoming**,
**Recorded live**, and **YouTube Music** are available when exact evidence
supports them. **Shorts** and **Premiere** options remain hidden until a reliable
explicit source and reviewed rule exist. A YouTube Music facet comes from an
exact retained `youtube_music` product/hostname observation and does not change
canonical type.

## Search

Search is scoped to the active Videos view and executes over the entire
server-side collection. Placeholders are:

- Archive/Queue: **Search videos or channels**;
- Channels: **Search channels**.

Archive and Queue search targets are:

1. current permitted video title;
2. every retained historical Takeout video title;
3. current channel title and custom URL when projected;
4. retained historical channel labels for exact channel identities;
5. current description;
6. current category name and tags when the credentialed probe and cache policy
   permit tag projection; and
7. exact YouTube video ID or an exact parsed supported YouTube URL.

Channels search targets current and retained historical channel titles, current
custom URL, current description, and exact channel ID. It does not search
titles of watched, queued, or uploaded videos.

Use D1 FTS5 with `unicode61` and diacritic removal for text. Case/Unicode-
normalized whitespace terms use AND semantics; quoted text remains a phrase;
the final unquoted token supports prefix matching after two characters. An
exact recognized ID/URL bypasses FTS ranking and resolves to that identity only.
Search text shorter than two non-whitespace characters uses a safe literal title
substring fallback rather than an invalid FTS prefix.

Description and tag matches may produce a bounded list-row excerpt, but grid
cards do not display excerpts. Raw HTML, raw ZIP text, non-watch actions,
search-history content, comments, playlist names, likes, transcripts, expired
API data, and opaque source IDs are not searched. `sort=relevance` exists only
with a nonempty text search; otherwise search is a predicate and explicit sort
controls order.

## Filters

All filters are server-side and use projected facts. Multiple values within a
multi-select facet use OR; different facets use AND. Facet counts apply the
current query and other filters while excluding the facet being counted. An
obsolete deep-linked value remains visible as unavailable and can be cleared;
it never silently broadens the query.

### Shared video filters

| Label        | URL/API values                                                                                            | Source and semantics                                                                                                                                                                                |
| ------------ | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Account      | repeatable `account={connectionId}`                                                                       | Exact connection lineage. Archive matches a qualifying occurrence; Queue matches an active membership. Values are owner labels, never emails.                                                       |
| Channel      | repeatable `channelId`                                                                                    | Stable exact channel identity. Unknown channel matches only `channelId=unknown`; labels never establish identity.                                                                                   |
| Published    | `published=all`, `range`, or `unknown`; `publishedFrom`/`publishedTo`                                     | Current unexpired API publication instant. A range is inclusive in owner-local calendar dates; unknown is explicit. Historical watch time is not publication.                                       |
| Duration     | `duration=any`, `under5`, `5to19`, `20to59`, or `60plus`; optional `durationUnknown=true`                 | Current duration: `<5`, `5–19`, `20–59`, or `>=60` minutes. An active/upcoming stream with no stable duration is unknown.                                                                           |
| Availability | `availability=any`, `available`, `unavailable`, or `unchecked`                                            | Latest successful lookup outcome. `unchecked` includes not configured, pending, stale without a current outcome, and never checked; `error` preserves its prior outcome and is disclosed in detail. |
| Format       | repeatable `format` values: `live`, `upcoming`, `recorded_live`, `youtube_music`, `shorts`, or `premiere` | Exact source-backed facets only. Unsupported/unpopulated Shorts and Premiere values remain unavailable rather than heuristic.                                                                       |
| Category     | repeatable YouTube category IDs                                                                           | Current unexpired Data API category projection. Hidden until at least one valid category exists.                                                                                                    |

Published ranges require at least one bound. Owner-local date input becomes
`[start 00:00, day after end 00:00)` converted to UTC. Unknown published/duration
values do not match numeric ranges unless the explicit unknown option is set.
Provider-dependent filters remain visible when active even if the API key is
removed, but expired values cease matching as required by provider policy.

Live, Upcoming, and Recorded live come from the current Data API video profile.
YouTube Music comes only from an exact retained `youtube_music` product/hostname
observation. In Archive it is occurrence-owned and must match the same
occurrence as Watched and Account filters. In Queue it matches only when the
video has an exact retained Music observation; a Queue-only ID has no implied
product. Shorts and Premiere have no matching rows until the explicit source and
rule prerequisite is met.

There is no provider **Source** filter: YouTube is the only Videos membership
provider in this phase, Account already distinguishes its owner lineages, and
Data API metadata is enrichment rather than membership. There is also no rating,
like, arbitrary-playlist, transcript, or completion filter.

### Archive-only filters

| Label        | URL/API values                                                  | Semantics                                                                                                                                                                                |
| ------------ | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Watched      | `watched=all`, `range`, or `unknown`; `watchedFrom`/`watchedTo` | Matches any active occurrence in the owner-local inclusive date range. Current Takeout watches are source-asserted instants. `unknown` is retained for future valid undated occurrences. |
| Watches      | `watches=any`, `once`, or `rewatched`                           | Lifetime active occurrence count: exactly one or at least two. This uses occurrence count, not a source rewatch flag.                                                                    |
| Queue status | `queue=any`, `yes`, or `no`                                     | Whether any active Watch Later relationship exists, without changing Archive membership.                                                                                                 |

Watched date, Account, and any future occurrence-owned predicate must be
satisfied by the same occurrence. `watched=range` requires a bound and is
mutually exclusive with `watched=unknown`.

### Queue-only filters

| Label                | URL/API values                                            | Semantics                                                                                                            |
| -------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Added to Watch Later | `added=all`, `range`, or `unknown`; `addedFrom`/`addedTo` | Matches any active account-scoped Queue membership whose source-added instant is in the owner-local inclusive range. |
| Archive status       | `archive=any`, `yes`, or `no`                             | Whether the video has any active watch occurrence; it never changes Queue membership.                                |

Added date and Account must match the same Queue relationship. Queue has no
Watched or Watches filter; history-specific exploration belongs in Archive.

### Channels filter

| Label     | URL/API values                     | Semantics                                                                                      |
| --------- | ---------------------------------- | ---------------------------------------------------------------------------------------------- |
| Following | `following=any` or `following=yes` | `yes` requires at least one active subscription relationship. It never changes channel counts. |

Channels has no Account, subscription-date, activity, metadata, Category,
Duration, Format, Availability, or Published filter in the initial surface.
Its membership already requires Archive or Queue activity.

## Sorts

All sorts are stable, server-side, and cursor-compatible. Unknown primary values
sort after known values in both directions. Video ties use normalized display
title, normalized channel title, and media item ID. Channel ties use normalized
channel title and channel ID.

### Archive sorts

| Label            | `sort`        | Directions       | Default    | Primary value                                                                                     |
| ---------------- | ------------- | ---------------- | ---------- | ------------------------------------------------------------------------------------------------- |
| Recently watched | `watchedAt`   | `desc`, `asc`    | **`desc`** | Latest known occurrence satisfying Watched and Account filters; otherwise latest known occurrence |
| Title            | `title`       | `asc`, `desc`    | No         | Normalized display title                                                                          |
| Channel          | `channel`     | `asc`, `desc`    | No         | Normalized current/fallback channel title                                                         |
| Most watched     | `watchCount`  | `desc`, `asc`    | No         | Lifetime active occurrence count                                                                  |
| Published        | `publishedAt` | `desc`, `asc`    | No         | Current permitted publication instant                                                             |
| Duration         | `duration`    | `asc`, `desc`    | No         | Current duration milliseconds                                                                     |
| Relevance        | `relevance`   | fixed best-first | No         | FTS rank; search only                                                                             |

For `watched=unknown`, the client selects and labels Title A–Z because
`watchedAt` has no meaningful primary value.

### Queue sorts

| Label          | `sort`        | Directions       | Default    | Primary value                                                           |
| -------------- | ------------- | ---------------- | ---------- | ----------------------------------------------------------------------- |
| Recently added | `addedAt`     | `desc`, `asc`    | **`desc`** | Latest known Watch Later added instant satisfying Account/Added filters |
| Title          | `title`       | `asc`, `desc`    | No         | Normalized display title                                                |
| Channel        | `channel`     | `asc`, `desc`    | No         | Normalized current/fallback channel title                               |
| Published      | `publishedAt` | `desc`, `asc`    | No         | Current permitted publication instant                                   |
| Duration       | `duration`    | `asc`, `desc`    | No         | Current duration milliseconds                                           |
| Relevance      | `relevance`   | fixed best-first | No         | FTS rank; search only                                                   |

For `added=unknown`, Title A–Z replaces Recently added.

### Channels sorts

| Label            | `sort`       | Directions       | Default    | Primary value                                                     |
| ---------------- | ------------ | ---------------- | ---------- | ----------------------------------------------------------------- |
| Most viewed      | `viewCount`  | `desc`, `asc`    | **`desc`** | Lifetime personal watch-occurrence count for known channel videos |
| Recently watched | `watchedAt`  | `desc`, `asc`    | No         | Latest active watch instant among known videos from the channel   |
| Most queued      | `queueCount` | `desc`, `asc`    | No         | Active Watch Later video count for known channel videos           |
| Channel          | `channel`    | `asc`, `desc`    | No         | Normalized current/fallback channel title                         |
| Relevance        | `relevance`  | fixed best-first | No         | Channel FTS rank; search only                                     |

Sort direction is explicit as `direction=asc|desc`; relevance omits it. The API
rejects unsupported view/sort combinations rather than silently substituting
except for the explicitly specified unknown-date fallbacks above.

## Counts

Counts use the same active-state, search, and filter predicates as the collection
and never describe only a loaded page.

- Archive header: **N videos · M watches**. `N` is unique matching videos. `M`
  is qualifying occurrences under Watched and Account filters for those videos;
  without occurrence filters it is all active occurrences for the matching
  videos. Cards retain lifetime counts and additionally show matching counts
  when they differ.
- Queue header: **N videos**. The response also supplies matching active Queue
  relationship count and Queue/Archive overlap count for facets and detail, but
  the ordinary header does not turn account duplicates into apparent videos.
- Channels header: **N channels**. `N` is the number of stable channels with
  Archive or Queue activity after search and the optional Following filter.
- Media navigation badge: unfiltered unique Archive video count.
- Archive, Queue, Channels, Archive occurrence, Queue relationship, and
  Following relationship counts are returned together so view switching never
  displays loaded-page counts as totals.

Exact singular/plural nouns are required: **1 video · 1 watch**, **1 channel · 2
subscriptions**. A video active in two accounts counts once as an item and twice
only where relationship/occurrence count is explicitly named.

## Inspectors

The collection and inspectors are independently fetched. Video detail may open
for an Archive-only, Queue-only, or overlapping item. Channel detail may open for
a followed channel even when it has no known videos. GET requests never create
items or relationships.

### Video inspector

The persistent header contains, in order:

1. video thumbnail/fallback;
2. display title;
3. current/fallback channel title as a channel-selection control only when a
   stable channel ID exists;
4. duration and publication date when known;
5. reliable live marker and availability state when relevant; and
6. membership chips for **Archive** and/or **Queue**.

It has **Details**, **Watch history**, and **Channel** tabs. Channel is disabled
with accessible text **Channel identity unavailable** when only a channel label
exists.

#### Details

Sections appear in this order and empty sections are omitted:

1. **Overview**
   - current description as plain sanitized text;
   - full publication instant/date;
   - duration;
   - category;
   - caption availability, definition, and projection only when useful;
   - reliable live schedule/actual interval; and
   - region restriction or non-embeddable status only as a factual API field,
     not a guarantee of playback.
2. **Your relationship**
   - active Archive watch count and latest known watch instant;
   - every active Watch Later relationship, account label, and source-added
     instant;
   - **Also followed** when the stable channel has an active Following
     relationship, with account count; and
   - exact source-backed format facts such as **Observed on YouTube Music**.
3. **Availability**
   - current lookup state and checked/refreshed time;
   - **Unavailable on YouTube when checked {date}** for omitted IDs;
   - last refresh error separately from last successful outcome; and
   - no guessed reason for absence.
4. **Sources**
   - validated **Open on YouTube** link;
   - **Watch history imported {date}** per contributing connection;
   - **Watch Later imported {date}** per active Queue connection;
   - **Video metadata refreshed {date}**, **YouTube API not configured**,
     **Metadata pending**, **Metadata expired**, or **Metadata refresh failed**;
   - required YouTube attribution; and
   - collapsed technical provenance with connection label, parser version,
     first/last observation, cache parts, and evidence roles, without raw HTML,
     tokens, opaque IDs, or source content dumps.

#### Watch history

The tab label contains the lifetime active occurrence count. Rows are ordered by
known watch instant descending, then connection label, occurrence rank, and
Archive entry ID. It loads 25 rows and uses **Load older watches**.

Each row contains:

1. owner-local watched date and time, or **Watch date unavailable**;
2. **Matches filter** when the current Archive Watched/Account predicates select
   that occurrence;
3. account/connection label;
4. historical title and channel only when they differ from current display;
5. **YouTube Music** when the exact source product says so;
6. validated historical/source video link when available; and
7. compact evidence disclosure with source-recorded value, raw timezone caveat,
   parser version, and evidence roles.

The complete History remains visible under collection filters. Occurrence rank
is technical provenance, not ordinary row copy. Non-watch activity and
unidentified watched cards do not appear in this tab.

#### Channel tab

This tab is the video-context equivalent of an episode's show section. It shows
the channel header, current description, active Following account relationships,
and bounded Library-only lists:

- up to five most recently watched other videos from the channel; and
- up to five active Watch Later videos from the channel.

It never fetches arbitrary uploads. **Open channel inspector** changes selection
from `item` to `channel` while retaining the collection query and scroll.

### Channel inspector

The persistent header contains channel thumbnail/fallback, display title,
current custom URL when available, a **Following** marker only when true,
watched-video/watch counts, latest watched date, and queued-video count.

It has **Details** and **Library** tabs.

#### Details

1. **About:** current permitted description, country only when supplied and
   useful, and channel creation date.
2. **Following:** only when at least one active relationship exists, every
   relationship with account label, source (Takeout or OAuth), known subscribed
   instant, first/last observation, and snapshot freshness. Missing subscription
   time is **Date unavailable**. Omit the section entirely when not followed.
3. **Sources:** validated **Open on YouTube** link; metadata refresh state;
   subscriptions import/refresh dates by account; attribution; collapsed
   technical provenance.

Do not show subscriber/view/video counts, upload playlists, account email,
notification preferences, or OAuth grant identifiers.

#### Library

Library shows videos already in Archive or Queue for the exact stable channel.
It is not an upload catalog. A segmented control selects **Archive** or **Queue**.
Rows reuse the compact video-list fields and load 25 at a time with a separate
opaque cursor. Archive defaults to recently watched; Queue defaults to recently
added. Selecting a row changes `channel` to `item` and opens the video inspector
without changing the underlying Channels collection query.

## Empty, missing, and failure states

- Empty Archive: **No videos in Archive** with a factual instruction to import a
  YouTube Takeout containing watch history.
- Empty Queue after a verified complete Watch Later import: **No videos in
  Queue** and **Watch Later imported {date}**.
- Queue without coverage: **Watch Later has not been imported**. Do not present
  an unverified empty playlist.
- Empty Channels: **No channels with Library activity** with a factual prompt to
  import watch history or Watch Later.
- Empty Channels under Following only: **No followed channels with Library
  activity**. If Following coverage is unavailable, disclose **Subscriptions
  have not been imported or connected** with actions for Takeout import and
  Google connection.
- Valid empty search/filter result: **No matching videos** or **No matching
  channels**, plus **Clear search and filters** without changing the active tab
  or view.
- Missing channel identity: retain the channel label as display metadata, use
  **Channel identity unavailable** in detail, and exclude it from exact channel
  filters/Channels grouping.
- Missing title, artwork, duration, publication, description, category, channel,
  or live detail omits that fact except stable list columns, which use an em
  dash. A missing value never becomes zero or an empty badge.
- Collection failure keeps the shell and query and offers **Try again**. An API
  enrichment failure alone never becomes a collection failure.
- Failed detail preserves the selected summary and says **Details could not be
  loaded** with retry. Rapid selection must never render the prior item's detail
  under the new title.
- Partial/failed Takeout or OAuth snapshots preserve the last successful Queue
  and Following relationships and name their last successful freshness.

## URL and selection state

Defaults are omitted. Nondefault query state is:

```text
q
view                         # Archive/Queue only
sort, direction
item                         # video media-item ID
channel                      # stable channel ID; mutually exclusive with item
watched, watchedFrom, watchedTo
added, addedFrom, addedTo
account                      # repeatable connection ID
channelId                    # repeatable channel facet; not inspector selection
published, publishedFrom, publishedTo
duration, durationUnknown
availability
format                       # repeatable
category                     # repeatable provider category ID
watches
queue                        # Archive overlap filter
archive                      # Queue overlap filter
following                    # Channels only: any or yes
```

Unsupported parameters for the active view are rejected by the API and removed
by the client when navigating between views. Values are canonicalized so
semantically equal URLs share cache keys. `item` and `channel` cannot coexist.

Selecting a video/channel pushes URL history. Closing the inspector removes the
selection and restores focus to its originating row/card. Browser Back closes or
reopens inspection before leaving the collection. Refresh and copied URLs
restore query and selection. If a filter excludes the selection, close detail
and restore focus to the filter control that caused the change.

Inspector tab, expanded history evidence, loaded inspector pages, theme,
sidebar collapse, and the default Videos view preference are not query state.
The session preserves collection page stack and scroll for each canonical URL.

## Pagination

Collection pagination is server-side keyset pagination with an opaque cursor
bound to view, normalized search, filters, sort, direction, page size, and the
last row's complete stable sort tuple. A cursor/query mismatch returns a stable
bad-request error.

- Video grid: 48 items per page.
- Video list: 50 items per page.
- Channels list: 50 channels per page.
- API `limit`: 1–100.
- Explicit **Load more videos** or **Load more channels**; no infinite scroll.
- UI copy: **Showing n of N videos/channels**.
- Search, filter, sort, route, or view/page-size changes discard cursors.
- Inspector open/close preserves loaded collection pages.
- Import, snapshot reconciliation, metadata expiry/refresh, or relationship
  refresh invalidates affected live queries and restarts pagination.

The cursor tuple includes primary-value null rank, primary value, normalized
title/channel tie-breakers, and stable ID. Relevance includes normalized FTS
rank and ID. History uses 25 rows per page, maximum 100, with its own cursor.
Channel Library uses 25 videos per page, maximum 100, with an independent cursor.

## Required HTTP contracts

Current generic media endpoints are too small and Archive-only. Validated shared
contracts must be assembled in repository/service code; route handlers may not
parse ZIPs, scan raw evidence, or call YouTube during browse requests.

### `GET /api/library/videos`

Query accepts the URL state above plus `view=archive|queue|channels`, `limit`,
and opaque `cursor` when view is not inferred from routing.

Archive/Queue summary rows return:

```text
id, type='video', youtubeVideoId
displayTitle, displayTitleSource
thumbnail { url, width, height, expiresAt } | null
channel { id, displayTitle, thumbnail } | { id: null, displayTitle } | null
publishedAt temporal | null
durationMs | null
category { id, name } | null
formats[]
availability { state, checkedAt, lastErrorAt }
archive { active, lifetimeWatchCount, matchingWatchCount,
          latestKnownWatchedAt, referenceWatchedAt,
          activeConnectionCount }
queue { active, activeRelationshipCount, referenceAddedAt,
        activeConnectionCount }
metadata { state, refreshedAt, expiresAt }
```

Channels summary rows return:

```text
channel { id, displayTitle, thumbnail, customUrl | null }
following { active, activeRelationshipCount }
library { archiveVideoCount, watchOccurrenceCount,
          latestWatchedAt, queueVideoCount }
metadata { state, refreshedAt, expiresAt }
```

The response also returns:

```text
nextCursor
totalCount
filteredCount
filteredOccurrenceCount       # Archive only
filteredRelationshipCount     # Queue; null for Archive/Channels
membershipCounts {
  archiveVideos, archiveOccurrences,
  queueVideos, queueRelationships,
  channelItems, followedChannelItems, followingRelationships
}
overlapCounts
facets
sourceFreshness[] {
  connectionId, label,
  historyImportedAt, watchLaterImportedAt,
  subscriptionsImportedAt, subscriptionsRefreshedAt,
  metadataRefreshedAt
}
```

Facets contain exact value/count sets required by the active view and follow the
self-exclusion rule. They expose owner connection labels, never private account
identifiers.

### `GET /api/library/videos/:id`

Returns the video summary plus description, thumbnail candidates permitted for
display, category, API availability/status/live fields selected above, every
active membership summary, stable channel identity, current/historical display
differences, source links, cache/freshness states, and compact provenance. It
also returns History count without loading all rows. It succeeds when Archive or
Queue is active; Following alone does not create arbitrary video items.

### `GET /api/library/videos/:id/history`

Query accepts `limit` (default 25, maximum 100), cursor, and current Watched and
Account filters solely to calculate `matchesFilter`.

```text
archiveEntryId
watchedAt temporal | null
matchesFilter
connection { id, label }
historical { title, channelTitle, channelId, product, sourceUrl }
evidenceSummary [{ role, parserVersion, observedAt, sourceRecordedAt }]
```

Only active Archive occurrences are ordinary rows. Superseded/removed evidence
belongs in technical provenance.

### `GET /api/library/video-channels/:id`

Returns stable channel identity, display metadata, metadata freshness, all active
Following relationships, source links, Archive/Queue counts, latest watch, and
compact provenance. It succeeds for a known exact channel attached to an active
Archive or Queue video. Following alone does not make a channel selectable from
the Channels collection.

### `GET /api/library/video-channels/:id/videos`

Query accepts `membership=archive|queue`, limit (default 25, maximum 100), and
cursor. It returns the corresponding video summary subset with Archive recently
watched or Queue recently added order. It never calls `search.list`, an uploads
playlist, or arbitrary channel discovery.

All endpoints validate responses with shared Zod contracts and return stable
errors for invalid filter combinations, unsupported sort/view, selection-type
mismatch, cursor/query mismatch, missing item, and temporarily unavailable local
data.

## Takeout acquisition and projections

The exact ZIP remains immutable private evidence. Parser updates create
addressable source records and bounded D1 projections; browse requests never
unzip R2.

### Watch history

Retain current parser behavior: exact `Watched`, usable video identity, parsed
source-asserted instant, one source record per activity card, account isolation,
and ADR 0010 rank reconciliation. Project exact channel ID only from a validated
channel-ID URL. Preserve channel labels without making them identity. Preserve
product and original link/instant strings as source-owned facts.

### Watch Later

Parse `Watch later-videos.csv` into one source record per row and parse the
matching `playlists.csv` row when present. A complete snapshot needs an
unambiguous Watch Later member, successful full item-file parse, supported
headers/version, and completed durable commit. Store playlist identity,
visibility/order policy, and playlist timestamps as playlist facts; per-item
membership uses Video ID and `Playlist Video Creation Timestamp` only.

Required logical Queue shape is:

```text
queue_entries
  id, media_item_id, connection_id
  source='youtube', relationship='watch_later'
  source_membership_key
  added_at_value/precision='instant'/basis='source_asserted' | null
  upstream_state
  first_observed_source_record_id, last_observed_source_record_id
  retired_observed_at | null
  created_at, updated_at

queue_entry_evidence
  queue_entry_id, source_record_id
  role = membership | added_time | removal
  linked_at
```

Enforce unique `(connection_id, source_membership_key)`. A Queue-only video ID
creates a video media item and global YouTube identity even with no title.

### Subscriptions

Parse `subscriptions.csv` only when its full supported schema is present. Each
row supplies exact channel ID, URL, and historical title but no subscription
instant. Complete-snapshot status is connection- and member-specific. OAuth
subscription pages normalize into the same relationship projection with their
own evidence/acquisition provenance.

```text
youtube_channel_subscriptions
  id, connection_id, channel_id
  provider_subscription_id | null
  subscribed_at | null
  subscribed_at_source = oauth | null
  current_source = takeout | oauth
  upstream_state
  first_observed_record_or_page_id
  last_observed_record_or_page_id
  retired_observed_at | null
  created_at, updated_at

youtube_subscription_evidence
  subscription_id
  source_record_id | oauth_snapshot_page_id
  role = membership | subscribed_time | removal
  linked_at
```

Enforce unique `(connection_id, channel_id)`. Only a newer successful complete
snapshot for the same selected account/channel may retire an absent relationship.

## Data API cache and refresh

Data API responses are provider cache data, not immutable owner evidence. Keep
full response data outside indefinite R2 retention. The logical queryable
projection is:

```text
youtube_video_catalog_profiles
  media_item_id, youtube_video_id
  title, description, channel_id, channel_title
  published_at, duration_ms, category_id
  caption_state, definition, projection
  privacy_status, embeddable
  region_restriction_json | null
  live_broadcast_content
  scheduled_start_at, actual_start_at, actual_end_at
  fetched_at, expires_at
  lookup_state, checked_at, last_safe_error | null

youtube_video_thumbnails
  media_item_id, variant, url, width, height, expires_at

youtube_channel_catalog_profiles
  channel_id
  title, description, custom_url | null
  published_at, country | null
  thumbnail_url/width/height | null
  fetched_at, expires_at
  lookup_state, checked_at, last_safe_error | null

youtube_categories
  category_id, region_or_locale, name
  fetched_at, expires_at

youtube_catalog_fetches
  id, request_kind, requested_ids_hash, selected_parts
  requested_count, returned_count
  fetched_at, expires_at, outcome, safe_error | null

youtube_catalog_fetch_items
  fetch_id, external_id, returned boolean
```

Persist enough per-ID outcome data to prove that `unavailable` came from a
successful request containing that requested ID. Never expose hashes as product
identifiers. An unsuccessful fetch cannot update availability for its IDs.

Refresh selects missing/oldest profiles first, prioritizing visible and recently
imported identities. Start with bounded batches of 50 only after the probe.
Commit requested/returned outcomes and profile updates atomically. Back off on
quota/server failures. Refresh or delete before policy expiry. Channel metadata
is fetched only for channels needed by visible Library grouping, Following, or
an inspector; the video response's exact channel ID remains sufficient identity.

OAuth grants and refresh tokens are operational secrets, not catalog cache or
source evidence. OAuth snapshot pages need safe acquisition/outcome records for
complete reconciliation but must follow the provider's data policy rather than
indefinite raw retention by default.

## Read models, search, and indexes

Browse requests must not aggregate 23,000 occurrences, scan evidence, unzip
Takeouts, or call Google. Maintain rebuildable repository-owned read models.

```text
video_library_projection
  media_item_id, youtube_video_id
  normalized_display_title, display_title, display_title_source
  channel_id | null, normalized_channel_title, channel_title | null
  thumbnail_url/width/height/expires_at | null
  published_at | null, duration_ms | null, category_id | null
  format_flags, availability_state, availability_checked_at
  metadata_state, metadata_refreshed_at, metadata_expires_at
  archive_active, active_watch_count, active_watch_connection_count
  latest_known_watched_at
  queue_active, active_queue_relationship_count,
  latest_known_queue_added_at
  projection_updated_at

video_channel_projection
  channel_id
  normalized_display_title, display_title
  custom_url | null, thumbnail_url/width/height/expires_at | null
  metadata_state, metadata_refreshed_at, metadata_expires_at
  library_active, following_active, active_subscription_count,
  earliest_known_subscribed_at, latest_known_subscribed_at
  archive_video_count, watch_occurrence_count, latest_watched_at
  queue_video_count
  projection_updated_at
```

Authoritative state remains in ledger, Queue, subscription, and catalog tables.
Imports, occurrence reconciliation, membership retirement, OAuth refresh,
channel identity attachment, metadata refresh/expiry, and availability outcomes
update or rebuild affected read-model rows transactionally.

Required index coverage, expressed as leading columns plus stable ID, is:

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

archive_entries (media_item_id, upstream_state, consumed_at_value DESC, id)
archive_entries (connection_id, upstream_state, consumed_at_value DESC, media_item_id, id)
queue_entries (connection_id, upstream_state, added_at_value DESC, media_item_id)
queue_entries (media_item_id, upstream_state, added_at_value DESC)
youtube_channel_subscriptions (connection_id, upstream_state, subscribed_at DESC, channel_id)
youtube_channel_subscriptions (channel_id, upstream_state)
youtube_video_catalog_profiles (channel_id, media_item_id)
youtube_video_catalog_profiles (category_id, media_item_id)
external_identities (namespace, external_type, external_id)
```

Use partial active indexes where D1 plans benefit while retaining complete
evidence. Multi-account date filters must query occurrence/relationship indexes,
not only the aggregate latest date in the read model.

Maintain two FTS5 indexes:

- video FTS keyed by media item ID over permitted current title/description/tags,
  retained historical titles, current/historical channel labels, and category;
- channel FTS keyed by stable channel ID over permitted current title/custom URL/
  description and retained historical titles.

Exact ID/URL resolution uses external-identity indexes, not FTS. Metadata expiry
must remove expired provider text deterministically while retaining Takeout text.
Search updates are explicit repository writes or tested triggers.

Before finalizing indexes, run `EXPLAIN QUERY PLAN` against synthetic data at
least as large as the observed 20,227 videos, 23,865 watches, 110 Queue rows,
multiple account lineages, and several hundred channel rollups/Following relationships. Verify
every sort, occurrence-aware date/Account query, Queue added range, channel join,
facet count, keyset continuation, and both FTS paths. Consolidate indexes only
when measured plans still meet the bounded-query contract.

## Acceptance examples

Implementation is conformant only if these cases pass with synthetic fixtures:

1. A video watched three times in one account and once in another appears once
   in Archive with four lifetime watches. An Account filter changes matching
   count/reference date without merging or deleting any occurrence.
2. Two same-video, same-instant cards in one snapshot remain two watches; an
   overlapping later snapshot with the same pair does not create four.
3. A watched video still present in Watch Later appears in both views. Watching
   it, importing history, or enabling OAuth never removes Queue membership.
4. A Queue-only ID with no title or API result remains inspectable as
   **Unavailable video**, retains its added instant/account, and sorts correctly.
5. A later complete same-account Watch Later snapshot retires an absent entry;
   a partial/failed/missing-member snapshot and another account's snapshot do
   not.
6. One channel with Library activity and Following relationships in two accounts
   appears once in Channels. Following only keeps it, and revocation/failure for
   one OAuth grant does not erase either last successful relationship or the
   other account.
7. A followed channel with no Archive or Queue videos does not appear in
   Channels. No arbitrary upload catalog or zero-activity placeholder is
   fabricated.
8. A video rename uses the fresh current title in collection while History shows
   the historical title on affected watches. Metadata expiry falls back to
   Takeout without losing searchability by retained titles.
9. A successful `videos.list` omission marks only requested, omitted IDs
   unavailable. A failed batch changes no availability state.
10. An upcoming stream shows its schedule without a fabricated duration; a
    completed stream remains canonical type video and an ordinary watched
    occurrence.
11. A YouTube Music watch matches the explicit facet but remains a video. A
    Shorts URL or short duration alone never marks Shorts; live metadata alone
    never marks Premiere.
12. Archive counts, facet counts, and cursors remain stable under 20,000+ videos;
    History and channel Library never download an unbounded result set.
13. Browser Back closes/reopens video and channel inspectors, deep links restore
    selection and filters, and switching from video to channel inspection keeps
    the underlying collection position.
14. Removing the API key or losing OAuth leaves Takeout Archive/Queue and last
    successful subscription state usable, with precise freshness/error copy and
    no false empty collection.

## Delivery gate

Videos is complete only when the Data API probe and refreshable-cache ADR are
done; OAuth current Following state is credentialed and explicitly bound per lineage;
Takeout Archive, Watch Later, and subscription projections are replayable and
snapshot-safe; all endpoints and indexes above are implemented and validated;
and the local-only, missing, private/unavailable, repeated-watch, multi-account,
live, and expired-cache cases pass.

If credentials are unavailable, Archive, Queue, Channels, and Takeout-backed
Following state may be implemented and reviewed, but the complete Videos slice
must remain explicitly blocked on the public metadata probe and OAuth-current
Following requirements. Data Portability, likes, playlists, transcripts, and
playback are not part of that completion gate.
