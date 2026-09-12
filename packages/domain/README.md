# Domain

Pure TypeScript definitions for media items, external identities, Archive
occurrences, source evidence, synchronization state, and precision-preserving
timestamps. The canonical semantics are documented in
[`docs/architecture/canonical-ledger.md`](../../docs/architecture/canonical-ledger.md).

This package must not import Cloudflare, database-driver, HTTP-framework, or UI
modules. External payload validation belongs at connector boundaries; database
constraints and persistence adapters belong in `packages/db`.
