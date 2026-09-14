# Web

The desktop React/Vite client consumes the REST API and contains no provider
credentials. History uses server-side type filters, complete counts, and cursor
pagination. Connections displays every account lineage, coverage, attempts,
incomplete-import progress, and resumable Spotify/YouTube imports. Use an
existing YouTube card for later snapshots of the same account.

During local development Vite serves `http://127.0.0.1:5173` and proxies `/api`
to the local Worker at `http://127.0.0.1:8787`. Import chunks are driven by the
browser; reopening Connections offers Resume import if a previous run stopped.
