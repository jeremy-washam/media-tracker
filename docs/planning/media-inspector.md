# Media inspector: initial research and delivery proposal

- Status: Historical September proposal; initial Library inspectors and provider enrichment now implemented, Chat/catalog discovery still proposed
- Researched: 2026-09-19
- Scope: Click-through behavior, current data availability, and catalog dependency
- Next deliverable: Per-media inspector field summaries and layout specifications

The code inventory and “current” gaps below describe the September 19 research
snapshot. They are retained as history, not the current implementation checklist.
Per-media inspectors, Hardcover details, Reader highlights/selective full text,
TMDB/YouTube catalogs, Spotify backfill, and Music ingestion have since shipped
locally. Use the [Library handoff](library-implementation.md), per-media plans,
and [UI foundation](../design/ui-foundation.md) for current behavior. External
Chat references, arbitrary catalog inspection, and LLM retrieval remain proposals.

## Recommendation

Build the shared inspector on the existing ledger first, then enrich it through
selected providers. Existing integrations and catalogs are complementary:
imports describe the owner's relationship to an item; catalog lookups describe
the item. Hardcover and Spotify can serve both roles through different queries.
There is no need to build or import a comprehensive catalog before item
inspection works.

Use Hardcover for books and Reader for articles. Add TMDB for richer movie
details, YouTube Data API for video metadata, and direct Spotify episode lookup
for export-only podcast items. Evaluate publisher RSS/Podcast Index for portable
podcast metadata after establishing episode matches. Keep additional book,
podcast, and music providers conditional on observed gaps.

This research inspected repository code, the latest local component specimen,
Index Chat/Recaps interactions, source reports, and selected official provider
documentation. It did not read credentials, call authenticated provider APIs,
inspect private exports, or measure current library coverage.

## What the latest mocks establish

The [component specimen](../../apps/web/src/specimen/README.md) is newer than the
seven layout studies. It demonstrates the collapsible Index sidebar, selection,
and a compact inspector with Details and History tabs. The
[Index study](../design/mockups.md) also demonstrates media references inside
Chat and item selection from Recaps. Both use synthetic data; their descriptions,
covers, page counts, ratings, and history are not promises about imported fields.

Keep one shared inspector, as required by the
[UI foundation](../design/ui-foundation.md). Use the newer specimen's Details /
History arrangement as the starting point, with notes/highlights and source
information fitted during the per-media review. No separate full-page media view
is needed for this proposal.

Proposed click behavior:

| Element                                            | Result                                                                                                                    |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Library row, title, or artwork                     | Open the item's inspector without losing filters, selection context, or scroll position.                                  |
| Chat reference or saved artifact's media reference | Open the same inspector while preserving the conversation/artifact.                                                       |
| Recap item                                         | Open the same inspector with the recap period as context.                                                                 |
| Aggregate chart mark or count                      | Reveal its supporting items in the workspace; selecting one opens the inspector. An aggregate is not itself a media item. |
| History occurrence                                 | Reveal that occurrence's available dates, edition, rating/review, and evidence within the inspector.                      |
| Source link                                        | Open the original provider/publisher page.                                                                                |

Creator, series, and show pages are not necessary for the first version. If these
labels become clickable, start with a scoped collection of related items once
reliable identities exist; do not infer a creator identity from a display name.

Opening and closing inspection should preserve Library, conversation, and recap
state. Selection should be URL-addressable, support browser Back, and restore
keyboard focus to its trigger on close. Long descriptions and histories can
scroll or expand within this one inspector. Missing fields should not become
invented text or empty administrative sections.

## What exists versus what still needs fetching

There are three different kinds of gaps:

1. **Stored and normalized, but not exposed.** The common media model includes
   creator, description, links, artwork, publication date, and duration. Archive
   entries hold consumption evidence, dates, ratings, and reviews. Both list and
   detail HTTP responses currently expose only `id`, `type`, and `title`.
2. **Present in retained source evidence, but not projected.** Examples include
   additional Reader document properties and Letterboxd RSS HTML. These need
   source-specific extraction and a queryable projection, not a new catalog.
3. **Not acquired by the production connector.** Examples include Hardcover
   authors/covers/descriptions, Reader's explicitly requested HTML and dedicated
   highlight synchronization, and YouTube public metadata. Raw preservation
   cannot recover fields that were never requested.

The following is a sourcing assessment, not the deferred inspector field spec:

| Media          | Current production evidence                                                                                                                                                                                                         | Smallest useful extension                                                                                                                                      | Catalog conclusion                                                                                                                    |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Books          | Work/edition IDs, title/subtitle, release information, ratings/reviews, supported finished reads, and some edition audio duration. The current GraphQL query does not request authors, covers, descriptions, or page counts.        | Expand Hardcover queries with work and consumed-edition details; validate against the actual schema.                                                           | Reuse Hardcover's catalog capabilities. Open Library/Google Books are optional gap fillers.                                           |
| Movies         | Letterboxd title/year, film/diary identities, watches, personal ratings, and exported reviews. RSS can provide TMDB IDs and HTML containing poster/review data; those images/review bodies are not currently projected.             | Expose personal data; project useful retained RSS fields; add TMDB details by known ID, with a separate matching flow for older export-only films.             | TMDB is the strongest new provider to add. Letterboxd history alone does not provide a complete film profile.                         |
| Articles       | Reader already normalizes author, summary, image, publication date, and source link when supplied. Additional document properties can remain in raw pages.                                                                          | Project useful notes/tags/size properties when present; add highlight synchronization and optional authorized text acquisition separately.                     | No general article catalog needed for imported items. Publisher metadata/feeds help with external references.                         |
| Podcasts       | Spotify export provides episode identity/title/show and playback evidence. Saved-episode sync adds description, artwork, publication date, and duration for the episodes it actually returns. Reader can also supply podcast items. | Look up export-only Spotify episode IDs; preserve Reader and Spotify identities until a reliable match exists.                                                 | Reuse Spotify lookup first for display. Publisher RSS/Podcast Index can provide independent metadata where episode matching succeeds. |
| YouTube videos | Takeout supplies video identity, title/channel where available, and timestamped watch evidence. Description, artwork, publication date, and duration are currently null in this projection.                                         | Add public metadata lookup for known IDs through YouTube Data API.                                                                                             | A new API capability is needed alongside the existing Takeout integration; a separate universal video catalog is unnecessary.         |
| Songs          | Song rows remain in the Spotify raw export, but the importer does not create song Archive items.                                                                                                                                    | Define ingestion/admission behavior before designing an operational song-history inspector. Then evaluate Spotify lookup and MusicBrainz recording identities. | Catalog metadata cannot substitute for missing song ingestion. Keep this last in delivery order.                                      |

Implementation evidence: [HTTP contracts](../../packages/contracts/src/index.ts),
[detail repository](../../packages/db/src/repository.ts),
[Hardcover query](../../packages/connectors/hardcover/src/client.ts),
[Reader normalization](../../packages/connectors/readwise/src/documents.ts),
[Spotify export import](../../apps/api/src/spotify-import.ts),
[Spotify saved-episode sync](../../apps/api/src/spotify-sync.ts), and
[YouTube import](../../apps/api/src/youtube-import.ts).

Official references confirm the relevant capabilities:
[Hardcover books](https://docs.hardcover.app/api/graphql/schemas/books/),
[TMDB details](https://developer.themoviedb.org/reference/movie-details),
[Reader document API](https://readwise.io/reader_api),
[Spotify episode lookup](https://developer.spotify.com/documentation/web-api/reference/get-an-episode),
and [YouTube video lookup](https://developers.google.com/youtube/v3/docs/videos/list).
Additional providers and their limitations are covered in the existing
[catalog research](../sources/catalogs.md); those recommendations are not measured
coverage guarantees.

## Data and API shape

### Imported items

Extend `GET /api/media/{id}` into a validated detail response assembled by a
repository/service, keeping Hono routes thin. Return:

- Common item metadata and typed media-specific details where implemented.
- Source links and external identities, including consumed-edition references.
- Personal history with original date precision/basis and rating scales.
- Notes/highlights when supported, with their own origin and relationship.
- Source/evidence summaries, plus availability and freshness of enrichment.

Keep list responses small but add the card/row fields actually required by the
new UI. Fetch details on selection using the existing React Query setup. Paginate
large history, highlight, and evidence collections without making the inspector
depend on loading the entire collection or decompressing a raw export.

Render local facts immediately. Fetch/cache permitted enrichment independently;
an unavailable provider should leave a useful inspector with source links and
personal history. Handle rapid selection changes without displaying the previous
item's response under the new item's title.

Details should preserve the distinction among item facts, personal facts, and
generated content. Identify the origin of displayed fields and preserve conflicts
rather than silently replacing imported values. Specific metadata needs can gain
typed extension tables/projections; a universal entity graph is not a prerequisite.
Sanitize imported markup and validate outbound URLs.

### Items outside the Library

Use a reference that can identify either a local media ID or a provider resource
by provider, resource type, and ID. Chat and artifacts should carry these resolved
references rather than infer identities from prose titles when clicked.

Look for an exact known local identity first. Otherwise resolve the reference
through a provider adapter and show the same inspector without creating an Archive
or Queue entry. A catalog cache is not Library membership. Do not add this item to
the ingestion schema merely to display it.

The current repository's detail lookup requires an active Archive entry, and
external identities require source-record lineage. Catalog references therefore
need a separate resolver/cache path; simply allowing an arbitrary provider ID in
the existing route would not solve the storage and membership boundaries.

Search results are matching candidates, not accepted identities. Prefer known
IDs; preserve work versus edition, show versus episode, and recording versus
release distinctions. Ambiguous matches remain unresolved or explicitly reviewed.
A title/year match must not silently attach the wrong description and artwork.

### History semantics

Keep one Library item with all supported occurrences. Date filters match any
occurrence; sort/display by the latest matching date while leaving the full
history accessible and marking matching occurrences.

Do not treat Spotify playback segments as separate listens or assume an admitted
episode was finished. Hardcover's declared read count may exceed its detailed
read rows; do not invent dates to reconcile them. Reader's inferred archive-move
date must remain distinguishable from a source-asserted consumption time.
Source-recorded and ingested timestamps belong in the evidence disclosure, not
as substitutes for unknown consumption dates. Superseded/removed observations
should remain available as evidence without inflating active history counts.

## Enrichment retention and Chat

Catalog enrichment needs provider-specific storage rules before implementation.
YouTube public API metadata must be refreshed or deleted within 30 days under
the relevant temporary-storage provision. Spotify permits limited temporary
metadata/art caching and restricts analysis and ingestion of Spotify Content
into AI models. Display permission must not automatically imply permission to
pass the same data to Chat, embeddings, or recap generation.
[YouTube policies](https://developers.google.com/youtube/terms/developer-policies),
[Spotify terms](https://developer.spotify.com/terms),
[Spotify policy](https://developer.spotify.com/policy).

Proposed design: keep refreshable catalog responses separate from immutable
owner-import evidence, with fetched/expiry times, provider attribution, and
explicit permitted uses. Apply expiry to derived copies as well as response
bodies. Preserve only permitted identity/matching provenance after expiry.
Document this storage distinction in a new ADR before introducing it.

The current Spotify saved-episode pipeline already retains exact API pages in
R2. Review that existing retention behavior as part of this work; isolating only
new lookups would leave the older path unresolved. This research does not settle
the treatment of owner-provided exports or authorize deleting existing evidence.

## Full text and transcripts for Chat

Follow-up research on 2026-09-19 distinguishes descriptive catalog metadata from
the underlying work. Add a content-acquisition and retrieval layer alongside the
inspector and proposed Chat service. Having an item in Library does not
mean its content is available to Chat; having text available for display does not
automatically establish every permitted AI use.

### Acquisition paths

- **Articles:** Reader's `withHtmlContent=true` can return document HTML. Our
  production client does not request it today. The earlier private probe found
  non-null HTML for ten sampled documents, not proof of complete coverage.
  Acquire selected documents first, extract readable text, and retain structural
  locators. Handle partial/paywalled captures and PDFs explicitly.
  [Reader API](https://readwise.io/reader_api).
- **Books:** Hardcover supplies catalog and personal-history data, not a
  documented full-book-text endpoint. Use user-provided, authorized EPUB/PDF/text,
  available Reader book content, or public-domain editions. Readwise highlights
  are useful selected evidence but are not the entire book. Google Books exposes
  access/viewability and download information only where available; a catalog
  match is not general full-text access. Preserve edition/translation identity.
  [Hardcover schema](https://docs.hardcover.app/api/graphql/schemas/books/),
  [Google Books access fields](https://developers.google.com/books/docs/v1/reference/volumes),
  [Project Gutenberg formats](https://www.gutenberg.org/help/bibliographic_record.html).
- **Podcasts:** First look for publisher transcripts on episode pages or through
  RSS `podcast:transcript` links. Preserve timestamps/speakers when supplied.
  Taddy offers publisher transcripts and paid generated transcripts, including
  on-demand generation. Its current Pro plan is $75/month with 100 episode
  transcripts; publisher-provided transcripts are accessible on its free plan.
  Evaluate coverage, matching, storage, and inference permissions before adopting
  it. Its policy prohibits certain AI training and requires creator removals;
  that is not a blanket grant for every Chat use. Another option is transcription
  of audio we are authorized to process, with separate cost and error handling.
  [RSS transcript specification](https://podcasting2.org/docs/podcast-namespace/tags/transcript),
  [Taddy transcripts](https://taddy.org/developers/podcast-api/episode-transcripts),
  [pricing](https://taddy.org/developers/pricing),
  [developer policy](https://taddy.org/terms-of-service/developer-policy).
- **YouTube:** Metadata lookup does not unlock arbitrary transcripts. The
  official captions-download API requires permission to edit the video. Reader
  supports timestamped transcripts for saved YouTube videos, making its document
  export a promising existing-source path, but API completeness, timestamps, and
  original-versus-enhanced text still need a targeted probe. Also support
  user-provided or creator-provided transcript files.
  [Caption download permissions](https://developers.google.com/youtube/v3/docs/captions/download),
  [Reader transcript support](https://readwise.io/reader/update-oct2024).
- **Songs:** Our existing integrations do not supply lyrics. Start with
  user-provided text for a selected song; investigate a licensed lyrics source
  such as LyricFind for automatic acquisition. Its lyrics products do not by
  themselves establish permission for our proposed LLM processing. Verify the
  specific storage and AI-use terms before selecting a provider. Spotify Content
  must not be fed to a model through the catalog integration under its current
  policy. [LyricFind](https://www.lyricfind.com/),
  [Spotify policy](https://developer.spotify.com/policy).
- **Movies:** A synopsis is not a screenplay or dialogue transcript. Full-content
  questions need separately sourced, authorized scripts or subtitle files; TMDB
  enrichment alone does not provide this capability.

Reader EPUBs can become supporting content linked to a Hardcover book without
becoming a second Archive item or changing the existing Reader admission rules.
Such linking needs edition evidence or explicit resolution, not title similarity.

### Inspector and retrieval behavior

Show concise availability such as **Full text**, **Transcript**, **Highlights
only**, or **Metadata only**, together with source, language, and partial or
machine-generated status when relevant. An **Ask about this** action passes the
item reference to Chat; the server determines which content is available and
permitted for the selected model provider. Do not claim to have read the work
when only its description or highlights were retrieved.

Store a content record linked to the item and exact manifestation: acquisition
source, content kind, language, coverage, source version/hash, extraction or
transcription version, and retention/usage policy. Keep originals and cleaned or
generated derivatives distinguishable. Use D1 for manifests/locators and private
R2 for bodies where retention is permitted. Indexing and any external embedding
service must obey the same content-use rules as Chat; local processing does not
remove source restrictions.

For a short selected article, supplying the complete text may be simplest. For a
long book or multi-item question, retrieve relevant passages with neighboring
context and cite paragraph, chapter/page, or timestamp locators. Whole-work
summaries require coverage across the work, not a handful of top-ranked chunks.
Keep generated summaries linked to their evidence and separate from source text.
Citations should open the supporting passage in the inspector without requiring
an in-app reader or player.

Begin with Reader articles and highlights, then a small sample of book files and
publisher podcast transcripts. Verify Reader video/EPUB exports separately.
Acquire or transcribe missing content on demand before considering a library-wide
backfill; unavailable content must not block ordinary item inspection or Chat
over the evidence that is present. Treat retrieved text as untrusted evidence,
not instructions to the model or permission to call other tools.

## Proposed delivery sequence

1. **Finish the per-media inventory.** In priority order—Books, Movies, Articles,
   Podcasts, Songs, YouTube—label each proposed inspector field as stored now,
   recoverable from evidence, available through an additional query, or
   unsupported/uncertain. Separate provider descriptions from AI summaries.
2. **Deliver local inspection.** Add the detail contract/repository, necessary
   list fields, shared inspector, URL selection, accessible close/focus behavior,
   and honest empty states. Start with real book history and existing metadata;
   use synthetic examples for missing/long/repeated data. No catalog dependency.
3. **Make Books complete enough to judge the design.** Extend Hardcover metadata
   acquisition and edition presentation. Use this to validate the compact panel
   before specifying every media layout.
4. **Add enrichment in priority order.** Introduce the retention/matching design,
   then TMDB for movies, Reader projection/highlight work, podcast lookups, and
   YouTube metadata. Add providers only where they fill demonstrated gaps.
5. **Support external references.** Wire the provider resolver into Chat/artifact
   references as those services are implemented. Reuse it for known URLs/IDs;
   broad catalog search and recommendation generation can follow independently.
6. **Connect Recap drill-down.** Back aggregates with period-filtered ledger
   queries and return actual supporting items/occurrences. The current charts
   and drill-down lists are illustrative and are not evidence-backed analytics.

Before provider rollout, measure exact-ID coverage, accepted matches, missing
fields/artwork, unavailable items, and ambiguous results on a small authorized
sample. Verify app-specific Spotify access and Hardcover schema behavior then;
public docs alone cannot establish those account capabilities.

Acceptance checks should cover full history under a period filter, unknown and
inferred dates, edition-specific reads, unavailable enrichment, ambiguous matches,
catalog inspection without Library writes, keyboard/Back behavior, and cache
expiry. Future implementation changes require `pnpm check` plus relevant build,
end-to-end, and migration checks. This proposal changes documentation only.
