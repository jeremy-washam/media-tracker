# ADR 0007: Archive Ledger and Source-Specific Evidence

- Status: Accepted
- Date: 2026-07-18
- Supersedes: ADR 0003's universal event model

## Context

ADR 0003 proposed a broad append-oriented vocabulary for saved, started,
progressed, completed, rated, and highlighted activity. The owner subsequently
clarified that the initial product does not need progress tracking: Archive is
the canonical history and everything projected into it is completed.

Payload reconnaissance also showed that the sources do not expose one coherent
event stream. Readwise and Hardcover primarily expose mutable current state;
Letterboxd combines export snapshots with a recent RSS window; Spotify's export
contains playback segments rather than trustworthy completion events. Forcing
all of these into a universal event taxonomy would manufacture precision and
complexity that the product does not need.

## Decision

Model the initial canonical history as media items plus Archive entries. An
Archive entry means the source provides sufficient evidence that the item was
completed under this owner's workflow. It retains source identity, raw-object
provenance, parser version, rating/review data where appropriate, and separate
consumed, source-recorded, and ingested timestamps.

The consumption timestamp is nullable and retains its original precision. One
media item may have multiple Archive entries for a trustworthy rewatch, reread,
or relisten.

Do not create a universal progress or engagement event table in the initial
schema. Preserve richer upstream facts—such as Readwise highlights, Spotify play
segments, Hardcover read-through fields, ratings, tags, and reviews—in raw
objects and narrowly source-owned records when their queried use is demonstrated.
Queue remains a separate model of future intent.

Raw-source preservation, external identities, idempotent replay, correction and
deletion evidence, and timestamp separation from ADR 0003 remain accepted.

## Consequences

The first schema is smaller and aligns with the Archive UI and single-user
workflow. It can represent completed items whose exact completion date is
unknown without inventing a timestamp. Cross-source history queries remain
simple, while unusual source facts stay traceable and can be normalized later
when a feature requires them.

Some future features may need additional source-specific tables or a new
activity model. Those additions must be driven by observed payloads and concrete
queries rather than a preselected universal vocabulary.
