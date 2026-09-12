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
- creates one movie for each row in `watched.csv`;
- creates a dated Archive occurrence for every Diary row;
- creates one undated occurrence for a watched film with no Diary row;
- retains Letterboxd film and Diary-entry URIs as separate identities; and
- skips reprocessing an identical export checksum.

Diary rows that cannot be joined to a watched film by exact title and year are
retained as unresolved source records instead of being silently merged. Ratings
remain on Letterboxd's 0.5–5 scale. Reviews attach to the matching Diary URI.

The current import limit is 25 MB. The export must contain `watched.csv`,
`diary.csv`, `ratings.csv`, and `reviews.csv`. Deletion reconciliation and
periodic export reminders remain future work.

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
plain-text reviews. A fresh export remains the authoritative way to reconcile
old edits, deletions, private activity, and watched-only films.
