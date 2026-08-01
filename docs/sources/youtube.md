# YouTube Source Reconnaissance

- Status: Private Takeout history and Watch Later probes complete
- Last verified: 2026-07-19
- Priority: Watched-video history first; Watch Later is future Queue evidence
- Sources: Official Google/YouTube documentation and private aggregate probes

## Executive assessment

YouTube supports a strong historical backfill but not seamless watch-history
sync through the ordinary YouTube Data API. Google Takeout provides timestamped
watch activity with video URLs, titles, channel links, and unavailable-video
records. It also exports Watch Later as a separate CSV.

The YouTube Data API deliberately returns empty Watch History and Watch Later
playlist results. OAuth therefore does not make those collections available.
The Data API remains useful for enriching known public video IDs with current
metadata. Google's Data Portability API can export YouTube My Activity, but its
sensitive scopes and verification requirements make it disproportionate for an
initial private, single-user connector.

Recommended integration shape:

1. Import each Google Takeout ZIP as a separate source snapshot.
2. Admit only activity cards whose action is exactly `Watched` to Archive.
3. Preserve every timestamped watch occurrence; do not collapse by video ID.
4. Preserve non-watch activity and unavailable rows as source evidence without
   admitting them as watched videos.
5. Import Watch Later independently as Queue evidence when Queue is implemented.
6. Enrich known public video IDs through `videos.list` later, without making
   metadata enrichment a prerequisite for preserving history.

Official references:

- [YouTube Data API revision history](https://developers.google.com/youtube/v3/revision_history)
- [YouTube Data API overview](https://developers.google.com/youtube/v3/getting-started)
- [YouTube OAuth guidance](https://developers.google.com/youtube/v3/guides/authentication)
- [Google Takeout help](https://support.google.com/accounts/answer/3024190)
- [My Activity export schema](https://developers.google.com/data-portability/schema-reference/my_activity)
- [Google Data Portability API](https://developers.google.com/data-portability)

## Source surfaces

| Surface                      | Historical reach                                                     | Incremental value                               | Main limitation                                        |
| ---------------------------- | -------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------ |
| Google Takeout watch history | Timestamped retained history for the selected Google account/channel | A later manual export can reconcile new watches | Manual snapshot; delivered HTML in the private exports |
| Google Takeout Watch Later   | Current Watch Later playlist with video ID and added timestamp       | Queue backfill                                  | Snapshot only; may contain already-watched videos      |
| YouTube Data API             | Public/current video and channel metadata                            | Enrich known video IDs                          | Watch History and Watch Later return empty results     |
| Google Data Portability API  | Programmatic export of `myactivity.youtube`                          | Potential recurring export                      | Sensitive scopes, verification, and policy overhead    |
| App-local viewing events     | Videos consumed through this application                             | Immediate and precise for local activity        | Cannot observe viewing elsewhere in YouTube            |

There is no ordinary YouTube watch-history webhook or cursor. Treat every
Takeout as an overlapping snapshot and retain its acquisition time and raw ZIP.

## Private Takeout observation

Two separate Takeout ZIPs were inspected. Both contained:

- `history/watch-history.html`;
- `history/search-history.html`;
- `playlists/Watch later-videos.csv`;
- subscription, channel, comment, and related account files.

Only watch history and Watch Later were parsed. Search history, comments, chats,
subscriptions, channel identity, and other private account material were not
printed or normalized.

### History A

- 4,486 activity cards total;
- 4,418 `Watched` occurrences;
- 4,410 watched occurrences with a video ID;
- 3,975 unique watched video IDs;
- 435 repeated watch occurrences beyond the unique-ID count;
- 8 watched rows without a usable video ID;
- 68 non-watch cards: 40 `Viewed`, 21 `Visited`, and 7 `Answered`;
- no missing parsed timestamps;
- UTC range 2023-07-31 through 2026-07-19.

### History B

- 19,483 activity cards total;
- 19,466 `Watched` occurrences;
- 19,458 watched occurrences with a video ID;
- 16,385 unique watched video IDs;
- 3,073 repeated watch occurrences beyond the unique-ID count;
- 8 watched rows without a usable video ID;
- 17 non-watch cards: 8 `Visited` and 9 `Answered`;
- no missing parsed timestamps;
- UTC range 2015-01-21 through 2026-07-11;
- one watched URL used the YouTube Music hostname.

### Combined implications

Across both source archives there are 23,884 watched occurrences and 20,228
unique video IDs. The histories share 132 video IDs, but they have zero exact
video-ID-plus-timestamp occurrence overlaps. They must remain separate source
connections: a shared video does not prove a duplicate watch.

The HTML file name is misleading: it includes `Viewed`, `Visited`, and
`Answered` activity cards alongside actual watches. Archive admission must test
the action, not merely the member filename or presence of a YouTube URL.

The Takeouts include no playback duration or completion percentage. For this
product, a timestamped `Watched` record is sufficient evidence of consumption,
not proof that the video was completed.

## HTML watch-history shape

The observed HTML repeats an `outer-cell` activity card containing a
`content-cell`. A typical watched card provides:

- direct text action such as `Watched`;
- first anchor: video title and watch URL;
- optional second anchor: channel title and URL;
- optional detail text;
- final direct text timestamp with a timezone abbreviation.

Unavailable or removed videos may have no video anchor or video ID. Preserve
their timestamp and raw card in source evidence; do not invent an identity from
display text.

The parser converts recognized `PST`, `PDT`, and `UTC` timestamps to UTC while
retaining the original string. Timestamp parsing failure must preserve the raw
value and surface an unresolved occurrence rather than substituting import time.

## Identities and repeated watches

The `v` query parameter in a YouTube or YouTube Music watch URL is the primary
external video identity. Retain the original URL and hostname as source facts.
Titles and channel names are mutable metadata, not identities.

Every `Watched` card is a distinct source occurrence. Repeated video IDs are
expected and support rewatches. A safe source occurrence key for one immutable
Takeout snapshot is the raw-object identity plus HTML card ordinal. A normalized
video-ID-plus-timestamp key is useful for comparing overlapping exports but must
not be assumed globally unique without testing later snapshots.

The two current Takeouts have no exact cross-archive event overlap, so no
cross-snapshot revision behavior has yet been measured.

## Watch Later and future Queue

The two Watch Later CSVs contain:

- 81 and 29 rows respectively;
- 110 distinct source rows total;
- no video ID present in both Watch Later exports;
- valid video IDs and added timestamps for every row;
- 18 and 23 video IDs respectively that also appear in that source's watched
  history.

Watch Later and Archive must be independent. A video may remain in Watch Later
after being watched, may have been queued for a rewatch, or may simply be stale.
Do not remove Queue intent merely because the video appears in Archive.

Because the YouTube Data API does not expose Watch Later contents, future
write-back should use a dedicated application-managed YouTube playlist if
bidirectional queue mirroring becomes important. That mutation work is deferred.

## Metadata enrichment

The Takeout contains historical titles and channel links for available rows.
Later, the connector can use the YouTube Data API to enrich batches of known
video IDs with current duration, publication time, thumbnails, channel identity,
availability, and other public metadata.

Enrichment is mutable and can fail for private, deleted, region-restricted, or
otherwise unavailable videos. Keep Takeout metadata and raw evidence even when
the current API cannot resolve an ID. Never let current metadata overwrite the
historical watched timestamp or source title without preserving both facts.

## Deletions and reconciliation

Takeout is a snapshot of retained Google activity. Users can delete or disable
watch history, and the export does not provide a tombstone feed. A row absent
from a later export may have been deleted, aged out, filtered, or omitted; do not
erase a previously imported Archive occurrence solely from snapshot absence.

Preserve each raw ZIP and parser version. Compare a future overlapping Takeout
before selecting a stable cross-export occurrence key or deletion policy.

## Credential-safe probe

The local probe accepts one or more ignored Takeout ZIPs:

```sh
pnpm --filter @media-tracker/connector-youtube probe:takeout -- \
  exports/takeout-one.zip exports/takeout-two.zip
```

It prints aggregate counts, action/product distributions, date ranges, repeated
occurrence counts, and Watch Later overlap. It does not print titles, channel
names, video IDs, search history, comments, account IDs, or raw HTML.

Synthetic tests cover watched, unavailable, repeated, overlapping, and Watch
Later shapes. Real Takeouts remain ignored and must never enter Git.

## Unresolved questions

1. Are the two Takeouts from separate Google accounts, Brand Accounts, or
   channels, and what stable non-email connection label should the UI use?
2. Does a later overlapping Takeout reproduce prior cards byte-for-byte and in
   the same order?
3. How are Shorts, live streams, premieres, private videos, deleted videos, ads,
   and embedded playback represented across older history?
4. Should non-watch actions ever support another product feature, or remain raw
   evidence only?
5. Is periodic manual Takeout import sufficient, or is Data Portability API
   verification worth revisiting later?
6. Should Queue mirror to a dedicated application playlist once write-back is
   implemented?

## Recommended next action

The historical and Queue payload shapes are sufficient for the initial schema.
Model YouTube video identity separately from timestamped watched occurrences and
source connections. Defer API credentials until metadata enrichment is
implemented; it does not block raw Takeout ingestion.
