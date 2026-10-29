# CLI

The CLI supports production target configuration and guarded deployment through
`deployment configure <private-settings.json>` and `deployment deploy [--dry-run]`.
The separate `pnpm deployment:snapshot` Python utility creates a private D1/R2
transfer bundle and can rehearse restoration locally. See the
[deployment runbook](../../docs/planning/deployment.md).

The deployment utilities require Python 3.12 or newer with SQLite FTS5 support.
`scripts/deployment/capture.py` captures a quiesced hosted database and private
R2 objects into a protected local bundle; `scripts/deployment/recovery.py`
independently verifies its schema, rows, search vocabularies, object hashes, and
restore rehearsal. These operator utilities supplement the CLI; they are not
general-purpose replay or historical-import commands.

Historical import, generalized replay,
app-wide export, and recovery commands are not implemented. Use Connections or
the documented HTTP endpoints for imports and continuation, and Wrangler D1
export/migration commands for local database administration.
