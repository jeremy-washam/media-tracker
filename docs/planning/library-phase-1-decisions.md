# Library Phase 1 decision register

- Date: 2026-09-19
- Last updated: 2026-09-20
- Status: Owner review complete; superseded where noted by the accepted Phase 2 surface specification
- Scope: Product semantics and acquisition choices that should be settled before
  specifying exact collection and inspector fields

## Purpose

This document is the first of two Library specification phases:

1. **This phase:** decide what each source relationship means, which tailored
   media experiences belong in the initial Library, which enrichment paths are
   worth adopting, and how uncertain evidence should behave.
2. **Next phase:** choose the exact fields, controls, filters, sorts, default
   views, inspector sections, and responsive behavior for every media type.

The detailed source reports deliberately inventory more fields than the product
should display. They are the evidence base for this shorter decision register:

- [Hardcover](research/hardcover-phase-1.md)
- [Readwise Reader](research/readwise-reader-phase-1.md)
- [Letterboxd](research/letterboxd-phase-1.md)
- [Spotify](research/spotify-phase-1.md)
- [YouTube](research/youtube-phase-1.md)

The recommended choices below are defaults for review, not decisions silently
made on the owner's behalf. A response can approve all recommendations and list
only exceptions, or answer individual IDs.

On 2026-09-20, the owner accepted the recommended choices except for the
explicit overrides recorded under A1, A4, P4, S3, and V2. B5 was reclassified
as a Phase 2 per-surface field decision rather than a Phase 1 product-semantics
decision.

## What was freshly verified

| Source          | Live evidence acquired on 2026-09-19                                                                                                                                                             | Important limitation                                                                                                                                              |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hardcover       | Authenticated GraphQL calls across all 1,114 user books, child reads, work and edition scalars, plus sampled relationships, tags, and journals                                                   | The beta API is rate limited and selection-based; production does not yet request most catalog fields or Want to Read                                             |
| Readwise Reader | Authenticated Reader v3 documents and tags plus Readwise v2 exports, books, and highlights; 1,021 documents across all current locations                                                         | The implemented initial backfill only requested Archive; Queue, tags, highlights, and full text need new acquisition/projection work                              |
| Letterboxd      | Configured live public RSS plus the complete ignored owner export                                                                                                                                | Letterboxd's API is unavailable under its published access policy and no client credential exists; TMDB/OMDb are also unconfigured                                |
| Spotify         | Authenticated saved episodes, saved shows, show episodes, episode lookup, saved tracks/albums, recent plays, top items, and current playback, plus the complete ignored streaming-history export | Followed artists returned `403` because the current grant lacks `user-follow-read`; API content has attribution, refresh, retention, and AI-use constraints       |
| YouTube         | Both ignored Takeouts, current local projection, official discovery documents, and a public oEmbed response                                                                                      | No Data API key, Google OAuth grant, or Data Portability grant exists, so account/API payloads beyond the export are documented rather than live-account verified |

No credential, private title, review, highlight, note, listening row, URL, or
source identifier is committed in these reports. Example payloads are
hand-sanitized.

## Decisions already established

These are durable product or architecture constraints and do not need to be
reopened during this review:

- Library is read-only in this delivery. Upstream writes, manual additions,
  rating/status edits, and in-app playback/reading are out of scope.
- One item appears once in a collection; the inspector can contain all supported
  consumption history.
- Date filters match any supported occurrence. The collection uses the latest
  matching occurrence for the filtered period and preserves the complete
  history.
- Unknown, partial, inferred, source-recorded, and ingested dates remain
  distinct. Missing consumption time is never replaced by another timestamp.
- Archive and Queue are independent relationships. A consumed item may also be
  explicitly queued.
- Queue comes from Hardcover Want to Read, Letterboxd watchlist, Reader Inbox
  and Later, untouched saved Spotify episodes, and YouTube Watch Later. Songs
  have no Queue.
- Positive podcast playback from any retained Spotify evidence excludes an
  episode from Queue. A current zero does not erase historical playback.
- Reader Feed is ambient inventory, not Queue. It has its own Articles section.
- Saved Spotify shows do not imply item-level intent for every episode.
- A YouTube subscription or arbitrary playlist does not imply Archive or Queue.
- Imported source evidence is immutable and replayable. Current catalog
  enrichment is a separate, refreshable projection and may never erase local
  history.
- Provider identities and explicit reconciliation rules govern merging. Titles,
  creator names, and fuzzy similarity alone are insufficient.

## Cross-Library choices

### X1. How media-specific sections relate to Archive and Queue

**Option A — only Archive and Queue everywhere.** This is structurally simple,
but hides meaningful show, album, artist, and channel relationships.

**Option B — keep Archive/Queue as item memberships and allow media-specific
views or sections (recommended).** Examples are Podcast Following and
history-derived Music Albums/Artists, plus the separate Articles Feed. These are explicitly labeled
relationships or rollups, not new forms of consumption.

**Option C — promote all relationships into Archive or Queue.** This creates
false semantics, such as treating every followed-show episode as queued.

**Recommended decision:** X1-B. Preserve a common shell and selection model,
while allowing each media type to expose a small number of honest local views.

### X2. Current catalog metadata versus historical source facts

**Option A — one mutable display record.** Simple, but a renamed video/channel
or changed catalog record can silently rewrite history.

**Option B — current display projection plus historical observations
(recommended).** Default browsing can use current metadata while the inspector
or provenance view can disclose what the source recorded at consumption time.

**Option C — freeze historical metadata only.** Most faithful to imports, but
poor for current artwork, availability, and corrected titles.

**Recommended decision:** X2-B for every provider that supplies mutable catalog
data.

### X3. Enrichment failure behavior

**Option A — enrichment is required before an item appears.** Produces richer
cards but makes private/deleted/unavailable items disappear.

**Option B — local evidence renders independently; enrichment is additive
(recommended).** Missing credentials, provider downtime, expiry, or removed
catalog entries leave an honest but possibly sparse item.

**Recommended decision:** X3-B.

### X4. Personal relationships beyond Archive and Queue

Sources expose likes, tags, saved tracks/albums, subscriptions, and arbitrary
lists/playlists. They can be inspector facts, filters, or dedicated views, but
importing everything now would enlarge the first Library substantially.

**Recommended decision:** project only relationships approved in the
media-specific choices below. Retain everything else as replayable evidence and
defer a general Lists model.

### X5. Provider metadata retention and attribution

Spotify and YouTube impose materially different caching, attribution, and
downstream-use constraints from owner-provided exports. Treating all API pages
as permanent immutable raw evidence would conflict with those requirements.

**Recommended decision:** approve provider-specific refreshable catalog caches,
with acquisition time, expiry/deletion behavior, source links, attribution, and
an AI-exclusion boundary where required. Record this in a new ADR before the
first such integration ships.

## Books decisions

Fresh evidence: 1,114 Hardcover relationships comprise 984 Want to Read, two
Currently Reading, and 128 Read. The API exposes work, edition, contributor,
series, tag, journal, ownership, progress, personal-rating, and community fields;
the production sync currently projects only a narrow Read subset.

### B1. Library item identity

**A. One item per work (recommended).** Keep current, consumed, cover-default,
physical-default, ebook-default, and audio-default editions as role-labeled
identities beneath the work.

**B. One item per edition.** More precise for format ownership but duplicates
the same book throughout the Library and invents edition certainty where imports
lack it.

**Recommendation:** B1-A.

### B2. Currently Reading

**A. Exclude from the initial Library (smallest scope).** Retain the source
state but show only Archive and Queue.

**B. Add a Books-specific In Progress/Reading view (recommended).** It remains
neither Archive nor Queue and appears only when nonempty.

**C. Keep it in Queue until completion.** Treat the active reading relationship
as continuing intent without adding a separate Books view.

**Owner decision:** B2-C. Books has only Archive and Queue. Current Want to Read
and Currently Reading relationships remain in Queue until a supported completed
read is available; there is no Reading view or Reading badge.

### B3. Rereads when Hardcover only supplies a declared count

**A. Invent missing occurrences to equal `read_count`.** Gives a satisfying
count but fabricates dates and edition evidence.

**B. Preserve child reads as occurrences and show a separately labeled declared
count discrepancy (recommended).** A book may say “2 reads reported; 1 dated
read available.”

**Recommendation:** B3-B.

### B4. Edition treatment

**A. Show only the work/default edition.** Compact but can misstate the edition
actually consumed.

**B. Keep role-aware editions and let consumption history name the consumed
edition when known (recommended).** Current-selected and display-cover editions
remain separate.

**Recommendation:** B4-B. Exact placement belongs to Phase 2.

### B5. Community and taxonomy data

Hardcover exposes community rating/counts, series, genres, moods, pace,
content-warning tags, and other community metadata.

**Owner decision — defer to Phase 2.** Whether these fields are acquired or
shown is part of the upcoming per-surface field, filter, and sort exercise. It
is not a product-semantics decision to settle in this phase.

### B6. Ownership, progress, and reading journals

**A. Make all source fields first-class.** Most are sparse or historical event
noise for this Library.

**B. Preserve progress/current format as History and provenance facts when
available; project notes/quotes only when they support the inspector; retain
other journal events as provenance (recommended).**

**Recommendation:** B6-B.

## Articles decisions

Fresh evidence: Reader returned 1,021 documents across seven observed
categories. It included 85 Archive, 139 Inbox, 62 Later, 716 Feed, and 19
highlight-only rows. Archive progress ranged from zero to complete, confirming
that Archive is completion-like intent rather than proof every byte was read.

### A1. Reader Shortlist

Reader documents `shortlist` as a separate location, although none appeared in
the current account.

**A. Treat Shortlist as Queue.** It represents deliberate future intent but
widens the owner's explicit Inbox-and-Later rule.

**B. Preserve it but keep it out of Queue until the owner uses it and defines
its meaning.**

**C. Add a separate Shortlist section.** Faithful but unjustified without
observed use.

**Owner decision:** A1-A. Reader Shortlist belongs in Queue.

### A2. Reader videos and podcasts

**A. Keep every Reader record under Articles.** Mirrors Reader's document model
but conflicts with media-type-first Library navigation.

**B. Route eligible Reader video and podcast records to Videos and Podcasts
using authoritative identities where available (recommended).** PDFs, RSS, and
newsletter/email documents remain Articles; tweets, EPUBs, notes, and
highlight-only documents remain source evidence.

**Recommendation:** A2-B, consistent with the accepted canonical model.

### A3. Highlights, notes, and full text

**A. Metadata only.** Smallest ingestion, but leaves valuable personal context
out of inspection.

**B. Sync highlights and notes; fetch full text selectively when a chosen
inspector/search feature needs it (recommended).** Use deletion-aware v2 export
for highlights. Do not make full-text acquisition a prerequisite for Library.

**C. Acquire all available HTML/raw source eagerly.** Maximizes future search
coverage but raises storage, privacy, refresh, sanitization, and licensing work.

**Recommendation:** A3-B.

### A4. Reader Feed and subscription organization

**A. Add Feed as a separate Articles section.** Feed remains ambient
subscription inventory and does not become Archive or Queue.

**B. Exclude Feed from Library membership while retaining publication/source
metadata for archived or queued documents.** Future Feed product
work remains separate.

**Owner decision:** A4-A. Articles has a separate Feed section.

### A5. Tags and source hierarchy

**A. Treat author, publication/site, source, and tags as one creator field.**
Simple but lossy.

**B. Preserve them as separate concepts (recommended).** The current account
has 178 authors, 107 sites/publications, ten sources, and nine manual tags.

**Recommendation:** A5-B. Whether each becomes visible/filterable is Phase 2.

## Movies decisions

Fresh evidence: the export contains 363 watched films, 211 Diary occurrences,
355 current ratings, 13 reviews, 288 likes, and 309 watchlist rows. The RSS adds
recent public activity and TMDB identities for its finite window, but the local
movie projection has no artwork, description, creator, or runtime.

### M1. Movie catalog enrichment

**A. Ship with Letterboxd history only.** Honest but visually sparse for most
of the collection.

**B. Adopt TMDB as a separate attributed catalog source (recommended).** Use
exact RSS TMDB IDs where present; export-only films require explicit candidate
matching. The Library still works when enrichment is absent.

**C. Use RSS poster HTML as the primary artwork source.** Partial, recent-only,
embedded in untrusted markup, and not a catalog strategy.

**Recommendation:** M1-B. A TMDB credential, live probe, attribution decision,
and cache design are required before Phase 2 can finalize movie metadata fields.

### M2. Ambiguous export-only film matches

**A. Automatically attach the best title/year result.** High coverage but risks
unrelated artwork and metadata.

**B. Leave ambiguous items unenriched and retain candidates for later review
(recommended initial behavior).**

**C. Build an owner-confirmation workflow now.** Most accurate, but it expands
the read-only Library into data correction tooling.

**Recommendation:** M2-B for the initial Library; consider M2-C as a later
maintenance surface.

### M3. Likes, tags, and Letterboxd lists

**A. Project everything into the first Library.** Rich but adds empty/sparse
tags and a de facto Lists product.

**B. Project likes as a personal relationship; defer tags and list membership
unless Phase 2 identifies a concrete inspector/filter use (recommended).**

**C. Add a compact “In your lists” inspector section now.** Useful if Letterboxd
lists are central to the owner's workflow, but requires ordered membership and
list metadata projection.

**Recommendation:** M3-B. The owner can override this with M3-C.

### M4. Current watch-provider availability

**A. Include regional streaming providers now.** Convenient, but volatile,
region-specific, separately attributed, and unrelated to personal history.

**B. Defer availability until the core Library and TMDB identity coverage are
stable (recommended).**

**Recommendation:** M4-B.

### M5. Film versus release identity

**A. One movie/production item (recommended).** Preserve release facts as
metadata when acquired.

**B. Separate theatrical/digital/country/cut releases.** Letterboxd history does
not establish which release was watched.

**Recommendation:** M5-A.

## Podcasts decisions

Fresh evidence: Spotify returned 110 saved episodes and 40 saved shows. Of the
saved episodes, 31 had positive current progress, 41 explicit zero, and 38 were
unavailable rows. Three apparent current-zero episodes had positive historical
export playback, proving that Queue classification must consult all evidence.
The export contains 6,416 podcast segments for 2,600 episode identities.

### P1. Following

**A. No visible Following experience.** Retain saved shows only as hidden
evidence or inspector context.

**B. Add a show-level Podcast Following view (recommended).** Each saved show
appears once. Its catalog is not automatically added to Queue.

**C. Expand all followed-show episodes into Queue.** Produces a large invented
backlog and expensive scans.

**Recommendation:** P1-B and reject P1-C.

### P2. What populates episode Queue

**A. Saved episodes with usable identity, explicit zero, and no positive
playback anywhere (recommended).**

**B. Saved episodes based only on current resume state.** Misclassified three
episodes in the live account.

**C. All unplayed episodes of followed shows.** Conflates following and intent.

**Recommendation:** P2-A.

### P3. Listening history granularity

The export has segments but no trustworthy session ID.

**A. Infer sessions/relistens from time gaps.** More familiar, but may split one
listen or merge genuine relistens.

**B. Present one episode consumption relationship with first/latest positive
segment, total observed time, and segment count; keep raw observations paginated
behind provenance if needed (recommended).** Never label segments as “times
played.”

**Recommendation:** P3-B.

### P4. Current-player polling

**A. Poll current playback to improve timeliness.** It can catch some new
activity but misses whole plays and does not provide a reliable occurrence time.

**B. Defer it; use saved-library state plus periodic exports.**

**Owner decision:** P4-A when the endpoint is available. The configured Spotify
grant already permits the read-only current-player call, which succeeded with a
valid empty `204` during research. Treat polling as best-effort supplemental
evidence: positive episode progress admits consumption, but player state does
not manufacture a consumption timestamp. Saved-library state and exports remain
the completeness fallback.

### P5. Removed or unavailable episodes

**A. Remove them from Library when lookup fails.** Loses history.

**B. Keep prior identity and historical metadata, mark current availability
separately, and retry enrichment under policy (recommended).**

**Recommendation:** P5-B.

## Music decisions

Fresh evidence: the export contains 152,231 song playback segments for 33,225
Spotify track identities. The current saved library contains 9,819 tracks and
595 albums. A positive-duration rule would admit 32,810 unique tracks; a
30-second rule would admit 26,822. Saved and played collections are therefore
large, distinct sets.

### S1. What defines the Songs collection

**A. Tracks with qualifying playback (recommended).** This matches Library's
consumption purpose.

**B. Saved tracks.** A current collection/affinity signal, not proof of a play.

**C. Saved albums or followed artists.** Group-level relationships, not song
consumption.

**Recommendation:** S1-A. Saved state may be an independent filter or fact; it
never becomes Queue.

### S2. Qualifying playback rule

**A. Any positive duration.** Simple but admits tens of thousands of accidental
starts and inherits podcast semantics without justification.

**B. At least 30 seconds (provisional recommendation).** Transparent and
replayable from the export, but penalizes intentionally short tracks.

**C. Positive and not skipped.** Uses source evidence that is unavailable or
inconsistent across some historical rows.

**D. A duration-percentage or hybrid rule.** Better for short tracks, but
requires complete, trustworthy duration metadata and more explanation.

**Recommendation:** S2-B for Phase 1, preserving every excluded row and labeling
the result “qualifying playback observations,” not completed listens. The owner
should explicitly approve or replace this threshold.

### S3. Recently played API events

Recent events contain `played_at` but no played duration or skip evidence.

**A. Admit them immediately as qualifying plays.** Timely, but uses a different
rule from the export.

**B. Show them as provisional recent activity and wait for export evidence
for consistency.** Accurate to the threshold but makes membership
lag manual exports.

**C. Ignore them entirely.** Simplest but wastes the only automatic song-history
surface.

**Owner decision:** S3-A. Admit recently played API events immediately as song
activity despite their lack of duration, and document this as a source-specific
exception to the export-duration qualification rule. Reconcile against later
exports without duplicating the playback when a deterministic overlap rule is
available.

### S4. Tracks, Albums, and Artists experience

**A. One dense Tracks view only.** Smallest scope.

**B. Add history-derived Tracks, Albums, and Artists views (recommended).** Album
and artist views are server-side rollups over qualifying playback; they do not
claim every album track was played or the artist was followed.

**C. Build Albums from saved albums and Artists from followed artists.** These
are current affinity/collection views rather than listening-history rollups;
followed artists also require reauthorization.

**Recommendation:** S4-B. Saved-track and saved-album state can become optional
filters/relationship markers. Do not block initial artist grouping on the
missing follow scope.

### S5. Song identity

**A. One item per Spotify track URI initially (recommended).** Preserve ISRC,
relinking, album, and ordered artist evidence for later reviewed merges.

**B. Merge automatically by ISRC.** More portable but can collapse legitimate
edits, releases, and remasters.

**C. Resolve every item to MusicBrainz before showing it.** Strong long-term
model but a separate matching project.

**Recommendation:** S5-A.

### S6. Skips and partial plays

**A. Hide excluded observations completely.** Clean but makes counts difficult
to audit.

**B. Preserve all observations, count only those satisfying the approved rule,
and expose skipped/partial evidence only where useful (recommended).**

**Recommendation:** S6-B.

### S7. Audiobooks

Spotify export rows include audiobook and chapter identities that do not safely
map to Hardcover works or editions.

**A. Include them in Songs or Podcasts.** Incorrect media semantics.

**B. Preserve and defer them to a later Books-domain identity/admission decision
(recommended).**

**Recommendation:** S7-B.

## Videos decisions

Fresh evidence: the two Takeouts contain 23,865 identified watch occurrences
for 20,227 distinct video identities and 3,506 repeated watches. Watch Later has
110 rows, 41 of which also appear in the corresponding account's history. The
current production projection has historical title/channel facts but no artwork,
duration, description, availability, subscription, or playlist model.

### V1. Current metadata source

**A. Takeout only.** Preserves history but lacks durable artwork, duration,
publication, and current availability.

**B. Add an attributed, refreshable YouTube Data API metadata cache
(recommended).** Batch known IDs and preserve Takeout facts independently.

**C. Use public oEmbed.** It was live-verified, but lacks duration, publication,
tags, categories, live state, and bulk/account capabilities.

**Recommendation:** V1-B. Phase 2 cannot live-verify exact Data API optionality
until the owner supplies a restricted API key or OAuth setup.

### V2. Channel identity and subscriptions

**A. Keep a channel display string only.** Simple but poor for renames and exact
grouping.

**B. Project stable channel identity for grouping and “more from this channel,”
without importing subscription state.**

**C. Preserve subscription state and expose it in a channel rollup.** Useful,
but requires a new relationship projection and optionally OAuth for current
reconciliation. It must not add every upload to Queue.

**Owner decision:** V2-C, refined in Phase 2. Add a Channels view that rolls up
all imported video activity by stable channel identity, sorts by personal views
by default, and offers a Following-only filter. Following does not create
Archive or Queue membership and followed channels with no Library activity do
not appear in the rollup.

### V3. Likes and arbitrary playlists

**A. Treat them as Queue.** Incorrect; only Watch Later has Queue semantics.

**B. Defer them to future filters/Lists while retaining available Takeout
evidence (recommended).**

**C. Add relationship sections now.** Useful only if liked videos or playlists
are central Library workflows.

**Recommendation:** V3-B.

### V4. Shorts, live streams, premieres, and YouTube Music

**A. Split each into a canonical media type.** Upstream evidence does not
reliably support those distinctions.

**B. Keep them as Videos and add source-backed format facets where reliable
(recommended).** Live metadata may be displayed; Shorts/premiere classification
must not rely on title or URL heuristics. A YouTube Music watch remains video
history unless an authoritative recording identity supports a reviewed merge.

**Recommendation:** V4-B.

### V5. Subscriptions and Data Portability

**A. Build Google Data Portability now.** It could automate archive acquisition
but requires a separate verified OAuth/billing project and has a 24-hour
recurring floor.

**B. Keep manual Takeout as history/Watch Later authority; revisit Portability
after a credentialed feasibility probe (recommended).**

**Recommendation:** V5-B.

### V6. Account lineage

The two exports must remain separate connections. A shared video ID does not
prove shared account identity.

**Recommended decision:** require a stable, non-secret owner label for each
Takeout lineage. If OAuth is later added, make channel/Brand Account selection
explicit and never auto-merge lineages.

## Credentials and live-probe follow-ups

The user's requirement to hit the real configured APIs was satisfied wherever a
credentialed API exists. Three gaps are explicit:

1. **Letterboxd API:** unavailable by provider policy and absent approved client
   credentials. Export and RSS are the supported real surfaces.
2. **TMDB:** no credential or integration is configured. If M1-B is approved,
   obtain a credential and run known-ID plus candidate-search probes before
   freezing movie fields.
3. **YouTube Data API / OAuth / Data Portability:** no key or grant is configured.
   If V1-B is approved, a restricted API key is sufficient for public video
   metadata; subscriptions, likes, playlists, and account identity require
   OAuth. Data Portability should remain separate.

Spotify followed artists also remains documented-only because the current grant
lacks `user-follow-read`. S4-B does not require that scope; reauthorize only if a
current followed-artist relationship is explicitly selected.

## Resolved decision set

The final Phase 1 decisions are:

```text
X1-B X2-B X3-B X4-recommended X5-recommended
B1-A B2-C B3-B B4-B B5-deferred B6-B
A1-A A2-B A3-B A4-A A5-B
M1-B M2-B M3-B M4-B M5-A
P1-B P2-A P3-B P4-A P5-B
S1-A S2-B S3-A S4-B S5-A S6-B S7-B
V1-B V2-C V3-B V4-B V5-B V6-recommended
```

## What Phase 2 will produce

After the decisions above are resolved, the next document will specify for each
media type and local view:

- exact collection row/card/gallery fields and density;
- exact inspector sections and field ordering;
- search targets and behavior;
- filter names, value sources, and unknown-value behavior;
- sort options, direction, and default;
- Archive/Queue/Podcast Following/Tracks/Albums/Artists/Video Channels counts;
- date and rating semantics;
- empty, missing, unavailable, and unresolved states;
- URL state and deep-link behavior; and
- API, storage, pagination, and index requirements needed to support those
  surfaces without parsing raw evidence at request time.
