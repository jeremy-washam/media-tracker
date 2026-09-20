# Spotify research for Phase 1 Library specification

- Date: 2026-09-19
- Status: Source research; no per-surface Library fields are finalized here
- Scope: Podcasts and Music/Songs as separate product domains backed by Spotify
- Privacy: Live observations contain only field names, types, safe aggregates,
  and hand-authored examples. No personal titles, artists, shows, episodes,
  listening rows, device data, URLs, account identifiers, or token material are
  included.

## Outcome

Spotify can support two useful but materially different Library domains:

- **Podcasts** combine a lifetime manual playback export, current saved episodes,
  saved shows, show catalogs, episode lookup, and mutable resume state. The export
  is the strongest historical source. The API is best-effort discovery and
  current-library state, not a complete listening ledger.
- **Music/Songs** have a much larger lifetime playback export plus current saved
  tracks, saved albums, recent track plays, and top-item affinity. Played tracks
  are the only defensible consumption basis. Saved tracks/albums and followed
  artists are collection or affinity signals, not Queue and not proof of play.

Fresh read-only calls on 2026-09-19 verified saved episodes, saved shows, one
saved show's episode catalog, a known episode lookup, saved tracks, saved albums,
recently played tracks, top tracks, top artists, and an inactive current-playback
response. The followed-artists call returned `403` because the existing grant
lacks `user-follow-read`; it was not reauthorized. The ignored Extended Streaming
History directory was also re-probed locally in aggregate-only form.

The most consequential findings are:

- The current saved-episode snapshot had 110 rows. Thirty-one exposed a positive
  resume position, 41 exposed an explicit zero, and 38 were unavailable rows
  whose identity, core metadata, and position were null.
- Joining those saved episodes to the retained export changed three current-zero
  rows from apparent Queue candidates to historically played episodes. Queue
  exclusion must therefore consider **any positive playback evidence across all
  retained Spotify surfaces**; a current zero never erases history.
- Saved shows are a clean show-level following/subscription signal. Expanding all
  episodes from all 40 saved shows into item-level Queue would manufacture intent
  and require repeated full-catalog scans.
- The export contains 152,231 song playback segments for 33,225 track URIs,
  versus current saved-library totals of 9,819 tracks and 595 albums. These are
  different sets with different semantics.
- A simple positive-duration song rule would admit 148,307 segments and 32,810
  unique track URIs. A 30-second rule would admit 106,276 segments and 26,822
  unique tracks. The threshold changes the Library materially and must be an
  explicit product decision.
- The recent-track endpoint returned 50 rows covering a bounded recent window.
  One track-and-timestamp pair repeated. The retained export ends before that
  window, so this probe provides no live overlap from which to approve a
  cross-surface deduplication key.
- The API's current metadata is much richer than the production projection, but
  Spotify's terms require attribution, links back, refresh/deletion discipline,
  and temporary rather than indefinite API-content caching. Owner-provided export
  evidence and Web API catalog content need separate retention treatment.
- User refresh tokens expire six months after authorization, and refreshing does
  not extend that deadline. Production currently persists rotation safely but
  does not store the authorization instant or convert `invalid_grant` into a
  planned reauthorization state.

The recommended Phase 1 direction is one episode item per Spotify episode URI,
one song item per Spotify track URI unless and until a stronger recording match
is accepted, source-owned playback observations retained beneath those items,
saved episodes as the item-level podcast Queue input, saved shows as a separate
show-level Following concept, and a Songs collection driven by an owner-approved
qualifying-play rule rather than by likes or follows. This is a recommendation
for the next specification step, not a final field or screen decision.

## Evidence labels

| Label                    | Meaning                                                                                                     |
| ------------------------ | ----------------------------------------------------------------------------------------------------------- |
| **Live-verified**        | Returned by authenticated, read-only Web API calls or observed in the ignored export on 2026-09-19.         |
| **Documented-only**      | Present in current official documentation but not returned by the live call, or blocked by scope/state.     |
| **Export-only**          | Present in Extended Streaming History and not supplied by the tested Web API history surfaces.              |
| **Stored/projected**     | Parsed into queryable D1 canonical/source rows by current production code.                                  |
| **Retained/recoverable** | Present in exact private R2 bytes but not queryably projected; requires replay-safe parser/schema work.     |
| **New acquisition**      | Requires a new endpoint, scope, polling/import path, retention policy, or catalog integration.              |
| **Unavailable**          | Not supplied by the tested source, or cannot be acquired with the current grant and supported source paths. |

“Recoverable” does not mean suitable for request-time parsing. Library APIs must
not scan ZIPs or private raw pages. Any useful retained fact needs an indexed,
replay-safe projection.

## Safety and probe coverage

The probe reused the ignored `.env.local` client configuration and
`.private/spotify-oauth.json` grant. It refreshed the expired access token but did
not start an authorization flow, request new scopes, write to Spotify, change the
library, mark content played/unplayed, control playback, or inspect device state.
Only recursive path/type inventories and aggregates were emitted.

The fresh API calls were:

```text
GET /v1/me/episodes?limit=50&offset=0       all three pages aggregated separately
GET /v1/me/shows?limit=50&offset=0
GET /v1/shows/{saved-show-id}/episodes?limit=50&offset=0
GET /v1/episodes/{known-saved-episode-id}
GET /v1/me/tracks?limit=50&offset=0
GET /v1/me/albums?limit=50&offset=0
GET /v1/me/following?type=artist&limit=50
GET /v1/me/player/recently-played?limit=50
GET /v1/me/top/tracks?limit=50&time_range=medium_term
GET /v1/me/top/artists?limit=50&time_range=medium_term
GET /v1/me/player
```

All are reads. IDs were selected in memory and never printed. The current
playback call returned `204 No Content`, so no playback or device payload was
observed. No request returned `429`; no response carried `Retry-After`. That does
not establish a numeric allowance.

The export probe read all 26 ignored history JSON members without printing raw
rows or content values. It inspected exact keys, types, nullability, hashes,
media classification, playback-duration thresholds, reasons, and safe totals.

## Source surfaces and roles

| Surface                    | Verification                                     | Authentication / request                                                                                                         | Product role and limit                                                                                                                                                |
| -------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Extended Streaming History | **Live-verified; supported**                     | Owner requests and downloads a ZIP from Spotify privacy settings, then uploads it explicitly. No API/cursor/webhook.             | Lifetime segment-level podcast, song, video, and audiobook evidence. Manual snapshot; no documented stable event ID, order, or revision protocol.                     |
| Saved episodes             | **Live-verified; implemented**                   | `GET /me/episodes`, `user-library-read`; `user-read-playback-position` supplies resume state. Offset pages, maximum 50.          | Item-level saved intent plus mutable current playback state. Best item-level podcast Queue source, but incomplete history.                                            |
| Saved shows                | **Live-verified; not implemented**               | `GET /me/shows`, `user-library-read`. Offset pages, maximum 50.                                                                  | Show-level following/subscription state. Not an item-level episode Queue by itself.                                                                                   |
| Show episodes              | **Live-verified sample; not implemented**        | `GET /shows/{id}/episodes`, `user-read-playback-position`. Offset pages, maximum 50.                                             | Catalog and current resume state for episodes of a known show. No changed-since cursor; full scans are expensive and still exclude unsaved shows.                     |
| Episode lookup             | **Live-verified sample; not implemented**        | `GET /episodes/{id}`, `user-read-playback-position`; user token supplies market and resume state.                                | Exact-ID enrichment for export-only episode identities. One episode per call under the documented development-mode migration path.                                    |
| Current playback           | **Live-verified as `204`; body documented-only** | `GET /me/player`, documented `user-read-playback-state`.                                                                         | Best-effort current state only. May observe progress, but can miss whole plays; state-change time is not consumption time. Device fields are unnecessary for Library. |
| Recently played tracks     | **Live-verified; not implemented**               | `GET /me/player/recently-played`, documented `user-read-recently-played`; `limit <= 50`, `after` or `before` millisecond cursor. | Bounded recent song play events. Explicitly excludes podcast episodes. Cannot replace the export.                                                                     |
| Saved tracks               | **Live-verified; not implemented**               | `GET /me/tracks`, `user-library-read`; offset pages, maximum 50.                                                                 | Current liked/saved track collection. Independent affinity signal, not Queue and not proof of consumption.                                                            |
| Saved albums               | **Live-verified; not implemented**               | `GET /me/albums`, `user-library-read`; offset pages, maximum 50.                                                                 | Current album collection signal and album/track metadata. Not proof that every track was played.                                                                      |
| Followed artists           | **Blocked live; documented-only**                | `GET /me/following?type=artist`; requires `user-follow-read`, which is absent. Cursor pagination by `after`.                     | Creator-level affinity only. The fresh call returned `403` with a scope-related message. Reauthorization was intentionally not performed.                             |
| Top tracks/artists         | **Live-verified; not implemented**               | `GET /me/top/{tracks\|artists}`, `user-top-read`; offset pages; `short_term`, `medium_term`, or `long_term`.                     | Provider-computed affinity over approximate periods, not consumption history or stable counts. Useful only as optional ranking context.                               |
| Library write endpoints    | **Documented-only; out of scope**                | Generic `PUT/DELETE /me/library`, `user-library-modify`.                                                                         | Future mirroring only. No write was called. The ephemeral playback queue is not this product's Queue.                                                                 |

Primary references: [saved episodes](https://developer.spotify.com/documentation/web-api/reference/get-users-saved-episodes),
[saved shows](https://developer.spotify.com/documentation/web-api/reference/get-users-saved-shows),
[show episodes](https://developer.spotify.com/documentation/web-api/reference/get-a-shows-episodes),
[episode lookup](https://developer.spotify.com/documentation/web-api/reference/get-an-episode),
[recent tracks](https://developer.spotify.com/documentation/web-api/reference/get-recently-played),
[saved tracks](https://developer.spotify.com/documentation/web-api/reference/get-users-saved-tracks),
[saved albums](https://developer.spotify.com/documentation/web-api/reference/get-users-saved-albums),
[followed artists](https://developer.spotify.com/documentation/web-api/reference/get-followed),
[top items](https://developer.spotify.com/documentation/web-api/reference/get-users-top-artists-and-tracks),
and [current playback](https://developer.spotify.com/documentation/web-api/reference/get-information-about-the-users-current-playback).

## Authentication, scopes, and lifecycle

### Existing grant and exact blocker

After the fresh token refresh, the ignored grant reported these scopes:

```text
playlist-modify-private
playlist-modify-public
user-library-modify
user-library-read
user-read-currently-playing
user-read-email
user-read-playback-position
user-read-playback-state
user-read-private
user-read-recently-played
user-top-read
```

`user-follow-read` is absent. Accordingly, followed artists returned HTTP `403`
with the ordinary `{ error: { status, message } }` shape. The report does not
claim that endpoint was successfully hit, and no scope expansion was attempted.
The existing grant is broader than Phase 1 needs; production should continue to
use least privilege when it next reauthorizes.

| Read need                             | Documented scope              | Phase 1 assessment                                                       |
| ------------------------------------- | ----------------------------- | ------------------------------------------------------------------------ |
| Saved episodes, shows, tracks, albums | `user-library-read`           | Required for current library snapshots.                                  |
| Episode/show resume points            | `user-read-playback-position` | Required for podcast positive/zero/null evidence.                        |
| Recent song plays                     | `user-read-recently-played`   | Required if ongoing song polling ships.                                  |
| Current playback sampling             | `user-read-playback-state`    | Optional; weak marginal evidence and unnecessary device data.            |
| Top tracks/artists                    | `user-top-read`               | Optional; affinity only, not admission/history.                          |
| Followed artists                      | `user-follow-read`            | Missing; not required for the recommended initial Songs admission model. |
| Future library mirroring              | `user-library-modify`         | Defer; Library is read-only and Songs have no Queue.                     |

### OAuth and token handling

- The local probe uses Authorization Code with PKCE and the exact loopback
  callback `http://127.0.0.1:8787/auth/spotify/callback`. Production may use
  backend Authorization Code or PKCE with an HTTPS callback. Redirect URIs must
  match exactly; `localhost` is not accepted where Spotify requires an explicit
  loopback address.
- Access tokens last about one hour. The connector refreshes before use.
- User refresh tokens now expire six months from the original authorization.
  Refreshing access tokens, including receiving a rotated refresh token, does
  not extend that date. An expired token returns `400 invalid_grant`; retrying the
  same token is not recovery. See Spotify's
  [refresh-token change](https://developer.spotify.com/blog/2026-06-18-refresh-token-expiration)
  and [refresh guide](https://developer.spotify.com/documentation/web-api/tutorials/refreshing-tokens).
- Production encrypts rotating refresh tokens in D1 with AES-GCM, binds the
  ciphertext to the connection ID as authenticated data, uses a fresh IV, and
  serializes refresh through a short database lease. It saves a replacement
  before fetching library pages.
- Production does **not** currently retain the original authorization instant,
  calculate the six-month deadline, or classify `invalid_grant` as
  `reauthorization_required`. A future authorization should store `authorized_at`
  locally and surface an advance reminder; Spotify does not encode the refresh
  token's issue time for later recovery.
- Changing the configured bootstrap refresh token resets the stored grant;
  changing the encryption key requires a new bootstrap authorization in the
  current design.

### Development mode and quotas

Development mode fits this single-user project: the owner must retain Premium,
and up to five allowlisted users can authenticate. Spotify's July 2026 update
raised the developer account to 25 client IDs, but quota is shared across all of
them. Quota exhaustion can return `429` with `reason: QUOTA_EXCEEDED`.

The ordinary rate limit is an unpublished, app-dependent total over a rolling
30-second window. On `429`, honor `Retry-After`, reduce concurrency, and use
bounded backoff. Offset collections have no stable snapshot token and no
updated-since filter. A complete reconciliation can retire absent current
membership only after every page is durably stored and parsed successfully.
See [quota modes](https://developer.spotify.com/documentation/web-api/concepts/quota-modes),
[rate limits](https://developer.spotify.com/documentation/web-api/concepts/rate-limits),
and the [July 2026 quota update](https://developer.spotify.com/blog/2026-07-23-web-api-quota-updates).

## Fresh API verification summary

| Surface                     | Result |             Safe aggregate | Important observation                                                        |
| --------------------------- | -----: | -------------------------: | ---------------------------------------------------------------------------- |
| Saved episodes page         |  `200` |   110 total; first page 50 | Required-looking catalog fields can be null together on unavailable rows.    |
| Complete saved-episode scan |  `200` |         3 pages / 110 rows | 31 positive resume, 41 zero, 38 null/unavailable, 0 `fully_played=true`.     |
| Saved shows                 |  `200` |                   40 total | One complete page; usable identities and metadata on all 40 observed rows.   |
| One show's episodes         |  `200` |   158 total; first page 50 | Resume point present on all 50 sampled episodes; no transition timestamp.    |
| One known episode           |  `200` |                 one object | Full episode plus embedded show and current resume point.                    |
| Saved tracks                |  `200` | 9,819 total; first page 50 | Saved scale is much smaller than lifetime playback segments but still large. |
| Saved albums                |  `200` |   595 total; first page 50 | Full album objects embed a paged track collection.                           |
| Followed artists            |  `403` |                       none | Blocked by missing `user-follow-read`; no reauthorization.                   |
| Recently played             |  `200` |                    50 rows | 49 unique track/timestamp pairs; one exact repeated pair. No podcasts.       |
| Top tracks                  |  `200` |    provider reported 1,115 | Affinity list, not play ledger; total is not a lifetime song count.          |
| Top artists                 |  `200` |       provider reported 89 | Affinity list, not followed-artist membership or play ledger.                |
| Current playback            |  `204` |                    no body | No fields or device state were observed; a 204 says nothing about past play. |

No numeric rate-limit headers were observed on the successful responses. The
absence of `429` during this short sequence is not capacity evidence.

## Exhaustive live Web API field inventory

The inventories below include every nested field observed on each tested
successful surface. Types describe this probe, not a permanent schema. A field
that did not occur in one sample can still be documented and valid. `missing`
means the key was absent; `null` means it was present with JSON null.

### Reusable observed object shapes

These exact nested shapes recur below:

```text
Image = {
  url: string,
  height: integer,
  width: integer
}

Copyright = {
  text: string,
  type: string
}

SimplifiedArtist = {
  external_urls: { spotify: string },
  href: string,
  id: string,
  name: string,
  type: string,
  uri: string
}

Paging<T> = {
  href: string,
  items: T[],
  limit: integer,
  next: string | null,
  offset: integer,
  previous: string | null,
  total: integer
}

ResumePoint = {
  fully_played: boolean,
  resume_position_ms: integer | null
}
```

The API URLs and Spotify URIs are identities or navigation values, not content
to expose in this report. Image dimensions were integers in all observed image
objects; the official schema permits nullable dimensions, so production must
allow null.

### Podcast show object

The full observed show shape was:

```text
Show = {
  available_markets: string[],
  copyrights: Copyright[],
  description: string,
  explicit: boolean,
  external_urls: { spotify: string },
  href: string,
  html_description: string,
  id: string,
  images: Image[],
  is_externally_hosted: boolean,
  languages: string[],
  media_type: string,
  name: string,
  publisher: string,
  total_episodes: integer,
  type: string,
  uri: string
}
```

On the 40-row saved-shows page every listed key was present and non-null;
`copyrights` could be an empty array. In the 50 saved-episode rows, the embedded
show variant was less reliable: `available_markets` was missing on 4;
`copyrights` was array or null; and `description`, `html_description`, `id`,
`is_externally_hosted`, `languages[]`, `media_type`, `name`, `publisher`, `uri`,
and `total_episodes` each admitted null. The embedded variant otherwise used the
same keys. `publisher` and `available_markets` are deprecated/subject to
development-mode field changes and must not be required.

### Saved episodes: `GET /me/episodes`

Exact observed response:

```text
Paging<{
  added_at: string,
  episode: {
    audio_preview_url: string | null,
    description: string | null,
    duration_ms: integer | null,
    explicit: boolean,
    external_urls: { spotify: string },
    href: string,
    html_description: string | null,
    id: string | null,
    images: Image[],
    is_externally_hosted: boolean | null,
    is_playable?: boolean,
    language: string | null,
    languages: (string | null)[],
    name: string | null,
    release_date: string,
    release_date_precision: string,
    restrictions?: { reason: string },
    resume_point: ResumePoint,
    show: Show-with-nullable-embedded-fields,
    type: string,
    uri: string | null
  }
}>
```

Observed first-page details: 50/50 rows had `added_at`, an `episode` object,
`resume_point`, and the keys shown above. `is_playable` was absent on 4/50.
`restrictions` appeared on 1/50. Images totaled 138 objects. Thirty-eight rows
across the complete scan were unavailable: identity, name, show name, duration,
and resume position were null together. `release_date` remaining a string on the
first page does not make it safe as a required field for all future unavailable
variants.

### Saved shows: `GET /me/shows`

Exact observed response:

```text
Paging<{
  added_at: string,
  show: Show
}>
```

All 40 items had the complete `Show` key set above. The response's `next` and
`previous` were null because the collection fit in one page.

### Show episodes: `GET /shows/{id}/episodes`

Exact observed response:

```text
Paging<{
  audio_preview_url: null,
  description: string,
  duration_ms: integer,
  explicit: boolean,
  external_urls: { spotify: string },
  href: string,
  html_description: string,
  id: string,
  images: Image[],
  is_externally_hosted: boolean,
  is_playable: boolean,
  language: string,
  languages: string[],
  name: string,
  release_date: string,
  release_date_precision: string,
  resume_point: {
    fully_played: boolean,
    resume_position_ms: integer
  },
  type: string,
  uri: string
}>
```

All listed keys were present in the sampled 50 rows. The sampled page did not
contain `restrictions`; official documentation allows it. The response reported
158 total and a non-null `next` URL.

### Known episode lookup: `GET /episodes/{id}`

Exact observed response:

```text
{
  audio_preview_url: string,
  description: string,
  duration_ms: integer,
  explicit: boolean,
  external_urls: { spotify: string },
  href: string,
  html_description: string,
  id: string,
  images: Image[],
  is_externally_hosted: boolean,
  is_playable: boolean,
  language: string,
  languages: string[],
  name: string,
  release_date: string,
  release_date_precision: string,
  resume_point: {
    fully_played: boolean,
    resume_position_ms: integer
  },
  show: Show,
  type: string,
  uri: string
}
```

The one selected available episode populated every listed key. That single
object does not establish non-nullability. The official contract allows nullable
preview/image dimensions and optional restrictions; the saved-episode live
variant proves broader nullability for unavailable catalog items.

### Reusable music shapes

```text
SimplifiedAlbum = {
  album_type: string,
  artists: SimplifiedArtist[],
  available_markets: string[],
  external_urls: { spotify: string },
  href: string,
  id: string,
  images: Image[],
  is_playable?: boolean,
  name: string,
  release_date: string,
  release_date_precision: string,
  total_tracks: integer,
  type: string,
  uri: string
}

Track = {
  album: SimplifiedAlbum,
  artists: SimplifiedArtist[],
  available_markets: string[],
  disc_number: integer,
  duration_ms: integer,
  explicit: boolean,
  external_ids: { isrc: string },
  external_urls: { spotify: string },
  href: string,
  id: string,
  is_local: boolean,
  is_playable?: boolean,
  name: string,
  popularity: integer,
  preview_url: string,
  track_number: integer,
  type: string,
  uri: string
}
```

These are observed shapes, not durable required-field claims. Spotify's 2026
development-mode migration removed or changed several fields and later restored
`external_ids`; existing integrations can also be on a postponed behavior path.
Code must allow missing `available_markets`, `popularity`, `label`, publisher,
preview, relinking, and other mode-dependent fields even when this app received
them. See the [February migration guide](https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide)
and [March field restoration](https://developer.spotify.com/documentation/web-api/references/changes/march-2026).

### Saved tracks: `GET /me/tracks`

Exact observed response:

```text
Paging<{
  added_at: string,
  track: Track
}>
```

The sampled 50 tracks populated every `Track` key above. Their album objects
also populated `is_playable`. The page contained 58 track-artist objects, 50
album-artist objects, and 150 images, demonstrating that track and album artist
credits are arrays and must not be collapsed to one name.

### Saved albums: `GET /me/albums`

The full observed album object was:

```text
FullAlbum = {
  album_type: string,
  artists: SimplifiedArtist[],
  available_markets: string[],
  copyrights: Copyright[],
  external_ids: { upc: string },
  external_urls: { spotify: string },
  genres: string[],
  href: string,
  id: string,
  images: Image[],
  label: string,
  name: string,
  popularity: integer,
  release_date: string,
  release_date_precision: string,
  total_tracks: integer,
  tracks: Paging<{
    artists: SimplifiedArtist[],
    available_markets: string[],
    disc_number: integer,
    duration_ms: integer,
    explicit: boolean,
    external_urls: { spotify: string },
    href: string,
    id: string,
    is_local: boolean,
    linked_from?: {
      external_urls: { spotify: string },
      href: string,
      id: string,
      type: string,
      uri: string
    },
    name: string,
    preview_url: string,
    track_number: integer,
    type: string,
    uri: string
  }>,
  type: string,
  uri: string
}

response = Paging<{
  added_at: string,
  album: FullAlbum
}>
```

All 50 first-page albums populated the listed top-level keys. Embedded album
track pages contained 706 track objects and 1,060 artist-credit objects. Eight
embedded tracks carried `linked_from`; this is live evidence that catalog
relinking must be preserved instead of silently replacing the imported identity.
`tracks.next` was string or null; `tracks.previous` was null in this sample.

### Followed artists: blocked response and documented shape

The live response was exactly this shape, with no artist data:

```text
{
  error: {
    message: string,
    status: integer
  }
}
```

Status was `403`; the message classified as scope-related. The documented
successful shape is `{ artists: { href, items: Artist[], limit, next, cursors:
{ after, before }, total } }`, where an Artist includes `external_urls.spotify`,
`followers { href, total }`, `genres[]`, `href`, `id`, `images[]`, `name`,
`popularity`, `type`, and `uri`. None of those success fields is live-verified
for this grant.

### Recently played tracks: `GET /me/player/recently-played`

Exact observed response:

```text
{
  cursors: {
    after: string,
    before: string
  },
  href: string,
  items: [{
    context: null | {
      external_urls: { spotify: string },
      href: string,
      type: string,
      uri: string
    },
    played_at: string,
    track: Track-without-observed-is_playable
  }],
  limit: integer,
  next: string
}
```

Fifty rows were returned. `context` was null on 3 and an object on 47. Every
track populated the remaining observed `Track` keys, including ISRC, album,
multiple artist credits, duration, and URI. The response did not include a
useful lifetime `total`, an offset, `previous`, played duration, skip flag, or
podcast items. `played_at` is an instant for the track play returned by this
endpoint; it is not the same field as export `ts`.

### Top tracks: `GET /me/top/tracks`

Exact observed response was `Paging<Track>`. Fifty rows populated every `Track`
key, and each album also populated `is_playable`. This endpoint adds no play
timestamp, played duration, skip reason, rank-change history, or play count. Its
`total` is the provider's affinity result size, not a listening total.

### Top artists: `GET /me/top/artists`

Exact observed response:

```text
Paging<{
  external_urls: { spotify: string },
  followers: {
    href: null,
    total: integer
  },
  genres: string[],
  href: string,
  id: string,
  images: Image[],
  name: string,
  popularity: integer,
  type: string,
  uri: string
}>
```

Fifty rows produced 95 genre strings and 154 image objects. These are Spotify
catalog/community and affinity values, not the owner's followed-artist set.

### Current playback: live empty, documented body only

The live response was HTTP `204` with no content type and no JSON body. Therefore
the complete **live** field inventory is empty.

Official documentation says a `200` may contain `device`, `repeat_state`,
`shuffle_state`, `context`, `timestamp`, `progress_ms`, `is_playing`, nullable
`item` (track or episode), `currently_playing_type`, and `actions` capability
booleans. No such values were observed or printed. If Phase 1 ever polls this
surface, acquire only the content identity, item type, progress, playback-state
timestamp, and observation time; device identity/name/volume/private-session
state are unnecessary personal data for Library.

## Hand-sanitized representative API shapes

These examples preserve the verified structure without copying personal values.

```json
{
  "href": "https://api.spotify.example/v1/me/episodes?offset=0&limit=50",
  "items": [
    {
      "added_at": "20XX-01-01T00:00:00Z",
      "episode": {
        "audio_preview_url": null,
        "description": "Example plain-text description",
        "duration_ms": 1234567,
        "explicit": false,
        "external_urls": { "spotify": "https://open.spotify.example/episode/REDACTED" },
        "href": "https://api.spotify.example/v1/episodes/REDACTED",
        "html_description": "<p>Example untrusted description</p>",
        "id": "REDACTED",
        "images": [{ "url": "https://image.example/cover.jpg", "height": 640, "width": 640 }],
        "is_externally_hosted": false,
        "is_playable": true,
        "language": "en",
        "languages": ["en"],
        "name": "Example Episode",
        "release_date": "20XX-01-01",
        "release_date_precision": "day",
        "resume_point": { "fully_played": false, "resume_position_ms": 12345 },
        "show": {
          "available_markets": ["XX"],
          "copyrights": [],
          "description": "Example Show description",
          "explicit": false,
          "external_urls": { "spotify": "https://open.spotify.example/show/REDACTED" },
          "href": "https://api.spotify.example/v1/shows/REDACTED",
          "html_description": "<p>Example Show description</p>",
          "id": "REDACTED",
          "images": [{ "url": "https://image.example/show.jpg", "height": 640, "width": 640 }],
          "is_externally_hosted": false,
          "languages": ["en"],
          "media_type": "audio",
          "name": "Example Show",
          "publisher": "Example Publisher",
          "total_episodes": 42,
          "type": "show",
          "uri": "spotify:show:REDACTED"
        },
        "type": "episode",
        "uri": "spotify:episode:REDACTED"
      }
    },
    {
      "added_at": "20XX-01-02T00:00:00Z",
      "episode": {
        "description": null,
        "duration_ms": null,
        "id": null,
        "name": null,
        "resume_point": { "fully_played": false, "resume_position_ms": null },
        "show": { "id": null, "name": null, "uri": null },
        "uri": null
      }
    }
  ],
  "limit": 50,
  "next": "https://api.spotify.example/v1/me/episodes?offset=50&limit=50",
  "offset": 0,
  "previous": null,
  "total": 110
}
```

```json
{
  "cursors": { "after": "REDACTED", "before": "REDACTED" },
  "href": "https://api.spotify.example/v1/me/player/recently-played?limit=50",
  "items": [
    {
      "context": null,
      "played_at": "20XX-01-01T00:00:00.000Z",
      "track": {
        "album": {
          "album_type": "album",
          "artists": [
            { "id": "REDACTED", "name": "Example Artist", "uri": "spotify:artist:REDACTED" }
          ],
          "external_urls": { "spotify": "https://open.spotify.example/album/REDACTED" },
          "id": "REDACTED",
          "images": [{ "url": "https://image.example/album.jpg", "height": 640, "width": 640 }],
          "name": "Example Album",
          "release_date": "20XX",
          "release_date_precision": "year",
          "total_tracks": 10,
          "type": "album",
          "uri": "spotify:album:REDACTED"
        },
        "artists": [
          { "id": "REDACTED", "name": "Example Artist", "uri": "spotify:artist:REDACTED" }
        ],
        "disc_number": 1,
        "duration_ms": 180000,
        "explicit": false,
        "external_ids": { "isrc": "REDACTED" },
        "external_urls": { "spotify": "https://open.spotify.example/track/REDACTED" },
        "id": "REDACTED",
        "is_local": false,
        "name": "Example Track",
        "track_number": 1,
        "type": "track",
        "uri": "spotify:track:REDACTED"
      }
    }
  ],
  "limit": 50,
  "next": "https://api.spotify.example/v1/me/player/recently-played?before=REDACTED&limit=50"
}
```

## Extended Streaming History

### Request and acquisition contract

Spotify's privacy tool supplies a user-initiated ZIP with lifetime audio, video,
and podcast history. There is no export API, webhook, cursor, published recurring
cadence, stable event ID, or deletion protocol. The delivered `Read Me First`
file is the schema authority for that snapshot. The app should retain the exact
ZIP privately, checksum it, register each member, and replay by parser version.
See Spotify's [data description](https://support.spotify.com/article/understanding-your-data/).

The current importer content-addresses the ZIP in R2 and derives a compact
podcast manifest. It uses member name plus array index as snapshot-local record
identity. The full song and audiobook rows remain recoverable only from the ZIP;
they are not currently source records or Library items.

### Exhaustive observed export field inventory

Every one of the 158,787 rows was an object. The observed keys, types, and
nullability were:

| Key                                 | Observed type   | Missing |    Null | Meaning / caution                                                                                    |
| ----------------------------------- | --------------- | ------: | ------: | ---------------------------------------------------------------------------------------------------- |
| `ts`                                | string          |       0 |       0 | UTC instant when this stream segment ended; not necessarily completion.                              |
| `platform`                          | string          |       0 |       0 | Playback platform; sensitive/low-value for Library.                                                  |
| `ms_played`                         | number          |       0 |       0 | Source-reported duration for this row. Preserve exactly; row is not necessarily a whole play.        |
| `conn_country`                      | string          |       0 |       0 | Country code; sensitive and unnecessary for ordinary Library UI.                                     |
| `ip_addr`                           | string          |       0 |       0 | Undocumented key in this delivery; highly sensitive. Retain only in protected raw bytes.             |
| `master_metadata_track_name`        | string or null  |       0 |   6,556 | Song title; null on non-track rows.                                                                  |
| `master_metadata_album_artist_name` | string or null  |       0 |   6,556 | Export's artist/creator text; not an artist identity.                                                |
| `master_metadata_album_album_name`  | string or null  |       0 |   6,556 | Album text; not an album identity.                                                                   |
| `spotify_track_uri`                 | string or null  |       0 |   6,556 | Primary Spotify track identity when present.                                                         |
| `episode_name`                      | string or null  |       0 | 152,371 | Podcast episode title fallback.                                                                      |
| `episode_show_name`                 | string or null  |       0 | 152,371 | Podcast show title fallback; no show URI in the export.                                              |
| `spotify_episode_uri`               | string or null  |       0 | 152,371 | Primary Spotify episode identity when present.                                                       |
| `audiobook_title`                   | string or null  |       0 | 158,648 | Undocumented in the public 21-field list; populated for audiobook rows.                              |
| `audiobook_uri`                     | string or null  |       0 | 158,648 | Audiobook identity; separate from book work/edition identity.                                        |
| `audiobook_chapter_title`           | string or null  |       0 | 158,648 | Chapter title.                                                                                       |
| `audiobook_chapter_uri`             | string or null  |       0 | 158,648 | Chapter identity.                                                                                    |
| `reason_start`                      | string          |       0 |       0 | Source enum/string; observed values listed below.                                                    |
| `reason_end`                        | string          |       0 |       0 | Source enum/string; observed values listed below.                                                    |
| `shuffle`                           | boolean         |       0 |       0 | Playback mode.                                                                                       |
| `skipped`                           | boolean         |       0 |       0 | Source skip flag; not a stable admission rule by itself.                                             |
| `offline`                           | boolean or null |       0 |     726 | Offline state. Null is distinct from false.                                                          |
| `offline_timestamp`                 | number or null  |       0 | 123,919 | Numeric offline timestamp; retain raw until units/semantics are confirmed from the delivered readme. |
| `incognito_mode`                    | boolean         |       0 |       0 | Private-session flag; sensitive and unnecessary for ordinary UI.                                     |
| `username`                          | absent          | 158,787 |       0 | Documented publicly but omitted from this delivery.                                                  |
| `ip_addr_decrypted`                 | absent          | 158,787 |       0 | Documented key omitted; `ip_addr` appeared instead.                                                  |
| `user_agent_decrypted`              | absent          | 158,787 |       0 | Documented publicly but omitted from this delivery.                                                  |

No other keys were observed. The four audiobook keys and `ip_addr` are live
evidence that the delivered schema can exceed or differ from the public list.

Observed `reason_start` values across the export were empty string, `appload`,
`backbtn`, `clickrow`, `clickside`, `fwdbtn`, `nextbtn`, `playbtn`, `popup`,
`reconnect`, `remote`, `trackdone`, `trackerror`, `unknown`, and `uriopen`.
Observed `reason_end` additionally included `endplay`, `logout`, `reload`,
`unexpected-exit`, and `unexpected-exit-while-paused`. Treat them as open source
strings; do not freeze a closed enum.

Hand-sanitized representative rows:

```json
[
  {
    "ts": "20XX-01-01T00:00:00Z",
    "platform": "REDACTED",
    "ms_played": 12345,
    "conn_country": "XX",
    "ip_addr": "REDACTED",
    "master_metadata_track_name": null,
    "master_metadata_album_artist_name": null,
    "master_metadata_album_album_name": null,
    "spotify_track_uri": null,
    "episode_name": "Example Episode",
    "episode_show_name": "Example Show",
    "spotify_episode_uri": "spotify:episode:REDACTED",
    "audiobook_title": null,
    "audiobook_uri": null,
    "audiobook_chapter_title": null,
    "audiobook_chapter_uri": null,
    "reason_start": "clickrow",
    "reason_end": "endplay",
    "shuffle": false,
    "skipped": false,
    "offline": false,
    "offline_timestamp": null,
    "incognito_mode": false
  },
  {
    "ts": "20XX-01-01T00:03:00Z",
    "platform": "REDACTED",
    "ms_played": 180000,
    "conn_country": "XX",
    "ip_addr": "REDACTED",
    "master_metadata_track_name": "Example Track",
    "master_metadata_album_artist_name": "Example Artist",
    "master_metadata_album_album_name": "Example Album",
    "spotify_track_uri": "spotify:track:REDACTED",
    "episode_name": null,
    "episode_show_name": null,
    "spotify_episode_uri": null,
    "audiobook_title": null,
    "audiobook_uri": null,
    "audiobook_chapter_title": null,
    "audiobook_chapter_uri": null,
    "reason_start": "trackdone",
    "reason_end": "trackdone",
    "shuffle": true,
    "skipped": false,
    "offline": null,
    "offline_timestamp": null,
    "incognito_mode": false
  }
]
```

### Fresh export aggregates

| Measure                                     |       Podcasts |         Songs |            Audiobooks / other |
| ------------------------------------------- | -------------: | ------------: | ----------------------------: |
| Rows/segments                               |          6,416 |       152,231 | 139 audiobook; 1 unidentified |
| Positive-duration rows                      |          5,921 |       148,307 |                 136 audiobook |
| Zero-duration rows                          |            495 |         3,924 |                   3 audiobook |
| Unique item URIs                            | 2,600 episodes | 33,225 tracks |    7 audiobooks / 79 chapters |
| Unique URIs with positive duration          | 2,443 episodes | 32,810 tracks |                 not projected |
| Unique URIs with only zero duration         |   157 episodes |    415 tracks |                 not projected |
| Positive rows under 30 seconds              |          1,756 |        42,031 |                  not measured |
| Rows marked skipped                         |          3,170 |        29,778 |                  not measured |
| Skipped rows with positive duration         |          2,751 |        28,293 |                  not measured |
| Source-reported hours, including duplicates |        1,543.6 |       6,032.9 |                29.2 audiobook |

The entire export spans 2013-06-09 through 2026-07-18; podcast rows span
2017-11-22 through 2026-07-18. There were 497 byte-identical full rows, all
within individual files in the existing probe's per-file analysis. Equality
does not prove duplication: Spotify supplies no event ID, and two same-second
rows may represent source behavior that cannot be disambiguated.

### Song threshold sensitivity

| Candidate rule, for comparison only | Qualifying rows | Unique track URIs | Tradeoff                                                                                            |
| ----------------------------------- | --------------: | ----------------: | --------------------------------------------------------------------------------------------------- |
| Any `ms_played > 0`                 |         148,307 |            32,810 | Maximally inclusive; includes 42,031 sub-30-second starts.                                          |
| `ms_played >= 30,000`               |         106,276 |            26,822 | Simple and computable from export; rejects intentional short tracks and shorter partial engagement. |
| Positive and `skipped != true`      |         120,014 |            28,423 | Uses a source flag whose behavior can vary by client/version; still admits very short rows.         |
| At least 30 seconds and not skipped |          93,887 |            24,511 | Stronger noise filter; compounds two imperfect signals.                                             |

Duration-percentage rules cannot be computed from the export alone because it
does not include track duration. Enriching 33,225 identities one at a time would
be costly under development quota and creates API-content retention obligations.

## Current implementation and data-state audit

### What production acquires

- `packages/connectors/spotify/src/oauth.ts` implements the local PKCE bootstrap
  and stores the ignored local grant.
- `packages/connectors/spotify/src/token.ts` refreshes Worker access tokens.
- `apps/api/src/spotify-credentials.ts` owns encrypted rotation and the refresh
  lease.
- `packages/connectors/spotify/src/web-api.ts` and
  `apps/api/src/spotify-sync.ts` acquire only saved episodes.
- `packages/connectors/spotify/src/ingest.ts` and
  `apps/api/src/spotify-import.ts` parse only podcast segments from the retained
  Extended Streaming History ZIP into source records and Archive projection.
- `packages/connectors/spotify/src/history.ts` can inspect song/audiobook rows in
  aggregate, but it is a probe, not production normalization.

There is no production acquisition for saved shows, show episodes, episode
lookup, current playback, recent tracks, saved tracks, saved albums, followed
artists, or top items. There is no Spotify Queue table or song projection.

### What is stored/projected now

For a usable saved episode with positive resume state, current code projects:

- one `podcast_episode` media item;
- title, show name as both subtitle and primary creator, plain description,
  canonical Spotify URL, first image URL, publication date/precision, and
  duration;
- one global `spotify / episode_uri` identity; and
- one Archive entry per episode URI with admission reason
  `spotify_positive_resume_position` or `spotify_fully_played`, but no consumed
  time from the mutable API observation.

For export podcast segments, current code stores one source record per segment
and projects one Archive occurrence per episode URI with latest positive export
`ts`. It preserves a monotonic latest date across older imports. Segment
`ms_played`, member/index path, title/show fallback, and timestamp appear in the
derived manifest/source normalization path; the original row remains in the ZIP.

Saved rows with explicit zero are counted as Queue candidates but committed as
ignored source records. Null/unavailable rows are unresolved. No queryable
current Queue membership is maintained, and complete-scan absence does not yet
retire a saved-episode membership projection.

The local D1 snapshot contained:

| Current local projection                              |                                          Count |
| ----------------------------------------------------- | ---------------------------------------------: |
| Active Spotify podcast media items / Archive entries  |                                          2,452 |
| Items with projected description, image, and duration |                                        32 each |
| Spotify `episode_uri` identities                      |                                          2,452 |
| Podcast playback-segment source records               |          6,816 (6,316 normalized; 500 ignored) |
| Saved-episode source records                          | 231 (64 normalized; 91 ignored; 76 unresolved) |

These counts include earlier imports/syncs and are not expected to equal one
fresh source snapshot exactly. They demonstrate that almost all export-only
episodes still lack catalog metadata.

### Retained but not queryably projected

| Evidence                                   | Current state                                                                                                 |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Exact saved-episode page bytes             | Private R2 raw objects; recover all live fields listed above.                                                 |
| `resume_point` values and saved `added_at` | Present in raw page; disposition/admission is projected, but exact progress is not queryable.                 |
| Embedded show identity/metadata            | Present in raw pages for available saved episodes; show identity is not an external identity or entity in D1. |
| Exact export rows                          | Private ZIP in R2; all fields, songs, audiobooks, reasons, skips, offline/private flags recoverable.          |
| Song segments and identities               | ZIP only; not production source records, media items, or Archive/listening rows.                              |
| Audiobook segments and identities          | ZIP only; explicitly deferred from both Books and Podcasts.                                                   |

### New acquisition required

- Saved-show following membership and full-snapshot reconciliation.
- Selected show-episode scans, if the product accepts their quota and coverage
  tradeoff.
- Exact episode lookup for export-only identities, with an expiring metadata
  cache and unavailable/restricted state.
- Recently played song polling with durable `after` checkpoints.
- Saved-track and saved-album snapshots if those relationship signals are shown.
- `user-follow-read` reauthorization only if followed artists become necessary.
- A complete song segment projection, qualification rule, aggregates, indexes,
  and bounded history API.

## Identity, dates, and source semantics

| Value                              | Semantics                                                          | Recommendation for the next specification                                                                                                          |
| ---------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `spotify:episode:{id}`             | Spotify catalog episode identity                                   | Primary global episode identity. Keep ID and URI; do not merge on title/show text.                                                                 |
| `spotify:show:{id}`                | Spotify catalog show identity                                      | Separate show identity; following belongs here, not on every episode.                                                                              |
| `spotify:track:{id}`               | Spotify catalog track identity                                     | Initial song-item identity. It can represent a specific catalog version, not a universal composition.                                              |
| `spotify:album:{id}`               | Spotify release/album identity                                     | Grouping and saved-album relationship, not song identity or consumption evidence.                                                                  |
| `spotify:artist:{id}`              | Spotify artist identity                                            | Contributor/grouping identity, not a song or proof of play.                                                                                        |
| ISRC                               | Recording identifier supplied in current track metadata            | Useful matching evidence, but not guaranteed one-to-one across releases/providers. Do not silently merge solely on ISRC without conflict handling. |
| `linked_from`                      | Original track object replaced by relinking                        | Preserve both imported/original and playable replacement identities. Never rewrite historical export evidence to the replacement.                  |
| Export `ts`                        | UTC end of one stream segment, whole-second strings in this export | Source-asserted segment end; not guaranteed whole-item completion.                                                                                 |
| Export `ms_played`                 | Duration attributed to one export row                              | Observed listening duration. Do not infer it equals track duration or one whole listen.                                                            |
| API `played_at`                    | Recent track-play instant, observed with millisecond precision     | Song recent-play time. Exact relationship to export `ts` still needs overlap validation.                                                           |
| Saved `added_at`                   | UTC save instant for episode/show/track/album                      | Relationship date, not consumption.                                                                                                                |
| Episode `release_date` + precision | Catalog publication date at year/month/day precision               | Preserve precision; never fill missing components.                                                                                                 |
| Player `timestamp`                 | Milliseconds when playback state last changed                      | Observation state change, not start/end/completion time.                                                                                           |
| API acquisition time               | Time this app observed mutable state                               | Provenance only; never substitute for consumption.                                                                                                 |

Track versus recording requires care. Spotify's track URI is the only identity
available on every song row in this export, so it is the safe initial key. A
MusicBrainz recording or another portable identity can later connect remasters,
edits, live versions, and release-specific tracks only through explicit evidence.
Title and artist strings are never sufficient. The catalog report recommends
MusicBrainz/ISRC as a candidate portable layer, not an automatic merge.

## Decision-ready podcast options

### 1. What “Following” means

| Option                                            | Semantics                                                                                                             | Benefits                                                                              | Costs/risks                                                                                                        |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| A. No Following section                           | Only Archive and Queue episodes appear. Saved shows are retained evidence.                                            | Smallest Phase 1 surface.                                                             | Hides a meaningful 40-show relationship and makes show discovery less legible.                                     |
| B. Show-level Following section **(recommended)** | Saved shows appear once as show relationships; episodes remain Archive/Queue items only when independently evidenced. | Matches source semantics; no manufactured episode intent; useful navigation/grouping. | Introduces a show-level browse concept alongside item-level Library. Needs show entity/projection.                 |
| C. Expand followed shows into Queue               | Every unplayed catalog episode of every saved show becomes Queue.                                                     | Maximizes automatic episode discovery.                                                | Turns subscription into thousands of implied intentions, requires expensive full scans, and misclassifies backlog. |

Recommendation: specify Following as a secondary show-level relationship or
filter, not as Archive and not as episode Queue. If the owner wants only the
Archive/Queue navigation promised by the UI foundation, retain followed shows
for inspector/grouping first and defer a visible third tab rather than folding
them into Queue.

### 2. Saved shows versus saved episodes

- A saved **episode** is item-level intent and can enter Queue after the playback
  exclusion rule.
- A saved **show** is show-level affinity/subscription and does not imply intent
  to hear every episode.
- One episode may be saved without its show being followed, or played from an
  unsaved show. Preserve these relationships independently.

Recommendation: saved episodes drive Queue; saved shows drive Following/show
context only. Show-episode scans may discover positive playback but should not
create Queue rows for every zero episode.

### 3. Queue exclusion by any positive playback

| Rule                                     |                                               Fresh result | Assessment                                                           |
| ---------------------------------------- | ---------------------------------------------------------: | -------------------------------------------------------------------- |
| Current saved row only                   |                       41 apparent zero-position candidates | Incorrect for this account.                                          |
| Any positive API state or export segment | 38 valid Queue candidates; 3 historical positives excluded | **Recommended.** Matches owner rule and preserves monotonic history. |

The precedence should be:

```text
any historical/current positive evidence -> Archive, excluded from podcast Queue
else valid saved episode + explicit zero -> Queue
else null/missing identity or playback -> unresolved
```

`fully_played=false` is not evidence of zero. A later zero does not negate a
positive export segment or earlier positive observation.

### 4. Null and zero playback

The 38 null rows also lacked usable episode identity and core metadata. They
cannot become Queue items, Archive items, or placeholder media items. Preserve
their raw/source observations with `added_at` and unresolved disposition. If a
later snapshot restores identity, reconcile it; do not match by title because
the title is also absent.

An explicit zero is Queue evidence only when the episode identity is usable and
no positive evidence exists. Zero may mean manually reset or replayed state; it
is not deletion of prior listening.

### 5. Removed/restricted items and identity

- Keep a prior episode item and identity when lookup later returns unavailable,
  restricted, or `404`; mark enrichment state instead of deleting history.
- Preserve export title/show strings as source assertions even when catalog
  lookup fails. Do not let an API null erase non-null historical evidence.
- Use episode URI/ID for the item and show URI/ID for grouping. The export's show
  name is not a show identity.
- `restrictions.reason` is an open value; the live saved page observed a
  restriction variant. Handle unknown future reasons.

### 6. Current playback versus export timestamps

| Surface                                                    | What it proves                                      | What it does not prove                                                        |
| ---------------------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------- |
| Positive player `progress_ms` while an episode is observed | At least some current playback by observation time. | Start time, end time, completion, or that the next poll will still expose it. |
| Player `timestamp`                                         | When Spotify says state last changed.               | Consumption occurrence time or completion time.                               |
| Export positive `ms_played` + `ts`                         | Positive segment and its end instant.               | Session boundary or completed episode.                                        |

Recommendation: do not make current-player polling a Phase 1 dependency. If
added later, admit positive episode progress but leave consumed time unknown
until export evidence supplies a segment end. Store `timestamp` and poll time as
source observation facts, never as a fabricated listen completion.

### 7. Podcast listen and relisten history

Current ADRs deliberately keep one Archive occurrence per episode and retain
segments as evidence. The export has 6,416 segments for 2,600 episode URIs and no
session ID. Grouping by time gap would be inference and can merge genuine
relistens or split one offline listen.

Options for the inspector:

1. Show one consumed episode with first/latest positive segment, total observed
   milliseconds, and segment count, labeling these as observations.
2. Show raw segment timestamps/durations in a paginated technical history.
3. Infer sessions/relistens with a documented gap algorithm and confidence.

Recommendation: choose option 1 for ordinary Library history and keep option 2
available behind provenance if useful. Defer option 3 until the owner explicitly
wants estimated listening sessions. Never label segment count as “times played.”

## Decision-ready Music/Songs options

### 1. Which source defines the Songs collection

| Candidate                         | Semantics                       | Recommendation                                                                      |
| --------------------------------- | ------------------------------- | ----------------------------------------------------------------------------------- |
| Qualifying export/recent playback | Consumed/listened song evidence | **Primary Songs membership candidate.** Aligns with Library as consumption history. |
| Saved tracks                      | Current liked/saved collection  | Independent filter/relationship; not Queue and not admission by itself.             |
| Saved albums                      | Album-level collection          | Grouping/relationship only; never imply every track was heard.                      |
| Followed artists                  | Creator affinity                | Optional creator relationship; current grant blocked and not required for Phase 1.  |
| Top tracks/artists                | Spotify-computed affinity       | Optional ranking context only; never source occurrence, count, or admission.        |

Recommendation: the initial Songs collection should be tracks with qualifying
playback. Saved-track state may become a filter/badge, saved albums may support
album browsing, and artists may support grouping. None becomes Queue; the owner
explicitly rejected a Songs Queue.

### 2. Qualifying-play threshold

The owner has not selected a threshold. The fresh sensitivity table above shows
that the choice changes unique-song membership from 24,511 to 32,810 within the
tested rules.

| Option                                               | Strength                                                                           | Weakness                                                                                                                          |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Any positive duration                                | Simple, source-complete, consistent with podcast admission.                        | Song starts are common and 42,031 positive rows were under 30 seconds; podcast semantics should not be inherited silently.        |
| At least 30 seconds **(provisional recommendation)** | Computable from retained export, easy to explain, removes substantial start noise. | Penalizes genuinely short tracks and intentional shorter listens; 30 seconds is a product choice, not Spotify's completion truth. |
| Positive and not skipped                             | Uses explicit source evidence.                                                     | `skipped` varies across clients/years and still admits very short rows.                                                           |
| Duration percentage                                  | Better adapts to short tracks.                                                     | Requires trustworthy track duration for export-only IDs, large catalog acquisition, and unavailable/relinked handling.            |
| Hybrid: 30 seconds or a chosen percentage            | Most expressive.                                                                   | Highest acquisition and explanation complexity; cannot be replayed from current export alone.                                     |

Recommendation for the owner to approve or reject: start with `ms_played >=
30,000` as a transparent Phase 1 qualification, preserve every excluded row, and
label counts as qualifying playback observations rather than completed listens.
Before finalizing, review a synthetic short-track example and decide whether a
short-track exception is worth the required duration acquisition.

### 3. Skips, partial plays, and counts

- `skipped=true` must remain evidence even if a row otherwise qualifies. It is
  not equivalent to `ms_played=0`; 28,293 skipped song rows had positive time.
- A row can represent a partial play, replay, reconnect, offline segment, or
  source artifact. Do not call every row a completed song.
- Recent-play API rows have a `played_at` but no `ms_played` or skip signal. They
  can establish recent activity, but cannot be evaluated against a duration
  threshold until a later export or an explicitly different API admission rule.

Decision options for recent API rows:

1. Admit every recent-play event immediately, then reconcile duration later.
2. Show it as provisional recent activity but do not change Songs membership
   until export evidence qualifies it.
3. Treat recent-play events as qualifying by definition because Spotify chose to
   return them as plays.

Recommendation: option 2 is most internally consistent with a duration-based
export rule, but it makes automatic Songs membership lag manual exports. If the
owner values timeliness more, option 3 is simpler and should be documented as a
source-specific exception.

### 4. Deduplicating exports and recent-play events

The current export ends before the fresh recent-play window. The join found zero
track-and-exact-timestamp overlap, so it cannot validate a cross-source key. One
of 50 recent rows repeated the exact track URI plus millisecond timestamp. The
export itself contains 497 identical full rows.

Recommendation:

- Keep raw identity as export ZIP + member name + array index, and API raw page +
  item index.
- Do not discard identical source rows.
- For a future overlapping export, compare track URI, normalized timestamps,
  context where present, and duplicate ordinal. Export `ts` had whole-second
  precision while recent `played_at` had milliseconds, so exact string equality
  is insufficient.
- Only link two observations to one normalized playback after measured overlap
  proves a deterministic rule. Preserve both evidence links either way.
- Reimport of the exact same raw object/parser must remain idempotent independently
  of cross-snapshot reconciliation.

### 5. Track versus recording identity

Options:

1. One song item per Spotify track URI. Safest and immediately replayable, but
   remasters/relinks may appear separately.
2. Merge by ISRC. More portable, but ISRC can map to multiple catalog tracks and
   does not by itself resolve editions, edits, or bad metadata.
3. Resolve to a MusicBrainz recording and keep Spotify tracks as manifestations.
   Best long-term model, but requires a separate catalog/matching workflow.

Recommendation: option 1 for Phase 1 identity, while preserving ISRC,
`linked_from`, album, and artist identities for later reviewed merges. Never
merge by normalized title/artist alone.

### 6. Album and artist grouping

- A Spotify album URI identifies a release/container, not a recording.
- Tracks can have multiple artist credits; keep ordered contributor arrays.
- Saved albums are explicit album relationships; album membership inferred from
  a played track is catalog grouping, not a saved relationship.
- The old export provides album and artist names but not their IDs. API lookup
  can attach them only to exact track identities and must preserve provenance.
- Followed artists require new authorization. Do not delay played-song grouping
  on that scope; track metadata already supplies artist IDs/names where acquired.

Recommendation: allow server-side rollups by observed album/artist identities
without making albums/artists substitute Song items. Keep saved/followed state
as independent relationships.

### 7. Aggregates and period totals

The data can support:

- source-reported listening milliseconds by track and period from export rows;
- qualifying observation count by track and period after the rule is approved;
- first/latest observed playback;
- unique tracks, albums, and artists when identities are available; and
- lifetime versus selected-period totals.

Do not compute “completed plays” as total milliseconds divided by track duration,
do not count recent API rows as duration, and do not load full playback history
into the browser. Project indexed song observations, aggregate server-side, use
keyset pagination for items and history, and make selected-period totals use the
same qualification/dedup predicates as rows.

An item should appear once. A period filter matches any qualifying observation;
the inspector can paginate all retained history while marking period matches.
Unknown or excluded observations remain available as evidence but do not silently
inflate displayed qualified totals.

### 8. Audiobook boundary

The export has 139 audiobook segments, seven audiobook URIs, and 79 chapter
URIs. They are neither songs nor podcast episodes. Spotify audiobook identity
does not automatically map to a Hardcover work/edition.

Recommendation: preserve audiobook rows as a separate source-owned class and
exclude them from both Podcasts and Songs Phase 1. A later Books decision should
resolve work/edition/chapter matching and admission. Do not merge by title.

## Attribution, retention, and AI boundary

Spotify's [Developer Policy](https://developer.spotify.com/policy),
[Developer Terms](https://developer.spotify.com/terms), and
[design guidelines](https://developer.spotify.com/documentation/design) require
Spotify attribution and a link back when displaying API metadata or artwork.
They prohibit downloading audio, require API content to remain current, restrict
indefinite storage/caching, and prohibit ingesting Spotify Platform/Content into
machine-learning or AI models.

Implementation implications:

- Treat Web API metadata/art as a refreshable, provider-specific cache with
  acquisition/expiry state, not immutable ledger truth.
- Keep immutable owner export/raw evidence separate from expiring API catalog
  payloads. The fact that an owner export is personal data does not automatically
  settle every downstream content-license question; document the basis before
  exposing descriptions/artwork broadly or using it in Chat.
- Every Spotify-derived item display using API metadata/art needs visible source
  attribution and a Spotify link. Do not crop/alter artwork contrary to policy.
- Do not send Spotify API descriptions, artwork, or other Spotify Content to an
  LLM. Future Chat retrieval needs a provider-aware exclusion boundary.
- Listening aggregates derived from owner-provided export evidence should remain
  private and source-attributed. Spotify's broad policy restrictions on analysis
  merit explicit legal/product review before treating API data as a general
  analytics dataset.

This is a material difference from the current immutable-R2 rule. A production
metadata acquisition design must define which catalog payloads expire, which
minimal identity/provenance facts may remain, and how a replay avoids restoring
stale deleted cache content. A durable change belongs in a new ADR.

## Recommended acquisition order for the next specification phase

This sequence does not choose final Library fields:

1. Add a source-owned podcast relationship projection for saved episodes and
   saved shows, with complete-snapshot reconciliation and account scope.
2. Join every saved episode against all retained positive playback evidence
   before Queue classification. Preserve zero/null/positive observations rather
   than only their disposition.
3. Add exact-ID episode enrichment for export-only Archive episodes behind an
   explicit expiring-cache/attribution policy. Record unavailable/restricted
   results without deleting history.
4. Decide whether show-episode scans provide enough automatic-history value for
   their cost. Do not expand them into Queue by default.
5. Obtain the owner's song qualification and recent-play admission decisions.
6. Project all song export rows into a Spotify-owned observation table, retaining
   raw path, timestamps, milliseconds, skips, reasons, and identities. Build
   indexed aggregates and bounded pagination.
7. Add recent-play polling only after defining cross-source reconciliation and
   the provisional-versus-admitted behavior.
8. Add saved-track/album snapshots only if the approved Songs experience uses
   those relationships. Defer followed-artists reauthorization unless its value
   is concrete.
9. Implement authorization-deadline tracking and an explicit
   `reauthorization_required` transition before relying on unattended sync.

## Questions the owner must settle before implementation freezes behavior

1. Should Podcasts visibly have a third show-level **Following** section, or
   should followed shows initially appear only as grouping/inspector context?
2. Confirm that only saved episodes, never every episode of a saved show, are
   item-level podcast Queue candidates.
3. Is a podcast's segment summary enough for Phase 1 history, or should the
   inspector expose paginated raw listening observations despite their ambiguous
   session semantics?
4. For Songs, should the first qualifying rule be any positive playback, at
   least 30 seconds, skip-aware, or a duration-percentage hybrid?
5. Should recent-track API events create provisional activity only, or qualify a
   song immediately despite lacking `ms_played`?
6. Should saved-track and saved-album state appear as filters/relationships in
   the first Songs experience, or wait until the played-song collection works?
7. Is a separate Albums or Artists rollup required in Phase 1, or is grouping in
   the Songs collection/inspector sufficient?
8. Is reauthorizing Spotify every six months acceptable, and how much advance
   warning should Connections display?
9. Should Spotify audiobook history remain deferred to a later Books decision?

## Recommended defaults pending those answers

- Podcasts: one item per episode URI; Archive for any positive evidence; Queue
  only for valid saved episodes with explicit zero and no positive evidence;
  unavailable null rows unresolved; saved shows retained as show-level Following,
  never expanded wholesale into Queue.
- Podcast history: one Archive occurrence per episode plus source-owned segment
  aggregates; no inferred relisten sessions.
- Songs: no Queue; membership from an explicitly qualified playback rule;
  provisionally recommend 30 seconds while preserving all rows and treating
  recent API plays as provisional until reconciled.
- Song identity: Spotify track URI first, with ISRC/relink/album/artist evidence
  retained for future reviewed recording merges.
- Aggregates: server-side, period-aware, and labeled as observed/qualifying
  playback rather than completed plays.
- Audiobooks: preserved but excluded from both Spotify Library domains for now.
- Metadata: local Library facts must survive enrichment failure; API metadata/art
  is attributed and refreshable, not an unrestricted permanent or AI corpus.

These defaults are decision-ready recommendations, not final per-surface field
choices. The next specification should use them only after the owner resolves
the questions above.
