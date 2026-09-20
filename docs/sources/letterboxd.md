# Letterboxd source reconnaissance

Last verified: 2026-09-12

## Status

Letterboxd can support a trustworthy movie-history ledger, but not through a
normal personal API integration. The practical design is:

1. use a user-generated account export for the authoritative backfill;
2. poll the member's official RSS feed for low-latency additions; and
3. periodically reconcile another export to recover edits, deletions, private
   activity, watched-without-diary records, and anything that aged out of RSS.

This is not fully seamless. Letterboxd explicitly says it is not currently
granting API access for private or personal projects, data analysis,
visualization, recommendations, or LLM/GPT-related uses. We should not build
against an assumption that this project will receive API credentials.

## Official source surfaces

| Surface            | Best use                                                                     | Important limitations                                                                                            |
| ------------------ | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Account export ZIP | Complete initial backfill and periodic reconciliation                        | User must generate/download it; current shape is verified but remains an upstream versioned contract             |
| Member RSS feed    | Polling recent public diary entries and reviews                              | Finite recent window; no tombstones; not a complete account snapshot; does not provide dependable watchlist sync |
| CSV importer       | Manual write-back of watched films, diary entries, lists, or watchlist items | Browser confirmation is required; imports are not an automatic bidirectional API                                 |
| Letterboxd API     | Not available to this app under the published access policy                  | Access is request-only and the stated exclusions directly cover this personal project                            |
| TMDB API           | Optional metadata enrichment after ingesting a Letterboxd/TMDB identity      | Separate service, credentials, terms, and provenance; it is not a source of the user's Letterboxd history        |

Letterboxd's [API access page](https://letterboxd.com/api-beta/) explicitly
directs members who need machine-readable account data to exports and RSS, and
recommends TMDB for general film metadata. The
[account export page](https://letterboxd.com/user/exportdata/) describes a ZIP
of CSV files containing profile, films, reviews, lists, and more, including
deleted content and reviews of deleted titles.

Do not scrape profile, diary, film, or watchlist HTML. Letterboxd's current
[terms](https://letterboxd.com/legal/terms-of-use/) prohibit automated gathering
or extraction except where explicitly authorized. Export, RSS, and the
documented importer are the supported surfaces for this project.

## Historical data and archive semantics

Letterboxd distinguishes two facts that both belong in this app's Archive:

- **Watched:** the member says they saw the film at some unknown time. It is a
  completed item, but it does not establish a consumption date.
- **Diary entry:** the member logged a particular viewing on a calendar date.
  Multiple diary entries for one film represent rewatches and must remain
  separate archive occurrences.

The [Letterboxd FAQ](https://letterboxd.com/about/faq/) confirms that watched
films are counted once while Diary entries count each individual viewing. It
also says the export contains the activity date for films merely marked
watched. That activity date is when the watched fact was recorded, not
necessarily when the film was consumed. It must not be presented as a watched
date.

For this product, both kinds of records mean `completed`:

- Diary record: `consumed_on = watchedDate`.
- Watched-only record: `consumed_on = null`; retain its source-recorded date
  separately.

Ratings, likes, reviews, tags, and the rewatch flag are attributes/evidence
associated with the watched film or a specific diary occurrence. They do not
require separate progress states. Letterboxd permits ratings on individual
diary entries to differ across rewatches, so per-occurrence ratings must not be
collapsed into only the current/default film rating.

## RSS payload observation

The member RSS endpoint is `https://letterboxd.com/{username}/rss/` and does not
require authentication for public activity. On 2026-07-18, a read-only probe of
the owner's public feed returned 64 items: 50 movie entries (`39` watch GUIDs
and `11` review GUIDs) plus `14` list entries. This is an observation of the
current feed, not a contractual retention guarantee. Two consecutive live polls
on the same date produced identical response and per-entry hashes with no added,
removed, or updated GUIDs, validating the poll comparison path. The 50 movie
entries covered watched dates from `2025-01-15` through `2026-07-12` and
represented 49 unique TMDB films, including two rewatch entries.

A movie item exposed these fields:

| Field                     | Meaning/use                                                                                                                               |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `title`                   | Display string containing film title, release year, rating symbols, and sometimes spoiler text; do not parse when structured fields exist |
| `link`                    | Member-specific film/diary or review URL                                                                                                  |
| `guid`                    | Entry identifier such as `letterboxd-watch-…` or `letterboxd-review-…`                                                                    |
| `pubDate`                 | RSS publication time with offset; this is not the viewing time                                                                            |
| `letterboxd:watchedDate`  | Viewing calendar date (`YYYY-MM-DD`)                                                                                                      |
| `letterboxd:rewatch`      | `Yes` or `No`                                                                                                                             |
| `letterboxd:filmTitle`    | Film title                                                                                                                                |
| `letterboxd:filmYear`     | Release year                                                                                                                              |
| `letterboxd:memberRating` | Optional rating on Letterboxd's 0.5–5 scale                                                                                               |
| `letterboxd:memberLike`   | `Yes` or `No`                                                                                                                             |
| `tmdb:movieId`            | Stable TMDB movie ID and preferred cross-source identity                                                                                  |
| `description`             | HTML containing a poster and either review text or a generated watched sentence                                                           |
| `dc:creator`              | Member display name                                                                                                                       |

The feed also contains list items with a `letterboxd-list-…` GUID and an HTML
description of some list contents. Lists are not part of the first movie-history
milestone and must be classified separately rather than mistaken for watched
films.

### RSS identity caveat

An unreviewed diary item uses a `letterboxd-watch-…` GUID while a reviewed item
uses a `letterboxd-review-…` GUID. We need to verify whether adding a review
later replaces the feed item's GUID. Until then, normalization should retain the
raw GUID but reconcile RSS records against export diary/review identities and
the combination of member, film identity, and watched date. It must not assume
the RSS GUID alone is the permanent diary-occurrence identity.

## Export payload observation

A private probe of an account export generated at `2026-07-19 03:31 UTC`
confirmed 31 CSV files and these primary shapes:

| File group                         | Confirmed fields                                                                                 |
| ---------------------------------- | ------------------------------------------------------------------------------------------------ |
| `watched.csv`                      | `Date`, `Name`, `Year`, `Letterboxd URI`                                                         |
| `ratings.csv`                      | Watched fields plus `Rating`                                                                     |
| `diary.csv`                        | Watched fields plus `Rating`, `Rewatch`, `Tags`, `Watched Date`                                  |
| `reviews.csv`                      | Diary fields plus `Review`; review text can span physical CSV lines                              |
| `watchlist.csv`, `likes/films.csv` | Same identity shape as watched films                                                             |
| `deleted/*`, `orphaned/*`          | Diary, review, and comment schemas partitioned by deletion/orphan state                          |
| `lists/*.csv`                      | `Letterboxd list export v7`, followed by list metadata and a separate positioned list-item table |

The probe found:

- `363` watched films;
- `211` Diary occurrences across `180` films, including `38` rewatch entries;
- `183` watched-only films with no Diary occurrence and therefore no trustworthy
  consumption date;
- `209` Diary occurrences with a per-occurrence rating;
- `355` current/default film ratings, `13` reviews, and `288` liked films;
- a Diary watched-date range from `2020-01-01` through `2026-07-12`;
- `309` watchlist items, including two exact title/year overlaps with watched
  films that need reconciliation rather than assumed automatic removal; and
- zero current deleted or orphaned rows, while the empty files confirm their
  schemas.

### Export identity split

The export revealed a critical distinction:

- `watched.csv`, `ratings.csv`, `likes/films.csv`, and `watchlist.csv` use the
  stable film-level Letterboxd URI.
- `diary.csv` and `reviews.csv` use a distinct Diary/review-entry URI. All 211
  Diary URIs differed from the film URIs, while all 13 review URIs matched a
  Diary URI.
- The export includes neither TMDB nor IMDb IDs. Within the export, a Diary
  entry can only be joined to its watched film by exact `Name + Year`.

The connector must retain both identities. Film-level records use the watched
URI; Archive occurrences use the Diary URI and link to the film through the
export's exact title/year pair. Ambiguities must be surfaced, not silently
merged. Recent RSS records add TMDB IDs, and later TMDB enrichment can improve
cross-source matching without replacing Letterboxd provenance.

The export also confirms that `Date` is source-recorded activity time while
Diary `Watched Date` is the date-only consumption fact. Keep both.

The real ZIP remains under the ignored `exports/` directory. Only field names,
aggregate results, and hand-authored synthetic fixtures enter Git.

The documented [CSV import format](https://letterboxd.com/about/importing-data/)
accepts `LetterboxdURI`, `tmdbID`, `imdbID`, `Title`, `Year`, `Directors`,
`Rating`, `Rating10`, `WatchedDate`, `Rewatch`, `Tags`, and `Review`. These are
useful write-back fields, but they are not identical to the observed export
schema.

## Incremental sync and checkpoints

Letterboxd supplies no cursor for RSS. A safe poller should:

1. fetch the complete current feed;
2. classify movie entries separately from lists;
3. preserve the raw response before normalization;
4. upsert every entry by observed source identity and content hash;
5. retain an overlap window instead of processing only entries newer than one
   timestamp; and
6. checkpoint the fetch time, newest/oldest observed `pubDate`, all current
   GUIDs, and response hash only after durable storage succeeds.

Always refetching the small feed makes edits within its window detectable.
Absence from RSS is never proof of deletion: an item may simply have aged out.
The 2026-07-18 response advertised `Cache-Control: no-store` and did not include
`ETag` or `Last-Modified`, so the connector currently needs its own response
hash rather than conditional-request validators.

No official RSS polling rate limit is published. Poll conservatively (an
initial 30–60 minute interval is sufficient for a personal tracker), honor
cache and retry headers, use backoff, and never parallelize feed requests.

## Deletions and reconciliation

RSS does not expose deletion tombstones. Letterboxd says account exports include
deleted content, but the FAQ also states that content deleted on or after
2024-05-01 is permanently removed from Letterboxd's servers no less than 30
days after deletion. Therefore:

- never erase local history because a source record disappears;
- represent a confirmed upstream deletion as source state while preserving the
  local historical occurrence and raw evidence; and
- if deleted-content reconciliation matters, a fresh export must be obtained
  within Letterboxd's retention period.

A periodic manual export is also the only supported way to reconcile watched
marks without Diary entries, old edits that have left the RSS window, and
private activity.

## Queue and write-back

Letterboxd supports a watchlist and its importer can add films to it. Watched or
logged films are automatically removed from the watchlist. Without approved API
access, however, automatic queue synchronization is not dependable:

- Reading the watchlist should come from a user export if it is present there;
  do not scrape watchlist HTML.
- Writing can be a user-confirmed generated CSV import in a later phase.
- Automatic add/remove operations should remain unsupported unless Letterboxd
  changes its API policy or grants this app access.

The read-only local Queue projection is therefore derived from the latest
successful complete export. It preserves an explicit watchlist membership even
when Archive history also exists. Local edits and automatic write-back remain
unsupported.

## Completeness assessment

| Requirement              | Assessment                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------ |
| Full history backfill    | Good through the verified account export shape                                       |
| Exact viewing dates      | Good for Diary entries; intentionally unknown for watched-only films                 |
| Rewatches                | Good through distinct Diary entries                                                  |
| Ratings/reviews/tags     | Strong; current film ratings and per-Diary ratings/reviews are distinct and verified |
| Near-real-time additions | Good for public Diary/review activity within the RSS window                          |
| Edits                    | Best effort in the current RSS window; otherwise periodic export reconciliation      |
| Deletions                | Export-only and time-sensitive; no RSS tombstones                                    |
| Private activity         | Export required; public RSS is insufficient                                          |
| Automatic watchlist sync | Not currently supported for this personal project                                    |

## Recommended next action

The replay-safe ZIP importer and hourly RSS reconciliation are implemented and
validated against the owner account. Keep requesting periodic exports to close
the RSS coverage gaps. The next Letterboxd-specific work should be driven by an
observed need for deletion reconciliation, review-text projection, or clearer
coverage reporting rather than additional integration machinery.

## Official references

- [API access policy](https://letterboxd.com/api-beta/)
- [Account export](https://letterboxd.com/user/exportdata/)
- [Letterboxd FAQ](https://letterboxd.com/about/faq/)
- [Importing data and CSV format](https://letterboxd.com/about/importing-data/)
- [Terms of use](https://letterboxd.com/legal/terms-of-use/)
- [Letterboxd API documentation](https://api-docs.letterboxd.com/)

## Implementation update — 2026-09-14

The correctness review and synthetic regression suite introduced the explicit
reconciliation and recovery policies in [ADR 0010](../decisions/0010-reconciliation-and-recovery.md).
This implementation update does not represent a new private payload probe or a
new verification of upstream API capabilities. See the connector README for
current behavior; earlier reconnaissance questions remain historical evidence.

## Library implementation update — 2026-09-20

Export parser v6 now builds the movie universe from watched, ratings, likes, and
watchlist files. It projects current film rating and liked state separately from
Diary occurrence ratings/reviews, preserves rewatch metadata, admits queue-only
movies, and reconciles watchlist removals only after a successful complete
snapshot. RSS parser v3 decodes nested title entities before matching. The
Movies Library exposes Archive and Queue through movie-specific collection,
detail, and History APIs and remains useful without TMDB configured.

The retained export still contains 670 unique film URIs across the four
film-level files and 309 watchlist memberships. An isolated parser-v6 replay
against a copy of the real local state produced 371 active Archive movies, 402
active viewing occurrences, 309 Queue movies, and three Archive/Queue overlaps.
Three legacy RSS/export duplicates were retired into their canonical same-day
occurrence without deleting source evidence. Raw owner rows remain ignored and
are not fixtures.
