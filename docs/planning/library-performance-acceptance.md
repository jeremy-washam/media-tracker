# Library loading and performance verification

Verified locally on 2026-10-12 against the existing owner database using one
Wrangler Worker and the Vite client. Results are local API wall-clock timings,
including JSON decoding, rather than production latency or image-download timings.
No owner payloads or credentials are stored in this report or test fixtures.

## Coverage

All 17 implemented pages displayed real results without error alerts: the 16
Library sections below and Connections. The root route redirects to Books
Archive. Chat and Recaps remain intentionally unavailable placeholders.

The final read-only API audit completed 135 successful requests, covering first
and repeated collection loads, subsequent pages where available, search, an
alternate sort, inspectors, supported History/highlight/channel-video endpoints,
filter-option endpoints, and representative date/format/state filters across all
six media types. Paginated collection samples had no repeated item IDs.

Browser checks additionally confirmed Movies Queue grows from 48 to 96 loaded
results, retains those results when opening its inspector, and displays History.
Video search updated the URL and displayed the filtered collection; its inspector
and watch-history view finished loading. Browser API error logs were empty during
that check. Existing browser regression tests use synthetic/mocked responses;
these live checks verify the actual local data and backend separately.

## API measurements

Books and Movies used the UI's 48-row page size; other Library sections used 50.
The maximum column covers collection loads, pagination, search, sorting, and
inspector/history requests for that section in the final audit.

| Section            | First request (ms) | Repeat (ms) | Maximum sampled (ms) |
| ------------------ | -----------------: | ----------: | -------------------: |
| Books Archive      |                134 |          15 |                  134 |
| Books Queue        |                 55 |          23 |                   55 |
| Movies Archive     |                 15 |           9 |                   15 |
| Movies Queue       |                  9 |           8 |                   11 |
| Articles Archive   |                 45 |          46 |                  614 |
| Articles Queue     |                 92 |          89 |                  303 |
| Articles Feed      |                276 |         280 |                  287 |
| Podcasts Archive   |                 18 |           9 |                   26 |
| Podcasts Queue     |                  5 |           7 |                    7 |
| Podcasts Following |                  5 |           6 |                    6 |
| Music Tracks       |                193 |         197 |                  353 |
| Music Albums       |                431 |         429 |                  431 |
| Music Artists      |                344 |         329 |                  344 |
| Videos Archive     |              1,274 |         840 |                1,447 |
| Videos Queue       |                 95 |          89 |                   97 |
| Video Channels     |                125 |         105 |                  125 |

Connections returned in 164 ms, sync activity in 10 ms, and health in 5 ms.
Music facet-option requests took 226–478 ms; Podcast facet options took 4–13 ms.
These are observations, not timing assertions in the automated suite. Video
Archive remains the heaviest read path; a prior audit overlapping builds, tests,
and browser activity reached 2.48 seconds. Subsequent isolated repeated 50-row
requests took 594–660 ms. Avoid treating timings gathered during parallel builds
as a steady-state browsing benchmark.

## Corrections and regression coverage

- Migration 0025 adds an Archive index covering media identity, active state,
  and consumed date. It prevents Movie occurrence counts from scanning the
  entire active Archive once per movie. Before correction, Movies requests took
  roughly 40 seconds and blocked even the health endpoint.
- Movie keyset pagination had an incomplete SQL predicate. Subsequent Archive
  and Queue pages now load; repository regressions exercise both sort directions
  and dated/null values for date, title, and personal-rating sorts.
- Video and Channel text search previously reran a correlated FTS search for
  each Library row. It now computes match membership once per statement,
  preserving historical-title, exact-ID, and canonical-URL matches. Regressions
  inspect the actual generated query plan and result identities. The previously
  timed-out Video search now completes normally.

Validation completed after the implementation edits: `pnpm check` (241 tests),
`pnpm build`, `pnpm test:e2e` (23 tests), and `git diff --check`. Migration 0025
was applied locally; fresh-schema and previous-schema upgrade tests passed,
retained Archive rows were unchanged, and foreign-key checks passed. The single
Worker and existing Spotify backfill remain the operational runtime; no second
Worker or replacement catalog job is required.
