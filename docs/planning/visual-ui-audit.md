# Visual UI audit — October 12, 2026

The owner approved all twelve findings from the live visual audit, including
the three design choices, before implementation. This pass preserves source
facts, lazy History queries, associated shadcn tab panels, URL state, and the
read-only Library boundary.

| #   | Finding                                           | Resolution                                                                                                                                                                                                                               |
| --- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Video/Channel tablists expanded to 680px          | Every inspector uses a bounded 54px topbar; generic line tablists default to 32px and only bounded headers stretch them. Video/Channel tabs remain visible during loading and content scrolls independently.                             |
| 2   | Book headings diverged from narrow row cells      | Headings and rows share column tokens. At pane widths below 650px both hide Publish Year; below 480px both hide the date. Rating stays correctly labeled. Queue cells contain a compact date under Added to Hardcover.                   |
| 3   | Article source typography and detached icons      | Shared inspector content scale and deliberate disclosure spacing; source links and their external icons share one baseline.                                                                                                              |
| 4   | Inspector type scales differed                    | 22px/500 titles, 11px/600 section headings, and 12px body/metadata/history text across inspectors. Media-specific artwork and available fields remain intact.                                                                            |
| 5   | Spotify topbar controls were lower                | Music/Podcast/Video/Channel compose InspectorHeader with the same centering and line-tab treatment as Book/Movie/Article.                                                                                                                |
| 6   | Selected mobile section was offscreen             | CollectionTabList reveals the selected tab after route/count changes and viewport resizing, without changing selected state or moving keyboard focus.                                                                                    |
| 7   | Filters mixed typography and alignment            | 12px field labels, values, and checkbox labels; small muted group labels; fields align at the top and standalone Select fields use a stacked label. Component appearance remains owned by shadcn.                                        |
| 8   | Empty Article archive history left blank space    | A settled empty response says No archive history.                                                                                                                                                                                        |
| 9   | Tab/body count formatting differed                | All Library tab counts use the same thousands-separator formatting as their summaries.                                                                                                                                                   |
| 10  | Common toolbar control order varied               | Search, optional source/show selector, Filters, Sort, Direction, then optional List/Grid. DOM, keyboard, and visual order agree.                                                                                                         |
| 11  | Music grid hid identities and playback summaries  | Album/Artist cards use fewer columns, wrap identity text, and show a concise observations/time summary. Lists retain the complete summary; full source-backed details remain in the inspector.                                           |
| 12  | Reader identifiers competed with repeated actions | Actual installed shadcn Base UI Collapsible reveals Reader relationships/IDs on demand. The default Source section keeps one original and one Reader action; distinct relationship destinations remain accessible inside the disclosure. |

The inspector integration also corrected a literal conditional expression in
the Podcast History panel: episodes show playback history; shows show Following
metadata. Each remains a real, separately associated shadcn panel.

## Regression coverage

`tests/e2e/visual-consistency.spec.ts` measures loaded inspector headers, type
scale, scroll containment, keyboard tab behavior, and retained panels in both
appearances at 1280px, 1024px, and 390px. It also verifies responsive Book
headings/cells, selected mobile tab visibility, field sizes and toolbar order,
Reader disclosure/link geometry, empty history, and readable long Album grid
text. Loading/error coverage verifies that Music, Podcast, Video, and Channel
triggers retain their associated panels while switching tabs. Fixtures are
synthetic; screenshots of real local data stay outside Git.

Live acceptance revisited Article Source disclosure and inline links, bounded
Video content, wrapped Music Album cards, light Podcast filters, mobile Book
headings/ratings, and the selected mobile Artists tab. Metadata and source links
measure 12px; automated checks cover the shared geometry in both appearances at
desktop, narrow desktop, and mobile widths. Real local source facts were used
for visual inspection; no sync/import action was needed.

## Final validation

- `pnpm check` passed after the final code edits: formatting, workspace
  typechecks, ESLint, and 277 tests across 48 files.
- `pnpm --filter @media-tracker/web build` passed after the final code edits.
- Browser coverage passed across 142 distinct cases: the complete run passed
  the 121 other suite cases and 17 visual cases; the final visual-spec rerun
  passed all 21 cases after correcting four new error-state assertions to use
  the media client's existing message and wait through its retry backoff.
- Existing Vite/API services were reused through a temporary Playwright config;
  it was removed afterward. Local `/api/health` remains healthy. Temporary
  browser tabs were closed, and dark appearance/list preference restored.
- `git diff --check` passed. Other chats' cache, pagination, deployment, and
  documentation work was preserved. This pass does not commit that shared work.
