# Documentation

## Product

- [Product context](product/context.md): purpose, scope, priorities, and future
  direction
- [Product naming history](product/naming.md): naming brief, explored
  candidates, rationale, and the Imladris decision
- [Long-term vision](product/long-term-vision.md): initial surface scope and exploratory Lists, Topics/Explorations,
  Feed, and recommendation concepts

## Design

- [Desktop UI foundation](design/ui-foundation.md): selected Index shell, sidebar collapse,
  Chat/Library/Recaps requirements, writing preferences, and open design questions

- [Saved interface mockups](design/mockups.md): source files, all seven layout
  links, and instructions to reopen the preview

## Planning

- [Implementation plan](planning/implementation-plan.md): phased delivery plan
  and connector sequencing
- [Library implementation handoff](planning/library-implementation.md): per-media
  specification, source-derived Queue rules, Songs, and production delivery steps
- [Movies implementation plan](planning/movies-implementation.md): end-to-end
  Letterboxd Archive/Queue, TMDB enrichment, API, UI, replay, and validation plan
- [Library Phase 1 decisions](planning/library-phase-1-decisions.md): researched
  product choices and the owner's resolved direction
- [Library Phase 2 surfaces](planning/library-phase-2-surfaces.md): approved
  per-surface fields, layouts, filters, sorts, inspectors, and links to the
  detailed media contracts
- [Media inspector proposal](planning/media-inspector.md): initial research on
  click-through details, existing integration coverage, and catalog dependencies
- [AI Chat proposal](planning/ai-chat-plan.md): multi-model integration, subscription
  access research, evidence-backed queries, and proposed delivery sequence

## Sources

- [Source reconnaissance](sources/README.md): research contract and current
  Readwise, Spotify, Hardcover, Letterboxd, and YouTube capability reports

## Architecture

- [Architecture overview](architecture/README.md): system shape, package
  boundaries, ingestion invariants, and portability
- [Canonical ledger specification](architecture/canonical-ledger.md): media,
  identity, Archive occurrence, timestamp, and provenance semantics
- [Development standards](architecture/development-standards.md): engineering and
  quality rules
- [Threat model](architecture/threat-model.md): assets, trust boundaries, threats,
  and controls
- [Architecture decisions](decisions/README.md): accepted technical decisions

Coding agents should begin with the repository's [AGENTS.md](../AGENTS.md), which
identifies the documentation required for different kinds of work.
