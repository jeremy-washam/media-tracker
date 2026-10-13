# Documentation audit — October 12, 2026

Status: documentation corrected against the current working checkout and local app.
The checkout includes uncommitted deployment and Library-cache work; this audit
describes that code, not a released or hosted revision.

## Evidence and scope

Reviewed the product/architecture/UI foundation, accepted ADRs, package READMEs,
source-report implementation status, and planning/status/contract documents.
Compared them with the router/shell, shared controls and styles, query/cache
implementation, API contracts and routes, source sync/import services,
media-specific repositories, Worker queue/scheduled handlers, and deployment
helpers. Dated research and acceptance records remain historical evidence.

Concurrent work added shared infinite scrolling during the audit. Its web
README section was preserved and compared with the collection scroll/pagination
implementation. The UI foundation now records that behavior; this is a moving
checkout review rather than a frozen-release acceptance record.

Started the documented `pnpm dev` command. Localhost binding required execution
outside the restricted sandbox; startup then succeeded. Vite returned HTTP 200,
direct and Vite-proxied `/api/health` returned `status: ok`, and the generated
OpenAPI document exposed 41 paths. Startup rebuilt the frontend successfully.

Browser inspection covered every Library section and Connections with existing
local data. Books filters and Details/History inspection were also exercised.

| Family   | Observed production sections |
| -------- | ---------------------------- |
| Books    | Archive, Queue               |
| Movies   | Archive, Queue               |
| Articles | Archive, Queue, Feed         |
| Podcasts | Archive, Queue, Following    |
| Music    | Tracks, Albums, Artists      |
| Videos   | Archive, Queue, Channels     |

The root redirects to Books Archive. The legacy History component is unmounted;
its generic media API remains available. Chat and Recaps are disabled in the
shell, and Settings has no production route. This review did not trigger manual
syncs, imports, provider probes, remote migrations, or deployment.

## Corrections

| Area                | Corrected documentation                                                                                                                                                                                                                                     |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Delivery status     | Six implemented Library families and 16 sections replace ingestion-era-only descriptions; pending hosted deployment and broader recovery remain explicit.                                                                                                   |
| Queue               | Current read-only membership is source-derived. Books statuses 1/2 are independent from retained reads; local-authoritative intent/write-back remain future work.                                                                                           |
| Music               | Identified, non-conflicting export rows and Recently Played events count immediately, including zero-duration/skipped rows. Removed the current shared contract's 30-second and Excluded-mode claims; labeled the detailed original proposal as superseded. |
| Source acquisition  | Hardcover reconciles Want to Read, Currently Reading, and Read; Spotify includes song imports, saved shows, player evidence, and recent tracks. The two-scope probe grant's limits are explicit.                                                            |
| Catalogs and queues | TMDB/YouTube caches and refresh jobs plus resumable Spotify exact-ID backfill are implemented. Source reports no longer label these paths pending.                                                                                                          |
| UI                  | Documented list defaults and saved/URL precedence, the single expanded Article presentation, actual shadcn controls/tabs, persistent sidebar rail, Graphite appearance control, and current system-font wordmark.                                           |
| Operations          | Removed the absent `db:generate` command; kept local placeholder config separate from the ignored production target. Deployment, rate limits, snapshot/restore, and paused-cache launch gates remain distinct from hosted acceptance.                       |
| Historical plans    | Added current-status/supersession notes rather than rewriting dated research, provider observations, ADR history, and past test results.                                                                                                                    |

The current brand was measured in the live app: 20px, weight 500 system text
beside the compact J2 symbol. The code uses the shared list-default preference,
actual Tabs panels, Graphite tokens, and the bounded Library browser cache
documented in the web README.

## Remaining observations and limits

The audit found two stale Connections descriptions: Archive-only Reader polling
and Read-shelf-only Hardcover reconciliation. The subsequent landing pass
corrected those strings to all-location Reader/highlight reconciliation and
Want to Read/Currently Reading/Read reconciliation. Source behavior is unchanged.

The existing private deployment and storage plans correctly leave hosted
provisioning/cutover, paused-sync YouTube cache maintenance, and projection/FTS
freshness as uncompleted launch gates. Generalized replay/export/recovery,
manual Queue editing, long-list virtualization, and scheduled Spotify catalog
refresh remain follow-ups. This audit does not imply they are fixed.

Provider policies, pricing, quotas, and API capabilities were not re-probed or
reverified online. Their original verification dates remain unchanged; the new
implementation-review dates indicate repository/local-app comparison only.
The documentation audit changed no source records, schemas, application code,
credentials, or ADR decisions. The subsequent landing pass corrected the two
coverage strings described above. The running app was inspected in its existing desktop dark appearance;
this was documentation verification, not a new exhaustive visual/performance or
offline acceptance pass.

## Validation

- The frontend build passed after the documentation edits and concurrent
  pagination integration.
- Local file-link validation passed for all 83 Markdown files; no missing
  targets were found. A separate heading-fragment scan found no potential
  Markdown anchor issues. External URLs were not checked.
- `git diff --check` passed.
- Both full `pnpm check` attempts passed repository formatting, workspace
  typechecks, and lint, then reported 276 passing tests and one five-second timeout in
  `apps/api/src/reconciliation.test.ts`, the large-import Archive pagination
  case. The isolated test also timed out at the default five-second limit. The
  timeout and assertions were not changed, and the default check is not green.
  Final scoped Markdown formatting passed after the last documentation edits.

## Subsequent landing validation

The default `pnpm check` subsequently passed all 277 tests in 48 files, plus
formatting, workspace typechecks, and lint. The large-import pagination case
passed without changing its assertions or configured timeout. The preceding
timeouts remain historical audit results rather than an outstanding failure.

A later combined run reproduced the timeout under parallel load. Running the
unchanged suite with four workers passed all 277 tests. The landing pass now
bounds Vitest to four workers; test assertions and the five-second default
timeout are unchanged.

The combined checkout also passed `pnpm build:production`, including the full
repository build and both local/production Worker dry runs. After the inspector
loading/error fixes were finalized, the complete Playwright run passed all 142
tests with four workers, and the deployment-mode web bundle was rebuilt. The hosted assets contain only the app,
imported assets, and the allowlisted TMDB logo; private samples and study entries
are excluded. The live Connections descriptions match the actual sync scope.
No hosted deployment or provider sync was started by this landing pass.
