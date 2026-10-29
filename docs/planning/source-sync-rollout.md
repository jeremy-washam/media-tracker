# Hosted source sync

The owner prioritized sync before further browsing/performance measurements on
October 17, 2026. Existing provider credentials are installed. The existing
$5/month Workers plan is approved; additional charges are not.

## Initial activation

Apply migration 0030 before enabling source work. `SYNC_ENABLED=true` alone is
insufficient in production: `SYNC_SOURCES` explicitly lists enabled polling
sources and `SYNC_BUDGET_UNTIL` contains a future UTC instant. The deployment
validator limits a usage grant to 32 days; initial controlled grants last two
hours. Expiry stops new admissions;
it does not renew automatically. Check current account-wide included allowances
before issuing a grant, including rehearsal and deleted-resource usage.

Start one source at a time, inspect its durable attempt and native account usage,
then add the next source. Initial order: Letterboxd RSS, Hardcover, Readwise,
Spotify. This moves from the smallest finite feed to full reconciliation and
rotating credentials. Request new credentials only if a provider rejects those
already installed.

Both HTTP sync actions and queued source jobs share these controls:

The durable allocation is 10 million observed D1 writes, 1 billion observed D1
reads, 2 GB acquired response bytes, 20,000 provider requests and 365 daily
reservations. It covers all rows in the admission ledger and does not reset on
deployment, grant renewal or a new day. Each admission requires room for a
2-million-write/200-million-read/64-MiB/128-request reservation. Unknown or failed
database work keeps the full D1 reservation; measured successful work reconciles
to its observed totals. Unmeasured non-`first()` statements cannot refund D1
reservations. Native account analytics remains the billing authority.

Jobs check observed database usage between records/pages at 1 million writes
or 100 million reads. A SQL operation can cross that threshold before the next
check; the admission reservation provides headroom. Native database size is
checked before hosted work and during measured statements; jobs stop at the
3 GB review threshold, below the account's included 5 GB. Included capacity
must still be checked account-wide before extending a grant; these controls
are engineering allocations, not a Cloudflare dollar cap.

- One reservation per source per UTC day, with at least 23 hours between new reservations.
  `SYNC_RETRY_SOURCE` can explicitly permit up to two recovery attempts for a failed
  reservation. It subtracts previously consumed requests/bytes/pages/records,
  retains cumulative provider/database usage and the original admission timestamp, and refuses
  exhausted or unmeasured reservations. Restarting never resets a budget.
- A global 20-minute lease serializes source jobs across HTTP and queue consumers.
- Provider work checks a 10-minute deadline; individual requests time out after
  30 seconds, reject redirects, and buffer at most 8 MiB each.
- Failed attempts consume their daily reservation. Crashes retain the reservation
  and lease until expiry. Provider retries consume the same request cap.
- Failed or interrupted snapshots do not finalize missing records or advance
  complete-snapshot watermarks. Previously committed evidence remains durable;
  the next admitted attempt replays idempotently from the committed watermark.
  This is a safe restart, not a mid-page continuation.

| Source     | Requests | Parsed pages | Records, including read/highlight children | Response bytes |
| ---------- | -------: | -----------: | -----------------------------------------: | -------------: |
| Letterboxd |        2 |            1 |                                        500 |          4 MiB |
| Hardcover  |      128 |           64 |                                      7,000 |         32 MiB |
| Readwise   |       64 |           32 |                                     10,000 |         16 MiB |
| Spotify    |       32 |           24 |                                      1,000 |          8 MiB |

These are initial reconciliation ceilings, not targets or a dollar cap. Hardcover's
previous observed library was 1,114 relationships across 23 pages; its ceiling
leaves room for edition/read rows. The verified restore contains 917 Reader
documents, 16 highlight containers with 26 highlights, 72 saved Spotify episodes
and 40 saved shows. Those baselines inform the other finite caps; validate their
current size against controlled first runs. Oversized responses stop before parsing or R2 storage; accepted
responses are retained before record/page-limit checks. No partial result is
presented as a complete snapshot. Long Readwise/Hardcover `Retry-After` values
end an attempt instead of causing an early retry.

An hourly cron enqueues eligible `sync_source` jobs. The source consumer uses
batch size 1, concurrency 1, and at most one transport retry. Provider failures
are recorded in sync activity and acknowledged; the next eligible daily attempt
retries. A transient lease conflict requests delayed redelivery. Admission rows
record reserved ceilings and actual aggregate counts, including known D1
reads/writes and the count of statements without metadata. Native account
analytics remains authoritative for billing; `first()` metadata is unavailable.

Keep `ARTICLE_CONTENT_ENABLED=false`, `SPOTIFY_CATALOG_ENABLED=false`,
`CATALOG_AUTO_REFRESH=false`, and `MAINTENANCE_ENABLED=false` during this stage.
Existing content and enrichment jobs remain durable and paused; source sync
does not enqueue new HTML acquisitions or resume Spotify's catalog backlog.
The hosted write entry point permits only the four source-sync actions during
this rollout. Manual imports and enrichment need separately budgeted activation.
Read-only browsing remains available.

## Spotify credential ownership

Before enabling hosted Spotify, disable Spotify sync in local runtime
configuration. A copied credential store cannot coordinate token rotation
across two independent databases. Local cron is manually invoked, but local UI
sync actions must also respect source selection.

## Coverage and follow-up

Readwise covers Reader document state and highlights; Hardcover reconciles book
relationships and reads. Letterboxd RSS covers recent public activity, with manual
exports still required for complete edits/removals/private activity. Spotify
polling covers discoverable episodes/library state and recent tracks; periodic
Extended Streaming History exports remain necessary. YouTube watch history still
requires manual Takeout imports.

After representative native usage is recorded, activate the daily cadence through
an explicit grant no later than the reviewed billing-cycle end. Grants never
renew automatically or reset the allocation. Content, enrichment, maintenance,
and manual history imports need their own budgets before enabling.

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
