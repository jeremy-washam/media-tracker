# UI polish — October 2026

Status: implemented and verified locally. The owner approved this first iterative
polish pass on October 4 after a browser verification of the feedback below.
Layout and styling changes are part of this pass; a later visual redesign is
not a prerequisite.

## Delivery and ownership

- UI: production shell, shared controls, collection presentation, inspectors,
  view preferences, and Connections styling.
- Backend/performance: Music and Videos read-path performance, source-backed
  Podcast Following membership, missing-duration investigation, and stale sync
  status investigation.
- Independent QA: a fixed baseline worktree with its own local data snapshot,
  API, and frontend. Review every production page and relevant interaction in
  the browser. Additional findings go to the owner for review before becoming
  implementation scope. Repeat QA against the integrated changes.
- Integration: coordinate shared contracts, run required checks and browser
  acceptance, and record actual outcomes below.

## Approved scope and baseline evidence

| Area              | Change                                                                         | Baseline evidence                                                                                                                  |
| ----------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Typography        | System font throughout production UI, including headings                       | Inter-first body stack; Georgia heading overrides                                                                                  |
| Sidebar           | Keep selected hover treatment stable                                           | Selected Books background becomes lighter on hover                                                                                 |
| Sidebar footer    | Align Connections, appearance, and API status                                  | API status text begins approximately 11 px left of other labels                                                                    |
| Controls          | Default cursor for buttons                                                     | Buttons use pointer                                                                                                                |
| Connections       | Apply current shared UI styling; update obsolete coverage copy                 | Legacy warm cards and typography; obsolete Songs/audiobooks deferred text                                                          |
| Cards             | Reuse card primitives and deliberate consistent sizing                         | Books and Movies have different dimensions at the same viewport                                                                    |
| Inspector         | Animate entrance and exit, occupy full height, preserve context                | Immediate appearance; 54 px top offset                                                                                             |
| Inspector/grid    | Keep card dimensions stable on open/close                                      | Book card width changes from approximately 127 to 133 px                                                                           |
| Scrolling         | Contained application scrolling without page overscroll or inspector shifts    | Document scrolls; inspector keeps a blank 54 px band after header scrolls away; OS rubber-band effect not independently reproduced |
| Search            | Apply as the user types with a short debounce and obvious clearing             | Books stays at 128 results until Enter, then shows six; an existing small clear button does work                                   |
| Ratings           | Small muted personal stars below book/movie grid cards, including half ratings | Rated items have no grid stars; Letterboxd reference applies only to stars                                                         |
| Sorting           | Accessible shared custom controls with correctly inset chevrons                | Native selects have cramped right-edge arrows                                                                                      |
| Layout preference | List default, one shared saved grid/list preference wherever supported         | Books list → Movies → Books returns to grid; state is URL-only                                                                     |
| Books list        | Publish Year, Read Date, Rating columns; remove Physical                       | Full publish dates and inline Physical/rating metadata; retain title/author identity                                               |
| Movies            | Tighten card metadata spacing                                                  | Large title/metadata gaps; release year already shown                                                                              |
| Articles          | Expanded rows only, without ARTICLE/PDF type labels                            | Compact and Expanded do differ in height and metadata                                                                              |
| Podcasts          | Consistent sort direction control; grid only for Following                     | Episode grid creates short truncated cards; textual Ascending/Descending                                                           |
| Podcast Following | Exclude audiobooks using source evidence                                       | Includes The Odyssey and The Fellowship of the Ring                                                                                |
| Music             | Improve load performance                                                       | Tracks populated in roughly 30–35 seconds                                                                                          |
| Music duration    | Investigate and present unavailable listening time honestly                    | Many recent API tracks show time unavailable; other tracks have real accumulated durations                                         |
| Music layout      | Remove grid only from Tracks                                                   | Albums and Artists retain supported layout choices                                                                                 |
| Music counts      | Keep overall counts and strip geometry stable across tabs                      | Albums and Artists both replace counts with dashes; strip shrinks                                                                  |
| Videos            | Improve load performance                                                       | Still loading at 24 seconds, populated by approximately 36 seconds                                                                 |
| Channel Library   | Video-style rows with thumbnails                                               | 25 text-only rows with severe title truncation and no thumbnails                                                                   |
| Accessibility     | Name Books date/rating and Movies date/rating/repeat/runtime filters           | Previously reviewed independent QA finding                                                                                         |
| Sync status       | Investigate old zero-record running backfill safely                            | September 21 Spotify run remains running on October 4; no evidence of a current import in verification                             |

Lucide React remains the icon library. Do not invent missing playback durations,
infer personal dates from ingestion timestamps, or import other visual choices
from the Letterboxd screenshot. Preserve the read-only Library boundary.

## Acceptance

The independent baseline is commit `38bbed2`, served on local port 5174 with
its own API on 8788. Its database and raw files were copied before performance
migrations; SQLite backups passed `quick_check`. Its dependencies are installed
inside the baseline worktree, so workspace package resolution does not follow
in-progress changes in the main checkout.

- Verify approved behavior with real local data in light and dark appearances,
  expanded and collapsed sidebar, open and closed inspectors, and multiple
  desktop widths.
- Search, sort, filter, layout, and inspector presentation changes preserve
  collection/query correctness and loaded-page context where applicable.
- Measure backend improvements under stated conditions; retain exact counts,
  source semantics, provenance, and pagination behavior.
- Run `pnpm check`, `pnpm build`, `pnpm test:e2e`, and relevant migration checks.
- Distinguish fixed items, new QA findings awaiting owner review, and any
  remaining limitations in the handoff.

## Results

The approved frontend pass and backend refinements are implemented. See the
[integrated acceptance record](ui-polish-acceptance.md) for verification and
measurement conditions. Final code gates passed: `pnpm check` (237 tests),
`pnpm build`, and `pnpm test:e2e` (23 tests).

The [independent baseline QA report](ui-polish-baseline-qa.md) contains 13
additional findings for owner review. They have not been added to the approved
implementation scope. Some baseline symptoms can be incidentally resolved by
the shared changes; the acceptance record distinguishes those observations.

Music Tracks measured 13.61 seconds before the query/index fixes and
0.116–0.152 seconds afterward in repeated local API requests. Videos Archive
measured 1.94 seconds before and 0.590–0.915 seconds afterward. These are local
40-row endpoint measurements, not browser paint benchmarks. First-page JSON,
counts, and cursors matched before/after in the performance comparison.

The apparently stale Spotify run was a resumable catalog job with real progress
that the old UI did not expose. It now displays durable returned/unavailable
counts and lease-derived activity rather than claiming failure from age alone.
Recent API listening observations still do not supply played duration; missing
time remains unknown. Audiobook exclusion uses explicit source-provided
author/narrator metadata labels; ambiguous Spotify shows are retained.

Additive migrations 0023 and 0024 were applied only to the main local database,
after the baseline snapshot. No deployment or provider sync was initiated.
The baseline servers were stopped after QA; its worktree and snapshot remain
available for comparison. The main local frontend and API remain available.
