# Letterboxd connector

Status: official reconnaissance, private account-export probe, and live RSS
polling probe complete. The application now imports account-export ZIPs into
the canonical Archive; RSS reconciliation remains to be implemented.

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
`diary.csv`, `ratings.csv`, and `reviews.csv`. RSS polling, deletion
reconciliation, and periodic export reminders remain future work.
