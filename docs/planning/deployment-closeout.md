# Deployment closeout

Updated 2026-10-29. Owner authorization: implement remaining hosted operations,
research/test each, use isolated worktrees and parallel agents, and maintain docs.
This checklist distinguishes prepared implementation from live acceptance.

## Production baseline

The six-media Library is deployed behind owner-only Access/MFA. Migrations
through 0031 and the October 29 ratings/poster fixes are live. Letterboxd,
Readwise and Spotify polling have run; Spotify's latest attempt failed with
insufficient diagnostics. Hardcover's first complete scan was interrupted.
TMDB's controlled refresh completed; recurring catalogs/content remain disabled.

Native account metrics checked October 29 remain within the existing plan's
included usage. Billing APIs do not establish an actual invoice. No new paid
service or subscription is authorized by this closeout.

## Acceptance checklist

| Area                      | Required implementation and verification                                                                                                  | Current gate                                                                                                 |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Cost safeguards           | Permanent bounded operation; native monitor; sticky pause; queue stop; stale-monitor failure drill                                        | Implemented; local failure/concurrency tests and exact native query passed; runtime token/live drill pending |
| Source reliability        | Spotify safe endpoint/status diagnostics; resumable Hardcover pages; successful complete scans and retry evidence                         | Implemented; migration/crash/cooldown regressions passed; live recovery pending                              |
| Catalog/content           | Recurring finite TMDB/YouTube/Spotify work; refresh before expiry; bounded article acquisition/indexing; provider Retry-After             | Implemented; scheduler/freshness/backoff tests passed; live activation pending                               |
| Hosted imports            | Owner-authenticated existing export imports and continuation; streamed size bounds; replay/idempotence                                    | Implemented with explicit hosted ZIP limits; native import/resume/bomb tests passed                          |
| Observability/performance | Private operations state, safe source failures, native metrics; representative hosted list/summary/detail timing                          | Private status and safe diagnostics implemented; hosted timing/activation checks pending                     |
| Recovery/security         | TimeTravel receipt; private R2 evidence/release manifests; synthetic restore drill; durable backup destination; restricted smoke identity | Recovery tooling tested; retained cutover bundle reverified; service identity/offsite destination pending    |
| CI/CD                     | Public standard-runner CI; exact-main successful revision; serialized protected production release; migration review; private smoke       | Workflows/preflight tested; protected environments provisioned; credentials and first hosted run pending     |
| Final acceptance/docs     | Full local gates, controlled deploy, owner-access/no-auth checks, real scheduler cycle, reconciled owning docs                            | Local gates passed; production migration/deploy/scheduler acceptance pending                                 |

The final handoff must replace these pending states with concrete evidence or
an explicit remaining user dependency. A local test is not a live activation;
a simulated scheduler run is not an observed scheduled production run.

## Operating policy

[ADR 0021](../decisions/0021-bounded-production-operations.md) owns the approved
simple controls. The existing $5/month subscription is accepted. Warn near $10
and pause near $25 total estimated monthly cost. Small routine overages are
accepted; new subscriptions/services require approval. Expiring grants and
lifetime source allocations are retired. Native metrics and the pause target
cannot guarantee an exact invoice limit.

`GET /api/operations` is owner-only and reports monitor state without reading
D1. The private object `operations/operating-state.json` stores a versioned
successful-check time, conservative estimate, reason, sticky pause and native
queue-pause result. A 30-second cache bounds gate propagation; absent/stale
monitoring closes API/database and background work. The monitor runs separately
from source enablement every 10 minutes, including while paused. Its scoped
secret is `OPERATING_API_TOKEN`; only Analytics Read, D1 Read and Queues Edit for
the target account are required.

After an emergency stop, inspect usage and durable jobs, preserve the incident
state, correct the cause and explicitly reset the R2 gate. Resume the existing
queue using `wrangler queues resume-delivery media-tracker-sync`; never purge it.
Reconcile dead-letter/expired work from durable checkpoints before resuming.
A later deployment or renewal must not clear the gate automatically.

## Validation and account setup evidence

The integration branch is `codex/deployment-closeout`, isolated from the primary
checkout and concurrent UI work. Local validation passed: `pnpm check`, production
build/dry runs,11 native Worker tests,257 browser regressions,18 real-stack
Chromium/WebKit acceptance tests and the separate coverage run. Connections'
new continuation copy also passed 8 isolated branch-server browser cases in both
themes, including narrow widths. Unit/Python counts are 889 and 93 respectively;
coverage is 72.44% statements across maintained sources, not a claim that all
behavior is covered.

The exact native accountwide analytics query passed against Cloudflare. The
read-only production configuration/queue/schedule preflight also passed against
real API responses; this is validation against the existing deployed settings,
not activation of the new prepared settings. Normal and maintenance configs
are prepared and pass the CLI validator in protected ignored files.

On 2026-10-29 the existing cutover bundle and independently restored database
passed verification again: 94 tables, 1,798,348 rows, 18,126 objects and the search
vocabularies. This is the original cutover recovery point. It does not establish
a fresh backup of subsequent production syncs, an offsite copy, or encryption-key
escrow. Those require the owner-selected independent destination.

The `production` and `production-migrations` GitHub environments now exist,
restricted to `main`; migrations require owner review with self-approval allowed.
CD remains disabled. Existing SSH Git authentication works; no additional GitHub
OAuth scope is required. The current Cloudflare connection lacks Access Service
Tokens permission (a 403 read-only probe), and persistent monitor/CI credentials
must be supplied through the[account setup steps](deployment-account-setup.md).
No new code, migration, provider activation or paid service has been deployed by
this closeout preparation.

## Live cutover sequence after credentials

1. Verify the two scoped tokens and configure the restricted Access smoke
   identity. Install protected environment secrets without exposing provider
   credentials. Verify native budget-alert thresholds in the dashboard.
2. Capture a fresh TimeTravel bookmark, deployed Worker identity and protected
   configuration. Quiesce the old runtime's source/cron/consumer entry points,
   pause native delivery without purging, and drain bounded in-flight work.
3. Apply migrations 0032, 0033 and 0034; verify migration history and representative
   populated integrity/foreign-key/progress constraints.
4. Deploy the exact validated main revision in maintenance, with the monitor
   secret and independent 10-minute schedule. Exercise absent/stale/paused state,
   authenticated health and summary denial, native queue pause, and recovery.
5. Resolve the pause cause and wait for the monitor cycle to finish (confirmed
   `queuePaused:true`) before explicitly resetting state/resuming delivery.
   Verify native queue state and private operations state agree; a deployment
   never resumes it. Enable the normal prepared serial-consumer configuration.
6. Finish Hardcover's snapshot under one run, diagnose Spotify's real current
   response, and verify Letterboxd/Readwise snapshots. Activate due catalog,
   article acquisition/indexing and bounded maintenance; inspect native usage.
7. Observe real scheduled work, source/cursor integrity, media artwork/content,
   authenticated browser behavior and hosted list/summary/detail timings. Record
   actual daily-cycle results; synthetic clocks are not production soak evidence.
8. Refresh and verify the independent recovery copy, configure required CI after
   its first successful hosted run, then enable protected exact-revision CD.
   Replace remaining gates above only with observed evidence.
