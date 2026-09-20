# ADR 0011: Source-derived Queue relationships

- Status: Accepted
- Date: 2026-09-20
- Refines the deferred Queue section of the canonical ledger specification.

## Context

The Library product contract now includes Queue for Movies, Articles, Books,
Podcasts, and Videos. Four of those sources expose a current upstream membership
that is distinct from consumption history. Books already keeps its Hardcover
status projection source-owned, while the remaining sources need common
membership lifecycle and provenance rules.

This decision does not add manual Queue editing or resolve future conflict rules
between local intent and upstream services.

## Decision

Add a generic source-derived Queue relationship and evidence link:

- one entry per connection and source membership key;
- a canonical media item reference and source relationship type;
- optional source-added temporal value with precision and basis;
- active, removed, or unknown upstream state;
- first/last observation and removal-observation times; and
- source-record evidence for membership, added time, and removal.

Only a successful complete snapshot of the relevant relationship may retire an
entry because it is absent. Partial snapshots, failed imports, finite feeds, and
observations from another connection cannot. Retiring Queue membership never
retires Archive history or deletes source evidence.

Media-specific source projections and product rules still determine whether an
upstream record qualifies. Books may continue deriving Queue directly from its
Hardcover relationship projection rather than duplicating it in the generic
table.

## Consequences

Archive and Queue can overlap. Queue freshness describes its source snapshot,
not live synchronization. The table is intentionally read-only in the initial
Library: local additions/removals, write-back, conflict resolution, and a
locally authoritative desired state remain deferred and require a superseding
decision.
