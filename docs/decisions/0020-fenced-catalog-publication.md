# ADR 0020: Fenced catalog publication and partial sync checkpoints

Status: Accepted

Date: 2026-10-17

## Context

Catalog delivery is at least once. A five-minute lease can expire while an old
worker still holds a provider response. Checking ownership only when reserving
work lets that worker overwrite its replacement's cursor, phase, or published
metadata. Separately, Spotify has a complete primary saved-episode scan and
independent optional operations; recording every run as successful hid optional
failures, while the original cursor trigger accepted only successful runs.

## Decision

Use the monotonically increasing reservation attempt count as a lease generation.
Every catalog state mutation requires the generation returned by reservation.
Provider publication batches also assert ownership inside the same database
transaction. Migration 0031 adds a small constraint-checked assertion table;
successful batches remove the assertion before commit, and stale generations
abort the entire batch. Completing a YouTube job and publishing its projection
happen in one fenced transaction.

Keep optional Spotify operations independent, preserve raw response bytes before
parsing, and persist partial failure in sync-run state. A `partially_succeeded`
run may checkpoint only its fully committed primary scan or a completed optional
operation. Pending, running, failed, or cross-connection runs remain ineligible.
Apply migration 0031 before running code that writes these checkpoints. The
number follows the already-deployed 0030 source-sync admission migration; that
applied migration remains unchanged.

Reader content publication similarly requires that the manifest still matches
the current source version, so a late index worker cannot replace newer text.

## Consequences

Retries preserve durable progress without giving expired workers permission to
publish. Lease tokens are internal storage coordination, not provider identities
or new canonical evidence. Source evidence and historical interpretations remain
retained. A complete primary scan can resume normally while the interface and
sync history truthfully show optional failures.

Synthetic regressions cover expired workers, successful/failed terminal states,
atomic publication rollback, primary checkpoint eligibility, raw response
preservation, and stale Reader manifests. These local changes do not activate
production ingestion or automatically apply hosted migrations.
