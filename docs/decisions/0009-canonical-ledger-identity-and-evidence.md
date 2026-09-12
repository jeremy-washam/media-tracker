# ADR 0009: Canonical Ledger Identity and Evidence Model

- Status: Accepted
- Date: 2026-09-12

## Context

The five source probes are complete enough to replace the implementation plan's
rough table sketch with an exact logical model. The observed sources distinguish
the thing consumed, the provider's identity for that thing, the owner's
consumption occurrence, and the raw observations that prove it:

- a Hardcover book can have work and edition identities;
- a Letterboxd film can have multiple Diary occurrences;
- a Spotify episode can have many playback segments without trustworthy session
  boundaries;
- a YouTube video can have watches from separate account connections; and
- the same occurrence can be observed again in an overlapping export, API page,
  or RSS response.

A single raw-object foreign key on an Archive row cannot preserve all of that
evidence. Treating provider records as media items would instead duplicate the
same work and make cross-source history harder to reconcile.

The Readwise probe also observed PDFs, EPUBs, tweets, podcasts, and notes. Not
every record that Reader calls a document belongs in the owner's browsable media
Archive.

## Decision

Use four distinct layers:

1. `media_items` represent the user-facing work or consumable item.
2. `external_identities` attach provider, catalog, and edition identities to a
   media item. Identities declare whether they are global or scoped to one
   connection.
3. `archive_entries` represent source-supported consumption occurrences. Their
   connector-defined occurrence keys are unique within a connection.
4. Immutable `raw_objects` contain acquired payloads, while `source_records`
   address observations inside those payloads. `archive_entry_evidence` links
   one Archive occurrence to every observation that supports or changes it.

An Archive entry may point to the particular external identity consumed, such as
a Hardcover edition, while still belonging to a work-level book media item.

Normalized timestamps retain precision (`year`, `month`, `day`, or `instant`)
and whether the value was asserted by the source or inferred. Unknown time is
represented by `null`; ingestion time is never substituted. Normalized instants
are UTC.

Archive membership is the canonical consumption state. Do not add a separate
completion field: the source-specific admission reason and retained source facts
already explain why the item belongs in Archive. In particular, positive Spotify
podcast playback remains sufficient even when the source does not prove full
completion.

Keep Queue separate from Archive. Do not add a Queue table to the ingestion
schema merely to reserve a shape. Imported Queue-like observations remain source
evidence until concrete Queue behavior is designed; they never remove Archive
evidence.

Only Reader articles, videos, and podcasts project into Archive. PDFs, RSS
items, and newsletter-style emails use the article type for this owner's
workflow. Reader EPUBs, tweets, personal notes, highlight-only documents, and
other categories remain source evidence but do not create standalone Archive
items. This narrows ADR 0008's broad reference to Reader Archive state: both an
eligible media category and Archive location are required.

For Reader items, use `last_moved_at` as an inferred consumption time when it is
present. For Spotify podcast episodes, create one Archive occurrence and use the
latest positive playback timestamp; do not infer listening sessions or separate
relistens from playback segments.

YouTube `Watched` cards without a usable video identity remain preserved source
records but do not project into the browsable Archive.

Use stable internal IDs for references. Titles, slugs, and URLs are never local
primary keys. Cross-source merging requires an authoritative shared identity or
an explicit, reviewable reconciliation rule; title similarity alone is
insufficient.

The detailed field meanings, constraints, and source mappings live in the
[canonical ledger specification](../architecture/canonical-ledger.md).

## Consequences

Repeated imports can add evidence without duplicating Archive history. Raw
payloads remain replayable under later parser versions, and current projections
can change without erasing earlier observations.

The model adds `source_records` and `archive_entry_evidence` beyond the original
implementation-plan sketch. Those tables are justified by observed overlapping
snapshots and by Letterboxd export/RSS reconciliation.

Some provider facts remain outside the canonical projection until a product
query requires them. Examples include Spotify playback segments, Hardcover
progress, and Readwise highlights. They remain preserved in raw evidence and can
later gain narrowly source-owned tables without changing the Archive model.
