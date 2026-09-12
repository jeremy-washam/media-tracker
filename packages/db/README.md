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
a successful sync run for the same connection.

Internal IDs and source occurrence keys must be stable across replay. Raw bytes
remain in R2; this package stores their immutable manifest and every normalized
lineage link.
