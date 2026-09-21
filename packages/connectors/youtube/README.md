# YouTube connector

Status: Google Takeout watch history, Watch Later, playlist-index coverage, and
subscriptions are implemented; the credentialed Data API probe is available.
Production Data API metadata enrichment and automatic history sync are not yet
available.

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

For the public metadata probe, add the restricted server-side key to the ignored
repository-root `.env.local`:

```dotenv
YOUTUBE_API_KEY=replace-with-your-youtube-data-api-key
```

After importing a real Takeout into the local D1 database, run:

```sh
pnpm --filter @media-tracker/connector-youtube probe:api
```

The probe batches 50 known video IDs, fetches their distinct channels, and loads
the US category catalog. It prints only response shapes, field/count coverage,
safe headers, and requested/returned totals. It never prints video IDs, channel
IDs, titles, descriptions, or raw payloads. Set `IMLADRIS_LOCAL_DB_PATH` only
when default Wrangler database discovery does not select the intended database.

The application import preserves the exact ZIP in private raw storage. It keeps
every watch-history card, Watch Later row, subscription, and supported playlist
index row as source evidence, but admits only
exact `Watched` cards with both a usable YouTube video ID and a parsed source
timestamp to Archive. Each snapshot retains its watch multiplicity. Overlapping exports match by
account, video, UTC timestamp, and occurrence rank at that timestamp; rewatches
within a snapshot remain distinct. Existing legacy occurrence IDs are reused. Reimporting the same ZIP into the same connection is
idempotent. A later snapshot does not imply deletion when an older card is
absent.

Normalization is resumable in D1-safe chunks of at most 100 source records.
The raw ZIP is stored once, later chunks read it from private storage, and the
next offset advances atomically with each committed chunk. Source records,
video identities, Archive occurrences, and evidence links use deterministic
IDs, so retrying an interrupted chunk cannot duplicate a watch.

Parser v5 records per-component completeness, strictly validates authoritative
snapshot identities and timestamps, projects Watch Later into the
generic provenance-bearing Queue, preserves exact Takeout channel IDs and
historical assertions, and maintains Takeout-backed Following relationships.
Only a complete Watch Later or subscription component may retire absent
same-connection state. Membership upserts are written in bounded D1 batches;
component completion and absence retirement happen only after all current rows
are durable.

Ordinary YouTube OAuth and the Data API cannot read watch history. Consequently
this connector has no scheduled reconciliation; additional history requires a
later Takeout import. A future Data API integration may enrich known video IDs
with current public metadata, but enrichment is not required for admission.

Parser v5 reprocesses a previously imported ZIP when it is uploaded again, adds
new source evidence, and reuses existing occurrences. This is an explicit
reconciliation policy, not a claim that Google supplies globally unique activity
IDs. Changed timestamps remain distinct evidence; never infer deletions from a
missing card. See ADR 0010 for the ambiguity policy.
