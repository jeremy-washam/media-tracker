# Private deployment preparation

Current status and remaining acceptance gates are maintained in the
[deployment closeout](deployment-closeout.md). The private Library is live,
owner Access/MFA and remote transfer/restore are verified, and daily source sync
has been activated for three providers. The sections below retain the original
cutover procedures and dated transfer receipts. They do not establish current
activation or override the operating policy below.

## Account prerequisites

In the target account, open Workers & Pages to initialize its subdomain, enable
R2 with billing activation, and enable Access/Zero Trust with owner-only login
and MFA. Enable the App Launcher with a separate owner-only reusable policy so
the owner can enroll an authenticator. The enrollment policy must not require
the independent MFA device that it is intended to enroll; the application and
its own policy must still enforce MFA. The current full-Library single-database layout requires Workers Paid:
the October 12 database is
about 1.4 GB; D1 Free permits 500 MB per database and Paid permits 10 GB. Workers
Paid starts at $5/month with usage-based overages. Account billing activation
and MFA enrollment are user steps, separate from resource provisioning.
See [D1 limits](https://developers.cloudflare.com/d1/platform/limits/) and
[Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/).

## Cost controls and storage audit

### Current operating policy

On October 29 the owner approved the existing $5/month plan with modest ordinary
overages and requested protection against runaway bills. Warn near $10 total
and pause near $25 estimated total. New paid services/subscriptions require
approval. This supersedes the October 13/14 requirement for $0 additional usage
and per-operation allowance review. Expiring source grants and lifetime quotas
are retired by[ADR 0021](../decisions/0021-bounded-production-operations.md).
The[closeout checklist](deployment-closeout.md) records implementation and live
activation separately. Usage estimates/alerts have lag and are not invoice caps.

### Historical transfer and October14 audit

After completed verification, the production transfer ledger records 30,473,276
D1 rows read and 11,977,506 rows written, including the earlier interrupted
verification and conservative diagnostic reads. It measures this transfer, not every database, synthetic
validation, Worker invocation, R2 operation, or other account activity. Its
100-million-read/25-million-write deployment budget is an operation safeguard,
not an account billing cap. The completed R2 copy contains 18,126 objects and
211,643,751 bytes. The completed copy consumed 55,514 helper Worker attempts, including the
interruption and resume, below the unchanged 60,000 limit. The first pass
stopped automatically on HTTP 400. Batch metadata checks confirmed 17,003
existing copies and uploaded the 1,123 missing objects without overwrites; the
rejection did not recur. Batches are limited to 16 keys, so repeated metadata
checks consume fewer Worker invocations. Every object still receives an exact
checksum/size/metadata comparison. Authenticated failure diagnostics stay in
private mode-0600 files; no object keys or payloads are printed. The temporary helper used a 100 ms CPU ceiling, and the client persists a
60,000-request ceiling, bound to the exact endpoint and bundle. It reserves
requests before network dispatch, counts lost responses, refuses a missing or
mismatched ledger, and cannot reset its limit by restarting. Parallel uploads
share the same serialized counter. The nominal configured ceiling is 6 million
CPU milliseconds. A batch can issue at most 16 Class B reads, so the 60,000
invocation limit also bounds Class B reads below 960,000; each PUT invocation
performs one Class A write. Both are below included R2 operation allowances; runtime CPU limits have some flexibility and are not a hard
billing cap. Stop on unexpected usage or errors rather than raising the limit.

An account-wide analytics read on October 14 reported 13,830,556 D1 reads and
10,048,080 writes, 130 Worker requests and 676,215 microseconds of CPU, and only
small synthetic R2 operations/storage. D1 and Worker sampling intervals were 1.
The sole production bucket was empty. Included monthly usage is 25 billion D1
reads, 50 million D1 writes, 5 GB D1 storage, 10 million Worker requests,
30 million CPU milliseconds, and R2 Standard's 10 GB-month/1 million Class A/
10 million Class B operations. Native account metrics, the retained deployment
ledger, bounded request counts, and remaining work must be checked together;
none is permission to incur an overage.

After full verification, unsampled account-wide D1 analytics reported
36,785,628 reads and 15,108,120 writes, including the deleted synthetic test
database. The production transfer ledger is 18 reads more conservative than
native production analytics. The production database reported 1,170,182,144
bytes. R2 retained 211,643,751 payload bytes in Standard storage; Infrequent
Access usage was zero. Worker analytics reported about 55,608 requests and
89,873 CPU milliseconds, with adaptive sampling for the deleted helper. The
retained 60,000-request/100 ms helper bounds and native usage provide ample
headroom; these figures are usage evidence, not an invoice or a hard dollar cap.
No new subscription, paid service, or background processing was enabled.

Workers Paid has no account-wide hard dollar cap. Use a warning near $10 total (approximately $5 of
usage-based spend beyond the base plan) in Manage Account → Billing → Billable Usage. The
recurring $5 plan fee may be excluded by the dashboard metric; verify the alert's
basis rather than assuming its number is total spend. Alerts do not stop usage and can arrive the
following day. Account activation is confirmed by the owner. The supplied
billing screenshot shows two budget alerts; their thresholds are not visible.
See [budget alerts](https://developers.cloudflare.com/billing/manage/budget-alerts/)
and [alert timing](https://developers.cloudflare.com/changelog/product/billing/).

Production configuration retains a 30,000 ms CPU ceiling per invocation and now
declares separate API and write rate-limiting bindings: 120 API requests/minute
and 10 write requests/minute. Owner authentication precedes the counters;
over-limit API requests return 429 with Retry-After before route/database work.
Missing or unavailable hosted limiters deny API traffic. Static assets are
authenticated but do not use these counters. Explicit loopback development is
unchanged. The deploy guard requires both counters with distinct namespaces and
rejects larger limits or a missing/enlarged CPU ceiling. Reserve namespaces
1001 and 1002 for this app in the target account before provisioning.

These controls reduce bursts and repeated manual sync starts. They are not a
monthly spending cap: Worker invocations still count, background sync/queue work
does not pass through HTTP counters, and storage has its own charges. Rate-limit
counters are approximate and per Cloudflare location. Sync/cron/consumers remain
paused for cutover; catalog auto-refresh remains off.
See [Workers rate limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).

The October 12 verified local snapshot occupies 1,435,860,992 bytes (about 1.44
GB decimal). A read-only SQLite page audit grouped tables with their indexes:

| Stored data                                  | Approximate MB (decimal) |
| -------------------------------------------- | -----------------------: |
| History-to-source evidence links and indexes |                      499 |
| Source-record lineage and indexes            |                      259 |
| Spotify observations and metadata            |                      227 |
| YouTube observations, metadata and search    |                      219 |
| Canonical items, history and identities      |                      166 |
| Reader articles, annotations and search      |                       12 |
| Books and search                             |                       10 |
| Other tables and indexes                     |                       41 |

This is relational history/provenance, not downloaded music or video. Private
R2 evidence/content is a separate 211,643,751 bytes across 18,126 objects.
Only 2.7 MB of the SQLite file is free pages; reclaiming unused pages will not
bring it below 500 MB. The snapshot has 476,297 evidence links and 246,426 source
records. Evidence rows average 121 characters for their own IDs, 149 for Archive
IDs, and 100 for source-record IDs; those identifiers also occupy indexes.
Compact internal IDs and index-layout review are credible optimization targets,
but no reduction below 500 MB has been demonstrated. Preserve provenance and
idempotent replay when evaluating them; do not delete history to fit the plan.

D1 Free supports 5 GB across up to 10 databases, but each is limited to 500 MB.
Splitting this relational ledger would require repository/query and consistency
changes. It is an alternative design investigation, not a deployment setting.
Local-only operation avoids hosted usage entirely. The current deployment path
retains the full ledger in one paid database; it does not require a storage
redesign first.

### Row-count simplification candidates

The owner explored a Workers Free deployment using multiple databases, then
clarified that $5/month is acceptable and the priority is mindful data usage.
The [storage efficiency plan](storage-efficiency-plan.md) combines three agent
reviews and copy-only physical-layout experiments. It recommends one paid D1
database initially, measurable compaction and bounded lifecycle/job controls,
with database splits conditional on demonstrated benefit. Neither alternative
nor the proposed schema changes have been implemented; cutover remains paused.

A read-only audit of the verified snapshot found these concrete opportunities:

| Representation                                           | Current rows | Consolidated rows | Candidate reduction |
| -------------------------------------------------------- | -----------: | ----------------: | ------------------: |
| Archive evidence roles grouped by Archive/source pair    |      476,297 |           213,027 |             263,270 |
| All thumbnail variants grouped into one record per video |       88,690 |            18,723 |              69,967 |

The combined reduction is 333,237 rows, about 22% of the 1,505,632 application
and virtual-search rows. This is a grouping-based estimate, not a migrated or
validated database. Row-count reduction does not establish a byte-size reduction
or prove that a free database will fit.

Each consolidated evidence relationship must retain all original roles and
their linking timestamps and support existing reconciliation, identity, and
idempotency behavior. The snapshot has no pair whose roles have different
linking timestamps, but a future implementation must accommodate that case.
Thumbnail grouping must retain variant names, URLs, dimensions, and fetch/expiry
metadata; the estimate does not require dropping image variants.

There are also 34,517 additional source rows when raw-object/path identity is
grouped without parser version. These are retained interpretations, not proven
accidental import duplicates. Moving old interpretations out of active D1 would
require dependency analysis, preserved historical facts and stable references,
an independently verified archive, and successful replay/restore. Do not delete
them based on a latest-version filter alone.

A larger investigation could unify source-record tracking and typed playback
observations, retaining direct raw-object locators and parser metadata in one
observation representation. Genuine repeat plays must remain individually
queryable. Source-specific metadata and search projections should be reviewed
against actual query needs; removing useful indexes/projections can increase
daily rows read and slow Library browsing.

Evidence and source-record changes would revise accepted ADRs 0009/0010 and
their immutability rules. Write a superseding ADR and use forward migrations,
synthetic reconciliation/replay tests, and a full copy/restore rehearsal before
changing the live ledger. Current row counts and data remain unchanged.

The later copy-only experiments demonstrated that reducing rows and reducing
bytes are different goals. Grouped evidence preserving original IDs/timestamps
used about 224.6 MB versus the original 498.8 MB, but still needs SQL uniqueness
and immutability enforcement. Compact references with separate roles also showed
large savings. Grouped thumbnail variants saved about 5.4 MB despite removing
69,967 rows. See the plan for constraints, methodology and full-migration gates.

Prelaunch also requires a catalog freshness fix: pausing sync currently pauses
YouTube expiry cleanup, while stored browse/search projections can retain
expired overlays. Separate bounded maintenance from live provider ingestion and
verify current-clock source fallbacks/search as described in the plan before
introducing private hosted data. This gate is proposed, not implemented.

## Authentication and build

The Worker validates Access JWT signatures, RS256, issuer, audience, required
expiry/issuance/subject/email claims, application-token type, and the one owner
email. Missing configuration fails closed. An unverified email header cannot
authenticate a request. All requests, including assets and SPA deep links,
run through the Worker first. Protect the whole hostname with Access before
introducing private data.

Only explicit local configuration permits unauthenticated loopback requests.
Hosted requests cannot use that bypass. The production `/__scheduled` HTTP path
is unavailable. `SYNC_ENABLED=false` blocks HTTP writes and scheduled work;
queue deliveries are retried rather than processed while paused.

`pnpm build:production` produces a separate `apps/web/dist-production` containing
the operational app and allowlisted public assets. Private samples, design
studies, and the specimen are excluded. Normal local builds and development
retain the reference surfaces. Do not upload the local `dist` directory.

The tracked production example is for packaging checks only. After provisioning,
put these non-secret settings in ignored `.private/deployment/settings.json`:

```json
{
  "accountId": "actual account ID",
  "databaseId": "actual D1 database UUID",
  "teamDomain": "https://actual-team.cloudflareaccess.com",
  "audience": "actual Access application AUD",
  "ownerEmail": "the one allowed email"
}
```

```sh
pnpm --filter @media-tracker/cli build
pnpm --filter @media-tracker/cli start deployment configure .private/deployment/settings.json
```

This generates ignored `apps/api/wrangler.production.jsonc` with mode 0600.
Sync starts paused, with no cron or queue consumer, catalog auto-refresh off,
and preview URLs disabled. The deploy wrapper rejects placeholder resources,
missing identity and asset-authentication bypasses. While paused, consumers and
provider cron are forbidden; the only allowed cron is the explicitly enabled
`*/5 * * * *` cache-maintenance schedule. Provider credentials belong in Worker secrets; local secret files
are not uploaded automatically. The original token-encryption key must accompany
copied encrypted Spotify credentials.

## Ordered hosted transfer

`pnpm deployment:transfer` uploads a previously rehearsed version 2 private
bundle. It requires Python 3.9+ with SQLite FTS5 and the existing Wrangler OAuth
file; credentials never appear in arguments or diagnostics. Run `pnpm check`
and the isolated native D1/R2 rehearsal before transferring personal data.

```sh
pnpm deployment:transfer \
  --bundle .private/deployment/final-snapshot \
  --resources .private/deployment/resources.json \
  --oauth-file /absolute/path/to/wrangler/config/default.toml \
  --access-attestation .private/deployment/access-attestation.json \
  --phase d1
```

Repeat with `--phase r2 --r2-settings .private/deployment/r2-settings.json`,
then `--phase verify`. R2 defaults to four concurrent objects; `--r2-workers`
accepts 1–16 to bound transfer concurrency independently of D1. Keep all bundle,
checkpoint, settings, and attestation
files private. Refresh the Access attestation from current administrator API
reads before each phase. It is needed only when Wrangler's OAuth scopes cannot
read Access: version 1 includes UTC `issuedAt`/`expiresAt` (at most 15 minutes),
account/application/audience/owner/hostname identities, and the fresh full
`application` and `helperApplication` objects. The tool still checks native
Worker bindings, pause flags, schedules, consumers, and private bucket domains;
the attestation does not authorize bypassing any guard.

The resources file binds the account, database, bucket, production hostname,
Access application, owner, queues, and temporary transfer Access application.
The temporary R2 settings file supplies its exact account-derived Worker URL,
Access service-token ID/client ID/client secret, and a separate random bearer
secret. These are operation-owned temporary credentials, never provider keys.

D1 file imports are ordered and atomic, with a bundle/file hash receipt committed
in the same transaction as every schema/data/final-index file. Native receipts
are authoritative if an acknowledgment is lost; a persisted import bookmark is
polled before querying receipts. A failed or unknown import never becomes a
completed checkpoint. Preserve `remote-transfer/` when resuming. Its locked,
target-bound usage ledger accumulates native reads/writes across all phases and
stops normal work at 90 million reads or 20 million writes, reserving bounded
cleanup capacity within total ceilings of 100 million reads and 25 million writes.
Missing or uncertain usage
requires explicit reconciliation rather than an automatic retry. Requests are
paced and HTTP 429 retries are bounded. These deployment budgets are operational
stop thresholds, not account-wide billing caps.

Create its ignored private Wrangler configuration from
`apps/api/wrangler.transfer.example.json`, set the verified account ID and absolute
entrypoint path, and use an isolated test bucket for the native rehearsal. Deploy
with a protected secrets file containing a fresh 32-byte hexadecimal
`TRANSFER_SECRET`; create its temporary service-only Access application before
exposing the hostname. Bind the production bucket only after rehearsal passes.
The template is not part of the normal app deployment.

The temporary Worker streams native R2 binding operations, validates SHA-256,
preserves case-sensitive HTTP/custom metadata, and uses create-only writes.
It has no D1 binding, delete operation, provider credentials, cron, or preview
URL. Access accepts only its short-lived service token; a separate bearer secret
is also required. Before upload, the tool verifies the exact helper hostname,
production bucket binding, secret binding, and service-only Access policy.
Conflicting objects stop transfer rather than being overwritten. Interrupted
copies resume by comparing stored native checksums, sizes, and metadata.

Verification requires all receipts and exact remote schema/index/view/trigger
definitions, compares every typed row and allocator state, and checks foreign
keys and integrity. A uniquely named indexed vocabulary staging table supports
bounded keyset scans of FTS terms and positions. A durable, target-bound ownership
journal records each exact scratch name and CREATE definition before use. Cleanup
removes only matching journal-owned tables, including after interruption or a
normal-work budget stop, using the reserved 10 million reads/5 million writes
within the total ceilings. Unknown query/import usage still requires explicit
reconciliation before normal work resumes. Remote contentless tokens rebuild the independent local
verification SQLite artifact, which must pass the same vocabulary fingerprint.
Partial local artifacts are removed on failure and promoted only after success.
Standard D1 export remains unsuitable for virtual tables. Retain the original
bundle and the verified remote-derived restore artifact independently, plus a
D1 Time Travel recovery point.

After successful copy and owner browser smoke tests, delete the temporary
Worker, its Access application/policy/service token, and all isolated test cloud
resources. Keep production sync paused until provider-specific budgets and
single-owner Spotify token refresh are validated. Uploading existing provider
credentials and the original encryption key is a separately approved sensitive
step; read-only browsing can be validated while they remain local.

## Local transfer bundle and rehearsal

This is a local transfer utility, not generalized replay or remote backup. It
requires Python 3.9+ with SQLite FTS5 and never calls a provider or uploads data.
Confirm the database/bucket against the local bindings; do not choose
Miniflare's internal `metadata.sqlite`.

```sh
pnpm deployment:snapshot \
  --database /absolute/path/to/local-d1.sqlite \
  --r2-metadata /absolute/path/to/local-r2.sqlite \
  --r2-blobs /absolute/path/to/local-bucket/blobs \
  --output .private/deployment/new-snapshot \
  --rehearse
```

The tool copies byte-stable SQLite files, rejects active journals/changing files,
checks database and foreign-key integrity, and requires all current migrations.
The live Library remains untouched. Pause local writes for the final cutover
snapshot; a development rehearsal is not that final snapshot.

Version 2 manifests require SHA-256 hashes and sizes for both retained SQLite
backups. Rehearsal rejects old unhashed manifests; regenerate a new bundle rather
than treating an old physical backup as verified.

The ignored private bundle contains the SQLite backup; final schema; ordered
SQL files capped at 4 MiB with statements below D1's 100 KB limit; indexes and
triggers and compatibility views; migration names/checksums; and content-addressed R2 objects preserving
original keys, HTTP/custom metadata, lengths, and SHA-256 hashes. Cloudflare,
Miniflare, and FTS shadow tables are excluded. ID allocator state is preserved.
UNIQUE indexes that serve as foreign-key parent keys are installed before
records; remaining indexes and immutable triggers follow data. Application tables
such as `article_content_search_map` remain included.

Metadata FTS is rebuilt from stored inputs. Contentless Article FTS is rebuilt
from exact normalized token positions because SQLite cannot return its original
input. The restored index's term/document/column/position fingerprint must match
exactly, preserving phrase search independently of imperfect legacy byte ranges.
Existing chunk hash/range mismatches are reported separately and never silently
change source records.

The rehearsal restores a fresh SQLite database, then compares every application
table, compatibility-view row, search index, object, and supported evidence
reference. Views are installed after physical records and before their write
triggers; their logical digests are verified without double-counting physical rows. It prints only
aggregate diagnostics. The bundle contains personal history and encrypted
credentials and must stay private.

Standard D1 export does not support databases containing virtual tables. Do not
drop live indexes just to export a backup. This logical bundle avoids that
limitation locally; future remote backups need an equivalent tested export or a
D1 Time Travel recovery point. A local rehearsal does not validate remote import
behavior or hosted performance.
See [D1 import/export](https://developers.cloudflare.com/d1/best-practices/import-export-data/).

## Rollout and recovery gates

1. Integrate the UX/design changes and run `pnpm check`, `pnpm build:production`,
   E2E, and migration checks on the exact release revision.
2. Provision a new D1 database, private R2 bucket, sync/dead-letter queues, and
   an owner-only Access application using a reusable policy and MFA.
3. Generate the real configuration and deploy with sync paused, no cron or
   consumer, and catalog auto-refresh off. Verify private access first.
4. Pause local sync/import writes and make a fresh final bundle. Keep independent
   private copies of the database, R2 evidence, and encryption key.
5. Import schema (including required parent-key UNIQUE indexes), ordered records,
   then views/remaining indexes/triggers into the empty remote
   target. Do not apply seed migrations before this full-schema import. Preserved
   `d1_migrations` rows allow subsequent normal migrations. Upload objects under
   their original keys and metadata. Remote import/upload and resume tooling must
   be tested before this gate is complete.
6. Install secrets through protected input. Production becomes the only process
   rotating the copied Spotify grant; separate databases do not share refresh
   leases. Use fixtures or a separate grant for subsequent local live tests.
7. Verify anonymous/wrong-user denial, authenticated assets/deep links, all
   Library counts/inspectors, search/excerpts, provenance, object integrity,
   foreign keys, and bounded import continuation. Inspect logs and traces.
8. Validate clock-safe catalog fallback at the launch clock. Enable
   `MAINTENANCE_ENABLED=true` with only `*/5 * * * *`, retaining
   `SYNC_ENABLED=false`, no consumer and catalog auto-refresh off. Observe a real
   bounded cleanup, rows read/written and oldest expiry backlog. The maintenance
   invocation makes no provider requests and never rotates credentials.
9. Record explicit page/record/request/byte/retry and daily acquisition budgets
   for each provider job before enabling it. Enable sync and consumer/hourly cron
   deliberately, then verify actual delivery and resumability. The scheduled
   Spotify backfill resume is an enrichment workload even when catalog
   auto-refresh is off; it needs its own budget and activation review.
10. Record the deployed version and a D1 recovery point. Test the independent
    backup/restore procedure before calling hosted operation complete.

`pnpm deploy` builds production assets and uses the validated ignored target.
After configuration, a dry run is available:

```sh
pnpm --filter @media-tracker/cli start deployment deploy --dry-run
```

Worker code rollback does not restore D1/R2 data. Code predating migration 0027
cannot write its UPSERT through the compact evidence view. Rollback across that
boundary requires compatible writer code or restoration of the pre-migration
database before resuming writes. Pause writes before any data
restore. Do not resume local Spotify rotation against an obsolete copy of the
hosted grant. Account activation, MFA enrollment, remote transfer, hosted smoke
testing, and final cutover are still required after local preparation.

## October 12 local acceptance

- `pnpm check`: formatting, typechecks, lint, and 262 tests passed. The test
  run includes eight synthetic Python snapshot/restore cases through Vitest.
- `pnpm build:production`: package builds, the app-only asset bundle, and
  production-config Worker dry run passed. The output contains the operational
  app, its imported artwork/icons, and the allowlisted TMDB logo; private samples
  and development entries are absent.
- `pnpm test:e2e`: 36 tests passed after the concurrent UX count/tab fixes
  landed. An earlier run had five failures in those checks; no deployment work
  changed their assertions. The initial sandboxed run also could not reach the
  already-running local services; health checks and the final run used the
  verified existing frontend/API.
- An isolated Worker using the production configuration returned 503/no-store
  for the root, a Library deep link, a JavaScript asset, and the API when Access
  settings were missing, including with a spoofed email header. Its temporary
  server was stopped afterward; the main local servers were preserved.
- The full owner-data restore matched 1,505,632 rows across 87 tables, 18,126
  objects, 18,253 object references, both ID allocator states, and every search
  token position. SQL transfer data totals 988,699,270 bytes in 236 files;
  stored objects total 211,643,751 bytes. The source database was not modified.
- Twenty-six existing Article chunk hash/range inconsistencies were recorded.
  Object checksums passed and exact search positions were retained. This is a
  separate source/index-locator follow-up, not a claimed data repair.
- Cloudflare initialized the hosted subdomain. R2 and Access activation were
  still unavailable in the API check. Workers Paid was approved by the owner,
  but billing activation was not independently verified. No remote resources,
  private-data uploads, or deployment were performed.

These results cover the local preparation. The shared checkout continues to
receive design work; rerun release gates on the final frozen revision before
publishing it. Private bundle/account details remain under ignored `.private`.

### Subsequent usage-control verification

The rate-limit addition passed the 270-test suite, followed by all 26 affected
Access, usage-limit, and deployment-guard tests after narrowing the helper's
binding type. Production build/Worker dry run recognized both native rate-limit
bindings. Changed-file formatting passed. The full `pnpm check` stopped on
formatting in concurrently edited UI components; a later workspace typecheck
encountered unfinished JSX edits in the Library pages. Those frontend files
were not changed by this work. This is not a fully green shared release, and
the controls have not been deployed or tested against the remote account.

## Isolated storage implementation verification

The `codex/storage-efficiency` worktree contains migrations 0026/0027/0028, scoped usage
reporting, bounded maintenance and corrected snapshot restore ordering. The
original local ledger and UI checkout remain unchanged. Detailed measurements
and the unresolved performance gate are in the
[storage implementation acceptance](storage-efficiency-plan.md#october-12-isolated-implementation-acceptance).

A full private copy and independent restore passed: 94 tables plus the evidence
compatibility view, every original evidence tuple, 18,126 R2 objects and 18,253
references. Fresh restored storage is 1,168,740,352 bytes versus the original
1,435,860,992-byte snapshot. This is not a Free-plan fit or a reduction in the
recurring plan fee. Cache publication adds occupied pages but preserves refresh
isolation and current-clock expiry while provider sync is paused.

The synthetic remote D1 database was created, tested and deleted. Official D1
file import correctly handled all migration SQL including nested CASE trigger
bodies; REST query transport did not. Keep schema, record and final view/trigger
phases ordered, and verify full-size import/resume behavior on the release target.
A second synthetic import verified the final missing-parent guard under outer
`INSERT OR IGNORE`; its temporary database was also deleted. No Worker or private
data was deployed. The October 12 account refresh confirmed
R2 and Access still disabled; Workers Paid activation remains unconfirmed.

Final `pnpm check` passed all 310 tests across 51 files, formatting, typechecking
and lint. Production builds/dry run, 82 browser regressions, ten snapshot
recovery cases and eight isolated native Worker browse/search checks passed.

Local Channels measurements showed increased CPU cost. Full-data D1 read/write
and latency measurements, plus a quiet-host comparison, remain mandatory before
adopting this cache implementation in production. Provider daily acquisition and
retry budgets also remain activation gates; all production background controls
remain off by default.

## October 13 independent review fixes

The review identified avoidable catalog joins in source membership counting,
inactive Channel grouping scans, and an accepted second-page filter request
exceeding D1's 100-parameter limit. The fixes use physical source counting,
mode-first Channel branches and one JSON-array binding per selected filter.
They preserve dynamic grouping for partial expiry and the existing query contract.

Forward migration 0029 hardens evidence insertion against replacement, as recorded
in ADR 0017. Version 2 snapshot manifests verify both retained SQLite backups,
in addition to SQL payloads, objects, restored records and search positions.
Scheduled provider jobs now have independent usage scopes and cloned bindings,
including failure reporting. Native `first()` remains explicitly unmeasured.

These changes do not enable background work or deploy private data. Full-size
remote transfer/resume, remote performance and cleanup throughput, provider
budgets and account activation remain deployment gates. The full-copy restore now verifies both physical backup hashes. Local query
comparisons and the remaining correctness overhead are recorded in the storage
plan; final release checks include the integrated UI revision.

## October 13 merged local acceptance

The reviewed storage implementation and fixes are merged with the current Library
UI. Frontend source and browser tests were preserved from main. On the integrated
revision, `pnpm check` passed formatting, typechecks, lint and 337 tests across 53
files; all 142 Playwright browser tests passed on isolated ports. Production
package builds, app-only assets and the Worker dry run passed.

Before applying migrations 0026 through 0029 to the local ledger, independent
copies of its database and R2 metadata were created with verified hashes and
integrity under ignored `.private/deployment/before-storage-merge-2026-10-13`.
The local API was stopped during migration. Post-migration hashes matched all
1,107,878 retained rows across eleven ledger/source/identity/observation/Queue
tables using their original columns, including all 476,297 evidence role links.
New private storage keys were excluded from the original-column comparison.
Foreign keys and full SQLite integrity checks passed.

A temporary paused Worker on an isolated port served health, all sixteen Library
collections, video details and video History successfully against the migrated
local database. A catalog-write request returned the expected 503 while paused.
The temporary Worker was stopped afterward. No provider acquisition, cloud
deployment or billing change was performed. Remote import/resume, authenticated
hosted validation, measured D1 costs and provider-job budgets remain deployment
gates. The before-migration backup must be retained until hosted recovery is
verified.

## October 13 account provisioning

The owner completed Workers Paid, R2, and Zero Trust onboarding. R2 and the
Zero Trust organization were verified through the API; the connection lacks
billing-subscription read permission, so Paid activation is owner-confirmed.
An empty `media-tracker` D1 database, private `media-tracker-raw` R2 bucket,
`media-tracker-sync` queue, and `media-tracker-sync-dead-letter` queue now exist.
R2 public access is disabled. No private records or objects have been uploaded.

A reusable owner-email Allow policy protects the entire production workers.dev
hostname. Independent MFA is enabled for that application and policy with
authenticator apps, biometrics, or security keys. The organization permits
these methods without imposing global MFA on unrelated applications. Real
resource identifiers and owner settings remain in ignored deployment files.

The deployment CLI now imports its emitted JavaScript module explicitly and
resolves relative settings paths from the repository root, matching the documented
pnpm command. The compiled configure command was verified from the package
working directory. The real configuration starts with sync, maintenance,
provider refresh, cron, and queue consumers paused, and preview URLs disabled.
Wrangler requires a separate browser OAuth authorization; connector access
alone does not authenticate the CLI. Hosted authentication, remote transfer
and resume, integrity, cost measurements, and recovery gates remain open.

### Paused Worker publication

Wrangler browser authorization completed for the intended account. The repaired
CLI generated the real paused configuration and passed a production dry run.
`pnpm check` passed formatting, typechecks, lint, and all 337 tests across 53 files;
`pnpm build:production` passed package builds, the app-only asset bundle, and
Worker packaging. The existing app was published against the empty database and
private bucket. Private records, raw objects, and provider secrets remain local.

Remote configuration confirms the CPU ceiling and both rate-limit bindings,
Access mode, the intended owner and audience, disabled preview URLs, no cron,
no queue consumers, and all three background flags false. Public requests to
the homepage, Library deep link, JavaScript asset, and health API were denied,
including spoofed identity headers. Browser-style health requests redirect to
the configured Access login. The owner must verify the actual sign-in and MFA
flow before private data transfer. Full-size import and resumability tooling,
hosted data integrity, cost measurement, and recovery remain open gates.

### MFA enrollment prerequisite

The first owner sign-in encountered Cloudflare's disabled App Launcher screen.
Independent MFA was enabled, but its enrollment application had not been created.
The App Launcher is now enabled with its own reusable owner-email Allow policy
and the same Cloudflare identity provider. It permits enrollment without an
already-enrolled independent MFA device. The Imladris application and its
separate owner policy continue to require MFA.

The Launcher and `/AddMfaDevice` route now redirect unauthenticated requests
to sign-in, and the hosted health route still redirects to Access. Owner
enrollment and the authenticated health response remain pending. Do not upload
private Library data before that flow is verified. See Cloudflare's
[App Launcher setup](https://developers.cloudflare.com/cloudflare-one/access-controls/access-settings/app-launcher/)
and [authenticator enrollment](https://developers.cloudflare.com/cloudflare-one/access-controls/access-settings/independent-mfa/#enroll-authenticators).

### Owner access and native transfer rehearsal

The owner completed sign-in/MFA, confirmed the hosted health response, and opened
Books Archive. The full Library has not yet been copied. With explicit owner
approval, the eight existing provider settings and original token-encryption key
were installed as encrypted Worker secrets. The key decrypted the retained
Spotify credential locally without contacting Spotify. Production still has
sync, maintenance, and automatic catalog refresh disabled. The owner will perform
the hosted browser checks; agent access to Chrome is unnecessary.

Isolated native D1 tests preserve exact typed rows, embedded NULs/line endings,
large integers, binary values, schema definitions, and reconstructed contentless
phrase search. Repeated transfer adds no duplicate writes. An invalid file import
leaves neither its table nor its records behind. Native R2 tests preserve exact
bytes, zero-byte objects, and case-sensitive metadata; an 86,178,068-byte stream
passes end-to-end hashing, while checksum failures and overwrites are rejected.

A native scale rehearsal staged 3,100,000 synthetic search-token instances in
3,065 ms of SQL time with exactly 3.1 million rows read/written. Hot-term keyset
pages read 2,000/2,001/2,001 rows for 2,000 results, confirming indexed pagination.
Its tables were removed; native test usage was approximately 6.2 million reads
and 3.1 million writes. Personal data transfer and full hosted integrity and
owner browsing remain the next gates.

### Import status recovery

The first production copy committed the schema and eight data files. A subsequent
status poll returned `Not currently importing anything.` despite the matching
receipt for the latest file. This is lost completion status, not a confirmed SQL
rollback. The copy stopped rather than retrying or assuming zero usage. Native
D1 analytics are available through Wrangler authentication and reported
`avg.sampleInterval = 1`; native write-query count matched the nine receipts.

Resume the D1 command with `--reconcile-import-status` and
`--reconciliation-extra-reads 9` for this incident (declare `0` only when no
external diagnostic reads occurred). Use opt-in import-status reconciliation
only for this exact status-loss case.
It requires an exact pending bundle/file receipt and payload identity, a fresh
unsampled per-database native counter snapshot covering the target's lifetime,
a write-query count matching the receipts, and totals covering recorded usage.
Record any external diagnostic reads separately; for this incident the sole
manual receipt query read nine rows and wrote none. Never clear unrelated query
uncertainty or treat an actual SQL failure as a completed import.

### Authorization recovery during verification

An October 14 verification pass stopped on an HTTP 403 shortly before the
Wrangler token's advertised expiry. No failed-query charge or scratch table
was left unresolved. The client now handles an authorization rejection within
three minutes of OAuth expiry by waiting in intervals of at most 30 seconds,
then letting Wrangler renew the expired token and retrying once. Unexpired
permission denials outside that narrow window still stop without refreshing;
static API tokens are never replaced. This does not broaden permissions or
change billing limits. An independent management-connection renewal is needed
when its Access/MFA attestation expires.

### Completed hosted restore verification

The owner renewed the separate Cloudflare management connection remotely using
`codex mcp login cloudflare --no-browser`, requesting read scopes and session
renewal. The owner approved from a phone and supplied the full callback URL to
the waiting CLI even though its loopback page could not load there. This CLI
login expires after five minutes; both approval and callback submission must
finish within that window. Keep the login process alive across the handoff,
and restart with a fresh URL after a timeout. This management connection is
separate from the application's owner-only Access/MFA login.

A fresh native Access read confirmed the sole owner policy and independent MFA.
Account usage was checked before resuming the guarded verifier. Wrangler
renewed through its expiry boundary without stopping the completed pass. All
94 tables and eight search indexes matched; the complete remote-derived restore
is retained privately with a SHA-256/size manifest. It is 1,169,264,640 bytes.
The frozen source file was 1,714,311,168 bytes and contained 498,814,976 bytes of
free pages; physical file size is distinct from retained data. No imported
facts were removed to produce the verified recovery copy.

The verifier left no owned scratch tables or unmeasured queries. The temporary
R2 helper Worker, its Access application/policy, and service token had already
been removed after object verification. A fresh Time Travel bookmark was saved
after scratch cleanup; this captures a recovery point and is not a destructive
Time Travel restore test. Retain original backups and private transfer records.
Owner-authenticated Library smoke checks subsequently passed as recorded below.
Measured hosted behavior and separate provider-job budgets remain launch gates.
Background sync, maintenance, and catalog auto-refresh remain disabled.

### Owner Library smoke acceptance

The owner confirmed that Books, Movies, Articles, Podcasts, Music, and Videos
load in the deployed app, then separately confirmed search, filters, item
details/history, and an article excerpt work. The requested owner-authenticated
Library smoke checks passed. Hosted performance still needs measurement.

Usage reporting exists for HTTP requests, scheduled jobs, and queues, but the
job observer reports measurements after operations; it does not reserve or
stop work against a daily allowance. Provider pagination still lacks the
planned durable per-day request/record/byte reservations. Keep all background
classes disabled while measuring representative operations and defining and
testing their budgets. Configure maintenance separately, then enable provider
classes individually only within verified included account allowances.
