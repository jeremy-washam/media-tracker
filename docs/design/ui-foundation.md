# Desktop UI Foundation

- Status: Index selected as the base; detailed surface design remains open
- Last updated: 2026-09-20

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
obvious way to reopen it. Whether collapse leaves an icon rail or hides the
sidebar completely, and whether that state persists across sessions, remain
implementation/design details to settle.

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

## Visual and writing principles

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
Books, Movies, Articles, Podcasts, YouTube videos, Songs. This is the owner's
rough priority order, not a commitment to identical behavior across types.

Queue membership is source-specific: Movies use the Letterboxd watchlist;
Articles use Readwise Inbox, Later, and Shortlist; Books use Hardcover Want to
Read and Currently Reading until a supported completed read exists;
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
Articles use restrained and expanded row densities; Podcasts include Following;
Music includes Tracks, Albums, and Artists; Videos include a Channels activity
rollup with an optional Following filter. Books and Songs in particular use
substantially different experiences.
Letterboxd and Hardcover supply personal ratings; do not assume every source
supports them. Ratings appear only when available and must distinguish personal
from community ratings. Missing artwork and unknown dates need deliberate
presentation.

Show each item once, with all supported consumption occurrences inside its
inspector. For Books, collection filters, display, and sorting use the latest
supported read occurrence only; older reads remain in History and do not satisfy
collection predicates. Other media types must follow their accepted
media-specific surface contract. Where useful, distinguish unique-item and
occurrence counts. Never substitute ingestion or source-recorded dates for
unknown consumption dates.

The inspector includes available metadata, source links, ratings, notes,
highlights, and history. Source provenance can be disclosed there without
competing with primary content. Library query/view state should eventually be
URL-addressable and remembered.

## Chat

Support new conversations, ordinary AI chat interaction affordances, and chat
history. Save individual outputs as named artifacts with previews and a link
back to the originating conversation. A bookmarked/renamed conversation is an
acceptable fallback MVP, but separate saved outputs are the design direction.

Artifacts may include interactive visualizations or generated lists. For example, “the 10 best LA movies” can be saved as a generated list artifact.
A future Lists surface would add deliberate collection management; it is not
required now. Linking Artifacts to Lists is a possible later relationship, not
initial scope. Visualizations work inline and can expand for more room.

Responses can reference media through clickable cards opening the shared
inspector. This should eventually include catalog items outside the Library,
without adding them to Library merely by inspection. Catalog integration and identity resolution are needed to support reliable
references beyond imported items. The separate [catalog reconnaissance](../sources/catalogs.md)
covers options across all six media types, including TMDB for films. Its provider
recommendations are research, not a decision that any integration is implemented.

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
Button, Input, and Textarea; add other primitives when features need them.

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
