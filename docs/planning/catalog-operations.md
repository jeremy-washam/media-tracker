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

## October 29 live activation and publication failure

Normal scheduling was enabled after schema migrations 0032–0034 and the verified
recovery point. Movies retained their completed earlier refresh: browser checks
showed current posters, directors and labeled viewing ratings. A manual current
TMDB check returned an empty completed job; this does not establish that the
hourly scheduler creates no empty job.

The YouTube job fetched **20,292 requested IDs: 18,695 returned, 1,597 omitted**,
with its durable cursor retained. Its final projection rebuild then hit
`D1 DB exceeded its CPU time limit and was reset` in real Worker logs at
23:09/23:10 UTC. Publication did not complete and no full-job acceptance was
claimed. At 23:17 UTC `CATALOG_AUTO_REFRESH=false` was deployed and verified in
the existing Worker and both protected GitHub environment configurations to stop
repeated attempts while fixing the expensive query. Browsing, source admission,
article work and the independent operating monitor remain enabled. No queue was
purged, no attempt count reset, and no provider response was fetched again for
this diagnostic. Native monitoring at 23:10:26 UTC remained open with a $5
estimate.

Cloudflare's [D1 debugging guidance](https://developers.cloudflare.com/d1/observability/debug-d1/)
and [limits](https://developers.cloudflare.com/d1/platform/limits/) confirm that
expensive queries/batches require less work rather than repeated retries or a
larger Worker CPU allowance. Catalog completion must retain atomic fenced
publication, current channel association/search and expiry behavior. A small
synthetic fixture alone does not establish production-scale completion.

Spotify source and catalog work both recorded HTTP 403; its account-side
eligibility/access check is tracked in the source rollout. At this failure
checkpoint, newly acquired article excerpt/FTS, duplicate delivery and subsequent
real hourly work still required live evidence. The 23:00 transition did not
produce an article reservation, so no successful article acquisition was inferred
from flags alone. The observed 00:00 pass and article acceptance are recorded
below.

### Publication repair and controlled retry

Catalog completion now retains the unchanged owner video/channel projections.
The same fenced atomic transaction still marks success, publishes staged
provider overlays, rebuilds current channel aggregates and search/expiry maps,
and advances publication revisions. Normal source ingestion still rebuilds its
owner projections. Its per-video product lookup uses the existing media-first
watch index rather than rescanning all music observations for every video.
No schema migration, higher CPU limit or larger provider allowance is required.

Regressions cover 20,000 synthetic videos, 4,000 provider-remapped channels,
24 MB of descriptions and 60,000 thumbnails, plus
owner history/search preservation, cursor invalidation, expiry fallback and
rollback after a late search-expiry failure. This validates the publication
shape rather than a production CPU guarantee. The controlled completion below
supplied native evidence without creating another job, resetting attempts or
refetching the completed video pages.

The final combined local gate passed `pnpm check` with **895 TypeScript / 147
Python tests**, production builds and **13 native Worker-runtime tests**. The
YouTube import fixture now loads the complete migration chain, matching the
current repository rather than omitting the existing media-first index.

### Native publication acceptance and restored scheduling

The ordinary protected main release passed validation, deployment and its six
summary checks at **23:56:29 UTC** on October 29. At **23:57:19 UTC**,
`CATALOG_AUTO_REFRESH=true` was restored consistently in the native Worker,
canonical configuration and both protected GitHub environments. The temporary
catalog hold is resolved; source admission, article work and the independent
operating monitor remained enabled throughout.

The existing YouTube job completed at **23:57:28 UTC**, on attempt 85. Its
counts remained **20,292 requested, 18,695 returned and 1,597 omitted**. The
committed pages were reused, with no additional provider fetch. The success
state, released lease, exact published job and channel aggregate revision were
verified durably after completion.

Seven read-only aggregate queries at 23:57:48 UTC reported zero writes and
confirmed all 20,292 current published profiles map to owner videos. All 18,695
available videos have current artwork, comprising 88,559 thumbnail variants;
16,921 profiles have descriptions. Provider search documents match their
published title/description/tag payloads and expiry, with no unmapped documents
or missing expiry mappings. Owner search covers all 20,292 videos. Before/after
owner and source counts, rollup totals and text-length aggregates match; this is
consistency evidence rather than a byte-for-byte audit of every source row.

Owner HTTP acceptance returned 200 for all 20 checks. Browser acceptance loaded
current video artwork, descriptions, history and channel panels, and a
description-only search returned the sampled video. These checks establish
successful native publication and sampled delivery; they do not establish that
every external image URL loads indefinitely.

### Observed hourly, maintenance and article acceptance

The real hourly cron completed successfully at **00:00:17 UTC on October 30**
on the restored normal configuration. Before/after observations at 23:59:34 and
00:02:03 UTC retained nine TMDB jobs with 1,414 requested IDs and nine YouTube
jobs with 40,584 requested IDs, with no active catalog jobs. This observed pass
created no empty refresh job. The independent five-minute maintenance cron
completed at **00:00:44 UTC** with zero failed operations.

All 20 reserved article acquisitions completed by 00:02:53 UTC: 20 jobs,
20 attempts and no recorded failures. At 00:05:12 UTC, all 20 manifests were
ready with full coverage, and all 251 chunks had their required FTS mappings.
The selected article's acquired text hash, all eight chunk checksums and search
mappings were verified. Owner text-only search returned its hydrated excerpt.

One completed article message was deliberately redelivered at **00:03:25 UTC**
with the ordinary queue idle before and after. The durable attempt count, raw
acquisition count, manifests, chunks and FTS metadata did not change; the
approximate dead-letter count remained three. In the controlled
00:03:23–00:04:16 UTC window, native Worker logs recorded one successful Queue
invocation with batch size one and one article-acquisition usage event reporting
one statement. This correlated window and unchanged durable state establish the
duplicate guard for the controlled replay. The success log does not identify
the exact message key. Unmeasured `first()` queries and a reported write count
of zero are not evidence that total database usage was measured as zero.

### Spotify owner action and remaining daily acceptance

The owner restored Spotify Premium and confirmed it active at **00:16 UTC**.
Spotify's [quota-mode guidance](https://developer.spotify.com/documentation/web-api/concepts/quota-modes)
and [development-mode migration guide](https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide)
require active owner Premium for development-mode API access. The first catalog
retry at **00:17:34 UTC** still failed with `spotify_http_403`, with zero requested
or returned records. The owner's screenshot confirmed Development Mode and a
Client ID matching the retained deployment input.

The owner then found the connected account missing from Users Management and
added it. One ordinary bounded catalog retry accepted at **00:27:38 UTC** fetched
and committed **25 requested / 25 returned / zero unavailable** tracks without
errors by **00:28:05 UTC**. Track-catalog API access is restored; this first batch
does not establish full backfill completion or saved-episode source access. The
job continues at its existing pace and limits. Existing configuration and
credentials were retained. No agent purchase, new app or reauthorization occurred.

PR 13's retained-retry correction was released on exact-main `8c89b445` at
**00:49:23.637 UTC**, with all validation and authenticated smoke checks passing.
A single source check at 00:50:02.561 saved six raw responses and 196 source
records before the validation client's timeout canceled the Worker at 00:51:01.926.
No cursor advanced. The original allocation remains exhausted and its unknown
usage conservatively accounted for; no second source request or allowance reset
was made. Guarded cleanup closed only the abandoned visible run at
**01:10:31.849 UTC**, with a repeated zero-write no-op. All partial evidence and
unknown admission usage remained intact. Full reconciliation next awaits the eligible queued cycle: fresh
admission at **15:07:56.391 UTC**, hourly dispatch at **16:00 UTC**, subject to gates.
The new hosted manual path enqueues existing source work and returns 202 without
binding execution to the requesting browser. Local sync still returns its final
200 result.

The independent operating monitor recovered successfully at **00:10:25 UTC**
with a fresh normal/open state, a $5 estimate and the native queue unpaused.
The observed hourly pass does not establish a later source reconciliation after
its daily/23-hour eligibility window; that genuinely eligible daily cycle remains
pending.
