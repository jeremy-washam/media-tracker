# Web

The desktop React/Vite client consumes the REST API and contains no provider
credentials. History uses server-side type filters, complete counts, and cursor
pagination. Connections displays every account lineage, coverage, attempts,
incomplete-import progress, and resumable Spotify/YouTube imports. Use an
existing YouTube card for later snapshots of the same account.

During local development Vite serves `http://127.0.0.1:5173` and proxies `/api`
to the local Worker at `http://127.0.0.1:8787`. Import chunks are driven by the
browser; reopening Connections offers Resume import if a previous run stopped.

## Design studies

With `pnpm dev:web` running, open `http://127.0.0.1:5173/design.html`.
The separate preview entry offers seven structural studies of Chat, Library,
and Recaps: Index, Top nav, Two-pane, Journal, Gallery, Research, and Documents. All content and model responses are illustrative and state
is temporary. It makes no requests to the application API. See
`docs/design/ui-foundation.md` for scope and interaction details.

Index is the selected base. Preserve all seven studies as references. Reopening
instructions and source locations are in [saved mockups](../../docs/design/mockups.md).
