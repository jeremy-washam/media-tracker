# Deployment closeout

Updated 2026-10-29. Owner authorization: implement remaining hosted operations,
research/test each, use isolated worktrees and parallel agents, and maintain docs.
This checklist distinguishes implementation, live acceptance and account input.

## Production baseline

The six-media Library runs behind owner-only Access/MFA on the existing Worker.
[PR 8](https://github.com/jeremy-washam/media-tracker/pull/8) introduced guarded
operations and [PR 9](https://github.com/jeremy-washam/media-tracker/pull/9) completed
recovery capture and corrected a monitor transport incompatibility. Main
`9a6a877` includes the independently merged Balanced typography changes.

The protected [migration release](https://github.com/jeremy-washam/media-tracker/actions/runs/40968424590)
passed on that exact main revision. Migrations 0032–0034 are applied, all 34
migration names match, `PRAGMA quick_check` is `ok`, and production has zero
foreign-key violations. Hardcover ownership triggers and article/source retry
columns were verified against the populated database.

Normal operation resumed at approximately 22:59 UTC: native queue delivery open,
serial consumer attached, four-source allowlist enabled, hourly eligibility and
catalog scheduling, five-minute maintenance and independent ten-minute operating
monitor. Native configuration, schedules, bindings, CPU/rate limits and consumer
settings were checked against the prepared normal configuration. Catalog refresh
was subsequently held at 23:17 UTC after a real YouTube finalization CPU failure;
its diagnostic and recovery are tracked in the catalog policy. Both protected
GitHub environments now contain that configuration; guarded ordinary main-branch
CD is enabled. Its successful exact-revision release and smoke receipts belong to
[main Actions runs](https://github.com/jeremy-washam/media-tracker/actions?query=branch%3Amain).
Enabling the workflow alone does not establish that its first ordinary release
has passed.

The dashboard showed $0 usage overages; native monitoring estimates $5 total,
including the existing Workers subscription. Saved native alerts warn at $5
usage and escalate at $20 usage, approximately $10/$25 total. Analytics are
estimates, not an invoice or guaranteed charge cap. No new paid service or
subscription was added.

## Acceptance checklist

| Area                      | Live evidence                                                                                                                                                          | Remaining acceptance                                                                                                        |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Cost safeguards           | Successful native monitor; controlled automatic queue-pause drill; absent/stale/future states return 503; manual resume preserves measurement                          | Continue normal monitoring; alerts and pause remain approximate                                                             |
| Source reliability        | Hardcover complete: 23 pages, 1,112 source records, 128 normalized records, zero failures, final cursor committed; Letterboxd/Readwise succeeded today                 | Spotify current HTTP 403 needs account eligibility/access check; subsequent eligible daily cycles remain soak evidence      |
| Catalog/content           | Recurring bounded scheduling enabled; Movies artwork/current metadata and viewing ratings verified; YouTube backlog progressing                                        | Complete YouTube/Spotify jobs, newly acquired article excerpt/FTS and duplicate delivery, subsequent real hourly scheduling |
| Hosted imports            | Streamed bounds, existing owner export imports and continuation; native import/resume/ZIP-bomb acceptance passed                                                       | Hosted ZIP limits remain explicit; complete historical coverage still needs manual source exports                           |
| Observability/performance | Owner-only operations; safe Spotify endpoint/status diagnostic; 20 representative live list/detail/history checks all 200                                              | Single-pass latency is recorded below, not a percentile or performance SLO                                                  |
| Recovery/security         | Fresh independent Mac data backup and restore verified; migration rehearsal passed; separate approved key backup decrypt proof passed; restricted CI identity verified | Optional offsite copy protects against Mac loss; service identity expires October 29, 2027                                  |
| CI/CD                     | Strict main validation; scoped secrets in both main-only environments; reviewed migration workflow passed; normal guarded CD enabled                                   | Verify the first ordinary main release in Actions; never bypass configuration/schema checks                                 |
| Documentation             | Owning setup, recovery, source, architecture and plan documents reconciled with actual deployment                                                                      | Keep incomplete provider/scheduler gates explicit; do not infer full acceptance from synthetic tests                        |

A local test is not a live activation. A bounded first batch is not a completed
backfill, and a simulated clock is not an observed production scheduled cycle.
Spotify's account dependency does not prevent browsing or other sources.

## Operating policy and verified stop/resume

[ADR 0021](../decisions/0021-bounded-production-operations.md) owns the approved
controls. The existing $5/month subscription and small routine overages are
accepted. Warn near $10 and pause near $25 total estimated monthly cost. New
subscriptions/services require approval. Expiring grants and lifetime source
allocations are retired. Existing storage/subscription charges continue while
paused and native usage data can arrive late.

`GET /api/operations` is owner-only and does not read D1. The private object
`operations/operating-state.json` holds the successful-check time, conservative
estimate, reason, sticky pause and native queue result. A 30-second cache bounds
gate propagation. Missing/stale/future monitoring closes API/database and
background work. The monitor runs every ten minutes even while paused.
`OPERATING_API_TOKEN` has only target-account Analytics Read, D1 Read and Queues
Edit.

The initial real cycles exposed unsupported Worker `fetch` redirect mode
`error`. The corrected runtime uses `manual` and rejects non-success responses;
a real scheduled collection succeeded at **22:20:58.762 UTC** and automatically
paused native delivery during the controlled drill. The original sticky manual
pause timestamp survived. Later successful collection at **22:50:57.717 UTC**
provided the measurement used for deliberate resume. No fake fresh timestamp was
written.

For an emergency resume: inspect usage and durable jobs, preserve incident state,
resolve the cause, detach the consumer and resume native delivery first. Then
explicitly clear the private R2 pause and verify both states agree before
reattaching the consumer. Never purge the queue or clear a pause as a deployment
side effect. The October 29 manual R2 update was coordinated away from cron and
verified by readback; it was not an atomic compare-and-swap.

## Validation and live browsing

The combined branch including typography passed
[hosted validation 40967053999](https://github.com/jeremy-washam/media-tracker/actions/runs/40967053999):
`pnpm check` (891 TypeScript and 129 Python tests), production builds/dry runs,
13 native Worker tests, 261 browser tests and 18 real-stack Chromium/WebKit
acceptance tests. Separate coverage reported 72.44% statements across maintained
sources. These counts describe that revision, not every future release. The
Connections cadence wording also passed eight isolated light/dark/narrow browser
cases and the frontend production build.

The restricted CI identity passed health and all six queryless summary GETs in
normal operation. It is denied private item/operations paths, query-bearing
health and POSTs with 403. Unauthenticated health redirects to Access with 302.
During maintenance, owner health/operations remained 200 while summaries and
catalog POSTs returned 503. Owner MFA was preserved.

At 22:59:33 UTC, owner-authenticated live checks passed list, representative
inspector and history requests for each media family, plus queued article list
and detail: **20/20 HTTP 200**. Observed list/detail/history milliseconds were:

| Media    |  List | Detail | History |
| -------- | ----: | -----: | ------: |
| Books    |   546 |  1,177 |     375 |
| Movies   |   604 |    550 |     587 |
| Articles |   990 |    342 |     616 |
| Podcasts |   215 |    224 |   2,395 |
| Music    | 3,354 |    369 |     301 |
| Videos   |   519 |    376 |     386 |

Queued article list/detail took 485/302 ms. These are single-pass network plus
server timings; they are not p95 measurements. Browser verification confirmed
current Movie posters/directors, labeled viewing ratings, inspector/history,
search and filter controls. Browser tests and private live checks never publish
owner data or credentials to Actions artifacts.

## Independent recovery point

The retained pre-migration bundle at
`/Users/jeremywasham/Backups/Imladris/fresh-2026-10-29` contains
**3,623,960,683 bytes, 97 logical tables, 1,818,662 logical rows and 18,283 R2
objects**. Its stable inventory/schema cutoff is **2026-10-29 22:26:12.349386
UTC**, before schema migrations, under the uninterrupted writer pause. The only
excluded live R2 key is the declared operating-state object. Logical row counts
include source/evidence/search data, not unique media items.

Source and separate Mac-copy manifest SHA-256:
`a8d320cf62dac5a50d05823e1d182042c60323fca7853a4fd7089f683f1b3dca`.
Checksums, source references, search vocabulary and independent restored SQLite
were verified. A separate populated rehearsal advanced history 31→34 with full
integrity, zero foreign-key violations, ownership triggers and retry backfill
checks. Retained backups were not changed by rehearsal. The original October 13
cutover backup remains alongside it.

The explicitly approved separate owner-only encryption-key backup is in
`/Users/jeremywasham/Backups/Imladris/credentials`. A local proof decrypted one
stored credential using the copied key, without retaining plaintext or making
provider requests. Anyone holding both key and database could decrypt that
credential; keep both protected. The Mac copies protect against Cloudflare
account/provider loss, not loss of the Mac. Offsite storage is optional.

## Source and catalog follow-through

Hardcover completed at **23:04:25.695 UTC**, including scan finalization and cursor
commit under one durable snapshot. Today's Letterboxd and Readwise admissions
already succeeded; duplicate acceptance messages correctly did not allocate a
second daily run. Preserve that accounting rather than forcing another fetch.

Spotify's bounded source retry refreshed the hosted token successfully, then
received **HTTP 403 from saved episodes**. Existing credentials do not retain the
actual grant scopes/account eligibility, so reauthorization is not established
as the remedy. Check the matching existing Spotify developer app's status,
owner Premium eligibility and Users Management account. No app creation, paid
upgrade, token replacement or allowance reset is part of this diagnostic.
Catalog Spotify work also stopped with a recorded safe error; earlier catalog
progress must not be presented as newly completed work.

The [source rollout](source-sync-rollout.md) and
[catalog/content policy](catalog-operations.md) define the remaining full-job,
idempotence, newly acquired excerpt/FTS and real scheduled-cycle gates. Record
observed outcomes there. Daily eligibility and continuation recovery are
separate from hourly scheduler execution.

The reviewed legacy source-run repair passed 18 independent synthetic tests;
the combined full check passed 891 TypeScript and 147 Python tests after the
control-consistency merge. It closed exactly two proven abandoned legacy runs
and a repeated invocation verified a zero-write no-op. Evidence, counters,
cursors and admission reservations were preserved. Current Hardcover success
was verified in the live Connections page.
