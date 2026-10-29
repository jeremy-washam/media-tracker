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

On October 29 at 21:53:50 UTC the new maintenance runtime was deployed with the
operating gate closed and monitor secret active. Native queue delivery was
paused, its consumer detached and source crons disabled before deployment. Only
the independent 10-minute monitor cron is active. Migrations 0032–0034 and source
activation remain pending. Zero active source/catalog leases were confirmed at
21:59 UTC. Fresh read-only capture has started under the held pause; the
20-minute minimum pause is enforced before SQL migrations.

Native account metrics checked October 29 remain within the existing plan's
included usage. Billing APIs do not establish an actual invoice. No new paid
service or subscription is authorized by this closeout.

## Acceptance checklist

| Area                      | Required implementation and verification                                                                                            | Current gate                                                                                                    |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Cost safeguards           | Permanent bounded operation; native monitor; sticky pause; queue stop; stale-monitor failure drill                                  | Token/secret active; $5 estimate; absent/stale/future gates return 503; manual pause restored                   |
| Source reliability        | Spotify safe endpoint/status diagnostics; resumable Hardcover pages; successful complete scans and retry evidence                   | Implemented; migration/crash/cooldown regressions passed; live recovery pending                                 |
| Catalog/content           | Recurring finite TMDB/YouTube/Spotify work; refresh before expiry; bounded article acquisition/indexing; provider Retry-After       | Implemented; scheduler/freshness/backoff tests passed; live activation pending                                  |
| Hosted imports            | Owner-authenticated existing export imports and continuation; streamed size bounds; replay/idempotence                              | Implemented with explicit hosted ZIP limits; native import/resume/bomb tests passed                             |
| Observability/performance | Private operations state, safe source failures, native metrics; representative hosted list/summary/detail timing                    | Private status and safe diagnostics implemented; hosted timing/activation checks pending                        |
| Recovery/security         | TimeTravel receipt; private R2 evidence/release manifests; synthetic restore drill; local backup; restricted smoke identity         | Smoke restrictions verified; Mac baseline-copy verification and fresh read-only capture running                 |
| CI/CD                     | Public standard-runner CI; exact-main successful revision; serialized protected production release; migration review; private smoke | Main CI passed; strict validate protection configured; release token installed; bootstrap/CD activation pending |
| Final acceptance/docs     | Full local gates, controlled deploy, owner-access/no-auth checks, real scheduler cycle, reconciled owning docs                      | Local gates passed; production migration/deploy/scheduler acceptance pending                                    |

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
state and correct the cause. With the consumer detached, resume native delivery
using `wrangler queues resume-delivery media-tracker-sync`, then explicitly clear
the R2 pause. Verify both states agree before reattaching the serial consumer;
otherwise the monitor treats native queue pause as a new sticky manual pause.
Never purge the queue. Reconcile dead-letter/expired work from durable checkpoints.
A later deployment or renewal must not clear the gate automatically.

## Validation and account setup evidence

The integration branch is `codex/deployment-closeout`, isolated from the primary
checkout and concurrent UI work. [PR 8](https://github.com/jeremy-washam/media-tracker/pull/8)
merged into main at `651a2be`;
[hosted main validation 40949037008](https://github.com/jeremy-washam/media-tracker/actions/runs/40949037008)
passed. Main requires the strict `validate` check. Local validation passed: `pnpm check`, production
build/dry runs,11 native Worker tests,257 browser regressions,18 real-stack
Chromium/WebKit acceptance tests and the separate coverage run. Connections'
new continuation copy also passed 8 isolated branch-server browser cases in both
themes, including narrow widths. The latest full `pnpm check` passed 889
TypeScript and 117 Python tests without skips using bundled Python;
coverage is 72.44% statements across maintained sources, not a claim that all
behavior is covered.

The exact native accountwide analytics query passed against Cloudflare. The
read-only production configuration/queue/schedule preflight also passed against
real API responses; this is validation against the existing deployed settings,
not activation of the new prepared settings. Normal and maintenance configs
are prepared and pass the CLI validator in protected ignored files. Both newly
supplied account tokens are active; D1/queue reads and the monitor's exact
analytics query passed, producing a $5 usage estimate. The release token is
installed in both protected GitHub environments; the monitor secret is active
in the new maintenance runtime. New coverage includes 18 read-only production
capture cases, four external local-recovery cases and two deployment transport
User-Agent/credential-privacy cases.

Live failure drills returned 503 for absent, stale and future operating state;
the manual pause was restored afterward. The CI identity receives 200 for its
fixed queryless health GET and 503 for summaries while paused. Private items,
operations status, query-bearing requests and POSTs return 403 for that identity;
unauthenticated health redirects with 302. No active source/catalog leases were
present at the 21:59 UTC drain check.

On 2026-10-29 the existing cutover bundle and independently restored database
passed verification again: 94 tables, 1,798,348 rows, 18,126 objects and the search
vocabularies. This is the original cutover recovery point. It does not establish
a fresh backup of subsequent production syncs, an offsite copy, or encryption-key
escrow. The owner accepted a protected local Mac folder outside the repository
and Cloudflare. It protects against provider/account loss, not loss of the Mac;
offsite storage is optional and is not a deployment blocker. Live database and
objects total about 1.5 GB; reserve 5–6 GB for the full bundle including transfer
and restore-test copies. The original baseline was copied to
`/Users/jeremywasham/Backups/Imladris/original-cutover-2026-10-13`; verification of
that Mac copy is running. Fresh production capture is also running under the
held writer pause; no fresh restore verification is claimed yet.

The `production` and `production-migrations` GitHub environments now exist,
restricted to `main`; migrations require owner review with self-approval allowed.
CD remains disabled. Existing SSH Git authentication works; no additional GitHub
OAuth scope is required. The owner approved dashboard creation of the restricted
smoke identity after API creation returned 403. Its Service Auth policy is
attached; both GitHub environments have its credentials. Owner MFA is unchanged.
See the [account setup steps](deployment-account-setup.md). Maintenance code is
deployed; no migration, provider activation or new paid service is complete.

## Live cutover sequence after credentials

The first release needs a controlled bootstrap: the old runtime does not yet
support the dedicated smoke identity and operating-state gate required by the
ordinary release guard. Preserve equivalent recovery receipts during bootstrap;
enable ordinary guarded CD only after the new baseline passes acceptance.

1. Verify the two scoped tokens and configure the restricted Access smoke
   identity. Install protected environment secrets without exposing provider
   credentials. Verify native budget-alert thresholds in the dashboard.
2. Preserve the old Worker identity/configuration and a fresh Time Travel
   bookmark. Disable old source crons, pause native delivery without purging and
   detach the consumer. Deploy the validated revision in maintenance with writes
   disabled, the R2 gate closed and only the independent monitor cron active.
   This closes HTTP writes before any schema change.
3. Verify source/catalog leases have drained, then capture the fresh protected
   local backup under the uninterrupted manual pause. Read-only capture can
   overlap the 20-minute hold once all writers have drained. Require both the
   full hold and verified independent restore before SQL migrations. Source artifacts remain stable;
   only the explicitly recorded live operating-state object is excluded.
4. Apply migrations 0032, 0033 and 0034; verify migration history and populated
   integrity/foreign-key/progress constraints. Exercise absent/stale/paused
   state, authenticated health and summary denial, native queue pause and recovery.
5. Resolve the pause cause and confirm a successful paused monitor cycle. While
   the consumer remains detached, resume native delivery, then explicitly clear
   the R2 gate. Verify native queue and private state agree before enabling the
   normal serial-consumer configuration. A deployment never resumes delivery.
6. Finish Hardcover's snapshot under one run, diagnose Spotify's real current
   response, and verify Letterboxd/Readwise snapshots. Activate due catalog,
   article acquisition/indexing and bounded maintenance; inspect native usage.
7. Observe real scheduled work, source/cursor integrity, media artwork/content,
   authenticated browser behavior and hosted list/summary/detail timings. Record
   actual daily-cycle results; synthetic clocks are not production soak evidence.
8. Retain the verified pre-migration local recovery copy, then enable protected
   exact-revision CD after all environment secrets and live smoke are accepted.
   Replace remaining gates above only with observed evidence.
