# Library fetching

The six Library families use `section` to select Archive, Queue, Feed,
Following, Tracks, Albums, Artists, or Channels. Allowed values and filter
semantics remain media-specific. `layout` selects list/grid presentation; old
Movies `view=list|grid` browser links are read and normalized to `layout`.
All collection pages default to the shared `LIBRARY_PAGE_SIZE` of 50.
Inspector history and facet-option pagination keep their smaller limits.

## Items and summaries

`GET /api/library/{media}?section=...` returns only `data` and `nextCursor`.
It runs item selection and cursor/generation validation, without summary reads.
`GET /api/library/{media}/summary?section=...` returns the existing complete
counts, facets, coverage, capabilities, and freshness fields for that media.
Summary queries accept search and filters, and reject sort, direction,
pagination, and presentation parameters. Both paths share filter mapping and
predicates. Media-specific unique-item and consumption-occurrence semantics
remain unchanged. The channel Library subresource also uses `section`.

The client requests the visible items and summary concurrently. Items render
without waiting for the summary. Unknown counts remain blank until available;
a failed summary leaves the collection usable and offers Retry summary.
Sorting or loading another page reuses the filter-specific summary cache.
Default item pages and default summaries warm independently, after foreground
queries settle, with at most two background requests. Prefetch never starts a
provider sync. Background warming retains the existing all-sections policy.

The repository combined reads remain compositions of item and summary reads
for repository-level consumers and regression coverage; HTTP uses the isolated
operations. Video combined reads share one captured clock across both operations.
Each HTTP read captures its own clock and preserves publication-expiry and
cursor-generation checks.

## Cache and refresh policy

Library data stays fresh for ten minutes and inactive queries remain in memory
for thirty minutes. Default first pages and their summaries persist independently
with original timestamps in the version-2 localStorage snapshot. Snapshots expire
after 24 hours, remain schema-validated, and have a two-million-character cap.
Old version-1 snapshots are discarded. Filters, later pages, inspectors, and
operational status are not persisted.

Single-page collections refresh normally on stale mount, focus, and reconnect.
A multi-page collection is retained as a browsing snapshot on these automatic
events: its loaded pages and exact item/offset remain intact. Summaries refresh
independently. Imports/syncs explicitly cancel and invalidate all Library
families, including summaries, so returning to an invalidated collection
refreshes its complete cursor chain. Reload restores only the default first
page. No loaded pages are silently truncated to reduce request counts. If the server
invalidates a cursor (for example after an import or catalog expiry), pagination
offers Refresh collection instead of repeatedly retrying that cursor. Refresh
rebuilds the retained chain from its first page while keeping old items visible;
ordinary transient page failures retain their existing next-page Retry behavior.

Identical channel detail and channel Library requests share resource query keys
across inspectors and previews. Channel-picker results share collection keys
when section, search, sort, and direction actually match; the picker's alphabetical
order remains distinct from the Channels collection's default watch-count order.
Podcast and Music option searches debounce for 250 ms.

## Connections

Connections and the newest activity page poll every minute while idle, and every
five seconds during browser mutations or observed active catalog/sync work.
Older activity uses a separate, explicitly paginated, unpolled snapshot. Rows
are deduplicated by run ID, with current head data taking precedence. Import/sync
completion or failure resets older activity and invalidates operational and
Library caches. Health keeps its existing thirty-second polling.

## Validation

Contract/API tests cover section validation, 50-item defaults, independent
summary endpoints, and the absence of aggregate queries on Movies item pages.
Cache tests cover filter-only summary identity, independent persistence and
invalidation, shared resource keys, and deep-page retention. Browser tests cover
items appearing before summaries, summary reuse during pagination/sorting,
debounced option searches, and idle head-only activity polling, alongside the
existing collection, inspector, scroll-restoration, and light/dark/narrow suites.
