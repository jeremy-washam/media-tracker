# Releases and recovery

This document owns the repeatable release and recovery procedures for the
private hosted Imladris Library. The [deployment runbook](deployment.md) owns
resource identity, Access setup, and initial cutover;
[source sync rollout](source-sync-rollout.md) owns provider activation.

## Implementation and activation status

The repository now defines credential-free pull-request validation, guarded
production delivery, a separate reviewed migration release, and read-only
backup verification. [PR 8](https://github.com/jeremy-washam/media-tracker/pull/8)
merged into main at `651a2be`, and
[hosted main validation 40949037008](https://github.com/jeremy-washam/media-tracker/actions/runs/40949037008)
passed. Protected environments and strict main `validate` protection are
configured. Both environment release tokens and restricted smoke credentials are
installed. The October 29 maintenance bootstrap began at 21:53:50 UTC with the
gate closed, queue paused, consumer detached and only the monitor cron active;
zero active source/catalog leases were confirmed at 21:59 UTC. Fresh capture,
independent restore, protected Mac-copy verification and a separate migration
rehearsal subsequently passed before the protected migration release of
`9a6a877`. The first ordinary
[main pipeline 40975073224](https://github.com/jeremy-washam/media-tracker/actions/runs/40975073224)
subsequently passed validation, automatic deployment of exact-main `3044d2ad`
and authenticated smoke at **23:56:29.258 UTC**.

The normal configuration now includes `CATALOG_AUTO_REFRESH=true`, restored at
**23:57:19.646 UTC** and reconciled across the live Worker, canonical configuration
and both protected GitHub environments. Native variables, bindings, limits,
schedules, serial consumer and all six summary smoke checks passed. The existing
YouTube job published successfully at **23:57:28.555 UTC**, resolving the earlier
CPU failure and refresh hold.

The real **2026-10-30 00:00:17.063 UTC** hourly invocation completed on the current
deployed script, with unchanged catalog job/request totals and zero active jobs;
it created no empty catalog job. Five-minute maintenance completed at
00:00:44.992 UTC. The entire article batch finished by 00:02:53 UTC with
20 jobs / 20 attempts / zero failures. Final 00:05:12 checks found
20 ready/full manifests, 251 chunks and no missing FTS. Protected article text,
all eight selected-article chunk checksums/mappings, owner text-only search and
hydrated excerpt passed verification.

The 00:03:25.411 UTC completed-key replay left durable attempts, raw acquisitions
and manifest/chunk/FTS metadata unchanged. A complete controlled log window showed
one successful queue batch of one and its acquisition-usage event; queue depth
was zero before/after and approximate DLQ depth stayed three. Success logs omit
message ID/key, so this is correlated duplicate-guard evidence rather than direct
message-identity proof. The one observed `first()` statement was unmeasured;
reported zero writes do not establish measured zero writes. Historical DLQ
messages were retained without purge or replay.

The 00:00 monitor collection timed out on a native API read. Its still-fresh
23:50 normal/open $5 snapshot was retained without fabricated freshness or an
automatic pause. The next real collection recovered at **2026-10-30 00:10:25.976
UTC**, verified directly in R2 as normal/open with a $5 estimate and unpaused
queue. This is release acceptance against `3044d2ad` through that timestamp;
later main revisions retain their own exact-revision validation and receipts.

The later release checkpoint is **2026-10-30 00:49:23.637 UTC**:
[main pipeline 40980943229](https://github.com/jeremy-washam/media-tracker/actions/runs/40980943229)
passed validation, deployment and authenticated smoke for PR 13's revision
`8c89b44533b849e37cbc8b56bbe206224e7d1cdb`, merged at 00:38:23. All 907 TypeScript,
147 Python, 267 browser, 18 real-stack and 13 native runtime tests passed, with
72.42% coverage. The cross-midnight retry correction was live at this checkpoint.

After that release-acceptance checkpoint, the owner confirmed active Spotify
Premium at **00:16 UTC**. One manual catalog request was accepted at **00:17:34**;
its first bounded job still failed with `spotify_http_403`, verified at **00:18:28**,
with requested/returned/unavailable counters all zero. The existing 18,206 tracks
remain, with no new provider records. The owner's **00:23** screenshot confirms
Development Mode and a Client ID matching the retained deployment input. The
owner found the account absent from Users Management and added it. One bounded
catalog retry was accepted with HTTP 202 at **00:27:38 UTC**. By **00:28:05 UTC**,
the same pending job's tracks phase had 25 requested, 25 returned, zero unavailable
and no error, verifying track catalog API access. The account addition appears
to have resolved that access block. By **00:43:55 UTC**, 300 distinct track records
were verified; by **00:51 UTC**, the same ongoing job had returned 425 with zero
errors. The full job/backfill remained incomplete, and no remaining-count reduction
is claimed from its status field. Metadata progress is separate from source sync.
Premium restoration alone had not
resolved the observed API failure. Keep API flags and the source allowlist
unchanged, without another catalog retry while observing this job. No new
subscription/app, agent purchase, reauthorization or manual
credential replacement was performed.

A manual source attempt exposed current-day filtering of retained failed retries
across UTC midnight; that initial attempt did not establish a provider fetch. The PR 13
correction selects only the latest retained failed allocation across days and
atomically refuses its claim if a newer admission appears. It preserves the
original day/start, cumulative reservation/usage, cooldown, retry/attempt ceilings
and all new-allocation daily/23-hour, scheduler, lease and rolling guards, without
a migration or allowance reset. The focused suite passed 41 tests, including 12
new regressions. The full local check passed 907 TypeScript and 147 Python tests;
production build/dry run and all 13 native runtime tests passed, followed by the
successful exact-main release above.

One retained source HTTP retry started at **00:50:02.561 UTC**. Its caller's
60-second read timeout canceled the native invocation at **00:51:01.926 UTC**
(59,940 ms wall / 632 ms CPU), rather than a provider 403. Six raw objects and
196 source records were durable, latest at **00:50:52.618 UTC**; no cursor was
committed or advanced for this run, so full completion was not established.
The original October 29 admission/start `1793290076391` and attempt 3 / retry 2
were retained, with conservatively charged unknown attempt usage and a retained
`inFlight=1` marker. That marker does not establish an active provider request
after the known cancellation. Do not reset or resend.

After lease expiry at **01:10:02.016 UTC**, the existing guarded
`reconcile_source_runs.py` procedure closed exactly one visible orphaned run at
**01:10:31.849 UTC**. The reviewed plan was created at **01:10:19.133 UTC**, with
SHA-256 `91763b99147b49bc0cbba768c3225b7bb9c5183de6fb1c8fabdd7ef8e27d34bc`.
Verification at **01:10:50.447 UTC** confirmed failed status with
`source_run_interrupted`; repeated apply wrote nothing and reported one already
closed. All six raw objects / 196 source records were retained, with no cursor
committed for this run. Terminal counters stayed zero without reconstruction;
they do not imply zero durable work. The original October 29 admission/start
`1793290076391`, running status, attempts 3 / retry 2 and conservative `inFlight=1`
marker remained unchanged. Protected proof:
`.private/deployment/closeout-2026-10-29/spotify-canceled-source-closure-proof.json`.

At the **00:51 UTC follow-through checkpoint**, a change
to queue all four hosted manual source syncs with HTTP 202 and honest queued/
polling UI (retaining local HTTP 200) was in progress, not yet validated or
released. Full source success and catalog job completion remained open; no further
account input was needed. The next legitimate fresh Spotify allocation is
**October 30 15:07:56.391 UTC (11:07 EDT)**, with hourly cron at **16:00 UTC
(noon EDT)**. That genuinely eligible daily cycle remains to be observed.

At the **October 30 approximately 01:08 UTC** local validation checkpoint, the
queued-manual-sync change passed the full check (943 TypeScript / 147 Python),
production build/dry run, all 15 native runtime tests, all 18 Chromium/WebKit
real-stack tests and all 272 browser tests. Four light/dark desktop/narrow
screenshots and independent reviews passed. Its compiled-Worker TCP test observed the requesting
socket close while the synthetic provider response remained held, then released
the response and verified independent queue completion, durable raw records and
cursor commit. These completed local checks do not establish a new hosted release;
exact-revision hosted CI and delivery retain separate receipts.
The queued-manual-sync code is committed as `d9ea713`; PR 14's hosted validation
and release remain to be verified.
The original baseline's separate Mac-copy verification
passed at 21:59:41 UTC; fresh-backup evidence is recorded below.
The [deployment closeout](deployment-closeout.md) records remaining live
acceptance. No workflow creates another cloud resource,
changes provider secrets, starts paid services, purges a queue, or automatically
resumes background work.

## Research and decisions

Reviewed October 29, 2026:

- This repository is public; GitHub reports Actions enabled. Standard hosted
  Ubuntu runners are free for public repositories. Account billing usage could
  not be read with the current OAuth scopes, but private-repository included
  minutes are irrelevant to this runner choice. Workflows use Ubuntu 24.04,
  bounded job timeouts, no cache action, and no artifact uploads. Do not replace
  these with larger runners or upload private diagnostics. See
  [GitHub Actions billing](https://docs.github.com/en/actions/concepts/billing-and-usage).
- Validation uses `pull_request`, not `pull_request_target`. Its GitHub token is
  read-only and production credentials are absent. Official setup actions are
  pinned to full commits, checkout does not persist credentials, and only a
  successful current-main push can enter ordinary production delivery. See
  [GitHub secure use](https://docs.github.com/en/actions/reference/security/secure-use).
- Use the project's pinned Wrangler through pnpm rather than an independently
  versioned deployment action. Account API tokens live in protected GitHub
  environments. See
  [Cloudflare GitHub Actions](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/).
- D1 Time Travel is automatic on the production backend. Workers Paid retains
  30 days, with no additional charge for history or restoration. A bookmark is a
  short-term recovery point, not an independent/offsite copy. See
  [D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/).
- SQL export is not our complete backup format: D1 export does not support
  virtual tables, and contentless FTS cannot return its original indexed text.
  Keep the existing version-2 SQLite/R2 bundle, exact FTS token positions,
  checksums, source references, and independent restore verification. See
  [D1 import/export](https://developers.cloudflare.com/d1/best-practices/import-export-data/).
- Worker rollback does not restore connected database data or schemas. Never
  automatically roll back code after a migration without evaluating schema
  compatibility. See
  [Worker rollback limits](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/).

## Continuous validation

`.github/workflows/ci.yml` runs on pull requests, main pushes, and explicit
requests. A single validation job runs these gates serially:

1. Frozen-lockfile installation and Chromium/WebKit installation.
2. Credential-free loopback `.env.local` creation, refusing existing local
   credential files. All background provider/content/catalog work is disabled.
3. `pnpm check`: formatting, types, lint, TypeScript unit tests, Python
   deployment tests.
4. `pnpm build:production` and native Worker-runtime tests.
5. Browser regression tests with two workers and actual Worker acceptance tests
   in Chromium/WebKit.
6. Coverage with one worker; its output does not include runtime/browser tests.

A newer validation run for the same workflow/ref cancels an older one. Coverage,
traces, screenshots, databases, source exports, config, receipts, and credentials
are never uploaded to Actions artifacts. Test fixtures are synthetic. Production
secrets are introduced only in the separate deployment step, after trusted-main
checkout, dependency installation, and builds. Build scripts do not receive
production credentials.

Main now requires the strict `validate` check after its successful hosted run.
Protect workflow/release changes through review.
Never enable a `pull_request_target` job that executes a contributor's checkout.

## One-time delivery setup

The configured Git remote uses SSH, and a read-only `git ls-remote origin`
confirmed that the existing SSH key authenticates successfully. Use that Git
transport to push the reviewed workflow commits; no GitHub OAuth reauthorization
is needed for this path. GitHub CLI API access remains separate. If the Git
transport is later changed to HTTPS with an OAuth token, adding/updating workflow
files requires that token's `workflow` scope. See
[GitHub SSH authentication](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/about-ssh)
and [OAuth scopes](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps).
Never paste tokens into chat; runner pricing is independent of Git authentication.

Create `production` and `production-migrations` GitHub environments, restricted
to `main`. Require an owner review for the migration environment. Keep ordinary
validated delivery automatic if desired; no additional reviewer is technically
required for that environment. A single owner must remain able to approve their
own deliberately dispatched migration release.

Install these **environment** secrets, never repository files or workflow inputs:

| Secret                     | Purpose                                                                    |
| -------------------------- | -------------------------------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`     | Account-scoped deployment/management token                                 |
| `PRODUCTION_CONFIGURATION` | Exact protected JSON production config, with provider credentials excluded |
| `CF_ACCESS_CLIENT_ID`      | Dedicated service identity for fixed read-only smoke paths                 |
| `CF_ACCESS_CLIENT_SECRET`  | That identity's secret                                                     |

Use protected files/stdin with `gh secret set --env production NAME < file`;
repeat deliberately for `production-migrations`. The configuration contains
owner/Access identifiers, so it stays protected even though it contains no API
credentials. Commands suppress Wrangler output because it prints bindings.
Never enable shell tracing or print this structured configuration: masking a
whole JSON secret does not reliably redact its individual values.

The Cloudflare token needs permissions for the actual operations:

- Workers Scripts Edit: deploy and read settings, schedules, versions/deployments;
- D1 Edit: read migration inventory, retrieve Time Travel bookmarks, and apply
  reviewed migrations;
- Workers R2 Storage Edit: read operating state and retain tiny private release
  receipts in the existing bucket;
- Queue consumer reads are covered by Workers Scripts permissions; an explicit
  Queues Read grant is acceptable if required by the token policy.

Limit the token to the existing Cloudflare account. It needs no Access policy
write, billing write, DNS zone write, provider API tokens, encryption key, or
OAuth refresh token. Verify the live dry run/token permissions before enabling
CD; some Wrangler account-route operations may require an additional Workers
Routes Edit permission depending on account setup. Add only if a concrete
permission error proves it necessary.

The service identity must be allowed by Cloudflare Access and independently
recognized by the Worker. Its scope is queryless GET `/api/health` and the six
exact `/api/library/{books,movies,articles,podcasts,music,videos}/summary` paths.
It cannot browse private items, write, trigger jobs, or bypass owner MFA.

After live setup and a successful manual smoke, set repository variable
`PRODUCTION_CD_ENABLED=true`. Until then CI still validates and production jobs
remain skipped. Do not set this before all environment secrets and protections
are ready. Stop delivery by removing this variable; this does not pause the app.

The first activation needs a controlled bootstrap before this ordinary guard
can run: the old Worker lacks the dedicated smoke identity and operating-state
gate that `release.py` verifies before mutation. Preserve the old configuration,
Worker version, Time Travel bookmark and private phase receipts. Disable old
source crons, pause native delivery and detach its consumer, then deploy the new
maintenance runtime with writes disabled and its gate closed before migrations.
Verify drained leases, then capture/rehearse the fresh local backup under the
held pause; read-only capture may overlap the hold once writers have drained.
Require the full 20-minute pause and verified backup before reviewed migrations,
then accept the maintenance baseline.
Do not disable the guard to make later releases pass. The closeout
checklist owns this one-time sequence.

## Smoke transport troubleshooting

The deployment HTTP client sends `User-Agent: ImladrisDeployment/1.0`. On
October 29 the live `workers.dev` health endpoint returned 403 for Python
urllib's default identity despite valid service credentials; the same request
with this descriptive application identity returned 200. Accept-header changes
did not resolve it. Cloudflare documents this Browser Integrity Check behavior
and recommends a descriptive application User-Agent in its
[Error 1010 guidance](https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-1xxx-errors/error-1010/).
Keep redirect following disabled and error bodies private. Do not widen Access
policy or expose credentials to troubleshoot this transport rejection.

## Ordinary code release

After the exact main revision passes validation, the production job rebuilds
that immutable revision and invokes:

```sh
python3 scripts/deployment/release.py deploy --revision "$GITHUB_SHA"
```

The guard checks current origin/main, checkout cleanliness, authenticated health
and unauthenticated denial, exact live variables and storage/queue bindings,
consumer limits, schedules, runtime limits, and ordered migration history. It
refuses stale queued releases, divergent production settings, and any pending
migration. Reconcile the protected environment config deliberately after an
approved live settings change; do not blindly overwrite dashboard state.

Before a code mutation it validates production packaging with the existing CLI,
retrieves a Time Travel bookmark/current Worker deployment, and writes an
immutable phase receipt to private R2 `operations/releases/<release>/`. Further
receipts mark migration start/verification, deploy start, and smoke success. No
receipt includes source rows, provider secrets, or encryption keys. Failed or
missing receipt persistence blocks subsequent mutations.

Authenticated smoke checks health and real six-media summary JSON without
printing private results. A paused maintenance release checks health only;
run full summary smoke after explicitly resuming. The persistent emergency state
at `operations/operating-state.json` is retained. A release never clears it,
resets usage counters, purges messages, or automatically resumes queue delivery.
The production concurrency group serializes both code and migration releases.

If smoke fails, keep the recovery receipts, inspect safe errors, and follow the
recovery procedure. Do not rerun migration/deploy blindly. A subsequent main
revision cannot be deployed by an old queued run.

## Migration release

Normal delivery stops before an unapplied migration. To release one:

1. Review its SQL, compatibility, estimated work, and rollback/data-loss risks.
   Rehearse on synthetic schema/data with the existing migration tests.
2. Manually pause the app's background/write operations. Confirm native queue
   delivery is paused without deleting messages. Keep the persistent pause for
   at least 20 minutes so bounded in-flight jobs drain; verify source/catalog
   leases are inactive. Never use a spending/monitor-failure pause as evidence
   that a deliberate maintenance window was reviewed.
3. From the exact clean main revision, obtain the immutable inventory digest:

   ```sh
   python3 scripts/deployment/release.py plan
   ```

4. Dispatch `Reviewed migration release` on main with that digest and the
   recovery-review acknowledgment. This reuses the full validation job, then
   waits on the protected `production-migrations` environment.
5. The guard rechecks current main/settings, confirms the persistent manual
   pause and native queue pause, records the pre-migration bookmark/version,
   applies only that revision's pending migrations, verifies the full migration
   inventory, deploys the same revision, and checks authenticated health.
6. Check live schema/behavior and costs. Explicitly resume after acceptance, then
   run `python3 scripts/deployment/release.py smoke` with the protected Access
   service credentials. Update the protected configuration if the release
   intentionally changes settings. Record outcome and retained receipts.

A worker may have committed data before its lease expired. A pause is not a data
rollback. On any uncertain migration status, inspect applied migrations and the
retained prepared/starting receipt before choosing a forward fix or Time Travel.

## Backup coverage and retained evidence

| Layer                              | Protection                                                                         | Limit                                                                                |
| ---------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| D1 operational database            | Always-on Time Travel plus per-release bookmark                                    | 30-day Paid history; same provider/account                                           |
| Private R2 source evidence/content | Retain immutable source objects and manifests                                      | Retention alone is not an independent backup                                         |
| Operational state and receipts     | Retain `operations/operating-state.json` and `operations/releases/**` privately    | Exclude from source parsing and cache cleanup                                        |
| Version-2 local recovery bundle    | SQLite + R2 metadata/blobs, hashes, schema, views, sequences, exact FTS vocabulary | Its captured date is its recovery cutoff                                             |
| Encryption/provider credentials    | Owner-controlled protected credential store                                        | Must be escrowed independently; never put in source/bundle/Actions artifacts         |
| Optional offsite copy              | Existing owner-controlled destination                                              | Protects against Mac loss; not a deployment blocker or implied by local verification |

The accepted default is a protected folder on the Mac outside the repository
and Cloudflare. That independent local copy protects against provider/account
loss, but not loss of the Mac. No new backup service is required. Current live
database and objects total about 1.5 GB; reserve 5–6 GB for the full recovery
bundle including transfer data and independent restore-test copies.

The existing protected baseline and `verified.sqlite` are retained. Do not
replace/delete them as cleanup, copy the real private database casually, or
present the original baseline as a fresh production snapshot. General SQLite
SQL dumps and database-only exports cannot independently prove R2 completeness
or contentless-FTS recovery.

The original cutover bundle has been copied to
`/Users/jeremywasham/Backups/Imladris/original-cutover-2026-10-13`; its Mac-copy
verification passed at 21:59:41 UTC: 94 tables, 1,798,348 rows, 18,126 objects and
the independently restored FTS vocabulary. This historical baseline remains
retained alongside the fresh pre-migration recovery point.

Fresh capture completed under the held writer pause at
**2026-10-29 22:26:12.349386 UTC**. Its verified Mac copy is
`/Users/jeremywasham/Backups/Imladris/fresh-2026-10-29`, totaling 3,623,960,683 bytes:
97 logical tables, 1,818,662 logical rows and 18,283 R2 objects. Source and Mac copy
both passed independent-restore verification, including exact FTS vocabulary and
source-object references. Their manifest SHA-256 matches:
`a8d320cf62dac5a50d05823e1d182042c60323fca7853a4fd7089f683f1b3dca`.
The protected copy receipt is
`.private/deployment/closeout-2026-10-29/fresh-local-copy.json` (verified at
22:30:05 UTC). Capture omits the live operating-state key as documented below;
the backup does not claim offsite coverage.

Before release, migrations 0032–0034 were applied to a separate temporary copy of
the fresh restored SQLite database. The 22:30:39 UTC rehearsal verified ordered
migration history 31→34, full `PRAGMA integrity_check`, enabled foreign keys with
zero violations, both Hardcover ownership triggers, article retry/recovery
columns and the historical retry-count backfill. Retained backup hashes were
unchanged. The protected receipt is
`.private/deployment/closeout-2026-10-29/fresh-migration-rehearsal.json`; the
temporary database is retained separately in the adjacent
`migration-rehearsal-fresh-2026-10-29/` directory. The fresh recovery bundle itself
contains migration history through 0031; apply reviewed later migrations to a
separate restored target before using code that requires them.

Verify a trusted version-2 local bundle without copying records or changing
SQLite files:

```sh
python3 scripts/deployment/recovery.py \
  --bundle .private/deployment/<retained-bundle> --require-rehearsal
```

For a retained copy outside the repository, explicitly name the protected local
backup root. This keeps the default ignored-directory boundary intact:

```sh
python3 scripts/deployment/recovery.py \
  --trusted-local-root /Users/jeremywasham/Backups/Imladris \
  --bundle /Users/jeremywasham/Backups/Imladris/<retained-bundle> \
  --require-rehearsal
```

The trusted root and directories below it must be private (mode `0700`), and
retained files private (`0600`). Symlinked roots, linked path components, bundle
escapes, and unprotected files are refused before reading the manifest. All
checksum, SQLite, provenance, FTS, and independent-restore checks still apply.
This verifies the Mac copy; it does not claim offsite coverage or a fresh remote
capture.

Verification checks protected permissions/no symlinks, every retained file and
object checksum/size, SQLite integrity/foreign keys, all ordinary/virtual table
rows, views, ID allocators, raw/content references, and exact FTS vocabulary in
both the retained source database and independent restored database. It refuses
to call a missing independent restore verified. The report explicitly does not
claim current remote freshness, offsite coverage, or key escrow.

For a **new local synthetic or approved private snapshot**, the existing command
creates a fresh ignored bundle and a separate restore:

```sh
pnpm deployment:snapshot --database <approved-local.sqlite> \
  --r2-metadata <matching-r2-metadata.sqlite> --r2-blobs <matching-blobs> \
  --output .private/deployment/<new-name> --rehearse
```

A fresh production backup needs a consistent approved capture of native D1 plus
all referenced R2 evidence and FTS positions, followed by independent restore
verification. Existing snapshot/transfer tooling preserves those special
indexes, while `capture.py` reads fresh production data into the version-2
bundle without remote mutations. The October 29 recovery point above passed
these checks. A naive
`wrangler d1 export` replacement is insufficient. Offsite copying is optional;
record it only when actually performed. No new paid backup provider is assumed.

## Fresh read-only production capture

Use Python 3.12 with a SQLite build that permits local FTS shadow reconstruction.
The bundled Python runtime passed all 129 deployment tests without skips; some
macOS system Python builds enforce defensive SQLite mode, and capture refuses
those builds before account reads. Run the deployment tests with the same
Python interpreter selected for capture:

```sh
python3.12 -m unittest discover -s scripts/deployment -p 'test_*.py'
```

After disabling writers and confirming drained leases, run from the repository
root. The token file must contain only the existing release API token, mode
`0600`; output stays inside ignored `.private` while capturing:

```sh
python3.12 scripts/deployment/capture.py \
  --account '<account-id>' \
  --database '<database-id>' \
  --bucket media-tracker-raw \
  --token-file .private/deployment/release-api-token.txt \
  --output '.private/deployment/<fresh-capture-name>' \
  --reuse-bundle .private/deployment/paused-cutover-2026-10-13 \
  --writers-paused \
  --pause-id '<unique-uninterrupted-maintenance-window-id>' \
  --page-size 2000
```

Use the same pause ID to resume only while that exact writer pause has remained
uninterrupted. Resume rechecks target, schema and source-object inventory and
continues committed keyset pages and verified objects. A completed manifest is
verified/rehearsed locally rather than recaptured. Reuse avoids downloading
unchanged source objects only after current ETag and local checksum checks.
Only `operations/operating-state.json` is explicitly excluded so the independent
monitor can continue; all source artifacts remain subject to strict checks.

`--page-size` is optional and defaults to 2,000 rows. Responses are bounded to
32 MiB; oversized pages halve automatically without committing a failed page or
advancing its cursor. Native request/read ceilings are persisted across resumes.
The final-page inventory fix passed against 19 native pages and 18,284 objects.
The October 29 capture initially stopped on a weak HTTP ETag representation;
read-only diagnostics proved that its opaque 32-hex value, exact byte count and
full object MD5 still matched the held inventory. The transport fix accepts a
weak HTTP ETag only when its opaque value equals the inventory's single-part MD5
and streamed bytes independently match both the full MD5 and expected size.
Missing/mismatched validators, weak multipart ETags and incorrect bytes remain
rejected; conditional `If-Match` and strict before/after source inventories are
preserved. The same checkpoint resumed successfully: all 18,283 source objects
were retained, including 18,126 verified local-object reuses. Independent restore
and Mac-copy verification then passed as recorded above. Verify any future
finished bundle in the accepted protected Mac folder before recording that new
recovery point as retained.

The owner explicitly approved a separate encryption-key copy; it is saved and
verified in `/Users/jeremywasham/Backups/Imladris/credentials`, with owner-only
permissions. A separate proof at 22:30:20 UTC successfully decrypted one stored
credential locally using that backup, without retaining plaintext or making
external requests. Its protected receipt is
`.private/deployment/closeout-2026-10-29/encryption-key-recovery-proof.json`.
Possession of the key and database permits credential decryption. Keep both
protected, and never place provider credentials or this key in CI. This verifies
the local key copy; it does not claim offsite custody.

## Recovery sequence

1. Pause background work/queue delivery and preserve current evidence, operating
   state, latest Worker version, and migration/phase receipts. Record the incident
   time; do not delete failed jobs, reset reservations, or overwrite raw objects.
2. Determine whether the defect is code only, schema/data, or missing R2/keys.
   For code-only rollback, verify the earlier Worker is compatible with current
   schema and bindings. Worker rollback alone does not restore data.
3. For D1 corruption/bad migration, identify the exact pre-incident Time Travel
   bookmark in private receipts, verify it is within retained history, and
   calculate which writes would be lost. Stop writers before any restore. The
   actual restore is an explicit operator recovery step, never a CI retry.
4. For account/provider loss or older recovery, use the independently verified
   protected bundle in an isolated target with private R2 restored and encryption
   keys available. Keep original evidence and test all search vocabularies,
   provenance links, sequences, and actual inspectors before switching traffic.
5. Reconcile cursors and raw evidence before resuming. Do not advance a cursor
   based on a job message whose durable records were rolled back. Replay
   idempotently and preserve recovery provenance.
6. Recheck Access/MFA and unauthenticated denial. With the consumer detached,
   resume native queue delivery, then explicitly clear the R2 pause; verify both
   agree before reattaching the serial consumer. Clearing the gate first can
   recreate a sticky pause while native delivery remains paused. Run full live
   smoke/owner acceptance. Keep the incident recovery point and
   receipt; update the runbook with tested recovery time/data cutoff.

## Validation evidence to record

Local Python tests cover release rejection before mutation, migration digests,
live configuration drift, manual/native pause requirements, immutable recovery
receipt ordering, failed-smoke preservation, exact-main revisions, credential-
free CI, backup permission/checksum failures, and altered contentless FTS tokens.
The integrated `pnpm check`, builds, runtime/browser/acceptance/coverage gates
and intended-config dry run remain required before merging. Workflow syntax
validation alone is not a successful hosted CI run or recovery drill.

## Legacy interrupted source-run repair

`scripts/deployment/reconcile_source_runs.py` is an operator-only repair for
explicitly reviewed old Hardcover/Spotify source runs. It never starts a provider
request or changes raw objects, source records, cursor/accounting or credentials.
Use it only after inspecting the exact interrupted run; an old start date alone
is insufficient. There is no public repair endpoint or automatic age-based sweep.

The read-only `plan` operation accepts one to five exact `--run-id` values,
`--account`, `--database`, a mode-0600 `--token-file` and an ignored protected
`--receipt` path. It refuses recent/finished runs, active source leases, any
Hardcover progress, snapshot admission, Spotify catalog role or committed cursor.
It records every run field and emits only a plan SHA-256 and count. Review that
protected receipt; `apply` takes the same target/receipt/token arguments and
`--reviewed-sha256`, without new run IDs. The plan expires after one hour.

Apply rechecks fingerprints and recovery guards in one conditional all-or-none
SQL statement. Only status, observed closure time and a fixed interruption
diagnostic change. The closure time is when abandonment was established, not an
invented historical stop time. A protected attempt receipt precedes the write;
a lost response requires exact readback and never a blind retry. Retain plan,
attempt and completion receipts. This does not claim interruption automatically
repairs a provider outage or completes a snapshot.
