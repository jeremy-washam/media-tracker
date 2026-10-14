# Web styling cleanup plan

Status: Complete and validated in the separate `codex/styling-cleanup` worktree.
Last updated: 2026-10-13

## Purpose and scope

Make production web styling locally owned and easier to change while preserving
the current interface and behavior. Keep shadcn/ui Base UI and Tailwind for
standard controls and straightforward composition. Use ordinary CSS Modules for
substantial custom application styling. Keep global CSS for theme tokens,
document defaults, accessibility defaults, and registered custom properties.

The scope includes the shell, all 16 Library sections, inspectors, shared
controls, and Connections. Historical design, Library review, and specimen
entries retain their own styling and remain buildable. The unrouted History
component is a separate legacy ownership concern. Native iOS work is outside
this plan.

This is a structural cleanup. Preserve the system font, Graphite light/dark
theme, current control typography, list default and saved/URL layout precedence,
artwork dimensions, 101px list baseline, 32px toolbar controls, 38px sidebar
navigation, and 54px aligned headers. Preserve all media semantics, URL state,
loaded pages, cache behavior, exact item-and-offset scroll restoration, focus
behavior, popup placement, Sheet navigation, and reduced motion.

## Audit findings

At the audited baseline, production `apps/web/src/styles.css` had 3,597 lines. It combines
scaffold styling, shared layouts, feature styling, and successive polish blocks.
There were no CSS Modules in `apps/web/src` at that baseline.

| Finding                                                 | Current evidence                                                                                                                                     | Cleanup requirement                                                                                                                         |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Effective appearance depends on successive overrides    | `styles.css` defines Book columns around lines 1638, 2918, 3011, and 3475; inspector positioning around 1751, 2012, and 2792                         | Reconstruct the complete effective rules before extraction. Earlier rules still supply properties; copying only the final block loses them. |
| Shared Library layout has Book-specific names           | All six collection implementations use `.books-page` and `.books-collection`; shared geometry starts around `styles.css:2761`                        | Give collection viewport, container queries, insets, toolbar wrapping, and inspector geometry shared ownership.                             |
| Styling classes are runtime hooks                       | `collection-scroll.ts:96` uses `.layout-toggle`; Books `:752`, Movies `:800`, and Articles `:776` use `.inspector-close` for initial focus           | Replace these dependencies before hashing classes.                                                                                          |
| Controls have two styling owners                        | Sidebar Button appearance at `styles.css:736`; FlatTabs at `:3272`; compact toolbar/filter typography at `:2943`, `:3205`, and `:3512`               | Put approved appearance in component compositions or supported variants; retain layout constraints in modules.                              |
| Shell and route styling cross component boundaries      | Shell `:has()` selectors inspect collection classes around `styles.css:3310`; collection tabs portal into the workspace header in `flat-tabs.tsx:68` | Migrate related selectors together using shared module exports or explicit layout state. Account for actual portal placement.               |
| Shared media presentation is encoded in selector groups | Cross-media rows and states at `styles.css:3078–3163`                                                                                                | Preserve one owner for common row height, separators, selection, and typography; keep media-specific geometry local.                        |
| Theme defaults depend on application class names        | Navigation cursor selectors in `components.css:16–20`; token aliases at `styles.css:6–10`                                                            | Move navigation cursor ownership with the component and consolidate equivalent token names without changing colors.                         |
| Tests depend on presentational classes                  | Header padding, visual consistency, inspector motion, infinite scroll, cache, and scaffold tests                                                     | Replace selectors while retaining every meaningful assertion and geometry threshold.                                                        |

The current application rules are largely unlayered and can outrank Tailwind's
layered utilities. CSS Modules scope class names; they do not fix cascade
precedence. Treat stylesheet movement and cascade-layer changes as separate,
observable changes.

## Target ownership

| Owner                                              | Responsibility                                                                                                                       |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Global entry and `components.css`                  | One production Tailwind import, theme variables and mappings, base defaults, document sizing, global custom-property registration    |
| Existing shadcn components and shared compositions | Standard control appearance, variants, focus/disabled states, popup behavior, compact navigation/toolbar/filter/tab presentation     |
| `app-shell.module.css` beside AppShell             | Sidebar, branding, workspace/header positioning, collapsed rail, mobile Sheet layout                                                 |
| Shared Library workspace module                    | Collection scroll viewport, toolbar arrangement, pane container queries, header insets, inspector space and coordinated motion       |
| Shared media presentation module                   | Common row/card content presentation, separators, selection, title/subtitle/metadata styles                                          |
| Shared inspector module                            | Frame, fixed header, scroll content, sections, detail/history typography                                                             |
| Feature modules beside collection pages            | Book columns/covers, Movie poster/review, Article excerpts/source disclosure, Podcast/Music content variants, Video/Channel geometry |
| Connections module                                 | Connection summaries, cards, activity/checkpoint layout                                                                              |

The module names above are proposed responsibilities, not a requirement to create
a file for every small component. Use Tailwind for small arrangements. Share
substantial application styles through narrow exports or existing wrappers,
without building a generic design-system abstraction.

Modules use plain CSS and existing variables. Do not add Sass, import Tailwind
per module, use `@apply`, or preserve old class names through permanent `:global`
aliases. Keep `.dark`, library data states/slots, and Tailwind group identifiers
as intentional contracts. Keep `components.json` targeting `src/components.css`.

## Implementation sequence

### 1. Capture the baseline and separate behavior from classes

Record screenshots and computed metrics for representative loaded collections,
inspectors, filters, popups, and shell states in both themes at desktop and narrow
widths. Include long titles, missing artwork, and loading/error/empty states.
Record current import order and which declarations actually win.

Replace runtime class queries with refs or explicit behavior attributes. Preserve
`data-collection-item` and `data-inspector-open`. Add a small set of stable layout
hooks where geometry tests need them, such as `data-layout-part` for collection,
toolbar, header, and inspector content, plus `data-layout` for list/grid state.
Prefer role/name queries for controls. Avoid reusing Base UI `data-slot` for new
application hooks because existing selectors attach styling behavior to it.

Convert affected test locators and injected scrollbar CSS without weakening
assertions. Add targeted initial-focus checks for Books, Movies, and Articles,
and a loaded Movie inspector case to the shared inspector matrix. This phase
must preserve existing appearance before any class hashing.

### 2. Establish component appearance ownership and a small module pilot

Move approved compact FlatTabs, navigation, toolbar, and filter appearance into
their existing compositions or explicit supported variants. Preserve the actual
Base UI primitives and associated tab panels. Remove each matching global
override when its component becomes authoritative. Width constraints and portal
positioning remain application layout responsibilities.

Use the pagination footer as a small CSS Module pilot if its custom rules remain
worth a stylesheet; otherwise use utilities and pilot Connections. Verify module
imports, TypeScript, CSS output, and both web build modes. Preserve import/cascade
ordering during the pilot. Vite and its existing client types already provide
the basic module support; add tooling only for a demonstrated gap.

### 3. Migrate shared shell and Library geometry

Consolidate effective shell, collection, and inspector frame rules into their
owners. Move shared dependencies together rather than hashing one child class
at a time. Resolve header portals, Sheet portal content, cursor policy, and
shell-to-route selectors explicitly.

Keep container queries tied to collection pane width, including inspector space.
Preserve the registered `--inspector-space` and `--header-inspector-space`
properties and their current 180ms motion relationship, including the retained
closing content in `library-hooks.ts`. Do not redesign motion during extraction.
Retain registered properties globally; keep their application rules with their
owners. Validate header/collection alignment, scroll gutter, fixed inspector
header, narrow wrapping, and reduced motion before proceeding.

### 4. Migrate shared media presentation and individual features

Extract common media row/card and inspector content styles first. Compose them
through existing media wrappers or shared module exports so six feature modules
do not duplicate the accepted list presentation.

Migrate Books first because it exercises columns, artwork, filters, grid/list,
and inspector history. Then migrate Movies, Articles, Podcasts, Music, Videos,
and Connections. Preserve source-specific fields and layouts. Each slice removes
its corresponding old global rules after validation; do not leave competing
authoritative stylesheets.

Serialize shared layout/variant changes. Feature modules may be assigned to
separate agents only after shared exports and behavior hooks are stable, with
one integration owner for global CSS removal and validation.

### 5. Remove obsolete rules and finalize cascade ownership

Audit scaffold-only candidates such as `.site-header`, `.primary-nav`, and
`.site-footer`, obsolete mobile backdrops, and abandoned collection controls.
Verify dynamic class construction and alternate-entry consumers before deletion.
Isolate History-only styling with the retained unrouted component if still
needed; do not delete historical studies or unrelated components as part of this
cleanup.

Replace equivalent `surface`/`ink`/`line` aliases with canonical semantic tokens
and centralize shared metrics. Consolidate genuine global defaults into the base
layer. Choose explicit component-layer placement for custom rules intended to
yield to utilities, with before/after checks of affected properties. Do not
mechanically remove accessibility-related `!important` rules or reorder layers.

Update `apps/web/README.md`, `docs/design/ui-foundation.md`, and root/web agent
instructions to state permitted globals, module-owned application styling, and
component-owned control appearance. The current instruction to keep app layout
in global CSS must be clarified when the new ownership policy is adopted.

### 6. Validate the integrated result

Run focused coverage after each slice and the full browser suite on the final
integrated state. Use before/after screenshot comparison as well as geometry and
interaction assertions. Existing tests capture some screenshots but contain no
pixel-baseline assertions; passing those tests alone is not visual parity.

From the repository root, the existing commands are:

```sh
pnpm check
pnpm --filter @media-tracker/web build
pnpm --filter @media-tracker/web build:production
pnpm test:e2e
```

Select relevant files per slice from `header-padding.spec.ts`,
`visual-consistency.spec.ts`, `shadcn-interactions.spec.ts`,
`inspector-motion.spec.ts`, `collection-loading.spec.ts`,
`infinite-scroll.spec.ts`, `library-cache.spec.ts`, and `scaffold.spec.ts` under
`tests/e2e`. For example:

```sh
pnpm test:e2e tests/e2e/header-padding.spec.ts tests/e2e/inspector-motion.spec.ts
```

Playwright starts `pnpm dev`, checks proxied API health, and may reuse existing
servers. Coordinate runtime ownership before testing; preserve concurrent work.
No database migration is part of this scope.

## Completion criteria

- Production global CSS contains intentional global concerns rather than
  feature selectors and successive polish patches.
- Substantial custom styling has a clear component, shared Library, or feature
  owner. Standard control appearance belongs to real shadcn compositions.
- Styling classes no longer drive application focus or scroll behavior, and
  tests use stable identities while preserving their assertions.
- All 17 production routes retain current behavior and appearance, with real
  light/dark desktop and narrow-width inspection of changed surfaces.
- Final checks and both web build modes pass; historical entries remain
  buildable and production packaging retains its asset restrictions.
- Documentation matches the adopted styling contract. Each implementation slice
  is reviewable and excludes unrelated work, including `apps/ios`.

There is no line-count target. Success means clear ownership and preserved UI,
not replacing every CSS declaration with a utility class.

## Implementation record

Implemented on `codex/styling-cleanup`, based on `90c2b97`, in a separate managed
worktree, then rebased onto `995e7af` to retain the concurrently landed shared
empty-state implementation. Its styling now uses the shared workspace module,
and its tests retain their assertions through `data-ui` hooks. The production
entry stylesheet now contains 91 lines of deliberate
global concerns. Tokens and shared metrics remain in `components.css`; shell,
Library workspace, controls layout, inspectors, common media presentation,
pagination, Connections, and substantial feature styles have plain CSS Module
owners. History-only styling stays with the unrouted History component.

Shared compositions own compact navigation, tabs, toolbar/filter typography, and
Button/Input inheritance. Existing Base UI primitives and their interaction
behavior remain in use. Explicit `data-ui` structural hooks handle geometry and
portal boundaries; accessible names and collection attributes handle behavior.
Registered inspector properties and existing motion timing remain global.

Tests now use those stable hooks while retaining geometry and scroll assertions.
Added loaded Movie inspector and delayed-detail focus coverage, plus compact
control and active-navigation hover checks. Browser stress testing exposed a
pagination focus race: query resolution could precede the render commit. Focus
now moves after new rows commit; the unchanged keyboard fallback test passed 12
repeated runs. Rapid desktop-and-back resizing also exposed a selected-tab
visibility race: the viewport returned to its previous observed width after the
browser clamped its scroll position. CollectionTabList now also responds to window
resize events; the existing assertion passed 16 repeated runs.

Visual verification compared 84 stable captures across six media types, light
and dark themes, and 1280px/390px widths, including collections, open filters,
sort popups, and loaded Books/Movies/Articles inspectors. Computed control
metrics and visual review caught and corrected cascade differences in tab text,
Select placeholders, toolbar typography, and sidebar icon sizing. This is a
structural migration with the existing interface retained.

Validation uses an isolated frontend on port 5175 and synthetic Playwright API
fixtures. It does not migrate databases or change source/provider data.

Final integrated validation:

- `pnpm check`: passed formatting, workspace typechecks, ESLint, and 337 tests
  across 53 files.
- `pnpm --filter @media-tracker/web build`: passed production and historical
  design/specimen/Library review entry builds.
- `pnpm --filter @media-tracker/web build:production`: passed deployment packaging.
- `pnpm test:e2e --config /private/tmp/styling-playwright.config.mts`: all 184 tests
  passed with four workers against port 5175. The temporary configuration uses
  the repository config and disables server startup to preserve concurrent
  services. The test fixtures intercept API traffic.
- The unchanged keyboard pagination fallback passed 12 repeated runs, and the
  unchanged mobile selected-tab visibility assertion passed 16 repeated runs.
- `git diff --check`: passed. Temporary screenshot hooks and evidence specs were
  removed; permanent interaction/geometry coverage remains.

Both builds report Vite's chunk-size warning; bundle splitting is outside this
styling cleanup. The branch retains the newly landed empty-state implementation
and excludes concurrent native iOS changes. The worktree is ready for review;
no merge, push, or deployment is part of this implementation.
