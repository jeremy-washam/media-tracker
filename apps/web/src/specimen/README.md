# Component specimen

Run `pnpm dev:web` and open `/specimen.html`.

This separate Vite entry compares eight published tweakcn themes in light and dark
mode using shadcn's Base UI components. Graphite is the default. Open the theme
picker to search presets and see swatches, or use the previous/next buttons.
Theme and mode are stored in the URL, so reloading or copying a link preserves
that combination. Switching appearance preserves Library and composer state.

## Saved decision — 2026-09-19

The owner selected **Graphite for now**, with the expectation that the theme
will be revisited. Keep this comparison and its alternatives available. Both
light and dark modes remain required. This records a design choice, not a
completed production theme migration.

Reopen Graphite at `/specimen.html?theme=graphite&mode=dark` or
`/specimen.html?theme=graphite&mode=light` after running `pnpm dev:web`.
The [UI foundation](../../../../docs/design/ui-foundation.md#provisional-theme-graphite)
records the choice for future implementation work.

## Theme provenance

`themes/presets.json` contains the original `cssVars` from each theme's public
registry endpoint, fetched on 2026-09-19. Each record retains its source URL,
which is also linked in the preview. Presets are from
[tweakcn](https://github.com/jnsahaj/tweakcn), under the Apache 2.0 license copied
in `themes/LICENSE`. The earlier custom Graphite, Sage, and Ink palettes have
been removed; the current Graphite is tweakcn's published preset.

The published theme tokens remain intact. Typography, spacing, and layout stay
fixed. Application roles now use restrained neutral mixtures instead of filling
navigation and selected media rows with `accent`:

- Row hover: background mixed with 4% foreground in sRGB.
- Selected row: background mixed with 8% foreground; normal text hierarchy.
- Selection edge: background mixed with 55% foreground.
- Selected navigation: sidebar mixed with 6% sidebar foreground.
- Sidebar divider: the theme's regular border, avoiding Mono's white divider.
- Ratings, logo punctuation, and active tab underlines: neutral text colors.
- Strong theme color remains on primary actions, checkboxes, focus, and small
  active-filter indicators.

Backgrounds, cards, popovers, radii, and shadows retain the presets' character.
Cover-art colors are sample content, independent of the theme. Themes are bundled
locally; the preview needs no external fetch.

## Current comparison set

Graphite, Clean Slate, and Mono are the owner's favorites and appear first,
marked “Your pick.” Alternatives are Vercel, Modern Minimal, Claude, Caffeine,
and Amber Minimal. All are offered in light and dark mode.

Mocha Mousse was examined in both modes and removed from this round: its brown
dark surfaces and pink/cream light combination are a poor fit for the requested
restrained direction. The larger 24-preset set has been replaced, not hidden in
a second picker.

All eight retained themes were visually reviewed in both light and dark mode
(16 combinations), including Library navigation and selection, the inspector,
the filled/focused composer, and the control-state examples. The review led to
neutral selections and ratings, a softer Mono sidebar divider, a more visible
Vercel selected row, and removal of color interpolation flashes when switching
themes. This review covers the specimen, not finished Chat or Recaps surfaces.

## Interaction scope

The specimen includes a collapsible Index sidebar, Library filters and date-range
calendar, item selection and history inspector, and a local-only chat composer.
It reuses synthetic items and concept cover artwork from the layout studies;
no personal records or LLM calls are involved. Collection and chat state resets
on reload. The control-state section includes explicitly simulated hover/focus
appearances; other controls use real interactions.

Calendar uses React DayPicker, as in the shadcn registry. Registry components are
owned locally in `ui`, isolated for this theme study. The main app has its own
component registry configuration and CSS. Theme exploration does not change the
operational client. Final production tokens and per-media layouts remain open.
