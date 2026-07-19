# Desktop UI Foundation

- Status: Directional
- Last updated: 2026-07-18

## Purpose

This document records the intended desktop information architecture and visual
direction. It is a foundation for future interface work, not a detailed design
system or a commitment to every future navigation item.

The application scaffold created in Phase 1 is functional infrastructure. Its
visual styling is disposable and should not be treated as approved direction.

## Reference products

### Readwise Reader

Readwise Reader is the primary reference for polish, density, hierarchy, and the
general library workflow:

- Dark, restrained, utility-oriented interface
- Persistent global navigation
- Dense central content collection
- Compact rows that still expose useful metadata
- Context retained while inspecting one item
- Right-hand panel for item details and contextual actions
- Clear workspace-level tabs and controls

The goal is not to clone Reader or inherit its product model. Media Tracker has a
broader archive, stronger cross-media filtering, a canonical Archive ledger, and
future generated experiences that Reader does not define.

### Letterboxd

Letterboxd is a secondary reference for browsing large collections:

- Media-forward grid presentation
- Useful facets and sorting above a collection
- Ratings and other compact signals visible at a glance
- The ability to scan the totality of a personal history

Media Tracker should offer stronger filtering than either reference while
matching Reader's level of finish.

## Current design constraints

- Desktop only for now
- Dark theme only for now
- No responsive or mobile adaptation in this phase
- Mobile will be designed separately if it becomes valuable
- Dense and calm rather than spacious, decorative, or marketing-oriented
- Content and metadata should dominate; ornamental styling should not
- Chat remains hidden until a useful LLM experience exists

## Application shell

Use three durable regions:

```text
Global sidebar | Main workspace | Contextual inspector
```

### Global sidebar

The sidebar owns primary product destinations. Initially:

- Archive
- Queue

Secondary administration such as Connections and Settings belongs lower in the
sidebar or behind a secondary menu.

Future destinations may include Calendar, Topics, Feed, Explore, and Chat. Do
not show empty navigation for speculative features merely to reserve space. The
sidebar should expand when those experiences become useful.

### Main workspace

The workspace is optimized for viewing the totality of the owner's collection.
It contains:

- Current destination and scope
- Search
- Filters and active-filter indicators
- Sorting
- View controls
- The collection itself

Archive is the history of consumed media. Queue is the collection of things the
owner intends to consume. They share browsing patterns but remain semantically
distinct.

### Contextual inspector

Selecting an item opens a persistent right-hand panel without removing the user
from the collection. The inspector can eventually contain:

- Full metadata and source links
- Archive occurrences and source timestamps
- Rating, notes, and source details
- Highlights or authorized text
- Sync provenance and coverage confidence
- Related media
- Contextual LLM actions

Closing the inspector returns focus to the same collection position, filters,
sort, and selection context.

## Archive browsing

Archive is the primary workflow and the canonical interface over consumed
history. It supports two initial presentation modes.

### List view

Inspired by Reader:

- Compact thumbnail or cover
- Title and creator
- Short description when useful
- Source and media type
- Consumption date or most relevant event date
- Duration, length, or rating when available
- Fast scanning across mixed media

### Grid view

Inspired by Letterboxd:

- Artwork-forward cards
- Consistent geometry within a media-aware grid
- Important compact signals such as rating or completion
- Useful for scanning large visual collections

The view mode should be URL-addressable and remembered. Grid and list are two
lenses over the same query rather than separate data or navigation states.

### Filtering and sorting

The filtering model should comfortably exceed Letterboxd's. Planned facets
include:

- Media type
- Source service
- Consumed, saved, or completion date range
- Known, unknown, or inferred consumption date
- Rating
- Creator
- Tags
- Duration or length
- Reread or rewatch state
- Availability of notes, highlights, or full text

Sorting may include consumption date, publication date, title, creator, rating,
duration, and recently updated. Filter and sort state should be encoded in the
URL so a view is reloadable, shareable across the owner's devices, and suitable
for saved views later.

## Queue browsing

Queue initially reuses Archive's list/grid and filtering foundations. It may add
queue-specific controls such as priority, desired date, time budget, and upstream
sync status. The local queue is authoritative even when an upstream watchlist or
save-for-later service can be mirrored.

## Interaction principles

- Preserve collection context when inspecting an item.
- Prefer direct, reversible actions and visible state.
- Make filters legible; never hide the active query from the user.
- Keep generated and inferred information visually distinguishable from imported
  source facts.
- Explain incomplete source coverage rather than implying false completeness.
- Optimize for keyboard and pointer use on desktop.
- Avoid engagement mechanics, promotional surfaces, and opaque ranking.

## Deferred design work

- Mobile and native iOS interface
- Final visual tokens, typography, iconography, and component library
- Chat and saved-chat navigation
- Calendar and recap presentation
- Topic management
- Feed and Explore ranking controls
- Empty, loading, error, and large-library behavior using representative data

These should be designed when the corresponding domain behavior and realistic
fixtures exist.
