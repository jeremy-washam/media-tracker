# Database

SQLite/D1 schema, forward-only migrations, and repository implementations for
the canonical media ledger.

- `migrations/`: ordered SQL owned by the application. Apply these with Wrangler
  in deployment environments; never edit a migration after it has been applied.
- `src/schema.ts`: the matching Drizzle schema used for typed query construction.
- `src/repository.ts`: replay-safe persistence operations over a narrow database
  port. Connectors and route handlers depend on its interfaces rather than D1.

`SqlCanonicalLedgerRepository.commit()` submits one atomic database batch. When
the batch includes a sync cursor, the cursor is deliberately written last, after
all D1 records it covers. The database also rejects cursors that do not refer to
a completed sync run for the same connection. `partially_succeeded` may advance
a checkpoint only when the primary scan committed successfully and optional
independent work failed; running, pending and failed runs cannot advance it.

Internal IDs and source occurrence keys must be stable across replay. Raw bytes
remain in R2; this package stores their immutable manifest and every normalized
lineage link.

Migration 0002 adds encrypted rotating credentials and refresh leases, isolated
from the ledger in `src/credentials.ts`. Apply it before Spotify syncing. Back up
D1 and the encryption secret together; ciphertext alone cannot recover a grant.
History and sync-run queries use keyset pagination. Archive updates explicitly
distinguish partial observations from rating/review snapshots and latest-play
evidence. Superseded fallbacks retain admission and removal evidence.

Migration 0027 preserves public text IDs and all evidence role rows while using
private immutable integer parent keys in `archive_entry_evidence_storage`.
`archive_entry_evidence` remains the original five-column compatibility view.
Canonical UPSERTs target physical storage; reconciliation can use the view's
insert trigger. Install UNIQUE foreign-key parent indexes before records, then
restore physical records before views and immutable triggers,
and verify logical evidence fingerprints. See ADR 0016 and the private deployment
runbook before migrating retained data.

`D1DatabaseClient` accepts an optional aggregate usage observer. It forwards
native result metadata once per operation/batch and preserves persistence
results/errors even when reporting fails. Native `first()` has no metadata and
remains unmeasured; result coverage must accompany observed row counts.

Migration 0028 explicitly rejects missing evidence parents even when a caller
uses `INSERT OR IGNORE` through the compatibility view. Valid duplicate roles
remain idempotent.

Migration 0029 enforces append-or-replay evidence insertion even under
`INSERT OR REPLACE`. Existing tuple IDs/timestamps are preserved; new tuples with
reused IDs abort. Ordinary duplicate tuple INSERT is now a no-op. Required fields,
roles and parent/connection constraints are checked before replay suppression.
See ADR 0017.

Migration 0031 fences provider writes against catalog job lease generations.
`reserve()` returns the monotonically increasing attempt count; every job
transition requires that token and consumes its ownership. Workers wrap their
media/ledger database client with `fenceCatalogDatabase` so the ownership check
and each write batch share one transaction. The guard table is empty after both
successful writes and rolled-back failures. Publish/rebuild before advancing or
completing the job; enqueue failures retry the persisted continuation, rather
than mutating a completed attempt. Apply the migration before deploying callers
that use fenced databases. It also permits checkpoints from completed partial
runs under the primary-scan rule above.
Spotify catalog completion/failure updates the durable job and its owning sync
run in the same fenced transaction. Terminal run counts come from the committed
job counters, including any final partial-progress delta on failure.

Spotify snapshot membership uses a JSON array bound once, so large saved-show
and saved-episode snapshots do not exceed D1's 100-parameter statement limit.
Article content completion verifies its source version in the publication
transaction; late obsolete indexing cannot replace newer ready text.
`hasContentChunkRange` verifies contiguous persisted ordinals and their search
rows before the content pipeline publishes a completed extraction.

Books, Movies, Videos and Spotify pagination hash query fingerprints. This keeps
cursors bounded as filters grow. Decoders also accept matching legacy raw
fingerprints so previously persisted pages can continue after a deployment.

Repository tests use the complete current migration chain. Named historical
migration boundaries are reserved for populated upgrade tests. The shared
synthetic-only adapter in `src/test-support/sqlite.ts` enables foreign keys,
atomic rollback and D1's per-statement parameter ceiling, captures actual queries
for plan checks, and exposes statement/batch failure injection. Local SQLite
coverage still needs complementary Worker/D1 integration tests.

Migration 0035 adds artist image URLs and acquisition state/time separately from
track-credit metadata. Artist lists and inspectors share that stored image.
Exact catalog lookups prioritize pending artists by lifetime playback count;
success with no image and 404s both leave a stable fallback without deleting
credits or listening observations. Track metadata refresh does not erase photos.
