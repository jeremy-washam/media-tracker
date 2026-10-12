# UI polish baseline QA

Independent baseline review, 2026-10-04. Owner review completed October 12:
findings 1, 2, 6, 7, and 9–13 are approved for fixes; 4 and 5 are deferred;
8 is already resolved in the exercised case; 3 was reproduced on current
Music Albums/Artists toolbars and addressed. See [follow-up results](ui-polish-followup.md).

## Baseline and isolation

- Commit: `38bbed296e8f23bfb56b0f3a8df16180a5381fa0`.
- Worktree: `/Users/jeremywasham/.codex/worktrees/ui-polish-qa-baseline/media-tracker`.
- Separate dependencies, copied local state with consistent SQLite backups, separate API `8788` and frontend `5174`. No sync, import, provider-write, or data-edit actions.
- Actual browser testing at 1280 × 720 and 1600 × 1000, light/dark, expanded/collapsed navigation. Screenshots inspected in browser tool output.

## Additional findings (pending owner review)

1. **P1 — Books custom date ranges immediately break results.** Archive → Filters → Finished or Published → Custom range immediately shows “Books could not be loaded / Invalid request parameters,” replaces counts with dashes, and removes unrelated facet options before dates are entered. Expected: retain valid results while the range is incomplete. Movie date/rating range selectors did not exhibit the same immediate error. Automated native date filling could not establish valid-input recovery reliably; do not infer a separate date-entry defect from that limitation.
2. **P1 — Podcast linked show can fail with 404.** Archive → first episode (“The Continuing Adventures of OpenAI…”) → Details → “Show details: Sharp Tech with Ben Thompson” opens “Request failed (404).” The UI offered this action for `spotify_show_4vk2MfVMEAuOnTWUOz6lnE`. Acquired opened directly from Following works. Expected: working show details or a deliberately unavailable action.
3. **P2 — Inspector hides toolbar controls.** At 1280 × 720 with expanded navigation, Articles inspector covers Expanded; Podcast inspector cuts off Descending and completely hides grid/list. Music inspector hides Filters and grid/list. Expected: all controls fit/reflow inside the remaining collection width. This is separate from native-select chevron spacing.
4. **P2 — Podcast active filters are invisible outside the filter panel.** Following → Acquired → Queued episodes produces one episode, but the toolbar still says All shows and Filters has no active count/chip. Duration filtering likewise leaves the plain Filters label. Expected: clear indication of active constraints and a discoverable clear action without reopening the panel.
5. **P3 — Music filter form has arbitrary vertical alignment.** At 1280 × 720, Playback observations and Metadata are vertically centered alongside the tall date group; Explicit floats midway down the next row beside searchable Artists/Albums. Expected: top-aligned field labels/controls, consistent with Books/Movies.
6. **P3 — Singular count grammar.** Acquired Queue says “1 episodes”; album The Mollusk → Heard tracks says “1 observations” for Buckingham Green.

7. **P1 — Music section switching retains an incompatible selection and opens 404.** Tracks → Ocean Man → album The Mollusk → Artists section carries `item=1yfJqxKKXG320vhqLfUEeC` into the Artists route. Artist inspector shows “Request failed (404).” Expected: clear or correctly map selection when changing entity type.
8. **P2 — Opening a book loses collection scroll position.** At 1280 × 720 in Books list, scroll two pages until Intermezzo is visible (`scrollY=1440`), then click it. Opening the inspector moves the document to `scrollY=0`, hiding the selected row. Closing leaves the document at zero. Expected: preserve the collection position. This is distinct from flexible card resizing.
9. **P2 — Video Channel filter silently omits most channels.** Archive → Filters → Channel contains exactly 500 channel options, alphabetically ending at AwakenWithJP, while Channels has 7,964 entries. There is no search or load-more control; NBA and other B–Z channels cannot be selected here. Expected: searchable complete channel selection or clearly exposed pagination.
10. **P2 — Video date checkboxes are malformed.** Watched date “Include unknown dates” and Published “Unknown date only” render as large 32px squares centered above separate label lines. Other checkboxes are small and inline. Reproduced on dark mode at 1600 × 1000.
11. **P2 — Music Artist History truncates the primary content excessively.** The Beatles → History gives track titles about 115px while the date/observed duration occupies most row width; titles cut midword even at 1600 × 1000. Expected: readable/wrapped titles and subordinate date metadata. The owner's equivalent Channel Library feedback already addresses this in Videos.
12. **P3 — Short videos display zero duration.** Video Archive row “The longest wave in the world - Chicama” by Blueroad Travel displays “0 min.” Expected: seconds or “<1 min” for positive short durations. Browser alone cannot establish the underlying exact seconds.
13. **P3 — Channel Library empty Queue is blank.** Channels → NBA → Library → Queue shows only an empty list, with no explanation that the channel has zero queued videos. Expected: explicit compact empty state.

## Concrete extensions of already-approved scope

- Connections dark mode uses very light gray cards with gray body text; source coverage and sync dates become nearly unreadable. This should be an explicit acceptance check for the already-requested Connections restyle.
- Video Channel Library rows are plain text and cannot open their videos. Include navigable rows in the already-requested video-list-style treatment, if desired.
- Music and Videos, like Podcasts, hide active filter state behind a plain Filters button. Video unknown-published-date filter reproduced this directly.

## Coverage

- Books Archive/Queue: grid/list, format facet, range control, sort, search/clear, empty state, details/history, Escape close, pagination preserved after inspector opening/closing, back/forward, missing-cover and long-title rows.
- Movies Archive/Queue: grid/list, filter forms including empty date/rating ranges, details/history, metadata/source links inspected without leaving app, queue rows.
- Articles Archive/Queue/Feed: compact/expanded, author facet search/select/clear, section changes, empty search/reset, sort, details/history, missing artwork, light/dark.
- Podcasts Archive/Queue/Following: duration filter, show constraint, sort reversal, episode details/history, followed-show details/history, linked show navigation, audiobook contamination, long titles.
- Music Tracks/Albums/Artists: list/grid inspection, filter form and options, track details/history, album details/heard tracks, artist details/releases/history, history pagination, inter-entity links and section switching, wide light/dark inspector layout. Main collection and option requests reproduce severe latency. Album request logs showed about 24.6 seconds; no independent load benchmark claimed.
- Videos Archive/Queue/Channels: grid/list, query search/clear, unknown published date filter/reset, channel option completeness, available/missing artwork, video Details/Watch history/Channel, channel Details/Library Archive+Queue, Library pagination, wide light/dark.
- Connections: all connection cards, current/recent status text, older activity pagination, light/dark and expanded/collapsed sidebar. Sync, import, resume, credential, and account actions intentionally not invoked.
- Chat and Recaps are disabled placeholders in production navigation, not functioning production destinations. Development-only mockups/specimens are outside this production QA pass.

## Limits and useful passes

- This is a broad manual pass over every production route and each inspector type, with representative meaningful controls. It is not every combinatorial filter/date/source permutation or every record.
- Native date input automation reflected values visually without consistently committing URL state. The immediate empty-range failures above are unambiguous; valid native-calendar range recovery needs follow-up manual testing.
- OS-level rubber-band overscroll was not established through browser automation. No external source links followed, no provider actions triggered.
- Books pagination retained loaded rows across inspector open/close. Escape closed the book inspector. Article author search/facets, search empty-state reset, Movie blank range controls, Podcast followed-show details/history, Music artist history pagination, Video Channel Library pagination, and Connections older-activity pagination worked in the exercised cases.
- Saved browser screenshots were inspected in tool outputs for concrete visual defects; no private screenshot artifacts were committed.
- Repeat against integrated changes before claiming regression coverage. New findings remain report-only pending owner review.

## Known issues reproduced, not new scope

The owner checklist already covers serif fonts, active hover, inconsistent card sizes, native selects/chevrons, inspector height and abrupt layout changes, Enter-only search, missing grid ratings, list defaults/persistence, compact/expanded simplification, episode/Tracks grid removal, audiobook Following contamination, Music latency/count reset/missing duration presentation. Do not count these again as new findings.
