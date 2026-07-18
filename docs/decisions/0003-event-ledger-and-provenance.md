# ADR 0003: Event Ledger and Raw-Source Provenance

- Status: Accepted
- Date: 2026-07-18

## Context

External trackers describe different media types and activities, often revise
their data, and deliver duplicates. Future arbitrary queries require evidence for
when and where a fact originated rather than only a mutable current-state row.

## Decision

Model consumption as canonical media items plus append-oriented events such as
saved, started, progressed, completed, rated, and highlighted. Preserve raw input
objects, external identities, parser versions, and distinct occurrence, source
recording, and ingestion timestamps. Every connector write is idempotent.

## Consequences

History can be replayed, corrected, audited, and cited in future LLM responses.
Storage and normalization are more involved than a single item table. Derived
views will be needed for convenient current-state queries, and source deletion
will be represented rather than silently erasing history.
