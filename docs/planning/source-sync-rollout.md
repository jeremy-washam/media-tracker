# Hosted source sync

## Current closeout policy — October 29, 2026

This section supersedes the initial expiring-grant rollout instructions. The
owner approved normal scheduled operation with protection against runaway bills:
warn near **$10 total/month**, pause near **$25 total/month**, including the existing
$5 Workers subscription. These are operational targets, not a guaranteed invoice
cap; native analytics arrive with delay and existing storage/subscription charges
continue while paused. The shared operating monitor and emergency switch own the
spending backstop. Each provider still has ordinary finite work limits.

`SYNC_ENABLED` and the explicit `SYNC_SOURCES` allowlist determine enabled sources.
Routine sync no longer depends on `SYNC_BUDGET_UNTIL`, grant renewal, or a lifetime
allocation. Legacy grant fields are compatibility settings, not active permission.
A new daily allocation requires a new UTC day and at least 23 hours since its
previous admission. Historical admissions and uncertain usage remain retained.
A rolling 24-hour source guard stops abnormal aggregate work at 100 admissions,
10 million observed/reserved writes, or 1 billion observed/reserved reads. This
operational guard is separate from account-wide billing measurement.

The global 20-minute lease serializes HTTP and queue source invocations. Every
provider request checks the shared pause switch; jobs retain the 10-minute
invocation deadline, 30-second request timeout, redirect rejection, and 8 MiB
individual-response ceiling. Record/page checks stop at 1 million observed writes,
100 million observed reads, or the 3 GB database review threshold. One operation
may cross a threshold before the next check. Finite source limits are:

| Source     | Requests | Parsed pages | Records, including children | Response bytes |
| ---------- | -------: | -----------: | --------------------------: | -------------: |
| Letterboxd |        2 |            1 |                         500 |          4 MiB |
| Hardcover  |      128 |           64 |                       7,000 |         32 MiB |
| Readwise   |       64 |           32 |                      10,000 |         16 MiB |
| Spotify    |       32 |           24 |                       1,000 |          8 MiB |

These are per-allocation engineering ceilings, not spending targets. Known
continuations and failed retries subtract cumulative provider/database usage;
restarting does not replenish an allocation. Failed database operations,
unmeasured statements, and unknown in-flight work retain conservative accounting.
Routine daily allocations do not erase previous evidence or unknown work.

## Hardcover continuation and crash recovery

Apply migrations **0032** (Hardcover progress) and **0034** (snapshot-bound recovery
and cooldowns) before deploying dependent code. Hosted HTTP and queue processing
commit one 50-book library page per invocation under the same durable snapshot
run. Only the final complete scan retires absence and advances `library-books`.
Execution progress lives in `hardcover_sync_progress`; completed sync cursors
still reject running runs.

The admission records the exact snapshot run ID, and can continue only that
pending progress. A committed `library-books` cursor takes precedence over a
missing convenience completion marker. Known pending progress cannot receive a
fresh daily budget just because midnight passed. The worker sends its next page
before acknowledging the current message; hourly scheduling recovers a lost
continuation enqueue. The lease is released between pages so other sources can
run.

Every retry/continuation claim durably marks usage in flight. A crash before
usage persistence makes that attempt uncertain: no immediate resume refunds its
budget. The prior reservation remains retained, and the next eligible daily
allocation may resume the durable page checkpoint. Repeated failures are bounded
to two retries per allocation independently of successful page continuations;
Hardcover has a maximum of 96 claimed invocations. Exhausted provider limits or
attempt ceilings explicitly fail that day's admission and visible run instead
of creating hourly no-op messages. The checkpoint survives for the next daily
allocation. Checkpoint-only finalization can complete without more provider
allowance when the scan itself was already durable.

## Provider cooldown and diagnostics

Migration 0034 retains `retry_not_before` across retries and UTC days. Request
eligibility and claims honor the provider's numeric or HTTP-date `Retry-After`,
even when it extends beyond tomorrow. Spotify optional reads stop immediately on
429 so another surface cannot bypass the cooldown. Safe operation/status/delay
classification is persisted; free-form provider error messages and tokens are
not logged. No old generic `SpotifyApiError` record proves its historical cause.

Source failures remain visible in Connections. Provider failures acknowledge the
current queue message; the next eligible daily run or explicitly requested
bounded retry observes the cooldown. Lease contention alone requests delayed
redelivery. One queue consumer uses batch size 1, concurrency 1, and finite
transport retries; browsing never starts provider work.

## Credential ownership and remaining acceptance

Hosted Spotify owns the encrypted rotating credential store. Local source sync
and its local refresh secret remain paused to avoid races between independent
databases. Request reauthorization only when a real safe diagnostic establishes
that it is needed; do not replace a working token to investigate a generic error.

Readwise covers Reader documents/highlights, Hardcover covers book relationships
and reads, and Letterboxd RSS covers recent public activity. Full Letterboxd
exports, Spotify Extended Streaming History, and YouTube Takeout remain supported
manual-history workflows because provider polling does not supply complete
history. Article processing and catalog scheduling have their own bounded
activation policy under the same shared operating monitor.

Before declaring deployment closeout complete: run Hardcover through every page
and finalization, diagnose/recover Spotify using the hosted credential owner,
verify retained cursors/evidence and canonical idempotency, then observe a
subsequent scheduled run for each enabled source. Record actual production
outcomes after integrated deployment; synthetic regressions alone do not close
these live gates.

## Live closeout evidence — October 29, 2026

Main `9a6a877` is deployed in normal operation after the protected migration
release applied 0032–0034. All 34 migration names, ownership/retry columns and
zero foreign-key violations were verified. Native queue delivery is open and
the serial consumer is attached. These are live configuration checks, not a
claim that every provider has passed its next eligible daily cycle.

Hardcover's one controlled snapshot completed **23 pages / 1,112 source records /
128 normalized records / zero failed records**. Scan and finalization markers
are complete; the `library-books` cursor committed at **23:04:25.695 UTC**.
Letterboxd and Readwise already succeeded in today's admissions. Additional
acceptance messages correctly did not allocate a second daily fetch.

Spotify's explicitly bounded retry refreshed its hosted token successfully and
then failed `saved_episodes` with **HTTP 403**. Do not replace the grant or reset
its allowance blindly. Existing encrypted credential metadata does not retain
actual scopes or Spotify account eligibility. Check the matching existing app's
status, owner Premium eligibility and exact authorized account in Users
Management. Spotify documents that an unallowlisted account may authenticate
successfully but receive API 403; eligibility is a possibility, not a confirmed
cause. `user-library-read` authorizes saved-library access;
`user-read-playback-position` supplies resume data and its absence alone does not
establish the 403 cause. See [quota modes](https://developer.spotify.com/documentation/web-api/concepts/quota-modes),
[saved episodes](https://developer.spotify.com/documentation/web-api/reference/get-users-saved-episodes)
and the [February changes](https://developer.spotify.com/documentation/web-api/references/changes/february-2026).
The developer dashboard is signed out; owner account input is pending. No new
app, subscription, reauthorization or credential change was made.

The reviewed legacy October 17 Hardcover and October 28 Spotify source runs had
no active lease, progress, snapshot admission, catalog role or committed cursor.
The guarded operator repair closed exactly those two abandoned rows with an
interruption diagnostic and observed closure time. A repeat was a verified
zero-write no-op. Counts, evidence and admission accounting were retained; the
completed October 29 Hardcover snapshot was untouched. Connections now shows
that snapshot as succeeded and the abandoned Spotify run as interrupted rather
than polling it indefinitely as running.

Full source closeout remains subject to the acceptance requirements above,
including actual subsequent eligible scheduled runs. Local clocks and same-day
duplicate jobs do not establish that daily soak.

## Historical rollout evidence

The following dated sections describe prior deployments and the retired grant
model. Their old activation flags, expirations, and paused-source instructions
are historical evidence, not the current operating policy above.

## Controlled validation on October 17, 2026

Letterboxd (67 feed entries), Readwise (1,123 parsed records), and Spotify
(212 parsed records, including credential refresh) completed hosted runs.
Local sync is paused and its Spotify refresh secret is blank so the two
independent databases cannot race token rotation; local browsing remains healthy.

Hardcover exposed an upstream work-ID change, now covered by stable-relationship
and alias-ownership regressions. A later invocation durably processed 900 books
across 18 pages but was interrupted before finalization. Its admission remains
running with its full reservation retained; no complete-snapshot cursor advanced.
Keep Hardcover outside the production allowlist until the interruption is
explained and a complete controlled run succeeds. Retained Worker-log queries
currently return HTTP 403 with the available credentials.

Daily activation covers only the three validated sources. The explicit grant
expires on November 13 at 00:00 UTC, or earlier if the lifetime allocation or
storage review threshold is reached. Optional content, catalog, maintenance,
and manual history-import work stays paused. The grant does not renew itself.

## October 29 cost review and bounded Movies restoration

Account-wide analytics from October 14 through the October 29 review showed
18,372,450 D1 rows written and 144,580,071 rows read, against included monthly
allowances of 50 million and 25 billion. The database occupied about 1.19 GB
of the included 5 GB. Workers reported 56,096 requests and 124,852 CPU milliseconds;
R2 Standard occupied 237 MB, with about 17,400 Class A and 55,200 Class B operations.
Queues reported 127 billable operations. These figures indicate no usage overage
beyond the already approved $5 Workers subscription. They are usage estimates,
not an invoice: both subscription/history billing endpoints reject OAuth and
require a Billing Read API token. Historical adaptive sampling can omit usage;
the earlier conservative transfer envelope (6 million CPU milliseconds,
60,000 Class A and 960,000 Class B operations) also remains within allowances.

The Movies poster gap is cache expiry: 669 matched movie/TV profiles and the image
configuration expired on October 21 while catalog work was paused. Restoring
Movies uses a separate, finite grant; `CATALOG_AUTO_REFRESH=false` stays in place.
`TMDB_CATALOG_JOB_ID` names exactly one durable TMDB refresh job and
`TMDB_CATALOG_UNTIL` must expire inside the reviewed source window, within 32 days.
The hourly schedule resumes that job only; it never creates another catalog job.
No other TMDB job or YouTube, Spotify, or article-content backlog is activated.
Established matches refresh directly while retaining their original match method.
Exact source TMDB and IMDb identities take precedence over those cached matches,
including older TV matches, as required by ADR 0013.
Known movie matches refresh by their stored TMDB identity without repeating title
search; their original match method remains unchanged. New exact source identities
still take precedence over a cached movie match.

Each ten-item batch reserves one of at most 80 durable attempts, including failed
requests, crashes, and lease recovery. Each attempt permits 128 provider requests,
16 MiB of responses, a ten-minute deadline, and no more than 1,000 statements in
one persistence batch. Native D1 metadata is checked between operations, including
mutation `first()` calls. Work stops at 50,000 observed writes, 50 million reads,
unmeasurable usage, or the 3 GB storage review threshold. One SQL operation may
cross a threshold before the next check. The review allocates 200,000 writes and
100 million reads per attempt, or 16 million writes and 8 billion reads for the
whole grant, leaving headroom for that operation and the remaining source grant.
With the existing 30,000 ms CPU limit, 80 attempts reserve at most 2.4 million CPU
milliseconds. These are engineering allocations, not a Cloudflare dollar cap.
Changing the job ID or renewing expiry requires another account-wide review.

Deployment must include both the existing source-sync admission migration `0030`
and the newer catalog-fence migration, renumbered `0031`. Never deploy main-only
code that removes the current source grants. The QA chat owns the combined
migration/deployment window; this grant remains inactive until its reviewed job
is created, configured, and the combined Worker is verified. Record the final
job, deployed revision, measured usage and poster coverage before calling the
restoration complete. TMDB's noncommercial API is free with attribution; no new
paid service or artwork storage is part of this activation.

Pricing references: [Workers](https://developers.cloudflare.com/workers/platform/pricing/),
[D1](https://developers.cloudflare.com/d1/platform/pricing/),
[R2](https://developers.cloudflare.com/r2/pricing/),
[Queues](https://developers.cloudflare.com/queues/platform/pricing/), and
[TMDB](https://developer.themoviedb.org/docs/faq).

### Activation handoff for the combined release

1. Recheck account-wide usage and preserve the current production resources,
   Access checks, owner, secret bindings, source allowlist, hourly cron and serial
   consumer. Carry the protected ignored `apps/api/wrangler.production.jsonc`
   from the storage-efficiency worktree into the isolated release worktree;
   never commit it or copy secrets into command arguments. The existing private
   deployment settings file identifies the same account/database. Do not run the
   old source-activation helper: it changes source windows and schedules.
2. Merge the source admission history, audit hardening (`0031`), ratings, and
   this bounded-grant change. Run the combined checks and intended production
   dry run on the exact release revision before any hosted change. Save a fresh
   D1 recovery bookmark, apply only unapplied migrations, and deploy with the two
   TMDB grant variables initially empty. Check that the existing source flags and Access
   denial still work before activating anything.
3. Generate one ULID. Query `catalog_refresh_jobs` for an active TMDB job first;
   stop for review if there is one. Create the reviewed job with `provider=tmdb`,
   `state=pending`, a null cursor, zero attempts/counts/quota, and current
   creation/update timestamps. Use an idempotent `INSERT OR IGNORE` for that
   exact ID and read it back. This is the durable catalog admission; it does
   not claim a source-sync reservation or start provider traffic. Preserve that
   row and its attempt count throughout recovery.
4. Set `TMDB_CATALOG_JOB_ID` to that exact ID and `TMDB_CATALOG_UNTIL` to
   **2026-11-13T00:00:00Z**, preserving `SYNC_BUDGET_UNTIL` at the same existing
   expiry, all source settings, and `CATALOG_AUTO_REFRESH=false`. The catalog
   allocation is at most 80 attempts / 16 million reserved writes / 8 billion
   reserved reads / 2.4 million CPU milliseconds; it does not renew itself.
5. The hourly cron will resume the admitted job. For immediate dispatch, push
   exactly one JSON message to the existing sync queue:
   `{ "operation":"refresh_tmdb_catalog", "source":"tmdb", "catalogJobId":"<reviewed ULID>", "catalogCursor":"", "idempotencyKey":"catalog:tmdb:<reviewed ULID>" }`.
   The Cloudflare queue API uses `{ "body": <that object>, "content_type":"json" }`.
   Native endpoint permissions are Queues Write or Workers Scripts Write.
   The queue continuation advances only from the persisted cursor; duplicate
   deliveries do not reserve the same cursor while its lease is held.
6. Query only aggregate job counts, current native usage and poster coverage.
   Record completion plus native D1/Worker usage before reporting success. If a
   job fails, inspect its safe error and committed cursor; do not zero attempts,
   replace its ID, or create another grant to work around a stop. Transport/lease
   recovery uses the same job and remaining attempts. A failed job requires
   explicit diagnosis before resuming it; normal hourly scheduling resumes only
   pending/running jobs.
7. Clear both TMDB grant variables to stop new attempts. An already running
   invocation retains its original bindings and can finish its bounded work;
   clearing configuration cannot cancel it instantly. Expiry and the 80-attempt
   ceiling also stop new work. Queued messages remain recoverable; do not purge
   source or catalog evidence. Review the source and movie grant together before
   their November 12, 7 p.m. Eastern expiry. Refreshing another job or extending
   the expiry requires a fresh account-wide included-allowance review.

### October 29 combined release outcome

The source-admission prerequisite and audit owner merged their work in PRs 3 and 5;
the combined Movies release merged as PR 6 (`677640f`). Its exact code tree passed
793 TypeScript tests, 70 Python tests, nine Worker-runtime tests, 255 browser tests,
18 Chromium/WebKit production acceptance tests, production builds and the intended
configuration dry run. Reconciliation preserved the persistent Library header
from PR 4. A deterministic regression also caught and fixed layout-anchor capture
for controls rendered outside the scrolling collection.

A fresh D1 recovery bookmark was retained privately. Only migration `0031` was
unapplied; it was applied before the Worker upgrade. Its guard table was empty and
both cursor triggers permitted committed partial success after verification.
The initial deployment left the TMDB grant empty and preserved Access, source
selection, secrets, CPU/rate limits, resources, hourly cron and serial consumer.
Anonymous app and health requests still redirected to Access; authenticated smoke
checks covered all six media families, search, filters, inspectors and history.

The single reviewed job `01M64DA0M5P7FBZVEWE0Y13CZ3` completed at
2026-10-29 18:09:41 UTC on Worker version `a31de471-e05a-4391-ac7b-79d715cc366f`.
It used 69 of 80 durable attempts, returned all 671 requested items with no
omissions or job error, and recorded 672 estimated provider requests. There are
667 current movie profiles and four current TV profiles. The rebuilt projection
has current poster URLs for 670 of 675 items; four items remain unmatched and one
matched item has no poster. Fresh live search confirmed the artwork, director
metadata and labeled viewing rating. Existing initial-page snapshots can remain
cached for the normal ten-minute freshness window.

Both TMDB grant variables were cleared on Worker version
`7b12573b-9b42-40d7-97fa-21e001a307c1`; the job and its counters remain durable.
The existing three-source grant still expires November 13 at 00:00 UTC.
Native account analytics after restoration reported about 18.51 million D1 writes,
162 million reads, 56,500 Worker requests and 134,000 CPU milliseconds, within the
reviewed included allowances. D1 occupied about 1.192 GB. These remain account-wide
usage estimates, not a confirmed invoice or a hard dollar cap.

Connections also exposed a Spotify run that failed at 16:07 UTC on October 29,
before this release, following an interrupted October 28 run. The retained safe
error is only `SpotifyApiError` / "Spotify saved-episode sync failed"; it does not
identify an HTTP status or establish that reauthorization is needed. No source
retry, counter reset or credential change was issued. Investigate that separately
before recovery. Hardcover and unrelated enrichment remain outside activation.

Live light-theme verification found a further Movie row containment issue when
an inspector narrows a desktop collection. The follow-up uses collection-container
breakpoints and checks row bounds in both themes, in Archive and Queue, with the
inspector open and closed at 1440, 1280, 1200, 1024, 768 and 390 pixels.
