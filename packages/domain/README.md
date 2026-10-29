# Domain

Pure TypeScript definitions for media items, external identities, Archive
occurrences, source evidence, synchronization state, and precision-preserving
timestamps. The canonical semantics are documented in
[`docs/architecture/canonical-ledger.md`](../../docs/architecture/canonical-ledger.md).

This package must not import Cloudflare, database-driver, HTTP-framework, or UI
modules. External payload validation belongs at connector boundaries; database
constraints and persistence adapters belong in `packages/db`.

Instant normalization validates the source calendar date, time, and explicit
offset before converting to UTC. Impossible dates are rejected rather than
normalized into a different day. Calendar year/month/day precision remains
independent of instant normalization, including four-digit historical years.
