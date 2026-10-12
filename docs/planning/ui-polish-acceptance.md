# UI polish integrated acceptance

Verified October 4–5, 2026, against the main local app on port 5173 and API on 8787. This record covers the approved polish pass, not approval of the new
findings in the [independent baseline report](ui-polish-baseline-qa.md).

## Browser checks

The UI agent checked Books search without Enter, stars, fixed card dimensions,
full-height inspector geometry, custom sorting, Movies at 1280 and 960 px,
and Connections in light and dark appearances. The parent independently checked
the integrated app after restoring the stopped frontend:

| Area               | Result                                                                                                                                                      |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Books list         | Publish Year, Read Date, and Rating columns; title/author retained; no inline Physical field                                                                |
| Font and controls  | System typography, inset custom-sort chevrons, compact icon-only direction controls                                                                         |
| Inspector          | Top 0, height 720 in a 720 px viewport; entrance and exit animations both present                                                                           |
| Scroll containment | Document scroll remains 0 while collection scrolls independently; opening a scrolled Iron Gold row retains the selected row in view                         |
| Cards              | Shared fixed 154 × 304 px card box; automated geometry assertion around inspector opening passes                                                            |
| Search             | All six collections apply typed queries without Enter and clear them successfully in E2E coverage                                                           |
| Saved layout       | List default, cross-media persistence, reload persistence, explicit URL override covered by E2E                                                             |
| Podcasts           | Archive has no layout toggle; Following keeps layout choices and shows 12 eligible shows, excluding the positively identified audiobook records             |
| Music              | Tracks has no grid option; Albums and Artists retain choices; all three counts remain populated immediately during section changes                          |
| Missing duration   | Unknown played time displayed quietly as an em dash with an accessible source explanation; known accumulated duration retained                              |
| Articles           | Expanded metadata rows without density controls or ARTICLE/PDF badges; keyboard ArrowDown/End/Enter changes custom sort to Reading time and updates the URL |
| Channel Library    | 25 visible-data rows have 25 thumbnail elements; titles wrap; full-height inspector checked in light and dark appearances                                   |
| Connections        | Shared surface tokens and readable light/dark content; durable catalog progress and awaiting-worker state verified by UI agent                              |

The shared contained-scroll change incidentally resolves the baseline book
inspector's jump to the top in the exercised case. Other additional baseline
findings were not independently exhaustively retested here and remain for owner
review, rather than being silently added to this pass.

The independent QA agent completed its baseline browser pass, but its browser
connection was unavailable for the follow-up. Integrated checks above were
performed by the UI agent and parent; they must not be described as a second
complete independent QA pass. OS-level rubber-band overscroll remains outside
what the browser automation established; CSS scroll containment was verified.

## Automated and migration checks

- `pnpm check`: formatting, workspace typechecks, lint, and 237 tests passed.
- `pnpm build`: all package builds, frontend build, and Worker dry-run passed.
- `pnpm test:e2e`: 23 tests passed on the final implementation.
- Migration tests cover the additive index upgrade from the preceding schema,
  retained rows, query-plan index use, and foreign-key consistency. Repository
  suites initialize the complete schema. Main local migrations 0023/0024 applied.
- `git diff --check`: passed.

An intermediate browser-test run encountered host-suspension timeouts. Another
encountered a stopped frontend while the API remained alive. The frontend alone
was restarted; the final complete browser suite passed in approximately 12 s.
No test expectation was relaxed to conceal these environmental failures.

## Backend measurements

Local real-data API measurements used 40-row pages. Repeated after-values are
warm local requests; these are not end-to-end browser rendering measurements.

| Endpoint        | Before                  | After         |
| --------------- | ----------------------- | ------------- |
| Music Tracks    | 13.61 s                 | 0.116–0.152 s |
| Music Albums    | Not separately recorded | 0.242–0.563 s |
| Music Artists   | Not separately recorded | 0.147–0.171 s |
| Videos Archive  | 1.94 s                  | 0.590–0.915 s |
| Videos Channels | Not separately recorded | 0.092–0.117 s |

Simultaneous Music/Videos/health requests measured 0.119/0.713/0.120 s. The
performance comparison retained identical first-page Music/Videos JSON,
including counts and cursors. Ongoing catalog updates can independently change
the current live album/artist inventory; the UI acceptance check compares count
retention across navigation, not a permanently fixed inventory total.
