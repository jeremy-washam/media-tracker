# Imladris production shadcn audit

Audited October 12, 2026. Scope: every mounted production route, the application shell,
Connections, all six Library collection implementations, inspectors, and shared
controls. Counts below are source implementation sites, not the number of rendered
items. Design studies, the theme specimen, and the unmounted legacy History page
are excluded from production findings.

## Outcome

The project is configured for **shadcn/ui with Base UI, base-nova**, but the
production screens largely bypassed the installed primitives. At the start of this audit, Button, Input,
and Textarea existed in the shared library without being imported by the mounted
screen implementations. Initializing shadcn did not establish component adoption.

**Fixed in this change:** all 31 single-choice dropdown sites across Books (4),
Movies (7), Articles (1), Podcasts (4), Music (6), and Videos (9) now compose the
actual registry-installed shadcn Select. This includes sorting, date/rating modes,
numeric rating bounds, provenance/status filters, and paginated channel choices.
The wrapper accepts explicit options and `onValueChange`; it does not render a
native select, imitate shadcn styling, or synthesize DOM change events.

Native arrow/padding rules, the extra sort-control border, and the generic focus
outline on shadcn buttons were removed. shadcn owns the trigger icon, border,
focus ring, item layout, selection mark, portal, scrolling, and keyboard behavior.
Application CSS only provides layout and the documented toolbar font size.
Popup placement uses the supported start alignment below the trigger.

**Also fixed after toolbar alignment review:** all six production collection
toolbars now use shadcn Input Group for search and clearing, Button for Filters
and sort direction, and Toggle Group for supported List/Grid selection. All
toolbar controls use the installed primitives' default 32px height, with obsolete
38px sizing, borders, icon positioning, and custom layout-toggle styling removed.
The initial source counts in the findings below describe the audit baseline;
toolbar actions, six primary search fields, and List/Grid controls have since
been migrated. The remaining production findings have also been resolved; see the final implementation table below.

## Findings recorded before the remaining migration, in priority order

| Priority | Gap                                          | Evidence and appropriate shadcn component                                                                                                                                                                                                                                                                                                                                                                                                                                  | Acceptance checks                                                                                                                                                                                                                                            |
| -------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P1       | Five custom inspector tab sets               | Books, Movies, Articles, Podcasts, and Music render raw buttons with `role="tab"`, two default tab stops, and `aria-selected`. They omit tab/panel ID associations, tab panels, and standard arrow-key navigation. Use **Tabs**, **TabsList**, **TabsTrigger**, and **TabsContent**.                                                                                                                                                                                       | One tab stop in each tab list; Left/Right and Home/End navigation; associated panels; retain lazy History queries, inspector focus restoration, and URL behavior.                                                                                            |
| P2       | Native filter checkboxes                     | 12 checkbox implementation sites across all six collections, including repeatedly rendered facets and unknown-date/duration controls. Use **Checkbox** with **Field/FieldLabel** where appropriate.                                                                                                                                                                                                                                                                        | Preserve independent multi-selection, all option counts and labels, Space-key toggling, label clicks, unknown-value semantics, and URL-backed state.                                                                                                         |
| P2       | Handwritten action controls                  | Inspector close, retry, load-more, facet actions, and Connections sync/resume actions still use raw buttons. Toolbar Filters, sort direction, search clearing, and layout switches have been migrated. The audit counted 95 raw button sites outside the inspector tab triggers; this includes custom media rows and backdrop buttons that need separate classification. Use **Button** for ordinary actions and **ToggleGroup** for mutually exclusive List/Grid choices. | Preserve disabled/busy state, accessible icon labels, restrained hover and focus styles, selected states, toolbar fit, and inspector geometry. Classify each button before migration; do not mechanically turn media rows or backdrops into generic buttons. |
| P2       | Shared Input is bypassed                     | 29 ordinary input sites: 9 general/text or numeric fields, 4 facet-search fields, and 16 date fields. There are also 4 file-input sites in Connections. The six primary search inputs have been migrated through shadcn **Input Group** and **Input**; 23 ordinary inputs and the file-input sites remain native. Use **Input** and, where useful, **InputGroup** for integrated search controls.                                                                          | Preserve debounced searches, partial numeric/date drafts, explicit clearing, existing accessible labels, valid request boundaries, and file-upload behavior. Do not add a calendar interaction merely to replace input styling.                              |
| P2       | Native hover hints                           | Sidebar icon navigation and appearance controls use browser `title` attributes. Music duration explanations and Video/Channel activity hints do the same. Use **Tooltip** for explanatory UI.                                                                                                                                                                                                                                                                              | Keyboard-focus and hover access, predictable delay and positioning, readable text, no duplicate browser tooltip, and accessible names independent of the tooltip.                                                                                            |
| P2       | Custom mobile navigation overlay             | `app-shell.tsx` uses local `mobileOpen` state, an aside, and raw backdrop/close buttons. It has no mobile dialog semantics, focus isolation, or Escape handling. Use the **Sidebar** foundation and its **Sheet** behavior, or a shadcn Sheet around the existing navigation.                                                                                                                                                                                              | Escape closes; focus enters and returns correctly; background cannot receive focus while open; navigation closes on selection; desktop sidebar collapse and saved preferences remain intact.                                                                 |
| P3       | Custom loading and notice surfaces           | Connections skeleton rows, collection/inspector loading states, and repeated errors/status messages use bespoke markup and CSS. **Skeleton**, **Alert**, and **Badge** are appropriate shared primitives where their semantics fit.                                                                                                                                                                                                                                        | Preserve live-region behavior, factual copy, retry controls, loading geometry, and compact visual density. Do not wrap every metadata value in a Badge.                                                                                                      |
| P3       | Global CSS can override installed primitives | `styles.css` supplies broad button/input focus, hover, and sizing rules. This was responsible for the Select's extra outline and can affect later component migrations. Select is now excluded from generic focus/hover rules, and native-select-specific rules are removed.                                                                                                                                                                                               | During each migration, remove obsolete appearance rules and keep only necessary layout styles. Verify both light/dark modes and keyboard focus; use the component's supported variants rather than recreating its appearance in global CSS.                  |

## Audit-time source locations

- `apps/web/src/components/library-controls.tsx`: the shared Select composition and custom media-card helper.
- `apps/web/src/components/ui/select.tsx`: actual shadcn registry component, normalized to the existing `@/lib/utils` helper.
- `apps/web/src/components/app-shell.tsx`: native action buttons, browser tooltips, sidebar and mobile navigation overlay.
- `apps/web/src/pages/connections-page.tsx`: native action buttons and account/file inputs; notices and skeletons.
- `apps/web/src/features/books/books-collection-page.tsx`: inspector tabs, facet checkboxes, search and date inputs, action buttons.
- `apps/web/src/features/movies/movies-collection-page.tsx`: inspector tabs, checkboxes, search/date/numeric inputs, action buttons.
- `apps/web/src/features/articles/articles-collection-page.tsx`: inspector tabs, facet/date checkboxes, search/date inputs, action buttons.
- `apps/web/src/features/podcasts/podcasts-collection-page.tsx`: inspector tabs, facet/date checkboxes, search/date inputs, action buttons.
- `apps/web/src/features/music/music-collection-page.tsx`: inspector tabs, facet checkboxes, search/date inputs, action buttons, duration tooltip.
- `apps/web/src/features/videos/videos-collection-page.tsx`: search/date inputs, checkboxes, actions and activity tooltips; paginated channel Select migrated.
- `apps/web/src/styles.css`: legacy control rules and layout styling.

## Appropriate application-owned UI

Media rows, artwork cards, history data layouts, rating illustrations, and
provenance details are application-specific compositions. They can contain shadcn
controls without being replaced by a generic Card or Table component. Semantic
HTML remains appropriate for text, labels, headings, fieldsets, links, and data.

Media-type navigation remains router links. Collection section navigation now
uses shared FlatTabs composed from actual shadcn Tabs, with one associated panel
per trigger and URL-backed navigation/search normalization. The earlier
router-link-only guidance was superseded by that migration. The desktop inspector is a nonmodal application pane.
Do not convert it wholesale to Dialog or Sheet. Its narrower-screen overlay
behavior should be evaluated separately when modal primitives are adopted.

There is no mounted production settings page, Chat interface, Recaps interface,
custom dropdown menu, date-picker popup, or toast system to migrate. The separate
specimen's Tabs/Popover/Tooltip/Checkbox components are study-local and must not
be imported into production as a shortcut. Add matching components through the
production shadcn configuration.

## Durable implementation rule

Use the actual installed shadcn/ui component whenever it provides the required
control or interaction. Add missing primitives through the configured CLI.
Application wrappers should compose those primitives and adapt application data;
they should not replace their interaction model or copy their appearance into
raw HTML. Preserve base-nova, Graphite semantic tokens, documented density, and
existing application behavior. Broader design changes are separate from adopting
the component foundation.

## Validation

- `pnpm check`: passed formatting, workspace type checks, lint, and 262 tests in 46 files after the final application-code change.
- `pnpm build`: passed the full repository build; the final web application was rebuilt successfully after the last layout-preference fix.
- `pnpm test:e2e`: all 51 tests passed on the final rerun. Coverage includes all six media sorts, date/rating modes, numeric bounds, paginated channel options, keyboard selection, Escape, focus restoration, browser history, debounced search, clearing, layout preferences, inspector behavior, and existing intermediate/narrow layouts.
- Geometry checks across all six collection toolbars: every control is 32px tall, top edges match within 1px, and adjacent controls do not overlap. Chevron center error is at most 1px and its right inset is at least 8px. Opening and closing the tested menu preserves trigger geometry.
- Live dark-mode Books and Podcasts review confirms the menu placement and matching toolbar heights. The remaining Books inspector tab issue was reproduced: ArrowRight leaves Details focused, both tab buttons have tabindex 0, neither has aria-controls, and no tabpanel exists.
- `git diff --check`: passed. No native select/option markup remains in production collection or shared component source.

Official reference: [shadcn Select with Base UI](https://ui.shadcn.com/docs/components/base/select).

## Visual verification follow-up

The October 12 follow-up reviewed the live Library and Connections after the
component migration. Toolbar geometry passed on all 16 Library routes, including
Archive/Queue, Reader Feed, Following, Albums/Artists, and Channels. Loaded Books,
Movies, Articles, Podcasts, Albums, and Videos were visually reviewed, along with
the Video filter panel, Album grid/list switching, and Connections.

Two related layout problems were found and fixed:

- With an inspector open in a narrower window, the toolbar retained a wide grid
  and clipped controls. Collection panes now provide an inline-size container;
  below 700px, search occupies a full row and the remaining controls wrap. All
  controls retain their 32px component height.
- The trigger-width popup clipped longer labels such as Date added to Reader.
  The shared shadcn popup now sizes to its option content within the available
  viewport width, and very long labels wrap. Filter selects do not shrink their
  selected text to make room for adjacent unknown-value controls; those controls
  wrap instead.

The expanded end-to-end suite covers all six media types in light and dark
appearances at 1280px, 1024px, 768px, and 390px widths. It checks control bounds,
32px heights, popup viewport containment, complete option labels, inspector
opening/closing, and a long channel name that must wrap. Narrow-screen inspector
backdrops retain their existing behavior; menu interaction with an open inspector
is checked at the nonmodal desktop width.

Final gates passed after the code changes: pnpm check (262 tests in 46 files,
formatting, workspace type checks, and lint), all 51 end-to-end tests, and the web
build. The broader component gaps were addressed in the subsequent migration below.

## Remaining findings resolved (2026-10-12)

All production findings above are resolved. The initial table remains as the audit baseline; it is not an outstanding-work list.

| Finding               | Final implementation and evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inspector tabs        | Books, Movies, Articles, Podcasts, Music, Video, and Channel inspectors compose installed shadcn Tabs through shared FlatTabs wrappers. Channels' nested Archive/Queue also uses actual Tabs. Each inspector trigger keeps an associated panel ID, inactive panels remain hidden, and keyboard arrows/Home/End move focus with Enter activation. Queries still load History only when selected. Existing focus loops exclude hidden controls and negative tab stops. Header work was coordinated with the UI polish chat. |
| Checkboxes and inputs | All 12 native checkbox sites use Checkbox, with FieldLabel and an explicit Field grouping for Video duration. Ordinary search/numeric/date inputs use Input. Connections file actions compose Button and Input via FileUploadButton; accepted extensions, disabled state, handlers, and input reset behavior remain intact.                                                                                                                                                                                               |
| Ordinary actions      | Close, clear, retry, pagination, sync, and resume actions use Button. Active filter buttons use supported variants. Custom media rows/cards and inspector backdrops remain deliberate native interactions, centralized in library-controls.tsx.                                                                                                                                                                                                                                                                           |
| Hover hints           | Sidebar navigation, appearance, sort explanations, and Music duration explanations use Tooltip through Hint. Hints have explicit tooltip roles and trigger/description associations, work with keyboard focus, and preserve independent accessible names.                                                                                                                                                                                                                                                                 |
| Mobile navigation     | The navigation uses the installed Sheet with modal focus isolation, Escape, a working close button, focus return, and close-on-navigation. Desktop collapse and appearance preferences remain intact. Visual inspection caught and removed the sidebar stacking level that covered the Sheet close control.                                                                                                                                                                                                               |
| Loading/status/errors | Collection and inspector loading states compose Skeleton with retained announcements; Connections placeholder rows use Skeleton. Errors compose Alert; connection/health status uses Badge where appropriate. Metadata stays plain text.                                                                                                                                                                                                                                                                                  |
| CSS ownership         | Obsolete native input/button/tab, skeleton gradient, error surface, and selected-control rules were removed. Remaining rules arrange application layout and content. Standard variants own component appearance and focus styling. All toolbar controls remain 32px high.                                                                                                                                                                                                                                                 |
| Durable guardrails    | Root AGENTS.md, apps/web/AGENTS.md, UI foundation, and web README require installed shadcn Base UI primitives and real visual/keyboard verification. ESLint rejects raw button/input/select/textarea, manual tab roles, and browser title hints in production features/pages/shared components, excluding only primitive implementations and the documented native row/backdrop boundary. A lint probe confirmed all six forbidden patterns fail. Historical design studies remain references outside production routes.  |

The dedicated interaction suite covers every collection's Checkbox label/Space behavior, light/dark mobile focus isolation, close/Escape/navigation and focus restoration, keyboard Tooltip, a file chooser without uploading, loading/error/retry, and the complete Video duration checkbox label. Existing coverage continues to measure toolbar and popup bounds at 1280, 1024, 768, and 390px, in both appearances, and inspector movement. Header/tab integration includes all seven inspector fixtures and channel membership tabs.

Live visual review covered populated Books, Movies, Articles, Podcasts, Music, Videos, and Connections; filters and the actual Select popup; the inspector tab treatment; narrow Article filters; and mobile Sheet in light/dark appearances. No sync or import was triggered during live review. Screenshots are saved with the user-facing audit copy.

Final validation after the last source change:

- `pnpm check`: formatting, all workspace typechecks, lint, and 270 tests in 47 files passed.
- `pnpm test:e2e`: all 64 tests passed, including the final portal underline assertions, retained inspector panels, all 12 dedicated shadcn interaction checks, and inspector movement.
- `pnpm build` passed; the web build was rerun and passed after the final shared-tab adjustment.
- `git diff --check` passed; the running frontend/API health endpoint returned healthy.

An earlier concurrent validation run hit the existing API reconciliation test's 5-second timeout. The complete required gate was rerun after browser/build load finished and all 270 tests passed without changing that test or API behavior.

## Header padding follow-up

The Library header previously used 24px horizontal padding while collections used `clamp(22px, 3vw, 42px)`. Header and collection now share responsive inset tokens and reserve matching scrollbar gutters. Header inspector spacing remains part of its end inset. The small-screen inset remains 14px.

Live Music geometry at 1280px confirms the header and toolbar share the same left edge (246.398px) and right edge (1241.602px). The row edges also match. Twelve new regression cases verify all six collections in light/dark appearances at 1280, 1024, 768, and 390px, including forced classic scrollbars and open/closed inspectors. All 31 relevant layout/navigation/motion regressions, the frontend build, and pnpm check (270 tests in 47 files) passed. The UI foundation records the shared-inset requirement.

## Isolated UI commit validation

The final UI snapshot is based on `edb37cd` and excludes the parallel deployment
and Library cache changes. The collection loading integration retains one
visible loading label alongside the shared Skeleton; regression coverage checks
that label is rendered with a measurable height.

Final gates on this exact snapshot:

- `pnpm check`: formatting, workspace typechecks, lint, and all 243 tests in 43 files passed.
- Web production build passed.
- All 82 end-to-end tests passed against a separate Vite server serving the snapshot, including all 12 header padding cases and the six visible collection loading states.

The earlier larger unit-test totals above include work from other chats and are
retained as historical integrated validation. The isolated totals here describe
the code included in this UI commit.
