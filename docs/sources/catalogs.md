# Media catalog reconnaissance

- Status: Research plus implemented TMDB/YouTube catalog caches and shared
  Spotify exact-ID backfill; additional provider recommendations remain proposals
- Last verified: 2026-09-21
- Implementation reviewed: 2026-10-12 against repository code and local Library
- Scope: Coverage across the six existing media types, search and identity matching,
  metadata/artwork, and API constraints
- Evidence: Official public documentation, existing repository source reports,
  and content-redacted live probes against samples from the owner's local data

## Recommendation

Use a small collection of catalogs. No evaluated provider covers all six types
with equally useful identities, metadata, artwork, and retention terms.

| App type          | Recommended starting point                                                           | Complement or fallback                                                                | Principal gap                                                            |
| ----------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `movie`           | TMDB                                                                                 | OMDb for IMDb-oriented lookups and additional ratings                                 | Older Letterboxd exports lack catalog IDs; ambiguous matches need review |
| `book`            | Hardcover for existing imports and search                                            | Open Library for work/edition identities; Google Books for additional volume metadata | Editions, translations, and covers need explicit matching                |
| `video`           | YouTube Data API                                                                     | Provider oEmbed, such as Vimeo, for known non-YouTube URLs                            | No universal video identity or complete historical availability          |
| `podcast_episode` | Spotify lookup for Spotify IDs; Podcast Index plus publisher RSS for open feeds      | Taddy for cross-catalog episode search; Apple for show lookup                         | Spotify-to-RSS episode matching is not a guaranteed crosswalk            |
| `article`         | Existing Reader metadata, RSS/Atom, and publisher metadata                           | Web search for discovery; Crossref/OpenAlex for scholarly material                    | No universal catalog for blogs, newsletters, news, and PDFs              |
| `song`            | Spotify lookup for imported track IDs; MusicBrainz for portable recording identities | Cover Art Archive; iTunes Search as a secondary store catalog                         | Recording, composition, release, and remaster are different entities     |

These are fit assessments, not measured coverage rankings. Books, movies, and
songs have useful catalog entities; video coverage is platform-specific;
podcasts need both show and episode identities; articles are primarily URL-based.
Music ingestion and Tracks/Albums/Artists browsing are implemented. Additional
portable catalog providers remain proposals.

Current production code includes conservative TMDB movie/TV identity matching,
expiring TMDB/YouTube caches and durable refresh jobs, and resumable Spotify
track/episode backfill. Catalog acquisition never creates owner history, and
browse API handlers never initiate a catalog-provider request. See
[ADR 0012](../decisions/0012-refreshable-provider-catalog-cache.md),
[ADR 0013](../decisions/0013-tmdb-letterboxd-match-evidence.md), and
[ADR 0014](../decisions/0014-spotify-catalog-retention-interim.md).
The remaining provider comparisons describe research, not installed connectors.
This local implementation review does not reverify provider policies or change
the September 21 research date.

## Movies

### TMDB — primary recommendation

**Coverage/search.** Film catalog with separate TV and person resources. Use movie
search for title/year candidates, direct lookup for known TMDB IDs, and
`/find/{external_id}` for an observed IMDb ID. Keep the resource type in the
identity namespace: a TMDB movie ID is not a TMDB TV ID. Search results are
candidates, not proof of a match. [Search workflow](https://developer.themoviedb.org/docs/search-and-query-for-details),
[external-ID lookup](https://developer.themoviedb.org/reference/find-by-id).

**Metadata/artwork.** Titles, synopsis, release information, genres, runtime,
credits, and related metadata; posters, backdrops, and logos with language
variants. Detail requests support appended subresources. This is the most direct
fit for rich film cards and inspectors.
[Movie details](https://developer.themoviedb.org/reference/movie-details),
[images](https://developer.themoviedb.org/reference/movie-images).

**Constraints.** Requires a developer credential. Noncommercial API use is free
with TMDB attribution, including its approved logo and required endorsement
disclaimer. The old 40-requests-per-10-seconds limit is obsolete; TMDB describes a
changeable upper limit around 40 requests/second and requires respecting `429`.
There is no SLA. Free API access does not imply ownership of artwork.
[FAQ and attribution](https://developer.themoviedb.org/docs/faq),
[rate limits](https://developer.themoviedb.org/docs/rate-limiting).

**App fit.** Recent Letterboxd RSS evidence can supply a TMDB ID directly. The
existing export probe found no TMDB/IMDb IDs, so unresolved historical films need
candidate search followed by an explicit match. Preserve the Letterboxd identity
and import evidence. See [Letterboxd reconnaissance](letterboxd.md).

**Implemented matching update, 2026-09-21.** [ADR 0013](../decisions/0013-tmdb-letterboxd-match-evidence.md)
records the bounded exact-title/year vote tie-break, exact alternative-title and
country-release-year verification, separate TV identity/profile lookup for
Letterboxd-logged series, and constrained RSS/export duplicate reconciliation.
The film export year remains the displayed source year even when TMDB's primary
display release year differs. Public Letterboxd film HTML is not scraped.

**Observed live contract, 2026-09-21.** A credentialed aggregate-only probe used
one exact RSS-supplied TMDB identity and five owner title/year samples. The exact
detail request returned `200` with details plus appended credits, external IDs,
images, and alternative titles. The observed detail payload exposed the expected
catalog fields, 24 cast rows, 42 crew rows, 33 backdrops, 28 posters, six logos,
and nine alternative titles for that sample. `belongs_to_collection` was null;
nullable and empty values remain ordinary outcomes. Configuration returned a
secure image base URL, seven poster sizes, and four backdrop sizes. All five
owner title/year searches returned exactly one candidate; a deliberately broad
control returned four and a fabricated control returned zero, confirming that
zero/one/many must remain distinct matcher outcomes. Successful responses
included `Cache-Control` and `ETag`, but no rate-limit headers. These counts
describe the sample, not provider-wide completeness.

### OMDb — optional supplement

Supports title search, title/year lookup, and IMDb-ID lookup for films and TV.
Responses include plot, credits, runtime, poster URL, and ratings where available.
An API key is required; the free tier allows 1,000 requests/day. The separate
high-resolution Poster API is patron-only. The site labels its content
CC BY-NC 4.0. It is a narrower enrichment option than TMDB, particularly useful
when an IMDb identity is already known; missing ratings and posters remain valid
outcomes. [API](https://www.omdbapi.com/),
[key and free allowance](https://www.omdbapi.com/apikey.aspx).

## Books

### Hardcover — first choice for the existing library

**Coverage/search.** Already matches the app's source library. GraphQL offers
book/author/series search backed by the site's search index, with pagination and
sorting. Search is distinct from exact GraphQL filtering; documented substring
operators such as `_ilike` are disabled. Use edition ISBN lookup when available,
then follow the edition's parent book. [Search](https://docs.hardcover.app/api/guides/searching/),
[edition lookup](https://docs.hardcover.app/api/graphql/schemas/editions/).

**Metadata/artwork.** Work-level descriptions, contributors, series, genres,
alternative titles, and covers; edition-level ISBN/ASIN, publisher, language,
format, release date, page count, audio duration, and cover. Preserve edition
details rather than assigning one edition's pages or cover to every edition.
[Books](https://docs.hardcover.app/api/graphql/schemas/books/),
[editions](https://docs.hardcover.app/api/graphql/schemas/editions/).

**Constraints.** Personal token, backend-only use, beta API. The official getting
started page documents 60 requests/minute, 30-second query timeout, depth 3, and
token resets/expiry. That page is dated 2025 and should not be treated as proof
that no additional account limits exist. Validate current account limits before
implementation. The repository already notes differences between generated
documentation and the actual schema. [Access and limits](https://docs.hardcover.app/api/getting-started/),
[existing source report](hardcover.md).

### Open Library — useful independent identity and cover fallback

Search by title, author, ISBN, and other bibliographic fields. Results connect
works and editions; retain `OL…W` work IDs separately from `OL…M` edition IDs.
Useful metadata includes authors, publication years, subjects, edition/language
information, and cover references. Missing or duplicate catalog records are a
reason to preserve uncertainty, not merge by title.
[Search API](https://openlibrary.org/dev/docs/api/search).

Public reads need no account key. Current guidance allows 1 request/second
unidentified or 3 requests/second with application/contact identification.
Cache appropriately, use low-volume human-facing lookups, and use data dumps
instead of harvesting the live API. Covers support ISBN, OLID, and CoverID;
lookups other than OLID/CoverID have a separate 100 requests/IP/5-minute limit.
Prefer returned cover IDs and handle missing images.
[Usage rules](https://openlibrary.org/developers/api),
[Covers API](https://openlibrary.org/dev/docs/api/covers).

The Internet Archive asserts no new rights over database material but explicitly
notes that existing rights can remain. Do not equate open bibliographic data with
unrestricted cover-image rights. [Licensing](https://openlibrary.org/developers/licensing).

### Google Books — additional volume coverage

Supports `intitle:`, `inauthor:`, `subject:`, and `isbn:` searches and direct
volume-ID lookup. Returns descriptions, authors, publisher, publication date,
ISBNs, categories, page count, language, cover links, and preview/access links
when available. Google volume IDs are provider identities, not universal work
IDs. Confirm the returned ISBN/edition before linking it to a Hardcover work.
[Search and lookup](https://developers.google.com/books/docs/v1/using),
[volume fields](https://developers.google.com/books/docs/v1/reference/volumes).

Public requests use an API key or access token; private library operations need
OAuth. Search uses `startIndex`, with at most 40 results per request. Availability
and previews can vary by location. Check the enabled project's actual quota;
this research did not establish a universal current daily allowance. Metadata
access does not grant full-book access. Treat cover/preview use as subject to
Google's applicable terms and branding, rather than a freely licensed asset feed.

## Videos

### YouTube Data API — primary for the app's video source

**Search/identity.** `search.list` discovers videos; `videos.list` retrieves known
video IDs. Prefer known IDs from Takeout or saved URLs and batch lookups. A
re-upload is a different video identity even if its title is identical. Deleted,
private, and restricted videos will leave gaps.
[Search](https://developers.google.com/youtube/v3/docs/search/list),
[video lookup](https://developers.google.com/youtube/v3/docs/videos/list).

**Metadata/artwork.** Title, description, channel identity, publication date,
thumbnails, duration, and relevant availability/status fields. Public metadata
uses a Google Cloud API key; account/private operations require OAuth. Metadata
lookup is not a general transcript-download service or a watch-history API.
[API overview](https://developers.google.com/youtube/v3/getting-started),
[existing source limitations](youtube.md).

**Current quota correction.** The documentation checked on this date gives
`search.list` its own default bucket of **100 calls/day**, at 1 unit/call, and
10,000 daily units shared by other ordinary endpoints; `videos.list` costs 1
unit. Each extra search page consumes another call. Check the project's console
allocation. Do not use the older model of 100 general-pool units per search.
[Current quota calculator](https://developers.google.com/youtube/v3/determine_quota_cost).

**Retention.** Public API metadata falls under the policy's temporary storage
rules: refresh or delete within 30 days. Keep catalog API caches separate from
owner-supplied Takeout evidence; do not put every enrichment response into an
indefinite immutable archive. This requires a specific retention design before
enrichment is implemented, not a silent change to existing ledger guarantees.
[Developer policies, III.E.4](https://developers.google.com/youtube/terms/developer-policies).

**Observed live contract, 2026-09-21.** A credentialed aggregate-only probe sent
50 known Takeout video IDs through one `videos.list` batch using
`snippet,contentDetails,status,liveStreamingDetails`. Forty-seven videos were
returned and three were omitted without per-ID error detail, so requested-item
outcomes must explicitly record returned versus unavailable. Every returned
video included title, description, channel identity/title, publication time,
thumbnails, category, live-broadcast state, duration, definition, caption flag,
projection, privacy, upload state, license, embeddability, and Made for Kids.
Tags appeared on 23/47, default audio language on 29/47, and region restrictions
on 3/47. No sampled row included `liveStreamingDetails`, confirming that an
absent requested part is normal.

The 47 videos referenced 40 distinct channels; all 40 returned from one
`channels.list` batch. Every channel included title, description, custom URL,
creation time, thumbnails, localization, related-playlist data, statistics,
privacy/link/upload status, and branding channel settings. Country appeared on
33/40, Made for Kids on 30/40, branding images on 39/40, and default language on
3/40. The US category request returned 32 categories with ID, title,
assignability, and channel identity. Successful responses exposed an `etag` in
the JSON envelope but no useful HTTP caching or quota headers; refresh age and
quota estimates therefore need application-owned tracking.

### Other video providers

For known Vimeo URLs, oEmbed returns embed information and related metadata,
including thumbnails. It is a URL-enrichment surface, not cross-platform search.
Vimeo's API has rate limits and `429` handling; no universal numeric allowance
was established here. Add provider-specific discovery only when actual library
coverage justifies it. [Vimeo tools](https://help.vimeo.com/hc/en-us/articles/12427681730577-Overview-Developer-Tools),
[rate limits](https://help.vimeo.com/hc/en-us/articles/12427783954065-Rate-limits).

## Podcast episodes

### Podcast Index plus publisher RSS — open-feed foundation

Podcast Index indexes public feeds. `/search/byterm` searches show title,
author, and owner, **not arbitrary episode text across the entire catalog**.
It supports feed lookup and episode retrieval by feed, provider ID, or episode
GUID plus feed identity. Responses include descriptions, dates, duration,
artwork, feed URLs, and enclosure URLs where supplied.

The main API uses a free key/secret, timestamped authorization hash, and
identifying User-Agent. Its official OpenAPI specification does not state a
numeric global request-rate guarantee; use conservative pacing and backoff.
The API's documentation license is not a blanket license to podcast audio or
artwork. [Official API specification](https://podcastindex-org.github.io/docs-api/pi_api.json),
[terms](https://github.com/Podcastindex-org/legal/blob/main/TermsOfService.md).

Use publisher RSS to inspect original episode GUIDs, dates, descriptions,
enclosures, and supplied artwork. Apple requires stable episode GUIDs, but our
matching rule should still scope a GUID to its feed: malformed or copied feeds
are possible. Feed migrations, truncated back catalogs, private feeds, and
platform exclusives prevent universal coverage.
[Publisher feed requirements](https://podcasters.apple.com/support/823-podcast-requirements).

### Spotify — direct lookup for Spotify-native identities

Use the imported episode URI/ID first. The episode endpoint supplies title,
description, show, publication date/precision, duration, language, explicit flag,
artwork, and Spotify links. Search supports `show` and `episode` types. A Spotify
episode ID does not automatically reveal an RSS GUID or feed URL; retain a
separate unresolved cross-source match when no authoritative mapping exists.
[Episode fields](https://developer.spotify.com/documentation/web-api/reference/get-an-episode),
[search](https://developer.spotify.com/documentation/web-api/reference/search).

Spotify access, caching, and quota constraints are shared with songs and covered
below. Public-feed sources are preferable for portable enrichment when the match
is established; Spotify lookup still matters for platform-only items.

### Taddy — strongest paid candidate to evaluate for episode search

GraphQL searches both shows and episodes, with exact-phrase/term matching and
filters for show, date, language, country, and genre. Search exposes provider
UUIDs and episode RSS GUIDs; retain both. Maximum search page size
is 25 and maximum page is 20. Metadata includes descriptions, dates, duration,
episode artwork, and media links, with optional transcript/chapter information.
[Search contract](https://taddy.org/developers/podcast-api/search),
[episode fields](https://taddy.org/developers/podcast-api/podcastepisode).

Taddy explicitly advertises server-side storage/caching rights. Current pricing:
500 requests/month free, $75/month for 100,000 requests, and $150/month for
350,000 requests plus webhook access. That makes the free tier worth evaluating
before deciding whether ongoing paid discovery is valuable. These are request
allowances, not confirmed burst-rate guarantees. Keys belong in the backend.
[Storage capability](https://taddy.org/developers),
[pricing](https://taddy.org/developers/pricing),
[authentication](https://taddy.org/developers/podcast-api/intro-to-taddy-podcast-api).

Storage permission covers API metadata; it does not permit mirroring the linked
audio, images, or video into our own R2 bucket. Taddy requires original hosted
URLs and honoring creator removal requests. Preserve that distinction in any
artwork/cache design. [Developer policy](https://taddy.org/terms-of-service/developer-policy).

### Apple/iTunes Search and Listen Notes — secondary options

**Apple/iTunes Search:** lightweight public show search and ID lookup. Its
archived documentation describes roughly 20 requests/minute and up to 200
results. Useful for locating a show, but do not assume comprehensive episode
search from the documented `podcast` entity. Promotional artwork has usage
conditions. Treat the old documentation as a reason to verify the exact response
contract before relying on it. [Search](https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/Searching.html),
[usage terms](https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/index.html).

**Listen Notes:** provides show and episode search with descriptions, dates,
duration, artwork, and audio links. However, Free/Pro prohibit server-side
prefetching, indexing, caching, or storage except IDs and publication dates.
Current Free allowance is 50 requests/month; Pro has a $200 base charge in months
with usage, including 5,000 requests. Enterprise has separately negotiated
storage terms. This is a poor default for our persistent ledger despite its
search capabilities. [Pricing, fields, attribution, and retention](https://www.listennotes.com/api/pricing/).

## Articles

### Reader, feeds, and publisher metadata — primary enrichment path

The app's article category includes web articles, RSS items, newsletters, and
PDFs. No evaluated general catalog spans those with a common authoritative ID.
Reader is a personal collection source; it is not a global article catalog.
Reuse metadata already imported through the existing connector.
[Reader source report](readwise.md).

For public content, feeds and publisher pages can provide title, author,
description, publication/modification date, canonical URL, and lead image.
Open Graph defines `og:url`, `og:title`, `og:image`, and article date/author
properties; Schema.org Article adds structured article metadata. Availability
is publisher-dependent, and an image URL does not convey redistribution rights.
[Open Graph](https://ogp.me/), [Article schema](https://schema.org/Article).

**Matching recommendation:** preserve the original URL, redirects, and publisher
canonical claim separately. Remove only known tracking parameters. Do not strip
all query strings or merge syndications, translations, newsletter editions, and
PDF revisions solely because their titles match. Use DOI identity for scholarly
works when present. Feed GUIDs and Reader document IDs retain their source scope.
Publisher fetching has per-site constraints; there is no single shared quota.

### Brave Search — discovery option with a retention condition

Web search finds articles beyond known subscriptions and returns URLs, titles,
snippets, and optional enriched metadata. Supports freshness/language filters,
20 results/page, and page offsets up to 9. These are discovery results rather
than stable article records or guaranteed full text.
[Web search](https://api-dashboard.search.brave.com/app/documentation/web-search).

Current Search pricing is $5/1,000 requests with $5 monthly credit and advertised
capacity of 50 queries/second. Requires an activated plan and subscription key.
The help page prohibits retaining API data without an appropriate agreement;
the product page likewise says storage requires explicitly granted rights.
Therefore, do not assume the standard plan can populate a durable candidate
database, including stored search-result payloads. Select terms that support the
intended retention or keep this as transient search. Third-party page rights are
separate. [Pricing](https://brave.com/search/api/),
[retention and access](https://api-dashboard.search.brave.com/documentation/resources/help-feedback).

### Crossref and OpenAlex — scholarly subset

**Crossref:** DOI-based lookup and bibliographic search for deposited scholarly
metadata: titles, contributors, publication information, identifiers, references,
and links where supplied. Not a blog/news index or a lead-image service. Public
access needs no key; identify the application and provide `mailto` for the polite
pool. Since December 2025, documented polite limits are 10 single-record
requests/second or 3 list/search requests/second, with concurrency 3. Public
limits are 5 and 1 respectively, concurrency 1; respect live response headers.
[REST API](https://www.crossref.org/documentation/retrieve-metadata/rest-api/),
[limits](https://www.crossref.org/blog/announcing-changes-to-rest-api-rate-limits/).

**OpenAlex:** scholarly work search and linked authors, topics, citations, and
access locations. Keep its work ID and DOI independently; do not assume every
record supplies an abstract, full text, or image. A free account/key currently
includes $1 of API usage/day; requests have differing costs. Current docs allow
basic keyless use with a smaller budget and describe a 100 requests/second hard
limit, up to 100 results/page, and cursor paging beyond 10,000 results. Old
claims of a universal 100,000 free calls/day are not the current pricing model.
[Works](https://help.openalex.org/data/works/),
[pricing](https://help.openalex.org/access/pricing/),
[authentication and limits](https://help.openalex.org/api/authentication/).

## Songs

### MusicBrainz plus Cover Art Archive — portable catalog recommendation

MusicBrainz distinguishes compositions, recordings, releases, and release
groups. Search recordings by title/artist, retrieve MBIDs directly, and use ISRC
lookup where an imported source supplies one. Metadata includes artist credits,
recording lengths, releases, dates, identifiers, and relationships. Model the
consumed recording separately from the composition and album release; a title
and performer alone do not distinguish live versions or remasters.
[API](https://musicbrainz.org/doc/MusicBrainz_API),
[search](https://musicbrainz.org/doc/MusicBrainz_API/Search).

Public reads require no authentication. Limit the client to 1 request/second
with a meaningful User-Agent; throttling can use `503`. Core data is CC0;
supplementary data has CC BY-NC-SA terms. This makes core metadata a useful
durable alternative to a streaming-service cache.
[Rate rules](https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting),
[data licenses](https://musicbrainz.org/doc/About/Data_License).

Cover Art Archive provides release/release-group artwork by MBID, including
front/back images and thumbnails. Select artwork for the actual release where
known; a recording itself is not a cover-art key. Missing art and redirects must
be handled. Its documentation currently states no rate-limiting rules, but that
is not an availability guarantee. MusicBrainz's core-data license does not apply
automatically to the artwork. [Cover Art Archive API](https://musicbrainz.org/doc/Cover_Art_Archive/API).

### Spotify — source-aligned lookup, with material API constraints

Track lookup provides artist/album information, duration, explicit flag, album
art, release-date precision, and external identifiers such as ISRC where
available. Search supports track/artist/album/year and ISRC filters. Market
availability and relinking can affect results; preserve the imported ID and any
observed replacement relationship. Do not assume one ISRC always yields one
unambiguous catalog candidate.
[Track fields](https://developer.spotify.com/documentation/web-api/reference/get-track),
[search filters](https://developer.spotify.com/documentation/web-api/reference/search).

Shared constraints for track and podcast lookup:

- API access uses access tokens; client credentials cover eligible public
  catalog operations, while personal data needs user authorization. Development
  mode requires the owner to have Premium and supports five allowlisted users.
  This fits the app's single-user scope. [Authorization](https://developer.spotify.com/documentation/web-api/tutorials/client-credentials-flow),
  [quota modes](https://developer.spotify.com/documentation/web-api/concepts/quota-modes).
- The February migration guide describes search limits of 10 and removal of
  batch-fetch endpoints for affected development apps. Spotify's March update
  postponed endpoint changes for existing integrations. Do not infer our exact
  app's capabilities from a generic reference page; verify its access mode and
  behavior. [Migration guide](https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide),
  [postponement notice](https://developer.spotify.com/blog/2026-02-06-update-on-developer-access-and-platform-security).
- July 23, 2026 raised the Client ID limit to 25 and made development quotas
  shared across the developer account. Quota exhaustion can report
  `reason: QUOTA_EXCEEDED`. Short-window rate limits are separate and use a
  rolling 30-second window without a published universal numeric allowance.
  [July update](https://developer.spotify.com/blog/2026-07-23-web-api-quota-updates),
  [rate limits](https://developer.spotify.com/documentation/web-api/concepts/rate-limits).
- Terms restrict metadata/art caching to temporary storage needed for the
  application; attribution and a link to the Spotify item are required. The
  policy also restricts analysis and ingestion of Spotify Content into AI
  models. Consequently, Spotify catalog responses should not be treated as an
  unrestricted permanent enrichment or future LLM dataset. This finding does
  not by itself determine the treatment of owner-provided exports.
  [Terms](https://developer.spotify.com/terms), [policy](https://developer.spotify.com/policy).

iTunes Search is another song/album search and lookup option using store IDs,
but its promotional-artwork conditions and older documentation make it a
secondary fallback rather than the foundation of a portable music catalog.
[Search types](https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/Searching.html),
[artwork conditions](https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/index.html).

## Matching and enrichment implications

These recommendations preserve [ADR 0009](../decisions/0009-canonical-ledger-identity-and-evidence.md)
and the [canonical ledger](../architecture/canonical-ledger.md); they do not
change them.

1. **Resolve known identities before searching.** TMDB/IMDb IDs, book/edition IDs,
   YouTube IDs, Spotify URIs, feed-scoped episode GUIDs, DOI, and recording MBIDs
   are stronger starting points than text.
2. **Separate candidate retrieval from accepted matches.** Store or display
   candidates only as the provider permits. A high search score, matching title,
   or matching title/year is not automatic cross-source identity proof.
3. **Match at the correct level.** ISBN identifies an edition; a podcast show ID
   does not identify an episode; album/release IDs do not identify a recording;
   a scholarly work and one particular PDF version can differ.
4. **Preserve provenance and uncertainty.** Record which source asserted an ID or
   field, when it was acquired, and why a mapping was accepted. Conflicting
   catalog data must not erase imported facts or create consumption events.
5. **Make enrichment retention provider-specific.** Before integration, resolve
   how expiring catalog caches coexist with immutable import evidence. Retain
   only permitted provenance outside an expiring payload. Any durable change to
   accepted storage rules needs its own design/ADR; this report does not approve
   one.
6. **Treat artwork as optional, sourced metadata.** Preserve source, URL, image
   role, dimensions/language when available, and attribution/refresh needs. An
   episode may have only show artwork; a book work may have several edition
   covers; an article may have no image. Never use artwork similarity as an ID.

## Remaining validation

The remaining uncertainties are specific rather than blockers to this research:

- Expand catalog hit-rate and field/artwork measurements beyond the initial
  five-movie and 50-video live samples: older/obscure films, translated books,
  removed videos, migrated or exclusive podcasts, newsletters/PDFs, and
  alternate recordings.
- Record exact-ID coverage separately from text-search candidates and accepted
  matches. No percentage claims about this owner's library are justified yet.
- Confirm Spotify app-specific endpoint access, Hardcover's current token/quota
  behavior, Google Books project quota, and Podcast Index/Taddy burst limits.
- Evaluate Taddy's free tier for episode-level search before paying for it.
- Resolve retention terms before any provider becomes a permanent enrichment
  source; distinguish metadata licenses from artwork and full-content rights.

The live probes read ignored local credentials and sent only provider-native
movie search facts or exact video identities to their respective APIs. Probe
output retained aggregate field/count observations only; credentials, titles,
provider identifiers, descriptions, and raw responses were not committed.
