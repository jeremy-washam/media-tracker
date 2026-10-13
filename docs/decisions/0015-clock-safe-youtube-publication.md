# ADR 0015: Clock-safe YouTube publication and bounded maintenance

- Status: Accepted for local implementation; full-copy and synthetic SQL checks
  passed, full-data performance and production validation pending
- Date: 2026-10-12
- Refines ADR 0012; retains its source-history and publication rules

## Context

Paused deployment disables provider sync. A projection rebuilt while catalog
fields were valid could retain those fields and search terms after their expiry.
Cleanup alone cannot make reads correct when a cron is delayed. Direct reads of
the mutable refresh tables would expose partially completed catalog jobs.

## Decision

Keep the materialized video projection source-only. Successful catalog jobs
publish selected normalized video, channel, category and thumbnail fields into
separate rebuildable publication tables. Refresh staging does not overwrite a
still-valid publication. Every publication statement rechecks the exact completed
job inside the transaction; a newer staged/failed job cannot publish partial data.
History-only rebuilds reuse an already published job rather than copying its
provider fields again. Publication, source projection and origin-specific
full-text search are rebuilt transactionally with an active-job guard.

Each read captures one clock and applies it to all provider fields, association
rollups, filters, counts, detail and search. Owner-source documents have no cache
expiry; video, channel and category search origins carry their own expiry. Each
query token must match a currently valid origin. Public IDs and history remain
unchanged when overlays expire. Cursor generations include publication revision
and the next expiry so pagination detects changes at the deadline.

Keep a compact numeric channel aggregate for the fully valid publication, and
the source-only channel baseline for fully expired/absent associations. Partial
association expiry or cleanup uses dynamic aggregation. Association and aggregate
revisions prevent a partially deleted cache from using stale counts. Ordinary
Archive counts use source-only membership; defer artwork and full overlays until
after page selection when metadata filters/sorting do not require them.

Use a dedicated `*/5 * * * *` maintenance cron, independently controlled by
`MAINTENANCE_ENABLED`. This cron never invokes provider polling or credential
rotation, even with sync enabled. Limit each invocation to 1,000 logical cache
or search-bookkeeping deletions. FTS and index writes are additional; telemetry
reports available D1 result metadata rather than equating logical rows to
billable writes. Each deletion batch advances cursor revision atomically, including interrupted
runs. Cleanup resumes from indexed remaining deadlines without a
full browse-projection rebuild.

Begin physical cleanup two days before expiry to leave processing headroom.
This may remove enrichment early. Request clocks still exclude expired data
when cleanup is late. At the measured snapshot scale, approximately 431,000
logical expiry deletions fit within the nominal 576,000-row two-day capacity;
this is an estimate, not a guarantee against missed cron runs or future growth.
Monitor backlog and time to oldest deadline before enabling maintenance.

## Consequences

The publication barrier consumes additional cache storage and writes. It
preserves existing refresh semantics and makes reads correct while sync is
paused. Read queries require performance verification on the full private copy
and synthetic remote D1 before production adoption. Published tables are caches,
not authoritative ledger tables; selected columns and unique/expiry indexes
support their bounded lifecycle.

Deploy with all background work off while importing. After target integrity and
freshness validation, enable only maintenance first. Provider jobs require their
own observed budgets before activation. This decision does not change Spotify
retention, delete parser interpretations, or remove owner history.
