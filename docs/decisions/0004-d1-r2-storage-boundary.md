# ADR 0004: D1 and R2 Storage Boundary

- Status: Accepted
- Date: 2026-07-18

## Context

Normalized records need transactions, constraints, indexes, and joins. Provider
exports, API snapshots, and article text can be large, irregular, or useful for
reprocessing and should not consume relational database capacity.

## Decision

Store canonical metadata, identities, events, cursors, sync state, and raw-object
manifests in D1. Store immutable source payloads, exports, and authorized full
text in private R2 objects addressed by opaque keys and content hashes.

## Consequences

D1 remains small and queryable while R2 retains replay evidence cheaply. Writes
across D1 and R2 are not atomic, so ingestion must use explicit states and safe
retries. Backups and deletion procedures must account for both stores.
