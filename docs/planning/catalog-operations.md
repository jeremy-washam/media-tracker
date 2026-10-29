# Catalog freshness and article processing

Implementation policy reviewed October 29, 2026. Activation and account-wide
spending controls belong to the deployment runbook and shared operating gate.
These are provider metadata jobs, separate from owner-history synchronization.

## Research and decisions

- [TMDB rate limits](https://developer.themoviedb.org/docs/rate-limiting) describe
  a changeable approximate 40-requests/second ceiling and require honoring 429.
  Sequential movie details and finite retries remain below bulk-scraping rates.
- [YouTube policy](https://developers.google.com/youtube/terms/developer-policies)
  requires stored non-authorized API data to be refreshed or deleted within 30
  days. The application uses application-key public metadata, not YouTube OAuth.
  [Quota accounting](https://developers.google.com/youtube/v3/determine_quota_cost)
  charges the selected list endpoints per request, including unsuccessful ones;
  exact-ID batches avoid search quota.
- [Spotify rate limits](https://developer.spotify.com/documentation/web-api/concepts/rate-limits)
  use a rolling 30-second window and 429 Retry-After. There is no universal fixed
  allowance to assume. [Developer terms](https://developer.spotify.com/terms)
  require reasonable freshness and temporary caching without a numeric TTL.
  The existing owner-approved [ADR 0014](../decisions/0014-spotify-catalog-retention-interim.md)
  still retains historical catalog response evidence indefinitely. Refreshing
  current normalized metadata does not resolve that recorded retention risk or
  silently authorize deleting raw listening/export evidence.
- [Reader's list API](https://readwise.io/reader_api) supports exact document
  HTML retrieval and documents 20 requests/minute per token, with Retry-After.
  Acquire only current Archive/Queue articles, not the complete Reader Feed.

## Scheduled behavior

`catalog-scheduler.ts` runs from the ordinary hourly source cron only after the
shared emergency-stop check. The frequent maintenance cron never schedules
provider work. Library reads never initiate provider calls.

| Work                               | Normal policy                                                                                                                    | Delivery bound                                                                                                             |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| TMDB movie/TV/configuration        | Refresh when missing or within seven days of the 30-day expiry; retry unresolved title matches after 90 days or a matcher change | 10 items, 128 HTTP requests including matching, 16 MiB response bytes                                                      |
| YouTube video/channel/category     | Refresh exact video IDs when missing or within seven days of expiry; publish only the complete fenced job                        | 250 videos, at most 12 list requests, 16 MiB response bytes                                                                |
| Spotify track/episode              | Refresh missing/error or observations at least 21 days old, including previously unavailable IDs                                 | 25 exact IDs, at most 26 HTTP requests including token refresh, 16 MiB response bytes; normally one minute between batches |
| Reader HTML                        | Reserve at most 20 current-source targets per scheduling call; stagger at six seconds per article                                | Three acquisition attempts per source version, at most three HTTP attempts per delivery; 8 MiB responses and 4 MiB HTML    |
| Article text indexing              | Continue from durable chunk ordinal; publish only a complete current-source manifest                                             | 12 chunks per delivery; extracted object at most 4 MiB                                                                     |
| YouTube physical cache maintenance | Existing five-minute cron, beginning two days before expiry                                                                      | 1,000 logical deletions per invocation; actual indexed writes measured separately                                          |

A current catalog is checked without creating an empty job or rebuilding its
projection. TMDB and YouTube use deterministic provider/day job IDs. Failed or
completed jobs are reused for that UTC day; active jobs resume their committed
cursor. Spotify scheduling similarly uses a provider/day job ID and resumes an
active job instead of creating another scan. Explicit Spotify backfill remains
an owner action with its own job ID.

A catalog job stops after eight reservations beyond its expected successful
batch count. Successful progress can span a large library without a lifetime
quota. This also bounds repeated timeouts, rejected responses and phase/cursor
loops. Retryable provider failures respect the existing bounded Retry-After
behavior. Terminal authentication/response errors and workload-limit failures
remain recorded, not represented as unavailable catalog IDs. Spotify has its own
bounded defer state and retains successfully committed partial results.

The scheduler does not renew grants, change flags, rotate credentials, or send
provider requests itself. Queue processing and scheduling both require the shared
operating gate. `CATALOG_AUTO_REFRESH=true` enables TMDB/YouTube scheduling;
`SPOTIFY_CATALOG_ENABLED=true` and `ARTICLE_CONTENT_ENABLED=true` enable the other
workflows when their existing credentials are configured. Turning any flag off
stops that work; the shared emergency stop provides the account-wide backstop.
No new paid catalog provider is introduced.

## Failure and recovery

- Catalog lease generations continue fencing all publication and state changes.
  A lost Queue send is recovered from the persisted cursor on the next hourly
  scheduling pass. A daily completed/failed job cannot be automatically reopened.
- Provider outages do not delete Archive/Queue entries or fabricate source facts.
  Four unmatched movies and an item without artwork remain ordinary outcomes.
- Article reservation is bounded in SQL and atomically claims the current source
  version. Completed or acquisition-exhausted duplicate deliveries do nothing.
  Missing/non-text/oversized content remains a recorded failure; a newer source
  version becomes independently eligible. Raw responses already acquired stay
  preserved. Indexing retries keep their durable ordinal and publication guard.
- Read-time expiry still hides expired YouTube overlays even if maintenance is
  paused. Monitor cleanup backlog and oldest deadline; a paused worker cannot
  promise timely physical removal without a later cleanup run.
- Spotify retention cleanup is deliberately not implemented by this change.
  Removing historical catalog raw objects requires superseding ADR 0014 and a
  reference-aware deletion design that protects authoritative listening data.

## Validation and release acceptance

Synthetic tests cover daily job reuse, cursor resume, paused flags, provider
failure isolation, refresh-before-expiry without future acquisition timestamps,
finite no-progress retries, article source-version allowance, and unavailable
Spotify retry pacing. Existing tests cover provider 429/terminal failures,
publication rollback, stale lease tokens, raw-before-parse and partial cursors.
Run `pnpm check` and the real Worker suite on the combined release.

Apply migration `0033_article_content_retry_after.sql` before deploying article
reservation/acquisition code; it adds the durable provider not-before timestamp.
Generic catalog backoff uses the existing pending-job lease timestamp and needs
no additional migration. A queue delay may be at most 12 hours, but the persisted
not-before deadline is never shortened to fit it.

Before live activation, inspect metadata-only counts and account allowances.
Enable one provider at a time under the operating gate; observe a complete job,
requested/returned/omitted counts, current poster coverage, safe errors, native
D1 usage and queue progress. Then verify a subsequent hourly pass creates no
empty refresh and that maintenance can run without a provider request. Reader
acceptance must inspect a newly acquired authorized excerpt and full-text search,
then repeat delivery to verify no duplicate acquisition. Never use owner payloads
or credentials in fixtures, logs, or CI.
