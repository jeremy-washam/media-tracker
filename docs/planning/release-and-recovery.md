# Releases and recovery

This document owns the repeatable release and recovery procedures for the
private hosted Imladris Library. The [deployment runbook](deployment.md) owns
resource identity, Access setup, and initial cutover;
[source sync rollout](source-sync-rollout.md) owns provider activation.

## Implementation and activation status

The repository now defines credential-free pull-request validation, guarded
production delivery, a separate reviewed migration release, and read-only
backup verification. Implementation and local synthetic tests do **not** mean
GitHub environments, credentials, branch rules, or hosted delivery are activated.
The[deployment closeout](deployment-closeout.md) records current account setup,
local/native validation and pending live acceptance. The release owner must
record the first successful hosted workflow and fresh independent recovery
rehearsal there. No workflow creates another cloud resource,
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

Require `Validate / validate` on main through a GitHub branch rule/ruleset after
its first successful hosted run. Protect workflow/release changes through review.
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

| Layer                              | Protection                                                                         | Limit                                                                        |
| ---------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| D1 operational database            | Always-on Time Travel plus per-release bookmark                                    | 30-day Paid history; same provider/account                                   |
| Private R2 source evidence/content | Retain immutable source objects and manifests                                      | Retention alone is not an independent backup                                 |
| Operational state and receipts     | Retain `operations/operating-state.json` and `operations/releases/**` privately    | Exclude from source parsing and cache cleanup                                |
| Version-2 local recovery bundle    | SQLite + R2 metadata/blobs, hashes, schema, views, sequences, exact FTS vocabulary | Its captured date is its recovery cutoff                                     |
| Encryption/provider credentials    | Owner-controlled protected credential store                                        | Must be escrowed independently; never put in source/bundle/Actions artifacts |
| Offsite independent copy           | Owner-selected encrypted destination                                               | Destination/retention must be confirmed; not implied by local verification   |

The existing protected baseline and `verified.sqlite` are retained. Do not
replace/delete them as cleanup, copy the real private database casually, or
present the original baseline as a fresh production snapshot. General SQLite
SQL dumps and database-only exports cannot independently prove R2 completeness
or contentless-FTS recovery.

Verify a trusted version-2 local bundle without copying records or changing
SQLite files:

```sh
python3 scripts/deployment/recovery.py \
  --bundle .private/deployment/<retained-bundle> --require-rehearsal
```

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
verification. The existing guarded transfer tooling handles those special
indexes; a naive `wrangler d1 export` replacement is insufficient. Choose and
validate an encrypted offsite destination before claiming independent disaster
recovery complete. No new paid backup provider is assumed.

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
6. Recheck Access/MFA and unauthenticated denial, run full live smoke/owner
   acceptance, then explicitly resume. Keep the incident recovery point and
   receipt; update the runbook with tested recovery time/data cutoff.

## Validation evidence to record

Local Python tests cover release rejection before mutation, migration digests,
live configuration drift, manual/native pause requirements, immutable recovery
receipt ordering, failed-smoke preservation, exact-main revisions, credential-
free CI, backup permission/checksum failures, and altered contentless FTS tokens.
The integrated `pnpm check`, builds, runtime/browser/acceptance/coverage gates
and intended-config dry run remain required before merging. Workflow syntax
validation alone is not a successful hosted CI run or recovery drill.
