# ADR 0008: Source-Specific Archive Admission

- Status: Accepted
- Date: 2026-07-18
- Supersedes: ADR 0007's completion-only Archive admission rule

## Context

ADR 0007 made Archive the canonical history ledger and admitted only completed
media. The owner subsequently clarified that a partially played podcast should
appear in Archive. In this workflow, beginning a podcast is meaningful
consumption, while an untouched saved Spotify episode represents future intent.

The sources already encode consumption differently: Letterboxd watched films,
Hardcover read books, and Readwise archived documents are completion-like state,
while Spotify exposes playback position and streaming segments. A single
cross-media completion threshold would discard useful podcast history or invent
precision the source does not provide.

## Decision

Archive is the canonical history of consumed media. Admission is governed by a
documented, source-specific rule:

- Letterboxd watched/diary evidence, Hardcover read evidence, and Readwise
  Archive state remain completion-like admission signals.
- A Spotify podcast episode enters Archive when `fully_played` is true, its
  current resume position is positive, or its Extended Streaming History has a
  positive played duration.
- An available saved Spotify episode with an explicit zero resume position is a
  Queue candidate.
- A saved Spotify row with null playback state or no usable identity remains
  unresolved until another observation or the full export can reconcile it; it
  is not silently classified as Queue.

This does not add canonical progress tracking. Preserve exact positions,
streaming segments, and completion flags as source evidence; Archive records only
that the item crossed the owner's admission rule. Consumption time remains
nullable when the source does not provide one.

## Consequences

Archive matches the owner's actual notion of media history without requiring a
universal engagement-event system. Cross-media queries must understand that
Archive means consumed, not necessarily completed, and may expose the admitting
source/provenance when that distinction matters.

Connector documentation and tests own each source's admission rule. New sources
must define their rule from observed payloads and the owner's workflow rather
than inheriting an assumed global completion threshold.
