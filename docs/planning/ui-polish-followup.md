# UI polish follow-up — October 12

Owner-approved follow-up to the [baseline QA](ui-polish-baseline-qa.md).

| Item      | Change                                                                                                                                                |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Toolbar   | Native sort menus throughout; Filters and Sort share the same font size                                                                               |
| Selection | Clicking a selected result closes its inspector and clears selection                                                                                  |
| QA 1      | Incomplete Books date-range drafts stay in URL/UI state and do not produce invalid API requests                                                       |
| QA 2      | Show details work without an active follow relationship; episode-derived show name/counts remain inspectable when separate catalog metadata is absent |
| QA 3      | Music Albums/Artists toolbars wrap the search field onto its own row beside an open inspector                                                         |
| QA 6      | Correct singular episode/show/observation labels                                                                                                      |
| QA 7      | Music section navigation clears selections of another entity type                                                                                     |
| QA 9      | Channel options use the existing searchable, paginated Channels API with a native selector                                                            |
| QA 10     | Video date checkboxes stay small and inline                                                                                                           |
| QA 11     | Album/Artist History gives track titles full row width with subordinate dates/duration                                                                |
| QA 12     | Positive video durations under a minute display `<1 min`                                                                                              |
| QA 13     | Channel Library reports empty Queue/Archive explicitly, alongside loading/error states                                                                |

QA 4 and 5 remain deferred to the filter redesign. QA 8 requires no further
change. QA 3 was reproduced at 1280 × 720 with expanded navigation on Music
Albums/Artists: the grid/list controls extended beneath the inspector. Those
toolbars now wrap. The old Articles/Podcasts overlap cases were not reproduced.

## Verification

All 17 production routes were checked in Chromium at 1280 × 720. Every Library
page uses a native sort menu, and Filters/Sort both measure 11 px. Selection
toggling, toolbar bounds beside inspectors, full channel search (NBA), inline
14 px date checkboxes in dark appearance, readable Artist History, the linked
show inspector, and the empty channel Queue passed 21 real-data browser checks.
Screenshots and the temporary check harness are retained locally under the
ignored `.private/ui-followup/` directory.

The live Sharp Tech show endpoint previously returned
404; it now returns 200, its stored show name, 13 archived episodes, 3 queued
episodes, and `following: false`. Missing publisher/catalog facts remain unknown.
No provider requests or source-data mutations are required by these fixes.

Final validation passed: `pnpm check` (243 tests plus formatting, typechecks,
and lint), `pnpm build`, `pnpm test:e2e` (30 tests in the current combined
checkout), and `git diff --check`. The 21 real-data browser checks also passed.
Temporary failures from sandboxed Chromium, development hot reload, and a
stopped API were resolved before the final runs; no failing assertion was
relaxed to hide an application defect.
