# Deployment closeout

Updated 2026-10-30 UTC. Owner authorization: implement remaining hosted operations,
research/test each, use isolated worktrees and parallel agents, and maintain docs.
This checklist distinguishes implementation, live acceptance and account input.

## Production baseline

The six-media Library runs behind owner-only Access/MFA on the existing Worker.
[PR 8](https://github.com/jeremy-washam/media-tracker/pull/8) introduced guarded
operations and [PR 9](https://github.com/jeremy-washam/media-tracker/pull/9) completed
recovery capture and corrected a monitor transport incompatibility. Revision
`9a6a877` was the migration-release baseline and included the independently
merged Balanced typography changes. The ordinary-release acceptance recorded
below was collected against main
`3044d2ad5e5db5b7436537cb5f289cbf8e932115` through 2026-10-30 00:10 UTC.

[PR 13](https://github.com/jeremy-washam/media-tracker/pull/13) subsequently merged
at **00:38:23 UTC** as `8c89b44533b849e37cbc8b56bbe206224e7d1cdb`.
[Main pipeline 40980943229](https://github.com/jeremy-washam/media-tracker/actions/runs/40980943229)
passed validation, deployment and authenticated smoke at **00:49:23.637 UTC**.
Its gates passed 907 TypeScript, 147 Python, 267 browser, 18 real-stack and 13
native runtime tests, with 72.42% coverage. The cross-midnight retry correction
was live at that checkpoint; the later queued-manual-sync preparation is recorded below.

The protected [migration release](https://github.com/jeremy-washam/media-tracker/actions/runs/40968424590)
passed on exact main revision `9a6a877`. Migrations 0032–0034 are applied, all 34
migration names match, `PRAGMA quick_check` is `ok`, and production has zero
foreign-key violations. Hardcover ownership triggers and article/source retry
columns were verified against the populated database.

Normal operation resumed at approximately 22:59 UTC: native queue delivery open,
serial consumer attached, four-source allowlist enabled, hourly eligibility and
catalog scheduling, five-minute maintenance and independent ten-minute operating
monitor. Native configuration, schedules, bindings, CPU/rate limits and consumer
settings were checked against the prepared normal configuration. Catalog refresh
was held at 23:17 UTC after a real YouTube finalization CPU failure.
[PR 12](https://github.com/jeremy-washam/media-tracker/pull/12), the reviewed
publication repair, merged at **23:43:36 UTC** into main `3044d2ad` after successful
PR validation. The first
[ordinary main pipeline 40975073224](https://github.com/jeremy-washam/media-tracker/actions/runs/40975073224)
then passed validation and automatic deployment, including authenticated smoke
at **23:56:29.258 UTC**.

At **23:57:19.646 UTC**, `CATALOG_AUTO_REFRESH=true` was restored and reconciled
across the live Worker, canonical deployment configuration and both protected
GitHub environments. Native variables, bindings, limits, schedules and serial
consumer configuration passed verification, as did all six summary smoke checks.
The existing YouTube job subsequently published successfully, resolving the
CPU failure and refresh hold; detailed native evidence is recorded below.

The dashboard showed $0 usage overages; the operating monitor at
**2026-10-30 00:10:25.976 UTC** was normal/open and estimated $5 total,
including the existing Workers subscription. Saved native alerts warn at $5
usage and escalate at $20 usage, approximately $10/$25 total. Analytics are
estimates, not an invoice or guaranteed charge cap. No new paid service or
subscription was added.

The 00:00 UTC monitor collection encountered a native API read timeout and
retained the still-fresh 23:50 normal/open measurement as designed. It did not
write a fabricated fresh timestamp or pause delivery. The next real collection
recovered at **00:10:25.976 UTC**; direct R2 readback confirmed a normal/open $5
measurement and unpaused queue, without operator intervention.

## Acceptance checklist

This separates implemented capabilities from ongoing provider work. Exact hosted
acceptance is timestamped below; subsequent releases keep their own required
validation, deployment and smoke receipts. The queued-dispatch change is tracked
in [PR 14](https://github.com/jeremy-washam/media-tracker/pull/14).

| Area                      | Live evidence                                                                                                                                                                        | Remaining acceptance                                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Cost safeguards           | Successful native monitor/drill; absent/stale/future states return 503; midnight timeout retained fresh data and the next real 00:10 collection recovered normally                   | Alerts and pause remain approximate; they are not a guaranteed invoice cap                                                |
| Source reliability        | Hardcover complete; Letterboxd/Readwise succeeded October 29; Spotify partial evidence and guarded orphan closure verified; queued manual dispatch implemented and locally validated | Full Spotify source reconciliation and next eligible daily cycle remain open                                              |
| Catalog/content           | Movies and YouTube verified; hourly/article/duplicate checks passed; Spotify track catalog access recovered with 300 distinct records verified and 425 returned by 00:51             | Spotify catalog job/full backfill remain incomplete; metadata progress does not establish complete source synchronization |
| Hosted imports            | Streamed bounds, existing owner export imports and continuation; native import/resume/ZIP-bomb acceptance passed                                                                     | Hosted ZIP limits remain explicit; complete historical coverage still needs manual source exports                         |
| Observability/performance | Owner-only operations; safe Spotify endpoint/status diagnostic; 20 representative live list/detail/history checks all 200                                                            | Single-pass latency is recorded below, not a percentile or performance SLO                                                |
| Recovery/security         | Fresh independent Mac data backup and restore verified; migration rehearsal passed; separate approved key backup decrypt proof passed; restricted CI identity verified               | Optional offsite copy protects against Mac loss; service identity expires October 29, 2027                                |
| CI/CD                     | Reviewed migration workflow and first ordinary exact-main validation/deployment/authenticated smoke passed; scoped secrets in both main-only environments; guarded CD enabled        | Retain configuration/schema checks and exact-revision delivery for subsequent releases                                    |
| Documentation             | Owning setup, recovery, source, architecture and plan documents reconciled with actual deployment                                                                                    | Keep incomplete provider/scheduler gates explicit; do not infer full acceptance from synthetic tests                      |

A local test is not a live activation. A bounded first batch is not a completed
backfill, and a simulated clock is not an observed production scheduled cycle.
No further account input is needed for the current Spotify follow-through.

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

The subsequent YouTube publication repair passed
[PR 12 validation 40973539161](https://github.com/jeremy-washam/media-tracker/actions/runs/40973539161):
895 TypeScript and 147 Python tests, production builds/dry runs, 13 native Worker
tests, 267 browser tests and 18 real-stack Chromium/WebKit acceptance tests.
Coverage reported 72.42% statements. The subsequent exact-main pipeline passed
validation and automatic deployment with authenticated smoke at 23:56:29.258 UTC;
the native catalog publication evidence below was collected after deployment.

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
search and filter controls. After YouTube publication, live browser checks in
both dark and light appearance verified video artwork, inspector and description
content. Browser tests and private live checks never publish
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
commit under one durable snapshot. The October 29 Letterboxd and Readwise admissions
already succeeded; duplicate acceptance messages correctly did not allocate a
second daily run. Preserve that accounting rather than forcing another fetch.

The YouTube publication repair completed through one owner-authorized POST at
**23:57:27 UTC** (202), resuming the same existing durable job. It succeeded at
**23:57:28.555 UTC** on attempt 85, following attempt 84 before the retry. Requested,
returned and omitted counters remained **20,292 / 18,695 / 1,597**; no provider
pages were fetched again. Eight native aggregate acceptance checks passed:
all 20,292 observations were published with current mappings; all 18,695 available
videos had artwork across 88,559 thumbnail rows; 16,921 descriptions totaled
13,011,443 characters; provider FTS payloads had zero mismatches and expiry maps
had zero missing entries. Owner/source counts, totals and text-length aggregates
were unchanged. Preservation was checked at aggregate level; no byte-for-byte
comparison was performed. Native publication and browser artwork/inspector checks
resolve the earlier CPU-failure hold without increasing runtime or provider
allowances.

After the 00:10 release-acceptance checkpoint, the owner confirmed active Spotify
Premium again at **00:16 UTC**. A single manual catalog request was accepted at
**00:17:34 UTC**, but its first bounded job failed with `spotify_http_403`, verified
at **00:18:28 UTC**. Requested, returned and unavailable counters were all zero;
the existing 18,206 tracks remain, with no new provider records. Earlier, the
bounded source retry refreshed the hosted token successfully but received 403
from saved episodes. Premium restoration has not established API recovery.

The owner's **00:23 UTC** screenshot confirms Development Mode and a Client ID
matching the retained deployment input. Spotify's
[Development Mode policy](https://developer.spotify.com/documentation/web-api/concepts/quota-modes)
and [migration guidance](https://developer.spotify.com/documentation/web-api/references/changes/february-2026)
require active Premium. The owner then found the account absent from Users
Management and added it. One bounded catalog retry was accepted with HTTP 202 at
**00:27:38 UTC**. At **00:28:05 UTC**, that same job was pending in its tracks
phase with 25 requested, 25 returned, zero unavailable and no error. This verifies
track catalog API access after the account addition, which appears to have
resolved that access block. By **00:43:55 UTC**, 300 distinct track records were
verified; by **00:51 UTC**, the same job had returned 425 with zero errors.
The job/full backfill remain incomplete, and no remaining-count reduction is
claimed from its status field. Metadata progress is separate from source sync.
Keep API flags and the source allowlist unchanged,
without another catalog retry while observing this job. No agent purchase, new app,
reauthorization, manual credential replacement or allowance reset was performed.

A manual source attempt also exposed a cross-midnight retained-retry bug: discovery
filtered failed allocations to the current UTC day. The PR 13 query correction
selects only the latest retained failed allocation across days, with an atomic
newer-admission fence when claiming it. It preserves the original day/start,
cumulative reservation/usage, cooldown and attempt ceilings, plus all new-allocation
daily/23-hour, scheduler, lease and rolling guards; no migration is needed.
The focused suite passed 41 tests, including 12 new regressions; the full checks
and exact-main release above passed, so this correction is live on `8c89b445`.

The single retained source HTTP retry began at **00:50:02.561 UTC**. Its caller's
60-second read timeout canceled the native invocation at **00:51:01.926 UTC**
(59,940 ms wall time, 632 ms CPU), rather than a provider 403. Six raw objects
and 196 source records were durably committed, latest at **00:50:52.618 UTC**;
no cursor was committed or advanced for this run, so full source completion is
not established. The
original October 29 admission and start `1793290076391` remain intact at
attempt 3 / retry 2. Unknown attempt usage is conservatively charged with a
retained `inFlight=1` marker; the marker does not establish an active provider
request after the known cancellation. Do not reset accounting or resend the retry.

After source lease expiry at **01:10:02.016 UTC**, the existing guarded
`reconcile_source_runs.py` procedure closed exactly one visibly orphaned run at
**01:10:31.849 UTC**. Verification at **01:10:50.447 UTC** confirmed failed status
with `source_run_interrupted`; repeated apply wrote nothing and reported one
already-closed run. All six raw objects / 196 source records were retained, with
no cursor committed for this run. Terminal counters remained zero without
reconstruction; they do not imply zero durable work. The original October 29
admission/start `1793290076391`, running status, attempts 3 / retry 2 and retained
`inFlight=1` conservative marker remained unchanged. Protected proof:
`.private/deployment/closeout-2026-10-29/spotify-canceled-source-closure-proof.json`.

A backend/client change to send
all four hosted manual source syncs through the existing queue with HTTP 202
and honest queued/polling UI was in progress at the **00:51 UTC follow-through
checkpoint**, retaining local HTTP 200. At that checkpoint it was not yet
validated or released. The next legitimate fresh Spotify
allocation is **October 30 15:07:56.391 UTC (11:07 EDT)**, with the next hourly
cron at **16:00 UTC (noon EDT)**. Source success and that eligible cycle remain
open; no additional account input is needed.

At the **October 30 approximately 01:08 UTC** local validation checkpoint, the
queued-manual-sync change passed the full check (943 TypeScript / 147 Python),
production build/dry run, all 15 native runtime tests, all 18 Chromium/WebKit
real-stack tests and all 272 browser tests. Four light/dark desktop/narrow
screenshots and independent code reviews passed. Its compiled-Worker test observed the requesting TCP
socket close while the synthetic provider response remained held, then released
the response and verified independent queue completion with durable raw records
and a committed cursor. These completed local checks do not establish a new
hosted release; exact-revision hosted CI and delivery retain their own receipts.
The queued-manual-sync code is committed as `d9ea713`; PR 14's hosted validation
and release remain to be verified. Preparation does not establish live activation.

The real hourly `0 * * * *` invocation completed successfully at
**2026-10-30 00:00:17.063 UTC**. Its script version matched the current
catalog-enabled deployment (23:56:58.955 UTC). Between 23:59:34 and 00:02:03,
TMDB remained at nine jobs / 1,414 total requested IDs and YouTube at nine jobs /
40,584 total requested IDs, with zero active catalog jobs. The observed hourly
pass created no empty catalog job. Native five-minute maintenance completed at
**00:00:44.992 UTC** without failures.

The hourly article reservation completed its entire 20-job batch by
**00:02:53 UTC** with 20 attempts and zero failures. Final checks at
**00:05:12 UTC** found 20 ready/full manifests, 251 chunks and zero missing FTS
entries. For one newly acquired article, protected text, all eight chunk
checksums and FTS mappings, owner-authenticated text-only search and the hydrated
excerpt passed verification.

A single completed-key replay was requested at **00:03:25.411 UTC**. The complete
native Worker-log window from 00:03:23 to 00:04:16 contained two events (ABR 1):
one successful queue invocation with batch size one, plus its acquisition-usage
event. That usage event observed one unmeasured `first()` statement; its reported
zero writes are not a measured zero-write guarantee. Durable attempt and raw
acquisition deltas were zero, and manifest/chunk/FTS metadata comparison was
unchanged. Idle queue depth was zero before and after; approximate DLQ depth
remained three. This verifies the duplicate guard through controlled-window
correlation. Success logs omit message ID and idempotency key, so direct
message-identity proof is unavailable. Existing DLQ messages were retained;
one read-only historical peek referenced the already-resolved YouTube failure.

The next genuinely eligible daily source cycle remains unobserved. Daily
eligibility and continuation recovery are separate from the verified hourly
scheduler execution. The [source rollout](source-sync-rollout.md) and
[catalog/content policy](catalog-operations.md) own that remaining soak and
Spotify recovery; record their observed outcomes there.

The reviewed legacy source-run repair passed 18 independent synthetic tests;
the combined full check passed 891 TypeScript and 147 Python tests after the
control-consistency merge. It closed exactly two proven abandoned legacy runs
and a repeated invocation verified a zero-write no-op. Evidence, counters,
cursors and admission reservations were preserved. Current Hardcover success
was verified in the live Connections page.
