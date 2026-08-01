# Spotify Source Reconnaissance

- Status: Feasible as a hybrid import, with important podcast sync gaps
- Last verified: 2026-07-19
- Priority: Podcasts first; songs are secondary
- Sources: Official Spotify documentation and private aggregate probes

## Executive assessment

Spotify can support a strong historical podcast backfill, but not a complete,
seamless podcast-history sync.

The reliable historical source is the manually requested **Extended Streaming
History** export. Spotify says it covers audio, video, and podcasts for the
lifetime of the account. Its podcast rows include an episode URI and listening
duration, which is enough to identify and enrich most episode plays.

The Web API complements that export with current metadata, saved episodes and
shows, playback positions, and a mutable `fully_played` flag. However, Spotify's
recently-played endpoint explicitly excludes podcast episodes, Spotify offers no
listener-history webhook, and the Web API exposes no completion timestamp. A
poller can reconcile known or discoverable episodes, but it cannot guarantee
that it will discover every newly played episode.

Recommended integration shape:

1. Import Extended Streaming History as the authoritative lifetime backfill.
2. Enrich episode and track URIs with Web API metadata.
3. Poll saved episodes and classify untouched saves as Queue; classify any
   episode with playback evidence as Archive. Optionally scan saved shows and
   current playback to reduce the gap between exports.
4. Treat the next Extended Streaming History import as reconciliation for plays
   missed by polling.
5. Make the UI explicit that podcast history since the last export can be
   incomplete.

This is still a good fit for a private, single-user app. Development mode is
specifically intended for apps accessing one Spotify account, and the owner
already has Premium.

## Source surfaces

| Surface                           | Historical reach                                                                 | Incremental value                                                                                  | Main limitation                                                                    |
| --------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Extended Streaming History export | Spotify describes it as the account's lifetime audio, video, and podcast history | A later manual export can reconcile new rows                                                       | Manual request/download; no export API, webhook, or continuous cursor              |
| `GET /me/episodes`                | Current saved episode library                                                    | Detects saved episodes and current playback-position state                                         | Saved episodes are intent/library state, not complete listening history            |
| `GET /me/shows`                   | Current saved show library                                                       | Discovers shows whose episode catalogs can be scanned                                              | Does not include every show ever heard                                             |
| `GET /shows/{id}/episodes`        | Catalog for a known show                                                         | With `user-read-playback-position`, exposes current `fully_played` and resume position per episode | Expensive full scans; no updated-since filter or completion timestamp              |
| `GET /episodes/{id}`              | One known episode                                                                | Enriches export URIs and reads current playback position                                           | Development mode removed the batch endpoint, so enrichment is one episode per call |
| `GET /me/player`                  | Current playback only                                                            | Can observe a currently playing track or episode, progress, and state-change timestamp             | Sampling can miss entire plays and cannot prove completion                         |
| `GET /me/player/recently-played`  | Recent tracks                                                                    | Useful for secondary song ingestion                                                                | Spotify explicitly says podcast episodes are unsupported                           |
| Saved-library writes              | Current Spotify library                                                          | Can mirror a future local Queue to Spotify saved episodes/shows                                    | A saved item is not the same as playback history                                   |

Official references:

- [Understanding your data](https://support.spotify.com/article/understanding-your-data/)
- [Download/data rights](https://support.spotify.com/article/data-rights-and-privacy-settings/)
- [Get User's Saved Episodes](https://developer.spotify.com/documentation/web-api/reference/get-users-saved-episodes)
- [Get User's Saved Shows](https://developer.spotify.com/documentation/web-api/reference/get-users-saved-shows)
- [Get Show Episodes](https://developer.spotify.com/documentation/web-api/reference/get-a-shows-episodes)
- [Get Episode](https://developer.spotify.com/documentation/web-api/reference/get-an-episode)
- [Get Playback State](https://developer.spotify.com/documentation/web-api/reference/get-information-about-the-users-current-playback)
- [Get Recently Played Tracks](https://developer.spotify.com/documentation/web-api/reference/get-recently-played)

## Authentication and app setup

### Development-mode fit

New apps begin in development mode. As of the February/March 2026 changes:

- The app owner must have an active Spotify Premium subscription.
- A new developer can have one client ID.
- A development-mode app supports up to five authenticated users.
- Users must be placed on the app's allowlist; an unlisted user may complete
  login but API calls return `403`.
- Extended quota mode is unnecessary for this strictly single-user app. Spotify
  says new extension applications are accepted only from qualifying
  organizations, not individuals.

See [Quota modes](https://developer.spotify.com/documentation/web-api/concepts/quota-modes)
and the [February 2026 migration guide](https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide).

### OAuth flow

User-specific endpoints require user authorization. For this API-first app, use
an authorization-code flow handled by the backend, or authorization code with
PKCE. Do not use Client Credentials for personal library or playback data and do
not use the deprecated Implicit Grant flow.

Spotify requires an exact redirect-URI match. Production callbacks must use
HTTPS. Local callbacks may use an explicit loopback IP such as
`http://127.0.0.1:8787/...`; `localhost` is not allowed.

Relevant official guidance:

- [Authorization Code with PKCE](https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow)
- [Redirect URIs](https://developer.spotify.com/documentation/web-api/concepts/redirect_uri)
- [Refreshing tokens](https://developer.spotify.com/documentation/web-api/tutorials/refreshing-tokens)

Current token behavior materially affects unattended sync:

- Access tokens last one hour.
- Refresh tokens issued to dashboard-registered apps last six months.
- Refreshing an access token does not extend the refresh token's lifetime.
- The app must ask the owner to authorize again before or when the refresh token
  expires.

Store client credentials and refresh tokens only in deployment/local secret
storage. Do not expose them to the browser, logs, raw-object storage, fixtures,
or Git.

### Minimum scopes

Start with least privilege:

| Capability                                       | Scope                                            |
| ------------------------------------------------ | ------------------------------------------------ |
| Read saved episodes and shows                    | `user-library-read`                              |
| Receive `resume_point` and `fully_played`        | `user-read-playback-position`                    |
| Read playback state for optional sampling        | `user-read-playback-state`                       |
| Read recent song plays                           | `user-read-recently-played`                      |
| Mirror future Queue items to the Spotify library | `user-library-modify` (defer until Queue exists) |

Avoid requesting playback-control or library-modify scopes during the initial
read-only ingestion phase.

## Extended Streaming History

### Request and delivery

Spotify directs users to the automated **Download your data** tool on the
Account Privacy page. It delivers a ZIP containing machine-readable data and a
`Read Me First - Extended Streaming History` file.

The support documentation establishes lifetime coverage but does not document
an API, recurring schedule, maximum request frequency, exact delivery time, file
naming convention, array ordering guarantee, or deletion/revision guarantee.
Those details must be treated as unknown until the private export is inspected.

Operationally, this is a user-initiated snapshot:

1. Request Extended Streaming History from Spotify Account Privacy.
2. Download the ZIP when Spotify makes it available.
3. Import the ZIP locally without committing it.
4. Preserve each source file as a private raw object with checksum and acquisition
   time.
5. Re-request and re-import periodically to reconcile gaps left by the Web API.

### Documented field inventory

Spotify's public support page documents 21 values. The current technical keys
used by the export are listed below, but the delivered `Read Me First` file is
the definitive schema and must be checked before freezing the parser.

| Export key                          | Meaning documented by Spotify                  | Treatment                                                                                        |
| ----------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `ts`                                | UTC date and time when the stream ended        | Source instant; a play-segment end, not automatically a completion time                          |
| `username`                          | Spotify username                               | Sensitive account identity; retain privately or redact from normalized data                      |
| `platform`                          | Platform used for streaming                    | Optional source metadata                                                                         |
| `ms_played`                         | Milliseconds played                            | Preserve exactly; useful for completion inference only after episode duration is known           |
| `conn_country`                      | Country code where streaming occurred          | Sensitive/low-value metadata; preserve raw, likely omit normalized                               |
| `ip_addr_decrypted`                 | IP address used                                | Highly sensitive; preserve only in access-controlled raw import and never log or expose          |
| `user_agent_decrypted`              | User agent used                                | Sensitive; preserve raw and omit normalized unless diagnostics require it                        |
| `master_metadata_track_name`        | Track name                                     | Song title; may be absent for podcast rows                                                       |
| `master_metadata_album_artist_name` | Artist, band, or podcast name                  | Song creator metadata; verify podcast population empirically                                     |
| `master_metadata_album_album_name`  | Track album name                               | Song album metadata                                                                              |
| `spotify_track_uri`                 | Unique Spotify track URI                       | Primary external identity for songs                                                              |
| `episode_name`                      | Podcast episode name                           | Podcast title fallback, not a stable identity by itself                                          |
| `episode_show_name`                 | Podcast show name                              | Show-title metadata; export does not document a show URI                                         |
| `spotify_episode_uri`               | Unique Spotify episode URI                     | Primary external identity for podcast episodes                                                   |
| `reason_start`                      | Reason playback started                        | Preserve source value; useful evidence about automatic vs explicit starts                        |
| `reason_end`                        | Reason playback ended                          | Preserve source value; may support completion inference but is not itself a completion flag      |
| `shuffle`                           | Whether shuffle was used                       | Relevant mainly to songs                                                                         |
| `skipped`                           | Whether the user skipped to the next item      | Preserve source value; do not assume a stable threshold without inspecting export docs           |
| `offline`                           | Whether playback was offline                   | Source metadata                                                                                  |
| `offline_timestamp`                 | Timestamp associated with offline-mode use     | Preserve raw; confirm unit and exact semantics from the delivered readme                         |
| `incognito_mode`                    | Whether playback occurred in a private session | Sensitive; Spotify includes the field in the export, but it should not be exposed in ordinary UI |

This list corresponds to Spotify's public [Extended streaming history description](https://support.spotify.com/article/understanding-your-data/).
Nullability, primitive types, enum values, and behavior for ads, local files,
video podcasts, removed content, and older records must be established from the
private payload rather than guessed.

### Completeness and cadence

Strengths:

- Spotify describes the history as covering the lifetime of the account.
- Podcast and song rows have dedicated URIs, titles, and played milliseconds.
- Offline and private-session indicators are represented.
- Start/end reasons and skip state provide useful evidence beyond a flat item
  list.

Limits:

- It is not a live API and cannot deliver seamless automatic sync.
- A later export is required to close gaps left by Web API polling.
- It contains play segments, including partial plays; it is not a ready-made list
  of completed media.
- There is no documented stable event ID.
- The public docs do not promise stable row ordering across overlapping exports.
- An export row's `ts` is when that stream ended, not necessarily when the whole
  episode was completed.

### Idempotent raw import

Do not deduplicate solely by episode URI and timestamp: multiple play segments
for an episode are legitimate, and repeated listening is valuable history.

For initial import, retain provenance by raw-object checksum, member filename,
and array index. During the private probe, compare two overlapping exports to
determine whether row content and ordering are stable. Only then define a
cross-export source-event key, likely based on a normalized full-row hash plus a
deterministic duplicate ordinal. Until this is proven, imports should preserve
ambiguous duplicates and surface them rather than silently losing listening
evidence.

## Web API capabilities

### Saved episodes

`GET /me/episodes` returns the current user's saved episodes with:

- `added_at`: the UTC instant when the episode was saved;
- an episode object containing Spotify `id`, `uri`, URL/href, title,
  descriptions, `duration_ms`, explicit flag, images, playability, languages,
  release date and precision, restrictions, and embedded show metadata;
- `resume_point.fully_played` and `resume_point.resume_position_ms` when the token
  includes `user-read-playback-position`.

It uses offset pagination with `limit` up to 50 and provides `next`, `previous`,
and `total`. It has no updated-since filter. The complete set must be enumerated
to detect additions and removals.

Important semantic distinction: `added_at` is a saved/library date. It is not a
play or completion timestamp.

For this product, the saved-episode snapshot has a deliberately simple
classification rule:

- `fully_played == true` -> Archive;
- `resume_position_ms > 0` -> Archive, even when only partially played;
- explicit `resume_position_ms == 0` -> Queue;
- null playback position -> unresolved until another source supplies evidence.

This matches the owner's actual Spotify workflow: saved episodes can remain in
the library after listening, while playback position distinguishes untouched
intent from consumed content. Preserve the observed values and observation time
because Spotify does not provide the time when playback began or completion was
marked.

### Saved shows and show episodes

`GET /me/shows` returns saved shows with `added_at` and show metadata. It also
uses offset pagination up to 50.

For each saved show, `GET /shows/{id}/episodes` can enumerate its catalog. With
`user-read-playback-position`, each simplified episode may include the current
`fully_played` and resume position. This is the best automatic discovery surface
for completed podcast episodes from shows the owner saves, but it is neither
complete nor cheap:

- Unsaved shows are outside the scan unless their episodes are known another
  way.
- Every show's episode pages must be scanned because there is no updated-since
  parameter or show snapshot ID.
- `fully_played` is current mutable state and has no source timestamp.
- The API does not expose a history of played/unplayed state transitions.

Use the show URI/ID as the show identity and episode URI/ID as the episode
identity. In development mode, do not depend on the removed batch episode/show
fetch endpoints; enrich individual objects or use the show-episodes listing.

### Episode metadata and playback position

`GET /episodes/{id}` provides full metadata for a known episode. Important
fields include:

- `id`, `uri`, `href`, and `external_urls.spotify`;
- `name`, plain and HTML descriptions;
- `duration_ms`;
- `release_date` plus `release_date_precision` (`year`, `month`, or `day`);
- images, languages, explicit/playable/external-hosting flags and restrictions;
- embedded show identity and metadata;
- optional `resume_point.fully_played` and `resume_position_ms` for a properly
  scoped user token.

Spotify's developer policy requires attribution and a link back when displaying
Spotify metadata or artwork. It also forbids downloading Spotify content. Store
metadata and links, not podcast audio.

### Current playback

`GET /me/player` can return either a track or episode plus:

- a millisecond `timestamp` for when playback state last changed;
- `progress_ms` into the currently playing item;
- play/pause and device state;
- context information.

This can make a best-effort observer more timely, but polling is not an
authoritative event stream. A cron interval can miss short plays, playback while
the token is unavailable, and transitions between polls. The timestamp is a
state-change timestamp, not a completion timestamp.

### Recently played and songs

`GET /me/player/recently-played` is cursor-paginated with millisecond `after` or
`before` values, returns up to 50 records, and includes `played_at` for tracks.
Spotify explicitly states that it **does not support podcast episodes**.

It is suitable for best-effort incremental song ingestion. It is not sufficient
for lifetime song history and must not be used as the podcast sync mechanism.
Because the endpoint returns a bounded recent window, polling failures can
create irrecoverable gaps until the next Extended Streaming History import.

The top-items endpoint is affinity/ranking data over approximate time ranges,
not history, and should not be imported as consumption events.

## Identifiers and date meanings

| Value                                 | Meaning                                           | Modeling note                                                                    |
| ------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------- |
| `spotify:episode:{id}` / episode `id` | Spotify catalog identity for an episode           | Primary external identity; retain both URI and parsed ID                         |
| `spotify:show:{id}` / show `id`       | Spotify catalog identity for a show               | Obtained through Web API enrichment; ESH publicly documents only show name       |
| `spotify:track:{id}` / track `id`     | Spotify catalog identity for a song/recording     | Primary external identity for secondary song ingestion                           |
| ESH `ts`                              | UTC end of one stream                             | Source occurrence time for the segment, not publication or guaranteed completion |
| ESH `offline_timestamp`               | Timestamp related to offline playback             | Do not normalize until unit/meaning is confirmed from the export readme          |
| saved `added_at`                      | UTC time item/show was saved                      | Queue/library event, not consumption                                             |
| episode `release_date`                | Catalog publication date with explicit precision  | Preserve original value and precision; do not invent missing month/day           |
| playback `timestamp`                  | Millisecond time when playback state last changed | Observation metadata, not a played/completed event time                          |
| track `played_at`                     | Recent track play time                            | Song-only source time from recently played                                       |
| importer acquisition time             | When this app received export/API data            | `ingested_at`; never substitute it for a missing source occurrence time          |

If an export row lacks a Spotify URI, preserve it as unresolved raw evidence.
Do not merge by title and show name without a reviewable confidence mechanism.

## Playback and Archive semantics

For podcasts, Archive means the owner consumed at least part of the episode; it
does not require reaching Spotify's definition of fully played. This is an
intentional product rule, not an inference about completion.

Available evidence maps as follows:

1. `resume_point.fully_played == true` places the episode in Archive.
2. `resume_point.resume_position_ms > 0` places the episode in Archive even when
   `fully_played` is false.
3. Any ESH segment with positive `ms_played` places the episode in Archive.
4. A saved episode with an explicit zero position remains in Queue.
5. A null playback position remains unresolved rather than being treated as an
   untouched episode.

The evidence strength still matters for dates. The Web API flags are mutable and
undated, while ESH `ts` is the end of a playback segment rather than necessarily
a completion time. Preserve both sources and allow an Archive occurrence time to
be unknown when only the saved-episode snapshot is available; never substitute
the poll or ingestion time as the consumption time.

For repeated listens, retain the raw segments. Whether they support distinct
Archive occurrences depends on whether separate completions can be inferred
without collapsing normal pause/resume sessions into rewatches.

## Pagination, checkpoints, and rate limits

### Web API pagination

- Saved episodes, saved shows, and show episodes use `limit`/`offset` pagination,
  with a documented maximum page size of 50.
- The response's `next` URL is a page-navigation cursor only. It is not a durable
  incremental watermark and can become stale as the upstream collection changes.
- Commit each fetched page and its raw response before proceeding.
- Do not mark a complete saved-library reconciliation or infer removals until
  every page in that scan has committed successfully.
- Recently played tracks use `after`/`before` millisecond cursors. Advance the
  stored `after` checkpoint only after all returned rows commit.
- There are no webhooks for library or listener-history changes.

### Rate limits

Spotify calculates its general Web API rate limit over a rolling 30-second
window. The numeric limit is not published and differs between development and
extended quota modes. Some endpoints can have additional limits.

On `429`, respect the response's `Retry-After` seconds and retry with backoff.
Also bound concurrency: the February 2026 development-mode changes removed
batch fetches such as several-episodes and several-shows, which makes naive ESH
enrichment request-heavy.

See [Rate limits](https://developer.spotify.com/documentation/web-api/concepts/rate-limits).

## Queue and write-back

Spotify now provides generic library operations for development-mode apps:

- `PUT /me/library` saves Spotify URIs, including episode and show URIs, with up
  to 40 URIs per request.
- `DELETE /me/library` removes them.
- `GET /me/library/contains` checks current membership.

This can later mirror local Queue entries to Spotify's saved episodes. The local
Queue should remain canonical, because library state can be changed elsewhere
and Spotify offers no webhook. Saving a show is closer to following/subscribing
than queuing a specific episode, so only episode saves should be mapped to
item-level Queue entries by default.

During read-only ingestion, an available saved episode with an explicit zero
position is the Spotify-backed Queue signal. If it later gains playback
evidence, move it to Archive even if it remains saved. If an untouched episode
is removed from Spotify, remove that upstream Queue membership after a complete
reconciliation; do not delete any previously observed Archive evidence. Preserve
null/unavailable rows as unresolved source state.

Spotify also exposes a playback queue and an add-to-queue endpoint, but it is an
ephemeral “play next” control requiring Premium and an active player context. It
is not an appropriate durable counterpart for this app's future Queue.

References:

- [Save Items to Library](https://developer.spotify.com/documentation/web-api/reference/save-library-items)
- [Remove Items from Library](https://developer.spotify.com/documentation/web-api/reference/remove-library-items)
- [Add Item to Playback Queue](https://developer.spotify.com/documentation/web-api/reference/add-to-queue)

## Deletions and reconciliation gaps

- Saved-episode/show APIs return current sets, not deletion events. Detect
  removal only after a successful complete enumeration, then represent it as
  upstream state rather than deleting historical evidence.
- `fully_played` can change, but the API supplies neither transition time nor
  prior values. Preserve each observation and the time it was observed.
- Catalog items can become unavailable. Keep prior metadata and raw evidence;
  record the failed/restricted enrichment rather than removing the media item.
- Extended Streaming History has no documented stable event ID or revision
  protocol. Preserve every imported export and parser version so a later parser
  can replay it.
- Unsaved-show podcast plays can be completely invisible between manual exports
  unless current-playback sampling happens to observe them.
- Downtime longer than the recent-tracks window can create song-history gaps
  until the next export.
- Refresh-token expiry every six months stops unattended polling until the owner
  reauthorizes.

## Credential-safe private payload probe

No real payload, token, account identifier, or export should enter Git.

### Export probe

1. The owner requests Extended Streaming History from Spotify Account Privacy.
2. Place the downloaded ZIP in a local ignored directory outside tracked
   fixtures, with restrictive filesystem permissions.
3. Record only local checksums, file sizes, member names, row counts, earliest and
   latest `ts`, and aggregate null/type statistics.
4. Inspect the delivered `Read Me First` document and mechanically compare its
   keys and type descriptions with the 21-field inventory above.
5. Measure podcast/song/video discrimination using URI field presence.
6. Inventory observed `reason_start` and `reason_end` values and how they relate
   to `skipped`, `ms_played`, and episode duration.
7. Sample edge cases locally: partial listens, completed episodes, replays,
   offline plays, private sessions, video podcasts, removed episodes, and records
   without URIs.
8. Generate a tiny synthetic or irreversibly sanitized fixture that preserves
   shapes and edge cases but contains no real titles, URIs, username, IP address,
   timestamps, or user agent.
9. On a later export, compare overlapping rows and ordering to establish a safe
   cross-export idempotency key.

The inspection command should emit aggregates only. It must never print raw
rows, IP addresses, usernames, tokens, or full paths into CI logs.

### API probe

The credential-safe local probe is implemented in
`packages/connectors/spotify`. After the owner creates a Spotify developer app:

1. Configure the public client ID in `.env.local`; the PKCE probe does not use a
   client secret.
2. Register the exact loopback redirect URI
   `http://127.0.0.1:8787/auth/spotify/callback` and authorize read-only scopes.
3. Capture private raw responses for `GET /me/episodes`, `GET /me/shows`, one
   `GET /shows/{id}/episodes` page, one `GET /episodes/{id}`, and
   `GET /me/player` when an episode is active.
4. Record sanitized schema summaries: present fields, nullability, paging values,
   response headers, and whether `resume_point` appears with the expected scope.
5. Verify whether `fully_played` changes after marking an episode played/unplayed
   in Spotify and measure how quickly polling sees the change.
6. Confirm actual development-mode availability after the February/March 2026
   migration; official reference pages cover multiple quota modes and can retain
   deprecated endpoints.

The first implemented pass intentionally probes only `GET /me/episodes`, because
saved episodes are the owner's practical ongoing Queue/Archive surface. It emits
episode and show titles for manual verification but omits IDs, descriptions, raw
payloads, and every credential. Tokens are stored in the Git-ignored
`.private/spotify-oauth.json` with user-only filesystem permissions.

### Private API observation

The first authenticated scan on 2026-07-18 returned all 71 reported saved rows
across two pages:

- 13 rows had a positive `resume_position_ms` and therefore map to Archive;
- 21 rows had an explicit zero position and therefore map to Queue;
- 37 rows had null title, show name, duration, Spotify ID/URI, and resume
  position and remain unresolved;
- no row reported `fully_played=true`;
- saved dates ranged from 2022-08-06 through 2026-07-18.

The 37 unavailable rows are a material undocumented variant: the reference
schema presents the affected metadata and identity fields as required, but the
live saved-library response returned them as null together. Their `fully_played`
value was false, but null resume position is not equivalent to an explicit zero.
Do not place them in Queue or Archive until the Extended Streaming History
export or a later API observation supplies usable evidence.

The remaining API probes for saved shows, show episodes, individual episode
enrichment, current playback, and played/unplayed state transitions are useful
follow-ups but no longer block the saved-episode ingestion design.

### Private Extended Streaming History observation

The delivered archive contained one official Read Me PDF plus 26 JSON files:
16 annual/split audio files and 10 annual video files. The English PDF pages
visually confirmed the 21 documented fields and their meanings. The JSON probe
then inspected every row without printing titles, URIs, platforms, countries,
or private values.

Overall export:

- 158,787 rows from 2013-06-09 through 2026-07-18;
- 152,231 song segments, 6,416 podcast segments, 139 audiobook segments, and
  one row without a recognized media identity;
- 3,341 rows marked offline, 1,992 incognito, and 32,993 skipped;
- 497 exact duplicate full rows, all within a single JSON file and none across
  files; and
- `username`, `ip_addr_decrypted`, and `user_agent_decrypted` were absent from
  every row despite appearing in the Read Me schema, while an undocumented
  `ip_addr` key was present on every row and remains sensitive raw data.

The JSON also included `audiobook_title`, `audiobook_uri`,
`audiobook_chapter_title`, and `audiobook_chapter_uri` on every row, populated
for 139 audiobook segments. Of those, 136 had positive playback, spanning seven
audiobook URIs and 79 chapter URIs and totaling 29.2 source-reported hours.
These rows must remain distinct from songs, podcasts, and unidentified playback.
Whether they should project into the book Archive or reconcile with Hardcover
is a later product decision.

Podcast subset:

- 6,416 total segments across 2,600 episode URIs;
- 5,921 positive-playback segments;
- 2,443 unique episode URIs with positive playback and therefore Archive
  admission;
- 157 episode URIs represented only by zero-playback segments;
- 1,756 positive segments shorter than 30 seconds;
- no podcast segment missing its episode URI;
- 1,543.6 source-reported listening hours, including source duplicate rows; and
- date range 2017-11-22 through 2026-07-18.

The reason enums are more varied than the documentation examples. Podcast
starts include `appload`, `backbtn`, `clickrow`, `fwdbtn`, `playbtn`,
`reconnect`, `remote`, `trackdone`, `trackerror`, and `unknown`. Ends additionally
include `endplay`, `logout`, `unexpected-exit`, and
`unexpected-exit-while-paused`. These values are source evidence, not Archive
admission thresholds: the owner explicitly chose any positive podcast playback.

The 497 identical rows must not be discarded merely because their full hashes
match. They occur inside individual source arrays and could reflect genuine
duplicate records or same-second source behavior. Use raw object plus member
name plus array index as the snapshot-local idempotency identity. Compare a
future overlapping export before adopting any cross-export deduplication key.

This export resolves the automatic saved-episode gap: the historical backfill
contains 2,443 positively played episode identities, compared with 13 currently
saved episodes that expose positive resume positions. The Web API remains the
ongoing Queue/Archive signal; the export is the authoritative lifetime playback
snapshot and reconciliation source.

## Unresolved questions

1. How frequently can Extended Streaming History be requested for this account?
2. Are overlapping exports stable in row contents and ordering, and can rows ever
   be revised or removed?
3. How should play segments be grouped into a listening session without merging
   genuine relistens?
4. Which `reason_end` values distinguish useful playback from accidental starts
   across app versions and devices?
5. Does `fully_played` remain true after an episode is replayed, and what happens
   when the owner manually marks an episode played or unplayed?
6. Are all podcasts the owner cares about saved as shows, or are unsaved-show
   plays common enough that the automatic gap is unacceptable?
7. Does Spotify retain useful episode URIs and names for catalog entries that are
   later removed?
8. Is periodically reauthorizing every six months acceptable for this private
   app's definition of “automatic” sync?
9. What future Queue conflict policy should apply when an episode is saved or
   removed directly in Spotify?
10. Should Spotify audiobook playback enter the book Archive, and can its
    audiobook identity be reconciled safely with a Hardcover work or edition?

## Recommended next action

The payload evidence is sufficient for the initial schema. Implement a replay-
safe raw-file importer using member name plus array index, retain every playback
segment as Spotify-owned evidence, admit each episode URI with positive playback
to Archive, and reconcile current saved episodes into Queue/Archive/unresolved
state. Preserve audiobook segments separately pending an explicit admission and
cross-source matching rule. Defer session grouping and relisten occurrence
inference.
