# Letterboxd connector

Status: account-export backfill and hourly public RSS reconciliation are
implemented and validated against the owner account.

This package will own account-export backfill, best-effort RSS reconciliation,
and source-specific normalization. See the
[Letterboxd source reconnaissance](../../../docs/sources/letterboxd.md) for the
current capability assessment, field inventory, limitations, and probe plan.

Run the content-free export summary from the repository root:

```sh
pnpm --filter @media-tracker/connector-letterboxd probe:export -- exports/<letterboxd-export>.zip
```

Run two public RSS polls and compare their entry identities and hashes:

```sh
pnpm --filter @media-tracker/connector-letterboxd probe:rss -- <username>
```

## Archive import

In the running application, open **Connections** and choose **Import ZIP** for
Letterboxd. Upload the ZIP exactly as downloaded from Letterboxd. The Worker:

- preserves the exact ZIP in private R2 using its SHA-256 checksum;
- creates one movie for each unique film URI across watched, ratings, likes, and
  watchlist rows, including queue-only films;
- creates a dated Archive occurrence for every Diary row;
- creates one undated occurrence for a watched film with no Diary row;
- retains Letterboxd film and Diary-entry URIs as separate identities;
- projects current rating, liked state, rewatch metadata, and watchlist-derived
  Queue membership with source evidence; and
- skips only successfully processed exports under the current parser; failures retry.

Diary rows that cannot be joined to a watched film by exact title and year are
retained as unresolved source records instead of being silently merged. Ratings
remain on Letterboxd's 0.5–5 scale. Reviews attach to the matching Diary URI.

The current import limit is 25 MB. The export must contain `watched.csv`,
`diary.csv`, `ratings.csv`, `reviews.csv`, `likes/films.csv`, and
`watchlist.csv`. A successful complete export retires absent Queue memberships
and clears absent current likes/ratings without deleting Archive history.
Deletion-tombstone reconciliation and periodic export reminders remain future
work.

## RSS reconciliation

Set `LETTERBOXD_USERNAME` in the Worker's local or deployed configuration. The
hourly Cron Trigger and the manual **Sync now** action use the same poller. Each
poll stores the exact response in R2 and records an RSS checkpoint only after
successful processing.

Movie entries match existing data by authoritative TMDB identity, existing
Letterboxd Diary URI, or an unambiguous exact title/year plus watched-date match.
This handles the observed case where adding a review changes the feed GUID.
Ambiguous entries remain unresolved. Lists and other feed entries remain source
records but do not enter Archive. A response hash avoids reparsing an unchanged
feed, and an entry aging out is never interpreted as deletion.

RSS review bodies remain available in raw evidence but are not yet projected as
plain-text reviews. A fresh export supplies old edits, private activity, and watched-only films.
Deletion reconciliation is still deferred; importing a later ZIP does not
currently apply deletion tombstones.

Export parser v6 and RSS parser v4 reconcile in both acquisition orders. RSS
observations retain Diary URLs, consult stable occurrence keys before date
matching, and refresh the Movies browse/search projection before cursor
advancement, so additions and watched-date edits are visible immediately.
Export matching prefers known film and Diary identities. Nested RSS title
entities are decoded before matching; replay repairs the narrow legacy
title/year duplicate only when one proven RSS occurrence and one unique active
same-day occurrence evidenced by a Diary row in the current complete export and
the same connection provide the witness. Removed,
cross-connection, multiple-occurrence, and otherwise ambiguous candidates are
not merged. Rating/review nulls in full exports clear current canonical fields
while earlier raw evidence remains.
