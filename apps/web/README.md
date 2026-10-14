# Web

The desktop React/Vite client consumes the REST API and contains no provider
credentials. The root redirects to Books Archive. Library exposes 16 sections
across Books, Movies, Articles, Podcasts, Music, and Videos, with server-side
search/filter/sort, complete counts, cursor pagination, and contextual inspectors.
The legacy History component is not routed. Chat and Recaps remain disabled
navigation; Settings has no production route.
Connections uses compact source rows with bundled official logos and labeled
connection-state icons. Sync/coverage summaries remain visible; Collapsible
details retain source limitations and attempt/export dates. The account form
follows the source rows. Standard actions use the small shadcn Button variant.
Connections displays every account lineage, coverage, attempts,
incomplete-import progress, and resumable Spotify/YouTube imports. Use an
existing YouTube card for later snapshots of the same account.

`pnpm build:production` at the repository root prepares the hosted app. The web
package's deployment-mode build writes `dist-production`, excludes all private
samples and design entries, and copies only allowlisted public assets. Local
builds retain the studies and specimen. See the [deployment runbook](../../docs/planning/deployment.md).

During local development Vite serves `http://127.0.0.1:5173` and proxies `/api`
to the local Worker at `http://127.0.0.1:8787`. Import chunks are driven by the
browser; reopening Connections offers Resume import if a previous run stopped.

## Library loading and caching

Library queries stay fresh for 10 minutes, and inactive in-memory results are
retained for 30 minutes. After the current page finishes its initial collection
request, the client prefetches the first page of every remaining Library section,
Connections, and sync activity with at most two background requests at a time.
It pauses launching background work while a foreground query is loading, while
the tab is hidden, or while the browser is offline. Prefetch failures fall back
to normal fetching when the section is opened.

Only the default, unfiltered first page of each of the 16 Library sections is
saved in browser local storage. Reloads restore those pages before rendering,
preserving their original fetch times. Results older than 10 minutes refresh in
the background when opened; snapshots older than 24 hours are discarded. The
cache is versioned, bounded to 2 million characters, and validated against the
API response schemas. Filters, subsequent pages, inspectors, content, and
operational status are not persisted. Storage failures leave normal browsing
available. This cache contains private Library metadata on the owner's browser.

Completed or failed import/sync attempts invalidate Library results along with
the existing connection/activity caches. Invalidated entries are removed from
the persisted snapshot. Connections and sync activity retain five-second polling;
health retains 30-second polling. Opening the Library does not start provider
syncs or catalog jobs.

## Branding

The expanded sidebar pairs the 30px compact J2 house-and-waterfall symbol with a
20px, weight-500 system-font Imladris wordmark. The collapsed sidebar hides the
wordmark.
Interface text keeps system typography; no brand font is loaded.
The symbol follows the active light/dark text color; the SVG favicon follows
system appearance. Brand assets are in [the brand asset notes](src/assets/brand/README.md).
These imported source assets are included in both Vite build modes.

## Design studies

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
