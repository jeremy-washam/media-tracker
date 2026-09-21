# ADR 0012: Refreshable provider catalog caches

- Status: Accepted
- Date: 2026-09-21

## Context

Letterboxd and YouTube Takeout establish the owner's movie and video identities,
relationships, and consumption history, but they do not provide enough current
catalog data for the approved Library surfaces. Credentialed live probes confirm
that TMDB can enrich movies and the YouTube Data API can enrich exact video and
channel identities. These provider responses are mutable catalog observations,
not durable personal evidence, and YouTube policy requires stored API data to be
refreshed or deleted within 30 days.

The application must remain fully usable when credentials are absent, catalog
calls fail, an identity is unavailable, or cached metadata expires. It must also
avoid turning a search candidate into a false identity match.

## Decision

Add provider-specific, rebuildable catalog caches outside the immutable source
ledger:

- TMDB movie profiles, configuration, genres, credits, countries, alternative
  titles, and explicit match outcomes;
- YouTube video profiles, channel profiles, thumbnails, categories, and
  requested-ID outcomes; and
- durable bounded refresh jobs with leases, attempt counts, aggregate outcomes,
  safe errors, and resumable cursors.

Selected normalized fields are stored; complete provider response bodies are
not copied into R2 or treated as raw owner evidence. Every profile records its
fetch and expiry times. YouTube fields and request outcomes expire no later than
30 days after acquisition. TMDB uses the same default refresh interval for
operational consistency, though it is not treated as personal-history evidence.
Expired provider fields are excluded from browse projections and search before
they are refreshed or purged.

Catalog refresh runs asynchronously in bounded batches and never occurs on a
Library read request. A failed provider request preserves the last still-valid
cache and never changes Archive or Queue membership. For YouTube, only an ID
omitted from a successful complete `videos.list` batch is recorded as currently
unavailable; a failed or malformed batch proves nothing about its requested
IDs.

TMDB matching uses this confidence order:

1. an exact stored TMDB movie identity;
2. an exact stored IMDb identity resolved through TMDB `/find`; and
3. a movie search whose results contain exactly one candidate with an exact
   normalized title or original title and the same release year.

Zero exact candidates is `unmatched`; more than one is `ambiguous`. Search
scores, popularity, artwork, and fuzzy similarity never auto-match. Durable
match provenance may retain the accepted provider identity, method, matcher
version, candidate count, and attempt timestamps after mutable profile fields
expire. Search candidate payloads are not retained.

TMDB-backed UI includes the required attribution and distinguishes the owner's
rating from the TMDB community rating. YouTube enrichment uses only public
application-key access. YouTube OAuth and a live Following surface are out of
scope; imported Takeout subscription rows remain preserved source evidence but
do not create a Library filter or account authorization requirement.

## Consequences

The read models may prefer valid current catalog titles and artwork while always
falling back to imported source facts. Provider outages and cache deletion can
reduce richness but cannot hide an item or rewrite its history. Cache tables can
be purged and rebuilt from exact identities plus permitted matching provenance.
Operational code must monitor job progress, omissions, errors, expiry, and quota
estimates without logging credentials, private titles, or raw responses.
