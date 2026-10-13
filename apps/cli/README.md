# CLI

The CLI supports production target configuration and guarded deployment through
`deployment configure <private-settings.json>` and `deployment deploy [--dry-run]`.
The separate `pnpm deployment:snapshot` Python utility creates a private D1/R2
transfer bundle and can rehearse restoration locally. See the
[deployment runbook](../../docs/planning/deployment.md).

Historical import, generalized replay,
app-wide export, and recovery commands are not implemented. Use Connections or
the documented HTTP endpoints for imports and continuation, and Wrangler D1
export/migration commands for local database administration.
