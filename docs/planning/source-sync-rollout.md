# Hosted source sync

The owner prioritized sync before further browsing/performance measurements on
October 17, 2026. Existing provider credentials are installed. The existing
$5/month Workers plan is approved; additional charges are not.

## Initial activation

Apply migration 0030 before enabling source work. `SYNC_ENABLED=true` alone is
insufficient in production: `SYNC_SOURCES` explicitly lists enabled polling
sources and `SYNC_BUDGET_UNTIL` contains a future UTC instant. The deployment
validator limits an initial usage grant to 24 hours. Expiry stops new admissions;
it does not renew automatically. Check current account-wide included allowances
before issuing a grant, including rehearsal and deleted-resource usage.

Start one source at a time, inspect its durable attempt and native account usage,
then add the next source. Initial order: Letterboxd RSS, Hardcover, Readwise,
Spotify. This moves from the smallest finite feed to full reconciliation and
rotating credentials. Request new credentials only if a provider rejects those
already installed.

Both HTTP sync actions and queued source jobs share these controls:

- One attempt per source per UTC day, with at least 23 hours between admissions.
- A global 20-minute lease serializes source jobs across HTTP and queue consumers.
- Provider work checks a 10-minute deadline; individual requests time out after
  30 seconds, reject redirects, and buffer at most 8 MiB each.
- Failed attempts consume their daily reservation. Crashes retain the reservation
  and lease until expiry. Provider retries consume the same request cap.
- Failed or interrupted snapshots do not finalize missing records or advance
  complete-snapshot watermarks. Previously committed evidence remains durable;
  the next admitted attempt replays idempotently from the committed watermark.
  This is a safe restart, not a mid-page continuation.

| Source     | Requests | Parsed pages | Records, including read/highlight children | Response bytes |
| ---------- | -------: | -----------: | -----------------------------------------: | -------------: |
| Letterboxd |        2 |            1 |                                        500 |          4 MiB |
| Hardcover  |      128 |           64 |                                      7,000 |         32 MiB |
| Readwise   |       64 |           32 |                                     10,000 |         16 MiB |
| Spotify    |       32 |           24 |                                      1,000 |          8 MiB |

These are initial reconciliation ceilings, not targets or a dollar cap. Hardcover's
previous observed library was 1,114 relationships across 23 pages; its ceiling
leaves room for edition/read rows. The verified restore contains 917 Reader
documents, 16 highlight containers with 26 highlights, 72 saved Spotify episodes
and 40 saved shows. Those baselines inform the other finite caps; validate their
current size against controlled first runs. Oversized responses stop before parsing or R2 storage; accepted
responses are retained before record/page-limit checks. No partial result is
presented as a complete snapshot. Long Readwise/Hardcover `Retry-After` values
end an attempt instead of causing an early retry.

An hourly cron enqueues eligible `sync_source` jobs. The source consumer uses
batch size 1, concurrency 1, and at most one transport retry. Provider failures
are recorded in sync activity and acknowledged; the next eligible daily attempt
retries. A transient lease conflict requests delayed redelivery. Admission rows
record reserved ceilings and actual aggregate counts, including known D1
reads/writes and the count of statements without metadata. Native account
analytics remains authoritative for billing; `first()` metadata is unavailable.

Keep `ARTICLE_CONTENT_ENABLED=false`, `SPOTIFY_CATALOG_ENABLED=false`,
`CATALOG_AUTO_REFRESH=false`, and `MAINTENANCE_ENABLED=false` during this stage.
Existing content and enrichment jobs remain durable and paused; source sync
does not enqueue new HTML acquisitions or resume Spotify's catalog backlog.
The hosted write entry point permits only the four source-sync actions during
this rollout. Manual imports and enrichment need separately budgeted activation.
Read-only browsing remains available.

## Spotify credential ownership

Before enabling hosted Spotify, disable Spotify sync in local runtime
configuration. A copied credential store cannot coordinate token rotation
across two independent databases. Local cron is manually invoked, but local UI
sync actions must also respect source selection.

## Coverage and follow-up

Readwise covers Reader document state and highlights; Hardcover reconciles book
relationships and reads. Letterboxd RSS covers recent public activity, with manual
exports still required for complete edits/removals/private activity. Spotify
polling covers discoverable episodes/library state and recent tracks; periodic
Extended Streaming History exports remain necessary. YouTube watch history still
requires manual Takeout imports.

After representative native usage is recorded, set recurring cadence and durable
period allowances from measured amplification. Do not silently turn an expiring
grant into an indefinite schedule. Content, enrichment, maintenance, and manual
history imports need their own budgets before enabling.
