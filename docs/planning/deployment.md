# Private deployment preparation

Status: local preparation and restore rehearsal. Production has not been
provisioned or deployed.

The hosted app is one Worker serving React/Vite and Hono, with D1, private R2,
a sync queue, and a dead-letter queue. Retain the `media-tracker` infrastructure
names. A Cloudflare-provided `workers.dev` address is sufficient.

## Account prerequisites

In the target account, open Workers & Pages to initialize its subdomain, enable
R2 with billing activation, and enable Access/Zero Trust with owner-only login
and MFA. The current full-Library single-database layout requires Workers Paid:
the October 12 database is
about 1.4 GB; D1 Free permits 500 MB per database and Paid permits 10 GB. Workers
Paid starts at $5/month with usage-based overages. Account billing activation
and MFA enrollment are user steps, separate from resource provisioning.
See [D1 limits](https://developers.cloudflare.com/d1/platform/limits/) and
[Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/).

## Cost controls and storage audit

Workers Paid has no account-wide hard dollar cap. Create a budget alert for
$1 of usage-based spend in Manage Account → Billing → Billable Usage; the
recurring $5 plan fee is excluded. Alerts do not stop usage and can arrive the
following day. Account activation/alert creation has not been confirmed.
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
