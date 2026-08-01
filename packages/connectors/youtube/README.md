# YouTube connector

Status: private Google Takeout watch-history and Watch Later probes complete;
Data API metadata enrichment pending.

This package owns Google Takeout parsing, watch-activity normalization, and
future YouTube Data API metadata enrichment. Google Data Portability remains a
deferred option rather than part of the initial connector. See the [YouTube
source reconnaissance](../../../docs/sources/youtube.md) for source capabilities,
private observations, and modeling implications.

Run the aggregate-only Takeout probe from the repository root:

```sh
pnpm --filter @media-tracker/connector-youtube probe:takeout -- \
  exports/takeout-one.zip exports/takeout-two.zip
```

The probe admits only `Watched` activity to its history summary. It separately
counts `Viewed`, `Visited`, and `Answered` cards; parses Watch Later; preserves
repeated watches; and reports overlap across source archives. It never prints
titles, channels, video IDs, searches, comments, account identifiers, or raw
HTML. Fixtures and tests are synthetic.
