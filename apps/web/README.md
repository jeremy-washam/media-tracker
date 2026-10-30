# Web

The desktop React/Vite client consumes the REST API and contains no provider
credentials. The root redirects to Books Archive. Library exposes 16 sections
across Books, Movies, Articles, Podcasts, Music, and Videos, with server-side
search/filter/sort, complete counts, cursor pagination, and contextual inspectors.
Collection search, filters, sort, layout, counts, and applied-filter chips remain
visible above the results scroll viewport. Filter options open in a modal Sheet;
removing an applied group also clears dependent bounds. Infinite pagination and
scroll restoration continue to use the results viewport. Collection summaries
show item counts without additional consumption totals.
Available ratings use shared stars, including fractional stars, in collections
and inspectors; Movie results omit the viewing-rating qualifier.
Library lists omit the extra border above their first item.
Results have 16px of space below the fixed collection header. Artwork cards grow
with their text; Movie titles reserve two complete lines above the metadata.
The top 12px of the results viewport fades into the page background as content
scrolls beneath the header. The initial gap keeps the first items outside that
fade, and the header has no dark drop shadow.
Music artist lists, grids, and inspectors use separately acquired Spotify artist
photos when available.
Books omits column headings, and the passive API status does not change
appearance on hover.
The legacy History component is not routed. Chat opens the selected Familiar
interface with saved history, Favorites, streaming activity and Library citations.
Recaps remains disabled; Settings has no production route. Chat uses the existing
sidebar, with New Chat and collapsible Favorites/Chats below application navigation.
See [Chat runtime](../../docs/decisions/0023-owned-chat-runtime.md) for lifecycle,
provider and credit boundaries.
Connections uses compact source rows with bundled official logos and labeled
connection-state icons. Sync/coverage summaries remain visible; Collapsible
details retain source limitations and attempt/export dates. The account form
follows the source rows. Standard actions use the small shadcn Button variant.
Connections preserves every account lineage, coverage, attempts,
incomplete-import progress, and resumable Spotify/YouTube imports. Spotify has
one source row and one set of Sync/Import actions, matching the API's first
connection target. Additional Spotify records, including their exact Resume
targets, appear in Details; a visible summary flags unfinished imports there.
Do not delete or merge ledger records to deduplicate source presentation.
YouTube keeps separate account rows; use the existing row for later snapshots
of the same account.

`pnpm build:production` at the repository root prepares the hosted app. The web
package's deployment-mode build writes `dist-production`, excludes all private
samples and design entries, and copies only allowlisted public assets. Local
builds retain the studies and specimen. See the [deployment runbook](../../docs/planning/deployment.md).

During local development Vite serves `http://127.0.0.1:5173` and proxies `/api`
to the local Worker at `http://127.0.0.1:8787`. Import chunks are driven by the
browser; reopening Connections offers Resume import if a previous run stopped.

## Library loading and caching

All six collection APIs use `section` and default to 50 items per page. Visible
items and filter-specific summaries load independently in parallel; pagination
and sorting do not repeat summary work. Default first pages and summaries warm
with at most two background requests and persist independently across reloads.
Ten-minute freshness, thirty-minute inactive retention, and the 24-hour bounded
snapshot lifetime remain in effect. Retained multi-page browsing snapshots avoid
automatic full-chain refreshes on remount/focus/reconnect while preserving exact
position; explicit import/sync invalidation still refreshes them safely.

Connections polls its head activity page and account status every minute while
idle and every five seconds during active work. Hosted manual source sync returns
202 queued acceptance; it does not report imported totals before processing.
Connections keeps a bounded queued state while waiting for activity and refreshes
Library snapshots when polling observes a terminal run transition. Local source
sync retains its synchronous result. Older activity is unpolled.
Hardcover page responses distinguish background continuation from a completed
reconciliation; the first page does not claim full import completion.
Health retains thirty-second polling. See the owning
[Library fetching contract](../../docs/architecture/library-fetching.md) for
endpoint shapes, persistence, invalidation, and refresh details.

Completed or failed import/sync attempts, including Resume import, cancel older
Library reads before invalidating item pages and summaries. Invalidated snapshots
are removed from browser storage immediately. Storage failures leave browsing
available. Persisted metadata stays private to the owner’s browser; opening the
Library never starts provider syncs or catalog jobs.

## Typography

Production uses the owner-approved original Balanced study: 12px supporting
metadata/counts, 14px interface and inspector body/facts, 16px list titles, and
22px inspector titles/wordmark. Weights are 400 for body/counts, 500 for controls
and section headings, and 600 for media titles. Overview and inspector label/value
rows both use 14px / 400; the later 12px inspector experiment was rejected.

`components.css` owns `--app-text-*`, `--app-weight-*`, the shared body leading,
and their Tailwind text mappings. Modules apply roles to custom content; shared
compositions/variants own control typography. Narrow editable inputs keep the
primitive's 16px accommodation. Counts and `small` elements have an explicit
12px role instead of shrinking relative to an already small parent. Retain the
actual shadcn/Base UI controls and their interaction behavior.

See the [UI foundation](../../docs/design/ui-foundation.md#approved-typography-balanced-october-29-2026)
and [saved mocks](../../docs/design/typography-study/README.md).

## Branding

The expanded sidebar pairs the 30px compact J2 house-and-waterfall symbol with a
22px, weight-500 system-font Imladris wordmark. The collapsed sidebar hides the
wordmark.
Interface text keeps system typography; no brand font is loaded.
The symbol follows the active light/dark text color; the SVG favicon follows
system appearance. Brand assets are in [the brand asset notes](src/assets/brand/README.md).
These imported source assets are included in both Vite build modes.

## Design studies

### Persistent Library header preview

Open `/header-preview.html` on the development server for an isolated Books
mockup. The sidebar's Header preview selector compares the current scrolling
toolbar with a proposed persistent toolbar. Search, filters, sorting, collection
tabs, list/grid, theme, and the contextual inspector are interactive. At narrow
widths, open Navigation to find the preview selector. All content is illustrative,
state is temporary, and the preview makes no API requests. This review study remains available alongside the production implementation;
deployment builds exclude the study entry.

Run the isolated scroll, focus, theme, and narrow-layout checks with
`pnpm exec playwright test --config playwright.header-preview.config.ts` from the
repository root. These checks start only Vite on port 5174 and never start the API.

With `pnpm dev:web` running, open `http://127.0.0.1:5173/design.html`.
The separate preview entry offers seven structural studies of Chat, Library,
and Recaps: Index, Top nav, Two-pane, Journal, Gallery, Research, and Documents. All content and model responses are illustrative and state
is temporary. It makes no requests to the application API. See
`docs/design/ui-foundation.md` for scope and interaction details.

Index is the selected base. Preserve all seven studies as references. Reopening
instructions and source locations are in [saved mockups](../../docs/design/mockups.md).

## Shared components

Use shadcn/ui with Base UI (`base-nova`) for new interface work. Tailwind v4
and the `@/*` alias are configured in Vite and TypeScript. Components are owned
source in `src/components/ui`, with the class-name helper in `src/lib/utils.ts`.
Button, Input, Textarea, Select, Input Group, Toggle/Toggle Group, Tabs, Checkbox, Tooltip, Sheet, Alert, Badge, Skeleton, Field, Collapsible, Separator, and Spinner are installed.
Library toolbars compose these actual primitives at their shared 32px default height. LibrarySelect composes the
actual shadcn Select for all collection sorting and single-choice filters.
Pass explicit string-valued options and onValueChange; do not use native
select elements or synthesize DOM change events. The wrapper sets the popup
to start alignment below its trigger and preserves shadcn component styling.
See the [production component audit](../../docs/planning/shadcn-ui-audit.md)
for the completed migrations and regression evidence.

```tsx
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

<Input aria-label="Search library" placeholder="Search" />
<Button variant="outline">Filters</Button>
```

Add components from the repository root:

```sh
pnpm dlx shadcn@latest add dialog -c apps/web
```

`components.json` targets the shared library, not the separate theme specimen.
Use the Base UI `render` composition API rather than Radix `asChild`. Generated
code may need formatting and non-component exports moved into adjacent files to
satisfy the repository's Fast Refresh lint rule (see `button-variants.ts`).
The CLI currently imports the `cn` package directly; normalize generated imports
to `@/lib/utils`, our existing `clsx`/`tailwind-merge` helper, and remove the
redundant dependency if the CLI adds it.

`src/components.css` contains the selected Graphite light/dark semantic tokens
and animation utilities. It is imported by the operational `src/styles.css`,
which already loads Tailwind. Apply `.dark` to a containing element for dark
component tokens. The shell provides a light/dark appearance control, remembers
the choice, and uses system appearance when no preference is saved. Production
screens use these tokens; the separate specimen retains the alternative-theme
comparison. Future entries should import Tailwind and this stylesheet once.
Keep component colors on the shared semantic tokens.

## Icons

Production glyphs are Phosphor Regular, re-exported from `src/components/icons.ts`.
Import icons and the `AppIcon`/`IconProps` types from that module. Its individual
Phosphor imports avoid eagerly processing the entire catalog during Vite startup.
The app's IconContext supplies Regular weight, 24px fallback size, currentColor,
and decorative accessibility defaults; component CSS retains role-specific
sizes. Meaningful status icons such as Spinner override `aria-hidden` and retain
their accessible labels. Rating stars and liked hearts explicitly use filled
weight. The configured shadcn icon library is `phosphor` for future additions.

Media identities are BookOpen, FilmReel, Article, Microphone, MusicNotes, and
YoutubeLogo. Filters share Funnel; music artwork fallbacks share a kind-specific
selector between collections and inspectors. See the
[UI foundation](../../docs/design/ui-foundation.md#production-icons).
Lucide remains a dependency for isolated historical studies and the specimen.
Source-service logos, Imladris brand assets, and native iOS SF Symbols retain
their existing ownership.

## Styling ownership

Production uses Tailwind v4 and plain CSS Modules alongside the installed
shadcn/ui Base UI components. See [ADR 0019](../../docs/decisions/0019-web-styling-ownership.md)
and the [cleanup implementation record](../../docs/planning/web-styling-cleanup.md).

- `src/styles.css` owns document defaults, accessibility defaults, and registered
  inspector width properties. `src/components.css` owns light/dark semantic
  tokens, shared application metrics, and Tailwind theme mappings.
- Shared compositions own control density and appearance: FlatTabs,
  LibraryToolbar, LibraryFilterPanel, LibrarySelect, and navigation variants.
  AppButton/AppInput compose installed primitives with the shared 14px control
  role and 16px narrow editable-input size.
- CSS Modules beside components/features own substantial custom layouts and
  media presentation. Shared Library workspace, inspector, and media modules
  keep geometry, motion, and list presentation consistent across six media types.
  Small arrangements use Tailwind utilities.
- Production module imports are ordered explicitly in `src/main.tsx` before
  the router. Application module rules remain unlayered where they must retain
  precedence over primitive utilities. Changing that order or layering requires
  visual verification. Modules contain ordinary CSS and use shared variables;
  do not import Tailwind per module or use Sass, `@apply` directives, or global class aliases.
- `data-ui` identifies shared structural parts across component/portal boundaries
  and in geometry tests. Accessible names and refs own actions/focus;
  `data-layout`, `data-inspector-open`, and `data-collection-item` own explicit state
  and collection identity. Do not query generated class names. Keep Base UI's
  `data-slot` contracts separate.

The unmounted History page owns its legacy stylesheet and is not imported into
production. Design, specimen, and Library review entries retain independent
stylesheets. Keep `components.json` targeting `src/components.css` for shadcn.

## Production UI guardrails

Loaded inspector geometry, responsive Book columns, compact filter typography,
toolbar order, mobile selected-tab visibility, and Article source disclosure
are covered by `tests/e2e/visual-consistency.spec.ts`. InspectorHeader composes
the shared bounded topbar; scrolling content stays below it. Reader provenance
uses the installed shadcn Base UI Collapsible. See the
[visual audit acceptance](../../docs/planning/visual-ui-audit.md) for all twelve
approved findings and their resolutions.

The root and web AGENTS.md require installed shadcn/ui Base UI controls, their supported variants, and interaction/visual verification. ESLint rejects raw button/input/select/textarea markup and handcrafted tab roles in production feature/page code and the shell. Media row/card and inspector backdrop buttons are deliberately centralized in library-controls.tsx; ordinary actions use Button. Explanatory hints use Hint, which composes Tooltip. FileUploadButton, Notice, and LoadingState compose installed Input/Button, Alert, and Skeleton without replacing their primitives. Historical design studies remain separate references. See docs/planning/shadcn-ui-audit.md for the audit and acceptance evidence.

## Library infinite scrolling

Library collections compose `CollectionPagination` for automatic cursor loading,
Spinner/status, next-page Alert/Retry, completion, and a keyboard loading fallback.
`useCollectionScroll` owns the collection viewport ref and anchors a visible item
across presentation changes and same-session cached navigation. Query keys exclude
presentation state. Facet-option and inspector pagination remain explicit.

## Test coverage and recovery

Web unit tests cover Library request encoding/response validation, route/view
normalization, chunked import progress and account targeting, and cache
persistence/prefetch cancellation. Run `pnpm exec vitest run apps/web/src` from
the repository root. Browser integration tests live in `tests/e2e` and use
synthetic API responses; the separate real-stack acceptance suite validates the
Worker and database boundaries.

Video and Channel inspectors share keyboard focus, Escape dismissal, and opener
focus return with the Spotify surfaces. Direct item links return focus to the
collection heading. Watch history and channel previews show loading, failure,
retry, and empty states distinctly. Channel Library panels retain separate
Archive/Queue query state and fetch only when activated. Filtered empty states
offer clearing across all media. Browser storage failures preserve browsing and
in-memory appearance/sidebar preferences.
