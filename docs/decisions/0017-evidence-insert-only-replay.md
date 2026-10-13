# ADR 0017: Evidence insertion and replay

- Status: Accepted
- Date: 2026-10-13
- Supersedes insertion conflict details in ADR 0016; preserves its physical layout

## Context

SQLite `INSERT OR REPLACE` may delete an existing row without invoking its delete
trigger when recursive triggers are disabled. Evidence UPDATE/DELETE guards
alone therefore do not protect original role IDs and linking timestamps. This
weakness existed before evidence compaction.

## Decision

Forward migration 0029 makes evidence insertion append-or-replay at both the
physical table and compatibility view. Validate required fields, role, parents
and matching connection before suppressing duplicate-role insertion. An existing
Archive/source/role tuple retains its original ID and timestamp under every
insertion conflict mode. A genuinely new tuple cannot reuse another tuple's
evidence ID; that conflict aborts even under `INSERT OR IGNORE`.

If the incoming tuple already exists, its replay is a no-op even when its incoming
ID belongs to another retained tuple. Neither retained row changes. Canonical
targeted `ON CONFLICT` and reconciliation `INSERT OR IGNORE` remain idempotent
when replay carries a different incoming ID or linking time.

Ordinary duplicate-role `INSERT` now also returns a no-op instead of a uniqueness
error. SQLite triggers cannot inspect the caller's conflict algorithm; a shared
insert guard makes the retained-fact invariant independent of that algorithm.
The physical UNIQUE ID and tuple constraints remain. New valid role links are
still inserted. UPDATE and DELETE remain forbidden.

## Consequences

No stored evidence rows or timestamps change, and no guard rows or mapping tables
are added. Test both recursive-trigger settings, both write boundaries, conflicting
IDs, invalid inputs and valid replay. Apply the forward migration together with
the compatible application revision. Code predating evidence compaction cannot
write through its compatibility view using its old UPSERT; restoring old code
requires restoring the pre-migration database before enabling writes.
