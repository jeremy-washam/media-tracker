# ADR 0014: Interim Spotify catalog retention

- Status: Accepted by owner for this private application
- Date: 2026-09-21

## Context

Spotify Web API catalog objects enrich exact track, album, artist, episode, and
show identities found in the owner's retained exports and saved-library scans.
The current implementation preserves catalog response bodies and projected
metadata without automatic expiry. The owner prefers to keep these records
indefinitely for now while completing the personal catalog backfill.

Spotify's [Developer Terms](https://developer.spotify.com/terms) do not specify
a numeric cache duration, but require temporary caching of metadata/artwork and
say not to store Spotify Content indefinitely. Private personal use does not
appear as an exception to those storage restrictions. This decision records the
owner's preference and implementation risk; it does not claim compliance or
change the terms.

## Decision

For the current private deployment, retain acquired Spotify API catalog
responses and normalized metadata without automatic expiry. Keep them distinct
from authoritative owner listening observations and source-derived Library
membership. Perform exact-ID enrichment asynchronously in bounded,
retryable jobs, without fabricating listens, releases, or dates from catalog
data. Preserve attribution and links back to Spotify when displaying its
content.

Do not apply this retention exception to TMDB or YouTube caches governed by
[ADR 0012](0012-refreshable-provider-catalog-cache.md). Revisit Spotify
retention before broadening access, distributing the app, or treating the
integration as policy-compliant.

## Consequences

Catalog backfill may continue without a TTL migration. Stored API data can
become stale or unavailable upstream; the UI and diagnostics should distinguish
catalog observation time from the owner's listening history. This choice
retains a known provider-terms risk until the owner elects a bounded cache.
