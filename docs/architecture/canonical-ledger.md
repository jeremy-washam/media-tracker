# Canonical Ledger Specification

- Status: Accepted for initial implementation
- Last updated: 2026-09-12
- Governing decision: [ADR 0009](../decisions/0009-canonical-ledger-identity-and-evidence.md)

## Purpose

This document defines the logical model that the domain package and initial D1
schema implement. It reconciles the observed Readwise, Hardcover, Letterboxd,
Spotify, and YouTube payloads without making any provider's data model canonical.

The model answers four separate questions:

1. What media item is this?
2. Which external identities refer to it?
3. What consumption occurrence belongs in Archive?
4. Which immutable source observations support that conclusion?

## Relationship model

```text
source
  └── connection
        ├── sync run
        │     └── raw object
        │           └── source record
        │                 └── archive entry evidence
        │                       └── archive entry
        └── external identity ───────┐
                                     ├── media item
        archive entry ───────────────┘
```

The canonical ledger is a projection over evidence. Raw objects and source
records are retained; media items and Archive entries may be corrected or
enriched as new observations arrive.

## Canonical types

### Media types

```text
article
video
podcast_episode
movie
book
song
```

For this owner's workflow, Reader PDFs, RSS items, and newsletter-style emails
are articles. Only those articles, videos, and podcasts become standalone
Archive media. EPUBs, tweets, personal notes, highlight-only documents, and
other Reader categories remain source evidence without creating media items.
Ambiguous records stay unresolved instead of being assigned a generic `other`
type.

Media type is a canonical classification and can be corrected when better
evidence arrives. The original provider category remains in its source record.

### Temporal values

A source-derived time is a value plus two independent properties:

```text
precision: year | month | day | instant
basis: source_asserted | inferred
```

An unknown time is `null`. An `instant` is normalized to UTC. The raw source
string remains in R2 evidence, so normalization never destroys an original
timezone or representation.

Examples:

- Letterboxd `Watched Date`: day, source asserted.
- YouTube watched timestamp: instant, source asserted.
- Reader `last_moved_at` used as consumption time: instant, inferred.
- A watched-only Letterboxd film: unknown (`null`).

`source_recorded_at` is separate from `consumed_at`, and both are separate from
the system's `ingested_at`/`acquired_at` instant.

### Source ratings

Ratings retain their source scale as `(value, scale minimum, scale maximum)`.
The canonical ledger does not destructively convert a five-star rating to a
percentage. A normalized display value can be derived later.

## Logical tables

These definitions are implemented as a Drizzle schema and forward-only SQL
migrations in `packages/db`. Names below describe their durable semantics.

### `sources`

A seeded lookup for the five initial providers. Source names are stable code
values: `readwise`, `hardcover`, `letterboxd`, `spotify`, and `youtube`.

### `connections`

One configured owner account or import lineage for a source.

Required semantics:

- source and non-secret display label;
- connection health;
- coverage level (`complete`, `partial`, or `best_effort`); and
- created/updated instants.

Separate YouTube Takeouts from separate accounts or channels use separate
connections even when they reference the same video identity.

### `sync_runs`

One observable unit of backfill, reconciliation, import, webhook processing, or
replay. It records status, safe counts, start/finish instants, and a redacted
error classification. Partial work is never reported as success.

### `sync_cursors`

A named, connection-scoped durable checkpoint. The checkpoint is connector-owned
structured data. A cursor refers to the successful sync run that committed it.
It advances only after all covered raw and normalized writes are durable.

### `raw_objects`

One immutable acquired payload, such as an API page, webhook body, RSS response,
or export ZIP. It records:

- connection and sync run;
- an acquisition idempotency key;
- private object-storage key;
- SHA-256, content type, byte length, and acquisition instant; and
- current processing status, last parser version, and a safe failure message.

Checksum equality is evidence of equal bytes, not proof that two acquisitions
are the same source event. The application may retain separate acquisition
manifests that point to content-addressed storage.

### `source_records`

One parser-addressable observation inside a raw object. Examples are a Reader
result row, `diary.csv` row, Spotify JSON array member, or YouTube HTML card.

It records:

- raw object and connection;
- connector-owned record type;
- stable path within the raw object;
- upstream logical key when one exists;
- source-recorded time;
- parser version and optional record checksum;
- disposition (`normalized`, `ignored`, `unresolved`, or `invalid`); and
- upstream state (`active`, `removed`, or `unknown`).

The durable replay identity is raw object + parser version + record path. An
upstream logical key may recur across many source records as later snapshots
observe the same entity again.

### `media_items`

The user-facing work or consumable item. Common fields are deliberately small:

- media type;
- nullable title, subtitle, primary creator, description, canonical URL, and
  image URL;
- nullable publication time with source precision; and
- nullable duration in milliseconds.

Title remains nullable because provider metadata can be temporarily incomplete.
Presentation code may suppress an item or display a fallback, but the database
must not store that fallback as an imported fact.

Book media items are work-level for browsing. Hardcover work, edition, ISBN, and
ASIN identities remain distinct external identities. An Archive entry can point
to the particular edition identity consumed.

Every imported media item must have at least one usable external identity.
Unidentified source observations remain preserved source records instead of
creating placeholder media items.

### `external_identities`

A typed external reference attached to one media item:

```text
namespace
external_type
external_id
scope
canonical_url
first_observed_source_record
last_observed_source_record
retired_at
```

Namespaces initially include the five sources plus `tmdb`, `isbn`, and `asin`.
Global identities—such as a YouTube video ID, Spotify episode URI, or TMDB movie
ID—are unique by namespace, type, and ID. Connection-scoped identities—such as a
Reader document—are unique by connection, namespace, type, and ID.

Identity retirement represents an upstream merge or removal without deleting
history. Slugs, titles, and unverified normalized URLs are matching inputs, not
authoritative identities.

### `archive_entries`

One source-supported consumption occurrence. It records:

- media item and source connection;
- optional external identity for the particular consumed manifestation;
- connector-defined source occurrence key;
- admission reason;
- nullable consumed and source-recorded times;
- optional source-scale rating and review text;
- upstream active/removed/unknown state; and
- created/updated instants.

The database must enforce uniqueness of `(connection_id,
source_occurrence_key)`. The connector owns the meaning of that opaque key. It
must distinguish genuine rewatches while making replay of the same observation
idempotent.

Archive membership is the canonical state. There is no separate completion or
progress field. The admission reason retains why the source qualifies the item,
while richer values such as Spotify `fully_played` remain source evidence.

### `archive_entry_evidence`

A many-to-many link between Archive entries and source records, with a role:

```text
admission
occurrence_time
metadata
rating
review
removal
```

At least one `admission` link is required for an imported Archive entry. A later
overlapping export or RSS record can support the same Archive occurrence by
adding evidence rather than creating a duplicate occurrence or overwriting its
only provenance link.

### Deferred Queue model

Queue is local future intent and remains separate from Archive, but it is not a
table in the initial ingestion schema. Watch Later, Want to Read, watchlist, and
saved-episode observations remain source records until concrete Queue behavior
is designed. Archive membership never implicitly erases that evidence.

## Cross-source reconciliation rules

1. Match on an authoritative identity before creating a new media item.
2. Otherwise create a separate media item and retain the evidence needed for a
   later explicit merge.
3. Never merge solely on title, creator name, slug, or fuzzy similarity.
4. A merge reassigns identities and occurrences; it does not delete source
   records or raw objects.
5. A provider identity changing through a catalog merge retires the old identity
   and adds the replacement. It does not rewrite historical evidence.
6. Identical source bytes or record hashes do not automatically prove duplicate
   consumption.

## Source projection rules

| Source evidence                                                     | Media item and identity                                                                    | Archive occurrence                                                                                              | Consumed time                                                                 |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Eligible Reader document in Archive                                 | Article (including PDF, RSS, or newsletter email), video, or podcast; connection-scoped ID | One current-state occurrence keyed by document ID                                                               | Use `last_moved_at` as inferred time when present; otherwise unknown.         |
| Hardcover Read user-book with finished child rows                   | Work-level book with distinct work/edition identities                                      | One occurrence per trustworthy finished child ID                                                                | Finished date is source-asserted day precision.                               |
| Hardcover Read user-book without a finished child row               | Same book model                                                                            | One fallback occurrence keyed by user-book Read state                                                           | Unknown. Preserve `read_count` without inventing rereads.                     |
| Letterboxd Diary row                                                | Film identity plus later TMDB identity when observed                                       | One occurrence per Diary URI; RSS evidence reconciles to it                                                     | Watched date is source-asserted day precision.                                |
| Letterboxd watched-only row                                         | Film identity                                                                              | One undated watched-state occurrence only when no Diary occurrence accounts for it                              | Unknown. Export `Date` is source-recorded, not consumed.                      |
| Spotify episode with positive export playback                       | Spotify episode identity                                                                   | One consumed occurrence per episode; segments remain evidence rather than inferred sessions or separate listens | Latest positive segment timestamp.                                            |
| Spotify episode with positive API resume position or `fully_played` | Spotify episode identity                                                                   | Reconcile to the episode's single consumed occurrence                                                           | Unknown unless export evidence supplies a latest positive playback timestamp. |
| YouTube `Watched` activity with a usable video identity             | YouTube video identity                                                                     | One occurrence per trustworthy activity card within its connection                                              | Watched timestamp is a source-asserted instant.                               |

Additional rules:

- Ineligible Reader categories, highlight/note relationships, Spotify playback
  segments, and Hardcover progress remain raw or narrowly source-owned evidence;
  they are not universal engagement events.
- Spotify zero-playback saved episodes are Queue candidates. Null/unavailable
  playback observations remain unresolved.
- Spotify song and audiobook Archive admission is deferred until explicit rules
  are approved. Their raw records are still retained.
- YouTube non-watch actions and watched cards without a usable video identity are
  ignored for Archive while remaining preserved in the raw object/source-record
  layer.
- A source record disappearing from an incomplete API page, finite RSS window,
  or later export is not deletion proof.

## Required persistence invariants

The D1 implementation must test these constraints:

1. Replaying the same raw object and parser version produces no duplicate source
   records, identities, or Archive entries.
2. Reobserving a logical record can add evidence to an existing Archive entry.
3. One media item can carry multiple provider and manifestation identities.
4. One media item can have multiple trustworthy Archive occurrences.
5. Two connections can refer to the same global media identity while retaining
   separate occurrences and provenance.
6. Unknown and inferred consumption times remain distinguishable from asserted
   dates and instants.
7. Cursor advancement and its covered writes commit atomically where D1 is the
   authority; R2/D1 transitions use retry-safe explicit states.
8. Upstream removal never cascades into deletion of raw evidence or Archive
   history.
9. Every imported Archive entry has at least one admission evidence link.
10. Ratings remain on their original source scale.
