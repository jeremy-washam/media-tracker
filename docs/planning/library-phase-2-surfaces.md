# Library Phase 2 surface specification

- Date: 2026-09-20
- Status: Owner review complete; Books, Letterboxd-backed Movies, and Readwise-backed Articles are shipped, and other media remain implementation baselines
- Scope: Exact production Library fields, sections, search, filters, sorts, and
  inspectors for all six media types
- Governing decisions: [Phase 1 decision register](library-phase-1-decisions.md)

## Purpose

This document converts the settled Phase 1 product semantics and the accepted
surface review into the production Library baseline. Visual density and minor
interaction details may be tuned against the implemented product, but the
fields, filters, sorts, local views, and inspector ownership below are the
starting contract.

The detailed implementation contracts contain field provenance, URL parameters,
HTTP response shapes, projections, indexes, pagination keys, acceptance cases,
and provider-policy requirements:

- [Books](research/books-phase-2-surfaces.md)
- [Articles](research/articles-phase-2-surfaces.md)
- [Movies](research/movies-phase-2-surfaces.md)
- [Podcasts](research/podcasts-phase-2-surfaces.md)
- [Music](research/music-phase-2-surfaces.md)
- [Videos](research/videos-phase-2-surfaces.md)

## Shared Library behavior

### Navigation and layouts

| Media    | Local views               | Collection presentation                       | Default      |
| -------- | ------------------------- | --------------------------------------------- | ------------ |
| Books    | Archive, Queue            | Cover grid or Readwise-style compact list     | Archive grid |
| Movies   | Archive, Queue            | Poster grid or compact list                   | Archive grid |
| Articles | Archive, Queue, Feed      | Compact rows only                             | Archive      |
| Podcasts | Archive, Queue, Following | Episode rows; Following show grid             | Archive      |
| Music    | Tracks, Albums, Artists   | Dense track table; album grid; artist list    | Tracks       |
| Videos   | Archive, Queue, Channels  | Video list or grid; activity-derived channels | Archive list |

Views represent different relationships or rollups. They do not create new
canonical media types. Archive and Queue remain independent. Podcast Following
never implies Archive or Queue. Music Albums/Artists and Video Channels are
activity-derived rollups, not canonical items or saved/followed claims.

### Collection rules

- Search, filters, sorts, counts, and pagination operate server-side across the
  complete matching collection.
- One item appears once in a collection. All supported occurrences remain in
  the inspector.
- Date filters match any qualifying occurrence. The row/card date and default
  date sort use the latest matching occurrence; the inspector still returns all
  history and marks matching entries.
- Media with repeated occurrences use the documented reference occurrence for
  collection display and occurrence-scoped filters. Books uses its latest
  supported read when several reads exist; History still returns every read.
- Unknown values are explicit filter options and sort after known values in
  both directions. Ingestion or observation time never fills a missing source
  date.
- A nonempty search makes Relevance the default sort. Clearing search restores
  the view's normal default unless another sort was explicitly selected.
- Counts use the same predicates as rows and are independent of loaded pages.
- Opening the inspector preserves filters, sort, loaded pages, selection, and
  scroll. Closing restores focus to the selected item or results heading.
- Query state is URL-addressable. Appearance and sidebar preferences are stored
  separately from Library query state.

### Inspector rules

- One compact right-hand inspector is the only item-detail level.
- Details and History are independently fetched from collection rows. Long
  histories and annotations use keyset pagination.
- Empty sections are omitted. Missing facts do not produce speculative badges,
  zero values, or decorative placeholder copy.
- Imported markup is sanitized; outbound links are validated and source-labeled.
- Ordinary details prioritize the owner's relationship to the item. Technical
  provenance is collapsed and does not compete with primary content.
- Current catalog metadata and immutable historical assertions remain distinct.
  Provider failure or expiry never hides local history.

## Books

Detailed contract: [Books Phase 2](research/books-phase-2-surfaces.md)

### Archive collection

Archive supports a sparse cover grid and a Readwise-style compact list. Grid
cards show only:

1. work-level cover;
2. title;
3. primary authors.

The list adds publication date and a compact latest-read line containing the
finished date and personal rating when present. It may show source-provided
series and position only when at least one result has series metadata. The grid
does not show finished date, format, rating, series, or status badges.

Header count: **N books · M supported reads**. Supported reads never expand to
the larger declared `read_count` when Hardcover lacks individual evidence.

### Queue collection

Queue contains current Hardcover Want to Read and Currently Reading
relationships until a supported completed read moves the work into Archive. It
uses the same sparse grid. The list adds publication date and **Added to
Hardcover** date.

Queue cards omit dates, format, progress, ratings, and community metadata. A
book may appear in both Archive and Queue only when the source relationships
independently support both.

### Books search

Searches title/subtitle, author names, other work and edition contributors,
series, ISBN-13, ISBN-10, and ASIN. Author search is required and must not depend
on a generic contributor label in the interface. It does not search
descriptions, reviews, community tags, content warnings, or raw source text.

### Books filters

| View    | Filters                                                                                                                           |
| ------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Archive | Format; Series; Genre; Finished date/unknown; Published date/unknown; Personal rating: rated, unrated, or minimum half-star value |
| Queue   | Format; Series; Genre; Added-to-Hardcover date/unknown; Published date/unknown                                                    |

Archive occurrence fields use the latest supported read. Queue format uses the
current selected edition only when Hardcover supplies it. Genre uses
source-labeled Hardcover community genre terms; Series is exact Hardcover
series identity. There is no All filter surface.

### Books sorts

| View    | Default                   | Additional sorts                                         |
| ------- | ------------------------- | -------------------------------------------------------- |
| Archive | Recently read             | Earliest read, Title, Author, Personal rating, Published |
| Queue   | Added to Hardcover—newest | Added oldest, Title, Author, Published                   |

### Books inspector

The header shows work cover, title/subtitle, authors, and factual Archive/Queue
membership labels.

Details sections:

1. **Overview:** description, publication date/year, work pages or audio
   duration.
2. **Series:** source-provided named series and exact position, only when
   present.
3. **Contributors:** authors followed by role-aware work contributors.
4. **Selected edition:** format, edition information, pages/duration,
   publisher, release date, language/country, ISBN/ASIN, contributors.
5. **Hardcover community:** community rating/count, genres, moods, pace, and
   collapsed content warnings.
6. **Source:** Hardcover link, freshness, coverage, and compact provenance.

History owns all personal activity: current/source status, date added, progress,
personal rating/review, supported reads newest first, started/finished dates,
consumed edition and format, and any declared-versus-supported read discrepancy.

Community field decision: Genres are navigable. Community rating, moods, pace,
and content warnings are inspector-only. Generic tags, activity/journals,
ratings distributions, and popularity counters are deferred.

## Articles

Detailed contract: [Articles Phase 2](research/articles-phase-2-surfaces.md)

### Shared row identity

Articles uses compact rows only. The restrained default contains:

1. 4:3 thumbnail or subtype glyph;
2. title;
3. author and publication;
4. the view-defining relationship fact and date.

An optional expanded density may add subtype, reading time, progress, published
date, and prior-Archive context. Tags never appear in the standard row.

Reader videos and podcasts route to their respective media types. Tweets,
EPUBs, notes, highlights, and unknown categories remain source evidence rather
than standalone Article rows.

### Archive row

After the identity block, show:

1. Reader reading-time estimate;
2. current Reader progress;
3. latest matching Reader Archive occurrence date, labeled **Archived** and
   marked inferred when applicable; and
4. **In Queue** or **In Feed** when another current relationship exists.

### Queue row

Queue combines Reader Inbox, Later, and Shortlist. Show:

1. Inbox, Later, or Shortlist state;
2. reading time;
3. current progress;
4. **Added** date from `saved_at`; and
5. **Archived before** when retained Archive history exists.

### Feed row

Feed is Reader's ambient subscription inventory, not Queue and not the future
recommendation Feed. Show:

1. reading time;
2. progress/opened state;
3. **Arrived** date from `saved_at`;
4. publication date; and
5. **Archived before** when applicable.

### Article progress and time

- `first_opened_at=null` plus zero progress: **Not opened**.
- Opened plus zero: **Opened · 0%**.
- Positive progress: rounded percentage.
- Missing/invalid: omitted in rows and shown as unavailable in Details.
- Reading time is parsed only from verified Reader estimate formats. Unknown or
  unparseable values never receive an invented duration.

### Articles search

Searches title, author, publication, imported summary, document notes, active
highlights/highlight notes, and selectively acquired authorized full text.
Matches outside the title may show a bounded labeled excerpt. Deleted or
discarded highlights, tags, and raw payloads are excluded from collection
search.

### Articles filters

Shared filters:

- Type;
- Author;
- Publication;
- Published date/unknown;
- Reading time buckets;
- Progress: Not opened, Opened at 0%, In progress, 100%, Unknown;

View-specific filters:

| View    | Filters                                                                              |
| ------- | ------------------------------------------------------------------------------------ |
| Archive | Archived date/unknown; current Reader state                                          |
| Queue   | Queue state: Inbox, Later, Shortlist; Added date/unknown; Archived before/no history |
| Feed    | Arrived date/unknown; Opened/not opened; Archived before/no history                  |

### Articles sorts

| View    | Default              | Additional sorts                                                 |
| ------- | -------------------- | ---------------------------------------------------------------- |
| Archive | Archived date—newest | Published, Date added, Title, Author, Publication, Reading time  |
| Queue   | Date added—newest    | Queue state, Published, Title, Author, Publication, Reading time |
| Feed    | Arrival date—newest  | Published, Title, Author, Publication, Reading time              |

### Articles inspector

The header shows thumbnail/subtype, title, author/publication, every current
relationship label, and separate **Open original** and **Open in Reader** links.

Details sections:

1. **Summary:** imported Reader summary, never presented as AI-generated.
2. **Article:** author, publication, published date, subtype, word count,
   reading time, progress, first opened, last opened.
3. **Tags:** every current Reader tag.
4. **Content:** Full text, Partial text, Highlights only, or Metadata only;
   acquisition source/date and errors.
5. **Source:** links, Added via, category, current location, date added, and last
   successful observation.

History contains complete retained Archive history, current Reader state, open
evidence, document notes, the active highlight count and keyset-paginated
highlight passages/notes, and collapsed provenance. A move away from Reader
Archive does not erase retained Archive history. Full article bodies are not
rendered in this delivery; acquired text supports search while reading remains
in the source.

## Movies

Detailed contract: [Movies Phase 2](research/movies-phase-2-surfaces.md)

### Collection presentation

Movies supports poster grid and compact list, with grid as the default.

Grid cards in both views show only:

1. poster;
2. title;
3. one compact release-year/director line when available.

Archive list adds Director, Last watched, and Your rating columns. Queue uses
Director, Added, and Your rating. Runtime, liked state, watch counts, reviews,
and Archive/Queue overlap remain available in filters or the inspector rather
than the standard collection row.

Current/default film rating and like are collection-level relationship facts.
Per-viewing ratings and reviews appear only on their History occurrences.

### Movies search

Searches imported/current/original/alternative titles, release year, directors,
top cast when projected, genres, and exported personal review text. It excludes
raw RSS HTML, list content, unaccepted TMDB candidates, and availability data.

### Movies filters

| View    | Filters                                                                            |
| ------- | ---------------------------------------------------------------------------------- |
| Archive | Watched date/unknown; Release year/unknown; Personal rating; Reviewed; Runtime     |
| Queue   | Added date/unknown; Release year/unknown; Personal rating; Archive status; Runtime |

Runtime remains hidden until TMDB enrichment supplies at least one usable
value. Liked, watch-frequency, and Genre filters are not exposed.

### Movies sorts

| View    | Default             | Additional sorts                                                                 |
| ------- | ------------------- | -------------------------------------------------------------------------------- |
| Archive | Watched date—newest | Watched date—oldest, Title, Release year, Personal rating, Most watched, Runtime |
| Queue   | Recently added      | Title, Release year, Personal rating, Runtime                                    |

### Movies inspector

The header shows poster, title/year, directors, runtime, current personal
rating, liked state, and Archive/Queue memberships.

Details sections:

1. **Overview:** synopsis, genres, differing original title, original language,
   release date, optional tagline/backdrop/countries.
2. **Your relationship:** current rating, liked state, watch count/latest date,
   unknown-date disclosure, Queue and added date, reviewed count.
3. **Credits:** all directors and up to five top-billed cast members.
4. **Sources:** Letterboxd, TMDB, IMDb links, history/metadata freshness,
   attribution, and compact provenance.

History shows every viewing with watched date/unknown, filter match, occurrence
rating, rewatch evidence, full exported review, Diary/review link, and compact
source evidence. It never moves a current rating or review onto another
occurrence.

### Movies enrichment boundary

TMDB supplies poster, current/original title, language, overview, release date,
runtime, genres, directors, and identities. Backdrop, tagline, five cast, rating,
and countries are optional. Ambiguous title/year matches remain unenriched.
Letterboxd tags, Lists, watch providers, trailers, recommendations, and person
pages are deferred.

Before implementation freezes this field set, a real credentialed TMDB probe
must verify known-ID detail, search matching, configuration/image behavior,
nullability, attribution, caching, and rate-limit behavior.

## Podcasts

Detailed contract: [Podcasts Phase 2](research/podcasts-phase-2-surfaces.md)

### Archive episode row

Show, in order:

1. episode/show artwork;
2. episode title;
3. show name;
4. latest matching activity: Spotify export, Reader Archive, or undated
   playback detection;
5. selected-period or lifetime Spotify observed listening time;
6. episode duration; and
7. Restricted, Unavailable, or Unknown only when relevant.

Archive never shows segment count, `fully_played`, resume position, saved state,
or “played N times.” One episode appears once regardless of segment count or
multiple source evidence.

### Queue episode row

Queue requires active saved membership, usable identity, explicit zero, and no
positive evidence anywhere. Show:

1. artwork;
2. episode title;
3. show name;
4. **Saved in Spotify** date;
5. publication date;
6. duration; and
7. non-available state when relevant.

Do not label explicit zero as unplayed or not started.

### Following show card

Following uses square cards showing artwork, show name, publisher, **Saved in
Spotify** date, catalog episode count, and non-available state. It does not show
an invented unheard count, newest episode, progress, or “up to date.”

### Podcasts search

Archive/Queue searches episode title, show name, retained source assertions,
and current publisher. Following searches show name and publisher. Descriptions
are deliberately not collection search targets because Spotify catalog content
is refreshable and constrained.

### Podcasts filters

| View      | Filters                                                                       |
| --------- | ----------------------------------------------------------------------------- |
| Archive   | Activity date/unknown; Show; Following state; Published; Duration             |
| Queue     | Saved date/unknown; Show; Following state; Published; Duration                |
| Following | Saved date/unknown; Publisher; Language; Library episodes: Archive/Queue/none |

### Podcasts sorts

| View      | Default              | Additional sorts                                |
| --------- | -------------------- | ----------------------------------------------- |
| Archive   | Activity date—newest | Observed time, Published, Duration, Title, Show |
| Queue     | Saved date—newest    | Published, Duration, Title, Show                |
| Following | Saved date—newest    | Show, Publisher, Episode count                  |

### Episode inspector

The header shows artwork, episode/show identity, Archive/Queue/Saved episode/
Followed show relationships, and source links.

Details sections:

1. **Listening:** lifetime observed time and observation count, first/latest
   dated segment, current resume/fully-played state and observation time,
   saved state/date, and export coverage warning.
2. **Episode:** description, publication, duration, explicit/language/external
   hosting, availability/restriction.
3. **Show:** show metadata, Following state/date, and exact-show links to
   Archive/Queue.
4. **Reader:** Reader relationship and links when applicable.
5. **Source:** identities, coverage, snapshots/polls/imports, cache state,
   attribution, and historical assertions.

History summarizes one Spotify playback relationship—first/latest segment,
total observed time, observation count—plus Reader Archive occurrences and
current Spotify state. It does not infer sessions or relistens. A collapsed,
paginated technical observation list may show timestamp, duration, safe
start/end reasons, and skipped state.

### Show inspector

Shows Following state/date, description/publisher/languages, catalog episode
count, exact Archive/Queue episode counts, availability, source, and relationship
history. It never lists the entire catalog or implies unheard episodes.

### Current-player polling

Hourly reconciliation and explicit Sync now poll current playback when the
scope/endpoint is available. Positive episode progress admits undated Archive
consumption and removes the episode from Queue. It does not add observed time,
manufacture a consumption timestamp, or create a Now Playing UI. Export and
saved snapshots remain the coverage fallback.

## Music

Detailed contract: [Music Phase 2](research/music-phase-2-surfaces.md)

### Membership and qualification

- Tracks contains one item per Spotify track URI with at least one qualifying
  playback.
- Export observations qualify at `ms_played >= 30,000`.
- Recently Played API events qualify immediately despite unavailable duration.
- Every qualifying and excluded observation remains traceable.
- API-only events increase playback count but contribute no observed duration
  until deterministic reconciliation with an export.
- The interface says **qualifying playback**, never completed listen or full
  play.

### Tracks table

Tracks is a dense, virtualized table showing:

1. optional small album art, title, and explicit marker;
2. ordered track artists;
3. album;
4. selected-period qualifying playback count, plus lifetime when filtered;
5. selected-period observed time, plus lifetime and duration-coverage note; and
6. latest matching playback instant.

Searches track, artist, album, ISRC, and exact Spotify identity.

Filters:

- period: All time, This year, Last 12 months, Custom;
- activity source: export or Recently Played;
- Spotify account;
- playback-count buckets;
- metadata coverage;
- exact artist;
- exact album; and
- explicit state.

Sorts: Recently played (default), Track, Artist, Album, Most playbacks, Most
observed time, and Relevance.

### Albums grid

Albums exists only for exact Spotify album identities linked to qualifying
tracks. Cards show:

1. square artwork;
2. album title;
3. ordered album artists;
4. unique tracks heard;
5. qualifying playback count and observed time; and
6. latest playback date.

Searches album/artist/identity. Filters use the shared period/source/account/
count/metadata facets plus exact Artist and Album type. Sorts: Most playbacks
(default), Recently played, Album, Artist, Tracks heard, Observed time,
Released, and Relevance.

### Artists list

Artists exists only for exact Spotify artist identities credited on qualifying
tracks. Rows show:

1. artist name;
2. unique tracks heard;
3. exact releases heard;
4. qualifying playback count;
5. observed time and duration coverage; and
6. latest playback date.

Searches artist/identity. Filters use period/source/account/count/metadata.
Sorts: Most playbacks (default), Recently played, Artist, Tracks heard, Releases
heard, Observed time, and Relevance.

Multi-artist tracks contribute to every credited artist; artist totals are
therefore not additive.

### Music counts

- Tracks: **N tracks · M qualifying playbacks · H observed**.
- Albums: **N albums · T tracks heard · M qualifying playbacks · H observed**.
- Artists: **N artists · T tracks heard · M qualifying playbacks · H observed**.

When any qualifying playback lacks duration, disclose that count. Also disclose
latest complete export, last recent-play poll, incomplete imports, unresolved
album/artist identities, and potential export/API overlap.

### Music inspector

Track Details sections:

1. **Listening:** period/lifetime counts, observed time, duration coverage,
   first/latest playback, export-backed/API-only/reconciled counts.
2. **Track:** duration, explicit state, track/disc number, release date, ISRC,
   original identity and relinking.
3. **Album:** exact release metadata and link to Album inspection.
4. **Artists:** ordered exact credits and Artist links.
5. **Source:** historical text differences, freshness, coverage,
   reconciliation, attribution.

Album and Artist inspectors show period/lifetime listening aggregates, bounded
top tracks/releases, exact identities, and coverage. “View all” navigates to
Tracks with the exact filter.

History shows qualifying occurrences newest first with timestamp, source,
duration availability, qualification rule, skipped state, current-period match,
and reconciliation. An **Excluded observations** mode exposes sub-30-second and
zero-duration export rows without inflating counts. Full history is keyset-
paginated; the browser never receives the entire export.

Saved-track/album state, followed artists, popularity, genre affinity,
MusicBrainz merging, lyrics/audio/previews, and audiobooks are deferred.

## Videos

Detailed contract: [Videos Phase 2](research/videos-phase-2-surfaces.md)

### Archive and Queue presentation

Archive and Queue support compact 16:9 list and grid presentations. List is the
default because the collection exceeds 20,000 unique videos.

Archive cards/rows show:

1. thumbnail;
2. title;
3. channel;
4. latest matching watch date/time;
5. matching/lifetime watch count; and
6. Queue overlap.

List additionally keeps Duration and Published visible when space permits.

Queue cards/rows show:

1. thumbnail;
2. title;
3. channel;
4. **Added to Watch Later** date/time;
5. account count when multiple relationships exist; and
6. Archive overlap/watch count.

Watching never removes Watch Later membership. Account-scoped relationships and
dates remain distinct even when one global video row represents them.

### Channels rollup

Channels contains every stable channel identity represented by imported Archive
or Queue video activity. It is analogous to Music Albums/Artists: a rollup over
Library evidence, not a subscription list or upload feed. Each row shows:

1. channel image and title;
2. distinct Archive video count;
3. personal view/watch occurrence count;
4. latest watched date; and
5. active Queue video count.

It does not add followed channels with no Library activity. It does not show
uploads, latest upload, new/unread counts, public view/subscriber counts, or
notification settings.

### Videos search

Archive/Queue searches current and historical video title, current and
historical channel title, custom URL, current description/category/tags, and
exact YouTube ID/URL. Channels searches current/historical channel title,
custom URL, description, and exact channel ID. It does not search arbitrary
uploads, comments, playlists, likes, transcripts, or expired API content.

### Videos filters

Shared video filters:

- Account;
- exact Channel identity;
- Published date/unknown;
- Duration buckets/unknown;
- Availability: available, unavailable, unchecked;
- exact source-backed Format: Live, Upcoming, Recorded live, YouTube Music;
  Shorts/Premiere remain unavailable until reliable evidence exists; and
- Category.

View-specific filters:

| View     | Filters                                                    |
| -------- | ---------------------------------------------------------- |
| Archive  | Watched date/unknown; Watches once/rewatched; Queue status |
| Queue    | Added-to-Watch-Later date/unknown; Archive status          |
| Channels | No filters in the initial surface                          |

### Videos sorts

| View     | Default          | Additional sorts                                  |
| -------- | ---------------- | ------------------------------------------------- |
| Archive  | Recently watched | Title, Channel, Most watched, Published, Duration |
| Queue    | Recently added   | Title, Channel, Published, Duration               |
| Channels | Most viewed      | Channel A–Z, Recently watched, Most queued        |

### Video inspector

The header shows thumbnail, title, channel, duration/publication, reliable live
and availability state, and Archive/Queue relationships.

It has three tabs:

1. **Details:** description, publication, duration, category, captions/
   definition/projection when useful, live schedule; relationship counts and
   every Watch Later account/date; availability/check time; source links,
   import/cache freshness, attribution, and compact provenance.
2. **Watch history:** every watch with time, account, historical title/channel
   differences, YouTube Music source, link, match marker, and evidence.
3. **Channel:** current channel facts and up to five
   recently watched videos and five queued videos already in Library. It never
   fetches arbitrary uploads.

### Channel inspector

The header shows channel image/title, custom URL,
watched-video/personal-view counts, and queued-video count.

Details contains About and Source. Library contains only Archive or
Queue videos already in the Library, with bounded pagination. Public subscriber,
view, and upload counts are omitted.

### Videos provider gates

- Public enrichment requires a restricted YouTube Data API key and a live,
  content-redacted probe of videos, channels, categories, missing IDs,
  nullability, batching, quota, caching, attribution, and policy expiry.
- OAuth and a Following surface are not required. Imported Takeout subscription
  rows remain retained source evidence but do not affect the Channels product surface.
- Likes, arbitrary playlists, Data Portability, transcripts, playback, upload
  feeds, popularity statistics, and heuristic Shorts/Premiere detection remain
  deferred.

## Implementation readiness

Owner review is complete. The real-data review artifact remains intentionally
separate from production and may evolve after implementation begins. Before
coding, synchronize each detailed contract with this accepted baseline and use
sanitized fixtures for automated tests. TMDB and YouTube credentialed probes
remain additive provider gates; their absence must not block honest local-only
Library rendering.
