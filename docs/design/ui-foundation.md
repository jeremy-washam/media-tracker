# Desktop UI Foundation

- Status: Index and all six initial Library slices implemented; further design remains open
- Last updated: 2026-10-30

## Purpose and scope

The next interface has three primary surfaces: **Chat, Library, and Recaps**.
Recaps is a placeholder name; its workspace must accommodate broader analytics
later. Connections and Settings are secondary. This design scope goes beyond
the implemented ingestion milestone; prototypes do not imply working LLM,
Queue, catalog, or analytics services.

Readwise Reader is the primary reference for compact browsing, hierarchy, and
contextual inspection. Letterboxd informs artwork-led browsing and media details.
The existing production scaffold is not approved visual direction.

Desktop is the current focus; both light and dark modes are required. Aim for a calm, dense personal
library with expressive artwork, readable typography, restrained controls, and
clear selection state. Media metadata should serve the user's relationship to
an item. Future Lists, Feed, and Explorations stay out of initial navigation.

This document governs the desktop client. The owner now wants a separate mobile
experience and genuine native iOS controls; the [native iOS plan](../planning/ios-app.md)
owns that research and proposed delivery. Native navigation/detail presentation
may be rethought while preserving accepted media semantics. Lists, Explorations,
and Feed can appear as illustrative native prototype destinations to test future
scale, without changing production desktop navigation or implying working services.
The earlier mobile studies are disposable and are not approved design sources.

## Selected foundation: Index

The owner selected **Index** as the base after reviewing seven structural
approaches. Preserve its global sidebar, central workspace, and optional compact
right-hand inspector. This selects an overall structure, not every prototype
component, spacing value, artwork treatment, or typography choice.

The product name is **Imladris**. It replaces the earlier “Media Tracker”
working name and the exploratory “Margin” mock label. Use Imladris consistently
in production UI, metadata, and maintained design artifacts.

Make the left sidebar collapsible across all three surfaces. Collapsing it
reclaims width without changing the navigation model, current media type,
Archive/Queue state, filters, sorting, selection, or scroll position. Keep an
obvious way to reopen it. The production desktop implementation keeps an icon
rail and persists collapse across browser sessions. Narrow-screen navigation
uses the installed shadcn Sheet with modal focus and return behavior.

Top navigation was an alternative shell, not a component to embed inside Index.
Its width advantage alone is not a reason to adopt it: a collapsible Index
sidebar provides the desired space. Do not add horizontal global navigation or
workspace tabs merely because another study includes them.

Each surface can have its own composition and local controls within the shared
shell. A consistent app does not require Library, Chat, and Recaps to use the
same arrangement of content.

The inspector must preserve collection filters, position, and conversation
context. Start with **one compact inspector containing full details**. Do not
pre-build a second detail level or a separate full-page item view. Evaluate the
fit during detailed design. Interactive visualizations can expand within the
main workspace; that does not imply a second media-inspection level.

For paginated Library collections, opening or closing the inspector and changing
between grid and list are presentation changes: they preserve every loaded page
and do not restart the collection query.

All collection pages use shared automatic cursor loading near the bottom of
their contained scroll viewport. Shared pagination shows next-page Spinner/
status, a retry Alert on failure, completion status, and a keyboard Load more
fallback. Facet options and inspector History retain explicit pagination.
Same-session cached navigation and presentation changes preserve a visible-item
scroll anchor. Long-list virtualization remains separate follow-up work.

All 16 Library collections load subsequent cursor pages automatically as the
bottom approaches the collection pane's viewport. A shared observer preloads
within 400px, serializes requests, and continues filling a short pane. Initial
loading retains Skeleton; subsequent pages use a compact shadcn Spinner and
muted status text. Exhausted nonempty collections show their actual loaded count.
Next-page errors leave loaded results visible and show an inline Alert with a
Button that retries that cursor. Automatic loading pauses after a next-page
error or while the query is fetching/paused. A manual loading Button becomes
visible on keyboard focus, or remains visible when observers are unavailable.
Keyboard activation moves focus to the first newly loaded result on success.
Reduced motion disables spinner rotation.

The collection remembers a visible item's identity and its offset. Layout and
inspector-width changes retain that anchor; Back/Forward and revisiting a cached
collection restore the same-session position and loaded pages. New search,
filter, and sort navigation starts at the top. This bounded in-memory position
cache does not persist across reloads; the existing browser cache still stores
only initial pages. Inspector history, facet options, and Connections retain
their explicit pagination controls. Virtualization remains a measured follow-up.

## Approved typography: Balanced (October 29, 2026)

This section is the production web client's typography reference. The owner
selected the original **Balanced** study: a small, reusable set of text roles
with readable supporting copy and restrained emphasis. It supersedes older
values in polish records and historical studies. The [saved comparison](typography-study/README.md)
retains the alternatives and the rejected smaller-inspector follow-up.

### Font family

Use the platform system sans-serif for interface text, media titles, inspectors,
and the Imladris wordmark. The exact stack in `apps/web/src/styles.css` is:

```css
font-family:
  ui-sans-serif,
  system-ui,
  -apple-system,
  BlinkMacSystemFont,
  'Segoe UI',
  sans-serif;
```

This keeps the interface familiar on each platform and lets media artwork carry
its visual character. The installed system font can differ by operating system;
there is no separately downloaded interface or brand font. Serif, decorative,
and custom wordmark fonts in saved explorations are historical references.
Keep `font-synthesis: none` and let controls inherit the same family.

### Sizes, weights, and roles

Use four sizes: **12, 14, 16, and 22px**. Use three weights: **400 regular,
500 medium, and 600 semibold**.

| Role                                                           | Size | Weight                     |
| -------------------------------------------------------------- | ---- | -------------------------- |
| Supporting metadata, counts, summaries, grid subtitles         | 12px | 400                        |
| Navigation and breadcrumb                                      | 14px | 400; selected identity 500 |
| Controls, collection/inspector tabs, section headings          | 14px | 500                        |
| Inspector overview, labels, values, descriptions, source links | 14px | 400                        |
| Grid item titles                                               | 14px | 600                        |
| List item titles                                               | 16px | 600                        |
| List item subtitles                                            | 14px | 400                        |
| Inspector item title and expanded wordmark                     | 22px | 500                        |

Overview prose and inspector label/value rows must match at **14px / 400**.
The owner rejected the follow-up that reduced them to 12px. Section headings use
sentence case and ordinary letter spacing. Counts remain normal-weight and
muted; tiny uppercase labels are not a separate typography role.

### Implementation tokens

`apps/web/src/components.css` owns the shared role tokens:

| Token                   | Value |
| ----------------------- | ----- |
| `--app-text-caption`    | 12px  |
| `--app-text-body`       | 14px  |
| `--app-text-title`      | 16px  |
| `--app-text-display`    | 22px  |
| `--app-weight-normal`   | 400   |
| `--app-weight-medium`   | 500   |
| `--app-weight-semibold` | 600   |
| `--app-leading-body`    | 1.45  |

Tailwind `text-xs`, `text-sm`, and `text-base` map to the caption, body, and title
sizes. Body text defaults to 14px / 400 with 1.45 line height; the text utilities
share that leading. Existing title compositions can use tighter leading, such
as 1.3 for list titles and 1.25 for inspector titles.

The `--library-row-title-size`, `--library-row-subtitle-size`, and
`--library-row-metadata-size` aliases map to 16, 14, and 12px respectively.
CSS Modules apply the roles to custom content; shared shadcn/Base UI
compositions and variants own control typography. Reuse those owners when
adding a surface so equivalent elements keep the same role across media types.

`apps/web/src/styles.css` explicitly sets `small` to the 12px caption role and
`strong`/`b` to 600. Nested elements must not compound relative sizes or introduce
an extra 700 bold weight. Semantic heading elements still need the appropriate
shared role rather than an unrelated browser-default size.

Narrow editable inputs retain the installed primitive's **16px** accommodation
and return to **14px on desktop**. This is an intentional responsive use of the
existing scale. Preserve the real controls, keyboard/focus behavior, artwork
sizes, 101px row baseline, contained scrolling, and source semantics when
applying typography.

## Control consistency audit (October 29, 2026)

The owner approved fixing control inconsistencies without another mock round.
The audit covered all 16 Library sections and Connections, including filter
Sheets, sort popups, applied filters, inspector actions, and navigation. Standard
Library controls share a 32px height and the installed rounded-lg outer corners
(currently 5.6px); compact Connections actions retain the installed 28px size and
smaller radius. Inline clear actions, checkboxes, tabs, artwork, and media rows
retain their purposeful shapes rather than inheriting action-button geometry.

The joined List/Grid control had square outer corners and a double middle border
because its generated selectors expected data-horizontal/data-vertical while
Base UI exposes data-orientation. Use explicit orientation selectors, forward
orientation to the actual primitive, retain square internal corners, and draw
one shared divider. Its icon items are 32px square. The same selector correction
restores the 48px-wide, 1px completion separators that previously had zero size.

Neutral buttons, Select triggers, and toggles share surface-hover and selection
tokens. Dark-mode resting backgrounds must not override hover rules. Hover must not replace a selected segment's background; an open Select
uses the selection background. All six media types use LibrarySortDirection for
the same arrow, action label, and keyboard-accessible tooltip. Its description
names the next action (Sort ascending/Sort descending), and relevance sorting
retains its disabled direction action. Coverage notes start 12px below the
collection header; an obsolete negative margin must not clip their first line.

## October 2026 iterative polish

The [UI polish checklist](../planning/ui-polish.md) supersedes earlier surface
presentation details where they conflict. Use the platform system font throughout
production UI. Base defaults give buttons, native selects, and Button-composed
links the default cursor. Shared navigation and tab compositions set their own
default cursor. Ordinary links use a pointer. Text inputs retain their text
cursor; disabled and busy controls retain their specific cursors.
The current Letterboxd reference
applies only to small, muted rating stars across Book and Movie lists, grids,
and inspectors, including fractional stars; it does not prescribe poster
density, colors, or metadata.

Collection section tabs live on the right of the compact workspace header; the
oversized Library/page heading is removed from the collection body. The breadcrumb
and all collection/inspector tabs use 14px type. Shared FlatTabs compose the actual
shadcn Tabs line variant, including keyboard navigation and associated panels.
Route tabs retain URL-backed search normalization and stable cached counts. The
header reserves the inspector width while it opens and closes. Header and collection use one horizontal inset token (the collection's existing responsive padding), including the same reserved scrollbar gutter, so the breadcrumb/tab row aligns with the toolbar and list edges.

Collections default to list. A single local preference remembers grid/list across
supported pages and browser sessions; explicit layout in a URL takes precedence.
List appears first in the view controls.
Section tabs retain known library totals while the next collection request loads,
without retaining the previous section's results. Count labels use their natural
width beside the section label, with a smaller gap than the space between tabs.
They use normal weight (400), muted text color, and fresh response totals when available.
Only Following supports grid within Podcasts, and only Albums/Artists within
Music. Articles have one expanded row style with no ARTICLE/PDF type label.
Books list columns are title/author, Publish Year, Read Date (Added Date in Queue),
and personal Rating; formats do not appear in those rows. Books has no separate
column-heading row, matching the other Library collections.
All Library media lists, including Video and Channel lists, share a 101px row baseline,
matching the taller Article/Podcast/Music presentation. Shared list typography
uses 16px titles, 14px subtitles, and 12px metadata. Additional search excerpts or metadata can expand
a row to preserve that context. List artwork uses 60×90px Book/Movie covers,
80px square Article/Podcast/Music artwork and channel avatars, and 160×90px Video
thumbnails. Grid cards retain their independent sizing.
Collections omit an extra list border above the first item.
Leave 16px below the fixed collection header before results begin. Artwork cards
grow with their content, and Movie titles reserve two complete lines so neither
titles nor metadata are clipped by a fixed card height.
Collection list rows are transparent at rest and share the same separators,
horizontal spacing, muted hover background, and selection treatment.

Search updates after a short typing pause and has an explicit clear control.
As of October 12, production sorting and single-choice filters use the actual
shadcn/ui Select with Base UI. The shared LibrarySelect composes the installed
Select primitives; native select elements and bespoke dropdown implementations
are not the production component foundation. Menus open below the trigger with
start alignment and keep shadcn icon, border, and focus styling. Popups fit their
option labels within the available viewport width; very long labels wrap. Filter design
remains under review. Filters and Sort use the same toolbar font
size on every Library page. Search, Filters, Select, sort-direction actions, and
List/Grid controls use actual shadcn Input Group, Button, Select, and Toggle Group
components at their default 32px height; obsolete custom toolbar sizing is removed.
The collection toolbar, result summary, and removable applied-filter groups stay
above an independently scrolling results viewport in all 16 sections. A subtle
shadow beneath the controls separates the persistent header from moving results.
Filters open in the installed Sheet, retain source-specific predicates, trap
modal focus, and return focus to the Filters trigger on dismissal. Applied-filter
chips clear complete predicate groups, including dependent date/rating bounds;
Clear all filters preserves text search and presentation preferences.
The shared ghost Badge variant has no hover background or hover color change,
including passive local API status.

Toolbar wrapping follows the collection pane width, including the space occupied
by an inspector. At narrow pane widths, search occupies a full row and the other
controls wrap without clipping. Clicking a selected result deselects it and closes
its inspector. Book/Movie cards
share fixed artwork dimensions; inspector opening changes column count, never
card dimensions. The application contains scrolling within collections and
inspectors. The inspector fills the viewport height. Its entrance/exit and the
collection width share one 180 ms easing timeline, including immediate collection
expansion when closing begins, with reduced-motion support. New styling issues may
be resolved iteratively without waiting for a comprehensive redesign.
Workspace and inspector headers share one height so their horizontal dividers align.
The desktop sidebar brand row uses that same height, centering the logo, wordmark,
and collapse control with the workspace header in expanded and collapsed layouts.
Neutral buttons and sidebar navigation share a visible hover background that is
less emphasized than selection in both appearance modes, including the sidebar toggle.
Selected controls retain their selection background while hovered.
Sidebar footer rows share a 38px height. In the collapsed rail, the Connections
icon, appearance icon, and health dot share the same horizontal center; hidden
health text must not leave an extra flex gap.

All 16 Library sections use `CollectionEmptyState` for empty collections. It owns
the shared icon, heading, description, and shadcn outline action. Pages supply
source-specific copy and existing filter-reset callbacks; empty collections link
to Connections through Button's Base UI `render` API. Do not style ordinary links
as buttons in collection CSS.

Connections uses the workspace header as its page title, with no repeated body
heading or Source coverage eyebrow. Source rows show bundled official app marks,
14px names, labeled green/red connection icons, and compact sync/coverage metadata.
Degraded status stays amber and reauthorization stays red. Actions use shadcn's
small Button variant, while the account form pairs default 32px Input/Button
controls; coverage explanations and attempt/export dates live in
Collapsible details. Spotify uses one source row and one set of Sync/Import
actions for the API's first connection target. Additional saved Spotify records
retain their status, dates, coverage, import progress, and account-specific
Resume action within Details; a visible summary flags unfinished imports there.
Presentation grouping never deletes or merges source evidence. YouTube account
lineages retain separate rows. Primary incomplete-import progress and Resume remain visible. The
new YouTube account form sits below the sources; existing lineage imports keep
their connection IDs. Page-owned layout is isolated in its CSS Module and wraps
both copy and actions at narrow widths. Base native-control defaults live in the
base layer so they do not override installed component typography.

## Visual and writing principles

The owner approved the twelve findings in the [October 12 visual audit](../planning/visual-ui-audit.md).
Inspectors share a 54px topbar, with independently scrolling content below it.
Use 22px/500 item titles, 14px/500 section headings, and 14px body/facts text,
with 12px supporting metadata and dates. Tabs stretch only within a bounded header; a generic tablist cannot inherit
the full inspector height. Check loaded content geometry, not only tab semantics.

Book rows share one responsive column definition at the pane width, hiding less
important metadata at narrow sizes while keeping the title and personal rating.
Movie row breakpoints also follow the named Library collection container, rather
than the browser viewport: an open inspector can leave a narrow results pane on
a wide screen. Reduce secondary columns before their minimum widths overflow,
and verify row content bounds with inspectors both open and closed in each theme.
Common toolbar order is Search, optional source/show, Filters, Sort, Direction,
and optional List/Grid. Reveal the selected section tab on narrow headers without
moving keyboard focus. Format counts consistently with collection summaries.

Music Album/Artist grids wrap identity text and use concise observations/time
summaries; complete metadata stays in lists and inspectors. Article technical
Reader relationships/IDs use the installed shadcn Collapsible, with one default
original/Reader action and distinct relationship links retained inside it.

Use Readwise Reader for polish, density, hierarchy, and contextual browsing, and
Letterboxd for media-forward collections and rich item information. Avoid Ryot's
competing card toolbars, badges, weak hierarchy, and administrative presentation
of consumption history. Imported timestamps and provenance remain available,
but should not compete with when the user experienced an item.

Visual quality is an explicit criterion, alongside usability. Favor restrained
dark surfaces, readable typography, deliberate spacing, and artwork as the main
source of color. Dense collections must remain legible. Avoid adding a control,
heading, or badge merely because the data exists.

Use direct labels and factual copy. No motivational slogans, decorative
subheadings, or sentimental commentary about the user's history. Specifically
rejected examples include “Your Personal World,” “September, in good company,”
and “A little distance. A different perspective.” A recap can simply be titled
“September 2026.” This preference applies throughout the app, not only Recaps.

## Library

Organize first by media type, then by Archive or Queue. Priority order:
Books, Movies, Articles, Podcasts, Songs, YouTube videos. This is the owner's
rough priority order, not a commitment to identical behavior across types.

Queue membership is source-specific: Movies use the Letterboxd watchlist;
Articles use Readwise Inbox, Later, and Shortlist; Books use active Hardcover
Want to Read and Currently Reading statuses independently of retained reads;
Podcasts use Spotify library episodes without playback activity; Videos use
YouTube Watch Later.
Songs have no Queue. Songs also need a distinct presentation for their much
larger collection and listening history. The
[Library implementation handoff](../planning/library-implementation.md) folds
these rules, evidence ambiguities, and song-counting decisions into its first
per-media specification step.

The initial Library is for browsing and viewing imported details. Adding items,
editing ratings/status, and other writes are future work. Leave room for those
capabilities without displaying disabled or speculative editing controls. Reading, watching,
and listening in the app are not in scope and may never be.

Use shared search, filtering, sorting, and selection patterns while allowing
media-specific layouts. Books and Movies favor covers/posters; Articles can
use image thumbnails alongside compact text rows, without AI summary subtext.
Podcasts and Songs need their own metadata/density treatment. Detailed decisions
are recorded in the owner-approved
[Library surface specification](../planning/library-phase-2-surfaces.md) and its
per-media contracts. Books use sparse grid and Readwise-style list modes;
Articles use a single expanded row presentation without type badges; Podcasts include Following;
Music includes Tracks, Albums, and Artists; Videos include a Channels activity
rollup without a subscription/Following surface. Books and Songs in particular use
substantially different experiences.
Letterboxd and Hardcover supply personal ratings; do not assume every source
supports them. Ratings appear only when available and must distinguish personal
from community ratings. Missing artwork and unknown dates need deliberate
presentation.

Show each item once, with all supported consumption occurrences inside its
inspector. For Books, collection filters, display, and sorting use the latest
supported read occurrence only; older reads remain in History and do not satisfy
collection predicates. Other media types must follow their accepted
media-specific surface contract. Collection summaries show item counts only;
consumption totals remain inside inspectors. Movie results show stars without a Viewing qualifier, while the
inspector retains current-film and viewing-rating source context. Never substitute
ingestion or source-recorded dates for unknown consumption dates.

The inspector includes available metadata, source links, ratings, notes,
highlights, and history. Source provenance can be disclosed there without
competing with primary content. Library query/view state should eventually be
URL-addressable and remembered.

## Chat

### Agreed first-release interaction plan (October 30, 2026)

The owner supplied ChatGPT website references and approved the interaction scope
below. Three visual mockups are requested for review before production UI work;
no visual variant has been selected. The [review study](chat-ui-review.md) owns
reopening instructions; the [backend/UI contract](../planning/chat-ui-contract.md)
owns persistence, events and acceptance details.

- Keep Imladris branding, existing global navigation and the shared Index shell.
  Place chat navigation **below the existing application navigation in the same
  sidebar**, never in a second column beside it. The chat section starts with
  **New Chat**, followed by **Favorites** and **Chats**.
  Both section headings have a chevron to expand/collapse; remember their states.
- Favorites have **no product limit**. Favorited chats appear only in Favorites,
  without a second row in Chats. Keep every favorite reachable when the list is
  long. Default ordering is most recently active first.
- Rows show a star and a more button on hover or keyboard focus. The more menu
  contains only **Rename**, **Favorite/Unfavorite**, and **Delete**. Use the actual
  installed interaction primitives and accessible touch/keyboard affordances.
- Generate an initial title automatically and allow renaming. Opening New Chat
  shows an empty draft; it does not need to create an empty saved chat immediately.
- Use a classic expanding multiline composer with **Send** as its only action.
  During generation the same control becomes **Stop**. Future custom actions
  may sit on the left; omit attachment, voice, model and custom-action controls
  from the first version.
- Place the composer centrally in the empty landing state and at the bottom of
  an active conversation. Use ordinary user/assistant conversation presentation.
  Omit promotional empty-state slogans, subtitles and persistent keyboard hints.
  The owner requested rotating Tolkien quotes with a reviewable candidate list;
  reproduce only authorized text and distinguish unquoted candidates from the
  actual enabled display set.
  Omit per-message actions, including copy, branching, regenerate, rating,
  sharing and overflow menus, in this release.
- Show **Thinking** with a provider-supplied summary preview when supported and
  available. Summary text may arrive intermittently; a loading state must work
  without it. Do not expose hidden reasoning or invent progress descriptions.
- Show actual web/Library tool activity and an expandable **N tool calls** summary.
  Distinguish running, successful, failed and cancelled calls. Preserve readable
  activity and partial responses after Stop or interruption.
- Media references open the shared compact inspector. Keep exact Library evidence
  and web citations distinct. No permanent secondary Library pane is required.

Reasoning previews in the study are explicitly simulated. API support is model-
and access-mode-specific; the mock does not prove live model availability or
identical ChatGPT internal behavior. The first provider remains OpenAI behind
portable message, activity and tool contracts.

### Later outputs and discovery

Saved individual outputs as named artifacts with previews and links back to the
originating conversation remain a longer-term direction. A favorited/renamed
conversation is the first-release way to save and revisit a result. Inline
visualizations and generated lists can be explored later; their appearance in an
older study does not add a first-release message action or artifact builder.

Responses can reference media through clickable cards opening the shared
inspector. This should eventually include catalog items outside the Library,
without adding them to Library merely by inspection. Catalog integration and
identity resolution are needed for reliable external references. The separate
[catalog reconnaissance](../sources/catalogs.md) covers options across all six
media types; provider recommendations are research, not shipped integration.

## Recaps

The required experiences are a monthly rollup, with navigation between months
and a summary of all consumed media, and a yearly rollup inspired by Spotify
Wrapped across all media. “Recaps” is a placeholder name, not a restriction on
future analytics. A shared
period-based workspace can serve both; the yearly view should have a more
editorial presentation inspired by Wrapped, without requiring a linear slideshow. They do not need separate standalone
implementations; a shared visualization/report system is acceptable. The final
mechanism remains open.

Show consumed items, media-specific counts, and interactive visualizations
that reveal supporting items. Keep unlike units distinct. Shared visualization
components should serve Recaps and Chat artifacts. A general-purpose builder is
not necessary for the initial design. Broader analytics controls can grow inside
this surface without changing the global shell.

## Future surfaces and unresolved choices

Future possibilities, excluded from the initial navigation:

- **Lists:** arbitrary collections of media items.
- **Feed:** ambient recommendations and other content related to past consumption.
- **Explorations:** broad topics to learn about; may live within Chat rather than
  becoming a separate destination. This relates to the exploratory Topics model.

Ideas suggested during critique, but **not adopted as requirements**:

- A Library reference pane beside Chat, borrowed from Research.
- Journal-style chronology inside Recaps.
- A document-like presentation for saved artifacts.

These can inform later iterations within Index. The owner has approved Index
and sidebar collapse, not this entire combination of suggestions. Other open
questions include Chat's default landing state and precise exploration scope,
artifact persistence/refinement behavior, detailed Recaps composition, final
visual tokens, and the per-media-type data and interaction specification.

## Design and implementation process

Explore layouts in browser-viewable HTML/CSS/React with representative content
before integrating the full interface. Compare the same content across designs;
changing only color and typography is a theme comparison, not a structural
alternative. The seven studies were created for element-level feedback.

With Index selected, refine its shell and individual surfaces using realistic
artwork, larger collections, long titles, missing images, absent ratings,
unknown consumption dates, repeat consumption, and notes/highlights. Check both
expanded and collapsed navigation and open/closed inspector states. Detailed
media behavior must refer to the relevant source reports, not generic mock data.
Extract reusable visual rules from the refined screens rather than treating the
first scaffold or sample covers as approved production design.

## Component foundation

Use **shadcn/ui with Base UI** for new production interface components. Shared
source lives in `apps/web/src/components/ui`; `base-nova` with neutral semantic
CSS variables is the provisional initialization, not an approved final theme.
The separate theme specimen can explore alternatives without coupling production
components to its files. See the [web README](../../apps/web/README.md#shared-components)
for imports, adding components, and theme integration. The initial setup supplies
Button, Input, Textarea, Select, Input Group, Toggle/Toggle Group, Tabs, Checkbox, Tooltip, Sheet, Alert, Badge, Skeleton, and Field; add other primitives when features need them.
Use the installed shadcn component for matching controls rather than copying its
appearance into raw HTML or building directly against Base UI. Completed migrations and validation
are recorded in the [production component audit](../planning/shadcn-ui-audit.md).

Production styling ownership is recorded in [ADR 0019](../decisions/0019-web-styling-ownership.md).
Keep shared theme/metric tokens and document defaults global, use plain CSS
Modules for substantial application styling, and use Tailwind for small
arrangements and component variants. FlatTabs, LibraryToolbar, LibraryFilterPanel,
LibrarySelect, and navigation compositions own approved compact controls.
Keep shared collection/inspector geometry and media presentation in shared modules;
feature modules own their specialized content. Preserve explicit structural hooks
and accessible identities rather than relying on generated styling classes.

## Production icons

Production desktop icons use Phosphor Regular through
`apps/web/src/components/icons.ts`, including glyphs inside installed shadcn/Base
UI controls. The selected media identities are BookOpen, FilmReel, Article,
Microphone, MusicNotes, and YoutubeLogo. Use the same identity in navigation,
empty states, and missing media artwork. Source-service marks retain their
official colors and shapes; Imladris branding remains separate.

All six Library filter actions use Funnel. Sort controls keep their labeled
Select and ascending/descending action without an extra sort-label glyph.
Music artwork fallbacks use MusicNotes for tracks, Disc for albums, and User for
artists in both collections and inspectors. YouTube channel avatars use User.
Personal-rating stars and liked hearts use Phosphor's filled weight to preserve
their state treatment; fractional ratings retain the existing clipping overlay.
Keep role-specific icon sizes, accessible action labels, popup behavior, and
loading announcements. The native iOS client retains its SF Symbols.

## Brand identity: compact J2 symbol

On 2026-10-12, the owner selected **J2**, the house-and-waterfall concept, as
the working logo. The owner prefers the **compact** treatment. Retain
**J2, J3, J7, G1, and G8** as the preferred shortlist;
later explorations do not replace those preferences. The owner subsequently
approved **Cormorant Garamond 600**, candidate A in the wordmark review, and
requested implementation in the web client.

The [J2 vector review](logo-exploration/j2-vector/preview.html) compares a
faithful SVG with the refined compact variant at 16–64 px, in light/dark contexts and
sidebar previews. Both use transparent backgrounds and `currentColor`; fixed
dark/light ink exports, a system-appearance-aware SVG favicon, and PNG exports
are also saved beside the review. Preserve the selected house, sweeping roof,
arched openings, and waterfall. The initial vector review's system-font name
treatment is historical; the later wordmark review owns the chosen lettering.
The refined compact SVG
removes the remaining rock cut and smooths the roof, cliffs, and single pool.
The first compact export remains saved as history.

The [wordmark review](logo-exploration/wordmark-review/preview.html) compares
Cormorant Garamond, Instrument Serif, Fraunces, Alegreya, Cinzel, and Manrope
beside the refined compact mark, including small sidebar samples and light/dark
appearance. Font files and original licenses are bundled locally for an offline
comparison. Candidate A was initially selected, then superseded by candidate H
from the next reference set. The owner subsequently removed the wordmark, then
approved the medium-weight system-font treatment from the Library heading mockup. The web
client now pairs its 30 px compact symbol with a 22 px, weight-500 system-font
Imladris wordmark in the expanded sidebar, following the active foreground color.
The brand link retains its accessible Imladris name. No custom brand font is
bundled or loaded. The HTML includes
an SVG favicon with system light/dark ink, plus PNG and touch-icon exports.
Source imports include these assets in both normal and deployment-mode Vite
builds. Production interface typography remains the platform system font. Historical studies and
comparison artifacts remain available.

The owner then reopened the wordmark choice after comparing the app against a
more handwritten, Tolkien-like lettering reference. The
[second wordmark reference set](logo-exploration/reference-wordmark-review/preview.html)
compares Almendra, Fondamento, Metamorphous, IM Fell English, MedievalSharp,
and Uncial Antiqua (G–L) with that screenshot and the current Cormorant baseline.
The owner requested these references before another change, then selected
**H — Fondamento 400**. Its calligraphic strokes and angled terminals fit the
provided lettering reference. After checking the wordmark in the app, the owner
chose to remove it entirely and retain only the symbol. The later Library heading
review restored the system-font wordmark described above; that is the current
production treatment. Both custom-font rounds remain saved as historical references.

## Provisional theme: Graphite

On 2026-09-19, the owner selected **tweakcn's Graphite** as the working theme,
with both light and dark modes. This is intentionally revisitable. Use the
restrained application in the saved specimen: neutral navigation and item
selections, neutral ratings, and stronger accents limited to small controls,
focus states, and actions. Avoid large saturated selection backgrounds.

The choice refers to the published tweakcn preset, not the earlier custom
palette with the same name. Its semantic tokens now drive the production shell
and Books surfaces in light and dark modes, while the choice remains revisitable.

Keep the eight-theme comparison available at
`/specimen.html?theme=graphite&mode=dark` (or `mode=light`). Its source, bundled
theme tokens, provenance, application rules, and visual review are preserved in
the [component specimen](../../apps/web/src/specimen/README.md). Graphite, Clean
Slate, and Mono were the owner's favorites. The other retained alternatives are
Vercel, Modern Minimal, Claude, Caffeine, and Amber Minimal. All 16 light/dark
combinations were visually inspected in the Library, inspector, composer, and
control-state examples. Retain these alternatives for future comparison.

## Interactive design studies

The [saved mockups reference](mockups.md) lists the durable source files and
links for all seven layouts. Run `pnpm dev:web` and open `/design.html`. The top switch preserves the current
surface and selection when comparing seven structural directions:

- **Index:** the selected base; the study remains static, while its accepted
  sidebar collapse is implemented in production.
- **Top nav:** global horizontal navigation; media tabs span the Library; Chat and Recaps own local sidebars.
- **Two-pane:** compact selection list and persistent details; conversation and period lists select content in the main pane.
- **Journal:** date-grouped Library rows, timeline recaps, and chronological conversations.
- **Gallery:** compact global rail, horizontal media shelves, and an overlay inspector; recaps prioritize artwork.
- **Research:** closable workspace tabs preserve each surface's state; a reference pane allows Library browsing beside Chat or Recaps.
- **Documents:** a page tree, document title/properties, flowing content, and a section outline.

The former Folio and Gallery theme variations were removed. Gallery above is a
new shelf layout. Keep the palette similar during this round to compare structure.

All seven include Chat, Library and monthly/yearly Recaps. The working prototype
supports media/category navigation, Archive/Queue, search, date filtering, sort,
list/grid, one inspector, sample conversations, artifacts, expandable charts,
and chart interaction. State is ephemeral. Chat replies, rollup numbers, media
history and artwork are explicitly illustrative, not the owner's actual data.
Concept cover designs are composed in CSS; web fonts load from Google Fonts with
local fallbacks. The studies use the accepted Imladris product name.

The preview has a separate Vite HTML entry and does not replace the operational
application. Index is selected and its shell, sidebar collapse, Graphite tokens,
and Books-specific interface are now integrated in production. Keep the other
studies available as references unless the owner requests their removal.

## Enforced shadcn implementation contract (2026-10-12)

Use the installed **shadcn/ui Base UI components** in `apps/web/src/components/ui/` for controls and standard interaction patterns. Read `docs/design/ui-foundation.md` and `apps/web/README.md` before UI edits. A native control plus CSS that resembles shadcn is not an acceptable substitute.

- Use Button, Input/Input Group, Checkbox with FieldLabel, Select, ToggleGroup, Tabs, Tooltip, Sheet, Alert, Badge, and Skeleton as appropriate. Install missing primitives with the configured shadcn CLI; preserve existing components, use the local cn helper, and do not add a second primitive library.
- Compose the real primitives. Keep their focus, keyboard, ARIA, disabled, and popup behavior. Do not replace an entire TabsContent with a single changing panel; each trigger needs its own associated panel. Keep lazy data loading and source semantics intact.
- Component variants and shared compositions own appearance. Keep global CSS for theme tokens, document defaults, accessibility defaults, and registered custom properties. Use plain CSS Modules for substantial app layouts, media content, and sizing constraints, and Tailwind utilities for straightforward composition; remove old native-control appearance rules when migrating. Do not force custom borders, backgrounds, focus outlines, padding, or chevrons over the installed primitive.
- Application media rows/cards and inspector click-away surfaces are intentional custom interactions. Their native buttons are centralized in library-controls.tsx. Ordinary actions cannot use those exceptions. Semantic headings, fieldsets, labels, and route links remain appropriate HTML. Historical design studies are references, not production component sources.
- Verify real light/dark UI at desktop and narrow widths, with filters, popups, and inspectors open. Measure adjacent control heights and popup/toolbar bounds, test keyboard navigation and label activation, and verify modal focus/return behavior. Passing typecheck is not visual QA.
- Run pnpm check, the frontend build, and relevant Playwright coverage after final edits. Production route code has ESLint restrictions against raw controls, handcrafted tab roles, and browser title hints; do not disable those rules to ship a replacement.
