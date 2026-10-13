# ADR 0016: Compact physical evidence references

- Status: Accepted; full-copy and synthetic remote validation passed, production
  migration pending
- Date: 2026-10-12
- Refines physical storage in ADR 0009 and recovery in ADR 0010

## Context

The October 12 snapshot contains 476,297 Archive evidence roles. Their table and
indexes use about 499 MB, largely from repeating long Archive and source IDs.
Grouping roles can reduce rows further, but must separately preserve global
evidence-ID uniqueness, linking timestamps and immutability. Retained parser
interpretations and playback observations still have live references.

## Decision

Keep one evidence row per role. Add a private positive integer `storage_id` to
the existing `source_records` and `archive_entries` parents. Keep their public
text primary keys, current inbound foreign keys, occurrence uniqueness and
source-date meaning. Do not rebuild either parent table or introduce mapping
rows to stand in for canonical entities.

Migration 0027 populates keys once from current ROWIDs. Subsequent writes allocate
keys inside SQLite's serialized insert transaction using an indexed maximum.
Allocated keys and public IDs cannot change. Keys are internal references, not
externally published identifiers or lifetime allocation tokens; deleting an
unreferenced highest-key parent could permit reuse. Live references prevent
parent deletion through foreign keys.

Store roles in `archive_entry_evidence_storage`, a `WITHOUT ROWID` table keyed
by `(archive_storage_id, source_storage_id, role)`. Preserve the original unique
text evidence ID, role and `linked_at`. Retain matching-connection checks,
immutable role rows, restricted parent deletion and an index for source lookup.
Keep `archive_entry_evidence` as the original five-column compatibility view.
Its insert trigger supports reconciliation's `INSERT OR IGNORE`; update and
delete remain forbidden. Canonical replay targets the physical table with the
same pair/role conflict behavior. Forward migration 0028 explicitly rejects missing
public parents before the scalar key lookup, even with an outer `INSERT OR
IGNORE`. Valid duplicate-role inserts remain idempotent; invalid parent
references cannot be silently omitted.

Install explicit UNIQUE parent-key indexes before any child records. Restore
physical tables and records before compatibility views and their triggers. Backups retain allocated parent keys, all evidence IDs/timestamps and
separate logical-view fingerprints. Verify every original evidence tuple and
unchanged ledger/source rows on a full private copy, then restore another
destination. Synthetic remote D1 must verify migration/constraint behavior
before production adoption.

## Consequences

This reduces repeated text in evidence indexes without deleting role rows.
Parent inserts add a key-allocation update and unique-index maintenance; local
bytes and query plans cannot substitute for remote D1 write metadata. Measure
bootstrap separately from steady operation and use a paid target initially.

Dropping old structures can leave unused SQLite pages. Compare occupied pages
and a fresh logical restore; do not assume the in-place file immediately shrinks
or run unverified vacuum operations against a live D1 database. Preserve the
pre-migration database/R2/key backup; a code rollback cannot undo this migration.

Thumbnail grouping, observation-header consolidation and cold parser archival
remain separate candidates. This decision changes no retention policy and
removes no source, playback, Archive or raw-object history.
