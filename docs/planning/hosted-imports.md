# Hosted export imports

The deployed owner-only app accepts Letterboxd ZIP exports, Spotify Extended
Streaming History ZIP exports, and supported YouTube Takeout ZIP exports through
its existing authenticated import and continuation routes. Source bytes remain
private evidence; normalization commits a bounded chunk before advancing the
continuation cursor. Repeating an import remains idempotent.

## Worker limits

The upload boundary permits at most **25 MiB compressed, 8 MiB expanded across
all members, 8 MiB per member, and 2,000 members**. It checks both declared and
actual streamed bytes before handing the archive to a parser. Central directory
and local headers must agree. Truncated, encrypted, multi-disk, ZIP64,
unsupported-compression, duplicate-name and inconsistent archives are rejected.
Hosted continuations also check legacy stored ZIP/manifest sizes before buffering
and revalidate ZIP expansion before replay. An oversized upload receives HTTP 413 and an instruction to use the local app import workflow.

Compressed size does not predict expanded size. Before decompression, the Worker
checks bounded ZIP metadata, then independently counts output from small
compressed chunks. It does not accumulate the inflated preflight output. This
keeps an unexpectedly high compression ratio from allocating an entire large
history before the limit can run. Provider parsers then process at most the
permitted 8 MiB rather than an unbounded ZIP expansion.

These checks apply at the Worker HTTP boundary, leaving the existing local import
capabilities unchanged. The current parsers read complete selected archive
members and then commit at most 100 normalization records per chunk. They may
reparse the stored ZIP on continuation; this is intentionally limited to small
hosted exports. Truly large browser uploads need a separate streaming/member
staging design and are not represented as supported by this release.

## Larger exports

Keep the original export. Run the local app and use Connections or the documented
HTTP import and continuation endpoints. The current CLI supports deployment
commands, not historical import commands; no such CLI command is implied here.
A local import does not automatically sync its database to production. Follow the
protected deployment transfer/reconciliation runbook for moving verified local
data, with operator coordination. Never upload a full local database into the
running hosted instance or overwrite it to work around an upload limit; preserve
source IDs, raw objects, concurrent syncs and checkpoints.

## Acceptance

Unit tests exercise small valid provider archives, declared and actual expansion
limits, lying headers, aggregate/member limits, truncation and encryption. Native
Worker tests reject a compressed expansion bomb before writing source evidence
and process a synthetic near-limit 8 MiB JSON member containing distinct history records through the actual import
route. Existing native runtime tests cover repeated import idempotence, private
raw bytes, and interrupted import continuation. No test uses owner exports or
live provider credentials.
