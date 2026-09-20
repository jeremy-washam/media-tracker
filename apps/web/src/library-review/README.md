# Library surface review

Run `pnpm dev:web` and open `/library-review.html`.

This is the saved visual-review artifact for the owner-approved per-media Library
baseline. It uses the selected Index shell and provisional Graphite theme,
supports light and dark appearance, and keeps each media surface isolated from
the production app. Production implementation may tune density after use, but
the written Phase 2 contracts own field, filter, sort, and inspector decisions.

The artifact reads a bounded sample from
`apps/web/public/__private__/library-review-data.json`. That directory is ignored
because repository policy prohibits committing real account exports or
unsanitized fixtures. If the private fixture is absent, the shell remains
available and reports that the sample could not be loaded.

All media-specific components are prop-driven and contain no embedded sample
records. Their local search, filter, sort, selection, and inspector interactions
preserve the reviewed design behavior; they are not production API
implementations.
