# One-time deployment account setup

The owner supplied both scoped account tokens on October 29. Both are active;
D1 and queue reads and the monitor's exact analytics query passed. The current
usage estimate is $5. The dashboard showed $0 usage overages; native alerts are
saved at $5 usage warning and $20 usage emergency, approximately $10/$25 total
including the existing $5 subscription. The release token is installed in both protected GitHub
environments; the monitor secret was verified in the accepted production
deployment of main `3044d2ad` through 2026-10-30 00:10 UTC. Existing
Wrangler OAuth remains separate from persistent runtime and CI credentials.

## Create two scoped Cloudflare API tokens

Use the existing account, with no zones/DNS or billing write permissions and no
API-token-management permission. These links prefill the official token form;
review the resulting permissions before creation. No paid service is added.

1. [Create the operating monitor token](https://dash.cloudflare.com/?to=/:account/api-tokens&permissionGroupKeys=%5B%7B%22key%22%3A%22account_analytics%22%2C%22type%22%3A%22read%22%7D%2C%7B%22key%22%3A%22d1%22%2C%22type%22%3A%22read%22%7D%2C%7B%22key%22%3A%22queues%22%2C%22type%22%3A%22edit%22%7D%5D&name=Imladris%20operating%20monitor). Permissions: Account Analytics Read, D1 Read, Queues Edit. Save only the token value in the ignored, mode 0600 file`.private/deployment/operating-api-token.txt` in the main repository checkout.
2. [Create the release automation token](https://dash.cloudflare.com/?to=/:account/api-tokens&permissionGroupKeys=%5B%7B%22key%22%3A%22workers_scripts%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22d1%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22workers_r2%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22queues%22%2C%22type%22%3A%22read%22%7D%5D&name=Imladris%20release%20automation). Permissions: Workers Scripts Edit, D1 Edit, Workers R2 Storage Edit, Queues Read. Save only its value in`.private/deployment/release-api-token.txt` in the main checkout.

Do not paste either token into chat. Keep a password-manager copy. The deployment
operator installs the monitor token as the existing Worker's
`OPERATING_API_TOKEN` secret and the release token as protected GitHub environment
secrets, validates each permission, then removes temporary input files after
successful installation. Provider credentials and encryption keys are separate
and are never copied into CI.

The official[Cloudflare token template documentation](https://developers.cloudflare.com/fundamentals/api/how-to/account-owned-token-template/)
defines these permission keys. If the dashboard drops a permission or the
account-token form is unavailable, stop and report the visible form; do not
substitute a global API key or grant broad account administration.

## Private release verification identity

A dedicated Access service token and Service Auth policy are also required.
The Worker independently permits only queryless health and six Library-summary
GETs for its exact Client ID. On October 29 the owner approved dashboard creation
of this identity; its Service Auth policy is attached and its credentials are
installed in both protected GitHub environments. Owner MFA remains unchanged.
Creation through the API connection returned 403, so neither runtime nor CI
API token was broadened to perform this setup. The identity never substitutes
for owner sign-in/MFA.

## Local backup destination

The owner accepted a protected folder on the Mac, outside the repository and
Cloudflare, as the default recovery destination. This protects against provider
or account loss; it does not protect against losing the Mac. An additional
offsite copy is optional and is not a deployment blocker. No new service is
required.

Current live database and object data total about 1.5 GB. Reserve 5–6 GB for a
full recovery bundle, which also contains transfer data and restore-test copies.
The retained original bundle passed verification and has been copied to
`/Users/jeremywasham/Backups/Imladris/original-cutover-2026-10-13`; that separate
Mac copy passed verification at 21:59:41 UTC: 94 tables, 1,798,348 rows, 18,126
objects and the independently restored search vocabulary.

The fresh pre-migration production bundle is also retained at
`/Users/jeremywasham/Backups/Imladris/fresh-2026-10-29`. Capture completed under the
held writer pause at **2026-10-29 22:26:12.349386 UTC**; Mac-copy verification passed
at 22:30:05 UTC. Its 3,623,960,683 bytes include 97 logical tables, 1,818,662 logical
rows, 18,283 R2 objects and an independently verified restore with exact search
vocabulary. The source and Mac-copy manifest SHA-256 both equal
`a8d320cf62dac5a50d05823e1d182042c60323fca7853a4fd7089f683f1b3dca`.
The protected receipt is
`.private/deployment/closeout-2026-10-29/fresh-local-copy.json`.

Migrations 0032–0034 passed a separate rehearsal on a temporary copy of the fresh
restore: ordered history 31→34, full integrity check, zero foreign-key violations,
ownership triggers and historical retry backfill verified. Retained backups were
unchanged. The receipt is
`.private/deployment/closeout-2026-10-29/fresh-migration-rehearsal.json`.
A Time Travel bookmark or another object in the same Cloudflare account does not
replace the local copy.

The owner explicitly approved a separate encryption-key backup. It is saved and
verified in the owner-only `/Users/jeremywasham/Backups/Imladris/credentials`
folder. A separate recovery proof at 22:30:20 UTC successfully decrypted one stored
credential with the backed-up key, without retaining plaintext or making external
requests. Its protected receipt is
`.private/deployment/closeout-2026-10-29/encryption-key-recovery-proof.json`.
Possession of this key and the database permits credential decryption; keep both
protected. Provider credentials are never copied into CI. These are verified Mac
copies; no offsite copy is claimed.

## Current GitHub setup

The `production` and `production-migrations` environments are provisioned for
`main` only; migrations require an owner review with self-approval allowed.
[PR 8](https://github.com/jeremy-washam/media-tracker/pull/8) is merged. Hosted
[main validation 40949037008](https://github.com/jeremy-washam/media-tracker/actions/runs/40949037008)
passed at `651a2be`; main requires the strict `validate` check. The maintenance
bootstrap began at 21:53:50 UTC on October 29 with the operating gate closed;
zero active source/catalog leases were confirmed at 21:59 UTC. Fresh recovery
verification and the separate local migration rehearsal passed before the
protected migration release of revision `9a6a877`.

Guarded ordinary delivery is now verified: exact-main revision `3044d2ad` passed
[pipeline 40975073224](https://github.com/jeremy-washam/media-tracker/actions/runs/40975073224),
including automatic deployment and authenticated smoke at **23:56:29.258 UTC**.
`CATALOG_AUTO_REFRESH=true` was restored at **23:57:19.646 UTC**, with the live
Worker, canonical configuration and both protected GitHub environments
reconciled. Native configuration, schedules, serial consumer and all six summary
smoke checks passed. The existing YouTube job published at **23:57:28.555 UTC**,
resolving the earlier publication CPU failure and temporary refresh hold.

The real **2026-10-30 00:00:17.063 UTC** hourly invocation completed, with no empty
catalog job; five-minute maintenance also completed. The article batch finished
by 00:02:53 UTC: 20 jobs, 20 attempts and zero failures. Final checks found
20 ready/full manifests, 251 chunks and no missing FTS. New article text/chunk
checksums, owner text-only search and hydrated excerpt passed. A controlled
completed-key replay preserved attempts, acquisitions and content/index metadata;
acceptance uses queue/log-window correlation because success logs omit message
identity, and its usage observation was not a measured zero-write proof.

The 00:00 monitor collection timed out on a native API read, preserving the
still-fresh 23:50 normal/open $5 measurement without a fake freshness update or
automatic pause. The next real collection recovered at **2026-10-30 00:10:25.976
UTC**; direct R2 readback confirmed normal/open operation, a $5 estimate and an
unpaused queue.

At the later **2026-10-30 00:49:23.637 UTC** release checkpoint,
[main pipeline 40980943229](https://github.com/jeremy-washam/media-tracker/actions/runs/40980943229)
passed validation, deployment and authenticated smoke for PR 13's merged revision
`8c89b44533b849e37cbc8b56bbe206224e7d1cdb` (merged 00:38:23). Its gates passed
907 TypeScript, 147 Python, 267 browser, 18 real-stack and 13 native runtime tests,
with 72.42% coverage. The cross-midnight retained-source-retry correction was live.

The owner confirmed active Spotify Premium again at **2026-10-30 00:16 UTC**.
One manual catalog request was accepted at 00:17:34; its first bounded job still
failed with `spotify_http_403`, verified at 00:18:28, with requested/returned/
unavailable counters all zero. The existing 18,206 tracks remain, with no new
provider records. The owner's 00:23 screenshot confirms Development Mode and a
Client ID matching the retained deployment input. The owner found the account
absent from Users Management and added it. One bounded catalog retry was accepted
with HTTP 202 at **00:27:38 UTC**. By **00:28:05 UTC**, the same pending job's
tracks phase had 25 requested, 25 returned, zero unavailable and no error,
verifying track catalog API access. The account addition appears to have resolved
that access block. By **00:43:55 UTC**, 300 distinct track records were verified;
by **00:51 UTC**, the same ongoing job had returned 425 with zero errors. The full
job/backfill remained incomplete; no remaining-count reduction is claimed from
its status field. Metadata progress is separate from source sync.
Keep API flags and the source allowlist unchanged,
without another catalog retry while observing this job. No new
subscription/app, agent purchase, reauthorization or manual credential replacement
was performed.

The deployed PR 13 correction retains original admission accounting and existing
guards without a migration. One retained source retry started at **00:50:02.561
UTC**, persisting six raw objects / 196 source records, latest at 00:50:52.618.
The caller's 60-second read timeout canceled its native invocation at
**00:51:01.926 UTC** (59,940 ms wall / 632 ms CPU); this was not a provider 403.
No cursor was committed or advanced for this run. The original October 29
day/start `1793290076391` and attempt 3 / retry 2 were preserved, with conservatively
charged unknown attempt usage and a retained `inFlight=1` marker. That marker
does not prove an active provider request after cancellation. Do not reset
or resend. After lease expiry at **01:10:02.016 UTC**, guarded reconciliation
closed exactly one orphaned run at **01:10:31.849 UTC**. Verification at
**01:10:50.447 UTC** confirmed failed status / `source_run_interrupted`, retention
of all six raw objects / 196 source records and no cursor committed for this run.
The repeat wrote nothing. Terminal counters stayed zero without reconstruction;
they do not imply zero durable work. Original admission day/start, running status,
attempts 3 / retry 2 and the conservative `inFlight=1` marker remained unchanged.

At the **00:51 UTC follow-through checkpoint**, a change to queue all four hosted
manual syncs with HTTP 202 and honest queued/polling UI (retaining local HTTP 200)
was in progress, not yet validated or released. Full source success, catalog job
completion and a genuinely next-eligible daily cycle remained acceptance work.
The next legitimate fresh Spotify allocation is October 30 **15:07:56.391 UTC
(11:07 EDT)**, followed by hourly cron at **16:00 UTC (noon EDT)**. No additional
account input is needed. See the
[closeout checklist](deployment-closeout.md) for current activation status and the
[release runbook](release-and-recovery.md) for exact protected secrets.

At the **October 30 approximately 01:08 UTC** local validation checkpoint, the
queued-manual-sync change passed the full check (943 TypeScript / 147 Python),
production build/dry run, all 15 native runtime tests, all 18 Chromium/WebKit
real-stack tests and all 272 browser tests. Four light/dark desktop/narrow
screenshots and independent reviews passed. The compiled-Worker test observed the requesting TCP socket
close before releasing a held synthetic provider response, then verified queue
completion with durable raw records and cursor commit. These completed local
checks do not establish a new hosted release; exact-revision hosted CI and
delivery have separate receipts.
The queued-manual-sync code is committed as `d9ea713`; PR 14's hosted validation
and release remain to be verified.
