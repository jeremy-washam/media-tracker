# Storage efficiency and predictable usage

- Date: 2026-10-12
- Status: proposed implementation plan; no production schema or retention change
- Owner preference: Workers Paid at $5/month is acceptable. Reduce unnecessary
  data amplification and measure ongoing usage; Free is an option, not a target
  that overrides correctness or simplicity.

## Recommendation

Keep one paid D1 database for the relational ledger and private R2 Standard for
raw imports and authorized content. Improve the representation, cache lifecycle,
and job budgets before introducing another operational database. Reconsider a
split when measurement identifies an independently owned workload, contention,
or capacity pressure.

This retains accepted [platform](../decisions/0001-cloudflare-native-platform.md),
[storage boundary](../decisions/0004-d1-r2-storage-boundary.md), and
[portability](../decisions/0006-portability-boundaries.md) decisions. Physical
schema changes need an append-only ADR refining the affected parts of
[ADR 0009](../decisions/0009-canonical-ledger-identity-and-evidence.md) and
[ADR 0010](../decisions/0010-reconciliation-and-recovery.md). A proposal does not
supersede those decisions or authorize deletion of retained evidence.

The implementation sequence is: measure and fix paused cache maintenance,
rehearse compact references/evidence layouts, choose the validated layout,
then deploy and enable bounded background work. Storage work can follow the
first deployment if its migration is not ready; the existing paid database fits.
Cache freshness and private access are launch gates in either sequence.

## Measured baseline and independent reviews

Three agents reviewed evidence/schema, history/catalogs, and database/economics.
They used current repository code, accepted ADRs, official provider/platform
documentation, and copy-only experiments. The source database was not changed.
All figures below refer to the verified October 12 deployment snapshot, not a
new measurement of the concurrently running local app.

| Measurement                                          |                              Baseline |
| ---------------------------------------------------- | ------------------------------------: |
| SQLite file                                          | 1,435,860,992 bytes (1.44 GB decimal) |
| Application and virtual-search rows across 87 tables |                             1,505,632 |
| Distinct media items                                 |                                58,906 |
| Archive entries                                      |                                60,363 |
| Index pages                                          |                     700,612,608 bytes |
| Table pages, including FTS backing structures        |                     732,442,624 bytes |
| Unused pages                                         |                          about 2.7 MB |
| Private R2 objects                                   |            18,126 / 211,643,751 bytes |

The row total is not a consumption-event count. Index entries and FTS shadow
tables are excluded from that row total, while their physical pages count toward
file size. About half the allocated space is indexes. Removing useful indexes
can increase rows scanned and latency; index count alone is not a removal rule.

### Evidence layout experiments

Every prototype expanded to exactly the original 476,297 evidence role records:
zero missing or additional records, including their original IDs and timestamps.

| Isolated layout                                                          | Evidence rows |       Bytes |
| ------------------------------------------------------------------------ | ------------: | ----------: |
| Current text references, separate roles and indexes                      |       476,297 | 498,814,976 |
| Text references, grouped roles with original IDs/timestamps              |       213,027 | 224,595,968 |
| Integer references, grouped roles, experimental ID dictionaries included |       213,027 | 165,715,968 |
| Integer references, separate roles, dictionaries included                |       476,297 | 236,220,416 |

The grouped text layout demonstrates about 274 MB less physical storage in this
isolated experiment. Compact references also save substantial space while
retaining every role row. These are not complete production schemas: grouped
JSON currently lacks the original global SQL uniqueness constraint on evidence
IDs and operational immutability triggers. Equality after expansion does not
prove safe concurrent writes, reconciliation, or migration.

The integer experiments include 68,255,744 bytes of standalone stable-ID
dictionaries. In production, introduce durable integer keys in the existing
`source_records` and `archive_entries` tables while keeping their existing text
IDs unique and externally stable. Do not add permanent mapping rows merely to
reduce the evidence row count. A whole-database rehearsal must determine net
bytes; subtracting isolated experiment totals from the full file is not a
validated size forecast or evidence of a database below 500 MB.

Prefer the separate-role/integer-reference candidate initially if it preserves
constraints with less semantic change. Adopt grouped roles only if it passes
the same invariants and its additional storage/write savings justify the extra
write/query machinery. Role grouping must preserve separate linking timestamps:
none differ within a pair in this snapshot, but future input may differ.

### Thumbnails and playback observations

A second exact-preservation prototype groups all thumbnail variants per video:

| Thumbnail representation |   Rows | Bytes including indexes |
| ------------------------ | -----: | ----------------------: |
| Separate variant rows    | 88,690 |              17,772,544 |
| Per-video JSON variants  | 18,723 |              12,345,344 |

All variant names, URLs, dimensions, fetch dates, and expiry dates matched.
This removes 69,967 rows but saves only about 5.4 MB. Its main prospective value
is fewer refresh writes; verify D1 write metadata rather than assuming the
logical row reduction equals billable write reduction. Retain an indexed expiry
field and the current thumbnail-selection behavior.

All 152,275 song observation/source pairs repeat connection, parser version,
and occurrence timestamp. They also support 304,550 admission/time evidence
links. Header consolidation is a later candidate; the generic source layer
currently gives every observation stable addressability and replay uniqueness.
Keep this boundary during the first migration.

There are 959 track/timestamp groups with multiple observations, 3,924 actual
zero-duration export observations, and 44 API observations with unknown duration.
Do not deduplicate by track and timestamp, discard zero/unknown values, or replace
playback detail with a latest-date summary. Those changes would alter history.

### Historical parser interpretations

The 34,517 additional source rows grouped by raw object/path without parser
version are retained interpretations, not proven accidental imports. Older
candidate rows still support 23,345 first-observation identity references,
79,138 Archive evidence links, and 1,236 Queue evidence links. Source records
have inbound foreign keys from 30 tables.

Defer removal/archival. A future cold-provenance design needs stable locator
stubs or a resolver, preserved parser/disposition/date facts, verified reference
reachability, a self-contained export, and restore/replay tests. Raw source files
alone do not preserve the existing interpreted reference graph.

## Storage choices and economics

| Choice                                                     | Recommendation       | Evidence needed to reconsider                                                           |
| ---------------------------------------------------------- | -------------------- | --------------------------------------------------------------------------------------- |
| One paid D1 + private R2 Standard                          | Default now          | Forecast capacity or measured contention                                                |
| Several paid D1 databases                                  | Conditional          | Independently owned/rebuildable workload with a clear consistency boundary              |
| Several free D1 databases                                  | Optional alternative | Owner prioritizes removing subscription; verified storage, CPU, usage and bootstrap fit |
| D1 active ledger + historical interpretation archive in R2 | Defer                | Proven cold query boundary, stable resolver, reference and restore equivalence          |
| Another relational/analytical service                      | Defer                | Concrete workload or transaction requirement D1 cannot reasonably meet                  |

Paid D1 includes 5 GB aggregate storage, 25 billion rows read/month and 50 million
rows written/month. Additional storage is $0.75/GB-month; reads $0.001/million;
writes $1/million. Multiple databases share these account totals. Reducing the
current stored bytes improves headroom and transfer size, but does not reduce the
$5 Workers subscription. [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/)

D1 Free permits 10 databases, 500 MB per database and 5 GB total. Paid permits
10 GB per database. Cross-database operations do not inherit the current single
binding's transactional `batch()` guarantee. Reader and Spotify each span more
than one media type, and source imports/connections span cohorts; media boundaries
need measurement and explicit recovery design.
[Limits](https://developers.cloudflare.com/d1/platform/limits/),
[transactional batches](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch)

Workers Paid starts at $5/month with 10 million requests and 30 million CPU
milliseconds included. R2 Standard includes 10 GB-month, one million Class A
operations and ten million Class B operations; Infrequent Access does not offer
that free allowance. Queues normally use three operations per small successful
message, with additional reads on retry. None is a reason to duplicate data
across services without a measured benefit.
[Workers](https://developers.cloudflare.com/workers/platform/pricing/),
[R2](https://developers.cloudflare.com/r2/pricing/),
[Queues](https://developers.cloudflare.com/queues/platform/pricing/)

Free bootstrap timing remains unverified. Existing-data inserts and index
creation count as usage; the dedicated bulk-import API reports rows written,
and no documented exemption was found. At ordinary 100,000 writes/day, 1.5
million inserts imply roughly 15–16 quota days before index amplification, but
that is arithmetic, not measured bulk-import behavior. Test a small synthetic
remote import before committing to a Free rollout schedule.
[D1 FAQ](https://developers.cloudflare.com/d1/reference/faq/),
[import API](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/import/)

## Mandatory catalog freshness gate

The current paused configuration disables scheduled work and has no cron.
`apps/api/src/index.ts` returns before the YouTube expiry purge when
`SYNC_ENABLED=false`. Videos list/search read stored projections and FTS that
can retain expired catalog overlays; the detail query's description expiry
check does not protect all returned fields. Rebuild correctly excludes expired
catalog data when it runs. Snapshot cache entries expire around October 21.

Separate local cache maintenance from provider ingestion. Housekeeping must
run in bounded durable work while ingestion is paused and must make no provider
API calls. Prelaunch, purge/rebuild at the launch clock. Add current-clock
freshness protection for list/detail fields, filters, facets, counts, and search;
serve source-backed fallbacks even when maintenance is late. Keep source and
catalog search distinguishable so an expired catalog title cannot remain a hit.
Do not merely hide an expired item: its owner's history remains available.

The production deploy guard currently forbids all cron/consumers during paused
cutover. Amend it only for an explicitly defined maintenance mode with tested
job routing; never use that exception to resume provider ingestion or token
rotation. Clock tests must cross expiry with sync paused and provider fetch
configured to throw. Assert source fallback, no stale overlay, correct search,
and unchanged membership/history. Test maintenance interruption and resume.

YouTube cache expiry follows [ADR 0012](../decisions/0012-refreshable-provider-catalog-cache.md)
and [provider policies](https://developers.google.com/youtube/terms/developer-policies).
Spotify catalog payloads account for 17,292 objects / about 66.9 MB. They are
mutable enrichment, but [ADR 0014](../decisions/0014-spotify-catalog-retention-interim.md)
explicitly records the owner's interim indefinite-retention choice. Propose a
finite lifecycle as a separate owner decision and superseding ADR; do not
silently purge them. Spotify does not prescribe a numeric TTL, so any chosen
interval is an app policy, not a provider guarantee.
[Spotify terms](https://developer.spotify.com/terms)

## Measurement and budgets

Measure bytes, query cost and growth independently of logical row count:

| Metric                                           | Collection point                                | Action                                                             |
| ------------------------------------------------ | ----------------------------------------------- | ------------------------------------------------------------------ |
| D1 bytes, table/index bytes, growth              | Platform totals; private SQLite/export analysis | Review capacity forecast and amplification                         |
| Rows read/written per route and job              | D1 result metadata and account analytics        | Investigate expensive scans, repeated rebuilds or redundant writes |
| Worker CPU per HTTP/import/cron/queue invocation | Workers analytics                               | Set ceilings from observed useful work                             |
| R2 bytes, object counts and operations           | Bucket analytics and manifests                  | Bound new acquisitions and retry snapshots                         |
| Queue operations, retries, age and backlog       | Queue/job diagnostics                           | Stop retry storms; preserve resumable jobs                         |
| Provider calls, content bytes, no-op syncs       | Connector aggregate summaries                   | Tune cadence and per-run/per-day limits                            |

The portable DB result types currently omit D1 metadata; the adapter forwards
results without emitting usage metrics. Add an optional aggregate observer at
the adapter/runtime boundary. Keep domain code platform-independent. Do not
log SQL parameters, raw payloads, private titles, tokens, or per-record output.
Use route patterns and job types. Do not convert bounded `first()` calls into
unbounded result buffering just to collect metadata; use platform aggregates
where method-level metadata is unavailable.

Set a $1 usage-based budget alert, which excludes the recurring subscription.
Alerts are delayed and informational, not an automatic stop. Retain owner-only
Access, API/write burst limits and CPU ceilings. Native rate counters are
approximate and local to Cloudflare locations, so they are not monetary caps.
[Budget alerts](https://developers.cloudflare.com/billing/manage/budget-alerts/),
[rate limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)

Proposed engineering headroom: review at 3 GB aggregate D1 or a forecast above
4 GB in the next 90 days; plan action before a single DB approaches 7–8 GB.
Investigate any included usage metric reaching 80% of its allowance. These are
review thresholds, not platform limits or approved spend increases. Include
rehearsal/staging resources in totals. Optional enrichment pauses first; history
work remains durable and resumable rather than discarded.

Before enabling each job class, configure explicit ceilings for pages/records,
acquired bytes, provider requests, attempts/backoff, daily new acquisitions and
concurrency. Choose numerical defaults from representative measured jobs, then
record them in the owning connector plan. Unlimited or unspecified budgets must
not be the default. A daily budget reservation must be durable; finishing a job
reconciles its actual usage. Delayed billing telemetry cannot enforce a hard
dollar ceiling. User-triggered history backfills report exhaustion and resume
later; they must not silently truncate records.

Catalog auto-refresh off is not a universal catalog pause: the scheduled handler
also resumes unfinished Spotify backfills after sync is enabled. Define and test
that budget separately. Enrichment, maintenance and ingestion need distinct
controls. Review Workers Logs pricing before its announced December 1, 2026
transition; sampled aggregate telemetry must not become another large dataset.
[Logs pricing](https://developers.cloudflare.com/workers/platform/pricing/#workers-logs)

## Implementation stages and exit criteria

### 1. Baseline, freshness and usage visibility

Ownership: API runtime, DB adapter, catalog repositories and deployment guard.
Keep schema/credential migration serialized. Add usage reporting and bounded
maintenance, capture representative browse/search/sync measurements, and fix
the paused-cache gate above. Record bootstrap separately from steady state.

Exit: expiry tests pass with ingestion disabled and no provider calls; source
fallbacks/search remain correct; metrics are aggregate/redacted; each enabled
background class has a recorded budget. No live-data cleanup without a verified
reference/retention rule.

### 2. Full-copy schema rehearsal and ADR

Ownership: DB schema/repositories, canonical import writers and CLI transfer.
Compare compact separate-role and grouped-role layouts in the whole database,
preserving public IDs. Exercise uniqueness and per-role immutability, including
different role timestamps and rejected conflicting IDs. Keep original indexes
unless measured replacement queries improve total cost.

Exit: a new ADR selects the physical layout; measured rows, table/index bytes,
write metadata, query plans and timings are recorded; correctness matches the
acceptance matrix below. No 500 MB target is assumed. The selected change must
show a material gain without introducing a read-cost or latency regression.

### 3. Forward migration and repository integration

Build forward migrations from the current schema and from an empty database;
do not edit applied migrations. Update schema models, evidence admission and
retirement, Letterboxd reconciliation, source-reference joins, all relevant
writers, and snapshot/restore logic together. Keep API/domain IDs and source
semantics stable. Integrate thumbnail grouping as a separate bounded change so
its smaller benefit and expiry behavior can be verified independently.

Exit: all acceptance checks and required repository gates pass on the final
revision, with a separate destination restore. A small synthetic remote D1
rehearsal confirms actual migration/import and constraint behavior. Do not
change the live ledger during experimentation.

### 4. Private deployment and controlled activation

Follow the [deployment runbook](deployment.md): account activation, owner Access,
private assets, independent backups, paused final snapshot, remote import and
R2 verification. Use the validated new schema if ready; otherwise retain the
existing paid schema and schedule compaction after deployment.

Enable maintenance first, then source ingestion/queue classes individually.
Observe actual jobs, quotas and retries. Production alone rotates the copied
Spotify grant. Preserve a pre-migration database, R2 evidence and encryption
key; code rollback alone does not reverse a data migration.

Exit: authenticated Library, counts/inspectors/search and source evidence match;
anonymous/wrong-user requests fail; remote restore works; actual scheduled and
queue jobs obey their budgets; measured steady use is reviewed.

### 5. Optional lifecycle and further consolidation

Review Spotify cache retention with the owner and write a superseding ADR if
changed. Pilot source/typed-observation header consolidation only when it keeps
common source addressability, ignored/invalid states, and corrected parser
interpretations. Consider cold historical interpretation storage only after a
stable resolver and self-contained export/restore exist.

Exit: any reclaimed objects/rows are proven cache-only or safely archived;
restore and query equivalence pass; the owner-approved retention policy and
provider requirements are recorded. No deletion based on age or latest-parser
version alone.

### 6. Capacity decision after representative operation

Review growth and actual contention after a representative month, sooner if a
headroom threshold fires. A second DB proposal must name the owning dataset,
transaction boundary, cross-store references, routing, query aggregation,
idempotent commit/cursor sequence, backup consistency and recovery procedure.
Do not put an occurrence and its active evidence in different databases merely
to satisfy a size target. Another platform needs a demonstrated workload win.

Exit: retain one DB if it meets budget/performance goals; otherwise approve a
specific split or migration using measured before/after costs and recovery tests.

## Acceptance matrix and execution boundary

Verify exact canonical and per-account occurrence counts, period totals,
same-second multiplicity, null versus zero duration, date precision, first/last
source references, ratings/reviews and explicit clearing, Queue membership,
overlapping export/RSS reconciliation, failed-import retry, identical replay,
new-parser replay, interrupted batches, cursor commit order, and token leases.

Expand compact evidence to original role/ID/timestamp records and compare both
directions. Check foreign keys and SQLite integrity. Verify complete search
results, FTS phrase/token-position equivalence, the existing 26 Article locator
issues without claiming to repair them, inspectors and all 17 implemented pages.
Measure geometry only if UI behavior changes; storage work should preserve it.

Before a code/configuration handoff run `pnpm check`, relevant production build,
Playwright, fresh/upgrade migration tests and diff checks after final edits.
Separate copy-level, local runtime and remote acceptance results. Restore an
independent destination and verify source-object references and checksums.
Pause ingestion before cutover and do not resume an obsolete local Spotify grant.

This planning task ran aggregate audits and copy-only layout comparisons, not
production migrations or application validation. Experiment artifacts remain
ignored under `.private/deployment/analysis-evidence/` and `analysis-catalog/`.
No private data is embedded in this document. Implementation must be staged
sequentially across shared schema/contracts/writers despite parallel analysis;
unrelated UX work in the shared checkout remains outside this plan's edit scope.
