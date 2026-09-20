# Letterboxd research for Phase 1 Library specification

- Date: 2026-09-19
- Status: Source research; no per-surface Library fields are finalized here
- Scope: Movies Archive, source-derived Queue, and inspection inputs from Letterboxd
- Privacy: Live observations below contain only field names, types, safe aggregates,
  and hand-authored examples. No personal titles, text, URLs, usernames, or IDs are
  included.

## Outcome

Letterboxd is a strong source of the owner's movie relationships and viewing
history, but it is not a complete movie catalog for this application.

- The supported, configured acquisition path is a manually generated account
  export plus the public member RSS feed.
- The real ignored export and the currently configured RSS feed were freshly
  re-probed for this research. Both remain usable, and their complete observed
  field shapes are recorded below.
- The Letterboxd API is a distinct, unavailable surface. Its documentation is
  useful for understanding the provider's model, but Letterboxd's current
  access policy expressly excludes private/personal, visualization,
  recommendation, and LLM projects. This repository has no Letterboxd API
  client credentials.
- Public HTML pages are neither an API nor an approved acquisition path. They
  were not scraped. Letterboxd's terms prohibit automated extraction except
  where authorized.
- TMDB is a distinct third-party catalog, not a Letterboxd history source. The
  repository has no TMDB or OMDb credential, binding, client, or configured
  secret, so no enrichment API call was made. RSS-supplied TMDB IDs are stored
  as identities only.
- The implemented import projects title, release year, Letterboxd identities,
  viewing occurrences, source dates, ratings, and exported review text. Exact
  ZIP/XML bytes retain substantially more: likes, tags, rewatch flags,
  watchlist state, lists, comments, RSS HTML/posters, and profile data.
- The production API currently returns only `id`, `type`, and `title` for both
  movie rows and detail. Rich Movies Library contracts do not exist yet.

The key Phase 1 design question is therefore not whether Letterboxd has movie
data. It is which personal facts should be projected from retained evidence,
which catalog facts justify a new attributed dependency, and how the interface
should remain useful when that dependency is absent.

## Evidence labels

This report uses the following labels consistently:

| Label                    | Meaning                                                                                                   |
| ------------------------ | --------------------------------------------------------------------------------------------------------- |
| **Live-verified**        | Observed on 2026-09-19 from the configured public RSS feed or the ignored owner export.                   |
| **Documented-only**      | Present in current official documentation but not called with this project's credentials.                 |
| **Export-only**          | Available in the owner ZIP, not in the public RSS shape.                                                  |
| **Stored/projected**     | Parsed into D1 canonical/source records by current code.                                                  |
| **Retained/recoverable** | Exact bytes are retained in R2, but the field is not currently projected and requires parser/schema work. |
| **New acquisition**      | Requires a new supported request, credential, storage policy, or provider integration.                    |
| **Unavailable**          | Not supplied by the supported configured sources.                                                         |

"Recoverable" does not mean cheap to query. Browse APIs must not unzip or parse
raw objects per request; useful retained fields need a replay-safe projection.

## Source surfaces must remain separate

| Surface                       | Status for this app                               | Authentication and request shape                                                                                           | Coverage and role                                                                                                                                                                    |
| ----------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Letterboxd account export ZIP | **Live-verified; supported**                      | Member generates and downloads the ZIP in Letterboxd settings, then uploads it to this app. This is not an API call.       | Authoritative snapshot for history, watchlist, likes, ratings, reviews, tags, lists, and time-sensitive deletion/orphan evidence.                                                    |
| Member RSS                    | **Live-verified; supported and configured**       | `GET https://letterboxd.com/{member}/rss/`; no authentication for public activity.                                         | Finite best-effort window of public diary/review/list activity. Low-latency supplement, not a full mirror.                                                                           |
| Letterboxd API                | **Documented-only; blocked**                      | OAuth2 against `https://api.letterboxd.com/api/v0`; approved client credentials are required.                              | Would expose film/catalog, log-entry, relationship, and watchlist JSON, including richer identities and timestamps. It is not available under the published policy for this project. |
| Public Letterboxd pages       | **Not acquired**                                  | Browser pages; a `HEAD` response may expose a Letterboxd identifier, but automated page extraction is not authorized here. | Human-facing source links only. Do not scrape film, diary, review, list, or watchlist HTML.                                                                                          |
| CSV importer                  | **Write-only, later possibility**                 | User uploads a generated CSV through Letterboxd's browser UI and confirms it.                                              | Manual watched/diary/list/watchlist write-back. It is not a read API or automatic bidirectional sync.                                                                                |
| TMDB                          | **Separate catalog; credential-blocked**          | TMDB v3 application key or read bearer token.                                                                              | Candidate for metadata, images, credits, genres, runtime, external IDs, releases, and watch providers. Never evidence of the owner's Letterboxd activity.                            |
| OMDb                          | **Separate optional catalog; credential-blocked** | OMDb API key.                                                                                                              | Narrower IMDb-oriented supplement. No credential or client exists in this repository.                                                                                                |

Primary policy references: [Letterboxd API access](https://letterboxd.com/api-beta/),
[Letterboxd API documentation](https://api-docs.letterboxd.com/),
[account export](https://letterboxd.com/user/exportdata/),
[CSV importer](https://letterboxd.com/about/importing-data/), and
[terms of use](https://letterboxd.com/legal/terms-of-use/).

## Fresh verification summary

### Public RSS

The configured public feed returned HTTP `200` with
`application/rss+xml;charset=utf-8`. The response advertised
`Cache-Control: no-store` and no `ETag` or `Last-Modified` validator.

The current snapshot contained 65 entries: 50 movie entries and 15 list
entries. Movie entries covered 49 distinct TMDB movie identities; the feed can
contain multiple viewings of one movie. All 65 GUIDs were unique in the
snapshot. This is an observation, not a retention or uniqueness guarantee.

All 50 current movie entries populated the structured movie title, release
year, watched date, rewatch flag, member rating, member-like flag, and TMDB ID.
That completeness must not be promoted to a contract: the parser and future UI
must continue to allow optional fields.

### Account export

The ignored owner ZIP contained 31 CSV files, including 15 list exports. The
shape probe confirmed:

- 363 watched films;
- 211 Diary occurrences across 180 films, including 38 rewatch-flagged rows;
- 183 watched-only films with no trustworthy consumption date;
- 355 current film ratings, 13 reviews, and 288 liked films;
- 309 current watchlist rows, including two title/year overlaps with watched
  films; and
- zero rows in the present deleted/orphaned files, while their headers still
  confirm the available schemas.

The ZIP is ignored and was read locally. It was not copied, modified, or
printed. Aggregate counts should not be mistaken for invariant upstream limits.

### Current local projection

A content-free aggregate query of the current local D1 projection found 372
movie items supported by the Letterboxd connection and 403 active viewing
occurrences. None of those movie items currently has an image, description,
creator, or runtime projected. The ledger contained 363 film URI identities,
211 Diary URI identities, and 50 TMDB movie identities. These are a local
snapshot, not a production completeness promise.

## RSS contract: exhaustive observed shape

### Acquisition behavior

- Method: `GET`.
- Endpoint: `https://letterboxd.com/{member}/rss/`.
- Request headers currently used: `Accept: application/rss+xml` and a
  descriptive personal-use user agent.
- Authentication: none for public activity.
- Pagination: none. Every request returns one current finite snapshot.
- Cursor: none. The connector stores response hash, parser version, fetch time,
  oldest/newest valid `pubDate`, and current GUIDs after durable processing.
- Rate/quota: no numeric RSS quota is published. Continue a conservative
  30-60 minute single-request cadence, honor `429`/`Retry-After` if observed,
  and back off on failures.
- Deletion: absence is not a tombstone because an entry can age out.
- Privacy: only activity visible in the public feed can appear. Private or old
  activity requires an export.

### Envelope and channel fields

The live RSS root declared `version`, `xmlns:atom`, `xmlns:dc`,
`xmlns:letterboxd`, and `xmlns:tmdb`. The channel supplied `title`, `link`,
`description`, and `atom:link`, followed by `item` elements. Channel display
text and member URLs are not needed for canonical movie facts.

### Item fields

| Field                               | Observed type/precision                                            | Movie presence | List presence | Meaning and caution                                                                                                                                          | Current treatment                                                         |
| ----------------------------------- | ------------------------------------------------------------------ | -------------: | ------------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| `title`                             | String, presentation-formatted                                     |          50/50 |         15/15 | May combine title, year, rating symbols, spoiler/review presentation, or list name. Do not parse when structured fields exist.                               | Retained only.                                                            |
| `link`                              | Absolute URL string                                                |          50/50 |         15/15 | Movie entries link to a member-specific Diary/review route; list entries link to a list.                                                                     | Movie value becomes a connection-scoped `diary_uri`; lists retained only. |
| `guid` with `isPermaLink` attribute | Opaque string                                                      |          50/50 |         15/15 | Classifies observed watch, review, or list entries. A review edit can change the GUID class, so it is not the sole stable viewing identity.                  | Source key and RSS occurrence fallback.                                   |
| `pubDate`                           | RFC 822 timestamp with offset; normalized to UTC instant           |          50/50 |         15/15 | Publication/update time, not watched time.                                                                                                                   | `source_recorded_at` and Archive `source_recorded_at`.                    |
| `dc:creator`                        | String                                                             |          50/50 |         15/15 | Member display name, not film creator/director.                                                                                                              | Retained only; must never populate movie creator.                         |
| `description`                       | HTML string                                                        |          50/50 |         15/15 | Movie HTML included one image and watched/review prose; list HTML contained linked ordered/unordered items and optional prose. Imported markup is untrusted. | Exact HTML retained only. Review text and poster URL are not projected.   |
| `letterboxd:watchedDate`            | ISO calendar date `YYYY-MM-DD`                                     |          50/50 |          0/15 | Source-asserted day of viewing.                                                                                                                              | Archive `consumed_at`, day precision.                                     |
| `letterboxd:rewatch`                | `Yes`/`No`                                                         |          50/50 |          0/15 | Source's rewatch declaration for this viewing.                                                                                                               | Parsed but not stored/projected outside raw XML.                          |
| `letterboxd:filmTitle`              | String                                                             |          50/50 |          0/15 | Structured film title.                                                                                                                                       | Movie title.                                                              |
| `letterboxd:filmYear`               | Four-digit year text                                               |          50/50 |          0/15 | First-release year, not a full release/edition identity.                                                                                                     | Movie publication year, source-asserted year precision.                   |
| `letterboxd:memberRating`           | Decimal in half-star increments, `0.5`-`5.0`; optional by contract |     50/50 live |          0/15 | Rating for the feed viewing/log entry.                                                                                                                       | Archive occurrence rating on original scale.                              |
| `letterboxd:memberLike`             | `Yes`/`No`                                                         |          50/50 |          0/15 | Member like state exposed on the movie entry. Its exact film-versus-entry update semantics should not be inferred from one snapshot.                         | Parsed but not projected.                                                 |
| `tmdb:movieId`                      | Decimal identifier represented as text; optional                   |     50/50 live |          0/15 | Global TMDB movie identity. It is not TMDB metadata.                                                                                                         | Global `tmdb/movie_id` identity.                                          |

The movie `description` HTML currently used `p`, `img`, and occasional `em`
elements; each movie description had one image `src`. List descriptions used
`ul`, `ol`, `li`, `a`, `p`, and `br`, with link attributes. Treat all markup,
URLs, and remote images as untrusted. Do not use the RSS image URL as an
unreviewed permanent artwork license or availability guarantee.

Hand-sanitized representative shape:

```xml
<item>
  <title>Example Film, 20XX - rating presentation</title>
  <link>https://letterboxd.example/member/film/example/log-entry/</link>
  <guid isPermaLink="false">letterboxd-watch-REDACTED</guid>
  <pubDate>Wed, 01 Jan 20XX 12:34:56 +0000</pubDate>
  <letterboxd:watchedDate>20XX-01-01</letterboxd:watchedDate>
  <letterboxd:rewatch>No</letterboxd:rewatch>
  <letterboxd:filmTitle>Example Film</letterboxd:filmTitle>
  <letterboxd:filmYear>20XX</letterboxd:filmYear>
  <letterboxd:memberRating>4.0</letterboxd:memberRating>
  <letterboxd:memberLike>Yes</letterboxd:memberLike>
  <tmdb:movieId>REDACTED</tmdb:movieId>
  <description><![CDATA[<p><img src="https://image.example/poster.jpg"/></p>...]]></description>
  <dc:creator>Example Member</dc:creator>
</item>
```

## Export contract: exhaustive observed shape

### Acquisition behavior

- A signed-in member requests an export in the Letterboxd UI and downloads the
  generated ZIP. The app then receives the unmodified ZIP by explicit upload.
- There is no API endpoint, cursor, pagination, or automatic polling involved.
- The ZIP is a point-in-time snapshot. A later complete export can establish
  current membership changes only after implementing snapshot-scoped
  reconciliation; the current importer does not do that for watchlist or
  deletions.
- The exact ZIP is content-addressed and retained in private R2 before parsing.
- Letterboxd says exports include deleted content, but its FAQ says content
  deleted on or after 2024-05-01 is permanently removed no less than 30 days
  after deletion. Timely exports are therefore required for deletion evidence.

### File schemas, field types, and observed nullability

All dates below were `YYYY-MM-DD` day values in the live export. `Year` was a
four-digit year. URLs are opaque identifiers and must not be decomposed into
local primary keys.

| File/group              | Exhaustive columns                                                                                                                 | Observed nullability and semantics                                                                                                                                                                            | Current treatment                                                                                                                        |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `watched.csv`           | `Date`, `Name`, `Year`, `Letterboxd URI`                                                                                           | All populated. `Date` is when watched state was recorded, not a consumption date. URI is film-level.                                                                                                          | All four projected; creates film and, only when no Diary row exists, an undated watched-state Archive occurrence.                        |
| `ratings.csv`           | Watched columns plus `Rating`                                                                                                      | All populated in this snapshot. Rating decimal is current/default film rating on the 0.5-5 scale; URI is film-level.                                                                                          | Rating record projected for watched-only occurrences; ignored for films with Diary occurrences to avoid overwriting per-viewing ratings. |
| `diary.csv`             | `Date`, `Name`, `Year`, `Letterboxd URI`, `Rating`, `Rewatch`, `Tags`, `Watched Date`                                              | Identity/date/title/year all populated. Rating was absent on 2/211 rows. `Rewatch` was `Yes` when true and empty otherwise. Tags happened to be empty, but the column is supported. URI is Diary-entry-level. | Identity, dates, rating projected. Rewatch and tags retained only.                                                                       |
| `reviews.csv`           | Diary columns plus `Review`                                                                                                        | All 13 rows populated identity, dates, rating, and review. `Rewatch` and `Tags` happened to be empty. Review text may contain commas, quotes, and physical newlines.                                          | Review text and matching Diary identity projected; other Diary facts come from `diary.csv`.                                              |
| `watchlist.csv`         | `Date`, `Name`, `Year`, `Letterboxd URI`                                                                                           | All populated. `Date` is source-added day; URI is film-level. Snapshot membership does not itself supply a removal date.                                                                                      | Exact file retained only; no Queue projection.                                                                                           |
| `likes/films.csv`       | `Date`, `Name`, `Year`, `Letterboxd URI`                                                                                           | All populated. Film-level like with source-recorded day.                                                                                                                                                      | Retained only.                                                                                                                           |
| `likes/reviews.csv`     | `Date`, `Content`                                                                                                                  | All populated. `Content` is a review URL/identity.                                                                                                                                                            | Retained only.                                                                                                                           |
| `likes/lists.csv`       | `Date`, `Content`                                                                                                                  | All populated. `Content` is a list URL/identity.                                                                                                                                                              | Retained only.                                                                                                                           |
| `comments.csv`          | `Date`, `Content`, `Comment`                                                                                                       | Present row populated; `Content` is a URL, `Comment` is member-authored text.                                                                                                                                 | Retained only; out of Movies Library scope unless comments are later requested.                                                          |
| `profile.csv`           | `Date Joined`, `Username`, `Given Name`, `Family Name`, `Email Address`, `Location`, `Website`, `Bio`, `Pronoun`, `Favorite Films` | One row. Several profile fields may be empty; `Favorite Films` is a URL collection/string rather than normalized film rows.                                                                                   | Retained only and not a Movie detail source.                                                                                             |
| `deleted/diary.csv`     | Same columns as `diary.csv`                                                                                                        | Empty in this snapshot; schema confirmed. Rows, when present, are deletion evidence, not instructions to erase history.                                                                                       | Retained only; no tombstone projection.                                                                                                  |
| `deleted/reviews.csv`   | Same columns as `reviews.csv`                                                                                                      | Empty in this snapshot; schema confirmed.                                                                                                                                                                     | Retained only.                                                                                                                           |
| `deleted/comments.csv`  | Same columns as `comments.csv`                                                                                                     | Empty in this snapshot; schema confirmed.                                                                                                                                                                     | Retained only.                                                                                                                           |
| `orphaned/diary.csv`    | Same columns as `diary.csv`                                                                                                        | Empty in this snapshot; schema confirmed.                                                                                                                                                                     | Retained only.                                                                                                                           |
| `orphaned/reviews.csv`  | Same columns as `reviews.csv`                                                                                                      | Empty in this snapshot; schema confirmed.                                                                                                                                                                     | Retained only.                                                                                                                           |
| `orphaned/comments.csv` | Same columns as `comments.csv`                                                                                                     | Empty in this snapshot; schema confirmed.                                                                                                                                                                     | Retained only.                                                                                                                           |
| `lists/*.csv` metadata  | Marker `Letterboxd list export v7`, then `Date`, `Name`, `Tags`, `URL`, `Description`                                              | 15 list metadata rows. Date/name/URL populated; tags and description optional.                                                                                                                                | Retained only.                                                                                                                           |
| `lists/*.csv` items     | `Position`, `Name`, `Year`, `URL`, `Description`                                                                                   | 321 rows across 15 files. Position/title/year/URL populated; item descriptions empty in this snapshot but supported. URL is film-level.                                                                       | Retained only.                                                                                                                           |

Hand-sanitized representative rows:

```csv
# watched.csv
Date,Name,Year,Letterboxd URI
20XX-01-02,Example Film,20XX,https://boxd.example/FILM

# diary.csv
Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date
20XX-01-03,Example Film,20XX,https://boxd.example/DIARY,4.0,Yes,"tag-one, tag-two",20XX-01-01

# reviews.csv (Review may span CSV physical lines)
Date,Name,Year,Letterboxd URI,Rating,Rewatch,Review,Tags,Watched Date
20XX-01-03,Example Film,20XX,https://boxd.example/DIARY,4.0,Yes,"Example review text",,20XX-01-01

# watchlist.csv
Date,Name,Year,Letterboxd URI
20XX-02-01,Queued Example,20XX,https://boxd.example/QUEUED-FILM
```

### Export identity and time semantics

- `watched.csv`, `ratings.csv`, `likes/films.csv`, and `watchlist.csv` share a
  stable film-level Letterboxd URI.
- `diary.csv` and `reviews.csv` use a distinct Diary/review-entry URI. Review
  URIs matched Diary URIs in the observed export.
- The export contains no TMDB or IMDb IDs. The current exact `Name + Year` join
  between Diary and watched rows is necessary but must surface ambiguity.
- Export `Date` is a source-recorded activity day. `Watched Date` is the
  source-asserted day of consumption. Ingestion time is neither.
- Multiple Diary URIs are the trustworthy evidence for separate watches.
  `Rewatch` corroborates presentation but should not manufacture occurrences.
- A watched-only row proves Archive membership but not when the film was seen.

## Official Letterboxd API: documented-only, not configured

Letterboxd publishes a JSON API under
`https://api.letterboxd.com/api/v0`. Third-party clients use OAuth2 Client
Credentials for public data or Authorization Code for member-authenticated
data; token requests use `/auth/token`, form encoding, and bearer tokens.
Cursor endpoints generally accept `cursor` and `perPage` (default 20, maximum
100), and the documentation states a 100,000-object cursor traversal cap.
No general numeric request quota is published in the current API documentation;
endpoint-specific `429` responses exist, so a future approved client would need
retry/backoff and observed-limit telemetry.

Relevant read-only endpoint shapes if policy and credentials ever change:

| Endpoint                                                         | Potential use                                      | Documented response shape                                                                          |
| ---------------------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `GET /films?member=...&memberRelationship=Watched                | Liked                                              | Rated                                                                                              | InWatchlist` | Relationship-filtered film collection | `next?`, required `items: FilmSummary[]`, optional `itemCount`; supports count and many filter/sort parameters. |
| `GET /log-entries?member=...&memberRelationship=Owner`           | Diary/review occurrences                           | `next?`, required `items: FilmLogEntry[]`, optional `itemCount`.                                   |
| `GET /member/{id}/watchlist`                                     | Current public watchlist                           | `FilmsResponse`; returns `403` for a private watchlist.                                            |
| `GET /production/{id}` or legacy `GET /film/{id}`                | Film detail                                        | Production/Film detail JSON. IDs may be Letterboxd LIDs; legacy lookup also documents `tmdb:{id}`. |
| Production contributions, statistics, and availability endpoints | Credits, community statistics, provider/store data | Separate response models; some fields/endpoints are first-party-only or licensing-limited.         |

Documented `FilmSummary` fields are `type` (deprecated), required `id`, `name`,
`fullDisplayName`, `link`, and `sortingName`; optional/conditional
`alternativeNames` (first-party), `releaseYear`, `runTime`, weighted community
`rating`, `poster`, `adultPoster`, required `adult`, deprecated
`reviewsHidden`, optional `reviewsHiddenReason`, required custom-poster/backdrop
capability booleans, first-party picker URLs, `contextualPoster`, first-party
`originalName`, top-film positions, `filmCollectionId`, required `directors` and
`genres`, deprecated `links`, and optional member `relationships`. An `Image`
contains required `sizes[]`, each with required pixel `width`, pixel `height`,
and URL.

Documented production detail adds optional `releaseDate`, `description`,
`trailer`, `backdrop`, focal point, tagline, language/release/contribution
fields, and related content, with several licensing-sensitive fields marked
first-party-only. A contributor summary includes required contributor `id` and
`name`, optional character name, TMDB ID, and poster.

Documented `ProductionLogEntry` fields are required `id`, `production`, `name`,
`owner`, optional `diaryDetails` (`diaryDate`, required `rewatch`), optional
`review`, deprecated `tags`, required structured `tags2`, required UTC
`whenCreated`/`whenUpdated`, optional 0.5-5 `rating`, required `like` and
`commentable`, optional comment policy, required links and privacy policy, plus
conditional poster/backdrop/targeting fields. These are richer than RSS but are
not evidence this project can acquire them.

Documented `ProductionRelationship` fields include production/member IDs,
required watched/liked/favorited/watchlist flags, conditional timestamps for
watched/liked/watchlist-added/watchlist-completed, optional rating, required
derived-rating flag, draft/review/Diary LID arrays, required rewatched flag,
log-entry rating/like facts, privacy, and conditional custom artwork. This model
is useful for schema reasoning only; it must not be presented as configured.

Exact blocker: no approved Letterboxd API client ID/secret, access token,
authorization flow, application approval, environment binding, or connector is
present. More importantly, the current [access policy](https://letterboxd.com/api-beta/)
states that access is not being granted for this project's categories. The
recommendation is to keep API support out of Phase 1 rather than design around a
hypothetical grant.

## Third-party movie enrichment: separately sourced and currently blocked

### Exact configuration finding

No `TMDB_API_KEY`, TMDB bearer token, OMDb key, corresponding Worker binding,
or catalog client exists in `.env.local`, `apps/api/.dev.vars`, `Bindings`, or
`wrangler.jsonc`. The domain and database recognize the `tmdb/movie_id`
identity namespace, but that is not an API integration. Therefore no live TMDB
or OMDb request was made.

### TMDB documented candidate

TMDB application authentication accepts a v3 `api_key` query parameter or an
API Read Access Token in `Authorization: Bearer ...`. A known RSS TMDB ID could
be read with:

```http
GET https://api.themoviedb.org/3/movie/{tmdb_movie_id}?language=en-US&append_to_response=credits,images,external_ids,release_dates
Authorization: Bearer REDACTED
Accept: application/json
```

Watch-provider data is available separately at
`GET /3/movie/{movie_id}/watch/providers`. Details supports up to 20 appended
subresources. TMDB says its old 40-requests-per-10-seconds rule is disabled but
that changeable anti-scraping limits are around 40 requests/second; clients must
respect `429`.

Documented candidate field inventory (not live-verified here):

| Response        | Fields relevant to the Library                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Movie details   | `adult`, `backdrop_path`, nullable collection identity/name/artwork, `budget`, `genres[{id,name}]`, `homepage`, integer `id`, nullable `imdb_id`, origin countries, `original_language`, `original_title`, nullable `overview`, `popularity`, nullable `poster_path`, production companies and countries, `release_date`, `revenue`, nullable runtime minutes, spoken languages, `status`, nullable `tagline`, `title`, `video`, `vote_average`, `vote_count`. |
| Credits         | Movie `id`; `cast[]` person identity/name/original name, department, gender, popularity, nullable profile path, cast/credit IDs, character, and order; `crew[]` analogous person fields plus credit ID, department, and job.                                                                                                                                                                                                                                   |
| Images          | Movie `id`; `backdrops[]`, `logos[]`, and `posters[]` with aspect ratio, width/height, nullable language, file path, vote average, and vote count. Image URLs require TMDB configuration/base-size/path composition.                                                                                                                                                                                                                                           |
| External IDs    | Movie ID plus IMDb, Wikidata, Facebook, Instagram, and Twitter identifiers where present.                                                                                                                                                                                                                                                                                                                                                                      |
| Release dates   | Country groups and release rows with certification, language, note, UTC release instant, release type, and optional descriptors. These are release facts under one movie identity, not separate consumption items by default.                                                                                                                                                                                                                                  |
| Watch providers | Country-keyed result object with a TMDB link and optional `flatrate`, `free`, `ads`, `rent`, and `buy` arrays; provider rows include display priority, logo path, provider ID, and provider name.                                                                                                                                                                                                                                                              |

TMDB noncommercial use requires TMDB attribution, an approved logo, and the
notice: “This product uses the TMDB API but is not endorsed or certified by
TMDB.” TMDB does not claim ownership of all returned artwork. Watch-provider
data is supplied with JustWatch and requires JustWatch attribution. See
[authentication](https://developer.themoviedb.org/docs/authentication-application),
[movie details](https://developer.themoviedb.org/reference/movie-details),
[credits](https://developer.themoviedb.org/reference/movie-credits),
[images](https://developer.themoviedb.org/reference/movie-images),
[watch providers](https://developer.themoviedb.org/reference/movie-watch-providers),
[rate limiting](https://developer.themoviedb.org/docs/rate-limiting), and
[FAQ/attribution](https://developer.themoviedb.org/docs/faq).

## Current implementation and acquisition gap matrix

| Fact                                                                               | Status                                                              | Current location/behavior                                                                                       | Work needed before Library use                                                                        |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Film title                                                                         | **Stored/projected**                                                | `media_items.title` from export or structured RSS.                                                              | Expose in richer list/detail contracts.                                                               |
| Release year                                                                       | **Stored/projected**                                                | `media_items.published_at` with year precision.                                                                 | Expose with precision; do not call it a full release date.                                            |
| Letterboxd film URI                                                                | **Stored/projected**                                                | Global `letterboxd/film_uri` identity and canonical URL from export.                                            | Expose as the main film source link.                                                                  |
| Diary/review URI                                                                   | **Stored/projected**                                                | Connection-scoped `letterboxd/diary_uri`; RSS URL can reconcile to export.                                      | Expose per viewing when available, separate from film source link.                                    |
| TMDB movie ID                                                                      | **Stored/projected for RSS-covered films**                          | Global identity only.                                                                                           | Use for exact enrichment after credential/storage/attribution decision.                               |
| Watched-only membership                                                            | **Stored/projected**                                                | Undated Archive occurrence only when no Diary occurrence accounts for the film.                                 | Explain unknown date without substituting export `Date`.                                              |
| Diary occurrences and rewatches                                                    | **Stored/projected**                                                | One occurrence per Diary URI; RSS reconciliation preserves stable occurrence across GUID/date edits.            | Return all occurrences and occurrence-aware period filtering.                                         |
| Watched/recorded/ingested times                                                    | **Stored/projected**                                                | Separate temporal fields with precision/basis.                                                                  | Expose only semantically useful dates; keep provenance accessible.                                    |
| Per-occurrence rating                                                              | **Stored/projected**                                                | Archive entry, source scale 0.5-5.                                                                              | Decide row summary versus history display without collapsing rewatches.                               |
| Current/default film rating                                                        | **Partially projected**                                             | Applied to watched-only occurrence; ignored when Diary exists. Exact source row remains in ZIP/source evidence. | Add a film-level personal relationship projection if the UI needs current rating separately.          |
| Exported review text                                                               | **Stored/projected**                                                | Archive occurrence review text with evidence.                                                                   | Sanitize/render as member-authored text; handle long/multiline text.                                  |
| RSS review text                                                                    | **Retained/recoverable**                                            | Embedded in untrusted `description` HTML; canonical review remains null until export.                           | Parse/sanitize only if low-latency review updates are required; reconcile to Diary identity.          |
| Film like                                                                          | **Retained/recoverable**                                            | Export `likes/films.csv`; RSS `memberLike` parsed but discarded from projection.                                | Define film-level current relationship and snapshot reconciliation.                                   |
| Rewatch flag                                                                       | **Retained/recoverable**                                            | Export column and RSS parsed value; occurrence multiplicity already canonical.                                  | Optional presentation/evidence projection; never use alone to create an occurrence.                   |
| Diary tags                                                                         | **Retained/recoverable**                                            | Export `Tags`; no current rows populated, but schema supports it.                                               | Parse as occurrence-owned tags if chosen for inspector/filtering.                                     |
| Watchlist membership and added day                                                 | **Export-only; retained/recoverable**                               | Exact `watchlist.csv` in raw ZIP. No Queue model/projection.                                                    | Add source membership state, complete-snapshot reconciliation, last-observed coverage, and Queue API. |
| Watchlist removal                                                                  | **Unavailable as an event; inferable from complete later snapshot** | No tombstone/removal date in current export; RSS does not carry watchlist.                                      | Retire membership only after a successful complete newer export; preserve prior evidence.             |
| User lists and positions                                                           | **Export-only; retained/recoverable**                               | List v7 metadata/items in ZIP; RSS list items retained as ignored source records.                               | Add list/list-membership projection only for a concrete Movies detail or future Lists requirement.    |
| Poster in RSS HTML                                                                 | **Retained/recoverable, partial**                                   | Remote image URL inside untrusted description; only recent public entries.                                      | Decide whether to sanitize/project as best-effort fallback and document hosting/rights.               |
| Synopsis, runtime, genres, directors/cast, backdrops, external IDs, exact releases | **New acquisition**                                                 | Not supplied by configured export; Letterboxd API unavailable.                                                  | Prefer exact-ID TMDB enrichment; explicit candidate matching for export-only films.                   |
| Watch providers                                                                    | **New acquisition, volatile**                                       | Not supplied by Letterboxd sources.                                                                             | TMDB/JustWatch-sourced, region-dependent cache with attribution and refresh policy.                   |
| Community average rating/statistics                                                | **New acquisition**                                                 | Not in export/RSS structured facts.                                                                             | Decide if useful; label distinctly from personal rating and store as catalog observation.             |
| Production/release identity                                                        | **Not modeled beyond movie + year**                                 | Letterboxd/TMDB identity is movie-level; release year is metadata.                                              | Add release entities only for a demonstrated release-specific feature.                                |

The exact raw ZIP and RSS XML satisfy retention, but the current parser does
not create source records for every export row. A future replay should create
addressable source records for each newly projected watchlist, like, tag, list,
or deletion observation while preserving the original raw-object lineage.

## Decision-ready options for the Movies specification

These recommendations narrow the implementation choices; they do not finalize
the list row, inspector, filters, or section composition.

### 1. Movie identity versus release identity

**Option A — one movie/production item (recommended for Phase 1).** Keep the
Letterboxd film URI and TMDB movie ID as identities on one movie item. Store
country/theatrical/digital release facts as catalog metadata under that item.
This matches the observed history and avoids inventing a consumed release.

**Option B — separate release/edition items.** This could represent a specific
cut, country release, or physical edition, but Letterboxd history does not say
which one was watched. It would create false precision unless another source or
user input supplies the manifestation.

Recommendation: Option A. Preserve raw release facts if acquired, and revisit
release entities only for an explicit editions/cuts/ownership feature.

### 2. Ratings, reviews, likes, tags, and rewatches

| Question                    | Options/tradeoff                                                                                                                                                | Research recommendation                                                                                                                                                        |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Rating shown on a movie row | Latest matching occurrence is temporally relevant; current/default film rating reflects today's relationship; last-rated occurrence may differ after a rewatch. | Preserve both data classes. Do not select the row rule until the Movies field matrix is reviewed with examples. Label personal rating and never mix it with community average. |
| Rating in history           | One rating per occurrence accurately preserves changing opinions.                                                                                               | Show per-occurrence ratings where present; null is meaningful.                                                                                                                 |
| Reviews                     | Export review is occurrence-owned and can be multiline. RSS can update faster but is HTML and partial.                                                          | Project exported review now; consider sanitized RSS review parsing only if freshness is worth added reconciliation complexity.                                                 |
| Film likes                  | Export gives current film-level membership; RSS exposes a current-looking flag on each item.                                                                    | Model one film-level personal like relationship with observation history, not a like per viewing, unless a future live API proves otherwise.                                   |
| Tags                        | Export attaches tags to Diary/review rows; current owner snapshot happens to have none.                                                                         | If selected, keep tags occurrence-owned and do not promote empty current usage into an unavailable claim.                                                                      |
| Rewatch                     | Distinct Diary URIs prove distinct watches; the flag describes source interpretation.                                                                           | Use occurrence count/history as truth. Retain/display the flag only as supporting source metadata.                                                                             |

### 3. Dates and ordering

- `Watched Date`: consumption, day precision, source asserted.
- watched-only: consumption date unknown.
- export `Date`: source-recorded activity day.
- RSS `pubDate`: source publication/update instant.
- year: movie first-release year, not consumption.
- watchlist `Date`: added-to-watchlist day.
- import/fetch time: acquisition only.

Recommendation: collection period filters match any viewing occurrence, as the
Library foundation requires. Unknown-date watched films remain available under
an explicit unknown-date state and sort last for consumption-date sorting. Queue
sorting may use watchlist-added day but must name it accurately.

### 4. Watchlist membership and removal

**Option A — current export membership only (recommended initial source rule).**
Create one source-owned Queue membership per film in `watchlist.csv`, recording
added day and export observation. A successful complete newer export can retire
memberships absent from that snapshot. This is honest but only as fresh as the
last export.

**Option B — infer removal from Archive/watch state.** This would imitate
Letterboxd's ordinary automatic removal behavior but contradicts observed
watchlist/history overlaps and the owner's explicit rule that history does not
independently cancel an explicit watchlist row.

Recommendation: Option A. Archive and Queue remain independent. Never retire on
RSS absence, a partial/failed upload, or a historical watch alone.

### 5. Lists

The export proves rich list metadata, ordered membership, notes/descriptions,
tags, likes, and RSS activity exist. Lists could support a compact “In lists”
movie-detail section or a future dedicated Lists surface. They are not required
to make Movies Archive/Queue trustworthy.

Recommendation: retain and make list parsing replayable, but do not put Lists
in Phase 1 navigation. Decide separately whether “In your Letterboxd lists” is
valuable enough for the first Movies inspector. If selected, preserve list
identity, position, item note, list tags/description, and source link rather
than flattening membership into movie tags.

### 6. Artwork and movie metadata

**Option A — no catalog dependency.** Most export-only movies have no poster,
director, synopsis, genres, or runtime. The Library remains accurate but visually
sparse.

**Option B — project RSS poster as a best-effort fallback.** Fast and already
retained, but covers only the RSS window, uses embedded untrusted remote URLs,
and lacks a durable catalog/attribution policy.

**Option C — TMDB enrichment (recommended candidate, not yet approved).** Exact
RSS TMDB IDs give high-confidence lookup for recent films; export-only history
needs explicit candidate matching. It provides the metadata desired for movie
cards/inspection, with credential, caching, failure, attribution, image-rights,
and ambiguity work.

Recommendation: design local history/source links to render without enrichment.
Evaluate Option C once a credential exists. Option B may remain a clearly marked
fallback, not the identity or sole durable artwork source.

### 7. Credits, genres, runtime, and providers

- Runtime and genres are compact, broadly useful catalog facts.
- Director is a good primary-creator candidate, but films may have multiple
  directors; a single `primary_creator_name` loses structure.
- Full cast/crew can be large. A bounded primary cast/director section plus a
  separately paginated/limited credits projection is safer than embedding the
  complete response in every list/detail request.
- Provider availability is regional and volatile. It needs region, observed-at,
  refresh/expiry behavior, and JustWatch attribution. It must never be treated
  as an imported historical fact.

Recommendation: if TMDB is adopted, separate stable-ish catalog metadata from
volatile regional availability and from immutable Letterboxd evidence. Do not
let a failed or stale enrichment hide the movie or its viewing history.

### 8. Source links

Potential link classes are:

1. Letterboxd film page from the film-level export URI;
2. per-occurrence Diary/review page when a Diary URI exists;
3. TMDB movie page after exact identity is known; and
4. provider availability link if separately acquired.

Recommendation: retain all link classes with source labels. Prefer the film
page as the stable primary Letterboxd link and place log-entry links beside the
relevant viewing. Never expose raw opaque IDs as user-facing text.

### 9. Possible inspector sections, not a selected layout

The available facts could support some subset of:

- Overview: poster, title, year/release facts, runtime, synopsis, genres,
  director/compact credits.
- Your relationship: current personal rating, like, watchlist membership and
  added date.
- Viewing history: all Diary occurrences, watched dates, per-viewing ratings,
  review, tags, and rewatch evidence; plus an undated watched state when needed.
- Lists: Letterboxd list memberships and positions if selected.
- Availability: region-scoped current providers, only with attribution and
  freshness.
- Sources: film and Diary links, last authoritative export, RSS coverage, and
  compact provenance disclosure.

This is an inventory, not a mandate to show every section or every field. The
UI foundation explicitly warns against surfacing data merely because it exists.

## Questions the Phase 1 field matrix must resolve

1. Should the movie-row personal rating be current/default, latest matching
   viewing, latest overall viewing, or omitted from the row when those differ?
2. Are film likes useful enough for list filtering or only for the inspector?
3. Are occurrence tags in the initial Movies scope despite no populated tags in
   the current export snapshot?
4. Should the inspector expose a compact “In your lists” section, or should list
   projection wait for a future Lists surface?
5. Is a best-effort RSS poster acceptable before TMDB, including missing-artwork
   asymmetry and remote URL policy?
6. If TMDB is enabled, which fields are required for the initial card and which
   are optional inspector enrichment? This must include an offline/no-credential
   state.
7. Which regional provider market should availability use, how stale may it be,
   and is the attribution/UI cost worthwhile for Phase 1?
8. For ambiguous export-only title/year matches, should the app leave metadata
   missing, present review candidates, or support an explicit owner-confirmed
   match workflow?
9. Should watched-only state appear as an undated history row, a compact
   “watched, date unknown” fact, or both?
10. Should current watchlist absence from a newer complete export immediately
    retire Queue membership, or should the UI retain a short audit/history view
    of source removal?

## Recommended implementation order after field choices

1. Project watchlist rows and complete-snapshot membership reconciliation,
   because Movies Queue is already an explicit product requirement.
2. Expand movie list/detail contracts to return existing canonical history,
   source-scale ratings, exported reviews, identities/source links, and precise
   date semantics without raw-object access.
3. Project selected recoverable facts—likes, rewatch flag, tags, and optionally
   lists/RSS review or poster—through addressable source records and replay.
4. Add synthetic regressions for Queue overlap/removal, repeated watches,
   changed dates/reviews/ratings, missing dates, ambiguous title/year joins,
   partial exports, and unavailable artwork.
5. Only after a TMDB credential and attribution/storage decision, probe one
   known-ID detail response and one search/match flow with content-free field
   inventories before finalizing enrichment schema.
6. Keep catalog failures non-fatal and run the full `pnpm check` after the final
   code or test change when implementation begins.

## Exact blockers and confidence

- **Letterboxd API:** blocked by both published project-exclusion policy and
  absent approved client credentials/integration. Confidence: high.
- **TMDB live enrichment:** blocked by absent API key/read token, binding, and
  client. Confidence: high.
- **OMDb live enrichment:** blocked by absent API key and client. Confidence:
  high.
- **RSS completeness:** known finite/public best-effort window with no
  tombstones or conditional validators. Confidence: high from live response;
  retention length is not contractual.
- **Export shape:** high confidence for the probed ZIP version; upstream CSV
  shape is not versioned as an API contract and must remain validated at parse
  time.
- **Public-page metadata:** deliberately not probed or scraped. Any future use
  requires explicit authorization and a revised source policy.

This research is sufficient to prepare decision prompts and a Movies field
matrix. It intentionally does not select the final collection fields, inspector
sections, filters, sorting, or enrichment adoption.
