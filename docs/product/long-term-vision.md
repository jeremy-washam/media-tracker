# Long-Term Product Vision

- Status: Exploratory
- Last updated: 2026-07-18

## Purpose

Media Tracker begins as a trustworthy, private record of personal media
consumption. Over time, that record may support reflection, intentional learning,
discovery, and explainable recommendations.

The ideas in this document are deliberately exploratory. They guide extensible
foundations but are not commitments to build every described feature.

## Durable product primitives

### Archive

Archive is the canonical history of consumed media. It is backed by media items,
external identities, and consumption events with source provenance. Imported
facts remain authoritative and replayable.

Calendar views, recaps, recommendations, feeds, and LLM answers are projections
over this ledger. They must not become isolated stores of conflicting history.

### Queue

Queue represents explicit intent to consume something in the future. The local
queue is authoritative. Upstream watchlists and save-for-later services may be
mirrored when dependable integrations exist.

### Topics

Topics are explicit intellectual intentions that do not need to originate from a
saved media item. Examples include:

- "How does IMAX 70mm work?"
- "How do behavior trees work?"
- "Miyazaki animation behind the scenes"

A topic is not media and should never be inserted into Archive as if it were
consumed content. It is a separate first-class signal that can guide discovery,
feeds, recommendations, and chat.

A future topic model may contain:

- Original user-authored text
- Active, paused, completed, or archived state
- Priority or strength
- Creation date and optional expiration
- Desired depth, pace, or time budget
- Preferred or excluded formats
- Derived concepts, entities, and search queries
- Links to discovered, queued, and consumed media

Topics should remain controllable. A user might request one good explanation, a
multi-week learning path, adjacent exploration, or ongoing updates.

## Generated experiences

```mermaid
flowchart LR
  A["Archive: consumed history"] --> R["Candidate discovery and ranking"]
  Q["Queue: explicit future media"] --> R
  T["Topics: explicit intentions"] --> R
  F["Explicit feedback"] --> R
  R --> D["Feed"]
  R --> E["Explore"]
  R --> C["LLM answers and chat"]
  A --> K["Calendar and recaps"]
```

### Calendar and recaps

A calendar provides another lens over consumption events rather than another
history system. Recaps may summarize a week, month, year, topic, or period in a
more editorial form, similar in spirit to Spotify Wrapped.

Useful recap material may include:

- Volume and time by media type
- Creators, subjects, and sources revisited
- Ratings and completion patterns
- Meaningful notes or highlights
- Emerging interests and topic clusters
- Comparisons with prior periods

Recaps should favor useful reflection over gamification.

### Feed

A feed may combine saved topics, recent history, queue state, source updates, and
other future signals. An LLM can help expand topics, assess candidates, diversify
formats and perspectives, and compose a coherent sequence. It is an editor over
retrieved candidates, not the source of truth or the sole discovery mechanism.

A feed should support explicit modes such as:

- Teach from first principles
- Stay current
- Explore adjacent ideas
- Fit a time budget
- Prefer a format or level of depth
- Provide one excellent next item rather than an endless stream

### Explore

Explore may recommend content similar to a selected item, creator, topic, or
period of history. It can also surface useful contrasts and adjacent material
rather than only nearest-neighbor similarity.

Archive helps Explore avoid consumed duplicates and estimate appropriate depth.
Queue indicates existing intent. Topics provide explicit direction that history
alone cannot infer.

### LLM search and chat

Natural-language search should answer arbitrary questions over the owner's saved
history, metadata, events, notes, highlights, and authorized text. Answers must
cite stored evidence and distinguish facts from inference.

Chat may eventually be a global destination with saved conversations, while the
item inspector can offer contextual questions about one selected record. Chat
should remain hidden until it provides genuine value.

## Recommendation flow

For a topic such as "How does IMAX 70mm work?":

1. Preserve the original topic exactly as written.
2. Derive candidate search concepts and queries without replacing the original.
3. Gather candidates from authorized sources, public search, and known media
   catalogs.
4. Use Archive to remove duplicates, connect prior interests, and estimate depth.
5. Use Queue to avoid redundant suggestions and recognize existing intent.
6. Rank and diversify candidates by relevance, quality, novelty, format, and time
   fit.
7. Explain whether each recommendation came from the explicit topic, prior
   history, or both.
8. Record user feedback and resulting queue or consumption actions.

## Generated-data boundaries

Generated outputs should have their own provenance and versioning. They must not
overwrite imported facts.

Future generated records may include:

- Feed runs with input signals and ranking version
- Recommendation candidates and scores
- Inclusion and exclusion reasons
- Recap snapshots
- Topic-derived queries and entities
- Chat messages and cited evidence
- Explicit feedback such as too basic, already known, or different viewpoint

Keeping these records separate makes recommendations auditable, reproducible
where practical, and safe to regenerate as models or ranking logic change.

## Product principles

- User-authored topics outrank inferred interests.
- Generated experiences remain explainable and adjustable.
- Archive, Queue, and Topics are durable inputs; Feed and Explore are projections.
- The product should be useful without an LLM or recommendation service.
- Avoid infinite-feed engagement optimization.
- Preserve uncertainty and incomplete integration coverage.
- Prefer a small number of excellent recommendations over undifferentiated volume.
- Keep speculative features out of the primary interface until they earn a place.

## Near-term boundary

The current milestone remains ingestion-first. Build the canonical ledger,
provenance, synchronization, and useful Archive browsing before adding Topics,
Feed, Explore, recap generation, or global Chat. The ledger should make these
features possible without forcing their premature design.
