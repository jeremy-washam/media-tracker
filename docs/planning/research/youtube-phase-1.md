# YouTube research for Phase 1 Library specification

- Date: 2026-09-19
- Status: Source research; no per-surface Library fields are finalized here
- Scope: YouTube video Archive, Watch Later-derived Queue, metadata enrichment,
  account identity, and optional channel/subscription/playlist relationships
- Privacy: Live observations below contain only field names, types, safe
  aggregates, and hand-authored shapes. No private titles, channel names, URLs,
  video IDs, searches, comments, account IDs, or raw HTML are included.

## Outcome

YouTube needs two deliberately separate acquisition paths for the production
Library:

1. **Google Takeout is the trustworthy owner-history and Watch Later source.**
   It supplies timestamped watch activity and a current Watch Later snapshot.
   The existing importer already preserves the ZIP and projects eligible watch
   occurrences, but it does not project Queue membership or the richer retained
   playlist/subscription evidence.
2. **The YouTube Data API is the current catalog and account-relationship
   source.** `videos.list` can enrich known IDs with current metadata. OAuth can
   retrieve the authenticated channel, user-created playlists, subscriptions,
   liked videos, and ratings. It cannot retrieve Watch History or Watch Later.

Google's Data Portability API can programmatically export YouTube My Activity,
subscriptions, playlists, channel data, and other resource groups. It could
eventually reduce manual export friction, but it requires a separate OAuth
integration, billing/API setup, app verification, region eligibility, and in
some cases a security assessment. Its archive-job cadence is at most once per
24 hours for time-based access. It is not a lightweight substitute for the
ordinary Data API.

The repository has **no configured YouTube Data API key, Google API key,
YouTube/Google OAuth client, access token, or Data Portability grant**. No
authenticated or keyed Data API/Portability data call was made. That is the
exact blocker. This research did live-fetch both official discovery documents
and made one content-redacted request to YouTube's public oEmbed endpoint using
the official player-documentation sample video; oEmbed is useful only as a
limited availability/shape check.

Fresh aggregate probes of the two ignored Takeouts confirm:

- 23,884 `Watched` cards, of which 23,865 have a usable YouTube video identity;
- 20,227 distinct video identities across both account lineages;
- 3,506 repeated watches beyond unique-video counts within their respective
  account lineages;
- 85 non-watch cards and 19 watched cards without a usable identity;
- 110 Watch Later rows, all with an ID and added instant;
- 41 Watch Later videos also present in the corresponding account's history;
  Archive and Queue therefore cannot be mutually exclusive; and
- 69 current Watch Later rows not represented by a watch in the same account.

The current production browse contract still returns only `id`, `type`, and
`title`. It has no Queue model, rich video detail, availability state, channel
entity, playlist/subscription projection, or refreshable catalog cache.

## Evidence labels

| Label                    | Meaning                                                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| **Live-verified**        | Observed on 2026-09-19 from the ignored owner Takeouts, local D1, an official discovery document, or the redacted oEmbed call. |
| **Documented-only**      | Present in current official documentation but not called with this project's key/OAuth grant.                                  |
| **Export-only**          | Available in Takeout or a Data Portability archive rather than the ordinary Data API.                                          |
| **Stored/projected**     | Parsed into current D1 canonical/source records and available to normal repository code.                                       |
| **Retained/recoverable** | Present in the immutable ZIP in R2 but not queryable without parser/schema projection.                                         |
| **New acquisition**      | Requires a new request path, credential, cache/retention design, or provider integration.                                      |
| **Unavailable**          | Not supplied by that source surface.                                                                                           |

“Recoverable” does not mean safe to parse during a browse request. Production
Library queries should use bounded projections, not unzip raw objects on demand.

## Evidence and safe live work

### Repository and implementation review

The review covered the product context, UI foundation, long-term vision,
architecture overview and standards, canonical ledger, implementation plan,
Library handoff, ADRs 0009 and 0010, source index, YouTube source report,
catalog report, connector README, parser, aggregate probe, fixtures/tests,
Takeout import service, contracts, repository, schema, and current web/API
surfaces.

The relevant implementation entry points are:

- `packages/connectors/youtube/src/takeout.ts` and `probe-takeout.ts`;
- `apps/api/src/youtube-import.ts`;
- `apps/api/src/youtube-import.test.ts` and `reconciliation.test.ts`;
- `packages/contracts/src/index.ts`;
- `packages/domain/src/model.ts`; and
- `packages/db/src/schema.ts` and `repository.ts`.

### Credential finding and exact blocker

Only variable names were inspected; values were never printed. The process
environment, root `.env.local`, and `apps/api/.dev.vars` contain no
`YOUTUBE_API_KEY`, `GOOGLE_API_KEY`, YouTube/Google OAuth client, or YouTube/
Google access token. The API binding type also has no YouTube credential.

Consequences:

- `videos.list`, `channels.list`, `playlists.list`, `playlistItems.list`,
  `subscriptions.list`, `videos.getRating`, and `videos.list?myRating=like`
  were not called;
- no response from those endpoints is labeled live account data below;
- Data Portability archive initiation was not attempted; and
- metadata acquisition remains blocked until a restricted API key is supplied;
  private relationships additionally require an OAuth client/grant.

### Live work performed

| Work                                                                                 | Result                                                                                  |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| Existing aggregate-only Takeout probe against both ignored ZIPs                      | Succeeded; aggregate results are recorded below.                                        |
| Additional local structural/nullability probe of watch HTML and Watch Later CSV      | Succeeded; emitted only counts, field names, types, host/path classes, and null counts. |
| Shape-only probe of `playlists.csv` and `subscriptions.csv`                          | Succeeded; no playlist names, channel values, URLs, or IDs were emitted.                |
| Aggregate-only query of current local D1                                             | Succeeded; emitted only counts/null counts.                                             |
| Official YouTube Data API discovery document                                         | Live-fetched; revision `20260914`, schema/method names and types only.                  |
| Official Data Portability discovery document                                         | Live-fetched; revision `20260916`, schema/method names and types only.                  |
| Public `https://www.youtube.com/oembed` request for Google's documented sample video | HTTP success; content-bearing values were redacted before output.                       |
| Keyed/OAuth YouTube Data API and Data Portability account calls                      | Not run; credentials/grants are absent.                                                 |
| Public page scraping                                                                 | Not performed.                                                                          |

## Source surfaces and authority

| Surface                        | Authentication/request                                                    | Coverage and authority                                                                                                                                                 | Important limitation                                                                                                         |
| ------------------------------ | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Google Takeout ZIP             | Owner manually requests/downloads an export and uploads the ZIP.          | Historical watch evidence, Watch Later snapshot, playlist index, subscriptions, and other selected account exports. Exact bytes are owner-supplied immutable evidence. | Manual, overlapping snapshot; no cursor, webhook, or tombstone feed.                                                         |
| YouTube Data API `videos.list` | API key for public/current video metadata; OAuth also works.              | Current metadata and current resolvability for known video IDs.                                                                                                        | Not history evidence; responses are refreshable API data subject to YouTube policies.                                        |
| Data API account methods       | OAuth 2.0, normally `youtube.readonly` for read-only access.              | Authenticated channel identity, subscriptions, user-created playlists, liked videos, and per-video ratings.                                                            | Watch History and Watch Later are explicitly inaccessible. Service accounts are unsupported.                                 |
| Google Data Portability API    | Dedicated Data Portability OAuth scopes plus API key/project setup.       | Archive jobs for `myactivity.youtube`, YouTube subscriptions, channel, playlists, uploaded videos, Music, and other chosen groups.                                     | Verification/availability overhead, asynchronous jobs, 24-hour recurring floor, export rather than query semantics.          |
| Public YouTube oEmbed          | No key for the tested request; input is a known public URL.               | Small current shape: title/author/provider/embed/thumbnail and dimensions.                                                                                             | No duration, publication time, tags, category, live state, ratings, playlist state, or history. Not a bulk catalog strategy. |
| IFrame Player API              | Public embed/player integration.                                          | Playback UI and player-state events for activity inside this app.                                                                                                      | Initial Library is read-only and does not play media; it cannot observe viewing elsewhere.                                   |
| Data API push notifications    | WebSub-style notifications for channel uploads/title/description changes. | Future followed-channel freshness.                                                                                                                                     | Not account subscriptions, Watch Later, or watch-history synchronization.                                                    |

There is no official ordinary YouTube watch-history list endpoint, webhook, or
incremental cursor. The [2016 Data API change](https://developers.google.com/youtube/v3/revision_history)
makes `HL` and `WL` placeholders and causes playlist/list-item requests for
Watch History and Watch Later to return empty results or access errors.

## Fresh private Takeout observations

### Aggregate history and Watch Later results

The ignored archives are treated as Source A and Source B. The labels below do
not disclose filenames or account identity.

| Aggregate                                       | Source A | Source B | Combined interpretation                                   |
| ----------------------------------------------- | -------: | -------: | --------------------------------------------------------- |
| Activity cards                                  |   19,483 |    4,486 | HTML member is not watch-only.                            |
| `Watched` cards                                 |   19,466 |    4,418 | Admission candidate before identity validation.           |
| Watched with usable video ID                    |   19,458 |    4,407 | 23,865 Archive occurrences currently normalize.           |
| Watched without usable video ID                 |        8 |       11 | Preserve as unresolved source evidence.                   |
| Unique watched IDs                              |   16,385 |    3,974 | 20,227 globally distinct; 132 IDs occur in both lineages. |
| Repeated occurrences within lineage             |    3,073 |      433 | Rewatches are common and must not collapse.               |
| Non-watch cards                                 |       17 |       68 | 85 retained but ignored for Archive.                      |
| Missing parsed timestamps on `Watched` cards    |        0 |        0 | Observed completeness, not a future contract.             |
| Watch Later rows                                |       29 |       81 | 110 current Queue observations.                           |
| Watch Later rows already watched in same source |       23 |       18 | 41 Archive/Queue overlaps.                                |

The action distributions were Source A: 19,466 `Watched`, 9 `Answered`, and 8
`Visited`; Source B: 4,418 `Watched`, 40 `Viewed`, 21 `Visited`, and 7
`Answered`. No `From Google Ads` marker occurred in the two current histories.
Source A included one identified watch whose hostname was YouTube Music. Hostname
alone is not enough to reclassify the item as a canonical song.

All exact video-ID-plus-normalized-timestamp comparisons across the two source
archives were distinct. The two lineages still share 132 video IDs; this proves
only that both accounts watched some of the same videos, not that their
occurrences are duplicates.

The fresh safe parser result for Source B is 4,407 identified watches and 11
unidentified watches. That supersedes the older reconnaissance snapshot's
4,410/8 split for this Phase 1 analysis and matches the current parser's strict
YouTube-host validation and the current D1 projection.

### Watch-history HTML: exhaustive observed parser field inventory

The retained HTML is a provider presentation format, not a stable semantic API.
The current parser projects each `.outer-cell .content-cell` into this complete
in-memory shape:

| Field           | Observed type/nullability                                                 | Meaning/status                                                                                                                                                         |
| --------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `action`        | string; never null in 23,969 cards                                        | First direct-text token; exact `Watched` is required for Archive. **Live-verified, retained, partially projected**.                                                    |
| `title`         | string/null; null in 9 Source A and 29 Source B cards                     | Historical display title from first anchor. **Live-verified, retained; projected only for admitted video IDs**.                                                        |
| `titleUrl`      | string/null; same raw anchor-null counts as `title`                       | Original activity link. **Live-verified, retained; canonical URL projected for admitted IDs**.                                                                         |
| `videoId`       | string/null; null in 25 Source A and 79 Source B cards across all actions | Derived only from accepted YouTube/YouTube Music watch hosts and their `v` parameter (or supported short URL). **Derived, stored as external identity when admitted**. |
| `channelTitle`  | string/null; null in 1,817 Source A and 1,188 Source B cards              | Historical channel label from optional second anchor. **Live-verified, retained; projected as `primaryCreatorName` for admitted videos**.                              |
| `channelUrl`    | string/null; same null counts as `channelTitle`                           | Optional channel link; every observed non-null link used a channel-ID path. **Live-verified, retained-only**.                                                          |
| `occurredAtRaw` | string/null; non-null in every observed card                              | Original human-readable timestamp including timezone token. **Live-verified, immutable evidence**.                                                                     |
| `occurredAt`    | ISO-8601 UTC string/null; non-null in every observed card                 | Parser-normalized instant. **Stored/projected for admitted watches**.                                                                                                  |
| `product`       | `youtube`, `youtube_music`, or `unknown`; never null                      | Derived from accepted title-link hostname. **Retained in parser result but not projected to D1 fields**.                                                               |
| `fromGoogleAds` | boolean; false in all current cards                                       | Derived from an exact direct-text marker. **Retained in parser result but not projected**.                                                                             |

Observed card structures had zero, one, or two anchors and two through seven
nonblank direct-text fragments. Source A had 9 zero-anchor, 1,808 one-anchor,
and 17,666 two-anchor cards; Source B had 29, 1,159, and 3,298 respectively.
Every anchor had only an `href` attribute in these exports. The variants cover
available videos with channel links, videos without channel links, unavailable
cards, non-watch actions, and cards with extra detail text. The parser must keep
using semantic checks rather than one fixed child-node sequence.

Both exports used the literal `PDT` token on every card, including dates across
multiple seasons. The current parser interprets the source's literal token as
UTC-07:00. It must preserve `occurredAtRaw`; it should not silently “correct”
historical daylight-saving semantics from calendar date alone. The source value
is instant-precision but has a provider-format caveat.

Sanitized representative parser shapes:

```json
{
  "action": "Watched",
  "title": "Synthetic title",
  "titleUrl": "https://www.youtube.com/watch?v=synthetic",
  "videoId": "synthetic",
  "channelTitle": "Synthetic channel",
  "channelUrl": "https://www.youtube.com/channel/synthetic-channel",
  "occurredAtRaw": "Jan 2, 2026, 3:04:05 PM PDT",
  "occurredAt": "2026-01-02T22:04:05.000Z",
  "product": "youtube",
  "fromGoogleAds": false
}
```

```json
{
  "action": "Watched",
  "title": null,
  "titleUrl": null,
  "videoId": null,
  "channelTitle": null,
  "channelUrl": null,
  "occurredAtRaw": "Jan 2, 2026, 3:04:05 PM PDT",
  "occurredAt": "2026-01-02T22:04:05.000Z",
  "product": "unknown",
  "fromGoogleAds": false
}
```

### Watch Later and playlist-index CSV shapes

Both archives contain `Watch later-videos.csv`. Its exhaustive observed schema
is only:

| CSV field                           | Observed type/nullability                                  | Time/identity semantics                                                                 |
| ----------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `Video ID`                          | nonempty string in all 110 rows                            | Global YouTube video identity; no title or channel accompanies it.                      |
| `Playlist Video Creation Timestamp` | nonempty, parseable ISO-8601 offset string in all 110 rows | Instant when the video was added to this playlist; not publication or consumption time. |

Every row had exactly two columns. The file carries no playlist ID, playlist
item ID, title, description, channel, thumbnail, position, removal time, or
current availability. A Queue-only item can therefore be admitted by identity
without having a display title until enrichment succeeds.

Both archives also contain `playlists.csv`, which the current connector does not
read. Each has exactly one row whose title is the known system name Watch Later.
The exhaustive observed columns are:

```text
Playlist ID
Add new videos to top
Playlist Title (Original)
Playlist Title (Original) Language
Playlist Create Timestamp
Playlist Update Timestamp
Playlist Video Order
Playlist Visibility
```

Source A contained four playlist rows and Source B one. Every observed cell was
nonblank except two original-language cells in Source A. This index is
**retained/recoverable** and can provide the Watch Later playlist identity,
visibility, ordering policy, and playlist timestamps, but those are playlist
facts—not per-item added or removed times.

Sanitized Watch Later row:

```csv
Video ID,Playlist Video Creation Timestamp
synthetic-video,2026-01-02T22:04:05+00:00
```

### Subscription export shape

The task's possible Following/Channels design makes the already-retained
subscription export relevant. It was inspected shape-only. Source A has 106
rows and Source B 28. All three fields were nonempty strings in both snapshots:

```text
Channel Id
Channel Url
Channel Title
```

There is no subscription-created timestamp, notification preference, new-item
count, or removal record in the observed CSV. It is a current snapshot. No
channel values were printed or normalized. This evidence is **export-only and
retained/recoverable**, not a current production feature.

Search history, comments, chats, and unrelated account content were not opened
or parsed.

## Current implementation and local projection

### Import and reconciliation behavior

Parser `youtube-takeout@3`:

- retains the exact ZIP in private R2;
- parses only watch history and the Watch Later item CSV;
- creates one source record for every activity card and Watch Later row;
- admits only exact `Watched` cards with both a usable video ID and parsed time;
- normalizes in durable chunks of at most 100 source records;
- keeps account connections separate;
- reconciles overlapping snapshots by connection, video ID, UTC instant, and
  occurrence rank for identical video/time tuples;
- preserves same-snapshot multiplicity and reuses legacy occurrence IDs;
- never treats absence from a later history snapshot as deletion; and
- resumes from the stored R2 object using the selected `connectionId`.

Watch Later rows are currently marked `ignored`. Their record key and added
instant are stored, but no media item or Queue membership is created. The raw
playlist index and subscriptions file are not selected from the ZIP at all,
although they remain recoverable from the immutable object.

### Live aggregate D1 shape

The current local D1 contains two connected YouTube lineages and two successfully
processed raw exports.

| Projection                                                   |   Aggregate |
| ------------------------------------------------------------ | ----------: |
| Normalized `watch_activity` source records                   |      23,865 |
| Unresolved `watch_activity` source records                   |          19 |
| Ignored non-watch activity records                           |          85 |
| Ignored Watch Later records                                  |         110 |
| Active YouTube Archive occurrences                           |      23,865 |
| Distinct YouTube video media items/identities                |      20,227 |
| Repeat occurrences beyond one per item/connection            |       3,506 |
| Maximum occurrences for one item in one connection           |          19 |
| Media items with null title                                  |  0 observed |
| Media items with null creator                                |       2,415 |
| Media items with null description/image/publication/duration | 20,227 each |

The zero null-title count is an account observation, not a schema guarantee.
Unavailable identity-bearing rows or future API changes can still produce
nullable titles; canonical code correctly permits them.

Both current connections are marked `coverage=complete`, while the UI copy says
automatic watch-history sync is unavailable. Phase 1 should clarify that
“complete” means the imported snapshot processed completely, not that coverage
is current after the export's as-of time.

### Current acquisition/projection gap matrix

| Fact                                              | Current status                                    | Phase 1 implication                                                            |
| ------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------ |
| Video ID, canonical watch URL                     | **Stored/projected**                              | Good canonical identity foundation.                                            |
| Historical Takeout title                          | **Stored/projected**, raw retained                | Do not overwrite without preserving historical observation.                    |
| Historical channel title                          | **Stored/projected when present**                 | String only; stable channel ID/link is retained but not projected.             |
| Watch occurrences and instants                    | **Stored/projected**                              | Complete supported history, including rewatches.                               |
| Raw action/product/ad/detail text                 | **Retained/recoverable**                          | Keep source-owned; not generic engagement events.                              |
| Watch Later ID and added instant                  | **Stored as ignored source record**               | Needs Queue membership projection and queue-only media creation.               |
| Watch Later playlist metadata                     | **Retained/recoverable only**                     | Useful for source identity/as-of display and snapshot reconciliation.          |
| Subscription snapshot                             | **Retained/recoverable only**                     | Optional Following relationship, not Queue or Archive.                         |
| Description, thumbnails, publication, duration    | **Not acquired**                                  | `videos.list` is the primary new acquisition.                                  |
| Stable channel identity/metadata                  | **Retained link for some history; not projected** | Project exact channel IDs from Takeout/Data API before channel grouping.       |
| Tags, category, language, captions, live metadata | **Not acquired**                                  | Available selectively from Data API.                                           |
| Current availability/removal check                | **Not acquired**                                  | Compare each requested batch with returned video IDs.                          |
| Likes/ratings and user playlists                  | **Not acquired**                                  | OAuth/Data Portability relationship features; do not infer from watch history. |
| Library list/detail API                           | **Only `id`, `type`, `title`**                    | Rich, occurrence-aware contracts still need design.                            |

The `media_items` upsert currently uses incoming non-null values as the current
projection. Before Data API enrichment, historical Takeout values and current
catalog values need separate provenance and refresh lifecycles so a mutable
current title does not erase what the activity card said at watch time.

## YouTube Data API

Official references: [overview](https://developers.google.com/youtube/v3/getting-started),
[authentication](https://developers.google.com/youtube/v3/guides/authentication),
[videos.list](https://developers.google.com/youtube/v3/docs/videos/list),
[video resource](https://developers.google.com/youtube/v3/docs/videos),
[channels.list](https://developers.google.com/youtube/v3/docs/channels/list),
[subscriptions.list](https://developers.google.com/youtube/v3/docs/subscriptions/list),
[playlists.list](https://developers.google.com/youtube/v3/docs/playlists/list),
[playlistItems.list](https://developers.google.com/youtube/v3/docs/playlistItems/list),
[ratings](https://developers.google.com/youtube/v3/guides/implementation/ratings),
[quota calculator](https://developers.google.com/youtube/v3/determine_quota_cost),
and [developer policies](https://developers.google.com/youtube/terms/developer-policies).

### Authentication, scopes, quota, and pagination

- Every Data API request requires an API key or OAuth 2.0 token.
- Public `videos.list?id=...` metadata needs only a key. Restrict the key to the
  deployed service and YouTube Data API.
- Private/account filters such as `mine=true` and `myRating=like` require OAuth.
  `https://www.googleapis.com/auth/youtube.readonly` is sufficient for the
  read-only methods proposed here. Do not request write scopes for Phase 1.
- The Data API does not support service-account authorization.
- Current default quota is 10,000 units/day for ordinary endpoints, plus
  separately described defaults for `search.list` and upload. All relevant list
  and rating-read methods below cost 1 unit per request. Invalid requests still
  consume at least one unit.
- `channels.list`, `playlists.list`, `playlistItems.list`, and
  `subscriptions.list` accept at most 50 results per page and return
  `nextPageToken`/`prevPageToken` where applicable.
- `videos.list` with `id` accepts a comma-separated/repeated ID parameter but
  the current method reference does not state a numeric ID cap. Start with
  request-size-bounded batches of 50 as an implementation choice and test it;
  do not describe 50 as a documented contract. At the present 20,227 IDs that
  would be about 405 one-unit calls for a full pass.
- `videos.list?myRating=like` pages at up to 50 but exposes at most the most
  recent 1,000 rated videos even if `pageInfo.totalResults` is larger.

### Endpoint/request plan

| Need                                   | Request                                                                                                                                           | Auth                              | Quota/paging                       | Result semantics                                                                                                                        |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Current known-video metadata           | `GET /youtube/v3/videos?part=snippet,contentDetails,status,liveStreamingDetails,topicDetails,recordingDetails,paidProductPlacementDetails&id=...` | API key                           | 1 unit/request; ID batches         | Returned items are current metadata. Requested IDs absent from `items` need an availability observation, not hard deletion.             |
| Category labels                        | `GET /youtube/v3/videoCategories?part=snippet&id=...` or region-scoped list                                                                       | API key                           | 1 unit                             | Resolves `snippet.categoryId`; cache under the same API-data policy.                                                                    |
| Current channel metadata               | `GET /youtube/v3/channels?part=id,snippet&id=...`                                                                                                 | API key                           | 1 unit; ID batches                 | Stable channel identity, current name/description/images. Optional if video response is enough.                                         |
| Authenticated account/channel identity | `GET /youtube/v3/channels?part=id,snippet,contentDetails&mine=true`                                                                               | OAuth                             | 1 unit; max 50                     | Connects a grant to exact channel identity and yields likes/uploads playlist IDs; `HL`/`WL` are unusable placeholders.                  |
| Current subscriptions                  | `GET /youtube/v3/subscriptions?part=id,snippet,contentDetails&mine=true&maxResults=50&pageToken=...`                                              | OAuth                             | 1 unit/page                        | Current following snapshot with subscription created time and channel metadata.                                                         |
| User-created playlists                 | `GET /youtube/v3/playlists?part=id,snippet,contentDetails,status&mine=true&maxResults=50&pageToken=...`                                           | OAuth                             | 1 unit/page                        | Does not enumerate special Watch Later/History; user playlists are Lists candidates, not Queue by default.                              |
| Playlist members                       | `GET /youtube/v3/playlistItems?part=id,snippet,contentDetails,status&playlistId=...&maxResults=50&pageToken=...`                                  | Key for public; OAuth for private | 1 unit/page                        | Membership/position/added time; Watch Later and History remain inaccessible.                                                            |
| Liked videos                           | `GET /youtube/v3/videos?part=...&myRating=like&maxResults=50&pageToken=...`                                                                       | OAuth                             | 1 unit/page; most recent 1,000 max | Current like relationship plus video resources. Alternative: related likes playlist + `playlistItems.list`.                             |
| Ratings for known IDs                  | `GET /youtube/v3/videos/getRating?id=...`                                                                                                         | OAuth                             | 1 unit/request                     | `items[].videoId` + `items[].rating` (`like`, `dislike`, or `none`). Useful for current Library items without global liked enumeration. |
| Watch Later/History                    | No usable Data API request                                                                                                                        | OAuth does not help               | N/A                                | Explicitly unavailable. Use Takeout or evaluate Data Portability.                                                                       |

`activities.list` reports certain public/channel activities, not private viewing
history and not a replacement for subscriptions, ratings, or Watch Later.

### Common list-response envelope

Documented list responses use:

```text
kind: string
etag: string
nextPageToken?: string
prevPageToken?: string
pageInfo?: { totalResults: integer, resultsPerPage: integer }
items: resource[]
```

The live discovery schema also exposes legacy/internal envelope names
`eventId`, `visitorId`, and `tokenPagination`. Do not build product behavior on
them. Google JSON responses generally omit unavailable fields instead of
returning explicit `null`; parsers must allow absent objects, absent arrays, and
empty arrays. `uint64`/`int64` values are represented as JSON strings.

### Exhaustive current `video` resource field inventory

This is the full nested inventory from the live discovery schema, grouped to
stay readable. It is **documented/discovery-only**, not a live account response.
The public enrichment request should ask only for justified parts.

| Part                           | Complete field paths                                                                                                                                                                                                                                                              |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Envelope                       | `kind`, `etag`, `id`                                                                                                                                                                                                                                                              |
| `snippet`                      | `publishedAt`, `channelId`, `title`, `description`, `channelTitle`, `tags[]`, `categoryId`, `liveBroadcastContent`, `defaultLanguage`, `defaultAudioLanguage`, `localized.{title,description}`, `thumbnails.{default,medium,high,standard,maxres,fhd,qhd,uhd}.{url,width,height}` |
| `contentDetails`               | `duration`, `dimension`, `definition`, `caption`, `licensedContent`, `projection`, `hasCustomThumbnail`, `regionRestriction.{allowed[],blocked[]}`, `countryRestriction.{allowed,exception[]}`, `contentRating.*` (keys below)                                                    |
| `status`                       | `uploadStatus`, `failureReason`, `rejectionReason`, `privacyStatus`, `publishAt`, `license`, `embeddable`, `publicStatsViewable`, `madeForKids`, `selfDeclaredMadeForKids`, `containsSyntheticMedia`                                                                              |
| `statistics`                   | `viewCount`, `likeCount`, `dislikeCount`, `favoriteCount`, `commentCount`                                                                                                                                                                                                         |
| `player`                       | `embedHtml`, `embedHeight`, `embedWidth`                                                                                                                                                                                                                                          |
| `topicDetails`                 | `topicIds[]`, `relevantTopicIds[]`, `topicCategories[]`                                                                                                                                                                                                                           |
| `recordingDetails`             | `recordingDate`, `locationDescription`, `location.{latitude,longitude,altitude}` (location fields are deprecated)                                                                                                                                                                 |
| `liveStreamingDetails`         | `scheduledStartTime`, `scheduledEndTime`, `actualStartTime`, `actualEndTime`, `concurrentViewers`, `activeLiveChatId`                                                                                                                                                             |
| `localizations`                | map of BCP-47 key to `{title, description}`                                                                                                                                                                                                                                       |
| `paidProductPlacementDetails`  | `hasPaidProductPlacement`                                                                                                                                                                                                                                                         |
| `brandPartner`                 | `channelId`, `channelHandle`                                                                                                                                                                                                                                                      |
| Owner-only `fileDetails`       | `fileName`, `fileSize`, `fileType`, `container`, `creationTime`, `durationMs`, `bitrateBps`, `videoStreams[].{widthPixels,heightPixels,frameRateFps,aspectRatio,codec,bitrateBps,rotation,vendor}`, `audioStreams[].{channelCount,codec,bitrateBps,vendor}`                       |
| Owner-only `processingDetails` | `processingStatus`, `processingFailureReason`, `processingIssuesAvailability`, `editorSuggestionsAvailability`, `tagSuggestionsAvailability`, `thumbnailsAvailability`, `fileDetailsAvailability`, `processingProgress.{partsProcessed,partsTotal,timeLeftMs}`                    |
| Owner-only `suggestions`       | `processingErrors[]`, `processingWarnings[]`, `processingHints[]`, `tagSuggestions[].{tag,categoryRestricts[]}`, `editorSuggestions[]`                                                                                                                                            |
| Discovery-only/limited         | `ageGating.{restricted,videoGameRating,alcoholContent}`, `monetizationDetails.access.{allowed,exception[]}`, and empty/opaque `projectDetails`                                                                                                                                    |

`contentRating` currently names these complete rating-system keys (plus the two
reason arrays shown):

```text
acbRating, agcomRating, anatelRating, bbfcRating, bfvcRating, bmukkRating,
catvRating, catvfrRating, cbfcRating, cccRating, cceRating, chfilmRating,
chvrsRating, cicfRating, cnaRating, cncRating, csaRating, cscfRating,
czfilmRating, djctqRating, djctqRatingReasons[], ecbmctRating, eefilmRating,
egfilmRating, eirinRating, fcbmRating, fcoRating, fmocRating, fpbRating,
fpbRatingReasons[], fskRating, grfilmRating, icaaRating, ifcoRating,
ilfilmRating, incaaRating, kijkwijzerRating, kfcbRating, kmrbRating,
lsfRating, mccaaRating, mccypRating, mcstRating, mdaRating,
medietilsynetRating, mekuRating, menaMpaaRating, mibacRating, mocRating,
moctwRating, mpaaRating, mpaatRating, mtrcbRating, nbcRating, nbcplRating,
nfvcbRating, nfrcRating, nkclvRating, nmcRating, oflcRating, pefilmRating,
rcnofRating, resorteviolenciaRating, rtcRating, rteRating, russiaRating,
skfilmRating, smaisRating, smsaRating, tvpgRating, ytRating
```

Most fields are optional. Owner-only upload/processing fields are irrelevant to
videos merely watched by this user. Statistics are mutable strings and are not
needed to make the Library useful. The high-value acquisition subset is much
smaller, but the final list/inspector field selection belongs in the per-media
matrix, not this report.

### Channel, subscription, playlist, playlist-item, and rating inventories

These are complete compact inventories from the live discovery schema.

**Channel**

```text
kind, etag, id
snippet.{title,description,customUrl,publishedAt,defaultLanguage,country,
  localized.{title,description},
  thumbnails.{default,medium,high,standard,maxres,fhd,qhd,uhd}.{url,width,height}}
contentDetails.relatedPlaylists.{likes,favorites,uploads,watchHistory,watchLater}
statistics.{viewCount,subscriberCount,commentCount,videoCount,hiddenSubscriberCount}
topicDetails.{topicIds[],topicCategories[]}
status.{privacyStatus,isLinked,longUploadsStatus,madeForKids,
  selfDeclaredMadeForKids,isChannelMonetizationEnabled}
brandingSettings.channel.{title,description,keywords,defaultTab,
  trackingAnalyticsAccountId,moderateComments,showRelatedChannels,
  showBrowseView,featuredChannelsTitle,featuredChannelsUrls[],
  unsubscribedTrailer,profileColor,defaultLanguage,country}
brandingSettings.watch.{textColor,backgroundColor,featuredPlaylistId}
brandingSettings.image.{bannerImageUrl,bannerExternalUrl,bannerMobileImageUrl,
  bannerMobileLowImageUrl,bannerMobileMediumHdImageUrl,bannerMobileHdImageUrl,
  bannerMobileExtraHdImageUrl,bannerTabletLowImageUrl,bannerTabletImageUrl,
  bannerTabletHdImageUrl,bannerTabletExtraHdImageUrl,bannerTvLowImageUrl,
  bannerTvImageUrl,bannerTvMediumImageUrl,bannerTvHighImageUrl,
  watchIconImageUrl,trackingImageUrl,
  backgroundImageUrl.*,largeBrandedBannerImageUrl.*,
  largeBrandedBannerImageImapScript.*,smallBrandedBannerImageUrl.*,
  smallBrandedBannerImageImapScript.*}
brandingSettings.hints[].{property,value}
auditDetails.{copyrightStrikesGoodStanding,contentIdClaimsGoodStanding,
  communityGuidelinesGoodStanding}
contentOwnerDetails.{contentOwner,timeLinked}
conversionPings.pings[].{context,conversionUrl}
localizations.*.{title,description}
```

The four `*` localized branding maps contain `default`,
`defaultLanguage.value`, and `localized[].{language,value}`. Audit/content-owner
parts are special partner surfaces, not Phase 1 inputs. `subscriberCount` is
rounded and may be hidden. `watchHistory` and `watchLater` values are unusable
placeholders even in an authorized response.

**Subscription**

```text
kind, etag, id
snippet.{publishedAt,channelTitle,title,description,channelId,
  resourceId.{kind,videoId,playlistId,channelId},
  thumbnails.{default,medium,high,standard,maxres,fhd,qhd,uhd}.{url,width,height}}
contentDetails.{totalItemCount,newItemCount,activityType}
subscriberSnippet.{title,description,channelId,
  thumbnails.{default,medium,high,standard,maxres,fhd,qhd,uhd}.{url,width,height}}
```

For `mine=true`, `snippet.resourceId.channelId` is the followed channel and
`snippet.channelId` is the subscriber's channel. `subscriberSnippet` is mainly
relevant when listing the authenticated channel's subscribers, not its own
subscriptions.

**Playlist**

```text
kind, etag, id
snippet.{publishedAt,channelId,channelTitle,title,description,tags[],
  defaultLanguage,thumbnailVideoId,localized.{title,description},
  thumbnails.{default,medium,high,standard,maxres,fhd,qhd,uhd}.{url,width,height}}
contentDetails.itemCount
status.{privacyStatus,podcastStatus}
player.embedHtml
localizations.*.{title,description}
```

**Playlist item**

```text
kind, etag, id
snippet.{publishedAt,channelId,channelTitle,title,description,playlistId,
  position,videoOwnerChannelTitle,videoOwnerChannelId,
  resourceId.{kind,videoId,playlistId,channelId},
  thumbnails.{default,medium,high,standard,maxres,fhd,qhd,uhd}.{url,width,height}}
contentDetails.{videoId,startAt,endAt,note,videoPublishedAt}
status.privacyStatus
```

`startAt` and `endAt` are deprecated. `publishedAt` is the playlist-item added
instant, while `videoPublishedAt` is the video's publication instant.

**Rating response**

```text
kind, etag, eventId, visitorId
items[].{videoId,rating}
```

`rating` is `like`, `dislike`, or `none`. A like is a current personal
relationship, not proof of a watch and not Queue intent.

### Precision, absence, and availability

- Data API datetimes are ISO-8601 instants. `snippet.publishedAt` is a video
  publication/upload-related catalog time, never a watch time. Playlist-item
  `publishedAt` is an added time. Subscription `publishedAt` is a relationship
  creation time.
- Duration is ISO-8601 in `contentDetails.duration`; convert to milliseconds but
  retain the source string in refreshable metadata if useful. Upcoming/live
  broadcasts may not have a stable final duration.
- Thumbnail keys are optional. Never assume `maxres` or the newer `fhd`, `qhd`,
  and `uhd` variants exist.
- If a requested ID is absent from a successful `videos.list` response, record
  “unavailable at check time” with the checked instant. The API does not reliably
  distinguish deleted, private, region-blocked, age-restricted, or otherwise
  inaccessible to the caller in one per-item response.
- A failed batch is not evidence that every requested video disappeared.
- Public API metadata must be refreshed or deleted within 30 calendar days.
  Store it separately from immutable Takeout raw evidence and track
  `fetched_at`, `expires_at`, request parts, and outcome. Display the freshest
  available API data; do not make local history disappear when enrichment
  expires or fails.

## Public oEmbed probe

The redacted live request returned this exhaustive field/type shape:

| Field              | Type   |
| ------------------ | ------ |
| `title`            | string |
| `author_name`      | string |
| `author_url`       | string |
| `type`             | string |
| `height`           | number |
| `width`            | number |
| `version`          | string |
| `provider_name`    | string |
| `provider_url`     | string |
| `thumbnail_height` | number |
| `thumbnail_width`  | number |
| `thumbnail_url`    | string |
| `html`             | string |

The content-bearing values were not printed. oEmbed can cheaply verify that a
known public URL currently resolves and supply a title/author/thumbnail, but it
has no account context and no duration, publication, tags, category, live,
availability-reason, like, playlist, or history fields. It should not become a
second catalog cache or a substitute for `videos.list`.

## Google Data Portability API

Official references: [overview](https://developers.google.com/data-portability/user-guide/overview),
[workflow](https://developers.google.com/data-portability/user-guide/introduction),
[methods](https://developers.google.com/data-portability/user-guide/methods),
[time-based access](https://developers.google.com/data-portability/user-guide/time-based),
[My Activity schema](https://developers.google.com/data-portability/schema-reference/my_activity),
and [YouTube schema](https://developers.google.com/data-portability/schema-reference/youtube).

### Archive-job contract

The live discovery document exposes these methods:

| Method                                | Request                                                 | Response                                                        |
| ------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------- |
| `POST v1/accessType:check`            | empty body                                              | `oneTimeResources[]`, `timeBasedResources[]`                    |
| `POST v1/portabilityArchive:initiate` | `resources[]`, optional `startTime`, optional `endTime` | `archiveJobId`, `accessType`                                    |
| `GET v1/{name}`                       | archive job resource name                               | `name`, `state`, `urls[]`, `startTime`, `exportTime`            |
| `POST v1/{name}:retry`                | empty body                                              | replacement `archiveJobId`                                      |
| `POST v1/{name}:cancel`               | empty body                                              | empty response                                                  |
| `POST v1/authorization:reset`         | empty body                                              | empty response; resets exhausted resource authorization/consent |

Jobs are asynchronous; completion can take minutes to hours and documentation
allows up to seven days. Completed jobs return signed download URLs. Those URLs
are secrets and must never be logged or persisted as ordinary provenance.

### Relevant resource groups and OAuth scopes

Each group uses scope
`https://www.googleapis.com/auth/dataportability.<resource-group>`.

| Resource group                                                                 | Relevance                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `myactivity.youtube`                                                           | YouTube activity records, including ad interactions; the time filter uses activity time. This is the potential programmatic watch-history source.                                                                       |
| `youtube.subscriptions`                                                        | Current channel subscriptions export.                                                                                                                                                                                   |
| `youtube.private_playlists`                                                    | Private playlist metadata and playlist-video rows; potentially relevant to Watch Later, but official schema does not explicitly promise that special Watch Later is included. Must be live-probed before relying on it. |
| `youtube.unlisted_playlists` / `youtube.public_playlists`                      | User-created playlist metadata and member rows; future Lists/folders, not Queue automatically.                                                                                                                          |
| `youtube.channel`                                                              | Authenticated channel/account metadata.                                                                                                                                                                                 |
| `youtube.music`                                                                | Uploaded music and Music library songs; relevant only if the product later reconciles YouTube Music with Songs.                                                                                                         |
| `youtube.private_videos` / `youtube.unlisted_videos` / `youtube.public_videos` | Videos uploaded by the owner plus their metadata/media, not metadata for arbitrary watched videos.                                                                                                                      |

Comments, conversations, live chat, posts, clips, shopping, and Playables are
out of the Phase 1 Videos Library scope.

### My Activity export inventory

The documented Activity-record object is HTML or JSON and has this exhaustive
field list. Fields vary by action and may be absent:

```text
header: string
title: string
titleUrl: string
subtitles: string
description: string
time: string
products: string[]
details: string
activityControls: string
locationInfos: string
imageFile: string
audioFiles: string[]
attachedFiles: string[]
```

`title` can describe `Watched`, `Subscribed to`, `Visited`, and other actions;
`details` can identify ad-derived activity; `activityControls` can distinguish
YouTube watch history from search history. The export may include image, audio,
and CSV attachments. A future parser must filter by exact product/control/action
semantics and retain unknown variants rather than treating every record as a
watch. This JSON schema is richer and structurally safer than HTML, but it has
not been observed for this account.

### Playlist and subscription export inventory

The documented Data Portability playlist entity includes:

```text
Playlist ID
Add new videos to top
Translated Playlist Description Create Timestamp
Playlist Description Locale
Translated Playlist Description
Translated Playlist Description Update Time
Playlist Description (Original)
Playlist Description (Original) Language
Playlist Image Create Timestamp
Playlist Image URL
Playlist Image Height
Playlist Image Width
Translated Playlist Title Create Timestamp
Playlist Title Locale
Translated Playlist Title
Translated Playlist Title Update Timestamp
Playlist Title (Original)
Playlist Title (Original) Language
Playlist Create Timestamp
Playlist update timestamp
Playlist Video Order
Playlist Visibility
```

The associated playlist-video object is exactly `Video ID` and
`Playlist Video Creation Timestamp`, matching the observed Watch Later item
shape. The subscriptions object is exactly `Channel ID`, `Channel URL`, and
`Channel Title`, also matching the observed Takeout shape (capitalization of
`Id`/`Url` differs in the current files).

### Setup, verification, and cadence constraints

- The API requires a Google Developer project, billing enabled, API enabled,
  OAuth client, API key, supported user region, and an adult account.
- Published apps require verification: identity, privacy policy, use-case
  description, and demo video. Restricted scopes also require a security
  assessment. Re-verification is annual or triggered by material app changes.
- Data Portability scopes must not be mixed casually with ordinary Google API
  scopes; official guidance warns that incompatible/too many/pre-granted scope
  combinations cause errors. Use a separate grant/storage boundary.
- Consent is one-time or time-based for 30 or 180 days. Testing-mode refresh
  tokens expire after seven days regardless of the selected duration.
- One-time access permits one export per scope until reset/re-consent.
  Time-based access permits another export no sooner than 24 hours; earlier
  initiation returns `FAILED_PRECONDITION`.
- Initiate soon after authorization; access tokens are short-lived and recurring
  operation requires protected refresh-token storage.

For a private single-user application the product use case fits portability,
but verification/operations remain materially larger than periodic manual
Takeout. It should be evaluated after the ordinary metadata cache and Queue
projection work, unless automatic history updates are a higher priority than
the rest of Library.

## Decision-ready options and recommendations

These recommendations choose acquisition/modeling direction, not final row or
inspector fields.

### 1. Watch Later Queue semantics

**Option A — current-membership snapshot (recommended).** Treat every row in a
successfully parsed Watch Later file as active source Queue membership for that
connection. Preserve `added_at`, first/last observed instants, source playlist
identity where recoverable, and evidence links. On a later complete same-account
snapshot, retire membership absent from the new file while retaining its
history. Never retire from a partial/failed ZIP or a ZIP without the member.

**Option B — append-only intent.** Never remove a Queue entry based on later
absence. This is safest against incomplete exports but causes permanently stale
Queue state and contradicts Watch Later's current-list meaning.

**Option C — local Queue only, Takeout as suggestions.** Avoids snapshot
ambiguity but does not fulfill the owner-specified “Videos use Watch Later” rule.

Recommendation: A, with explicit `snapshot_complete` evidence and export-as-of
copy. Watch Later and Archive remain independent. A video can be both, and a
watch must not implicitly remove Queue intent. Queue-only IDs must create
inspectable media items even when title enrichment is unavailable.

### 2. Connection and account identity

Current imports depend on a user-entered stable `connectionKey`; the ZIP itself
does not currently project an account/channel identity. Options:

1. Keep only the manual key/label. Lowest effort, but easy to route a later
   snapshot into the wrong lineage.
2. Project a stable channel identity from a documented Takeout/Portability
   channel export when present. These two archives do not contain the observed
   generic channel CSV, so this cannot be assumed for every export selection.
3. Link an OAuth grant via `channels.list?mine=true`. Strong live channel
   identity, but an account can manage multiple channels/Brand Accounts and the
   user must choose the lineage deliberately.

Recommendation: keep one connection per known export lineage now; require a
non-secret user label/key; add typed Google account/channel identity only from
explicit evidence; never infer sameness from shared watched IDs, filename,
email, titles, or subscription overlap. If OAuth is introduced, make channel
selection visible and reject ambiguous automatic binding.

### 3. Repeated watches and same-timestamp ambiguity

**Recommended:** one media item per global YouTube video identity, with every
trustworthy watch as an Archive occurrence. Preserve occurrence rank when a
snapshot repeats the same video/timestamp tuple. Date filters match any
occurrence; display/sort semantics follow the Library-wide latest-matching rule;
the inspector retains full history.

ADR 0010's rank reconciliation is the best available policy, not proof that the
upstream event has a durable ID. Keep all raw cards/evidence so a later parser
can revise matching. Changed timestamp is a distinct occurrence. Absence from
history snapshots is not deletion proof.

### 4. Shorts, live streams, premieres, Music, ads, private/deleted videos

- **Shorts:** the current `video` resource has no authoritative Shorts flag.
  URL form, duration, aspect ratio, or title are heuristics. Keep canonical type
  `video`; an optional derived format facet can be introduced only with explicit
  provenance and a tested rule. Do not create a separate Shorts Archive.
- **Live/completed live:** preserve `snippet.liveBroadcastContent` and
  `liveStreamingDetails` when returned. They are catalog facts; a watched card
  still means one consumption occurrence. Do not treat `concurrentViewers` as a
  durable Library fact.
- **Premieres:** the documented video resource has no reliable standalone
  premiere flag. Do not infer one from live fields alone.
- **YouTube Music:** retain the historical product/hostname. Do not reclassify a
  watched Music URL as a song without an authoritative recording identity and
  a cross-media reconciliation rule.
- **Ads and non-watch actions:** preserve source evidence; do not admit to
  Archive. The current files have no observed ad marker, but the portability
  schema explicitly includes ad interactions.
- **Private/deleted/unavailable:** keep historical title/channel/watch evidence
  and show an availability state separately. Never delete the Archive item
  because current metadata lookup omits it. Unidentified unavailable cards
  remain source evidence, not fake media items.

### 5. Channel and subscription/Following experiences

Options:

1. Keep channel as a creator string only. Simple, but renames fragment grouping
   and no stable channel link exists in the product API.
2. Project stable channel identities from Takeout links and Data API enrichment,
   enabling exact channel grouping and “more watched from this channel.” This
   does not require importing subscriptions.
3. Also project the current subscription snapshot and expose a Following
   filter/section. This is useful for browsing relationships or future feed
   work but is neither Queue nor evidence of consumption.

Recommendation: implement 2 as metadata infrastructure when enrichment lands.
Treat 3 as an optional Videos-specific relationship feature that must earn a
clear Library query; the retained Takeout already offers a credential-free
backfill, and OAuth can later reconcile current state/created times. Do not
expand subscriptions into every channel upload in Archive or Queue.

### 6. Likes, ratings, and playlists

- A like is independent personal metadata. It may support a badge/filter or a
  future relationship section, but it is not a watch and not Queue intent.
- `videos.getRating` over known Library IDs avoids the 1,000-item global
  `myRating=like` ceiling and can update exact current ratings in batches.
- User-created playlists are deliberate collections and possible future Lists.
  They should not become Queue automatically. Preserve playlist and
  playlist-item identity, position, added time, and snapshot membership if that
  product scope is approved.
- The present Takeouts have no `Liked videos-videos.csv` member. This is an
  account/export observation, not proof that Takeout or Data Portability can
  never provide likes.

Recommendation: Queue work should parse only Watch Later semantics. Keep likes
and arbitrary playlists out of Queue; project them only alongside a decided
filter/Following/Lists use case.

### 7. Historical title versus current metadata

Options:

1. Keep one mutable title/creator. Simple but destroys which title/channel was
   shown when watched.
2. Keep the current canonical display projection plus source-scoped historical
   observations and an expiring Data API catalog snapshot.
3. Freeze Takeout title forever. Preserves history but gives poor current
   browsing and cannot recover missing artwork/duration.

Recommendation: 2. The immutable card remains the historical fact; the current
catalog cache supplies current display. The UI may default to current metadata
and disclose historical titles in provenance/history where they differ. Never
rewrite raw evidence or silently make current API metadata look historical.

### 8. Metadata breadth

Acquisition tiers, without committing where they render:

- **Core candidate:** current title, channel ID/name, description, thumbnails,
  publication instant, duration, and lookup availability.
- **Format/availability candidate:** live fields, caption flag, projection,
  definition, embeddable/privacy/region restrictions, made-for-kids,
  synthetic-media disclosure, default languages, and paid-placement flag.
- **Discovery/filter candidate:** tags, category ID/name, and topic categories.
- **Low initial value:** mutable view/like/comment statistics, recording
  location, embed HTML, owner-only processing/file details, all localized
  variants, and the full content-rating matrix.

Recommendation: acquire a policy-compliant superset only when a concrete query
or inspector section justifies it. Raw Data API pages should not be placed in
indefinite immutable storage by default; retain request/outcome provenance and
refreshable response/cache data separately.

### 9. Batch and refresh strategy

Recommended initial strategy:

1. Select known YouTube identities missing fresh metadata, oldest first.
2. Fetch bounded ID batches (start at 50 and validate).
3. Save requested IDs, returned IDs, fetch instant, selected parts, and safe
   request outcome atomically with cache updates.
4. Mark absent IDs unavailable only after a successful page; retain prior
   catalog metadata with its observation time if policy permits, or delete it at
   expiry while leaving Takeout facts intact.
5. Refresh/delete catalog data before 30 days. Prioritize currently visible and
   recently imported items; a complete 20,227-ID refresh at 50 per request is
   roughly 405 units, well below the ordinary default daily pool.
6. Back off on quota/server errors; never turn a failed page into mass removal.
7. Fetch channel details separately only if channel sections need fields not
   available on the video response.

### 10. Possible Videos-specific Library sections

These are options, not selected surface fields:

- **Details:** current catalog metadata and source link.
- **Watch history:** every supported occurrence, matching occurrence emphasis,
  account/source provenance, and historical title differences.
- **Availability/live:** current lookup state and time checked; live schedule
  only when relevant.
- **Channel:** stable creator identity and watched items from that channel.
- **Following:** current subscription relationship, only if subscriptions are
  projected.
- **Playlists/likes:** relationship metadata, only if a Lists/likes use case is
  selected.
- **Source:** Takeout snapshot/as-of coverage and immutable evidence disclosure.

Avoid a generic “engagement” panel, fabricated completion, or a Queue tab for
arbitrary liked/user-playlist items. Transcripts/captions download is not unlocked
by public metadata; the official captions-download API requires owner/editor
authorization and is outside this Library phase.

## Recommended Phase 1 acquisition sequence

This sequence intentionally precedes final field placement:

1. Extend the Takeout parser to read `playlists.csv`, project Watch Later
   membership and membership history, and create queue-only video identities/
   media items. Preserve complete/partial snapshot semantics per connection.
2. Add a Queue model distinct from Archive, with evidence, added time,
   first/last observed, active/removed state, and source account/playlist
   identity. Do not infer removal from watching.
3. Add a separate refreshable YouTube catalog cache/provenance model that can
   satisfy the 30-day Data API policy without weakening immutable Takeout raw
   retention.
4. Obtain a restricted API key and run a safe public `videos.list` probe across
   synthetic/sample IDs and a content-redacted sample of known IDs. Record
   observed optionality for ordinary, live, private/deleted, and unavailable
   cases before finalizing storage fields.
5. Enrich all known IDs in bounded batches and expose failure/expiry separately
   from local history.
6. Project stable channel identity if the selected Videos experience needs
   grouping. The current Takeout channel links may cover many rows without
   OAuth.
7. Decide whether subscriptions/likes/user playlists earn product sections.
   Use retained exports first where adequate; add `youtube.readonly` OAuth only
   for current reconciliation or richer relationship timestamps.
8. Revisit Data Portability only after a small proof establishes verification
   feasibility, region/account eligibility, actual `myactivity.youtube` shape,
   whether Watch Later appears in private playlists, and overlap behavior with
   Takeout.

## Verification gaps and exact blockers

1. **No Data API key:** public `videos.list`, category lookup, and channel lookup
   response optionality are documented but not live-verified for this project.
2. **No OAuth client/grant:** authenticated account identity, subscriptions,
   playlists, likes, and per-video ratings were not called.
3. **No Data Portability setup/grant:** My Activity JSON, archive-job behavior,
   resource-group contents, and special Watch Later inclusion are documented
   only.
4. **Account identity remains unresolved:** the two Takeouts must remain
   separate connections; whether each represents a Google Account, Brand
   Account, or channel lineage was not established without exposing private
   account data.
5. **Cross-snapshot behavior is not measured within one account:** the two
   current archives have zero exact event overlap and are separate lineages.
   A later overlapping export from the same account is needed to measure order,
   byte stability, Watch Later removal, title changes, and unavailable items.
6. **Variant coverage is not proven:** Shorts, premiere-specific representation,
   ads, private/deleted videos with retained IDs, region restrictions, and
   changed channel identities need safe synthetic fixtures plus future real
   aggregate observations.
7. **oEmbed is not a substitute:** its successful live shape says nothing about
   Data API nullability, quota, private relationships, or bulk availability.

## Phase 1 conclusion

The production Videos Library is not blocked on perfect YouTube synchronization.
The existing Takeout path already supports trustworthy Archive history and the
retained exports contain enough exact Watch Later evidence to implement Queue.
The critical next storage decision is to keep immutable owner evidence separate
from expiring current API metadata.

The recommended direction is:

- one video item per authoritative YouTube video identity;
- all supported watch occurrences retained per account connection;
- independent Watch Later Queue membership and history;
- current metadata and availability from a refreshable `videos.list` cache;
- stable channel identity when needed, without requiring subscriptions;
- likes, subscriptions, and arbitrary playlists treated as optional personal
  relationships rather than Archive/Queue admission; and
- Data Portability deferred until its operational cost and actual account
  payloads are proven worthwhile.

This research deliberately does not choose which candidate fields appear in a
row, grid card, filter, or inspector. Those choices belong in the Phase 1
per-media field/behavior matrix after the credentialed metadata probe.
