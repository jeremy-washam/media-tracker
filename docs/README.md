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

- [Documentation audit](planning/documentation-audit.md): October 12 comparison
  against the working checkout, all 16 Library views, Connections, and local API
- [Private deployment](planning/deployment.md): authentication, production
  packaging, account prerequisites, snapshot/restore rehearsal, and cutover
- [Storage efficiency plan](planning/storage-efficiency-plan.md): measured
  compaction options, database choices, cache freshness, usage budgets, and
  migration/deployment acceptance gates
- [Implementation plan](planning/implementation-plan.md): phased delivery plan
  and connector sequencing
- [October UI polish](planning/ui-polish.md): approved iterative fixes, browser
  baseline evidence, parallel ownership, and acceptance checks
- [UI polish follow-up](planning/ui-polish-followup.md): owner-reviewed QA fixes,
  native menus, selection behavior, and page-by-page verification
- [Visual UI audit](planning/visual-ui-audit.md): approved inspector, responsive
  column, typography, disclosure, and toolbar consistency fixes
- [Library implementation handoff](planning/library-implementation.md): per-media
  specification, source-derived Queue rules, Songs, and production delivery steps
- [Books implementation plan](planning/books-implementation.md): end-to-end
  Hardcover Archive/Queue, API, UI, replay, and validation plan
- [Movies implementation plan](planning/movies-implementation.md): end-to-end
  Letterboxd Archive/Queue, TMDB enrichment, API, UI, replay, and validation plan
- [Articles implementation plan](planning/articles-implementation.md): end-to-end
  Readwise Archive/Queue/Feed, annotations, selective text, API, UI, and replay plan
- [Podcasts implementation plan](planning/podcasts-implementation.md): end-to-end
  Spotify/Reader Archive, saved-episode Queue, Following, player polling, API,
  UI, replay, and validation plan
- [Music implementation plan](planning/music-implementation.md): end-to-end
  Spotify playback ingestion, Tracks/Albums/Artists, aggregation, API, UI,
  replay, and validation plan
- [Videos implementation plan](planning/videos-implementation.md): end-to-end
  YouTube Takeout Archive/Watch Later Queue, Channels, Data API enrichment,
  Following, API, UI, replay, and validation plan
- [Library Phase 1 decisions](planning/library-phase-1-decisions.md): researched
  product choices and the owner's resolved direction
- [Library Phase 2 surfaces](planning/library-phase-2-surfaces.md): approved
  per-surface fields, layouts, filters, sorts, inspectors, and links to the
  detailed media contracts
- [Media inspector proposal](planning/media-inspector.md): initial research on
  click-through details, existing integration coverage, and catalog dependencies
- [AI Chat proposal](planning/ai-chat-plan.md): multi-model integration, subscription
  access research, evidence-backed queries, and proposed delivery sequence
- [AI query design](planning/ai-query-design.md): proposed validated query tools,
  evidence retrieval, and bounded execution; no runtime integration

Implementation plans retain dated research, delivery stages, and validation
records. Their current-status notes and the desktop UI foundation supersede
older presentation instructions. Research verification dates are distinct from
the local implementation review; provider policies were not reverified by this audit.

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
