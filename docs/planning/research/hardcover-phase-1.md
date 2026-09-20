# Hardcover research for Phase 1 Library specification

- Date: 2026-09-19
- Status: Source research; no per-surface Library fields are finalized here
- Scope: Books Archive, Hardcover Want to Read Queue, and inspection inputs
- Privacy: Live observations contain only field names, types, null counts, safe
  aggregates, and hand-authored examples. No personal titles, review/notes text,
  URLs, usernames, source IDs, or token material are included.

## Outcome

Hardcover can supply both the owner's book relationships and a rich book/edition
catalog, but the production connector currently asks for only a narrow Read-shelf
projection. Phase 2 should extend the acquisition contract before treating the
current D1 rows as a complete Books Library.

- Fresh read-only GraphQL calls succeeded against the configured owner account.
  The live schema, exact response shapes, and nullability were probed on
  2026-09-19.
- The live library contained 1,114 `user_books`: 984 Want to Read, 2 Currently
  Reading, and 128 Read. Want to Read is therefore a large production Queue
  input, not an edge case.
- The production sync filters to status `3`. It does not acquire Want to Read,
  authors, covers, descriptions, page counts, series, tags, ownership details,
  reading journals, or consumed/default-edition metadata beyond a few IDs and
  scalars.
- The exact Read-page bytes retained in R2 can recover fields already requested
  by the production query, but cannot recover fields that were never selected in
  GraphQL. The fresh probe was intentionally not retained as owner data.
- Work, current selected edition, per-read consumed edition, and Hardcover's
  four format-specific default editions are separate identities. Phase 2 must
  preserve that distinction.
- `read_count` remains an aggregate claim, not a complete reread ledger. The
  live account had 115 finished child reads, four `read_count = 2` rows, and no
  evidence that each declared reread has its own child row.
- Hardcover now documents scoped, expiring personal access tokens and richer
  rate limits. The older source report's broad annual-token description is no
  longer the complete setup model.

The recommendation is to keep one work-level Library item, attach Queue and
Archive relationships independently, and acquire a deliberate work/edition/
relationship snapshot. Do not select final list, gallery, or inspector fields
until Phase 2 resolves the choices at the end of this report.

## Evidence labels

| Label                    | Meaning                                                                                                     |
| ------------------------ | ----------------------------------------------------------------------------------------------------------- |
| **Live-verified**        | Returned by authenticated, read-only calls on 2026-09-19.                                                   |
| **Documented-only**      | Present in the current official docs/schema but not selected by the live payload queries below.             |
| **Stored/projected**     | Parsed into queryable D1 canonical rows by current production code.                                         |
| **Retained/recoverable** | Selected by the production query and retained in exact R2 pages, but not projected into queryable fields.   |
| **New acquisition**      | Requires an expanded/new GraphQL query and durable ingestion; the one-off probe is not production evidence. |
| **Unresolved**           | The API exposes a field, but its meaning or desired product treatment is not settled.                       |

GraphQL is selection-based. “Available” in the schema does not mean the field is
inside existing raw objects. A browse request must never query or parse private
R2 pages on demand; useful retained fields need replay-safe projections.

## Official surface, authentication, and service limits

### Endpoint and request contract

- Endpoint: `POST https://api.hardcover.app/v1/graphql`.
- Headers: `Authorization: Bearer <token>`, `Content-Type: application/json`,
  and a descriptive `User-Agent`.
- Body: `{ "query": "...", "variables": { ... } }`.
- The API is beta, backend/offline only, and explicitly not for browser token
  use. Query timeout is 30 seconds; search timeout is 2 seconds.
- Current tokens are personal access tokens with selectable scopes and an
  expiration chosen at creation. Tokens made before August 2026 have legacy
  `all`-equivalent access. The configured ignored credential authenticated; its
  value and scope claims were not printed.
- A least-privilege replacement token for this research surface needs the
  documented equivalents of `read:me`, `read:library:private`,
  `read:catalog:data`, and `read:journal:private`. Phase 2 should validate the
  exact scope set when rotating the legacy token.

Current primary references:
[Getting Started](https://docs.hardcover.app/api/getting-started/),
[API actions and scopes](https://docs.hardcover.app/api/graphql/actions/),
[User Books](https://docs.hardcover.app/api/graphql/schemas/userbooks/),
[Books](https://docs.hardcover.app/api/graphql/schemas/books/),
[Editions](https://docs.hardcover.app/api/graphql/schemas/editions/),
[Reading Journals](https://docs.hardcover.app/api/graphql/schemas/readingjournals/),
and the [official schema repository](https://github.com/hardcoverapp/hardcover-docs).

### Live-verified limits and retry behavior

The live responses returned:

```text
RateLimit-Policy: "Free";q=60;w=60;burst=10, "daily";q=5000;w=86400
X-RateLimit-Limit: 10
X-RateLimit-Daily-Limit: 5000
```

The official docs define Free as 5,000 requests/day, burst 10, and 60/minute;
Supporter as 50,000/day, burst 15, and 60/minute. A request may contain at most
five top-level queries or mutations, or one search query. Each top-level
operation consumes quota. Responses advertise `RateLimit-Policy`, `RateLimit`,
legacy `X-RateLimit-*`, and `Retry-After` on `429`.

The repository's existing probe fired pages without pacing and freshly received
`429`. The final probe used one top-level query per request and at least 1.1
seconds between calls; all 11 calls succeeded. Production should read the modern
headers, cap concurrency, honor `Retry-After`, and add jittered retry/backoff.

The docs list `400`, `401`, `403`, `404`, `408`, `429`, `500`, and retryable
`503`. `403` may mean insufficient scope, unsupported operation, top-level
operation excess, or resource access denial; these need distinct safe error
classification.

The docs still describe maximum depth 3 as a 2026 roadmap item rather than a
clearly active invariant. Keep queries shallow anyway: the live queries used no
more than three relationship levels and split work, edition, tag, and journal
lookups.

## Fresh private verification

### Probe safety and coverage

The probe used the ignored `.env.local` token, sent read-only GraphQL queries,
and produced only aggregate counts and recursive path/type/null summaries. It
did not write to Hardcover, print personal scalar values, retain raw responses,
or change repository configuration.

Coverage:

| Payload set                   |   Rows inspected | Purpose                                                                                                               |
| ----------------------------- | ---------------: | --------------------------------------------------------------------------------------------------------------------- |
| Full `user_books` library     |            1,114 | Every selected relationship field plus every scalar on its current work and edition, and all child reads              |
| Deep work relationship sample | 38 diverse works | Contributors, authors, series, mappings, images, tags, and default editions                                           |
| Referenced edition sample     |     124 editions | Current, consumed, and default editions with contributors, mappings, publisher, country, language, format, and images |
| Resolved tag sample           |         100 tags | Tag and tag-category shapes                                                                                           |
| Reading journal page          |         100 rows | Journal scalar, metadata, and tag shapes; this capped page is not proof there are only 100 journals                   |

The deep samples deliberately cover statuses, ratings, reviews, reads, formats,
and ownership signals. Their null counts describe the sample, not the whole
Hardcover catalog. Full-library scalar counts below cover all 1,114 rows.

### Important live aggregates

| Observation                |                                                                                          Live result |
| -------------------------- | ---------------------------------------------------------------------------------------------------: |
| User books by status       |                                                      984 Want to Read; 2 Currently Reading; 128 Read |
| Imported rows              |                                                                                                1,111 |
| Ratings                    |                                                            110 populated; observed numeric range 0–5 |
| Reviews                    | 5 `has_review = true`; 5 non-empty `review`; 5 non-empty `review_raw`; 0 non-empty `review_markdown` |
| Private notes              |                                                                                          0 non-empty |
| Declared read counts       |                                                                             995 zero; 115 one; 4 two |
| Child reads                |                                                         117 total; 115 finished; 4 started; 0 paused |
| Finished precision         |                                                                              3 integer `1`; 114 null |
| Progress                   |                                               3 `progress`; 3 `progress_pages`; 0 `progress_seconds` |
| Work metadata              |                                                            977 pages; 1,049 images; 921 descriptions |
| Current-edition metadata   |                                                956 pages; 1,035 images; 1,057 ISBN-13; 1,030 ISBN-10 |
| Current edition format IDs |                                                 1,056 physical (`1`); 25 audio (`2`); 33 ebook (`4`) |
| Current `physical_format`  |                             null on all 1,114; `edition_format` was much noisier and sometimes blank |
| Ownership                  |                                                        all 1,114 `owned = false`, `owned_copies = 0` |

Observed day strings ranged from 2013-01-01 through 2026-09-12 for finished
reads. `date_added` ranged from 2019-01-16 through 2026-09-12. These aggregates
are private-account observations, not source guarantees.

In the deep work sample, 48 contribution rows included authors plus Afterword,
Cover Artist, Editor, Illustrator, Narrator, and Translator roles; 13 series
links were present. Community tag categories included genre, mood, pace,
content-warning, and generic tag. The first journal page included `list_book`,
`rated`, `reviewed`, `status_want_to_read`, `user_book_read_started`, and
`user_book_read_finished`; this is not an exhaustive event enum.

## Exact live query shapes

All list queries used deterministic `order_by`. The full-library probe used
offset pagination only for reconnaissance; production should keep keyset
pagination for resumability and still run successful full snapshots for removal
detection.

```graphql
query Phase1Me {
  me { id }
}

query Phase1UserBooks($userId: Int!, $limit: Int!, $offset: Int!) {
  user_books(
    where: { user_id: { _eq: $userId } }
    order_by: { id: asc }
    limit: $limit
    offset: $offset
  ) {
    # every user_books scalar listed below
    user_book_status { description id slug status }
    reading_journal_summary { book_id journals_count last_updated_at user_id }
    user_book_reads(order_by: { id: asc }) {
      # every user_book_reads scalar listed below
    }
    book { # every books scalar listed below }
    edition { # every editions scalar listed below }
  }
}
```

The relationship probes used exact IDs captured in memory and never printed:

```graphql
query Phase1BookRelations($ids: [Int!]!) {
  books(where: { id: { _in: $ids } }, order_by: { id: asc }) {
    # all work scalars
    image { # all image scalars }
    images(limit: 10, order_by: { id: asc }) { # all image scalars }
    contributions(order_by: { id: asc }) {
      # all contribution scalars
      author { # all selected author scalars }
      contributor_role { # all role scalars }
      contributor_role_specialization { # all specialization-link scalars }
      contributor_specialization { # all specialization scalars }
    }
    book_series(order_by: { id: asc }) {
      # all link scalars
      series { # all series scalars }
    }
    book_mappings(order_by: { id: asc }) {
      # all mapping scalars
      platform { id name url }
    }
    taggings(limit: 100, order_by: { id: asc }) {
      # all tagging scalars
      tag { count id slug tag tag_category_id }
    }
    default_audio_edition { # all edition scalars }
    default_cover_edition { # all edition scalars }
    default_ebook_edition { # all edition scalars }
    default_physical_edition { # all edition scalars }
    featured_book_series { # link scalars and series scalars }
  }
}

query Phase1EditionRelations($ids: [Int!]!) {
  editions(where: { id: { _in: $ids } }, order_by: { id: asc }) {
    # all edition scalars
    image { # all image scalars }
    images(limit: 10, order_by: { id: asc }) { # all image scalars }
    contributions(order_by: { id: asc }) { # contribution, author, and role shapes }
    book_mappings(order_by: { id: asc }) { # mapping and platform shapes }
    country { # all selected country scalars }
    language { code2 code3 id language }
    publisher { # all selected publisher scalars }
    reading_format { format id }
  }
}

query Phase1Tags($ids: [bigint!]!) {
  tags(where: { id: { _in: $ids } }, order_by: { id: asc }) {
    count id slug tag tag_category_id
    tag_category { category created_at id slug }
  }
}

query Phase1Journals($userId: Int!) {
  reading_journals(
    where: { user_id: { _eq: $userId } }
    order_by: { id: asc }
    limit: 1000
  ) {
    action_at book_id created_at custom edition_id entry event id journal_date
    likes_count metadata object_type privacy_setting_id updated_at user_id
    taggings(limit: 100, order_by: { id: asc }) {
      created_at id spoiler tag_id taggable_id taggable_type user_id
      tag { count id slug tag tag_category_id }
    }
  }
}
```

## Exhaustive live field inventory

Types below are JSON response types, not TypeScript contracts. `null | X` means
both were observed. A schema-non-null JSON/JSONB container can still be `{}` or
`[]`. The inventory includes every field selected by the live queries, including
nested keys discovered inside JSON/JSONB scalars.

### Owner relationship: `user_books`

| Group             | Fields and observed response types                                                                                                                                                                                                                                                                  |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity/lineage  | `id:number`, `user_id:number`, `book_id:number`, `edition_id:number`, `original_book_id:null\|number`, `original_edition_id:null\|number`, `merged_at:null\|string`, `object_type:string`, `imported:boolean`, `mod_status:number`                                                                  |
| Status/time       | `status_id:number`, `read_count:number`, `date_added:string`, `created_at:string`, `updated_at:string`, `first_read_date:null\|string`, `last_read_date:null\|string`, `first_started_reading_date:null\|string`, `reviewed_at:null\|string`                                                        |
| Personal          | `rating:null\|number`, `has_review:boolean`, `review:null\|string`, `review_raw:null\|string`, `review_markdown:null`, `review_slate:object`, `review_has_spoilers:boolean`, `review_length:number`, `review_migrated:boolean`, `private_notes:null`, `starred:boolean`, `sponsored_review:boolean` |
| Ownership/context | `owned:boolean`, `owned_copies:number`, `media_url:null`, `url:null`, `recommended_by:null`, `recommended_for:null`, `referrer_user_id:null`, `privacy_setting_id:number`, `likes_count:number`                                                                                                     |

Full-library null counts worth preserving: `first_read_date` 1,111/1,114 null;
`first_started_reading_date` 1,112 null; `last_read_date` 1,008 null; `rating`
1,004 null; `review` 1,109 null; `merged_at` 1,098 null. `review_raw` was null
only three times but non-empty only five times, so presence is not review
membership. Empty JSON/editor state is common.

Nested status and journal summary fields were all present in this snapshot:

- `user_book_status`: `description:string`, `id:number`, `slug:string`,
  `status:string`.
- `reading_journal_summary`: `book_id:number`, `journals_count:number`,
  `last_updated_at:string`, `user_id:number`.

Observed `review_slate` keys were `document`, `document.object`,
`document.children[]`, each block's `object`, `type`, `data`, and `children[]`,
and text-node `object`, `text`, with occasional `italic`, `spoiler`, `type`,
`data`, and nested `children`. Content values remain private.

### Individual reads: `user_book_reads`

Every returned field:

| Field                              | Observed type/nullability                           |
| ---------------------------------- | --------------------------------------------------- |
| `id`, `user_book_id`, `edition_id` | `number`                                            |
| `started_at`                       | `null \| string` (113/117 null)                     |
| `paused_at`                        | `null` (117/117)                                    |
| `finished_at`                      | `null \| string` (2/117 null)                       |
| `finished_at_precision`            | `null \| number` (114/117 null; value `1` on three) |
| `progress`, `progress_pages`       | `null \| number` (114/117 null)                     |
| `progress_seconds`                 | `null` (117/117)                                    |

All three date fields are GraphQL `date`, so their wire representation is
`YYYY-MM-DD`, not an instant. The schema describes `finished_at_precision` only
as `Int`; neither current docs nor the live response defines numeric meanings.
Do not infer them from the value `1`.

### Work-level `books`

Every scalar/JSON field selected across all 1,114 current works:

- Identity/state: `id:number`, `canonical_id:null`, `parent_book_id:null`,
  `book_category_id:number`, `book_status_id:number`, `state:string`,
  `locked:boolean`, `compilation:boolean`, `is_partial_book:boolean`,
  `curation_status:number`, `import_platform_id:number`,
  `created_by_user_id:null|number`, `created_at:string`, `updated_at:string`.
- Display/catalog: `title:string`, `subtitle:null|string`,
  `description:null|string`, `headline:null|string`, `slug:string`,
  `pages:null|number`, `audio_seconds:null|number`,
  `release_date:null|string`, `release_year:null|number`,
  `literary_type_id:null|number`, `links:array`.
- Artwork/cache: `image_id:null|number`, `header_image_id:null`,
  `cached_image:object`, `cached_header_image:object`,
  `cached_contributors:array`, `cached_featured_series:object`,
  `cached_tags:object`, `cached_similar_book_ids:array`,
  `cached_similar_books_updated_at:null|string`, `alternative_titles:array`.
- Defaults/relations: `default_audio_edition_id:null|number`,
  `default_cover_edition_id:null|number`,
  `default_ebook_edition_id:null|number`,
  `default_physical_edition_id:null|number`,
  `featured_book_series_id:null|number`, `editions_count:number`.
- Community aggregates: `rating:null|number`, `ratings_count:number`,
  `ratings_distribution:array`, `reviews_count:number`, `users_count:number`,
  `users_read_count:number`, `activities_count:number`, `journals_count:number`,
  `lists_count:number`, `prompts_count:number`.

Important full-library null counts: `description` 193/1,114, `pages` 137,
`image_id` 65, `release_date` and `release_year` 70, `rating` 78,
`subtitle` 384, and `headline` 993. Work canonical IDs were all null in this
snapshot; that is not permission to discard the field.

Observed nested JSON shapes:

- `cached_image`: `id`, `url`, `width`, `height`, `color`, `color_name`.
- `cached_contributors[]`: `author { id, name, slug, image { id, url, width,
height, color, color_name } }`, `contribution`, and conditional
  `contributor_role_id/name/blurb`, `contributor_specialization_id/name/blurb`,
  `primary`.
- `cached_featured_series`: `id`, `featured`, `position`, `details`,
  `collection`, `unreleased`, `series { id, name, slug, books_count,
primary_books_count }`.
- `cached_tags` keys observed: `Content Warning`, `Genre`, `Group`, `Mood`, and
  `Tag`. Entries use `category`, `categorySlug`, `tag`, `tagSlug`, `count`, and
  `spoilerRatio`; a small number used legacy `spoiler_ratio`.
- `links[]`: `title`, `url`, `type { key }`.
- `ratings_distribution[]`: `rating`, `count`.
- `cached_similar_book_ids[]`: numbers. This is recommendation/catalog cache,
  not personal history.

### Current and referenced `editions`

Every scalar/JSON field selected on all 1,114 current editions and the 124-row
current/consumed/default deep sample:

- Identity/state: `id:number`, `book_id:number`, `canonical_id:null|number`,
  `original_book_id:null|number`, `object_type:string`, `state:string`,
  `locked:boolean`, `compilation:boolean`, `curation_status:number`,
  `score:number`, `source:null|string`, `created_by_user_id:null|number`,
  `created_at:string`, `updated_at:string`, `normalized_at:null|string`.
- Bibliographic/display: `title:string`, `subtitle:null|string`,
  `alternative_titles:array`, `edition_information:null|string`,
  `edition_format:null|string`, `physical_format:null`,
  `physical_information:null`, `pages:null|number`, `audio_seconds:null|number`,
  `release_date:null|string`, `release_year:null`, `rating:null`.
- Identifiers: `isbn_10:null|string`, `isbn_10_valid:null|boolean`,
  `isbn_13:null|string`, `isbn_13_valid:null|boolean`,
  `isbns_match:null|boolean`, `asin:null|string`.
- Relations: `reading_format_id:number`, `publisher_id:null|number`,
  `language_id:null|number`, `country_id:null|number`, `image_id:null|number`.
- Cache/aggregates: `cached_contributors:array`, `cached_image:object`,
  `cached_tags:object`, `lists_count:number`, `users_count:number`,
  `users_read_count:number`.

`edition_format` contained inconsistent capitalization, trailing whitespace,
blank strings, provider names, and format names; 327 rows were null.
`reading_format_id` was complete and is the better coarse format identity.
`physical_format` and `physical_information` were null throughout the full
current-edition snapshot. Edition `release_year`, `subtitle`, and `rating` were
also null throughout, even when related fields existed elsewhere.

Nested edition relations returned:

- `reading_format`: `id:number`, `format:string`.
- `language`: `id:number`, `language:string`, `code2:string`, `code3:string`.
- `country`: `id:number`, `name`, `code2`, `code3`, `iso_3166`, `phone_code`,
  `region`, `region_code`, `sub_region`, `sub_region_code`,
  `intermediate_region`, `intermediate_region_code`, `created_at`, `updated_at`
  (all strings in the observed non-null objects).
- `publisher`: `id:number`, `name:string`, `slug:string`, `object_type:string`,
  `state:string`, `locked:boolean`, `canonical_id:null|number`,
  `parent_id:null|number`, `user_id:null|number`, `editions_count:number`,
  `created_at:string`, `updated_at:string`.
- `image` and `images[]`: `id`, `imageable_id`, `width`, `height`, `ratio`
  numbers; `url`, `color`, `imageable_type` strings; `colors:string[]`.

Edition `cached_image` and `cached_contributors` used the same nested keys as
the work caches. `cached_tags` was an object but empty in this owner snapshot.

### Contributors and authors

Every selected `contributions` field: `id:number`, `author_id:number`,
`contributable_id:number`, `contributable_type:string`, `contribution:string`,
`contributor_role_id:null|number`, `contributor_specialization_id:null`,
`created_at:string`, `updated_at:string`, plus the following relationships.

- `author`: `id`, `alias_id`, `canonical_id`, `user_id`, `gender_id`,
  `image_id`, `born_year`, `death_year`, `books_count`, `users_count` as
  numbers/null; `name`, `name_personal`, `title`, `slug`, `bio`, `location`,
  `born_date`, `death_date`, `object_type`, `state`, `updated_at` as
  strings/null; `locked:boolean`; `is_bipoc` and `is_lgbtq` boolean/null;
  `alternate_names:array`, `cached_image:object`, `identifiers:object`,
  `links:array`.
- `contributor_role`: `id:number`, `contributor_role_category_id:number`,
  `important:number`, `name:string`, `slug:string`, `primary:boolean`, with
  `blurb:null` and `description:null` in the sample.
- `contributor_role_specialization`: selected fields `id`,
  `contributor_role_id`, `contributor_specialization_id`, `description`,
  `blurb`, `primary`; the relationship was null throughout the sample.
- `contributor_specialization`: selected fields `id`, `name`, `description`,
  `blurb`; the relationship was null throughout the sample.

Observed author JSON keys were exhaustive for the returned samples:
`cached_image { id, url, width, height, color, color_name }`;
`identifiers { audible[], goodreads[], openlibrary[], isni[], viaf[],
wikidata[] }` (the last three appeared only in the larger edition sample); and
`links[] { title, url, type { key } }`.

Contributor roles can differ at work and edition level. Authors should not
silently absorb narrator, translator, editor, illustrator, or cover-artist
credits.

### Series

Every selected `book_series` field: `id:number`, `book_id:number`,
`series_id:number`, `position:number`, `compilation:boolean`,
`featured:boolean`, `details:string`, `created_at:string`, `updated_at:string`.

Every selected nested `series` field: `id:number`, `author_id:null|number`,
`canonical_id:null`, `user_id:null`, `books_count:number`,
`primary_books_count:number`, `name:string`, `slug:string`,
`description:null|string`, `object_type:string`, `state:string`,
`identifiers:object`, `is_completed:null|boolean`, `locked:boolean`.

The only nested series identifier key observed was `goodreads:string[]`.

`featured_book_series` returned the same link and series fields. A work can
have multiple series links and floating-point positions; a single “series”
string would be lossy.

### Mappings, tags, and community metadata

Every selected `book_mappings` field: `id`, `book_id`, `platform_id`,
`edition_id`, `external_data_id`, `original_book_id`, `attempts` as
numbers/null; `external_id:string`, `state:string`, `created_at:string`,
`updated_at:string`, `loaded_at:null|string`, `normalized_at:null|string`,
`verified_at:null|string`, `loaded:null|boolean`, `verified:null|boolean`.
Nested `platform` returned `id:number`, `name:string`, `url:null|string`.

Every selected `taggings` field: `id`, `tag_id`, `taggable_id`, `user_id` as
numbers; `taggable_type:string`, `created_at:string`, `spoiler:boolean`.
Nested `tag` returned `id:number`, `tag:string`, `slug:string`, `count:number`,
`tag_category_id:number`. Resolved `tag_category` returned `id:number`,
`category:string`, `slug:string`, `created_at:string`.

The work relationship sample returned thousands of mappings and taggings. These
are catalog/community rows, not automatically the owner's external identities
or personal tags. Prefer verified mapping types and cached aggregate categories;
do not expose raw platform/debug state or user IDs as book metadata.

### Reading journals

Every selected journal field: `id:number`, `user_id:number`, `book_id:number`,
`edition_id:number`, `action_at:string`, `created_at:string`,
`updated_at:string`, `event:string`, `object_type:string`,
`privacy_setting_id:number`, `likes_count:number`, `entry:null`,
`journal_date:null`, `custom:null`, `metadata:object`, `taggings:array`.

Observed `metadata` keys across the 100-row page were `finished_at`,
`started_at`, `user_book_read_id`, `rating`, `review`, `review_raw`,
`review_slate`, `list_id`, `list_name`, `slug`, and `username`.
`review_slate` used the editor tree described above. Journal taggings used the
same tagging/tag fields; none were present on this page.

Journal `action_at` is an instant with offset, while `journal_date`, read dates,
and library dates are GraphQL dates. Journals are activity/evidence and may be
useful for provenance or a future activity section, but they are not a safer
replacement for current status or child-read rows.

### Documented-only fields not selected

The live schema also exposes relationships such as likes/followers/users,
privacy-setting objects, list memberships, prompt answers/summaries, parent and
canonical objects, full edition collections, and aggregate objects. They were
not queried because they are not required to establish Books Archive/Queue or
the metadata questions in this phase. Their existence should not create UI
sections by default.

## Hand-sanitized representative response shape

This is authored from the observed shape; it is not copied from a real record.

```json
{
  "data": {
    "user_books": [
      {
        "id": 1001,
        "book_id": 2001,
        "edition_id": 3001,
        "status_id": 3,
        "date_added": "2024-01-01",
        "rating": 4.5,
        "read_count": 2,
        "owned": false,
        "user_book_status": {
          "id": 3,
          "slug": "read",
          "status": "Read"
        },
        "book": {
          "id": 2001,
          "title": "Synthetic title",
          "description": "Synthetic description",
          "pages": 320,
          "cached_image": {
            "id": 9001,
            "url": "https://example.invalid/cover.jpg",
            "width": 400,
            "height": 600,
            "color": "#334455",
            "color_name": "synthetic"
          },
          "cached_contributors": [
            {
              "author": {
                "id": 4001,
                "name": "Synthetic Author",
                "slug": "synthetic-author",
                "image": {}
              },
              "contribution": null
            }
          ],
          "default_physical_edition_id": 3001,
          "default_ebook_edition_id": 3002,
          "default_audio_edition_id": 3003,
          "rating": 4.1,
          "ratings_count": 42,
          "users_read_count": 25
        },
        "edition": {
          "id": 3001,
          "reading_format_id": 1,
          "reading_format": { "id": 1, "format": "Physical Book" },
          "isbn_13": "9780000000000",
          "pages": 320,
          "publisher": { "id": 5001, "name": "Synthetic Press" }
        },
        "user_book_reads": [
          {
            "id": 6001,
            "edition_id": 3001,
            "started_at": null,
            "finished_at": "2024-02-03",
            "finished_at_precision": null,
            "progress": null,
            "progress_pages": null,
            "progress_seconds": null
          }
        ]
      }
    ]
  }
}
```

## Current implementation and acquisition gap matrix

The production query in `packages/connectors/hardcover/src/client.ts` selects
only Read rows (`status_id = 3`) in ascending user-book ID order. The parser and
`apps/api/src/hardcover-sync.ts` currently handle:

- user-book ID, work ID, current edition ID, status, `read_count`, rating,
  review, and `updated_at`;
- work ID/canonical ID, title/subtitle, release date/year;
- current-edition canonical ID, ISBN-10, ISBN-13, ASIN, audio duration; and
- child-read ID, edition ID, finished date, and finished precision.

| Capability                                | Current state                                             | Classification           | Production consequence                                                             |
| ----------------------------------------- | --------------------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------- |
| Work item identity                        | Hardcover book/canonical IDs become work identities       | **Stored/projected**     | Correct work-level browse base                                                     |
| Current/consumed edition identities       | Current plus child-read edition IDs become identities     | **Stored/projected**     | IDs exist, but detailed consumed editions are not acquired                         |
| ISBN/ASIN                                 | Current edition only                                      | **Stored/projected**     | Cannot assume child-read/default editions share them                               |
| Title/subtitle/publication/audio duration | Projected to common media fields                          | **Stored/projected**     | Existing API still exposes only ID/type/title                                      |
| Personal rating/review                    | Projected to every supported occurrence                   | **Stored/projected**     | Current relationship-level fact is duplicated onto occurrences                     |
| Finished reads                            | Separate active occurrences; undated fallback when absent | **Stored/projected**     | Superseded fallback is retained as removed evidence                                |
| `read_count`, status, finished precision  | Present in exact production raw page                      | **Retained/recoverable** | Needs a queryable source-owned projection for honest discrepancy/precision display |
| Authors/contributor roles                 | Not selected by production                                | **New acquisition**      | `primaryCreatorName` remains null                                                  |
| Covers/descriptions/pages/community stats | Not selected by production                                | **New acquisition**      | Current book cards cannot use them                                                 |
| Series and tags/genres                    | Not selected by production                                | **New acquisition**      | No series/category filtering or sections yet                                       |
| Want to Read                              | Filtered out before acquisition                           | **New acquisition**      | Books Queue is absent                                                              |
| Ownership/progress/journals               | Mostly not selected; child progress omitted               | **New acquisition**      | Cannot build these sections from retained pages                                    |
| Current edition detail                    | Narrow scalars only                                       | **Partly retained**      | Format/publisher/language/country/artwork need new query                           |
| Child-read consumed edition detail        | Only ID retained                                          | **New acquisition**      | Must batch fetch referenced editions                                               |
| Default editions                          | Not selected                                              | **New acquisition**      | Defaults cannot currently provide cover/format fallback                            |
| Mappings                                  | Not selected                                              | **New acquisition**      | Do not infer cross-catalog IDs from titles                                         |

Current canonical projection deliberately leaves `primaryCreatorName`,
`description`, `canonicalUrl`, and `imageUrl` null and only sets duration for a
current edition with `audio_seconds`. The current HTTP media list/detail
contracts expose only `id`, `type`, and `title`, so even existing canonical
subtitle/date/rating/history facts are not available to the production Library.

## Decision-ready options for Books

These are inputs to Phase 2, not selected list/gallery or inspector fields.

### 1. Work versus edition identity

| Option                                | Tradeoff                                                                                                                                           |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| One Library item per Hardcover work   | Matches the accepted ledger and avoids duplicate covers for physical/ebook/audio manifestations; requires edition-aware history/details.           |
| One item per edition                  | Makes format/publisher/ISBN concrete but fragments one book's relationship and rereads. It conflicts with the accepted work-level canonical model. |
| Work rows with an edition mode/filter | Preserves identity but adds substantial interaction complexity before a demonstrated need.                                                         |

**Recommendation:** keep one work-level item. Preserve every work and edition
identity, and attach the consumed edition to each occurrence. Phase 2 should not
reopen this accepted model unless a concrete browse requirement cannot fit it.

### 2. Current, consumed, cover, and format-default editions

Hardcover exposes four different concepts:

- `user_books.edition_id`: the owner's current selected edition;
- `user_book_reads.edition_id`: the edition attached to one read;
- `default_cover_edition_id`: Hardcover's cover default; and
- physical, ebook, and audio default edition IDs.

| Policy                                   | Tradeoff                                                                                                       |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Always show current selected edition     | Personal and simple, but can misdescribe an older consumed edition and Queue records with weak selection data. |
| Always show default cover/format edition | Better catalog completeness, but silently replaces the owner's manifestation.                                  |
| Role-aware edition resolution            | Accurate but requires explicit acquisition/storage and fallback rules.                                         |

**Recommendation:** use role-aware resolution. A read occurrence uses its child
edition when present. Relationship details use the current edition. Work-level
artwork may fall back to the cover default. Format-specific defaults are catalog
fallbacks, never claims about what was consumed. Show “edition unknown” rather
than borrowing a default into history.

### 3. Archive, current status, and Want to Read

| Option                                  | Tradeoff                                                                                                                   |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Queue is exactly current status `1`     | Matches the owner's explicit rule and the source's current-state model. A successful full snapshot can establish removals. |
| Treat Currently Reading/Paused as Queue | Broadens future intent but contradicts the specified Queue rule and conflates active/abandoned state.                      |
| Archive automatically removes Queue     | Produces tidy tabs but destroys legitimate reread intent when a read work is queued again.                                 |

**Recommendation:** acquire all owner `user_books`, project Queue membership
only for status `1`, and keep Queue independent from Archive. Statuses `2`, `4`,
`5`, and `6` remain source facts. Retire absent/changed Queue membership only
after a complete successful owner snapshot. `date_added` is “Added to
Hardcover,” not necessarily the time the current Want to Read state began.

Phase 2 must decide Queue ordering and whether to display that source-added date;
do not relabel it “queued on.”

### 4. Rereads, declared count, and child reads

| Option                                                   | Tradeoff                                                                                               |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Only child rows become occurrences                       | Evidence-safe and already accepted; understates declared rereads when imports only carry `read_count`. |
| Manufacture missing occurrences from `read_count`        | Makes counts match but invents dates, editions, and occurrence identities.                             |
| Show supported history plus a declared-count discrepancy | Honest and useful, but needs clear language and a source-owned count projection.                       |

**Recommendation:** retain the existing occurrence rule. Show only finished
child rows as distinct dated reads; use one undated fallback for Read status
without a finished child. Preserve `read_count` separately and, when it exceeds
supported occurrences, state “Hardcover reports N reads; M have individual
records.” Never create synthetic child rows.

### 5. Ratings and reviews

`user_books.rating` and review fields describe the current owner/work
relationship, not a specific reread. Book and edition ratings are community
aggregates.

**Recommendation:** preserve the source 0–5 scale, distinguish personal and
community labels, and treat `has_review` plus non-empty normalized review text as
the review signal. Do not interpret a non-null empty `review_raw` or editor
document as content. Phase 2 must choose whether personal rating/review appears
once at item level, alongside history, or repeated visually per occurrence; the
storage model should keep it relationship-level even if the current canonical
entry projection duplicates it.

### 6. Dates and precision

| Source field                              | Semantics                                                           |
| ----------------------------------------- | ------------------------------------------------------------------- |
| `finished_at`, `started_at`, `paused_at`  | Date-only child-read facts; no timezone                             |
| `date_added`                              | Library relationship date, not consumption                          |
| `first_read_date`, `last_read_date`       | Aggregate current fields; sparse and not substitutes for child rows |
| `created_at`, `updated_at`, `reviewed_at` | Record/review timing, not consumption                               |
| journal `action_at`                       | Offset timestamp for an activity observation                        |
| `finished_at_precision`                   | Integer/null with undocumented numeric meaning                      |

**Recommendation:** retain the accepted day-precision child occurrence and
unknown fallback behavior, but store the raw precision integer separately and
do not assign semantics to `1` until Hardcover documents it or a controlled UI
probe establishes it. Never substitute date-added, updated, reviewed, journal,
or ingestion time for missing consumption time.

### 7. Contributors

**Recommendation:** acquire structured work and edition contributions. Use
work-level primary author(s) for browse identity; preserve role and exact author
identity. Keep edition-specific narrator, translator, illustrator, editor, and
other credits attached to that edition. Phase 2 must decide whether multiple
primary authors are displayed inline, truncated, or moved to details; it should
not flatten roles into a comma-separated author fact in storage.

### 8. Series

**Recommendation:** preserve every `book_series` link, series identity,
floating-point position, compilation/featured flags, and details. Prefer
`featured_book_series` only as a display hint. Phase 2 must decide whether Books
needs a series filter/grouping or only an inspector section. Do not force a
single series or assume positions are integers.

### 9. Genres, moods, tags, and content warnings

`cached_tags` is a convenient catalog aggregate; raw `taggings` are voluminous
community/user rows. Neither should be described as the owner's tags without
owner-specific evidence.

**Recommendation:** start from normalized cached categories with source and
community labeling. Preserve genre, mood, pace, content-warning, group, and
generic tag distinctions. Avoid ingesting every tagging row into the canonical
ledger unless a concrete query needs voting/spoiler/user detail. Phase 2 must
decide which categories support filters and which, if any, belong in details.

### 10. Ownership, format, progress, and journals

- Ownership exists but was uniformly false/zero in the live library. Do not
  reserve prominent UI for it without useful owner data.
- Prefer `reading_format_id`/object for coarse physical/audio/ebook format.
  Treat `edition_format` as unnormalized display evidence and do not depend on
  `physical_format`, which was entirely null.
- Progress is sparse and belongs to the current reading relationship, not
  Archive completion. It should not become a universal canonical event.
- Journals provide provenance/activity, including rating/review/status/read
  changes, but may duplicate current facts and include private content.

**Recommendation:** acquire ownership and progress as source-owned optional
facts without adding list controls yet. Defer journal text/timeline UI until the
owner explicitly wants it; if acquired, keep it private, paginated, sanitized,
and separate from canonical occurrences. A journals query also consumes a
separate `read:journal:private` scope.

### 11. Community statistics

Work-level rating/counts, ratings distribution, users/readers, list/prompt/
journal/activity counts, and edition user counts are available. They are mutable
catalog/community facts and can overwhelm personal history.

**Recommendation:** acquire only the small set selected after Phase 2 design,
label community rating distinctly, and store acquisition time. Do not preserve
all mutable counters in immutable source-history tables merely because they
exist. Phase 2 must decide whether any belong in collection rows, filters,
details, or nowhere initially.

### 12. Missing values and fallback policy

**Recommendation:** absence suppresses a field or produces a deliberate neutral
placeholder only where layout requires it. Never substitute work pages for an
edition without labeling the level; never use default-edition metadata as the
consumed edition; never turn blank format strings into “Unknown format” stored
facts; never promote imported/source/ingested dates into consumption dates.

Artwork fallback order should be decided explicitly among current edition,
work, default cover edition, and a local neutral placeholder. The source and
role of the chosen image should remain traceable.

## Possible Books-specific sections, not a selected layout

Phase 2 may evaluate these within the one compact inspector; this report does
not approve all of them:

- Work overview: title/subtitle, contributors, description, original release,
  work artwork, page/audio summary.
- Your relationship: Archive/Queue/current status, personal rating/review,
  source-added date, ownership, current selected edition.
- Reading history: supported child reads, date precision, consumed edition,
  declared-count discrepancy, and undated fallback.
- Edition: format, ISBN/ASIN, publisher, language/country, pages/duration,
  release date, edition cover, edition contributors.
- Series: all series links and positions.
- Categories: selected community genres/moods/pace/content warnings with clear
  source labeling.
- Community: Hardcover rating/distribution and selected counts, if useful.
- Source/evidence: Hardcover link, identity roles, freshness, and provenance.
- Reading activity/journal: optional future section, not foundational.

The collection row/gallery and inspector do not need identical fields. A field
being available is not a reason to display it.

## Questions Phase 2 must resolve

1. Which smallest fields distinguish Books in list and gallery without turning
   community metadata into personal facts?
2. Which edition supplies collection artwork, and what labeled fallback order
   applies when current, consumed, work, and default-cover images differ?
3. Does a filtered Archive row show the latest matching occurrence's consumed
   edition, the current selected edition, or only work metadata?
4. How should the UI phrase `read_count` discrepancies and undated Read-status
   fallbacks?
5. Where does the one current personal rating/review appear relative to multiple
   reads?
6. Which contributor roles appear in compact browse, and how are multiple
   authors represented?
7. Are series and any tag categories filters, details only, or deferred?
8. Is community rating useful enough to show, and how is it visually distinct
   from the owner's rating?
9. What is the default Queue sort when `date_added` is not the current status
   transition time?
10. Are ownership/progress useful in this owner's data, or should they remain
    retained source facts?
11. Does Phase 2 want journal/activity inspection, or should acquisition remain
    deferred to avoid scope and privacy cost?
12. Which mutable catalog fields need refresh cadence/freshness indicators, and
    which can remain snapshot metadata?

## Recommended implementation order after field choices

1. Rotate to a least-privilege scoped PAT when practical; expose expiration and
   missing-scope failures in connection health.
2. Replace the Read-only acquisition with a complete owner-library snapshot
   that includes Want to Read and selected relationship/work/current-edition
   fields. Preserve exact response bytes before parsing.
3. Add source-owned relationship metadata and Queue membership separately from
   Archive; reconcile removals only after a successful complete snapshot.
4. Batch-fetch consumed and chosen default editions by exact ID. Preserve each
   role and do not title-match.
5. Add typed contributor/series/category projections only for Phase 2's chosen
   queries. Keep domain/platform boundaries intact.
6. Extend validated list/detail contracts and server-side search/filter/sort.
   Details should paginate occurrences and any journal activity.
7. Add sanitized fixtures for missing covers, sparse dates, multiple authors,
   role-specific contributors, multiple series, Want-to-Read/Archive overlap,
   `read_count` mismatch, and changed/removed membership.
8. Rerun `pnpm check`, migration validation, and browser coverage after the
   final implementation changes.

## Confidence and remaining upstream unknowns

Confidence is high for current field availability, JSON shapes, owner-library
coverage, auth, and rate headers because they were live-verified. Confidence is
medium for long-term stability because the API is beta and its schema/docs are
actively changing.

Still unresolved upstream:

- numeric meanings of `finished_at_precision`;
- whether every child-read/rating/review/edition change updates
  `user_books.updated_at`;
- whether read or journal edits replace/delete rows without a tombstone;
- whether the API will enforce the documented roadmap depth restriction;
- authoritative deletion/change feeds or webhooks (none were found); and
- whether the current scoped-PAT permissions remain stable across nested
  relationship queries.

These unknowns do not block Phase 2's field decisions. They do require full,
idempotent snapshots, raw retention, conservative refresh, and honest coverage
language.
